import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser } from './helpers';
import { prisma } from '../src/prisma';

// §3/§5 "Encontrar especialistas" (28/10/26): busca no DIRETÓRIO PRÓPRIO (zero
// integração paga). Contratos: médico bloqueado nunca aparece; provenance distingue
// dados do portal (confirmado) vs cadastro de pacientes; filtro por convênio usa
// doctor_insurances; claimed ordena primeiro.

let seq = 0;
async function mkDoctor(opts: {
  claimed?: boolean; blocked?: boolean; specialty?: string; city?: string; clinic?: string; crm?: string; price?: number | null;
} = {}) {
  seq += 1;
  const crm = opts.crm ?? `${80000 + seq}-SP`;
  return prisma.doctor.create({
    data: {
      name: `Dr Teste ${seq}`,
      crm,
      crmUf: 'SP',
      specialty: opts.specialty ?? 'Cardiologista',
      clinicName: opts.clinic ?? null,
      clinicCity: opts.city ?? null,
      consultPriceCents: opts.price === undefined ? null : opts.price,
      email: `spec-${seq}@invite.com`,
      passwordHash: opts.blocked ? 'pending-invite' : (opts.claimed ? 'real-hash' : 'pending-invite'),
      ...(opts.blocked ? { blocked: true, blockedReason: 'teste' } : {}),
    },
  });
}

describe('specialists: busca no diretório próprio (§3)', () => {
  beforeEach(async () => { await resetDb(); });

  it('filtra por especialidade e cidade; médico bloqueado nunca aparece', async () => {
    const { token } = await createUser({});
    await mkDoctor({ claimed: true, specialty: 'Cardiologista', city: 'São José dos Campos' });
    await mkDoctor({ specialty: 'Dermatologista', city: 'São José dos Campos' });
    await mkDoctor({ claimed: true, specialty: 'Cardiologista', city: 'Campinas' });
    await mkDoctor({ specialty: 'Cardiologista', city: 'São José dos Campos', blocked: true });

    const r = await api().get('/api/specialists?specialty=Cardiologista&city=São José dos Campos').set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0].claimed).toBe(true);
  });

  it('busca por texto alcança nome e clínica; claimed ordena antes dos pending', async () => {
    const { token } = await createUser({});
    await mkDoctor({ claimed: true, clinic: 'Clínica Coração SJC' });
    const pending = await mkDoctor({});
    await prisma.doctor.update({ where: { id: pending.id }, data: { name: 'Dr Coração Jr' } });

    const r = await api().get('/api/specialists?q=coração').set(authHeader(token));
    expect(r.body.items).toHaveLength(2);
    expect(r.body.items[0].claimed).toBe(true); // dados publicados pelo médico primeiro
    expect(r.body.items[1].claimed).toBe(false);
  });

  it('provenance distingue portal (confirmado) de cadastro de pacientes', async () => {
    const { token } = await createUser({});
    await mkDoctor({ claimed: true });
    await mkDoctor({});

    const r = await api().get('/api/specialists').set(authHeader(token));
    const byClaim = new Map(r.body.items.map((i: any) => [i.claimed, i]));
    expect(byClaim.get(true).provenance.source).toBe('portal_do_medico');
    expect(byClaim.get(false).provenance.source).toBe('cadastro_pacientes');
    expect(byClaim.get(false).provenance.label).toContain('confirme');
  });

  it('filtro por operadora/plano usa doctor_insurances e carrega verificationLabel (§5)', async () => {
    const { token } = await createUser({});
    const comUnimed = await mkDoctor({ claimed: true });
    await mkDoctor({});
    await prisma.doctorInsurance.create({
      data: { doctorId: comUnimed.id, operator: 'Unimed', plan: 'Nacional', verificationStatus: 'confirmed', source: 'portal', verifiedAt: new Date() },
    });

    const r = await api().get('/api/specialists?operator=unimed&plan=nacional').set(authHeader(token));
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0].id).toBe(comUnimed.id);
    expect(r.body.items[0].insurances[0].verificationStatus).toBe('confirmed');
    expect(r.body.items[0].insurances[0].verificationLabel).toContain('Confirmado');

    // plano diferente da aceitação registrada não casa (aceitar operadora ≠ todos os planos)
    const rPlan = await api().get('/api/specialists?operator=unimed&plan=estadual').set(authHeader(token));
    expect(rPlan.body.items).toHaveLength(0);
  });

  it('sem auth → 401 (busca é do paciente logado, não pública)', async () => {
    expect((await api().get('/api/specialists')).status).toBe(401);
  });

  it('V1.1 "perto de você": cidade SEM acento casa com acentuada + facets de cidade', async () => {
    const { token } = await createUser({});
    await mkDoctor({ claimed: true, city: 'São José dos Campos' });
    await mkDoctor({ city: 'Campinas' });

    const r = await api().get('/api/specialists?city=sao jose').set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0].clinicCity).toBe('São José dos Campos');

    // facets: cidades que TÊM médico no diretório, com contagem
    const sjc = r.body.cities.find((c: any) => c.city.includes('José'));
    expect(sjc?.count).toBe(1);
    expect(r.body.cities.some((c: any) => c.city === 'Campinas')).toBe(true);
  });

  it('V1.1: cidade sem resultado devolve cityNote honesta (não é dead-end)', async () => {
    const { token } = await createUser({});
    await mkDoctor({ city: 'Campinas' });
    const r = await api().get('/api/specialists?city=Curitiba').set(authHeader(token));
    expect(r.body.items).toHaveLength(0);
    expect(r.body.cityNote).toContain('Tente sem cidade');
  });
});
