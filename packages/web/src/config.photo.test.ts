// Qual sessão assina a URL da foto do paciente (revisão final, I8 / B2-1): o servidor só abre a foto para o DONO do
// paciente, um ADMIN ou um médico com vínculo. Quem é paciente E médico no mesmo navegador tem os dois tokens.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { photoTokenKeys, photoUrlFor } from './config';

const jwt = (exp: number) => `h.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.s`;
const nowS = () => Math.floor(Date.now() / 1000);
const VALID = () => nowS() + 3600;
const EXPIRED = () => nowS() - 3600;

const browser = (hash: string, store: Record<string, string>) => {
  vi.stubGlobal('window', { location: { hash } });
  vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null });
};
const tokenOf = (url: string): string | null => new URL(url).searchParams.get('t');

afterEach(() => vi.unstubAllGlobals());

describe('photoTokenKeys — portal do médico usa a sessão do médico primeiro', () => {
  const doctorFirst = ['doctorPhotoToken', 'doctorToken', 'photoToken', 'token'];
  const patientFirst = ['photoToken', 'doctorPhotoToken', 'token', 'doctorToken'];
  it('rotas do médico (#/doctor, com query, com subrota) → médico primeiro', () => {
    for (const h of ['#/doctor', '#/doctor?kyc=1', '#/doctor?patientId=p1', '#/doctor/vincular', '#doctor']) {
      expect(photoTokenKeys(h), h).toEqual(doctorFirst);
    }
  });
  it('qualquer outra rota (ou sem hash) → paciente primeiro, como sempre', () => {
    for (const h of ['', '#/', '#/exames', '#/admin', '#/doctors', '#/doctorfoo', '#/minhas-consultas?doctor=1']) {
      expect(photoTokenKeys(h), h).toEqual(patientFirst);
    }
  });
});

describe('photoUrlFor num navegador com sessão de paciente E de médico', () => {
  const both = () => ({
    photoToken: jwt(VALID()), token: jwt(VALID()),
    doctorPhotoToken: jwt(VALID() + 1), doctorToken: jwt(VALID() + 1),
  });

  it('no portal do médico a foto do paciente é pedida com o token do MÉDICO', () => {
    const s = both();
    browser('#/doctor', s);
    expect(tokenOf(photoUrlFor('pac1'))).toBe(s.doctorPhotoToken);
  });
  it('fora do portal (app do paciente) segue com o token do PACIENTE', () => {
    const s = both();
    browser('#/exames', s);
    expect(tokenOf(photoUrlFor('pac1'))).toBe(s.photoToken);
  });
  it('só sessão de paciente: o portal do médico cai no que existir', () => {
    const s = { photoToken: jwt(VALID()) };
    browser('#/doctor', s);
    expect(tokenOf(photoUrlFor('pac1'))).toBe(s.photoToken);
  });
  it('só sessão de médico fora do portal: usa o do médico (nada mudou)', () => {
    const s = { doctorPhotoToken: jwt(VALID()) };
    browser('#/exames', s);
    expect(tokenOf(photoUrlFor('pac1'))).toBe(s.doctorPhotoToken);
  });
  it('pula token EXPIRADO e usa o próximo vivo', () => {
    const s = { doctorPhotoToken: jwt(EXPIRED()), doctorToken: jwt(VALID()), photoToken: jwt(VALID()) };
    browser('#/doctor', s);
    expect(tokenOf(photoUrlFor('pac1'))).toBe(s.doctorToken);
  });
  it('sem nenhum token: URL sem ?t=; id vazio: string vazia', () => {
    browser('#/doctor', {});
    expect(tokenOf(photoUrlFor('pac1'))).toBeNull();
    expect(photoUrlFor('')).toBe('');
  });
});
