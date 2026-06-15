import { prisma } from '../prisma';
import { config } from '../config';
import { ExamKind, type ItemFlag } from '@prisma/client';
import { readPdf, classifyKind } from './pdfutil';
import { extractLabPanel, extractImaging } from './claude';
import { canonicalName, computeFlag, parseNumeric } from '../utils/normalize';
import { readExamFile, mediaTypeFromRef } from '../utils/storage';
import type { LabExtraction, ExtractionItem } from './schemas';

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

const DEMOGRAPHIC = 'Homens'; // paciente: homem adulto (Edmilson, nascido 1978)

/**
 * Orquestra a extração de um exame: classifica o tipo -> chama o Claude por VISÃO ->
 * normaliza os nomes canônicos -> calcula as flags -> persiste itens + JSON bruto.
 * Idempotente: pode ser re-rodado (reextract).
 */
export async function runExtraction(examId: string): Promise<void> {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) return;

  await prisma.exam.update({
    where: { id: examId },
    data: { status: 'EXTRACTING', extractionError: null },
  });

  try {
    const buffer = await readExamFile(exam.filePath);
    const media = mediaTypeFromRef(exam.filePath);
    const { pageCount, text } = await readPdf(buffer);
    const kind: ExamKind = exam.kind !== 'OTHER' ? exam.kind : classifyKind(text);

    let title = exam.title;
    let performedAt = exam.performedAt;
    let sourceLab = exam.sourceLab;
    let items: ItemRow[] = [];
    let raw: any = exam.rawExtraction;

    const dryRun = config.extractionDryRun;

    if (!dryRun || !raw) {
      if (kind === 'IMAGING') {
        const ext = await extractImaging(buffer, media);
        raw = ext;
        title = ext.examTitle ?? title;
        performedAt = parseDate(ext.performedAt) ?? performedAt;
        sourceLab = ext.sourceLab ?? sourceLab;
      } else {
        const lab = (await extractLabPanel(buffer, media)) as LabExtraction;
        raw = lab;
        title = lab.examTitle ?? title;
        performedAt = parseDate(lab.performedAt) ?? performedAt;
        sourceLab = lab.sourceLab ?? sourceLab;
        items = flattenLabItems(lab, DEMOGRAPHIC);
      }
    } else if (dryRun && raw && Array.isArray(raw.panels)) {
      // replay: apenas re-normaliza a partir do JSON guardado
      items = flattenLabItems(raw as LabExtraction, DEMOGRAPHIC);
    }

    // trava anti-alucinação (apenas painel lab): compara itens extraídos vs. densidade de valores no texto
    const reviewRequired = kind !== 'IMAGING' ? sanityCheckItems(text, items) : false;

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
  } catch (e: any) {
    const message = e?.message ?? String(e);
    await prisma.exam.update({
      where: { id: examId },
      data: { status: 'FAILED', extractionError: message },
    });
    console.error(`[extraction] exame ${examId} falhou:`, message);
    throw e;
  }
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
      const { flag, isAbnormal } = computeFlag(valueNumeric, ref?.lowNumeric ?? null, ref?.highNumeric ?? null);
      rows.push({
        panel: panel.name ?? null,
        name: it.name,
        nameCanonical: canonicalName(it.name),
        valueNumeric: valueNumeric ?? null,
        valueText: it.valueText ?? null,
        unit: it.unit ?? ref?.unit ?? null,
        refLow: ref?.lowNumeric ?? null,
        refHigh: ref?.highNumeric ?? null,
        refText,
        refAppliesTo: ref?.appliesTo ?? null,
        flag,
        isAbnormal,
        extractedPage: it.page,
        rawRow: it,
      });
    }
  }
  return rows;
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
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); // dd/mm/yyyy
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return null;
}
