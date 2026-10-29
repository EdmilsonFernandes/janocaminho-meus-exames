// @vitest-environment node
/**
 * Verificação de identidade do médico — painel do dono (Plano 2 · W2).
 * Parte 1: helpers PUROS (rótulo de status, motivo da fila, comparação de nomes, datas, erros).
 * Parte 2: telas via renderToString (SSR puro, padrão SportsModeCard.test).
 */
import { readFileSync } from 'node:fs';
import { createElement as h, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// config.ts importa @capacitor/core — nada de rede/Capacitor no render.
vi.mock('../../config', () => ({ API_URL: '/api', token: () => 't', doctorPhotoUrl: () => '' }));

import {
  REASON_MAX, REJECT_EMAIL_NOTICE, REJECT_SHORTCUTS, UAIID_DECIDE_NOTICE,
  applyShortcut, compareNames, crmLabel, formatDateTimeBR, formatRatio, formatScore, graceInputToMs,
  graceLabel, identityChip, initialOf, kycErrorMessage, legacyApprovedNotice, msToDateInput, parseQueue, plural,
  priorAttemptsLabel, queueCounts, reasonOk, reviewReason, sortReview, statusLabel, strictName,
  type LegacyItem, type ReviewItem,
} from './doctorVerification';
import {
  ApproveForm, DoctorVerificationPanel, IdentityChip, LegacySection, NameCompare, RejectForm, ReviewCard, StatTiles,
} from './DoctorVerificationPanel';

// ── helpers de fixture ───────────────────────────────────────────────────────
const review = (over: Partial<ReviewItem> = {}): ReviewItem => ({
  id: 'att1', providerId: 'ver_abc123', crm: '123456-SP', status: 'approved', reasonCode: 'manual_policy',
  decision: 'needs_admin', documentName: 'MARIA APARECIDA SANTOS', cfmName: 'MARIA APARECIDA SANTOS',
  nameRatio: 1, score: 92, createdAt: new Date(2026, 9, 28, 14, 5).toISOString(),
  doctor: { id: 'd1', name: 'Maria Aparecida Santos', crm: '123456', crmUf: 'SP', email: 'maria@clinica.com', verificationStatus: 'needs_admin' },
  priorAttempts: 0, decideIn: 'drexame', ...over,
});
const legacy = (i: number): LegacyItem => ({ id: `l${i}`, name: `Dr. Antigo ${i}`, crm: `10${i}`, crmUf: 'MG', email: `antigo${i}@med.com`, createdAt: new Date(2025, 4, 12).toISOString() });

// ═══════════════════════════ PARTE 1 — helpers puros ═══════════════════════════

describe('identityChip — status do médico → chip "Identidade: …"', () => {
  it('rótulos por status (sempre prefixados com "Identidade")', () => {
    expect(identityChip('approved')).toEqual({ label: 'Identidade: verificada', tone: 'ok' });
    expect(identityChip('needs_admin')).toEqual({ label: 'Identidade: aguardando você', tone: 'warn' });
    expect(identityChip('uaiid_review')).toEqual({ label: 'Identidade: no UaiID', tone: 'info' });
    expect(identityChip('in_progress')).toEqual({ label: 'Identidade: em andamento', tone: 'info' });
    expect(identityChip('pending')).toEqual({ label: 'Identidade: pendente', tone: 'neutral' });
    expect(identityChip('rejected')).toEqual({ label: 'Identidade: recusada', tone: 'bad' });
    expect(identityChip('legacy')).toEqual({ label: 'Identidade: não verificada (antigo)', tone: 'neutral' });
  });
  it('ausente/desconhecido (server antigo, status novo) → null = chip escondido', () => {
    for (const v of [undefined, null, '', 'weird', 42, {}]) expect(identityChip(v)).toBeNull();
  });
  it('NUNCA reaproveita o texto do filtro de e-mail "Verificados"', () => {
    for (const s of ['approved', 'needs_admin', 'uaiid_review', 'in_progress', 'pending', 'rejected', 'legacy']) {
      expect(identityChip(s)!.label.startsWith('Identidade: ')).toBe(true);
    }
  });
});

describe('statusLabel', () => {
  it('traduz os 7 status; desconhecido vira "desconhecida"', () => {
    expect(statusLabel('needs_admin')).toBe('aguardando você');
    expect(statusLabel('uaiid_review')).toBe('no painel do UaiID');
    expect(statusLabel('rejected')).toBe('recusado');
    expect(statusLabel('approved')).toBe('aprovado');
    expect(statusLabel('legacy')).toBe('antigo');
    expect(statusLabel('pending')).toBe('pendente');
    expect(statusLabel('in_progress')).toBe('em andamento');
    expect(statusLabel('zzz')).toBe('desconhecida');
    expect(statusLabel(null)).toBe('desconhecida');
  });
});

describe('parseQueue / sortReview / queueCounts', () => {
  it('payload válido passa intacto', () => {
    const q = parseQueue({ review: [review()], legacy: [legacy(1)] });
    expect(q.review).toHaveLength(1);
    expect(q.review[0].doctor.name).toBe('Maria Aparecida Santos');
    expect(q.legacy[0].id).toBe('l1');
  });
  it('resposta vazia do offline-first ({items,data,total}) ou lixo → fila vazia', () => {
    expect(parseQueue({ items: [], data: [], total: 0 })).toEqual({ review: [], legacy: [] });
    for (const v of [null, undefined, 'x', 7, []]) expect(parseQueue(v)).toEqual({ review: [], legacy: [] });
  });
  it('descarta linha sem médico; completa priorAttempts e decideIn quando faltam', () => {
    const raw = {
      review: [
        { ...review({ id: 'ok1', decision: 'uaiid_review' }), priorAttempts: undefined, decideIn: undefined },
        { ...review({ id: 'ok2' }), decideIn: undefined },
        { ...review({ id: 'sem-medico' }), doctor: null },
      ],
      legacy: [legacy(1), { name: 'sem id' }],
    };
    const q = parseQueue(raw);
    expect(q.review.map((r) => r.id)).toEqual(['ok1', 'ok2']);
    expect(q.review[0].decideIn).toBe('uaiid');
    expect(q.review[1].decideIn).toBe('drexame');
    expect(q.review[0].priorAttempts).toBe(0);
    expect(q.legacy).toHaveLength(1);
  });
  it('sortReview: "Aguardando você" antes do painel do UaiID; ordem do servidor dentro do grupo', () => {
    const a = review({ id: 'a', decideIn: 'uaiid' });
    const b = review({ id: 'b', decideIn: 'drexame' });
    const c = review({ id: 'c', decideIn: 'uaiid' });
    const d = review({ id: 'd', decideIn: 'drexame' });
    expect(sortReview([a, b, c, d]).map((r) => r.id)).toEqual(['b', 'd', 'a', 'c']);
  });
  it('queueCounts: os 3 contadores do painel', () => {
    const q = { review: [review({ id: '1' }), review({ id: '2', decideIn: 'uaiid' }), review({ id: '3' })], legacy: [legacy(1), legacy(2), legacy(3), legacy(4)] };
    expect(queueCounts(q)).toEqual({ waiting: 2, inUaiid: 1, legacy: 4 });
    expect(queueCounts({ review: [], legacy: [] })).toEqual({ waiting: 0, inUaiid: 0, legacy: 0 });
  });
});

describe('reviewReason — por que o caso está na fila', () => {
  it('manual_policy = tudo verde, falta só o OK do dono', () => {
    const r = reviewReason('manual_policy', 'drexame');
    expect(r.tone).toBe('ok');
    expect(r.text).toContain('Tudo conferiu');
  });
  it('name_mismatch pede atenção (tom warn)', () => {
    const r = reviewReason('name_mismatch', 'drexame');
    expect(r.tone).toBe('warn');
    expect(r.text).toContain('nome do documento');
  });
  it('motivos de indisponibilidade (CFM/nome/situação) → warn', () => {
    for (const c of ['document_name_unavailable', 'cfm_unavailable', 'cfm_situation_unknown']) {
      expect(reviewReason(c, 'drexame').tone).toBe('warn');
    }
  });
  it('revisão no UaiID → info; sem código → mensagem genérica por lado', () => {
    expect(reviewReason('face_mismatch_review', 'uaiid').tone).toBe('info');
    expect(reviewReason(null, 'uaiid').text).toContain('UaiID');
    expect(reviewReason(null, 'drexame').text).toContain('conferência');
  });
  it('código desconhecido → texto genérico + o código (para o dono/dev identificar)', () => {
    expect(reviewReason('novo_codigo_x', 'drexame').text).toContain('novo_codigo_x');
  });
});

describe('strictName — mesma regra do servidor (decide.ts)', () => {
  it('sem acento, maiúsculas, sem pontuação e sem partículas', () => {
    expect(strictName('  João  da   Silva ')).toBe('JOAO SILVA');
    expect(strictName('JOSÉ DE SOUZA E SILVA')).toBe('JOSE SOUZA SILVA');
    expect(strictName('Ana-Maria D\'Ávila')).toBe('ANA MARIA D AVILA');
  });
  it('acento decomposto (NFD) não parte a palavra', () => {
    expect(strictName('José Silva')).toBe('JOSE SILVA');
  });
  it('vazio/nulo/só partículas → ""', () => {
    expect(strictName(null)).toBe('');
    expect(strictName(undefined)).toBe('');
    expect(strictName('DE DA DO')).toBe('');
  });
  it('Souza × Santos NÃO casam (a fuzzy do UaiID deixaria passar)', () => {
    expect(strictName('JOAO SOUZA')).not.toBe(strictName('JOAO SANTOS'));
  });
});

describe('compareNames — nome no documento × nome no CFM', () => {
  const diffWords = (ws: { text: string; diff: boolean }[]) => ws.filter((w) => w.diff).map((w) => w.text);

  it('iguais ignorando caixa, acento e partículas → match, nada destacado', () => {
    const c = compareNames('João Carlos da Silva', 'JOAO CARLOS SILVA');
    expect(c.status).toBe('match');
    expect(diffWords(c.doc)).toEqual([]);
    expect(diffWords(c.cfm)).toEqual([]);
    expect(c.orderOnly).toBe(false);
  });
  it('sobrenome diferente → differ, só a palavra que diverge é destacada (nos dois lados)', () => {
    const c = compareNames('MARIA APARECIDA DE OLIVEIRA SANTOS', 'MARIA APARECIDA DE OLIVEIRA SOUZA');
    expect(c.status).toBe('differ');
    expect(diffWords(c.doc)).toEqual(['SANTOS']);
    expect(diffWords(c.cfm)).toEqual(['SOUZA']);
    expect(c.doc.map((w) => w.text).join(' ')).toBe('MARIA APARECIDA DE OLIVEIRA SANTOS'); // texto original preservado
  });
  it('palavra a mais de um lado → destaque só ali; partícula nunca é destacada', () => {
    const c = compareNames('JOSE DA SILVA', 'JOSE CARLOS DA SILVA');
    expect(c.status).toBe('differ');
    expect(diffWords(c.doc)).toEqual([]);
    expect(diffWords(c.cfm)).toEqual(['CARLOS']);
    const part = compareNames('JOSE SILVA', 'JOSE DE SILVA');
    expect(part.status).toBe('match'); // partícula ignorada, como no servidor
  });
  it('mesmas palavras em outra ordem → differ com orderOnly (sem palavra destacada)', () => {
    const c = compareNames('SILVA JOAO', 'JOAO SILVA');
    expect(c.status).toBe('differ');
    expect(c.orderOnly).toBe(true);
    expect(diffWords(c.doc)).toEqual([]);
  });
  it('falta um dos nomes → unknown (não dá para comparar), o outro continua visível', () => {
    const c1 = compareNames(null, 'MARIA SOUZA');
    expect(c1.status).toBe('unknown');
    expect(c1.doc).toEqual([]);
    expect(c1.cfm.map((w) => w.text)).toEqual(['MARIA', 'SOUZA']);
    const c2 = compareNames('MARIA SOUZA', '   ');
    expect(c2.status).toBe('unknown');
    expect(compareNames(undefined, undefined)).toEqual({ status: 'unknown', doc: [], cfm: [], orderOnly: false });
  });
  it('palavra repetida conta como multiconjunto (MARIA MARIA × MARIA)', () => {
    const c = compareNames('MARIA MARIA SOUZA', 'MARIA SOUZA');
    expect(c.status).toBe('differ');
    expect(diffWords(c.doc)).toEqual(['MARIA']);
  });
});

describe('formatação de números e rótulos', () => {
  it('formatRatio: fração → %, null/NaN → null', () => {
    expect(formatRatio(0.8823)).toBe('88%');
    expect(formatRatio(1)).toBe('100%');
    expect(formatRatio(0.999)).toBe('100%');
    expect(formatRatio(0)).toBe('0%');
    expect(formatRatio(88)).toBe('88%'); // já veio em percentual
    expect(formatRatio(null)).toBeNull();
    expect(formatRatio(undefined)).toBeNull();
    expect(formatRatio(Number.NaN)).toBeNull();
  });
  it('formatScore: inteiro; null → null', () => {
    expect(formatScore(87)).toBe('87');
    expect(formatScore(87.4)).toBe('87');
    expect(formatScore(null)).toBeNull();
    expect(formatScore(Number.NaN)).toBeNull();
  });
  it('priorAttemptsLabel: singular/plural; 0 → null', () => {
    expect(priorAttemptsLabel(0)).toBeNull();
    expect(priorAttemptsLabel(-2)).toBeNull();
    expect(priorAttemptsLabel(Number.NaN)).toBeNull();
    expect(priorAttemptsLabel(1)).toBe('1 tentativa anterior neste CRM');
    expect(priorAttemptsLabel(3)).toBe('3 tentativas anteriores neste CRM');
  });
  it('crmLabel: CRM número-UF sem duplicar a UF', () => {
    expect(crmLabel('123456', 'SP')).toBe('CRM 123456-SP');
    expect(crmLabel('123456-SP', 'SP')).toBe('CRM 123456-SP');
    expect(crmLabel('123456', null)).toBe('CRM 123456');
    expect(crmLabel('123456')).toBe('CRM 123456');
  });
  it('plural / initialOf', () => {
    expect(plural(1, 'médico', 'médicos')).toBe('médico');
    expect(plural(0, 'médico', 'médicos')).toBe('médicos');
    expect(plural(2, 'médico', 'médicos')).toBe('médicos');
    expect(initialOf('Dra. ana souza')).toBe('A');
    expect(initialOf('  ')).toBe('?');
  });
});

describe('datas — prazo dos médicos antigos (date → legacyGraceUntilMs)', () => {
  const NOW = new Date(2026, 9, 29, 12, 0, 0).getTime(); // 29/10/2026 12:00 local

  it('vazio → 0 (sem prazo)', () => {
    expect(graceInputToMs('', NOW)).toEqual({ ok: true, ms: 0 });
    expect(graceInputToMs('   ', NOW)).toEqual({ ok: true, ms: 0 });
  });
  it('data futura → fim do dia LOCAL (o médico atende até a data inclusive)', () => {
    const r = graceInputToMs('2026-11-15', NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = new Date(r.ms);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([2026, 10, 15, 23, 59, 59]);
    expect(r.ms).toBeGreaterThan(NOW);
    expect(Number.isInteger(r.ms)).toBe(true);
  });
  it('hoje ainda vale (fim do dia > agora); ontem não', () => {
    expect(graceInputToMs('2026-10-29', NOW).ok).toBe(true);
    const past = graceInputToMs('2026-10-28', NOW);
    expect(past.ok).toBe(false);
    if (!past.ok) expect(past.error).toContain('futura');
  });
  it('formato inválido, dia inexistente e data absurda → erro em português', () => {
    for (const bad of ['15/11/2026', 'amanhã', '2026-13-01', '2026-02-30', '2026-1-5']) {
      const r = graceInputToMs(bad, NOW);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
    }
    const far = graceInputToMs('2100-01-01', NOW);
    expect(far.ok).toBe(false);
  });
  it('msToDateInput é o inverso (ms → YYYY-MM-DD local); 0/nulo → ""', () => {
    const ms = new Date(2026, 10, 15, 23, 59, 59, 999).getTime();
    expect(msToDateInput(ms)).toBe('2026-11-15');
    expect(msToDateInput(0)).toBe('');
    expect(msToDateInput(null)).toBe('');
    expect(msToDateInput(undefined)).toBe('');
    const rt = graceInputToMs(msToDateInput(ms), NOW);
    expect(rt.ok && rt.ms).toBe(ms);
  });
  it('graceLabel: "até DD/MM/AAAA" ou "sem prazo"', () => {
    expect(graceLabel(new Date(2026, 10, 15, 23, 59, 59, 999).getTime())).toBe('até 15/11/2026');
    expect(graceLabel(0)).toBe('sem prazo');
    expect(graceLabel(null)).toBe('sem prazo');
  });
  it('formatDateTimeBR: DD/MM/AAAA HH:mm local; inválido → ""', () => {
    expect(formatDateTimeBR(new Date(2026, 9, 28, 14, 5).toISOString())).toBe('28/10/2026 14:05');
    expect(formatDateTimeBR('não é data')).toBe('');
    expect(formatDateTimeBR(null)).toBe('');
  });
});

describe('recusa — motivo vai por e-mail ao médico (R4)', () => {
  it('textos exatos do plano', () => {
    expect(REJECT_EMAIL_NOTICE).toBe('Este motivo será enviado por e-mail ao médico.');
    expect(UAIID_DECIDE_NOTICE).toBe('Decida no painel do UaiID — o resultado volta sozinho.');
    expect([...REJECT_SHORTCUTS]).toEqual([
      'Documento ilegível',
      'Nome do documento não confere com o CRM',
      'CRM inativo no CFM',
      'Suspeita de documento de terceiros',
    ]);
    expect(REASON_MAX).toBe(500); // o servidor corta em 500
  });
  it('reasonOk: só com texto de verdade', () => {
    expect(reasonOk('')).toBe(false);
    expect(reasonOk('   \n ')).toBe(false);
    expect(reasonOk('Documento ilegível')).toBe(true);
  });
  it('applyShortcut: preenche vazio; acrescenta como nova frase; não duplica; respeita 500', () => {
    expect(applyShortcut('', 'Documento ilegível')).toBe('Documento ilegível');
    expect(applyShortcut('  ', 'Documento ilegível')).toBe('Documento ilegível');
    expect(applyShortcut('Foto cortada', 'Documento ilegível')).toBe('Foto cortada. Documento ilegível');
    expect(applyShortcut('Foto cortada.', 'CRM inativo no CFM')).toBe('Foto cortada. CRM inativo no CFM');
    expect(applyShortcut('Documento ilegível', 'Documento ilegível')).toBe('Documento ilegível');
    expect(applyShortcut('documento ilegível', 'Documento ilegível')).toBe('documento ilegível');
    const long = 'x'.repeat(REASON_MAX - 3);
    expect(applyShortcut(long, 'Documento ilegível').length).toBeLessThanOrEqual(REASON_MAX);
  });
});

describe('kycErrorMessage — erro do servidor → português no painel', () => {
  it('INVALID_STATE mostra a situação atual; uaiid_review manda decidir no UaiID', () => {
    const m = kycErrorMessage('INVALID_STATE', { status: 'rejected' });
    expect(m).toContain('não está mais aguardando');
    expect(m).toContain('recusado');
    expect(kycErrorMessage('INVALID_STATE', { status: 'uaiid_review' })).toContain('painel do UaiID');
    expect(kycErrorMessage('INVALID_STATE')).toContain('não está mais aguardando');
  });
  it('REASON_REQUIRED / KYC_CONFIG_INVALID / IDS_REQUIRED / NOT_FOUND', () => {
    expect(kycErrorMessage('REASON_REQUIRED')).toContain('motivo');
    expect(kycErrorMessage('KYC_CONFIG_INVALID')).toContain('data futura');
    expect(kycErrorMessage('IDS_REQUIRED')).toContain('Selecione');
    expect(kycErrorMessage('NOT_FOUND')).toContain('não encontrado');
  });
  it('rede → "Sem conexão"; 401/403 → sessão/permissão; resto → genérico', () => {
    expect(kycErrorMessage('NETWORK')).toBe('Sem conexão. Tente novamente.');
    expect(kycErrorMessage(undefined, { httpStatus: 401 })).toContain('sessão');
    expect(kycErrorMessage(undefined, { httpStatus: 403 })).toContain('permissão');
    expect(kycErrorMessage('ALGO_NOVO')).toBe('Não foi possível concluir. Tente novamente.');
    expect(kycErrorMessage(undefined)).toBe('Não foi possível concluir. Tente novamente.');
  });
  it('nunca vaza o código técnico para o dono', () => {
    for (const c of ['INVALID_STATE', 'REASON_REQUIRED', 'KYC_CONFIG_INVALID', 'IDS_REQUIRED', 'NOT_FOUND', 'NETWORK', 'ALGO_NOVO']) {
      const m = kycErrorMessage(c, { status: 'pending' });
      expect(m).not.toContain(c);
      expect(m).not.toMatch(/[A-Z]{3,}_[A-Z]{3,}/);
    }
  });
});

describe('legacyApprovedNotice — aprovação em lote só mexe em quem ainda é legado', () => {
  it('todos aprovados', () => {
    expect(legacyApprovedNotice(1, 1)).toBe('1 médico antigo aprovado.');
    expect(legacyApprovedNotice(3, 3)).toBe('3 médicos antigos aprovados.');
  });
  it('alguns já tinham mudado (idempotência / outro admin)', () => {
    expect(legacyApprovedNotice(2, 3)).toBe('2 médicos antigos aprovados. 1 já tinha mudado de situação.');
    expect(legacyApprovedNotice(1, 4)).toBe('1 médico antigo aprovado. 3 já tinham mudado de situação.');
  });
  it('nenhum alterado → aviso, não erro', () => {
    expect(legacyApprovedNotice(0, 2)).toContain('Nenhum médico foi alterado');
  });
});

// ═══════════════════════════ PARTE 2 — telas (SSR) ═══════════════════════════

const theme = createTheme();
const darkTheme = createTheme({ palette: { mode: 'dark' } });
const shell = (el: ReactElement, t = theme) => renderToString(h(ThemeProvider, { theme: t }, el));
const noop = () => undefined;
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
/** Tag de abertura do <button> cujo conteúdo traz `text` (a ordem dos atributos do MUI não importa). */
const buttonTag = (html: string, text: string) => {
  const chunk = html.split('<button').slice(1).find((p) => p.slice(0, p.indexOf('</button>')).includes(text));
  return chunk ? `<button${chunk.slice(0, chunk.indexOf('>') + 1)}` : '';
};
const dateInputTag = (html: string) => html.match(/<input[^>]*type="date"[^>]*>/)?.[0] ?? '';

describe('IdentityChip — chip "Identidade: …" da lista de médicos', () => {
  it('mostra o rótulo por status e esconde quando o servidor não manda o campo', () => {
    expect(shell(h(IdentityChip, { status: 'approved' }))).toContain('Identidade: verificada');
    expect(shell(h(IdentityChip, { status: 'needs_admin' }))).toContain('Identidade: aguardando você');
    expect(shell(h(IdentityChip, { status: 'legacy' }))).toContain('Identidade: não verificada (antigo)');
    expect(shell(h(IdentityChip, {}))).not.toContain('Identidade');
    expect(shell(h(IdentityChip, { status: null }))).not.toContain('Identidade');
    expect(shell(h(IdentityChip, { status: 'status-novo' }))).not.toContain('Identidade');
  });
  it('renderiza nos dois temas', () => {
    expect(shell(h(IdentityChip, { status: 'rejected' }), darkTheme)).toContain('Identidade: recusada');
  });
});

describe('StatTiles — os 3 contadores', () => {
  it('rótulos do plano + números', () => {
    const html = shell(h(StatTiles, { counts: { waiting: 2, inUaiid: 1, legacy: 4 } }));
    expect(html).toContain('Aguardando você');
    expect(html).toContain('No painel do UaiID');
    expect(html).toContain('Médicos antigos sem verificação');
    expect(html).toMatch(/data-testid="kyc-count-waiting-n"[^>]*>2</);
    expect(html).toMatch(/data-testid="kyc-count-inUaiid-n"[^>]*>1</);
    expect(html).toMatch(/data-testid="kyc-count-legacy-n"[^>]*>4</);
  });
});

describe('NameCompare — nome no documento × nome no CFM, lado a lado', () => {
  it('nomes diferentes → só as palavras divergentes ficam destacadas, nos dois lados', () => {
    const html = shell(h(NameCompare, { documentName: 'MARIA APARECIDA DE OLIVEIRA SANTOS', cfmName: 'MARIA APARECIDA DE OLIVEIRA SOUZA' }));
    expect(html).toContain('Nome no documento');
    expect(html).toContain('Nome no CFM');
    expect(html).toContain('Nomes diferentes');
    expect(html).toMatch(/<mark[^>]*data-diff="true"[^>]*>SANTOS<\/mark>/);
    expect(html).toMatch(/<mark[^>]*data-diff="true"[^>]*>SOUZA<\/mark>/);
    expect(count(html, /data-diff="true"/g)).toBe(2);
    expect(html.indexOf('kyc-name-doc')).toBeLessThan(html.indexOf('kyc-name-cfm')); // documento à esquerda
  });
  it('nomes iguais (ignorando caixa/acento) → "Nomes conferem", sem destaque', () => {
    const html = shell(h(NameCompare, { documentName: 'João da Silva', cfmName: 'JOAO SILVA' }));
    expect(html).toContain('Nomes conferem');
    expect(html).not.toContain('data-diff="true"');
    expect(html).not.toContain('Nomes diferentes');
  });
  it('falta o nome do documento → explica e não finge comparar', () => {
    const html = shell(h(NameCompare, { documentName: null, cfmName: 'JOAO SILVA' }));
    expect(html).toContain('Não recebido do UaiID');
    expect(html).toContain('Sem como comparar');
    expect(html).toContain('JOAO');
  });
  it('mesmas palavras em outra ordem → avisa', () => {
    const html = shell(h(NameCompare, { documentName: 'SILVA JOAO', cfmName: 'JOAO SILVA' }));
    expect(html).toContain('Nomes diferentes');
    expect(html).toContain('outra ordem');
  });
});

describe('ReviewCard — caso da fila', () => {
  it('"Aguardando você": nome, CRM, e-mail, motivo, semelhança, score, tentativas anteriores e os 2 botões', () => {
    const item = review({
      reasonCode: 'name_mismatch', documentName: 'ANA LIMA SANTOS', cfmName: 'ANA LIMA SOUZA', nameRatio: 0.82, score: 71, priorAttempts: 2,
    });
    const html = shell(h(ReviewCard, { item, onApprove: noop, onReject: noop }));
    expect(html).toContain('data-decide-in="drexame"');
    expect(html).toContain('Maria Aparecida Santos');
    expect(html).toContain('CRM 123456-SP');
    expect(html).toContain('maria@clinica.com');
    expect(html).toContain('Aguardando você');
    expect(html).toContain('O nome do documento é diferente do nome no CFM');
    expect(html).toContain('Semelhança dos nomes');
    expect(html).toContain('82%');
    expect(html).toContain('Score do UaiID');
    expect(html).toMatch(/Score do UaiID<\/span>.{0,200}?>71</);
    expect(html).toContain('2 tentativas anteriores neste CRM');
    expect(html).toContain('Aprovar');
    expect(html).toContain('Recusar');
    expect(html).not.toContain(UAIID_DECIDE_NOTICE);
  });
  it('sem tentativas anteriores → sem alerta de tentativas', () => {
    const html = shell(h(ReviewCard, { item: review({ priorAttempts: 0 }), onApprove: noop, onReject: noop }));
    expect(html).not.toContain('tentativa');
    expect(html).toContain('Tudo conferiu'); // manual_policy
  });
  it('"No painel do UaiID": SEM botões de decisão, com o aviso do plano e o ID da verificação', () => {
    const item = review({ decideIn: 'uaiid', decision: 'uaiid_review', reasonCode: 'face_mismatch_review', documentName: null, providerId: 'ver_xyz789' });
    const html = shell(h(ReviewCard, { item, onApprove: noop, onReject: noop }));
    expect(html).toContain('data-decide-in="uaiid"');
    expect(html).toContain('No painel do UaiID');
    expect(html).toContain(UAIID_DECIDE_NOTICE);
    expect(html).toContain('ver_xyz789');
    expect(html).toContain('Não recebido do UaiID');
    expect(html).not.toContain('Aprovar');
    expect(html).not.toContain('Recusar');
  });
  it('tema escuro renderiza', () => {
    expect(shell(h(ReviewCard, { item: review(), onApprove: noop, onReject: noop }), darkTheme)).toContain('Maria Aparecida Santos');
  });
});

describe('ApproveForm — aprovar com observação opcional', () => {
  it('campo opcional que fica só na auditoria', () => {
    const html = shell(h(ApproveForm, { item: review(), note: '', onNote: noop }));
    expect(html).toContain('Observação (opcional)');
    expect(html).toContain('o médico não vê');
    expect(html).toContain('Maria Aparecida Santos');
    expect(html).toMatch(/maxlength="500"/i); // o servidor corta em 500
  });
  it('nomes divergentes ou tentativas anteriores → alerta antes de aprovar', () => {
    const item = review({ documentName: 'ANA SANTOS', cfmName: 'ANA SOUZA', priorAttempts: 1 });
    const html = shell(h(ApproveForm, { item, note: '', onNote: noop }));
    expect(html).toContain('ANA SANTOS');
    expect(html).toContain('ANA SOUZA');
    expect(html).toContain('1 tentativa anterior neste CRM');
  });
  it('nomes iguais e sem tentativas → sem alerta', () => {
    const html = shell(h(ApproveForm, { item: review(), note: '', onNote: noop }));
    expect(html).not.toContain('tentativa');
    expect(html).not.toContain('é diferente');
  });
  it('mostra o erro do servidor traduzido', () => {
    const html = shell(h(ApproveForm, { item: review(), note: '', onNote: noop, error: 'Sem conexão. Tente novamente.' }));
    expect(html).toContain('Sem conexão. Tente novamente.');
    expect(html).toContain('role="alert"');
  });
});

describe('RejectForm — o motivo vai por e-mail ao médico (R4)', () => {
  it('avisa ANTES do campo, oferece os 4 atalhos e limita a 500', () => {
    const html = shell(h(RejectForm, { item: review(), reason: '', onReason: noop }));
    expect(html).toContain(REJECT_EMAIL_NOTICE);
    expect(html.indexOf(REJECT_EMAIL_NOTICE)).toBeLessThan(html.indexOf('Motivo da recusa'));
    expect(html).toContain('Motivo da recusa');
    for (const s of REJECT_SHORTCUTS) expect(html).toContain(s);
    expect(html).toMatch(/maxlength="500"/i);
    expect(html).toContain('0/500');
    expect(html).toContain('kyc-reject-notice'); // aria-describedby do campo aponta p/ o aviso
  });
  it('contador acompanha o texto; erro aparece com role=alert', () => {
    const html = shell(h(RejectForm, { item: review(), reason: 'Documento ilegível', onReason: noop, error: kycErrorMessage('REASON_REQUIRED') }));
    expect(html).toContain('18/500');
    expect(html).toContain('Escreva o motivo da recusa');
    expect(html).toContain('role="alert"');
  });
});

describe('LegacySection — médicos antigos + prazo', () => {
  const NOW = new Date(2026, 9, 29, 12, 0).getTime();
  const grace = new Date(2026, 10, 15, 23, 59, 59, 999).getTime();
  const base = {
    legacy: [legacy(1), legacy(2), legacy(3)], selected: new Set<string>(), onToggle: noop, onToggleAll: noop, onApproveSelected: noop,
    graceMs: 0 as number | null, graceDraft: null as string | null, onGraceDraft: noop, onGraceSave: noop, onGraceClear: noop, graceError: null as string | null,
    busy: false, now: NOW,
  };

  it('lista os médicos antigos com CRM, e-mail e seleção', () => {
    const html = shell(h(LegacySection, { ...base, selected: new Set(['l1', 'l2']) }));
    expect(html).toContain('Médicos antigos');
    expect(count(html, /data-testid="kyc-legacy-row"/g)).toBe(3);
    expect(html).toContain('Dr. Antigo 1');
    expect(html).toContain('CRM 101-MG');
    expect(html).toContain('antigo1@med.com');
    expect(html).toContain('Aprovar selecionados (2)');
    expect(html).toContain('Selecionar todos');
  });
  it('nada selecionado → "Aprovar selecionados" desabilitado, sem contador; com seleção → habilitado', () => {
    const html = shell(h(LegacySection, base));
    expect(buttonTag(html, 'Aprovar selecionados')).toContain('disabled=""');
    expect(html).not.toContain('Aprovar selecionados (');
    const sel = shell(h(LegacySection, { ...base, selected: new Set(['l3']) }));
    expect(buttonTag(sel, 'Aprovar selecionados (1)')).not.toContain('disabled');
  });
  it('prazo: valor atual (data), "Prazo atual", mínimo = hoje, aviso do efeito', () => {
    const html = shell(h(LegacySection, { ...base, graceMs: grace }));
    expect(html).toContain('Prazo para médicos antigos');
    expect(html).toContain('value="2026-11-15"');
    expect(html).toContain('min="2026-10-29"');
    expect(html).toContain('Prazo atual: até 15/11/2026');
    expect(html).toContain('deixam de atender');
    expect(html).toContain('Remover prazo');
  });
  it('sem prazo → "Prazo atual: sem prazo" e sem botão de remover', () => {
    const html = shell(h(LegacySection, base));
    expect(html).toContain('Prazo atual: sem prazo');
    expect(html).not.toContain('Remover prazo');
  });
  it('configuração indisponível (GET falhou) → campo travado e aviso', () => {
    const html = shell(h(LegacySection, { ...base, graceMs: null }));
    expect(html).toContain('indisponível');
    expect(dateInputTag(html)).toContain('disabled=""');
    expect(dateInputTag(shell(h(LegacySection, base)))).not.toContain('disabled');
  });
  it('rascunho do campo vence o valor salvo; erro de validação aparece', () => {
    const html = shell(h(LegacySection, { ...base, graceMs: grace, graceDraft: '2026-12-01', graceError: 'Escolha uma data futura.' }));
    expect(html).toContain('value="2026-12-01"');
    expect(html).toContain('Escolha uma data futura.');
  });
  it('sem médicos antigos → estado vazio (o prazo continua acessível)', () => {
    const html = shell(h(LegacySection, { ...base, legacy: [] }));
    expect(html).toContain('Nenhum médico antigo sem verificação');
    expect(html).toContain('Prazo para médicos antigos');
    expect(count(html, /data-testid="kyc-legacy-row"/g)).toBe(0);
  });
});

describe('DoctorVerificationPanel — casca', () => {
  it('render inicial: título e carregando (o fetch roda no efeito, fora do SSR)', () => {
    const html = shell(h(DoctorVerificationPanel, {}));
    expect(html).toContain('Verificação de identidade');
    expect(html).toContain('role="progressbar"');
  });
  it('NUNCA expõe autoApprove nem o texto de aprovação automática (política: sempre revisão humana)', () => {
    const src = readFileSync(new URL('./DoctorVerificationPanel.tsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/autoApprove/i);
    const html = shell(h(DoctorVerificationPanel, {}));
    expect(html).not.toMatch(/auto-?aprova|aprovação automática/i);
  });
  it('não usa reload/navigate(0) (crasha o APK)', () => {
    const src = readFileSync(new URL('./DoctorVerificationPanel.tsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/location\.reload|navigate\(0\)/);
  });
});
