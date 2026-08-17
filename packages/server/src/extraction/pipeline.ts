import { prisma } from '../prisma';
import { config } from '../config';
import { ExamKind, type ItemFlag } from '@prisma/client';
import { readPdf, classifyKind, looksLikeMedical } from './pdfutil';
import { classifyDoc } from './docPatterns';
import { extractLabPanel, extractLabPanels, extractImaging } from './claude';
import { imageToText } from './imageToText';
import { canonicalName, reconcileScaleFlag, parseNumeric, normalizeUnit, sanitizeUnitInText } from '../utils/normalize';
import { invalidateHealthSummary } from '../analysis/hs-cache';
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
    let splitLabs: LabExtraction[] = []; // PDF c/ vários exames (datas distintas) → exames 2..N viram registros próprios

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
        // MULTI-EXAME: pede array { exams: [...] } agrupado por data de coleta distinta.
        // Se falhar ou voltar vazio → cai pra extração single (atual, zero regressão).
        let labs: LabExtraction[] = [];
        try { labs = await extractLabPanels(buffer, media, precomputedText); }
        catch (e) { console.warn('[extraction] multi-exame falhou, caindo p/ single:', (e as Error).message); }
        // ANTI-SPLIT-FALSO: a IA às vezes devolve N exames p/ um PDF de data ÚNICA (hemograma +
        // bioquímica coletados no mesmo dia viravam 2 registros, inflando Conquistas e o histórico).
        // Mescla por data de coleta: só ficam separados os de datas GENUINAMENTE distintas
        // (histórico de anos do laboratório, ex.: 2021 + 2022 + 2026 num só PDF). flattenLabItems
        // já deduplica itens idênticos (dedupeIntraDoc) → a mescla não cria duplicatas.
        labs = mergeLabsByDate(labs);
        if (labs.length > 1) console.log(`[extraction] ${labs.length} exames de datas de coleta distintas (split)`);
        const lab = (labs[0] ?? (await extractLabPanel(buffer, media, precomputedText))) as LabExtraction;
        raw = lab;
        title = lab.examTitle ?? title;
        performedAt = parseDate(lab.performedAt) ?? performedAt;
        sourceLab = lab.sourceLab ?? sourceLab;
        items = flattenLabItems(lab, demo);
        splitLabs = labs.slice(1); // exames além do primeiro → registros separados (bloco split abaixo)
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
      // DETECÇÃO CROSS-USER (anti-fraude): se o CPF do exame NÃO bate com o paciente selecionado,
      // checa se ele pertence a um paciente de OUTRA conta. O cpfHash é @unique global → se o hash
      // do exame existe num paciente de outro owner, o exame é de outra pessoa (tentativa de usar
      // exame alheio). Marca crossUser pra a UI rejeitar c/ msg clara ("pertence a outro usuário").
      if (raw.identityMatch.method === 'cpf' && !raw.identityMatch.cpfMatch && patient.ownerId) {
        const examCpfHash = cpfFingerprint(raw.patientCpf ?? raw.cpf ?? raw.patientCPF ?? '');
        if (examCpfHash) {
          const otherOwner = await prisma.patient.findFirst({
            where: { cpfHash: examCpfHash, ownerId: { not: patient.ownerId } },
            select: { id: true },
          }).catch(() => null);
          if (otherOwner) {
            raw.identityMatch.crossUser = true;
            raw.identityMatch.severity = 'cross_user';
          }
        }
      }
    }

    // bloqueio suave anti-fraude: compara o nome do paciente no documento vs. perfil
    if (raw && patient?.fullName && raw.patientName) {
      raw.nameMatch = computeNameMatch(String(raw.patientName), patient.fullName);
    }

    // LGPD: o CPF CRU do documento (raw.patientCpf/cpf) só foi preciso pro computeIdentityMatch
    // acima (que guarda só o mascarado em identityMatch.docCpfMasked). Remove do raw ANTES de
    // persistir — rawExtraction é JSONB sem pgcrypto; CPF cru ficaria legível num dump do banco.
    if (raw) { delete raw.patientCpf; delete raw.cpf; delete raw.patientCPF; }

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
    // Extração mudou os dados do paciente → invalida o cache do health-summary na hora
    // (antes: até 5min de score/"o que mudou" defasados após subir exame novo).
    invalidateHealthSummary(exam.patientId);
    // Extração consome créditos (CREDIT_COSTS.extraction = 0 hoje, mas mantém o gate p/ futura cobrança).
    if (patient?.ownerId) { try { await chargeCredits(patient.ownerId, CREDIT_COSTS.extraction); } catch { /* não bloqueia */ } }

    // BÔNUS DE 1º EXAME: concede freeSignup créditos quando o usuário extrai seu PRIMEIRO exame com sucesso.
    // Anti-farm: bots criam conta mas não conseguem automatizar envio de PDF de exame → nunca ganham créditos.
    // GATE DE IDENTIDADE: o bônus SÓ é concedido se o CPF do exame bater com o CPF do perfil. Se o
    // exame é alheio (CPF diverge — hard_block), NÃO dá créditos (fraude: pegar PDF de outro e upar p/ farmar).
    // ANTI RE-FARM: o grant é ÚNICO por usuário (flag firstExamBonusGranted). Mesmo que o user extraia o
    // 1º exame, DELETE (volta a 0), e envie de novo, NÃO ganha de novo — updateMany atômico no flag garante 1x só.
    if (patient?.ownerId) {
      const userExamCount = await prisma.exam.count({ where: { patient: { ownerId: patient.ownerId }, status: 'EXTRACTED' } });
      const cpfMismatch = raw?.identityMatch?.method === 'cpf' && raw?.identityMatch?.cpfMatch === false;
      if (firstExamBonusPreconditions({ examCount: userExamCount, cpfMismatch })) {
        const bonus = (await import('../utils/settings')).getSettings().grants?.freeSignup ?? 45;
        const claimed = await grantFirstExamBonus(patient.ownerId, bonus);
        if (claimed) console.log(`[extraction] BÔNUS de ${bonus} créditos concedido ao user ${patient.ownerId} (1º exame extraído)`);
        else console.log(`[extraction] BÔNUS já concedido antes p/ user ${patient.ownerId} (anti re-farm) — ignorado`);
      } else if (cpfMismatch) {
        console.log(`[extraction] BÔNUS BLOQUEADO p/ user ${patient.ownerId}: CPF do exame diverge do perfil (anti-farm)`);
      }
    }

    // Nudge de 1º exame cumpriu o papel: marca as notificações 'first_exam' como lidas para não
    // pipocar o dialog "envie seu primeiro exame" numa conta que JÁ tem exame extraído (visto em
    // produção: notificação antiga não lida reabrindo no boot, meses depois, em estado mentiroso).
    if (patient?.ownerId) {
      await prisma.notification.updateMany({
        where: { userId: patient.ownerId, type: 'first_exam', read: false },
        data: { read: true },
      }).catch(() => { /* best-effort: não bloqueia a extração */ });
    }

    // SPLIT: PDF c/ vários exames (datas de coleta distintas) → cria registros Exam separados p/ 2..N.
    // fileSha256 c/ sufixo "#split-N" dribla o @@unique (sem migration). Idempotente (remove splits
    // antigos antes — re-extract) + falha isolada (nunca derruba o exame principal já extraído).
    if (splitLabs.length) {
      try {
        const baseSha = exam.fileSha256;
        const oldSplits = await prisma.exam.findMany({ where: { patientId: exam.patientId, fileSha256: { startsWith: `${baseSha}#split-` } }, select: { id: true } });
        if (oldSplits.length) await prisma.exam.deleteMany({ where: { id: { in: oldSplits.map((o) => o.id) } } });
        for (let i = 0; i < splitLabs.length; i++) {
          const slab = splitLabs[i];
          const sitems = flattenLabItems(slab, demo);
          if (!sitems.length) continue;
          // PROPAGA identidade p/ o split: sem isto, o exame principal marcava CPF divergente
          // mas os splits ficavam "sem info" (rawExtraction sem identityMatch) → UI não aplicava
          // o hard_block no split (brecha: via o split como exame válido do usuário). Computa do
          // mesmo patient (mesmo CPF do perfil) + strip CPF cru (LGPD — rawExtraction é JSONB sem pgcrypto).
          const sraw: any = { ...slab };
          if (patient?.cpfHash) sraw.identityMatch = computeIdentityMatch(slab, patient);
          if (patient?.fullName && slab.patientName) sraw.nameMatch = computeNameMatch(String(slab.patientName), patient.fullName);
          delete sraw.patientCpf; delete sraw.cpf; delete sraw.patientCPF;
          const screated = await prisma.exam.create({
            data: {
              patientId: exam.patientId,
              title: slab.examTitle ?? exam.title,
              kind,
              filePath: exam.filePath,
              fileSha256: `${baseSha}#split-${i + 2}`,
              fileSizeBytes: exam.fileSizeBytes,
              pageCount: pageCount || exam.pageCount,
              performedAt: parseDate(slab.performedAt),
              sourceLab: slab.sourceLab ?? exam.sourceLab,
              rawExtraction: sraw,
              status: 'EXTRACTED',
              extractedAt: new Date(),
            },
          });
          await prisma.examItem.createMany({ data: sitems.map((r) => ({ ...r, examId: screated.id })) });
          console.log(`[extraction] split ${i + 2}/${splitLabs.length + 1}: exame ${screated.id} criado (${sitems.length} itens, coleta ${slab.performedAt ?? '?'})`);
        }
      } catch (e: any) { console.error('[extraction] split falhou (exame principal OK):', e?.message); }
      // Splits mudam o histórico do paciente (novos exames/datas) — invalida aqui também.
      invalidateHealthSummary(exam.patientId);
    }
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
      // Arredonda 4 casas — a conversão de unidade (e às vezes a IA) gera floats longos tipo
      // 91.33627999999999 (Testosterona Livre). Sem isto, o DB e a UI mostram o número feio.
      const rawValue = conv?.value ?? valueNumeric ?? null;
      const finalValue = rawValue != null ? Number(rawValue.toFixed(4)) : null;
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

