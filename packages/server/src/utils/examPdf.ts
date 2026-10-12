// PDF premium do exame ("📄 Baixar PDF" — documento educativo para levar ao médico).
//
// pdfkit (leve, sem browser headless) + fontes padrão Helvetica — WinAnsi cobre os acentos
// do PT-BR, então NÃO embutimos fontes (arquivo menor) nem usamos glifos fora do WinAnsi
// (✓/↑/↓ não existem nessa codificação — usar "Normal"/"Acima"/"Abaixo").
//
// Páginas: 1) capa (marca + paciente + score + idade biológica)  2) resumo executivo com
// régua visual  3) tabela completa de marcadores  4) perguntas ao médico + plano de ação.
// Rodapé em TODAS as páginas: disclaimer educativo + data/hora (bufferedPageRange).

import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

// Cores da marca (DESIGN_SYSTEM.md — teal #20b2aa, cobre #d4a574; status: teal normal,
// âmbar atenção, vermelho alterado). Idênticas em dark/light (são de marca, não de tema).
const TEAL = '#20b2aa';
const TEAL_DARK = '#178f89';
const COPPER = '#d4a574';
const INK = '#2d3748';
const INK_SOFT = '#5b6b7a';
const AMBER = '#b45309';
const RED = '#c62828';
const BG_SOFT = '#eef7f6';

const PAGE_W = 595.28; // A4
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;

export interface PdfItem {
  name: string;
  nameCanonical?: string | null;
  panel?: string | null;
  valueNumeric?: number | null;
  valueText?: string | null;
  unit?: string | null;
  refLow?: number | null;
  refHigh?: number | null;
  refText?: string | null;
  flag?: string | null;
  isAbnormal?: boolean | null;
}

export interface ExamPdfInput {
  patientName: string;
  patientDob?: Date | string | null;
  examTitle: string;
  performedAt?: Date | string | null;
  sourceLab?: string | null;
  score?: number | null;
  biologicalAge?: number | null;
  items: PdfItem[];
  generatedAt?: Date;
}

// ───────────────────────────── helpers ─────────────────────────────

const fmtNum = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');

const fmtVal = (it: PdfItem): string =>
  it.valueText ?? (it.valueNumeric != null ? fmtNum(it.valueNumeric) : '—');

const fmtRef = (it: PdfItem): string => {
  if (it.refText) return it.refText;
  if (it.refLow != null && it.refHigh != null) return `${fmtNum(it.refLow)} a ${fmtNum(it.refHigh)}`;
  if (it.refHigh != null) return `até ${fmtNum(it.refHigh)}`;
  if (it.refLow != null) return `a partir de ${fmtNum(it.refLow)}`;
  return 'não informada';
};

type Status = 'normal' | 'acima' | 'abaixo' | 'critico' | 'semref';

function statusOf(it: PdfItem): Status {
  const f = String(it.flag ?? '').toUpperCase();
  if (f === 'CRITICAL') return 'critico';
  if (f === 'HIGH') return 'acima';
  if (f === 'LOW') return 'abaixo';
  if (f === 'ABNORMAL') return 'acima';
  if (it.isAbnormal) return 'acima';
  if (it.valueNumeric == null || (it.refLow == null && it.refHigh == null)) return 'semref';
  return 'normal';
}

const statusLabel: Record<Status, string> = {
  normal: 'Normal', acima: 'Acima', abaixo: 'Abaixo', critico: 'Crítico', semref: '—',
};
const statusColor: Record<Status, string> = {
  normal: TEAL_DARK, acima: RED, abaixo: AMBER, critico: RED, semref: INK_SOFT,
};

const fmtDate = (d?: Date | string | null): string =>
  d ? new Date(d).toLocaleDateString('pt-BR') : 'não informada';

/** Logo Dr. Exame (robô+escudo). O PNG vive no bundle do web — candidatos dev/prod;
 *  ausente/falha → wordmark tipográfico (nunca quebra a geração). */
let logoCache: Buffer | null | undefined;
function loadLogo(): Buffer | null {
  if (logoCache !== undefined) return logoCache;
  const candidates = [
    path.resolve(process.cwd(), '../web/dist/app-icon.png'),      // prod: cwd=packages/server, imagem única copia web/dist
    path.resolve(process.cwd(), '../web/public/app-icon.png'),    // dev (tsx)
    path.resolve(__dirname, '../../../web/public/app-icon.png'),  // dev a partir de src/utils
    path.resolve(__dirname, '../../../../web/dist/app-icon.png'), // dist/src/utils
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) { logoCache = fs.readFileSync(c); return logoCache; } } catch { /* tenta o próximo */ }
  }
  logoCache = null;
  return null;
}

