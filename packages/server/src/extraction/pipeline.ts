import { prisma } from '../prisma';
import { config } from '../config';
import { ExamKind, type ItemFlag } from '@prisma/client';
import { readPdf, classifyKind, looksLikeMedical } from './pdfutil';
import { classifyDoc } from './docPatterns';
import { extractLabPanel, extractImaging } from './claude';
import { imageToText } from './imageToText';
import { canonicalName, reconcileScaleFlag, parseNumeric, normalizeUnit, sanitizeUnitInText } from '../utils/normalize';
import { toCanonicalUnit } from '../utils/units';
import { readExamFile, mediaTypeFromRef } from '../utils/storage';
import type { LabExtraction, ExtractionItem } from './schemas';
import { chargeCredits, CREDIT_COSTS } from '../utils/credits';
import { cpfFingerprint, maskCpf, maskStoredCpf, normalizeCpf } from '../utils/cpf';

interface ItemRow {
  panel: string | null;
  name: string;
  nameCanonical: string;
  valueNumeric: number | null;
  valueText: string | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  refText: string | null;
  refAppliesTo: string | null;
  flag: ItemFlag;
  isAbnormal: boolean;
  extractedPage: number;
  rawRow: any;
}

// Coluna de referência por gênero do paciente (default Homens se não informado).

/**
 * Orquestra a extração de um exame: classifica o tipo -> chama o Claude por VISÃO ->
 * normaliza os nomes canônicos -> calcula as flags -> persiste itens + JSON bruto.
 * Idempotente: pode ser re-rodado (reextract).
 */
// Extração PARALELA (vários exames ao mesmo tempo) + 3 tentativas + erro amigável (sem stack pro usuário).
export async function runExtraction(examId: string): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await runExtractionOnce(examId);
      return;
    } catch (e: any) {
      console.warn(`[extraction] ${examId} tentativa ${attempt}/3 falhou:`, e?.message);
      if (attempt >= 3) {
        try {
          await prisma.exam.update({ where: { id: examId }, data: { status: 'FAILED', extractionError: 'Não conseguimos ler este exame agora. Toque em "Re-extrair" para tentar de novo.' } });
        } catch { /* */ }
        return; // não propaga erro cru
      }
      await new Promise((r) => setTimeout(r, 2500 * attempt));
    }
  }
}