/** Mescla LabExtraction's que compartilham a MESMA data de coleta (performedAt) num só.
 *  Anti-split-falso: a IA devolve hemograma + bioquímica + urina (mesmo dia) como exames
 *  separados, inflando Conquistas e criando registros duplicados. Aqui agrupamos por data:
 *  só viram registros próprios os de datas GENUINAMENTE distintas. Labs sem data parseável
 *  ficam separados (não dá pra mesclar com segurança) — mas isso é raro (todo laudo tem data). */
export /** Normaliza performedAt → chave YYYY-MM-DD direto da string (imune a timezone do new Date()).
 *  new Date('2026-03-15') vira UTC midnight → getDate() em horário local (UTC-3) cai no dia 14
 *  e quebrava o agrupamento. Aqui casamos os padrões BR (dd/mm/yyyy) e ISO (yyyy-mm-dd). */
function dateKey(s?: string | null): string | null {
  if (!s) return null;
  const str = String(s).trim();
  const br = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  const iso = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = parseDate(str);
  if (!d) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function mergeLabsByDate(labs: LabExtraction[]): LabExtraction[] {
  if (labs.length <= 1) return labs;
  const groups = new Map<string, LabExtraction>();
  const noDate: LabExtraction[] = [];
  let mergedCount = 0;
  for (const lab of labs) {
    const key = dateKey(lab.performedAt);
    if (!key) { noDate.push(lab); continue; }
    const existing = groups.get(key);
    if (existing) {
      // acumula os painéis do exame do mesmo dia no registro principal
      existing.panels = [...(existing.panels ?? []), ...(lab.panels ?? [])];
      existing.examTitle = existing.examTitle || lab.examTitle;
      existing.sourceLab = existing.sourceLab || lab.sourceLab;
      // performedAt/patientName/patientCpf do primeiro (já validado) — mantém.
      mergedCount++;
    } else {
      groups.set(key, { ...lab, panels: [...(lab.panels ?? [])] });
    }
  }
  if (mergedCount > 0) console.log(`[extraction] mesclou ${mergedCount} exame(s) de mesma data de coleta (anti-split-falso)`);
  return [...groups.values(), ...noDate];
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

export function computeIdentityMatch(raw: any, patient: { cpfHash?: string | null; cpfLast4?: string | null; cpfEncrypted?: string | null; cpfIv?: string | null }) {
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

/** Pré-condições p/ o bônus de 1º exame (decisão pura, testável). A atomicidade "1x só por usuário"
 *  é garantida no DB pela flag firstExamBonusGranted (grantFirstExamBonus). */
export function firstExamBonusPreconditions(opts: { examCount: number; cpfMismatch: boolean }): boolean {
  return opts.examCount >= 1 && !opts.cpfMismatch;
}

/** Grant ATÔMICO do bônus de 1º exame — updateMany condicional no flag firstExamBonusGranted:
 *  só incrementa créditos + cria ledger/notificação se o flag ainda era false (claim exclusivo).
 *  Anti re-farm: deletar o exame e re-enviar NÃO re-concede (flag fica true p/ sempre).
 *  Anti-race: 2 extrações paralelas → só 1 vence o updateMany (row lock). Devolve true se concedeu. */
export async function grantFirstExamBonus(ownerId: string, bonus: number): Promise<boolean> {
  try {
    return await prisma.$transaction(async (tx) => {
      const r = await tx.user.updateMany({ where: { id: ownerId, firstExamBonusGranted: false }, data: { credits: { increment: bonus }, firstExamBonusGranted: true } });
      if (r.count !== 1) return false; // já concedido antes (ou user sumiu) → não re-concede
      await tx.creditTransaction.create({ data: { userId: ownerId, delta: bonus, kind: 'first_exam_bonus', label: `Bônus: 1º exame extraído (+${bonus})` } });
      await tx.notification.create({ data: { userId: ownerId, type: 'bonus', title: '🎁 Você ganhou ' + bonus + ' créditos!', body: 'Seu primeiro exame foi extraído com sucesso! Use seus créditos pra conversar com o Dr. Exame, gerar relatórios e perguntar ao médico.' } });
      return true;
    });
  } catch (e: any) {
    console.error('[extraction] grantFirstExamBonus falhou:', e?.message);
    return false;
  }
}
