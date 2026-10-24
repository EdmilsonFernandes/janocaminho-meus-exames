// E2E (supertest) — §14.1 Resumo pós-consulta (24/10): IA gera RASCUNHO, médico
// edita/aprova, paciente só lê a versão APROVADA. Padrões do teleconsulta-doctor-note.
// LLM mockado (padrão decifre.test.ts): JSON via prompt + extractJsonObject — o relay
// nunca suporta structured output (ver docs/AI_PROVIDERS.md).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '../src/prisma';
import { api, createUser, createDoctor, resetDb, authHeader } from './helpers';
import { encryptPII } from '../src/utils/crypto';

const H2 = (t: string) => ({ Authorization: `Bearer ${t}` });

// Mock do provedor de IA: estado controlável (sucesso/falha) + captura do prompt.
const llmState = vi.hoisted(() => ({ fail: false, calls: 0, lastUserPrompt: '', text: '## Motivo da consulta\nAvaliação de exames.\n## Retorno e pendências\nRetorno em 30 dias.' }));
vi.mock('../src/llm', () => ({
  getModel: () => 'mock-model',
  getLlm: () => ({
    name: 'mock',
    complete: async (_req: any) => {
      llmState.calls++;
      if (llmState.fail) throw new Error('relay 429 simulado');
      llmState.lastUserPrompt = String(_req?.messages?.[0]?.content ?? '');
      return { text: JSON.stringify({ summaryMd: llmState.text }) };
    },
    stream: async () => { throw new Error('não usado'); },
  }),
}));

/** Médicos únicos por seed (CRM + email são UNIQUE em doctors — seed 2x no mesmo
 *  teste não pode reusar as credenciais). */
let seedN = 0;

async function seedTeleconsulta(opts: { ended?: boolean } = {}) {
  seedN += 1;
  const { user, patient, token } = await createUser();
  const crm = `91${String(400 + seedN).padStart(3, '0')}-SP`;
  const { token: docToken } = await createDoctor({ crm, email: `sumdoc${seedN}@t.com` });
  await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: crm, scopes: ['exams'], patientId: patient.id });

  // Transcript CIFRADO (igual produção) — o prompt da IA recebe o texto decifrado.
  const enc = encryptPII('Paciente relatou tontura ao levantar. Médico orientou aumentar hidratação.');
  const r = await prisma.reminder.create({
    data: {
      ownerId: user.id, patientId: patient.id, title: 'Avaliação de exames de rotina',
      dueDate: new Date(Date.now() - 3600_000), type: 'teleconsulta', consentAt: new Date(),
      provider: 'livekit', roomName: 'teleconsulta-sum-1',
      ...(opts.ended ? { endedAt: new Date(), done: true, teleStatus: 'completed' } : {}),
      doctorNote: 'Reavaliar pressão em 7 dias.',
      ...(enc ? { transcriptEnc: enc.enc, transcriptIv: enc.iv, transcriptAt: new Date() } : {}),
    },
    select: { id: true },
  });
  // Exame EXTRAÍDO compartilhado (share sem examIds = todos) + 1 item alterado.
  await prisma.exam.create({
    data: {
      patientId: patient.id, title: 'Hemograma completo', filePath: 'x', fileSha256: `sha-${r.id}`,
      status: 'EXTRACTED', performedAt: new Date('2026-10-01T09:00:00Z'),
      items: { create: [{ name: 'HEMOGLOBINA', nameCanonical: 'HEMOGLOBINA', valueNumeric: 10.1, unit: 'g/dL', refLow: 12, refHigh: 16, isAbnormal: true, flag: 'LOW', extractedPage: 1 }] },
    },
    select: { id: true },
  });
  return { user, patient, token, docToken, r };
}

/** Médico SEM share (403 do loadEndedTeleconsultaForDoctor). */
async function seedDoctorSemShare() {
  seedN += 1;
  const { token: docToken } = await createDoctor({ crm: `91${String(500 + seedN).padStart(3, '0')}-SP`, email: `noshare${seedN}@t.com` });
  return docToken;
}

