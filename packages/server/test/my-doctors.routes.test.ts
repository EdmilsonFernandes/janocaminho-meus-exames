import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, createDoctor } from './helpers';
import { prisma } from '../src/prisma';

// §1 "Meus médicos" (28/10/26): vínculo PRIVADO paciente↔médico. Contratos críticos:
// salvar NÃO concede acesso (share é ato separado); remover vínculo não apaga cadastro
// público nem revoga share; isolamento total entre contas; expiração do share (§6).

describe('my-doctors: vínculo privado (§1)', () => {
  beforeEach(async () => { await resetDb(); });

  it('salvar por CRM+nome cria pending + vínculo SEM share, sem cobrar e é idempotente', async () => {
    const { user, token } = await createUser({ credits: 50 });
    const r1 = await api().post('/api/my-doctors').set(authHeader(token))
      .send({ doctorName: 'Dra Ana Souza', doctorCrm: '11111', doctorUf: 'SP', doctorSpecialty: 'Cardiologista' });
    expect(r1.status).toBe(201);
    expect(r1.body.created).toBe(true);

    // §1: "Adicionar um médico à lista não concede acesso aos exames"
    expect(await prisma.doctorShare.count({ where: { patient: { ownerId: user.id } } })).toBe(0);
    expect((await prisma.user.findUnique({ where: { id: user.id }, select: { credits: true } }))!.credits).toBe(50);

    // idempotente: 2º POST = mesmo vínculo (unique patientId+doctorId)
    const r2 = await api().post('/api/my-doctors').set(authHeader(token))
      .send({ doctorName: 'Dra Ana Souza', doctorCrm: '11111', doctorUf: 'SP' });
    expect(r2.status).toBe(200);
    expect(r2.body.created).toBe(false);
    expect(await prisma.patientDoctorLink.count({ where: { patient: { ownerId: user.id } } })).toBe(1);
  });

  it('sem CRM e sem doctorId → 400 (dedupe do diretório público é CRM/UF, §5)', async () => {
    const { token } = await createUser({});
    const r = await api().post('/api/my-doctors').set(authHeader(token)).send({ doctorName: 'Dr Sem CRM' });
    expect(r.status).toBe(400);
  });

  it('V1.1: salvar manual com cidade enriquece o diretório — e NÃO sobrescreve o médico', async () => {
    const { token } = await createUser({});
    await api().post('/api/my-doctors').set(authHeader(token))
      .send({ doctorName: 'Dr Local', doctorCrm: '90909', doctorUf: 'SP', clinicCity: 'São José dos Campos' });
    const novo = await prisma.doctor.findUnique({ where: { crm: '90909-SP' } });
    expect(novo?.clinicCity).toBe('São José dos Campos'); // entra na busca "perto de você"

    // médico que JÁ publicou cidade (portal) prevalece — paciente não sobrescreve
    const claimed = await prisma.doctor.create({
      data: { name: 'Dr Portal', crm: '80808-SP', email: 'portal@exemplo.com', passwordHash: 'hash-real', clinicCity: 'Campinas' },
    });
    await api().post('/api/my-doctors').set(authHeader(token)).send({ doctorId: claimed.id, clinicCity: 'Guarulhos' });
    const depois = await prisma.doctor.findUnique({ where: { id: claimed.id } });
    expect(depois?.clinicCity).toBe('Campinas');
  });

  it('GET mergeia: vínculo+share (state) e share órfão (legado, linked=false)', async () => {
    const { patient, token } = await createUser({ credits: 100 });
    // fluxo novo: compartilhar cria share E vínculo
    await api().post('/api/doctor-shares').set(authHeader(token))
      .send({ doctorName: 'Dr Compartilhado', doctorCrm: '22222', doctorUf: 'SP', scopes: ['exams'] });
    // legado: share criado direto no banco, SEM vínculo
    const orphan = await prisma.doctor.create({
      data: { name: 'Dr Legado', crm: '33333-SP', email: 'orphan@invite.com', passwordHash: 'pending-invite' },
    });
    await prisma.doctorShare.create({
      data: { patientId: patient.id, doctorId: orphan.id, scopes: ['exams'] },
    });

    const r = await api().get('/api/my-doctors').set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(2);
    const linked = r.body.items.find((i: any) => i.linked);
    expect(linked.share.state).toBe('active');
    const orphanItem = r.body.items.find((i: any) => !i.linked);
    expect(orphanItem.doctor.name).toBe('Dr Legado');
    expect(orphanItem.share.state).toBe('active');
  });

  it('PATCH grava notas particulares; DELETE remove vínculo SEM apagar cadastro nem share', async () => {
    const { token } = await createUser({});
    const r1 = await api().post('/api/my-doctors').set(authHeader(token))
      .send({ doctorName: 'Dra Notas', doctorCrm: '44444', doctorUf: 'RJ' });
    const linkId = r1.body.item.id;
    // cria share (também não pode ser afetado pelo DELETE do vínculo)
    await api().post('/api/doctor-shares').set(authHeader(token))
      .send({ doctorName: 'Dra Notas', doctorCrm: '44444', doctorUf: 'RJ', scopes: ['exams'] });

    const rp = await api().patch(`/api/my-doctors/${linkId}`).set(authHeader(token)).send({ patientNotes: 'Atende bem, sala 12' });
    expect(rp.status).toBe(200);
    expect(rp.body.item.patientNotes).toBe('Atende bem, sala 12');

    const rd = await api().delete(`/api/my-doctors/${linkId}`).set(authHeader(token));
    expect(rd.status).toBe(200);
    expect(rd.body.shareStillActive).toBe(true); // avisa o front: acesso segue valendo
    expect(await prisma.patientDoctorLink.count()).toBe(0);
    expect(await prisma.doctorShare.count()).toBe(1); // share intacto
    expect(await prisma.doctor.count()).toBe(1); // cadastro público intacto
  });

  it('isolamento: conta B não vê/edita/remove vínculo da conta A', async () => {
    const a = await createUser({});
    const rb = await api().post('/api/my-doctors').set(authHeader(a.token))
      .send({ doctorName: 'Dr Privado', doctorCrm: '55555', doctorUf: 'MG' });
    const linkId = rb.body.item.id;

    const b = await createUser({});
    expect((await api().get('/api/my-doctors').set(authHeader(b.token))).body.items).toHaveLength(0);
    expect((await api().patch(`/api/my-doctors/${linkId}`).set(authHeader(b.token)).send({ patientNotes: 'hack' })).status).toBe(404);
    expect((await api().delete(`/api/my-doctors/${linkId}`).set(authHeader(b.token))).status).toBe(404);
    expect(await prisma.patientDoctorLink.count()).toBe(1); // nada foi alterado
  });

  it('§6 expiração: share expirado = state "expired" na lista E porta fechada no portal', async () => {
    const { token } = await createUser({});
    const { doctor, token: docToken } = await createDoctor({ crm: '66666-SP', specialty: 'Cardiologista' });
    await api().post('/api/doctor-shares').set(authHeader(token)).send({
      doctorName: doctor.name, doctorCrm: '66666', doctorUf: 'SP', scopes: ['exams'],
      expiresAt: new Date(Date.now() - 60_000).toISOString(), // já expirado
    });

    // lista do paciente marca "expired" (não "active")
    const r = await api().get('/api/my-doctors').set(authHeader(token));
    expect(r.body.items[0].share.state).toBe('expired');

    // gate do portal: médico NÃO vê mais o paciente (where OR expiresAt gt now)
    const rp = await api().get('/api/doctor/patients').set(authHeader(docToken));
    const list = Array.isArray(rp.body) ? rp.body : rp.body.patients ?? rp.body.items ?? [];
    expect(list).toHaveLength(0);

    // gate das perguntas: share expirado não autoriza pergunta (403)
    const rq = await api().post('/api/doctor-questions').set(authHeader(token))
      .send({ doctorId: doctor.id, subject: 'Posso perguntar?' });
    expect(rq.status).toBe(403);
  });
});