/** Perguntas ao médico derivadas dos analitos alterados (templates por família —
 *  determinístico, educativo, nunca diagnóstico). */
function doctorQuestions(items: PdfItem[]): string[] {
  const abnormal = items.filter((i) => statusOf(i) !== 'normal' && statusOf(i) !== 'semref');
  const has = (re: RegExp) => abnormal.some((i) => re.test(String(i.nameCanonical ?? i.name).toUpperCase()));
  const qs: string[] = [];
  if (has(/GLICEMIA|HBA1C/)) qs.push('Minha glicose está fora da faixa — preciso ajustar alimentação, atividade física ou medicação?');
  if (has(/COLESTEROL|LDL|HDL|TRIGLICERIDES/)) qs.push('Meu colesterol/triglicerídeos alterados indicam necessidade de tratamento ou apenas mudança de hábitos?');
  if (has(/HEMOGLOBINA|HEMATOCRITO|FERRITINA|VCM|RDW/)) qs.push('Os alterados no hemograma sugerem anemia ou outra causa? Preciso suplementar ferro?');
  if (has(/TSH|T4/)) qs.push('Meus hormônios da tireoide alterados pedem investigação ou tratamento?');
  if (has(/CREATININA|UREIA|ACIDO_URICO/)) qs.push('Os marcadores renais/ácido úrico alterados indicam risco? Como proteger os rins?');
  if (has(/ALT|AST|GAMA_GT|BILIRRUBINA/)) qs.push('As enzimas hepáticas alteradas podem ser relacionadas a medicação, álcool ou outra causa?');
  if (has(/VITAMINA_D|VITAMINA_B12|FERRITINA/)) qs.push('Preciso corrigir deficiências vitamínicas? Em que dose e por quanto tempo?');
  const generic = abnormal.length
    ? `O que pode explicar ${abnormal.length === 1 ? 'o valor alterado' : `os ${abnormal.length} valores alterados`} deste exame?`
    : 'Diante destes resultados, há algo que eu deva monitorar ou refazer?';
  qs.push(generic);
  qs.push('Preciso repetir algum exame? Em quanto tempo?');
  return qs.slice(0, 6);
}

// ───────────────────────────── documento ─────────────────────────────