async function runExtractionOnce(examId: string): Promise<void> {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) return;
  const patient = await prisma.patient.findUnique({ where: { id: exam.patientId }, select: { fullName: true, ownerId: true, gender: true, cpfHash: true, cpfLast4: true, cpfEncrypted: true, cpfIv: true } });
  const demo = patient?.gender === 'female' ? 'Mulheres' : 'Homens';

  await prisma.exam.update({
    where: { id: examId },
    data: { status: 'EXTRACTING', extractionError: null },
  });

  try {
    const buffer = await readExamFile(exam.filePath);
    const media = mediaTypeFromRef(exam.filePath);
    // Pre-check (texto pra classificar): PDF → pdftotext; IMAGEM → tesseract (OCR).
    // Antes chamava readPdf em tudo → imagem virava texto vazio → "Documento vazio".
    let pageCount = 1;
    let text = '';
    if (media === 'application/pdf') {
      const r = await readPdf(buffer);
      pageCount = r.pageCount; text = r.text;
    } else {
      try { text = await imageToText(buffer); } catch (e) { console.warn('[extraction] OCR no pre-check falhou:', (e as Error).message); }
    }
    const kind: ExamKind = exam.kind !== 'OTHER' ? exam.kind : classifyKind(text);

    // RAG de padrões: rejeita cedo (msg específica) documentos que claramente NÃO são
    // exame (receita, nota fiscal, RG, rótulo...) — antes de gastar IA.
    const cls = classifyDoc(text);
    if (!cls.accept && cls.strong) {
      await prisma.exam.update({ where: { id: examId }, data: { status: 'FAILED', extractionError: cls.reason } });
      console.log(`[extraction] ${examId} rejeitado (padrão): ${cls.reason}`);
      return;
    }

    let title = exam.title;
    let performedAt = exam.performedAt;
    let sourceLab = exam.sourceLab;
    let items: ItemRow[] = [];
    let raw: any = exam.rawExtraction;

    const dryRun = config.extractionDryRun;

    if (!dryRun || !raw) {
      // Reusa o texto do pre-check (PDF: pdftotext via readPdf; imagem: OCR) na chamada da IA —
      // evita rodar pdftotext/OCR 2x. readPdf() chama pdfToText() internamente → texto idêntico, reuso seguro.
      const precomputedText = text;
      if (kind === 'IMAGING') {
        const ext = await extractImaging(buffer, media, precomputedText);
        raw = ext;
        title = ext.examTitle ?? title;
        performedAt = parseDate(ext.performedAt) ?? performedAt;
        sourceLab = ext.sourceLab ?? sourceLab;
      } else {
        const lab = (await extractLabPanel(buffer, media, precomputedText)) as LabExtraction;
        raw = lab;
        title = lab.examTitle ?? title;
        performedAt = parseDate(lab.performedAt) ?? performedAt;
        sourceLab = lab.sourceLab ?? sourceLab;
        items = flattenLabItems(lab, demo);
      }
    } else if (dryRun && raw && Array.isArray(raw.panels)) {
      // replay: apenas re-normaliza a partir do JSON guardado
      items = flattenLabItems(raw as LabExtraction, demo);
    }

    // trava anti-alucinação (apenas painel lab): compara itens extraídos vs. densidade de valores no texto
    const reviewRequired = kind !== 'IMAGING' ? sanityCheckItems(text, items) : false;

    // identidade: CPF do documento é sinal forte; sem CPF confiável, cai no match por nome.
    if (raw && patient?.cpfHash) {
      raw.identityMatch = computeIdentityMatch(raw, patient);
    }

    // bloqueio suave anti-fraude: compara o nome do paciente no documento vs. perfil
    if (raw && patient?.fullName && raw.patientName) {
      raw.nameMatch = computeNameMatch(String(raw.patientName), patient.fullName);
    }

    // descarta documento que NÃO parece exame/laudo médico (sem itens e sem sinais médicos) — msg do KB
    if (kind !== 'IMAGING' && items.length === 0 && !looksLikeMedical(text)) {
      await prisma.exam.update({
        where: { id: examId },
        data: { status: 'FAILED', extractionError: cls.reason || 'Não conseguimos identificar um exame neste documento. Tente o Escanear ou envie um PDF do seu exame.' },
      });
      console.log(`[extraction] exame ${examId} descartado: não parece exame/laudo médico`);
      return;
    }

    if (items.length) {
      await prisma.examItem.deleteMany({ where: { examId } });
      await prisma.examItem.createMany({
        data: items.map((r) => ({ ...r, examId })),
      });
    }

    await prisma.exam.update({
      where: { id: examId },
      data: {
        kind,
        title,
        performedAt,
        sourceLab,
        pageCount: pageCount || exam.pageCount,
        rawExtraction: raw,
        reviewRequired,
        status: 'EXTRACTED',
        extractedAt: new Date(),
      },
    });
    console.log(`[extraction] exame ${examId} extraído: ${items.length} itens (kind=${kind}, review=${reviewRequired})`);
    // Extração por visão consome créditos (não bloqueia a ingestão mesmo sem saldo)
    if (patient?.ownerId) { try { await chargeCredits(patient.ownerId, CREDIT_COSTS.extraction); } catch { /* não bloqueia */ } }
  } catch (e: any) {
    console.error(`[extraction] exame ${examId} falhou (tentativa):`, e?.message);
    throw e; // runExtraction cuida do retry + do FAILED amigável
  }
}

/** Colapsa itens DUPLICADOS dentro do MESMO documento (mesmo nameCanonical + valor + unidade).
 *  A IA às vezes extrai o mesmo analito 2x no mesmo PDF (tabela-resumo + tabela-detalhe, ou
 *  duplicação do OCR/reprocessamento). Diferente do collapseAdjacentNearDupes (cross-exame, série
 *  temporal), este é INTRA-documento — roda no parse, antes de persistir ExamItem. Conservador:
 *  só colapsa itens idênticos (canônico + valor + unidade); medições realmente distintas ficam. */
