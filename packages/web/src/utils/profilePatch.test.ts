import { describe, it, expect } from 'vitest';
import { buildProfilePatch, profileFormFromPatient, type ProfileFormValues } from './profilePatch';

/**
 * Perfil — o "Salvar" só manda o que mudou. Regressão do bug 27/10/26: o PUT levava o
 * form inteiro e o servidor grava vazio como null (alergias/condições/nascimento sumiam).
 */
const fromServer: ProfileFormValues = profileFormFromPatient({
  fullName: 'Ana Souza',
  phone: '11999990000',
  clinicalProfile: 'Hipotireoidismo — levotiroxina 50mcg',
  allergies: 'Dipirona',
  gender: 'female',
  heightCm: 165,
  ethnicity: 'parda',
  dateOfBirth: '1980-04-12T00:00:00.000Z',
});

describe('profileFormFromPatient', () => {
  it('normaliza nulos para vazio, altura para texto e nascimento para AAAA-MM-DD', () => {
    expect(fromServer.heightCm).toBe('165');
    expect(fromServer.dateOfBirth).toBe('1980-04-12');
    expect(profileFormFromPatient({ fullName: 'X', allergies: null, heightCm: null, dateOfBirth: null })).toEqual({
      fullName: 'X', phone: '', clinicalProfile: '', allergies: '', gender: '', heightCm: '', ethnicity: '', dateOfBirth: '',
    });
  });
});

describe('buildProfilePatch — só o que mudou', () => {
  it('nada mudou → patch vazio (nenhum campo clínico vai pro servidor)', () => {
    expect(buildProfilePatch(fromServer, { ...fromServer })).toEqual({});
  });

  it('mudou só alergias → manda só alergias; condições/nascimento ficam intactos', () => {
    const patch = buildProfilePatch(fromServer, { ...fromServer, allergies: 'Dipirona, penicilina' });
    expect(patch).toEqual({ allergies: 'Dipirona, penicilina' });
  });

  it('limpar alergias de propósito continua possível → null', () => {
    expect(buildProfilePatch(fromServer, { ...fromServer, allergies: '   ' })).toEqual({ allergies: null });
  });

  it('espaço sobrando não conta como mudança', () => {
    expect(buildProfilePatch(fromServer, { ...fromServer, clinicalProfile: `${fromServer.clinicalProfile}  `, fullName: ' Ana Souza ' })).toEqual({});
  });

  it('altura compara em cm: "1,65" = "165" (sem patch); valor novo sai em cm', () => {
    expect(buildProfilePatch(fromServer, { ...fromServer, heightCm: '1,65' })).toEqual({});
    expect(buildProfilePatch(fromServer, { ...fromServer, heightCm: '1,68' })).toEqual({ heightCm: 168 });
  });

  it('nascimento apagado → null; alterado → data nova', () => {
    expect(buildProfilePatch(fromServer, { ...fromServer, dateOfBirth: '' })).toEqual({ dateOfBirth: null });
    expect(buildProfilePatch(fromServer, { ...fromServer, dateOfBirth: '1980-04-13' })).toEqual({ dateOfBirth: '1980-04-13' });
  });

  it('nome apagado aparece como "" (a tela bloqueia esse caso antes do PUT)', () => {
    expect(buildProfilePatch(fromServer, { ...fromServer, fullName: '  ' })).toEqual({ fullName: '' });
  });

  it('paciente sem dados + form vazio → patch vazio', () => {
    const empty = profileFormFromPatient({});
    expect(buildProfilePatch(empty, { ...empty })).toEqual({});
  });
});