/** Gera o PDF (A4) e devolve o Buffer. Função PURA sobre `input` (sem DB/IO além do logo). */
export function buildExamReportPdf(input: ExamPdfInput): Promise<Buffer> {
  const generatedAt = input.generatedAt ?? new Date();
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 64, left: MARGIN, right: MARGIN }, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const items = input.items ?? [];
      const abnormal = items.filter((i) => statusOf(i) !== 'normal' && statusOf(i) !== 'semref');
      const normalCount = items.length - abnormal.length;

      // ── PÁGINA 1 — CAPA ─────────────────────────────────────────
      doc.rect(0, 0, PAGE_W, 8).fill(TEAL);
      let cursor = 64;
      const logo = loadLogo();
      if (logo) {
        try { doc.image(logo, MARGIN, cursor, { width: 64, height: 64 }); } catch { /* wordmark abaixo */ }
      }
      doc.fillColor(TEAL_DARK).font('Helvetica-Bold').fontSize(30).text('Dr. Exame', MARGIN + 78, cursor + 6);
      doc.fillColor(INK_SOFT).font('Helvetica').fontSize(10.5).text('Seu assistente de saúde com IA', MARGIN + 78, cursor + 40);
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(24).text('Relatório de Exame', MARGIN, cursor + 110);
      doc.moveTo(MARGIN, cursor + 145).lineTo(PAGE_W - MARGIN, cursor + 145).lineWidth(2).stroke(TEAL);

      doc.font('Helvetica-Bold').fontSize(13).fillColor(INK_SOFT).text('PACIENTE', MARGIN, cursor + 175);
      doc.font('Helvetica-Bold').fontSize(22).fillColor(INK).text(input.patientName, MARGIN, cursor + 193);

      let metaY = cursor + 245;
      const metaRow = (label: string, value: string) => {
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK_SOFT).text(label.toUpperCase(), MARGIN, metaY);
        doc.font('Helvetica').fontSize(12.5).fillColor(INK).text(value, MARGIN + 120, metaY - 1);
        metaY += 26;
      };
      metaRow('Exame', input.examTitle);
      metaRow('Data de coleta', fmtDate(input.performedAt));
      if (input.sourceLab) metaRow('Laboratório', input.sourceLab);
      metaRow('Marcadores', `${items.length} no total - ${abnormal.length} alterado(s), ${normalCount} normal(is)`);

      // Painel destaque: Score + Idade biológica lado a lado (cards)
      const cardY = 470;
      const cardW = (CONTENT_W - 16) / 2;
      const scoreVal = input.score != null ? Math.round(input.score) : null;
      const scoreCol = scoreVal == null ? INK_SOFT : scoreVal >= 80 ? TEAL_DARK : scoreVal >= 60 ? AMBER : RED;

      doc.roundedRect(MARGIN, cardY, cardW, 110, 12).fillAndStroke(BG_SOFT, TEAL);
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK_SOFT).text('SCORE DE SAÚDE', MARGIN + 18, cardY + 16);
      doc.font('Helvetica-Bold').fontSize(40).fillColor(scoreCol);
      const scoreStr = scoreVal == null ? '—' : String(scoreVal);
      const scoreW = doc.widthOfString(scoreStr);
      doc.text(scoreStr, MARGIN + 18, cardY + 36);
      if (scoreVal != null) {
        doc.font('Helvetica').fontSize(11).fillColor(INK_SOFT);
        doc.text('de 100', MARGIN + 18 + scoreW + 10, cardY + 64);
      }

      const bioVal = input.biologicalAge != null ? Math.round(input.biologicalAge * 10) / 10 : null;
      doc.roundedRect(MARGIN + cardW + 16, cardY, cardW, 110, 12).fillAndStroke('#fbf5ec', COPPER);
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK_SOFT).text('IDADE BIOLÓGICA', MARGIN + cardW + 34, cardY + 16);
      doc.font('Helvetica-Bold').fontSize(40).fillColor('#8a6240');
      doc.text(bioVal == null ? '—' : fmtNum(bioVal), MARGIN + cardW + 34, cardY + 36);
      doc.font('Helvetica').fontSize(11).fillColor(INK_SOFT).text(bioVal == null ? 'estimativa não disponível' : 'anos (estimativa)', MARGIN + cardW + 34, cardY + 84);

      doc.font('Helvetica').fontSize(9.5).fillColor(INK_SOFT)
        .text('Score e idade biológica são estimativas educativas calculadas sobre o histórico de exames do paciente.', MARGIN, cardY + 128, { width: CONTENT_W });
      doc.addPage();

      // ── PÁGINA 2 — RESUMO EXECUTIVO (régua visual) ──────────────
      doc.rect(0, 0, PAGE_W, 8).fill(TEAL);
      doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text('Resumo executivo', MARGIN, 56);
      doc.font('Helvetica').fontSize(10.5).fillColor(INK_SOFT)
        .text(abnormal.length
          ? `${abnormal.length} de ${items.length} marcadores fora da faixa de referência. Os maiores desvios:`
          : `Todos os ${items.length} marcadores estão dentro da faixa de referência.`, MARGIN, 84, { width: CONTENT_W });

      if (!abnormal.length) {
        doc.roundedRect(MARGIN, 130, CONTENT_W, 56, 12).lineWidth(1).fillAndStroke('#e8f6f2', TEAL);
        doc.font('Helvetica-Bold').fontSize(13).fillColor(TEAL_DARK).text('Tudo dentro da referência neste exame.', MARGIN + 18, 148);
      } else {
        // ordena por desvio relativo (mesma régua do front)
        const dev = (it: PdfItem) => {
          const v = it.valueNumeric ?? NaN, lo = it.refLow ?? NaN, hi = it.refHigh ?? NaN;
          if (statusOf(it) === 'critico') return Infinity;
          if (!isFinite(v) || !isFinite(lo) || !isFinite(hi) || lo === hi) return 0;
          return v > hi ? Math.abs((v - hi) / (hi || 1)) : v < lo ? Math.abs((lo - v) / (lo || 1)) : 0;
        };
        const top = [...abnormal].sort((a, b) => dev(b) - dev(a)).slice(0, 12);

        let y = 120;
        for (const it of top) {
          if (y > 700) break; // guarda espaço do rodapé
          const st = statusOf(it);
          const col = statusColor[st];
          doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(String(it.name).slice(0, 26), MARGIN, y);
          doc.font('Helvetica-Bold').fontSize(12).fillColor(col)
            .text(`${fmtVal(it)}${it.unit ? ' ' + it.unit : ''}  [Referência: ${fmtRef(it)}]  ${statusLabel[st]}`, MARGIN, y, { width: CONTENT_W, align: 'right' });

          // régua visual: trilho cinza + faixa de referência teal + marcador na posição do valor
          const ry = y + 22;
          const x0 = MARGIN + 4;
          const rulerW = CONTENT_W - 8;
          const lo = it.refLow, hi = it.refHigh, v = it.valueNumeric;
          const posOf = (val: number): number => {
            if (lo == null || hi == null || lo === hi) return rulerW / 2;
            const span = hi - lo;
            // referência ocupa 25%..75% da régua; valor clampa em 2%..98%
            const rel = (val - lo) / span; // 0=refLow 1=refHigh
            const mapped = 0.25 + rel * 0.5;
            return Math.max(0.02, Math.min(0.98, isFinite(mapped) ? mapped : 0.5)) * rulerW;
          };
          doc.rect(x0, ry, rulerW, 3).fill('#d8e2e0');
          if (lo != null && hi != null && lo !== hi) doc.rect(x0 + 0.25 * rulerW, ry, 0.5 * rulerW, 3).fill(TEAL);
          const px = v != null && lo != null && hi != null ? x0 + posOf(v) : x0 + rulerW / 2;
          doc.circle(px, ry + 1.5, 5).fill(col);
          if (v != null && lo != null && hi != null) {
            const loS = fmtNum(lo), hiS = fmtNum(hi);
            doc.font('Helvetica').fontSize(8.5).fillColor(INK_SOFT);
            doc.text(loS, x0 + 0.25 * rulerW - doc.widthOfString(loS) / 2, ry + 10, { lineBreak: false });
            doc.text(hiS, x0 + 0.75 * rulerW - doc.widthOfString(hiS) / 2, ry + 10, { lineBreak: false });
          }
          y += 48;
        }
        if (abnormal.length > 12) {
          doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(INK_SOFT).text(`(+ ${abnormal.length - 12} outros alterados — tabela completa na página seguinte)`, MARGIN, y);
        }
      }
      doc.addPage();

      // ── PÁGINA 3 — TABELA COMPLETA ─────────────────────────────
      doc.rect(0, 0, PAGE_W, 8).fill(TEAL);
      doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text('Tabela completa de marcadores', MARGIN, 56);

      const COLS = { name: 150, value: 70, unit: 50, ref: 105, status: 90 };
      const rowH = 20;
      let ty = 92;
      // Célula de tabela: posiciona por doc.x/doc.y ANTES do text() — passar (x, y) direto
      // no text() junto de lineBreak:false herdava a linha anterior e desalinha as colunas.
      const cell = (s: string, x: number, y: number, opts: { bold?: boolean; color?: string } = {}) => {
        doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(opts.color ?? INK);
        doc.x = x;
        doc.y = y;
        doc.text(s, { lineBreak: false });
      };
      const header = () => {
        doc.rect(MARGIN, ty, CONTENT_W, rowH).fill(BG_SOFT);
        let hx = MARGIN + 6;
        cell('MARCADOR', hx, ty + 6, { bold: true }); hx += COLS.name;
        cell('VALOR', hx, ty + 6, { bold: true }); hx += COLS.value;
        cell('UNID.', hx, ty + 6, { bold: true }); hx += COLS.unit;
        cell('REFERÊNCIA', hx, ty + 6, { bold: true }); hx += COLS.ref;
        cell('SITUAÇÃO', hx, ty + 6, { bold: true });
        ty += rowH;
      };
      header();

      // agrupa por painel (mesma ordem do app: panel asc, name asc)
      const grouped = new Map<string, PdfItem[]>();
      for (const it of items) {
        const k = it.panel || 'Geral';
        (grouped.get(k) ?? grouped.set(k, []).get(k)!).push(it);
      }
      let zebra = false;
      for (const [panel, list] of grouped) {
        if (ty > 745) { doc.addPage(); doc.rect(0, 0, PAGE_W, 8).fill(TEAL); ty = 56; header(); }
        cell(panel.toUpperCase().slice(0, 40), MARGIN + 6, ty + 5, { bold: true, color: TEAL_DARK });
        ty += rowH; zebra = false;
        for (const it of list) {
          if (ty > 745) { doc.addPage(); doc.rect(0, 0, PAGE_W, 8).fill(TEAL); ty = 56; header(); }
          if (zebra) doc.rect(MARGIN, ty, CONTENT_W, rowH).fill('#f6faf9');
          const st = statusOf(it);
          let cx = MARGIN + 6;
          cell(String(it.name).slice(0, 34), cx, ty + 5); cx += COLS.name;
          cell(fmtVal(it).slice(0, 12), cx, ty + 5); cx += COLS.value;
          cell((it.unit ?? '').slice(0, 10), cx, ty + 5); cx += COLS.unit;
          cell(fmtRef(it).slice(0, 22), cx, ty + 5); cx += COLS.ref;
          cell(statusLabel[st], cx, ty + 5, { bold: true, color: statusColor[st] });
          ty += rowH; zebra = !zebra;
        }
      }

      // ── PÁGINA 4 — PERGUNTAS + PLANO ───────────────────────────
      doc.addPage();
      doc.rect(0, 0, PAGE_W, 8).fill(TEAL);
      doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text('Perguntas para levar ao médico', MARGIN, 56);
      doc.font('Helvetica').fontSize(10.5).fillColor(INK_SOFT).text('Sugestões educativas geradas a partir dos seus resultados — escolha as suas.', MARGIN, 84, { width: CONTENT_W });
      let qy = 112;
      doctorQuestions(items).forEach((q, i) => {
        doc.font('Helvetica-Bold').fontSize(11.5).fillColor(TEAL_DARK);
        doc.x = MARGIN; doc.y = qy;
        doc.text(`${i + 1}.`, { lineBreak: false });
        doc.font('Helvetica').fontSize(11.5).fillColor(INK);
        doc.x = MARGIN + 18; doc.y = qy;
        doc.text(q, { width: CONTENT_W - 18 });
        qy += 34;
      });

      const planY = Math.max(qy + 28, 330);
      doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text('Plano de ação sugerido', MARGIN, planY);
      doc.moveTo(MARGIN, planY + 26).lineTo(PAGE_W - MARGIN, planY + 26).lineWidth(1.5).stroke(TEAL);
      const plan = [
        'Leve este relatório E o PDF original do laboratório à consulta (o laudo oficial prevalece sempre).',
        abnormal.length
          ? 'Anote sintomas, medicamentos em uso e há quanto tempo eles apareceram — o médico cruza com os valores alterados.'
          : 'Mantenha exames de rotina em dia conforme a periodicidade indicada pelo seu médico.',
        'Se algum medicamento foi iniciado ou alterado desde a coleta, informe na consulta.',
        abnormal.some((i) => /GLICEMIA|HBA1C|COLESTEROL|LDL|TRIGLICERIDES|TSH|T4/.test(String(i.nameCanonical ?? '')))
          ? 'Hábitos de alimentação, sono e atividade física influenciam diretamente os marcadores alterados deste exame.'
          : 'Hidratação, sono e alimentação equilibrada apoiam a manutenção dos bons resultados.',
      ];
      let py = planY + 42;
      for (const p of plan) {
        doc.circle(MARGIN + 4, py + 6, 2.5).fill(TEAL);
        doc.font('Helvetica').fontSize(11).fillColor(INK);
        doc.x = MARGIN + 16; doc.y = py;
        doc.text(p, { width: CONTENT_W - 16 });
        py += 32;
      }

      // ── RODAPÉ em TODAS as páginas (bufferedPageRange) ─────────
      // Zera a margem inferior ao carimbar: texto em y > (altura - margin.bottom) faz o
      // pdfkit ADD página silenciosamente (era o bug das 12 páginas — 2 extras por rodapé).
      const stamp = new Date(generatedAt).toLocaleString('pt-BR');
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const h = doc.page.height;
        const savedBottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.moveTo(MARGIN, h - 46).lineTo(PAGE_W - MARGIN, h - 46).lineWidth(0.5).stroke('#c9d6d4');
        doc.font('Helvetica').fontSize(8).fillColor(INK_SOFT);
        doc.x = MARGIN; doc.y = h - 40;
        doc.text('Gerado por Dr. Exame - documento educativo, não substitui avaliação médica. O laudo do laboratório prevalece.', { width: CONTENT_W, lineBreak: false });
        doc.x = MARGIN; doc.y = h - 28;
        doc.text(`Emitido em ${stamp}`, { width: CONTENT_W, align: 'right', lineBreak: false });
        doc.page.margins.bottom = savedBottom;
      }

      doc.end();
    } catch (e) {
      reject(e as Error);
    }
  });
}