describe('Resumo pós-consulta (§14.1) — generate/edit/approve', () => {
  beforeEach(async () => {
    await resetDb();
    llmState.fail = false;
    llmState.calls = 0;
    llmState.lastUserPrompt = '';
  });

  it('médico gera rascunho (draft) — paciente NÃO lê; médico lê; prompt usa dados autorizados', async () => {
    const { patient, token, docToken, r } = await seedTeleconsulta({ ended: true });
    const gen = await api().post(`/api/teleconsulta/${r.id}/summary/generate`).set(H2(docToken));
    expect(gen.status).toBe(200);
    expect(gen.body.status).toBe('draft');
    expect(gen.body.draftMd).toContain('Retorno em 30 dias');
    expect(gen.body.version).toBe(1);
    expect(gen.body.revisions[0].kind).toBe('generate');

    // Prompt: motivo + doctorNote + transcript DECIFRADO + exame do share com data.
    expect(llmState.lastUserPrompt).toContain('Avaliação de exames de rotina');
    expect(llmState.lastUserPrompt).toContain('Reavaliar pressão em 7 dias.');
    expect(llmState.lastUserPrompt).toContain('tontura ao levantar');
    expect(llmState.lastUserPrompt).toContain('Hemograma completo');
    expect(llmState.lastUserPrompt).toContain('1 item(ns) alterado(s)');
    expect(patient.id).toBeTruthy();

    // PACIENTE: /summary (área pós-chamada) NÃO devolve o rascunho (nunca vaza).
    const sumPat = await api().get(`/api/teleconsulta/${r.id}/summary`).set(authHeader(token));
    expect(sumPat.status).toBe(200);
    expect(sumPat.body.consultSummary).toBeNull();

    // MÉDICO: vê o rascunho completo no mesmo endpoint.
    const sumDoc = await api().get(`/api/teleconsulta/${r.id}/summary`).set(H2(docToken));
    expect(sumDoc.status).toBe(200);
    expect(sumDoc.body.consultSummary?.status).toBe('draft');
    expect(sumDoc.body.consultSummary?.draftMd).toContain('Retorno em 30 dias');
  });

  it('permissões: paciente 401 no generate; consulta aberta → 400; médico sem share → 403; sem auth → 401', async () => {
    const { token, docToken, r } = await seedTeleconsulta({ ended: true });
    expect((await api().post(`/api/teleconsulta/${r.id}/summary/generate`).set(authHeader(token))).status).toBe(401);
    expect((await api().post(`/api/teleconsulta/${r.id}/summary/generate`)).status).toBe(401);

    const noShare = await seedDoctorSemShare();
    expect((await api().post(`/api/teleconsulta/${r.id}/summary/generate`).set(H2(noShare))).status).toBe(403);

    const aberta = await seedTeleconsulta({ ended: false });
    const res = await api().post(`/api/teleconsulta/${aberta.r.id}/summary/generate`).set(H2(aberta.docToken));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CONSULTA_NAO_ENCERRADA');
  });

  it('approve → paciente vê (com médico e data); editar draft NÃO mexe no aprovado; version/revisions rastreáveis', async () => {
    const { token, docToken, r } = await seedTeleconsulta({ ended: true });
    await api().post(`/api/teleconsulta/${r.id}/summary/generate`).set(H2(docToken));
    const appr = await api().post(`/api/teleconsulta/${r.id}/summary/approve`).set(H2(docToken));
    expect(appr.status).toBe(200);
    expect(appr.body.status).toBe('approved');
    expect(appr.body.summaryMd).toContain('Retorno em 30 dias');
    expect(appr.body.approvedAt).toBeTruthy();
    expect(appr.body.approvedBy?.name).toBeTruthy();

    // Paciente vê a versão aprovada (summaryMd + quem aprovou).
    const sumPat = await api().get(`/api/teleconsulta/${r.id}/summary`).set(authHeader(token));
    expect(sumPat.body.consultSummary?.status).toBe('approved');
    expect(sumPat.body.consultSummary?.summaryMd).toContain('Retorno em 30 dias');
    expect(sumPat.body.consultSummary?.draftMd).toBeUndefined(); // rascunho não vaza

    // Médico EDITA o rascunho (nova versão) → aprovado anterior intacto pro paciente.
    const edit = await api().put(`/api/teleconsulta/${r.id}/summary`).set(H2(docToken)).send({ draftMd: '## Motivo\nEdição do médico após aprovar.' });
    expect(edit.status).toBe(200);
    expect(edit.body.draftMd).toContain('Edição do médico');
    expect(edit.body.summaryMd).toContain('Retorno em 30 dias'); // aprovado intocado

    const sumPat2 = await api().get(`/api/teleconsulta/${r.id}/summary`).set(authHeader(token));
    expect(sumPat2.body.consultSummary?.summaryMd).toContain('Retorno em 30 dias'); // paciente continua na versão aprovada

    // 2ª aprovação → summaryMd atualiza, version incrementa, histórico completo.
    const appr2 = await api().post(`/api/teleconsulta/${r.id}/summary/approve`).set(H2(docToken));
    expect(appr2.body.version).toBeGreaterThanOrEqual(4); // generate(1) + approve(2) + draft(3) + approve(4)
    expect(appr2.body.summaryMd).toContain('Edição do médico');
    const kinds = appr2.body.revisions.map((x: any) => x.kind);
    expect(kinds).toEqual(expect.arrayContaining(['generate', 'approve', 'draft', 'approve']));

    const sumPat3 = await api().get(`/api/teleconsulta/${r.id}/summary`).set(authHeader(token));
    expect(sumPat3.body.consultSummary?.summaryMd).toContain('Edição do médico');
  });

  it('regenerate NÃO duplica (upsert, 1 row) e falha de LLM → 503 SEM perder draft anterior', async () => {
    const { docToken, r } = await seedTeleconsulta({ ended: true });
    await api().post(`/api/teleconsulta/${r.id}/summary/generate`).set(H2(docToken));
    const again = await api().post(`/api/teleconsulta/${r.id}/summary/generate`).set(H2(docToken));
    expect(again.status).toBe(200);
    expect(again.body.version).toBe(2);
    expect(await prisma.consultSummary.count({ where: { reminderId: r.id } })).toBe(1);

    // Falha do provedor: 503 (retry) e o draft anterior preservado no banco.
    llmState.fail = true;
    const fail = await api().post(`/api/teleconsulta/${r.id}/summary/generate`).set(H2(docToken));
    expect(fail.status).toBe(503);
    expect(fail.body.code).toBe('SUMMARY_LLM_FAILED');
    const row = await prisma.consultSummary.findUnique({ where: { reminderId: r.id } });
    expect(row?.draftMd).toContain('Retorno em 30 dias');
    expect(row?.version).toBe(2); // falha não incrementa nada

    llmState.fail = false;
    const retry = await api().post(`/api/teleconsulta/${r.id}/summary/generate`).set(H2(docToken));
    expect(retry.status).toBe(200);
    expect(retry.body.version).toBe(3);
  });

  it('approve/edit sem rascunho → 400/404; aprovar NÃO muda teleStatus da consulta', async () => {
    const { docToken, r } = await seedTeleconsulta({ ended: true });
    expect((await api().post(`/api/teleconsulta/${r.id}/summary/approve`).set(H2(docToken))).status).toBe(400);
    expect((await api().put(`/api/teleconsulta/${r.id}/summary`).set(H2(docToken)).send({ draftMd: 'x' })).status).toBe(404);

    await api().post(`/api/teleconsulta/${r.id}/summary/generate`).set(H2(docToken));
    await api().post(`/api/teleconsulta/${r.id}/summary/approve`).set(H2(docToken));
    const rem = await prisma.reminder.findUnique({ where: { id: r.id }, select: { teleStatus: true, endedAt: true } });
    expect(rem?.teleStatus).toBe('completed'); // §14.2: aprovar resumo ≠ mudar outcome
    expect(rem?.endedAt).toBeTruthy();
  });

  it('lista do médico (/doctor/teleconsultas) e do paciente (/reminders) expõem o status', async () => {
    const { token, docToken, r } = await seedTeleconsulta({ ended: true });
    await api().post(`/api/teleconsulta/${r.id}/summary/generate`).set(H2(docToken));

    const listDoc = await api().get('/api/doctor/teleconsultas').set(H2(docToken));
    const item = listDoc.body.items.find((i: any) => i.id === r.id);
    expect(item?.consultSummary?.status).toBe('draft');

    let listPat = await api().get('/api/reminders').set(authHeader(token));
    let patItem = (listPat.body as any[]).find((i) => i.id === r.id);
    expect(patItem?.consultSummaryApproved).toBe(false); // draft ≠ visível

    await api().post(`/api/teleconsulta/${r.id}/summary/approve`).set(H2(docToken));
    listPat = await api().get('/api/reminders').set(authHeader(token));
    patItem = (listPat.body as any[]).find((i) => i.id === r.id);
    expect(patItem?.consultSummaryApproved).toBe(true);
  });
});