export function dedupeIntraDoc<T extends { nameCanonical: string | null; name: string; valueNumeric: number | null; valueText: string | null; unit: string | null }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const key = `${r.nameCanonical ?? ''}|${r.valueNumeric ?? ''}|${r.valueText ?? ''}|${r.unit ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function flattenLabItems(lab: LabExtraction, prefers: string): ItemRow[] {
  const rows: ItemRow[] = [];
  for (const panel of lab.panels ?? []) {
    for (const it of (panel.items ?? []) as ExtractionItem[]) {
      const valueNumeric = it.valueNumeric ?? parseNumeric(it.valueText);
      const ref = pickReference(it.references ?? [], prefers);
      const refText = ref
        ? [ref.lowText, ref.highText].filter(Boolean).join(' a ') || null
        : null;
      const canonical = canonicalName(it.name);
      // 1B: normaliza à unidade-padrão do analito (Testosterona Livre nmol/L→pg/mL, etc.) — valor E ref
      // (mesma escala do laudo). Alinha séries que vinham em escalas diferentes e cruzavam na evolução.
      const rawUnit = normalizeUnit(it.unit ?? ref?.unit ?? null);
      const conv = valueNumeric != null ? toCanonicalUnit(canonical, valueNumeric, rawUnit) : null;
      const factor = conv && valueNumeric ? conv.value / valueNumeric : 1; // mesmo fator p/ ref
      const finalValue = conv?.value ?? valueNumeric ?? null;
      const finalUnit = conv?.unit ?? rawUnit;
      const finalLow = conv && ref?.lowNumeric != null ? Number((ref.lowNumeric * factor).toFixed(4)) : ref?.lowNumeric ?? null;
      const finalHigh = conv && ref?.highNumeric != null ? Number((ref.highNumeric * factor).toFixed(4)) : ref?.highNumeric ?? null;
      const { flag, isAbnormal } = reconcileScaleFlag(finalValue, finalLow, finalHigh, finalUnit);
      rows.push({
        panel: panel.name ?? null,
        name: it.name,
        nameCanonical: canonical,
        valueNumeric: finalValue,
        valueText: sanitizeUnitInText(it.valueText) ?? null,
        unit: finalUnit,
        refLow: finalLow,
        refHigh: finalHigh,
        refText,
        refAppliesTo: ref?.appliesTo ?? null,
        flag,
        isAbnormal,
        extractedPage: it.page,
        rawRow: it,
      });
    }
  }
  return dedupeIntraDoc(rows);
}

function pickReference(refs: NonNullable<ExtractionItem['references']>, prefers: string) {
  if (!refs || refs.length === 0) return undefined;
  const want = prefers.toUpperCase();
  return (
    refs.find((r) => (r.appliesTo ?? '').toUpperCase().includes(want)) ?? refs[0]
  );
}

/** Heurística conservadora: se pouquíssimos itens para um texto grande, marca p/ revisão. */
function sanityCheckItems(text: string, items: ItemRow[]): boolean {
  if (!text || text.length < 800) return false;
  const numericMatches = text.match(/\d+[.,]\d+\s*(g\/dl|mg\/dl|ui\/l|mm3|fl|pg|%|x\s*10)/gi) || [];
  const expected = Math.max(5, Math.round(numericMatches.length / 2));
  return items.length < Math.max(3, expected * 0.4);
}

function parseDate(s?: string | null): Date | null {
  if (!s) return null;
  // Formato brasileiro PRIMEIRO (dd/mm/yyyy) — new Date() usa MM/DD (americano) e erra
  const m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])); // yyyy, mm-1, dd
  // Fall back para ISO ou outros formatos
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;
  return null;
}

/** Normaliza nome p/ comparar: minúsculas, sem acento, tokens alfanuméricos >1 char. */
function normNameTokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1),
  );
}

/** Compara nome do documento vs nome do perfil (Jaccard de tokens). mismatch se score < 0.34. */
function computeNameMatch(docName: string, profileName: string) {
  const a = normNameTokens(docName), b = normNameTokens(profileName);
  const inter = [...a].filter((x) => b.has(x)).length;
  const uni = new Set([...a, ...b]).size || 1;
  const score = Math.round((inter / uni) * 100) / 100;
  return { score, docName, profileName, mismatch: score < 0.34 };
}

function computeIdentityMatch(raw: any, patient: { cpfHash?: string | null; cpfLast4?: string | null; cpfEncrypted?: string | null; cpfIv?: string | null }) {
  const docCpfRaw = raw?.patientCpf ?? raw?.cpf ?? raw?.patientCPF ?? '';
  const docHash = cpfFingerprint(docCpfRaw);
  const profileCpfMasked = maskStoredCpf(patient);
  if (docHash && patient.cpfHash) {
    const cpfMatch = docHash === patient.cpfHash;
    return {
      method: 'cpf',
      cpfPresent: true,
      cpfMatch,
      mismatch: !cpfMatch,
      severity: cpfMatch ? 'ok' : 'hard_block',
      docCpfMasked: maskCpf(docCpfRaw),
      profileCpfMasked,
    };
  }
  return {
    method: 'name_fallback',
    cpfPresent: normalizeCpf(docCpfRaw).length > 0,
    cpfMatch: null,
    mismatch: false,
    severity: 'fallback',
    docCpfMasked: maskCpf(docCpfRaw),
    profileCpfMasked,
  };
}
