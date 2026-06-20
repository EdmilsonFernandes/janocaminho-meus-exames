// Helpers de teste: reset do DB, mint de token JWT, factories de fixtures.
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/prisma';
import { signToken } from '../src/auth/jwt';
import { app } from '../src/app';

/**
 * Truncate todas as tabelas públicas entre testes (CASCADE). Descobre os nomes
 * dinamicamente — tolerante a drift de schema (ex.: modelo sem migration).
 *
 * TRAVA DE SEGURANÇA: recusa truncar se DATABASE_URL não for o DB de teste.
 * Evita que testes rodem sem setup (ex.: vitest invocado do diretório errado,
 * sem carregar vitest.config/setup.ts) e destruam o banco de DEV/PROD.
 */
export async function resetDb(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('meus_exames_test')) {
    throw new Error(
      `[resetDb] RECUSEI truncar — DATABASE_URL não é o DB de teste ("${url}"). ` +
        `O setup.ts (que aponta pro meus_exames_test) não rodou. ` +
        `Rode os testes via: npm test --workspace packages/server`,
    );
  }
  const rows = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';`,
  );
  const tables = rows.map((r) => r.tablename);
  if (tables.length) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE;`,
    );
  }
}

/** Minta um JWT válido (usa o mesmo signToken do app + JWT_SECRET do setup). */
export function mintToken(userId: string): string {
  return signToken({ userId });
}

export const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Cliente supertest já ligado ao app (mockado, sem listen). */
export const api = () => request(app);

let counter = 0;
const uniq = (p: string) => `${p}-${Date.now().toString(36)}-${counter++}`;

export interface TestUser {
  user: { id: string; email: string; name: string };
  patient: { id: string; fullName: string };
  token: string;
}

/** Cria user OWNER + paciente Titular. premium=true seta planExpiresAt no futuro. */
export async function createUser(opts: {
  email?: string;
  password?: string;
  name?: string;
  credits?: number;
  premium?: boolean;
} = {}): Promise<TestUser> {
  const email = opts.email ?? uniq('user@exemplo.com');
  const passwordHash = await bcrypt.hash(opts.password ?? 'senha123', 10);
  const user = await prisma.user.create({
    data: {
      email,
      name: opts.name ?? 'Usuário Teste',
      passwordHash,
      credits: opts.credits ?? 100,
      emailVerified: true,
      role: 'OWNER',
      planExpiresAt: opts.premium ? new Date(Date.now() + 30 * 86400_000) : null,
    },
    select: { id: true, email: true, name: true },
  });
  const patient = await prisma.patient.create({
    data: { ownerId: user.id, fullName: user.name, relationship: 'Titular' },
    select: { id: true, fullName: true },
  });
  return { user, patient, token: mintToken(user.id) };
}

/** Cria um paciente extra (dependente) vinculado ao user. */
export async function createPatient(ownerId: string, opts: { fullName?: string; relationship?: string } = {}) {
  return prisma.patient.create({
    data: {
      ownerId,
      fullName: opts.fullName ?? uniq('Dependente'),
      relationship: opts.relationship ?? 'Filha',
    },
    select: { id: true, fullName: true, ownerId: true },
  });
}

/** Cria um exame. sha distinto evita colisão do @@unique([patientId, fileSha256]). */
export async function createExam(patientId: string, opts: {
  title?: string;
  performedAt?: Date;
  status?: 'UPLOADED' | 'EXTRACTING' | 'EXTRACTED' | 'FAILED';
  kind?: 'LAB_PANEL' | 'IMAGING' | 'OTHER';
  sha?: string;
} = {}) {
  return prisma.exam.create({
    data: {
      patientId,
      title: opts.title ?? 'Hemograma Completo',
      kind: opts.kind ?? 'LAB_PANEL',
      status: opts.status ?? 'EXTRACTED',
      performedAt: opts.performedAt ?? new Date('2026-01-15T00:00:00Z'),
      filePath: `test-${opts.sha ?? uniq('f')}.pdf`,
      fileSha256: opts.sha ?? uniq('sha'),
      fileSizeBytes: 100,
    },
    select: { id: true, patientId: true, title: true, status: true, performedAt: true, fileSha256: true },
  });
}

/** Cria um item de exame (analito). extractedPage é obrigatório (Int não-nulo). */
export async function createItem(examId: string, opts: {
  name?: string;
  nameCanonical?: string;
  valueNumeric?: number | null;
  valueText?: string | null;
  unit?: string | null;
  refLow?: number | null;
  refHigh?: number | null;
  flag?: 'NORMAL' | 'HIGH' | 'LOW' | 'ABNORMAL' | 'CRITICAL' | 'UNKNOWN';
  isAbnormal?: boolean;
  panel?: string | null;
} = {}) {
  const refLow = opts.refLow ?? null;
  const refHigh = opts.refHigh ?? null;
  const valueNumeric = opts.valueNumeric ?? null;
  return prisma.examItem.create({
    data: {
      examId,
      panel: opts.panel ?? null,
      name: opts.name ?? 'HEMOGLOBINA',
      nameCanonical: opts.nameCanonical ?? 'HEMOGLOBINA',
      valueNumeric,
      valueText: opts.valueText ?? (valueNumeric != null ? String(valueNumeric) : null),
      unit: opts.unit ?? 'g/dL',
      refLow,
      refHigh,
      refText: refLow != null && refHigh != null ? `${refLow}-${refHigh}` : null,
      flag: opts.flag ?? 'NORMAL',
      isAbnormal: opts.isAbnormal ?? false,
      extractedPage: 1,
    },
    select: { id: true, examId: true, name: true, nameCanonical: true, flag: true, isAbnormal: true },
  });
}

/** Recarrega créditos/estado do user direto do banco (pós-operação). */
export async function getUserCredits(userId: string): Promise<number> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
  return u?.credits ?? 0;
}

/** Constrói uma resposta fake (Response-like) para o fetch mockado do Mercado Pago. */
export function mpResponse(body: unknown, { ok = true, status = 200 }: { ok?: boolean; status?: number } = {}) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}
