import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, createDoctor, createExam } from './helpers';

const docH = (t: string) => ({ Authorization: `Bearer ${t}` });
import { prisma } from '../src/prisma';
import { notifyNewExamShares } from '../src/extraction/share-notify';

// §4 do spec de teleconsulta (24/10): exame novo × compartilhamento.
// Causa raiz: o portal filtra exames por share.examIds (vazio = TODOS). Share "todos"
// já cobre exames novos; share POR-EXAME congela o recorte → novo exame invisível ao
// médico até o paciente agir. Fluxo novo: prompt in-app 1x por exame + 1 toque adiciona
// só o exame ao share (POST /doctor-shares/:id/exams). Revogação bloqueia no server.
describe('exame novo × share (§4 spec teleconsulta)', () => {
  beforeEach(async () => { await resetDb(); });

  it('share "todos" (examIds vazio): exame novo entra sozinho e SEM prompt', async () => {
    const { token: docToken } = await createDoctor({ name: 'Dr Todos', crm: '111-SP', email: 'todos@t.com' });
    const { user, patient, token } = await createUser({ credits: 100 });
    const share = await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: '111-SP', scopes: ['exams'] });
    expect(share.status).toBe(201);
    expect(share.body.share.examIds).toEqual([]);

    const exam = await createExam(patient.id, { sha: 'sha-todos' });
    await prisma.exam.update({ where: { id: exam.id }, data: { extractedAt: new Date() } });

    // médico vê o novo SEM re-compartilhar
    const exams = await api().get(`/api/doctor/patients/${patient.id}/exams`).set(docH(docToken));
    expect(exams.status).toBe(200);
    expect(exams.body.items.some((e: any) => e.id === exam.id)).toBe(true);

    // share "todos" não gera prompt (nada a decidir — já compartilhado por definição)
    await notifyNewExamShares(patient.id, user.id, exam.id, exam.title);
    expect(await prisma.notification.count({ where: { userId: user.id, type: 'share_exam_prompt' } })).toBe(0);
  });

  it('share POR-EXAME: novo invisível → prompt 1x (dedup) → 1 toque adiciona → médico vê', async () => {
    const { token: docToken } = await createDoctor({ name: 'Dr Parcial', crm: '222-SP', email: 'parcial@t.com' });
    const { user, patient, token } = await createUser({ credits: 100 });
    const examOld = await createExam(patient.id, { sha: 'sha-old' });
    const examNew = await createExam(patient.id, { sha: 'sha-new' });
    await prisma.exam.updateMany({ where: { id: { in: [examOld.id, examNew.id] } }, data: { extractedAt: new Date() } });

    const share = await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: '222-SP', scopes: ['exams'], examIds: [examOld.id] });
    expect(share.status).toBe(201);

    // causa raiz reproduzida: recorte congelado — o novo NÃO aparece pro médico
    const before = await api().get(`/api/doctor/patients/${patient.id}/exams`).set(docH(docToken));
    expect(before.body.items.some((e: any) => e.id === examOld.id)).toBe(true);
    expect(before.body.items.some((e: any) => e.id === examNew.id)).toBe(false);

    // extração do novo dispara o prompt in-app pro paciente
    await notifyNewExamShares(patient.id, user.id, examNew.id, examNew.title);
    const nots = await prisma.notification.findMany({ where: { userId: user.id, type: 'share_exam_prompt' } });
    expect(nots.length).toBe(1);
    expect((nots[0].data as any)?.examId).toBe(examNew.id);
    expect((nots[0].data as any)?.shareId).toBe(share.body.share.id);

    // anti-spam: reprocessar não duplica (1x por exame × share)
    await notifyNewExamShares(patient.id, user.id, examNew.id, examNew.title);
    expect(await prisma.notification.count({ where: { userId: user.id, type: 'share_exam_prompt' } })).toBe(1);

    // 1 toque (endpoint da notificação): adiciona SÓ este exame ao share
    const add = await api().post(`/api/doctor-shares/${share.body.share.id}/exams`).set(authHeader(token)).send({ examId: examNew.id });
    expect(add.status).toBe(200);
    expect(add.body.share.examIds).toContain(examNew.id);

    // agora o médico vê o novo sem re-compartilhar tudo
    const after = await api().get(`/api/doctor/patients/${patient.id}/exams`).set(docH(docToken));
    expect(after.body.items.some((e: any) => e.id === examNew.id)).toBe(true);

    // idempotente: repetir o toque não duplica o examId
    const add2 = await api().post(`/api/doctor-shares/${share.body.share.id}/exams`).set(authHeader(token)).send({ examId: examNew.id });
    expect(add2.status).toBe(200);
    expect(add2.body.share.examIds.filter((x: string) => x === examNew.id).length).toBe(1);
  });

  it('endpoint 1-toque: exame de outro paciente → 404; share revogado → 409 + leitura bloqueada', async () => {
    const { token: docToken } = await createDoctor({ name: 'Dr Revoga', crm: '333-SP', email: 'revoga@t.com' });
    const { patient, token } = await createUser({ credits: 100, email: 'pac-a@t.com' });
    const { patient: otherPatient } = await createUser({ email: 'pac-b@t.com' });
    const mine = await createExam(patient.id, { sha: 'sha-mine' });
    const foreign = await createExam(otherPatient.id, { sha: 'sha-foreign' });
    await prisma.exam.updateMany({ where: { id: { in: [mine.id, foreign.id] } }, data: { extractedAt: new Date() } });

    const share = await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: '333-SP', scopes: ['exams'], examIds: [mine.id] });
    expect(share.status).toBe(201);

    // exame de outro paciente não entra no meu share
    const bad = await api().post(`/api/doctor-shares/${share.body.share.id}/exams`).set(authHeader(token)).send({ examId: foreign.id });
    expect(bad.status).toBe(404);
    expect((await prisma.doctorShare.findUnique({ where: { id: share.body.share.id } }))?.examIds).not.toContain(foreign.id);

    // revogação: bloqueia o 1-toque E a leitura no server (§4.2 — share ativo obrigatório)
    await api().patch(`/api/doctor-shares/${share.body.share.id}`).set(authHeader(token)).send({ active: false });
    const addRevoked = await api().post(`/api/doctor-shares/${share.body.share.id}/exams`).set(authHeader(token)).send({ examId: mine.id });
    expect(addRevoked.status).toBe(409);
    const examsAfterRevoke = await api().get(`/api/doctor/patients/${patient.id}/exams`).set(docH(docToken));
    expect(examsAfterRevoke.status).toBe(403);
  });
});
