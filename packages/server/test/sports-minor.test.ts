// Saúde Esportiva só para MAIOR de idade (decisão do dono 27/10/26): GET devolve
// eligible=false p/ menor de 18 e o PUT recusa qualquer gravação que ativaria a lente
// (`active` nasce true no schema). Só DESLIGAR passa (perfil legado).
import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, createPatient } from './helpers';
import { prisma } from '../src/prisma';
import { loadSettings, saveSettings } from '../src/utils/settings';
import { ageYearsAt, isMinorAt } from '../src/utils/legalAge';

/** Nascimento há `y` anos (+`days` dias depois, p/ testar a véspera do aniversário). */
const bornYearsAgo = (y: number, days = 0) => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear() - y, n.getUTCMonth(), n.getUTCDate() + days));
};

describe('sports: Saúde Esportiva só para maiores de 18', () => {
  beforeEach(async () => {
    await resetDb();
    await loadSettings();
    await saveSettings('sportsMode', { enabled: 1 });
  });

  it('criança de 4 anos: GET eligible=false e todo PUT que ativaria → 403 sports_minor', async () => {
    const { user, token } = await createUser();
    const filho = await createPatient(user.id, { relationship: 'Filho', dateOfBirth: bornYearsAgo(4) });

    const g = await api().get(`/api/sports/profile?patientId=${filho.id}`).set(authHeader(token));
    expect(g.status).toBe(200);
    expect(g.body.eligible).toBe(false);

    for (const body of [{ active: true }, {}, { modality: 'Futebol' }]) {
      const r = await api().put('/api/sports/profile').set(authHeader(token)).send({ patientId: filho.id, ...body });
      expect(r.status).toBe(403);
      expect(r.body.error).toBe('sports_minor');
    }
    expect(await prisma.sportsProfile.count({ where: { patientId: filho.id } })).toBe(0);
  });

  it('menor com perfil legado ativo: eligible=false e só DESLIGAR é aceito', async () => {
    const { user, token } = await createUser();
    const filha = await createPatient(user.id, { relationship: 'Filha', dateOfBirth: bornYearsAgo(15) });
    await prisma.sportsProfile.create({ data: { patientId: filha.id, active: true } });

    const g = await api().get(`/api/sports/profile?patientId=${filha.id}`).set(authHeader(token));
    expect(g.body.eligible).toBe(false); // o front não mostra a lente mesmo com o row ativo

    const off = await api().put('/api/sports/profile').set(authHeader(token)).send({ patientId: filha.id, active: false });
    expect(off.status).toBe(200);
    expect(off.body.profile.active).toBe(false);
  });

  it('virada exata: 18 anos completos hoje pode; véspera dos 18 não', async () => {
    const { user, token } = await createUser();
    const hoje18 = await createPatient(user.id, { relationship: 'Filho', dateOfBirth: bornYearsAgo(18) });
    const vespera = await createPatient(user.id, { relationship: 'Filha', dateOfBirth: bornYearsAgo(18, 1) });

    const a = await api().put('/api/sports/profile').set(authHeader(token)).send({ patientId: hoje18.id, active: true });
    expect(a.status).toBe(200);
    const b = await api().put('/api/sports/profile').set(authHeader(token)).send({ patientId: vespera.id, active: true });
    expect(b.status).toBe(403);
  });

  it('adulto e dependente SEM data de nascimento: eligible=true e podem ativar', async () => {
    const { user, token } = await createUser();
    const conjuge = await createPatient(user.id, { relationship: 'Cônjuge', dateOfBirth: bornYearsAgo(35) });
    const semData = await createPatient(user.id, { relationship: 'Cônjuge' });

    for (const p of [conjuge, semData]) {
      const g = await api().get(`/api/sports/profile?patientId=${p.id}`).set(authHeader(token));
      expect(g.body.eligible).toBe(true);
      const r = await api().put('/api/sports/profile').set(authHeader(token)).send({ patientId: p.id, active: true });
      expect(r.status).toBe(200);
      expect(r.body.profile.active).toBe(true);
    }
  });
});

describe('legalAge — aniversário de calendário (UTC)', () => {
  it('sem data → null (não afirma menoridade)', () => {
    expect(ageYearsAt(null)).toBeNull();
    expect(isMinorAt(undefined)).toBeNull();
  });

  it('conta o aniversário, não meses de 30 dias', () => {
    const dob = new Date(Date.UTC(2008, 5, 15)); // 15/06/2008
    expect(isMinorAt(dob, new Date(Date.UTC(2026, 5, 14)))).toBe(true); // véspera
    expect(isMinorAt(dob, new Date(Date.UTC(2026, 5, 15)))).toBe(false); // 18 hoje
  });

  it('nascido em 29/02: maior só a partir de 01/03 em ano não bissexto', () => {
    const dob = new Date(Date.UTC(2008, 1, 29));
    expect(ageYearsAt(dob, new Date(Date.UTC(2026, 1, 28)))).toBe(17);
    expect(ageYearsAt(dob, new Date(Date.UTC(2026, 2, 1)))).toBe(18);
  });
});
