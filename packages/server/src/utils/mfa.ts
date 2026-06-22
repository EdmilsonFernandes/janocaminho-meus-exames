import crypto from 'crypto';
import QRCode from 'qrcode';
import { prisma } from '../prisma';
import { generateTotpSecret, verifyTotpCode, buildOtpAuthUri } from './totp';
import { encryptSecret, decryptSecret } from './mfa-crypto';

/* Serviço MFA (TOTP) — compartilhado entre paciente (User) e médico (Doctor).
 * ownerType 'USER' | 'DOCTOR'; o secret fica cifrado (AES-256-GCM) direto no model. */

const ISSUER = 'Meus Exames';
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 min
const MAX_ATTEMPTS = 5;

type OwnerType = 'USER' | 'DOCTOR';

async function getOwner(type: OwnerType, id: string) {
  const sel = { id: true, mfaEnabled: true, mfaSecretEncrypted: true, mfaSecretIv: true, mfaSecretAuthTag: true, email: true };
  if (type === 'USER') {
    const u = await prisma.user.findUnique({ where: { id }, select: sel });
    return u ?? null;
  }
  const d = await prisma.doctor.findUnique({ where: { id }, select: sel });
  return d ?? null;
}

async function setMfa(type: OwnerType, id: string, data: any) {
  if (type === 'USER') return prisma.user.update({ where: { id }, data });
  return prisma.doctor.update({ where: { id }, data });
}

/** Cria um desafio MFA no login (senha OK → challenge → verify do código). */
export async function createChallenge(type: OwnerType, id: string, sessionPayload: any) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await prisma.mfaChallenge.create({
    data: { tokenHash, ownerType: type, ownerId: id, sessionPayload, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) },
  });
  return { challengeToken: token, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) };
}

/** Verifica o código TOTP contra o desafio. Devolve ownerId + sessionPayload no sucesso. */
export async function verifyChallenge(challengeToken: string, code: string) {
  const tokenHash = crypto.createHash('sha256').update(challengeToken).digest('hex');
  const ch = await prisma.mfaChallenge.findUnique({ where: { tokenHash } });
  if (!ch || ch.consumedAt || ch.expiresAt < new Date()) throw { status: 401, code: 'MFA-002', message: 'Desafio expirado. Faça login novamente.' };
  if (ch.attemptsCount >= MAX_ATTEMPTS) throw { status: 429, code: 'MFA-003', message: 'Muitas tentativas. Faça login novamente.' };
  const owner = await getOwner(ch.ownerType as OwnerType, ch.ownerId);
  if (!owner?.mfaEnabled || !owner.mfaSecretEncrypted) throw { status: 400, code: 'MFA-004', message: 'MFA não ativado.' };
  const secret = decryptSecret(owner.mfaSecretEncrypted, owner.mfaSecretIv!, owner.mfaSecretAuthTag!);
  const valid = verifyTotpCode(secret, code, { window: 1 });
  await prisma.mfaChallenge.update({ where: { id: ch.id }, data: { attemptsCount: { increment: 1 } } });
  if (!valid) throw { status: 401, code: 'MFA-005', message: 'Código inválido.' };
  await prisma.mfaChallenge.update({ where: { id: ch.id }, data: { consumedAt: new Date() } });
  return { ownerType: ch.ownerType as OwnerType, ownerId: ch.ownerId, sessionPayload: ch.sessionPayload as any };
}

/** No login: se MFA ativo, cria desafio e devolve { mfaRequired, challengeToken }; senão null (login normal). */
export async function evaluateMfaOnLogin(type: OwnerType, id: string, sessionPayload: any, email: string) {
  const owner = await getOwner(type, id);
  if (!owner?.mfaEnabled) return null;
  const { challengeToken, expiresAt } = await createChallenge(type, id, sessionPayload);
  const [name, domain] = (email || '').split('@');
  const masked = name ? `${name.slice(0, 2)}***@${domain || ''}` : '***';
  return { mfaRequired: true, challengeToken, expiresAt, account: masked };
}

// --- SETUP / MANAGE (autenticado) ---

export async function getStatus(type: OwnerType, id: string) {
  const owner = await getOwner(type, id);
  return { enabled: !!owner?.mfaEnabled };
}

export async function startSetup(type: OwnerType, id: string) {
  const owner = await getOwner(type, id);
  if (!owner) throw { status: 404, message: 'Conta não encontrada.' };
  const secret = generateTotpSecret();
  const enc = encryptSecret(secret);
  await setMfa(type, id, { mfaSecretEncrypted: enc.encrypted, mfaSecretIv: enc.iv, mfaSecretAuthTag: enc.authTag, mfaEnabled: false, mfaConfirmedAt: null });
  const otpauthUri = buildOtpAuthUri({ issuer: ISSUER, accountName: owner.email, secret });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri);
  return { otpauthUri, qrCodeDataUrl, secret };
}

export async function confirmSetup(type: OwnerType, id: string, code: string) {
  const owner = await getOwner(type, id);
  if (!owner?.mfaSecretEncrypted) throw { status: 400, message: 'Inicie o setup primeiro.' };
  const secret = decryptSecret(owner.mfaSecretEncrypted, owner.mfaSecretIv!, owner.mfaSecretAuthTag!);
  if (!verifyTotpCode(secret, code, { window: 1 })) throw { status: 401, message: 'Código inválido.' };
  await setMfa(type, id, { mfaEnabled: true, mfaConfirmedAt: new Date() });
  return { enabled: true };
}

export async function disableMfa(type: OwnerType, id: string, code: string) {
  const owner = await getOwner(type, id);
  if (!owner?.mfaSecretEncrypted) throw { status: 400, message: 'MFA não configurado.' };
  const secret = decryptSecret(owner.mfaSecretEncrypted, owner.mfaSecretIv!, owner.mfaSecretAuthTag!);
  if (!verifyTotpCode(secret, code, { window: 1 })) throw { status: 401, message: 'Código inválido.' };
  await setMfa(type, id, { mfaEnabled: false, mfaSecretEncrypted: null, mfaSecretIv: null, mfaSecretAuthTag: null, mfaConfirmedAt: null });
  return { enabled: false };
}
