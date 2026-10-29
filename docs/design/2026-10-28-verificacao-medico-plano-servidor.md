# Verificação de identidade do médico (KYC UaiID) — Plano 1: Servidor

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: `executing-plans` (inline) ou `subagent-driven-development` — tarefa por tarefa. Passos com checkbox (`- [ ]`).

**Goal:** Só médico com identidade comprovada no UaiID **e** vínculo com o CRM (nome do documento = nome do CFM) atende, vê dado de paciente ou recebe repasse — com webhook + reconciliação, fila de decisão no admin e o AUD-003 fechado no servidor.

**Architecture:** Uma política de acesso (`utils/doctorAccess.ts`) aplicada nas 8 auths locais de médico (padrão D8 preservado: o parse do JWT segue local). Cliente UaiID isolado (`utils/uaiid.ts`), decisão pura (`kyc/decide.ts`) e sincronização idempotente (`kyc/sync.ts`) disparada por webhook assinado, pela consulta do médico e por job de 10 min. Tudo aditivo: médicos existentes viram `legacy` e seguem atendendo.

**Tech Stack:** Node 20 · Express 5 · Prisma 6 (PostgreSQL) · vitest + supertest · TypeScript.

**Spec:** `docs/design/2026-10-28-verificacao-medico-spec.md` (v1.1)

## Global Constraints
- Stack travada: Node 20 · Prisma 6 (não 7) · Express 5. Nenhuma dependência nova.
- Migration aditiva e idempotente (`IF NOT EXISTS`, FK via `DO $$`), nome **`20261029b_doctor_kyc`**; nunca editar migration antiga. Prod aplica com `migrate deploy` no boot; dev/teste com `prisma db push`.
- Testes: `npm test --workspace packages/server -- <arquivo>` **a partir da raiz do monorepo**. NUNCA `npx vitest` da raiz.
- Typecheck: `cd packages/server && npx prisma generate && npx tsc --noEmit`.
- Commit **só com ordem do dono** (`.claude/TASK_RULES.md`): os passos "Commit" são checkpoint — deixar o diff pronto e pedir o ok.
- Status do médico, exatos: `pending | in_progress | uaiid_review | needs_admin | approved | rejected | legacy`.
- Erros de rota sempre com `code`. Bloqueado → `403 {blocked:true, code:'DOCTOR_BLOCKED'}`; não pode atender → `403 {code:'VERIFICATION_REQUIRED', status}`.
- Env só no servidor: `UAIID_API_KEY`, `UAIID_WEBHOOK_SECRET`, `UAIID_BASE_URL` (default `https://api.uaiid.com.br`), `UAIID_TIMEOUT_MS` (8000), `UAIID_RETURN_URL` (default `https://drexame.janocaminho.com.br/#/doctor?kyc=1`). Nunca `VITE_*`.
- Nada de imagem, biometria, número de documento ou CPF em tabela nova ou log. Nunca chamar `/v1/verifications/{id}/details` nem a listagem do UaiID (trazem imagem).
- Push de produção **junto com o Plano 2** (sem o card do portal, médico novo fica preso em `pending`).
- **Política do começo (dono, 28/10/26):** `doctorKyc.autoApprove = 0` → todo médico cai na fila do dono, mesmo com tudo verde (`needs_admin`, motivo `manual_policy`); o dono aprova com 1 clique. `1` = aprova sozinho (troca no admin, sem deploy).
- E-mails ao médico com o layout premium do Portal do Médico (`src/kyc/emails.ts`, tokens do `.claude/DESIGN_SYSTEM.md`), **só em transição** (evento repetido não reenvia), nunca lançam.

---

## Mapa de arquivos
**Criar**
- `packages/server/prisma/migrations/20261029b_doctor_kyc/migration.sql` — colunas do médico + tabela de tentativas
- `packages/server/src/utils/doctorAccess.ts` — política única (bloqueio + verificação)
- `packages/server/src/utils/uaiid.ts` — cliente UaiID + assinatura do webhook
- `packages/server/src/kyc/decide.ts` — decisão pura (identidade × CRM)
- `packages/server/src/kyc/messages.ts` — mensagem amigável por motivo
- `packages/server/src/kyc/emails.ts` — layout premium do Portal do Médico + e-mails (recebido/aprovado/recusado/dono)
- `packages/server/src/kyc/notify.ts` — envio dos e-mails (nunca lança)
- `packages/server/scripts/preview-kyc-emails.ts` — prévia visual dos e-mails (dev)
- `packages/server/src/kyc/sync.ts` — sincroniza tentativa ↔ médico + e-mails de transição
- `packages/server/src/routes/doctor-verification.routes.ts` — `POST/GET /api/doctor/verification`
- `packages/server/src/routes/uaiid-webhook.routes.ts` — handler do webhook
- `packages/server/src/jobs/kycReconcile.ts` — reconciliação a cada 10 min
- Testes: `test/doctor-kyc-foundation.test.ts`, `test/doctor-access-policy.test.ts`, `test/doctor-access-gate.test.ts`, `src/utils/uaiid.test.ts`, `src/kyc/decide.test.ts`, `test/kyc-sync.test.ts`, `test/doctor-verification.routes.test.ts`, `test/uaiid-webhook.test.ts`, `test/kyc-reconcile.test.ts`, `test/admin-doctor-verification.test.ts`, `test/doctor-register-kyc.test.ts`, `test/kyc-notify.test.ts`, `test/kyc-e2e.test.ts`

**Modificar**
- `prisma/schema.prisma` (Doctor `:1140-1146` + model novo) · `src/utils/settings.ts` (`:106` + getter) · `src/utils/cfm.ts` + `src/utils/cfm.test.ts`
- `src/routes/doctor.routes.ts` (`:89-110`, onboarding, PDF `:686-692`, cadastro `:311-335`) · `src/routes/collection.routes.ts:27-40` · `src/routes/teleconsultaQueue.routes.ts:46-67,84` · `src/jobs/teleconsultaQueue.ts:154-160` · `src/routes/examRequest.routes.ts:32-59` · `src/routes/consult-summary.routes.ts:42-52` · `src/routes/teleconsulta.routes.ts:56-67`
- `src/routes/admin.routes.ts` (`:265` + rotas após `:1111`) · `src/finance/payout.ts:112-118` · `src/app.ts` (`:111`, `:436`, `:533-616`) · `src/index.ts` (`:17-18`, `:56`)
- `test/helpers.ts:198-207` · `test/setup.ts` · `test/finance-payout.test.ts` · `.env.example` · `.env.prod.example`

---

### Task 1: Fundação — schema, migration, config e helper de teste

**Files:**
- Modify: `packages/server/prisma/schema.prisma:1140-1146`
- Create: `packages/server/prisma/migrations/20261029b_doctor_kyc/migration.sql`
- Modify: `packages/server/src/utils/settings.ts:106` e logo após `getTeleconsultaConfig()`
- Modify: `packages/server/src/routes/admin.routes.ts:265`
- Modify: `packages/server/test/helpers.ts:198-207`
- Test: `packages/server/test/doctor-kyc-foundation.test.ts`

**Interfaces:**
- Produces: `prisma.doctorVerification`; `Doctor.verificationStatus: string`, `verifiedAt: Date | null`, `verifiedBy: string | null`; `getDoctorKycConfig(): { legacyGraceUntilMs: number; autoApprove: 0 | 1 }`; `createDoctor(opts & { verificationStatus?: string })` (default `'approved'`).

- [ ] **Step 1: Escrever o teste que falha** — `packages/server/test/doctor-kyc-foundation.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../src/prisma';
import { resetDb, createDoctor } from './helpers';
import { getDoctorKycConfig, saveSettings } from '../src/utils/settings';

describe('KYC médico — fundação (schema, config, helper)', () => {
  beforeEach(async () => { await resetDb(); });
  afterEach(async () => { await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 0 }); });

  it('createDoctor nasce approved por padrão e aceita override', async () => {
    const a = await createDoctor({ crm: '11111-SP' });
    const b = await createDoctor({ crm: '22222-SP', verificationStatus: 'pending' });
    const rows = await prisma.doctor.findMany({ where: { id: { in: [a.doctor.id, b.doctor.id] } }, select: { id: true, verificationStatus: true } });
    const byId = new Map(rows.map((r) => [r.id, r.verificationStatus]));
    expect(byId.get(a.doctor.id)).toBe('approved');
    expect(byId.get(b.doctor.id)).toBe('pending');
  });

  it('médico criado direto no banco nasce pending (default do schema)', async () => {
    const d = await prisma.doctor.create({ data: { name: 'Dr X', crm: '33333-SP', email: 'kyc-x@exemplo.com', passwordHash: 'x' } });
    expect(d.verificationStatus).toBe('pending');
  });

  it('tentativa sobrevive à exclusão da conta (SetNull + snapshot do CRM)', async () => {
    const { doctor } = await createDoctor({ crm: '44444-SP' });
    await prisma.doctorVerification.create({ data: { doctorId: doctor.id, crm: '44444-SP', providerId: 'v-foundation-1', status: 'rejected' } });
    await prisma.doctor.delete({ where: { id: doctor.id } });
    const v = await prisma.doctorVerification.findUnique({ where: { providerId: 'v-foundation-1' } });
    expect(v?.doctorId).toBeNull();
    expect(v?.crm).toBe('44444-SP');
  });

  it('getDoctorKycConfig: defaults (sem prazo, sempre humano) e lê o valor salvo', async () => {
    expect(getDoctorKycConfig()).toEqual({ legacyGraceUntilMs: 0, autoApprove: 0 });
    await saveSettings('doctorKyc', { legacyGraceUntilMs: 1767225600000, autoApprove: 1 });
    expect(getDoctorKycConfig()).toEqual({ legacyGraceUntilMs: 1767225600000, autoApprove: 1 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test --workspace packages/server -- test/doctor-kyc-foundation.test.ts`
Expected: FAIL — `getDoctorKycConfig` não exportado / `prisma.doctorVerification` undefined.

- [ ] **Step 3: Schema** — em `prisma/schema.prisma`, trocar o fim do model `Doctor`:

```prisma
  blocked          Boolean  @default(false)
  blockedAt        DateTime?
  blockedReason    String?

  @@map("doctors")
}
```
por:
```prisma
  blocked          Boolean  @default(false)
  blockedAt        DateTime?
  blockedReason    String?
  // KYC (spec 2026-10-28-verificacao-medico-spec.md §1-2): só approved (ou legacy no prazo) atende.
  verificationStatus String    @default("pending") // pending|in_progress|uaiid_review|needs_admin|approved|rejected|legacy
  verifiedAt         DateTime?
  verifiedBy         String?   // 'auto' | id do admin
  verifications      DoctorVerification[]

  @@map("doctors")
}

// Tentativa de KYC do médico no UaiID (spec §2). Sem imagem/biometria/nº de documento/CPF —
// isso fica no UaiID. doctorId SetNull: a evidência sobrevive à exclusão da conta (CRM liberado).
model DoctorVerification {
  id           String    @id @default(cuid())
  doctorId     String?
  doctor       Doctor?   @relation(fields: [doctorId], references: [id], onDelete: SetNull)
  crm          String    // snapshot "numero-UF" do CRM tentado
  provider     String    @default("uaiid")
  providerId   String    @unique // verification_id do UaiID
  status       String    // created|consent_pending|collecting|processing|challenge|manual_review|approved|rejected|expired|cancelled
  reasonCode   String?
  score        Int?
  documentName String?   // nome do documento (webhook assinado)
  nameRatio    Float?    // result.declared_vs_document.name_ratio (declarado = nome do CFM)
  cfmName      String?   // snapshot do CFM na criação = nome declarado ao UaiID
  cfmSituation String?
  nameMatch    Boolean?
  cpfSituacao  String?
  decision     String?   // decisão Dr. Exame (= status proposto ao médico)
  decidedBy    String?   // 'auto' | id do admin (decisão humana não é sobrescrita)
  expiresAt    DateTime?
  lastSyncedAt DateTime?
  syncSource   String?   // webhook|poll|on_demand
  createdAt    DateTime  @default(now())
  completedAt  DateTime?

  @@index([doctorId, createdAt])
  @@index([status, lastSyncedAt])
  @@index([crm, createdAt])
  @@map("doctor_verifications")
}
```

- [ ] **Step 4: Migration** — criar `prisma/migrations/20261029b_doctor_kyc/migration.sql`:

```sql
-- KYC do médico (spec docs/design/2026-10-28-verificacao-medico-spec.md §2). Aditiva e idempotente.
-- 1) Status: existentes nascem 'legacy' (nada quebra no deploy); novos = 'pending'.
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "verificationStatus" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "doctors" ALTER COLUMN "verificationStatus" SET DEFAULT 'pending';
-- Placeholder de convite e conta que nunca validou e-mail NÃO são legado: quem reivindicasse
-- herdaria acesso total.
UPDATE "doctors" SET "verificationStatus" = 'pending'
  WHERE "verificationStatus" = 'legacy' AND ("passwordHash" = 'pending-invite' OR "emailVerified" = false);
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "verifiedBy" TEXT;

-- 2) Tentativas
CREATE TABLE IF NOT EXISTS "doctor_verifications" (
  "id" TEXT NOT NULL,
  "doctorId" TEXT,
  "crm" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'uaiid',
  "providerId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "reasonCode" TEXT,
  "score" INTEGER,
  "documentName" TEXT,
  "nameRatio" DOUBLE PRECISION,
  "cfmName" TEXT,
  "cfmSituation" TEXT,
  "nameMatch" BOOLEAN,
  "cpfSituacao" TEXT,
  "decision" TEXT,
  "decidedBy" TEXT,
  "expiresAt" TIMESTAMP(3),
  "lastSyncedAt" TIMESTAMP(3),
  "syncSource" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "doctor_verifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "doctor_verifications_providerId_key" ON "doctor_verifications"("providerId");
CREATE INDEX IF NOT EXISTS "doctor_verifications_doctorId_createdAt_idx" ON "doctor_verifications"("doctorId", "createdAt");
CREATE INDEX IF NOT EXISTS "doctor_verifications_status_lastSyncedAt_idx" ON "doctor_verifications"("status", "lastSyncedAt");
CREATE INDEX IF NOT EXISTS "doctor_verifications_crm_createdAt_idx" ON "doctor_verifications"("crm", "createdAt");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'doctor_verifications_doctorId_fkey') THEN
    ALTER TABLE "doctor_verifications" ADD CONSTRAINT "doctor_verifications_doctorId_fkey"
      FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
```

- [ ] **Step 5: Aplicar (client + DB de teste + DB de dev)**

```bash
cd packages/server
npx prisma generate
DATABASE_URL="postgresql://meus_exames:meus_exames_dev@127.0.0.1:5433/meus_exames_test?schema=public" npx prisma db push --skip-generate
npx prisma db push --skip-generate
```
Expected: "Your database is now in sync with your Prisma schema" nas duas.

- [ ] **Step 6: Settings** — em `src/utils/settings.ts`, logo depois da linha `teleconsulta: { entryWindowMin: 5, ... queueOfferTtlSec: 45 },` (`:106`), antes do `};`:

```ts
  // KYC do médico (spec verificação §1/§4): prazo do 'legacy' em epoch ms (0 = sem prazo);
  // autoApprove 0 = TODO médico passa pela fila do dono (decisão 28/10/26); 1 = aprova sozinho se tudo verde.
  doctorKyc: { legacyGraceUntilMs: 0, autoApprove: 0 },
```
e logo abaixo da função `getTeleconsultaConfig()`:
```ts
/** KYC do médico (spec verificação §1/§4): prazo do 'legacy' (epoch ms; 0 = sem prazo) e
 *  autoApprove (0 = sempre passa pelo dono — default; 1 = aprova sozinho quando tudo verde). */
export function getDoctorKycConfig(): { legacyGraceUntilMs: number; autoApprove: 0 | 1 } {
  const k: any = (getSettings() as any).doctorKyc ?? {};
  const ms = Number(k.legacyGraceUntilMs);
  return { legacyGraceUntilMs: Number.isFinite(ms) && ms > 0 ? ms : 0, autoApprove: Number(k.autoApprove) === 1 ? 1 : 0 };
}
```

- [ ] **Step 7: Prazo editável pelo admin** — `src/routes/admin.routes.ts:265`:

```ts
const NUMERIC_CATEGORIES = ['creditCosts', 'uploadRules', 'grants', 'shares', 'guidelines', 'sportsMode', 'doctorKyc'];
```

- [ ] **Step 8: Helper de teste** — `test/helpers.ts`: no tipo do `opts` de `createDoctor`, acrescentar `verificationStatus?: string;` e trocar
```ts
  await prisma.doctor.updateMany({ where: { email }, data: { emailVerified: true } });
```
por
```ts
  // KYC: médico de teste nasce aprovado (gate deny-by-default); override p/ testar o gate.
  await prisma.doctor.updateMany({ where: { email }, data: { emailVerified: true, verificationStatus: opts.verificationStatus ?? 'approved' } });
```

- [ ] **Step 9: Rodar e ver passar**

Run: `npm test --workspace packages/server -- test/doctor-kyc-foundation.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 10: Commit (só com ok do dono)**

```bash
git add packages/server/prisma packages/server/src/utils/settings.ts packages/server/src/routes/admin.routes.ts packages/server/test/helpers.ts packages/server/test/doctor-kyc-foundation.test.ts
git commit -m "feat(kyc): fundação — doctor_verifications + verificationStatus (legado preservado) + config doctorKyc"
```

---

### Task 2: Política de acesso única

**Files:**
- Create: `packages/server/src/utils/doctorAccess.ts`
- Test: `packages/server/test/doctor-access-policy.test.ts`

**Interfaces:**
- Consumes: `getDoctorKycConfig()` (Task 1).
- Produces:
  - `DOCTOR_ACCESS_SELECT` = `{ id: true, blocked: true, blockedReason: true, verificationStatus: true }`
  - `interface DoctorAccessRow { blocked: boolean; blockedReason?: string | null; verificationStatus: string }`
  - `practiceStatuses(now?: Date): string[]`
  - `doctorCanPractice(verificationStatus: string | null | undefined, now?: Date): boolean`
  - `doctorAccessDenial(doc: DoctorAccessRow, opts?: { allowUnverified?: boolean; now?: Date }): { status: number; body: Record<string, unknown> } | null`

- [ ] **Step 1: Escrever o teste que falha** — `test/doctor-access-policy.test.ts`

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { practiceStatuses, doctorCanPractice, doctorAccessDenial } from '../src/utils/doctorAccess';
import { saveSettings } from '../src/utils/settings';

describe('doctorAccess — política única (spec §7)', () => {
  afterEach(async () => { await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 0 }); });

  it('approved pode; os demais status (fora legacy) não', () => {
    expect(doctorCanPractice('approved')).toBe(true);
    for (const s of ['pending', 'in_progress', 'uaiid_review', 'needs_admin', 'rejected', '', null, undefined]) {
      expect(doctorCanPractice(s as any)).toBe(false);
    }
  });

  it('legacy: sem prazo (0) pode; com prazo, só antes dele', async () => {
    expect(practiceStatuses()).toEqual(['approved', 'legacy']);
    await saveSettings('doctorKyc', { legacyGraceUntilMs: new Date('2026-12-01T00:00:00Z').getTime() });
    expect(doctorCanPractice('legacy', new Date('2026-11-30T23:59:00Z'))).toBe(true);
    expect(doctorCanPractice('legacy', new Date('2026-12-01T00:00:01Z'))).toBe(false);
    expect(practiceStatuses(new Date('2026-12-02T00:00:00Z'))).toEqual(['approved']);
  });

  it('bloqueado → DOCTOR_BLOCKED, mesmo com allowUnverified e approved', () => {
    const d = doctorAccessDenial({ blocked: true, blockedReason: 'kyc_fraud', verificationStatus: 'approved' }, { allowUnverified: true });
    expect(d?.status).toBe(403);
    expect(d?.body).toMatchObject({ blocked: true, code: 'DOCTOR_BLOCKED', reason: 'kyc_fraud' });
  });

  it('não verificado → VERIFICATION_REQUIRED com o status; allowUnverified libera', () => {
    const d = doctorAccessDenial({ blocked: false, verificationStatus: 'pending' });
    expect(d?.status).toBe(403);
    expect(d?.body).toMatchObject({ code: 'VERIFICATION_REQUIRED', status: 'pending' });
    expect(doctorAccessDenial({ blocked: false, verificationStatus: 'pending' }, { allowUnverified: true })).toBeNull();
    expect(doctorAccessDenial({ blocked: false, verificationStatus: 'approved' })).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test --workspace packages/server -- test/doctor-access-policy.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar** — `src/utils/doctorAccess.ts`

```ts
import { getDoctorKycConfig } from './settings';

/**
 * Política ÚNICA de acesso do médico (spec verificação §7). O parse do JWT continua LOCAL em
 * cada módulo (padrão D8 — examRequest.routes.ts:10-12); todos chamam doctorAccessDenial()
 * depois de carregar o médico com DOCTOR_ACCESS_SELECT.
 */
export const DOCTOR_ACCESS_SELECT = { id: true, blocked: true, blockedReason: true, verificationStatus: true } as const;

export interface DoctorAccessRow { blocked: boolean; blockedReason?: string | null; verificationStatus: string }

const BLOCKED_MSG = 'Acesso suspenso pela administração. Entre em contato com o suporte: contato@janocaminho.com.br';

/** Status que atendem agora: approved sempre; legacy enquanto o prazo vale (0 = sem prazo). */
export function practiceStatuses(now: Date = new Date()): string[] {
  const { legacyGraceUntilMs } = getDoctorKycConfig();
  const legacyOk = legacyGraceUntilMs === 0 || now.getTime() < legacyGraceUntilMs;
  return legacyOk ? ['approved', 'legacy'] : ['approved'];
}

export function doctorCanPractice(verificationStatus: string | null | undefined, now: Date = new Date()): boolean {
  return !!verificationStatus && practiceStatuses(now).includes(verificationStatus);
}

/** null = pode seguir; senão a resposta HTTP a devolver. Bloqueio vence tudo. */
export function doctorAccessDenial(
  doc: DoctorAccessRow,
  opts: { allowUnverified?: boolean; now?: Date } = {},
): { status: number; body: Record<string, unknown> } | null {
  if (doc.blocked) return { status: 403, body: { blocked: true, code: 'DOCTOR_BLOCKED', error: BLOCKED_MSG, reason: doc.blockedReason || undefined } };
  if (opts.allowUnverified) return null;
  if (doctorCanPractice(doc.verificationStatus, opts.now)) return null;
  return { status: 403, body: { code: 'VERIFICATION_REQUIRED', status: doc.verificationStatus, error: 'Verifique sua identidade para liberar o acesso.' } };
}
```

- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS (4 testes).

- [ ] **Step 5: Commit (só com ok do dono)** — `git add packages/server/src/utils/doctorAccess.ts packages/server/test/doctor-access-policy.test.ts && git commit -m "feat(kyc): política única de acesso do médico (bloqueio + verificação)"`

---

### Task 3: Aplicar a política nos 8 pontos + filtros da fila

**Files:**
- Modify: `src/routes/doctor.routes.ts` (`:89-110`, rotas de onboarding, PDF `:686-692`)
- Modify: `src/routes/collection.routes.ts:27-40`
- Modify: `src/routes/teleconsultaQueue.routes.ts:46-67` e `:84`
- Modify: `src/jobs/teleconsultaQueue.ts:154-155`
- Modify: `src/routes/examRequest.routes.ts:38-40` e `:53-55`
- Modify: `src/routes/consult-summary.routes.ts:48-50`
- Modify: `src/routes/teleconsulta.routes.ts:57-61`
- Test: `packages/server/test/doctor-access-gate.test.ts`

**Interfaces:**
- Consumes: `DOCTOR_ACCESS_SELECT`, `doctorAccessDenial`, `practiceStatuses` (Task 2); `createDoctor({ verificationStatus })` (Task 1).
- Produces: `requireDoctor` (deny-by-default) e `requireDoctorOnboarding` (só barra bloqueado), locais em `doctor.routes.ts`.

- [ ] **Step 1: Escrever o teste que falha** — `test/doctor-access-gate.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/utils/livekit', () => ({
  hasLiveKitConfig: vi.fn(() => true),
  buildJoinToken: vi.fn(async () => 'mock-join-token'),
  createLiveKitRoom: vi.fn(() => undefined),
}));

import { prisma } from '../src/prisma';
import { api, authHeader, resetDb, createDoctor } from './helpers';
import { saveSettings } from '../src/utils/settings';

const FAKE = 'cl0000000000000000000fake';
let crmSeq = 70000;
const nextCrm = () => `${crmSeq++}-SP`;

// Os 8 pontos que aceitam token de médico (spec §Base real). [nome, método, url, body]
const GATED: Array<[string, 'get' | 'post' | 'put', string, Record<string, unknown>?]> = [
  ['1 doctor.routes requireDoctor', 'get', '/api/doctor/patients'],
  ['2 PDF do exame (token inline)', 'get', `/api/doctor/patients/${FAKE}/exams/${FAKE}/file`],
  ['3 collection requireDoctor', 'get', `/api/doctor/patients/${FAKE}/checklist`],
  ['4 fila requireQueueDoctor', 'put', '/api/doctor/online-presence', { online: true }],
  ['5 examRequest requireDoctorIdentity', 'post', '/api/exam-requests', { patientId: FAKE }],
  ['6 examRequest requireAnyIdentity', 'get', '/api/exam-requests'],
  ['7 consult-summary requireDoctorIdentity', 'post', `/api/teleconsulta/${FAKE}/summary/generate`],
  ['8 teleconsulta requireJoinIdentity', 'get', `/api/teleconsulta/${FAKE}/join`],
];

const call = (method: 'get' | 'post' | 'put', url: string, token: string, body?: Record<string, unknown>) =>
  (api() as any)[method](url).set(authHeader(token)).send(body ?? {});

describe('gate do médico — deny-by-default nos 8 pontos (spec §7)', () => {
  beforeEach(async () => {
    await resetDb();
    await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 0 });
  });

  it.each(GATED)('%s: pending → 403 VERIFICATION_REQUIRED', async (_n, method, url, body) => {
    const { token } = await createDoctor({ crm: nextCrm(), verificationStatus: 'pending' });
    const r = await call(method, url, token, body);
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: 'VERIFICATION_REQUIRED', status: 'pending' });
  });

  it.each(GATED)('%s: bloqueado → 403 DOCTOR_BLOCKED (5 desses nem olhavam bloqueio)', async (_n, method, url, body) => {
    const { doctor, token } = await createDoctor({ crm: nextCrm() });
    await prisma.doctor.update({ where: { id: doctor.id }, data: { blocked: true, blockedReason: 'teste' } });
    const r = await call(method, url, token, body);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('DOCTOR_BLOCKED');
  });

  it.each(GATED)('%s: approved passa do gate', async (_n, method, url, body) => {
    const { token } = await createDoctor({ crm: nextCrm() });
    const r = await call(method, url, token, body);
    expect(['VERIFICATION_REQUIRED', 'DOCTOR_BLOCKED']).not.toContain(r.body?.code);
  });

  it('legacy: atende sem prazo; depois do prazo → 403', async () => {
    const { token } = await createDoctor({ crm: nextCrm(), verificationStatus: 'legacy' });
    expect((await api().get('/api/doctor/patients').set(authHeader(token))).status).toBe(200);
    await saveSettings('doctorKyc', { legacyGraceUntilMs: Date.now() - 1000 });
    const r = await api().get('/api/doctor/patients').set(authHeader(token));
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: 'VERIFICATION_REQUIRED', status: 'legacy' });
  });

  it('onboarding liberado p/ pending (perfil, MFA, plano)', async () => {
    const { token } = await createDoctor({ crm: nextCrm(), verificationStatus: 'pending' });
    expect((await api().get('/api/doctor/me').set(authHeader(token))).status).toBe(200);
    expect((await api().put('/api/doctor/profile').set(authHeader(token)).send({ bio: 'oi' })).status).toBe(200);
    expect((await api().get('/api/doctor/mfa/status').set(authHeader(token))).status).toBe(200);
    expect((await api().get('/api/doctor/me/plan').set(authHeader(token))).status).toBe(200);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test --workspace packages/server -- test/doctor-access-gate.test.ts` → FAIL (pending passa; pontos 2, 5-8 não barram bloqueado).

- [ ] **Step 3: `doctor.routes.ts` — requireDoctor com a política.** Acrescentar nos imports do topo:
```ts
import { DOCTOR_ACCESS_SELECT, doctorAccessDenial } from '../utils/doctorAccess';
```
e trocar o bloco inteiro `const requireDoctor = async (req: any, res: any, next: any) => { ... };` (`:89-110`) por:
```ts
// Política única (utils/doctorAccess.ts, spec §7): bloqueado → 403 DOCTOR_BLOCKED; quem não pode
// atender → 403 VERIFICATION_REQUIRED. Onboarding (perfil/senha/foto/MFA/plano) usa
// requireDoctorOnboarding, que só barra bloqueado.
const makeRequireDoctor = (allowUnverified: boolean) => async (req: any, res: any, next: any) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) { res.status(401).json({ error: 'Token obrigatório.' }); return; }
  const payload = verifyDoctorToken(auth.slice(7));
  if (!payload?.doctorId) { res.status(401).json({ error: 'Token médico inválido.' }); return; }
  const doc = await prisma.doctor.findUnique({ where: { id: payload.doctorId }, select: DOCTOR_ACCESS_SELECT });
  if (!doc) { res.status(401).json({ error: 'Médico não encontrado.' }); return; }
  const denial = doctorAccessDenial(doc, { allowUnverified });
  if (denial) { res.status(denial.status).json(denial.body); return; }
  req.doctorId = payload.doctorId;
  next();
};
const requireDoctor = makeRequireDoctor(false);
const requireDoctorOnboarding = makeRequireDoctor(true);
```

- [ ] **Step 4: Onboarding** — em `doctor.routes.ts`, trocar `requireDoctor` por `requireDoctorOnboarding` exatamente nestas declarações (e em nenhuma outra):

| Rota (texto exato) | linha atual |
|---|---|
| `router.get('/me/plan', requireDoctor,` | :126 |
| `router.get('/mfa/status', requireDoctor,` | :453 |
| `router.put('/profile', requireDoctor,` | :457 |
| `router.get('/me', requireDoctor,` (as **duas**) | :475 e :484 |
| `router.post('/mfa/setup/start', requireDoctor,` | :479 |
| `router.post('/mfa/setup/confirm', requireDoctor,` | :480 |
| `router.post('/mfa/disable', requireDoctor,` | :481 |
| `router.put('/me', requireDoctor,` | :491 |
| `router.put('/me/password', requireDoctor,` | :535 |
| `router.post('/me/photo', requireDoctor,` | :550 |

- [ ] **Step 5: PDF do exame** — na rota `router.get('/patients/:patientId/exams/:examId/file'` (`:686`), logo depois de
```ts
    if (!doctorId) { res.status(401).json({ error: 'Sem permissão.' }); return; }
```
inserir:
```ts
    // Política única (spec §7): este endpoint não passava por requireDoctor — nem bloqueio checava.
    const fileDoc = await prisma.doctor.findUnique({ where: { id: doctorId }, select: DOCTOR_ACCESS_SELECT });
    if (!fileDoc) { res.status(401).json({ error: 'Sem permissão.' }); return; }
    const fileDenial = doctorAccessDenial(fileDoc);
    if (fileDenial) { res.status(fileDenial.status).json(fileDenial.body); return; }
```

- [ ] **Step 6: `collection.routes.ts`** — import `import { DOCTOR_ACCESS_SELECT, doctorAccessDenial } from '../utils/doctorAccess';` e trocar o `requireDoctor` (`:27-40`) por:
```ts
const requireDoctor = async (req: any, res: any, next: any) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) { res.status(401).json({ error: 'Token obrigatório.' }); return; }
  const payload = verifyDoctorToken(auth.slice(7));
  if (!payload?.doctorId) { res.status(401).json({ error: 'Token médico inválido.' }); return; }
  const doc = await prisma.doctor.findUnique({ where: { id: payload.doctorId }, select: DOCTOR_ACCESS_SELECT });
  if (!doc) { res.status(401).json({ error: 'Médico não encontrado.' }); return; }
  const denial = doctorAccessDenial(doc); // política única (spec §7)
  if (denial) { res.status(denial.status).json(denial.body); return; }
  req.doctorId = payload.doctorId;
  next();
};
```

- [ ] **Step 7: `teleconsultaQueue.routes.ts`** — import `import { DOCTOR_ACCESS_SELECT, doctorAccessDenial, practiceStatuses } from '../utils/doctorAccess';`. Em `requireQueueDoctor`, trocar:
```ts
  const doc = await prisma.doctor.findUnique({
    where: { id: payload.doctorId },
    select: { id: true, blocked: true, blockedReason: true },
  });
  if (!doc) { res.status(401).json({ error: 'Médico não encontrado.' }); return; }
  if (doc.blocked) {
    res.status(403).json({
      blocked: true,
      error: 'Acesso suspenso pela administração. Entre em contato com o suporte: contato@janocaminho.com.br',
      reason: doc.blockedReason || undefined,
    });
    return;
  }
  req.doctorId = doc.id;
```
por:
```ts
  const doc = await prisma.doctor.findUnique({ where: { id: payload.doctorId }, select: DOCTOR_ACCESS_SELECT });
  if (!doc) { res.status(401).json({ error: 'Médico não encontrado.' }); return; }
  const denial = doctorAccessDenial(doc); // política única (spec §7) — a spec da fila previa "CRM verificado"
  if (denial) { res.status(denial.status).json(denial.body); return; }
  req.doctorId = doc.id;
```
e na `:84`:
```ts
      where: { ...freshPresenceWhere(now), doctor: { blocked: false, verificationStatus: { in: practiceStatuses() } } },
```

- [ ] **Step 8: `jobs/teleconsultaQueue.ts`** — import `import { practiceStatuses } from '../utils/doctorAccess';` e trocar
```ts
      const candidates = await tx.doctorOnlinePresence.findMany({
        where: { online: true, lastHeartbeatAt: { gte: freshCutoff } },
```
por
```ts
      const candidates = await tx.doctorOnlinePresence.findMany({
        where: { online: true, lastHeartbeatAt: { gte: freshCutoff }, doctor: { verificationStatus: { in: practiceStatuses(now) } } },
```

- [ ] **Step 9: `examRequest.routes.ts`** — import `import { DOCTOR_ACCESS_SELECT, doctorAccessDenial } from '../utils/doctorAccess';`. Em `requireDoctorIdentity` trocar:
```ts
  const doc = await prisma.doctor.findUnique({ where: { id: payload.doctorId }, select: { id: true } });
  if (!doc) { res.status(401).json({ error: 'Token médico inválido.' }); return; }
  req.doctorId = doc.id;
```
por:
```ts
  const doc = await prisma.doctor.findUnique({ where: { id: payload.doctorId }, select: DOCTOR_ACCESS_SELECT });
  if (!doc) { res.status(401).json({ error: 'Token médico inválido.' }); return; }
  const denial = doctorAccessDenial(doc); // spec §7: antes nem checava bloqueio
  if (denial) { res.status(denial.status).json(denial.body); return; }
  req.doctorId = doc.id;
```
e no ramo médico de `requireAnyIdentity` (indentação de 4) trocar:
```ts
    const doc = await prisma.doctor.findUnique({ where: { id: payload.doctorId }, select: { id: true } });
    if (!doc) { res.status(401).json({ error: 'Token médico inválido.' }); return; }
    req.doctorId = doc.id;
```
por:
```ts
    const doc = await prisma.doctor.findUnique({ where: { id: payload.doctorId }, select: DOCTOR_ACCESS_SELECT });
    if (!doc) { res.status(401).json({ error: 'Token médico inválido.' }); return; }
    const denial = doctorAccessDenial(doc);
    if (denial) { res.status(denial.status).json(denial.body); return; }
    req.doctorId = doc.id;
```

- [ ] **Step 10: `consult-summary.routes.ts`** — mesmo import; em `requireDoctorIdentity` trocar:
```ts
  const doc = await prisma.doctor.findUnique({ where: { id: payload.doctorId }, select: { id: true } });
  if (!doc) { res.status(401).json({ error: 'Token médico inválido.' }); return; }
  req.doctorId = doc.id;
```
por:
```ts
  const doc = await prisma.doctor.findUnique({ where: { id: payload.doctorId }, select: DOCTOR_ACCESS_SELECT });
  if (!doc) { res.status(401).json({ error: 'Token médico inválido.' }); return; }
  const denial = doctorAccessDenial(doc); // spec §7: antes nem checava bloqueio
  if (denial) { res.status(denial.status).json(denial.body); return; }
  req.doctorId = doc.id;
```

- [ ] **Step 11: `teleconsulta.routes.ts`** — import `import { doctorAccessDenial } from '../utils/doctorAccess';`; no ramo médico de `requireJoinIdentity` trocar:
```ts
    const doc = await prisma.doctor.findUnique({
      where: { id: payload.doctorId },
      select: { id: true, name: true, crm: true, crmUf: true },
    });
    if (!doc) { res.status(401).json({ error: 'Token médico inválido.' }); return; }
```
por:
```ts
    const doc = await prisma.doctor.findUnique({
      where: { id: payload.doctorId },
      select: { id: true, name: true, crm: true, crmUf: true, blocked: true, blockedReason: true, verificationStatus: true },
    });
    if (!doc) { res.status(401).json({ error: 'Token médico inválido.' }); return; }
    const denial = doctorAccessDenial(doc); // spec §7: o join do médico nem checava bloqueio
    if (denial) { res.status(denial.status).json(denial.body); return; }
```

- [ ] **Step 12: Rodar o teste do gate** — `npm test --workspace packages/server -- test/doctor-access-gate.test.ts` → PASS (8×3 + 2).

- [ ] **Step 13: Suíte inteira + ajuste dos testes antigos**

Run: `npm test --workspace packages/server`
Falhas esperadas **só** por `VERIFICATION_REQUIRED` em testes que criam médico direto no Prisma e usam token de médico: `test/doctor-lookup.test.ts`, `test/doctor-sports-portal.test.ts`, `test/medications.test.ts`, `test/my-consultations.routes.test.ts`, `test/my-doctors.routes.test.ts`, `test/poc-xss.test.ts`, `test/specialists.routes.test.ts`. Correção: em cada `prisma.doctor.create({ data: { ... } })` desses arquivos, acrescentar `verificationStatus: 'approved',` ao `data`. Se algum teste comparar o corpo antigo do bloqueio da collection (`{ error: 'Acesso suspenso pela administração.' }`), trocar por `expect(r.body.code).toBe('DOCTOR_BLOCKED')`. Qualquer outra falha: parar e investigar.
Expected depois: suíte verde.

- [ ] **Step 14: Typecheck** — `cd packages/server && npx prisma generate && npx tsc --noEmit` → sem erros.

- [ ] **Step 15: Commit (só com ok do dono)** — `git add packages/server/src packages/server/test && git commit -m "feat(kyc): gate deny-by-default nos 8 pontos de token de médico (+ bloqueio onde faltava) e filtros da fila"`

---

### Task 4: CFM — situação em 3 estados + UFs

**Files:**
- Modify: `packages/server/src/utils/cfm.ts` (acrescentar no fim)
- Test: `packages/server/src/utils/cfm.test.ts` (acrescentar)

**Interfaces:**
- Produces: `type CfmState = 'active' | 'inactive' | 'unknown'`; `cfmState(situation: string | null | undefined): CfmState`; `BR_UFS: ReadonlySet<string>`.

- [ ] **Step 1: Teste que falha** — em `src/utils/cfm.test.ts`, trocar o import por `import { lookupCfm, cfmState, BR_UFS } from './cfm';` e acrescentar no fim:

```ts
describe('cfmState (situação do CFM em 3 estados)', () => {
  it('Ativo → active', () => { expect(cfmState('Ativo')).toBe('active'); expect(cfmState('ATIVO')).toBe('active'); });
  it('"Inativo" NÃO é ativo (regressão do /ativo/i do cadastro)', () => expect(cfmState('Inativo')).toBe('inactive'));
  it('cancelado/cassado/suspenso/falecido → inactive', () => {
    for (const s of ['Cancelado', 'Cassado', 'Suspenso', 'Falecido']) expect(cfmState(s)).toBe('inactive');
  });
  it('vazio ou desconhecido → unknown', () => {
    expect(cfmState('')).toBe('unknown');
    expect(cfmState(null)).toBe('unknown');
    expect(cfmState('Regular')).toBe('unknown');
  });
});

describe('BR_UFS', () => {
  it('27 UFs; ZZ fora', () => {
    expect(BR_UFS.size).toBe(27);
    expect(BR_UFS.has('SP')).toBe(true);
    expect(BR_UFS.has('ZZ')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test --workspace packages/server -- src/utils/cfm.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — em `src/utils/cfm.ts`, acrescentar `import { normalizeKey } from './normalize';` no topo e no fim do arquivo:

```ts
/** 27 UFs — valida CRM/UF de entrada (AUD-003: '000000-ZZ' passava). */
export const BR_UFS: ReadonlySet<string> = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

/** Situação do CFM em 3 estados. `/ativo/i` casava "Inativo" (bug do cadastro) — aqui é exato. */
export type CfmState = 'active' | 'inactive' | 'unknown';
export function cfmState(situation: string | null | undefined): CfmState {
  const s = normalizeKey(String(situation ?? ''));
  if (!s) return 'unknown';
  if (/^ATIV[OA]\b/.test(s)) return 'active';
  if (/INATIV|CANCELAD|CASSAD|SUSPENS|FALECID|INTERDIT|APOSENTAD|TRANSFERID|BAIXAD/.test(s)) return 'inactive';
  return 'unknown';
}
```

- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS.

- [ ] **Step 5: Commit (só com ok do dono)** — `git add packages/server/src/utils/cfm.ts packages/server/src/utils/cfm.test.ts && git commit -m "feat(kyc): cfmState em 3 estados (corrige 'Inativo' passando) + BR_UFS"`

---

### Task 5: Cliente UaiID + assinatura do webhook

**Files:**
- Create: `packages/server/src/utils/uaiid.ts`
- Modify: `packages/server/test/setup.ts` (zerar env do UaiID)
- Test: `packages/server/src/utils/uaiid.test.ts`

**Interfaces:**
- Produces:
  - `class UaiidError extends Error { code: 'KYC_UNAVAILABLE' | 'KYC_ATTEMPT_LIMIT'; retryAfterHours?: number }`
  - `createUaiidVerification(input: { cpf; fullName; externalReference; returnUrl; idempotencyKey }): Promise<{ verificationId: string; verifyUrl: string; expiresAt: Date | null; reused: boolean }>`
  - `interface UaiidVerification { id; status; reasonCode: string | null; score: number | null; nameRatio: number | null; cpfSituacao: string | null; externalReference: string | null; completedAt: Date | null }`
  - `getUaiidVerification(id: string): Promise<UaiidVerification | null>`
  - `verifyUaiidSignature(rawBody: Buffer | string, header: string | undefined, secret: string, nowSec?: number, toleranceSec?: number): boolean`

- [ ] **Step 1: Teste que falha** — `src/utils/uaiid.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { createUaiidVerification, getUaiidVerification, verifyUaiidSignature, UaiidError } from './uaiid';

// lida na chamada (padrão cfm.ts); test/setup.ts zera, aqui pomos uma fake.
process.env.UAIID_API_KEY = 'uai_test_key';
const sign = (secret: string, t: number, body: string) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

describe('verifyUaiidSignature', () => {
  const body = '{"id":"e1","event":"verification.approved","verification_id":"v1","data":{}}';
  const t = 1760000000;
  it('válida → true', () => expect(verifyUaiidSignature(body, sign('whsec_x', t, body), 'whsec_x', t)).toBe(true));
  it('aceita Buffer (corpo cru do express.raw)', () => expect(verifyUaiidSignature(Buffer.from(body), sign('whsec_x', t, body), 'whsec_x', t)).toBe(true));
  it('segredo errado → false', () => expect(verifyUaiidSignature(body, sign('outro', t, body), 'whsec_x', t)).toBe(false));
  it('corpo alterado → false', () => expect(verifyUaiidSignature(body + ' ', sign('whsec_x', t, body), 'whsec_x', t)).toBe(false));
  it('t fora de ±300s → false', () => expect(verifyUaiidSignature(body, sign('whsec_x', t, body), 'whsec_x', t + 301)).toBe(false));
  it('header ausente/malformado → false', () => {
    expect(verifyUaiidSignature(body, undefined, 'whsec_x', t)).toBe(false);
    expect(verifyUaiidSignature(body, 'v1=abc', 'whsec_x', t)).toBe(false);
    expect(verifyUaiidSignature(body, `t=${t},v1=zz`, 'whsec_x', t)).toBe(false);
  });
});

describe('createUaiidVerification', () => {
  beforeEach(() => vi.restoreAllMocks());
  const input = { cpf: '529.982.247-25', fullName: 'MARIA SOUZA', externalReference: 'doc-1', returnUrl: 'https://drexame.janocaminho.com.br/#/doctor?kyc=1', idempotencyKey: 'drexame-doc-1-1' };

  it('POST no contrato real → mapeia a resposta', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ verification_id: 'v-1', verify_url: 'https://uaiid.com.br/verify/ab12', expires_at: '2026-10-29T12:00:00Z', reused_session: false }) });
    vi.stubGlobal('fetch', f);
    expect(await createUaiidVerification(input)).toEqual({ verificationId: 'v-1', verifyUrl: 'https://uaiid.com.br/verify/ab12', expiresAt: new Date('2026-10-29T12:00:00Z'), reused: false });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.uaiid.com.br/v1/verifications');
    expect(init.headers.Authorization).toBe('Bearer uai_test_key');
    expect(init.headers['Idempotency-Key']).toBe('drexame-doc-1-1');
    expect(JSON.parse(init.body)).toEqual({ cpf: '52998224725', full_name: 'MARIA SOUZA', external_reference: 'doc-1', return_url: input.returnUrl, mode: 'full', flow: 'own' });
  });

  it('429 → KYC_ATTEMPT_LIMIT com retryAfterHours', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ error_code: 'attempt_limit_cooldown', retry_after_hours: 3 }) }));
    await expect(createUaiidVerification(input)).rejects.toMatchObject({ code: 'KYC_ATTEMPT_LIMIT', retryAfterHours: 3 });
  });

  it('500 / rede → KYC_UNAVAILABLE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    await expect(createUaiidVerification(input)).rejects.toBeInstanceOf(UaiidError);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    await expect(createUaiidVerification(input)).rejects.toMatchObject({ code: 'KYC_UNAVAILABLE' });
  });

  it('sem UAIID_API_KEY → KYC_UNAVAILABLE sem chamar fetch', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const saved = process.env.UAIID_API_KEY;
    delete process.env.UAIID_API_KEY;
    await expect(createUaiidVerification(input)).rejects.toMatchObject({ code: 'KYC_UNAVAILABLE' });
    expect(f).not.toHaveBeenCalled();
    process.env.UAIID_API_KEY = saved;
  });
});

describe('getUaiidVerification', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('mapeia VerificationOut (result.score, name_ratio, Receita)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      id: 'v-1', status: 'approved', reason_code: null, external_reference: 'doc-1', completed_at: '2026-10-28T12:10:06Z',
      result: { score: 830, face_similarity: 0.91, declared_vs_document: { name_ratio: 1, name_ok: true }, receita_federal: { situacao_cadastral: 'REGULAR' } },
    }) }));
    expect(await getUaiidVerification('v-1')).toEqual({ id: 'v-1', status: 'approved', reasonCode: null, score: 830, nameRatio: 1, cpfSituacao: 'REGULAR', externalReference: 'doc-1', completedAt: new Date('2026-10-28T12:10:06Z') });
  });

  it('name_ratio ausente/nulo → nameRatio null (não 0)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'v-2', status: 'manual_review', reason_code: 'document_not_recognized', result: { declared_vs_document: { name_ratio: null } } }) }));
    expect((await getUaiidVerification('v-2'))?.nameRatio).toBeNull();
  });

  it('falha → null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    expect(await getUaiidVerification('v-x')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test --workspace packages/server -- src/utils/uaiid.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar** — `src/utils/uaiid.ts`

```ts
/**
 * Cliente do UaiID (KYC do médico) — padrão defensivo do utils/cfm.ts: env lida NA CHAMADA,
 * timeout, CPF nunca em log. Contrato conferido no código do UaiID (spec §Base real):
 *   POST /v1/verifications → {verification_id, verify_url, expires_at, reused_session}
 *   GET  /v1/verifications/{id} → {id, status, reason_code, external_reference, result, completed_at}
 *   Webhook: X-Uai-Signature "t=<unix>,v1=<hex>" = HMAC-SHA256(`${t}.${corpo cru}`).
 * API em https://api.uaiid.com.br (a doc pública diz uaiid.com.br/v1 — dá 404).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type UaiidErrorCode = 'KYC_UNAVAILABLE' | 'KYC_ATTEMPT_LIMIT';
export class UaiidError extends Error {
  constructor(public readonly code: UaiidErrorCode, public readonly retryAfterHours?: number) {
    super(code);
    this.name = 'UaiidError';
  }
}

const baseUrl = () => (process.env.UAIID_BASE_URL || 'https://api.uaiid.com.br').replace(/\/+$/, '');
const timeoutMs = () => Number(process.env.UAIID_TIMEOUT_MS) || 8000;
const apiKey = () => process.env.UAIID_API_KEY || '';
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export interface UaiidCreateInput { cpf: string; fullName: string; externalReference: string; returnUrl: string; idempotencyKey: string }
export interface UaiidCreated { verificationId: string; verifyUrl: string; expiresAt: Date | null; reused: boolean }

/** Cria a verificação (o UaiID reaproveita sessão aberta do mesmo CPF). Lança UaiidError. */
export async function createUaiidVerification(input: UaiidCreateInput): Promise<UaiidCreated> {
  if (!apiKey()) throw new UaiidError('KYC_UNAVAILABLE');
  const res = await fetch(`${baseUrl()}/v1/verifications`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json', 'Idempotency-Key': input.idempotencyKey },
    body: JSON.stringify({
      cpf: input.cpf.replace(/\D/g, ''),
      full_name: input.fullName,
      external_reference: input.externalReference,
      return_url: input.returnUrl,
      mode: 'full',
      flow: 'own',
    }),
    signal: AbortSignal.timeout(timeoutMs()),
  }).catch(() => null);
  if (!res) throw new UaiidError('KYC_UNAVAILABLE');
  const data: any = await res.json().catch(() => ({}));
  if (res.status === 429) throw new UaiidError('KYC_ATTEMPT_LIMIT', num(data?.retry_after_hours) ?? undefined);
  if (!res.ok || !data?.verification_id || !data?.verify_url) throw new UaiidError('KYC_UNAVAILABLE');
  return {
    verificationId: String(data.verification_id),
    verifyUrl: String(data.verify_url),
    expiresAt: data.expires_at ? new Date(data.expires_at) : null,
    reused: !!data.reused_session,
  };
}

export interface UaiidVerification {
  id: string;
  status: string;
  reasonCode: string | null;
  score: number | null;
  nameRatio: number | null;
  cpfSituacao: string | null;
  externalReference: string | null;
  completedAt: Date | null;
}

/** Fonte da verdade da decisão. Qualquer falha → null (o chamador tenta de novo depois). */
export async function getUaiidVerification(id: string): Promise<UaiidVerification | null> {
  if (!apiKey()) return null;
  const res = await fetch(`${baseUrl()}/v1/verifications/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${apiKey()}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs()),
  }).catch(() => null);
  if (!res?.ok) return null;
  const d: any = await res.json().catch(() => null);
  if (!d?.status) return null;
  const r = d.result ?? {};
  return {
    id: String(d.id ?? id),
    status: String(d.status),
    reasonCode: d.reason_code ?? null,
    score: num(r.score),
    nameRatio: num(r.declared_vs_document?.name_ratio),
    cpfSituacao: typeof r.receita_federal?.situacao_cadastral === 'string' ? r.receita_federal.situacao_cadastral : null,
    externalReference: d.external_reference ?? null,
    completedAt: d.completed_at ? new Date(d.completed_at) : null,
  };
}

/** Confere o X-Uai-Signature sobre o corpo CRU (security.py:104 do UaiID). */
export function verifyUaiidSignature(
  rawBody: Buffer | string,
  header: string | undefined,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
  toleranceSec = 300,
): boolean {
  if (!header || !secret) return false;
  const parts = new Map(header.split(',').map((p) => {
    const i = p.indexOf('=');
    return [p.slice(0, i).trim(), p.slice(i + 1).trim()] as const;
  }));
  const t = Number(parts.get('t'));
  const v1 = parts.get('v1') ?? '';
  if (!Number.isInteger(t) || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  if (Math.abs(nowSec - t) > toleranceSec) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  const expected = createHmac('sha256', secret).update(`${t}.`).update(body).digest();
  const given = Buffer.from(v1, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
```

- [ ] **Step 4: Zerar o UaiID no setup dos testes** — em `test/setup.ts`, no bloco "externais DESLIGADOS", acrescentar:
```ts
process.env.UAIID_API_KEY = ''; // KYC: nunca chamar o UaiID real nos testes (o .env local tem a chave de dev)
process.env.UAIID_WEBHOOK_SECRET = '';
```

- [ ] **Step 5: Rodar e ver passar** — `npm test --workspace packages/server -- src/utils/uaiid.test.ts` → PASS.

- [ ] **Step 6: Commit (só com ok do dono)** — `git add packages/server/src/utils/uaiid.ts packages/server/src/utils/uaiid.test.ts packages/server/test/setup.ts && git commit -m "feat(kyc): cliente UaiID (create/get) + verificação HMAC do webhook"`

---

### Task 6: Decisão pura — identidade × CRM

**Files:**
- Create: `packages/server/src/kyc/decide.ts`
- Test: `packages/server/src/kyc/decide.test.ts`

**Interfaces:**
- Consumes: `cfmState` (Task 4), `normalizeKey` (`utils/normalize.ts:4`).
- Produces:
  - `type DoctorKycStatus = 'pending' | 'in_progress' | 'uaiid_review' | 'needs_admin' | 'approved' | 'rejected' | 'legacy'`
  - `NON_FINAL_ATTEMPT: readonly string[]` = `['created', 'consent_pending', 'collecting', 'processing', 'challenge']`
  - `strictName(s: string | null | undefined): string`
  - `interface DecisionInput { remote: { status: string; reasonCode: string | null; nameRatio: number | null }; expiresAt: Date | null; documentName: string | null; cfm: { name: string; situation: string | null } | null; autoApprove: boolean; now: Date }`
  - `interface Decision { attemptStatus: string; doctorStatus: DoctorKycStatus; reason: string | null; nameMatch: boolean | null; fraud: boolean; final: boolean }`
  - `decideDoctorVerification(i: DecisionInput): Decision`

- [ ] **Step 1: Teste que falha** — `src/kyc/decide.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { decideDoctorVerification, strictName, type DecisionInput } from './decide';

const now = new Date('2026-10-28T12:00:00Z');
const base = (over: Partial<DecisionInput> = {}): DecisionInput => ({
  remote: { status: 'approved', reasonCode: null, nameRatio: null },
  expiresAt: null,
  documentName: 'Maria da Silva Souza',
  cfm: { name: 'MARIA SILVA SOUZA', situation: 'Ativo' },
  autoApprove: true,
  now,
  ...over,
});
const remote = (status: string, reasonCode: string | null = null, nameRatio: number | null = null) => ({ status, reasonCode, nameRatio });

describe('strictName', () => {
  it('tira pontuação, acento, caixa e partículas', () => {
    expect(strictName("Maria-José D'Ávila dos Santos")).toBe('MARIA JOSE D AVILA SANTOS');
    expect(strictName('  joão  da   silva ')).toBe('JOAO SILVA');
  });
});

describe('decideDoctorVerification (spec §4)', () => {
  it('em andamento → in_progress, não final', () => {
    expect(decideDoctorVerification(base({ remote: remote('collecting') }))).toMatchObject({ doctorStatus: 'in_progress', final: false });
  });
  it('em andamento com link vencido → tentativa expired, médico pending', () => {
    expect(decideDoctorVerification(base({ remote: remote('collecting'), expiresAt: new Date('2026-10-28T11:00:00Z') })))
      .toMatchObject({ attemptStatus: 'expired', doctorStatus: 'pending', final: true });
  });
  it('status desconhecido → espera (in_progress)', () => {
    expect(decideDoctorVerification(base({ remote: remote('queued') }))).toMatchObject({ doctorStatus: 'in_progress', final: false });
  });
  it('manual_review → uaiid_review (decide no painel do UaiID)', () => {
    expect(decideDoctorVerification(base({ remote: remote('manual_review', 'document_not_recognized') })))
      .toMatchObject({ doctorStatus: 'uaiid_review', reason: 'document_not_recognized', final: false });
  });
  it('rejected comum → rejected sem fraude; fraud_confirmed → fraude', () => {
    expect(decideDoctorVerification(base({ remote: remote('rejected', 'face_mismatch') }))).toMatchObject({ doctorStatus: 'rejected', fraud: false });
    expect(decideDoctorVerification(base({ remote: remote('rejected', 'fraud_confirmed') }))).toMatchObject({ doctorStatus: 'rejected', fraud: true });
  });
  it('cancelled → pending', () => {
    expect(decideDoctorVerification(base({ remote: remote('cancelled') }))).toMatchObject({ doctorStatus: 'pending', final: true });
  });
  it('approved + nome igual (estrito) + CFM ativo → approved', () => {
    expect(decideDoctorVerification(base())).toMatchObject({ doctorStatus: 'approved', nameMatch: true, final: true });
  });
  it('approved + "Souza" × "Santos" (passaria nos 0.75 do UaiID) → needs_admin name_mismatch', () => {
    expect(decideDoctorVerification(base({ documentName: 'Maria Silva Santos' })))
      .toMatchObject({ doctorStatus: 'needs_admin', reason: 'name_mismatch', nameMatch: false });
  });
  it('approved sem nome do webhook: ratio 1 → approved; 0.9 → name_mismatch; null → document_name_unavailable', () => {
    expect(decideDoctorVerification(base({ documentName: null, remote: remote('approved', null, 1) }))).toMatchObject({ doctorStatus: 'approved' });
    expect(decideDoctorVerification(base({ documentName: null, remote: remote('approved', null, 0.9) }))).toMatchObject({ doctorStatus: 'needs_admin', reason: 'name_mismatch' });
    expect(decideDoctorVerification(base({ documentName: null }))).toMatchObject({ doctorStatus: 'needs_admin', reason: 'document_name_unavailable' });
  });
  it('approved sem snapshot do CFM → needs_admin cfm_unavailable', () => {
    expect(decideDoctorVerification(base({ cfm: null }))).toMatchObject({ doctorStatus: 'needs_admin', reason: 'cfm_unavailable' });
  });
  it('approved com CFM "Inativo" → rejected crm_inactive', () => {
    expect(decideDoctorVerification(base({ cfm: { name: 'MARIA SILVA SOUZA', situation: 'Inativo' } })))
      .toMatchObject({ doctorStatus: 'rejected', reason: 'crm_inactive' });
  });
  it('approved com situação desconhecida → needs_admin cfm_situation_unknown', () => {
    expect(decideDoctorVerification(base({ cfm: { name: 'MARIA SILVA SOUZA', situation: '' } })))
      .toMatchObject({ doctorStatus: 'needs_admin', reason: 'cfm_situation_unknown' });
  });
  it('tudo verde com autoApprove desligado (política do começo) → needs_admin manual_policy', () => {
    expect(decideDoctorVerification(base({ autoApprove: false })))
      .toMatchObject({ doctorStatus: 'needs_admin', reason: 'manual_policy', nameMatch: true, final: true });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test --workspace packages/server -- src/kyc/decide.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — `src/kyc/decide.ts`

```ts
import { normalizeKey } from '../utils/normalize';
import { cfmState } from '../utils/cfm';

/**
 * Decisão PURA do KYC do médico (spec verificação §4). Duas provas, as duas obrigatórias:
 * o UaiID prova QUEM é a pessoa; aqui provamos que ela é o TITULAR do CRM (nome estrito = CFM).
 */
export type DoctorKycStatus = 'pending' | 'in_progress' | 'uaiid_review' | 'needs_admin' | 'approved' | 'rejected' | 'legacy';

/** Tentativa ainda em andamento no UaiID. */
export const NON_FINAL_ATTEMPT: readonly string[] = ['created', 'consent_pending', 'collecting', 'processing', 'challenge'];

const PARTICLES = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E']);

/** Nome canônico p/ comparação ESTRITA: sem pontuação, maiúsculas, sem acento, sem partículas. */
export function strictName(s: string | null | undefined): string {
  return normalizeKey(String(s ?? '').replace(/[^\p{L}\s]/gu, ' '))
    .split(' ')
    .filter((w) => w && !PARTICLES.has(w))
    .join(' ');
}

export interface DecisionInput {
  remote: { status: string; reasonCode: string | null; nameRatio: number | null };
  expiresAt: Date | null;
  documentName: string | null; // do webhook assinado (data.full_name), se veio
  cfm: { name: string; situation: string | null } | null; // snapshot da criação = nome declarado ao UaiID
  autoApprove: boolean; // doctorKyc.autoApprove === 1 (0 = todo médico passa pelo dono)
  now: Date;
}

export interface Decision {
  attemptStatus: string;
  doctorStatus: DoctorKycStatus;
  reason: string | null;
  nameMatch: boolean | null;
  fraud: boolean;
  final: boolean;
}

const out = (attemptStatus: string, doctorStatus: DoctorKycStatus, final: boolean, reason: string | null = null, nameMatch: boolean | null = null, fraud = false): Decision =>
  ({ attemptStatus, doctorStatus, reason, nameMatch, fraud, final });

export function decideDoctorVerification(i: DecisionInput): Decision {
  const st = i.remote.status;
  if (NON_FINAL_ATTEMPT.includes(st)) {
    if (i.expiresAt && i.expiresAt.getTime() < i.now.getTime()) return out('expired', 'pending', true, 'expired');
    return out(st, 'in_progress', false);
  }
  if (st === 'manual_review') return out(st, 'uaiid_review', false, i.remote.reasonCode);
  if (st === 'rejected') return out(st, 'rejected', true, i.remote.reasonCode ?? 'rejected', null, i.remote.reasonCode === 'fraud_confirmed');
  if (st === 'cancelled' || st === 'expired') return out(st, 'pending', true, st);
  if (st !== 'approved') return out(st, 'in_progress', false); // status novo/desconhecido: espera

  // Identidade OK no UaiID — agora: essa pessoa é o titular do CRM?
  if (!i.cfm) return out(st, 'needs_admin', true, 'cfm_unavailable');
  const state = cfmState(i.cfm.situation);
  if (state === 'inactive') return out(st, 'rejected', true, 'crm_inactive');
  let nameMatch: boolean | null = null;
  if (i.documentName) nameMatch = strictName(i.documentName) === strictName(i.cfm.name);
  else if (i.remote.nameRatio !== null) nameMatch = i.remote.nameRatio >= 0.999; // declarado ao UaiID = nome do CFM
  if (nameMatch === null) return out(st, 'needs_admin', true, 'document_name_unavailable');
  if (!nameMatch) return out(st, 'needs_admin', true, 'name_mismatch', false);
  if (state === 'unknown') return out(st, 'needs_admin', true, 'cfm_situation_unknown', true);
  // Tudo verde. Política do dono (28/10/26): no começo todo médico passa pela fila (autoApprove 0).
  if (!i.autoApprove) return out(st, 'needs_admin', true, 'manual_policy', true);
  return out(st, 'approved', true, null, true);
}
```

- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS.

- [ ] **Step 5: Commit (só com ok do dono)** — `git add packages/server/src/kyc/decide.ts packages/server/src/kyc/decide.test.ts && git commit -m "feat(kyc): decisão pura identidade × CRM (nome estrito = CFM)"`

---

### Task 6b: Mensagens e e-mails premium do KYC

**Files:**
- Create: `packages/server/src/kyc/messages.ts`
- Create: `packages/server/src/kyc/emails.ts`
- Create: `packages/server/src/kyc/notify.ts`
- Create: `packages/server/scripts/preview-kyc-emails.ts`
- Test: `packages/server/test/kyc-notify.test.ts`

**Antes de escrever:** carregar as skills do projeto `design-system-guardian` (identidade: teal `#20b2aa`/`#178f89`, cobre `#d4a574`, Poppins + Inter, cards 16, botão 12, mascote `app-icon.png`, dark `#0f1818`/`#1a2424`/`#e8eef0` — `.claude/DESIGN_SYSTEM.md`) e `conversion-copywriter` (tom dos textos). O layout abaixo já segue os tokens; o acabamento é validado no Step 7.

**Interfaces:**
- Consumes: `stripDoctorTitle` (`utils/doctorTitle.ts:9`), `sendEmail` (`utils/mailer`), `createLogger` (`utils/logger`).
- Produces:
  - `kycMessage(reasonCode: string | null | undefined): string | null`
  - `escapeHtml(s: unknown): string`
  - `DOCTOR_KYC_SUBJECTS: { received: string; approved: string; rejected: string }`
  - `doctorKycEmail(i: { name: string; crm?: string | null; kind: 'received' | 'approved' | 'rejected'; reason?: string | null; portalUrl: string }): string`
  - `kycAdminEmail(i: { title: string; lines: string[]; adminUrl: string }): string`
  - `notifyKycAdmin(subject: string, lines: string[]): Promise<void>` — linhas em texto puro (o template escapa); nunca lança
  - `notifyDoctorKyc(doctor: { name: string; email: string; crm?: string | null }, kind: 'received' | 'approved' | 'rejected', reasonCode?: string | null, reasonText?: string | null): Promise<void>` — nunca lança; `reasonText` (motivo escrito pelo dono na recusa manual) tem precedência sobre `kycMessage(reasonCode)` (dono, 28/10: "caso reprovado explicar o porquê por email")

- [ ] **Step 1: Teste que falha** — `test/kyc-notify.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendEmail } from '../src/utils/mailer';
import { notifyDoctorKyc, notifyKycAdmin } from '../src/kyc/notify';
import { kycMessage } from '../src/kyc/messages';
import { doctorKycEmail, kycAdminEmail, escapeHtml, DOCTOR_KYC_SUBJECTS } from '../src/kyc/emails';

const PORTAL = 'https://drexame.janocaminho.com.br/#/doctor';
const lastMail = () => { const c = vi.mocked(sendEmail).mock.calls; return c[c.length - 1][0] as any; };

describe('KYC — mensagens e e-mails premium (spec §5b)', () => {
  beforeEach(() => vi.mocked(sendEmail).mockClear());

  it('kycMessage: motivo conhecido → texto; desconhecido/nulo → null', () => {
    expect(kycMessage('face_mismatch')).toMatch(/rosto/i);
    expect(kycMessage('manual_policy')).toMatch(/equipe/i);
    expect(kycMessage('xyz')).toBeNull();
    expect(kycMessage(null)).toBeNull();
  });

  it('layout premium: dark mode, preheader, mascote, marca e saudação pelo primeiro nome (sem título)', () => {
    const html = doctorKycEmail({ name: 'Dra. Maria da Silva', crm: '116739-SP', kind: 'received', portalUrl: PORTAL });
    expect(html).toContain('name="color-scheme" content="light dark"');
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('app-icon.png');
    expect(html).toContain('Portal do Médico');
    expect(html).toContain('Recebemos seu cadastro, Maria');
    expect(html).toContain('116739-SP');
    expect(html).toContain('#20b2aa');
  });

  it('nome é escapado (dado do usuário)', () => {
    const html = doctorKycEmail({ name: '<script>x</script>', kind: 'approved', portalUrl: PORTAL });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain(escapeHtml('<script>x</script>'));
  });

  it('recebido / aprovado / recusado: assunto, link do portal e motivo amigável', async () => {
    const doc = { name: 'Dra. Ana Lima', email: 'ana@exemplo.com', crm: '23456-SP' };
    await notifyDoctorKyc(doc, 'received');
    expect(lastMail()).toMatchObject({ to: 'ana@exemplo.com', subject: DOCTOR_KYC_SUBJECTS.received });
    await notifyDoctorKyc(doc, 'approved');
    expect(lastMail().subject).toBe(DOCTOR_KYC_SUBJECTS.approved);
    expect(lastMail().html).toContain(PORTAL);
    await notifyDoctorKyc(doc, 'rejected', 'face_mismatch');
    expect(lastMail().subject).toBe(DOCTOR_KYC_SUBJECTS.rejected);
    expect(lastMail().html).toContain('O rosto não bateu');
  });

  it('aviso ao dono vai pro ADMIN_EMAIL com as linhas escapadas', async () => {
    process.env.ADMIN_EMAIL = 'dono@exemplo.com';
    await notifyKycAdmin('Dr. Exame — médico pronto para aprovar (tudo verde)', ['Médico: <b>Ana</b> · CRM 123-SP']);
    expect(lastMail().to).toBe('dono@exemplo.com');
    expect(lastMail().html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
    expect(kycAdminEmail({ title: 'x', lines: [], adminUrl: 'https://a/#/admin' })).toContain('https://a/#/admin');
  });

  it('SMTP falhando não lança', async () => {
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('SMTP fora'));
    await expect(notifyDoctorKyc({ name: 'X', email: 'x@exemplo.com' }, 'received')).resolves.toBeUndefined();
  });

  it('recusa pelo dono leva o motivo escrito por ele (escapado), não o texto padrão', async () => {
    await notifyDoctorKyc({ name: 'Dra. Ana', email: 'ana@exemplo.com' }, 'rejected', 'admin_rejected', 'Documento ilegível <reenvie>');
    expect(lastMail().html).toContain('Documento ilegível &lt;reenvie&gt;');
    expect(lastMail().html).not.toContain(kycMessage('admin_rejected')!);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test --workspace packages/server -- test/kyc-notify.test.ts` → FAIL (módulos inexistentes).

- [ ] **Step 3: Mensagens** — `src/kyc/messages.ts`

```ts
/** Mensagem amigável por motivo (spec §3/§5b) — GET /verification e e-mail de recusa. */
const MESSAGES: Record<string, string> = {
  face_mismatch: 'O rosto não bateu com a foto do documento. Tente de novo com boa luz e sem óculos.',
  face_mismatch_review: 'Estamos conferindo sua foto — a resposta chega em breve.',
  liveness_fail: 'Não conseguimos confirmar a prova de vida. Use a câmera ao vivo, em local iluminado.',
  challenge_failed: 'O desafio de movimento não foi concluído. Tente de novo.',
  data_mismatch_name: 'O nome do documento é diferente do nome no CFM. Estamos analisando.',
  data_mismatch_cpf: 'O CPF do documento é diferente do CPF do seu cadastro.',
  document_expired: 'Documento vencido ou emitido há mais de 10 anos. Use um documento atual.',
  document_not_recognized: 'Não reconhecemos o documento. Use RG, CNH ou RNE originais, sem reflexo.',
  fraud_confirmed: 'Não foi possível concluir a verificação. Fale com o suporte: contato@janocaminho.com.br',
  crm_inactive: 'Seu CRM consta como inativo no CFM. Fale com o suporte.',
  name_mismatch: 'O nome do documento não bate com o nome no CFM. Estamos analisando.',
  cfm_unavailable: 'Recebemos sua verificação — falta conferir seu CRM. Estamos analisando.',
  document_name_unavailable: 'Recebemos sua verificação — estamos concluindo a análise.',
  cfm_situation_unknown: 'Recebemos sua verificação — estamos conferindo seu CRM.',
  manual_policy: 'Recebemos sua verificação — nossa equipe está conferindo seus dados.',
  admin_rejected: 'Nossa equipe não conseguiu confirmar seus dados. Fale com o suporte para entender o motivo.',
  expired: 'O link expirou. Gere um novo para continuar.',
};

export function kycMessage(reasonCode: string | null | undefined): string | null {
  return reasonCode ? MESSAGES[reasonCode] ?? null : null;
}
```

- [ ] **Step 4: Layout premium + e-mails** — `src/kyc/emails.ts`

```ts
/**
 * E-mails do KYC do médico — layout PREMIUM do Portal do Médico (spec §5b) com os tokens do
 * .claude/DESIGN_SYSTEM.md: teal #20b2aa→#178f89 (marca), cobre #d4a574 (acento premium),
 * Poppins (títulos) + Inter (corpo), card 20/16, botão 12, mascote oficial (app-icon.png) e
 * modo escuro (#0f1818 / #1a2424 / #e8eef0). E-mail = tabela + estilo inline (o Gmail ignora
 * <style>; o bloco <style> só refina dark mode e celular onde há suporte). Texto do usuário
 * sempre por escapeHtml. Nada de dado de saúde (LGPD).
 */
import { stripDoctorTitle } from '../utils/doctorTitle';

const HEAD = "'Poppins','Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const BODY = "'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SUPPORT = 'contato@janocaminho.com.br';

export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Asset público do web (mesma regra do utils/emailTemplate.ts, com fallback de produção). */
function assetUrl(file: string): string {
  const origin = (process.env.WEB_ORIGIN || 'https://janocaminho.com.br').replace(/\/$/, '');
  const base = (process.env.WEB_BASE_PATH ?? 'minhasaude').replace(/^\/+|\/+$/g, '');
  return base ? `${origin}/${base}/${file}` : `${origin}/${file}`;
}

const firstName = (name: string) => escapeHtml(stripDoctorTitle(name).split(/\s+/)[0] || name);

type Tone = 'pending' | 'ok' | 'warn' | 'info';
const TONES: Record<Tone, [string, string, string]> = {
  pending: ['#fbf3ea', '#8a5a2b', '#ecd3b6'], // cobre — em análise
  ok: ['#e6f7f5', '#0f5f5a', '#bfe7e3'],      // teal — aprovado
  warn: ['#fdeeee', '#9b2c2c', '#f5c6c6'],    // recusado
  info: ['#eef2f7', '#334155', '#d8e0ea'],    // aviso interno
};
function badge(tone: Tone, text: string): string {
  const [bg, fg, bd] = TONES[tone];
  return `<span style="display:inline-block;background:${bg};color:${fg};border:1px solid ${bd};border-radius:999px;padding:7px 14px;font:600 11px/1 ${BODY};letter-spacing:1.4px;text-transform:uppercase">${text}</span>`;
}

const card = (inner: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="dx-soft" style="background:#f6fbfa;border:1px solid #e3efed;border-radius:16px;margin:0 0 24px"><tr><td style="padding:20px">${inner}</td></tr></table>`;

type StepState = 'done' | 'current' | 'todo';
function stepMark(s: StepState): string {
  if (s === 'done') return `<div style="width:26px;height:26px;border-radius:13px;background:#20b2aa;color:#ffffff;font:700 13px/26px ${BODY};text-align:center">&#10003;</div>`;
  if (s === 'current') return '<div style="width:22px;height:22px;border-radius:13px;border:2px solid #d4a574;background:#fbf3ea"></div>';
  return '<div style="width:22px;height:22px;border-radius:13px;border:2px solid #d9e3e2;background:#ffffff"></div>';
}

/** Trilha de progresso vertical (robusta no celular). */
function progress(steps: Array<{ label: string; detail: string; state: StepState }>): string {
  const rows = steps.map((s, i) => {
    const pad = i === steps.length - 1 ? 0 : 16;
    const todo = s.state === 'todo';
    return `<tr>
      <td width="40" valign="top" style="padding:0 0 ${pad}px">${stepMark(s.state)}</td>
      <td valign="top" style="padding:3px 0 ${pad}px">
        <div class="${todo ? 'dx-muted' : 'dx-text'}" style="font:600 14px/1.4 ${BODY};color:${todo ? '#9aa8b6' : '#2d3748'}">${s.label}</div>
        <div class="dx-muted" style="font:400 13px/1.5 ${BODY};color:#8b9bb4">${s.detail}</div>
      </td></tr>`;
  }).join('');
  return card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`);
}

/** Lista numerada com círculos cobre (primeiros passos / como resolver). */
function numbered(title: string, items: string[]): string {
  const rows = items.map((t, i) => `<tr>
      <td width="36" valign="top" style="padding:0 0 12px"><div style="width:24px;height:24px;border-radius:12px;background:#d4a574;color:#ffffff;font:700 12px/24px ${BODY};text-align:center">${i + 1}</div></td>
      <td valign="top" class="dx-text" style="padding:2px 0 12px;font:400 14px/1.5 ${BODY};color:#2d3748">${t}</td></tr>`).join('');
  return card(`<div class="dx-text" style="font:700 15px/1.4 ${HEAD};color:#2d3748;margin:0 0 14px">${title}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`);
}

/** Botão "à prova de cliente": célula com bgcolor + gradiente (quem não renderiza gradiente vê o teal). */
function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:4px auto 8px"><tr>
    <td align="center" bgcolor="#178f89" style="border-radius:12px;background:#178f89;background-image:linear-gradient(135deg,#20b2aa,#178f89)">
      <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:15px 34px;font:600 15px/1 ${BODY};color:#ffffff;text-decoration:none;border-radius:12px">${label}</a>
    </td></tr></table>`;
}

function layout(o: { title: string; preheader: string; tone: Tone; badgeText: string; heading: string; lead: string; body: string; cta?: { href: string; label: string }; note: string }): string {
  return `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(o.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Poppins:wght@600;700&display=swap" rel="stylesheet">
<style>
  @media (prefers-color-scheme: dark) {
    .dx-bg { background:#0f1818 !important; }
    .dx-card { background:#1a2424 !important; }
    .dx-text { color:#e8eef0 !important; }
    .dx-muted { color:#a9b8bb !important; }
    .dx-soft { background:#13201f !important; border-color:#24403d !important; }
  }
  @media (max-width: 620px) {
    .dx-container { width:100% !important; }
    .dx-pad { padding-left:22px !important; padding-right:22px !important; }
  }
</style>
</head>
<body class="dx-bg" style="margin:0;padding:0;background:#eef7f6;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">${escapeHtml(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="dx-bg" style="background:#eef7f6">
  <tr><td align="center" style="padding:32px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="dx-container dx-card" style="width:600px;max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(23,143,137,.14)">
      <tr><td align="center" bgcolor="#178f89" style="background:#178f89;background-image:linear-gradient(135deg,#20b2aa,#178f89);padding:30px 32px 26px">
        <img src="${assetUrl('app-icon.png')}" width="64" height="64" alt="Dr. Exame" style="display:block;border:0;border-radius:16px;margin:0 auto 12px">
        <div style="font:700 22px/1.2 ${HEAD};color:#ffffff;letter-spacing:.3px">Dr. Exame</div>
        <div style="font:600 11px/1.4 ${BODY};color:#f6e7d5;letter-spacing:2.4px;text-transform:uppercase;margin-top:6px">Portal do Médico</div>
      </td></tr>
      <tr><td style="height:4px;line-height:4px;font-size:0;background:#d4a574;background-image:linear-gradient(90deg,#c9955f,#e8c39e,#c9955f)">&nbsp;</td></tr>
      <tr><td class="dx-pad" style="padding:36px 40px 12px">
        ${badge(o.tone, o.badgeText)}
        <h1 class="dx-text" style="margin:18px 0 10px;font:700 24px/1.3 ${HEAD};color:#2d3748">${o.heading}</h1>
        <p class="dx-muted" style="margin:0 0 26px;font:400 15px/1.65 ${BODY};color:#51607a">${o.lead}</p>
        ${o.body}
        ${o.cta ? button(o.cta.href, o.cta.label) : ''}
      </td></tr>
      <tr><td class="dx-pad" style="padding:12px 40px 32px">
        <p class="dx-muted" style="margin:0;font:400 13px/1.6 ${BODY};color:#8b9bb4">${o.note}</p>
      </td></tr>
      <tr><td class="dx-soft" style="background:#f6fbfa;border-top:1px solid #e3efed;padding:20px 40px;text-align:center">
        <p class="dx-muted" style="margin:0;font:400 12px/1.7 ${BODY};color:#8b9bb4">
          Dr. Exame · Portal do Médico<br>
          Dúvidas: <a href="mailto:${SUPPORT}" style="color:#178f89;text-decoration:none">${SUPPORT}</a><br>
          Você recebeu este e-mail porque se cadastrou no Portal do Médico. Envio automático.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export const DOCTOR_KYC_SUBJECTS = {
  received: 'Recebemos seu cadastro — está em análise | Dr. Exame',
  approved: 'Sua conta foi aprovada — você já pode atender | Dr. Exame',
  rejected: 'Sua verificação não foi aprovada — veja como resolver | Dr. Exame',
} as const;

const supportLink = `<a href="mailto:${SUPPORT}" style="color:#178f89;text-decoration:none">${SUPPORT}</a>`;

export function doctorKycEmail(i: { name: string; crm?: string | null; kind: 'received' | 'approved' | 'rejected'; reason?: string | null; portalUrl: string }): string {
  const first = firstName(i.name);
  const crm = i.crm ? `CRM ${escapeHtml(i.crm)}` : 'seu CRM';
  if (i.kind === 'received') {
    return layout({
      title: DOCTOR_KYC_SUBJECTS.received,
      preheader: 'Sua verificação chegou. Nossa equipe confere seus dados e avisa por e-mail.',
      tone: 'pending', badgeText: 'Em análise',
      heading: `Recebemos seu cadastro, ${first}`,
      lead: `Sua verificação de identidade chegou. Agora nossa equipe confere seus dados e o ${crm} no CFM — você recebe um e-mail assim que terminarmos.`,
      body: progress([
        { label: 'Cadastro no portal', detail: 'Conta criada e e-mail confirmado', state: 'done' },
        { label: 'Verificação de identidade', detail: 'Documento e selfie enviados', state: 'done' },
        { label: 'Análise da equipe', detail: `Conferindo seus dados e o ${crm}`, state: 'current' },
        { label: 'Atendimento liberado', detail: 'Você recebe pacientes pelo Dr. Exame', state: 'todo' },
      ]),
      cta: { href: i.portalUrl, label: 'Acompanhar no portal' },
      note: `Não reconhece este cadastro? Fale com a gente em ${supportLink} — levamos a segurança dos pacientes a sério.`,
    });
  }
  if (i.kind === 'approved') {
    return layout({
      title: DOCTOR_KYC_SUBJECTS.approved,
      preheader: 'Identidade e CRM confirmados. Seu atendimento pelo Dr. Exame está liberado.',
      tone: 'ok', badgeText: 'Conta aprovada',
      heading: `Tudo pronto, ${first}! Sua conta está aprovada`,
      lead: `Confirmamos sua identidade e o ${crm}. A partir de agora você pode atender pacientes pelo Dr. Exame.`,
      body: progress([
        { label: 'Cadastro no portal', detail: 'Conta criada e e-mail confirmado', state: 'done' },
        { label: 'Verificação de identidade', detail: 'Documento e selfie conferidos', state: 'done' },
        { label: 'Análise da equipe', detail: `${crm} confirmado no CFM`, state: 'done' },
        { label: 'Atendimento liberado', detail: 'Pronto para receber pacientes', state: 'done' },
      ]) + numbered('Seus primeiros passos', [
        '<strong>Complete seu perfil</strong> — foto, especialidade e uma apresentação curta.',
        '<strong>Ative a verificação em 2 etapas</strong> para proteger sua conta.',
        '<strong>Fique online em “Atender agora”</strong> para receber pacientes da fila.',
      ]),
      cta: { href: i.portalUrl, label: 'Abrir o Portal do Médico' },
      note: 'Por segurança, nunca pedimos sua senha ou códigos por e-mail.',
    });
  }
  return layout({
    title: DOCTOR_KYC_SUBJECTS.rejected,
    preheader: 'Não conseguimos concluir sua verificação. Veja como resolver.',
    tone: 'warn', badgeText: 'Verificação não aprovada',
    heading: `Não conseguimos aprovar sua verificação, ${first}`,
    lead: escapeHtml(i.reason || 'Algo não bateu na conferência dos seus dados.'),
    body: numbered('Como resolver', [
      'Use um documento <strong>original</strong> (RG, CNH ou RNE), sem reflexo.',
      'Faça a selfie em local <strong>bem iluminado</strong>, sem óculos ou boné.',
      'Confira se o nome do documento é o mesmo do seu <strong>registro no CFM</strong>.',
    ]),
    cta: { href: i.portalUrl, label: 'Tentar de novo' },
    note: `Precisa de ajuda? Fale com a gente em ${supportLink}.`,
  });
}

/** Aviso ao dono (fila de KYC) — mesmo layout; linhas em texto puro, escapadas aqui. */
export function kycAdminEmail(i: { title: string; lines: string[]; adminUrl: string }): string {
  return layout({
    title: i.title,
    preheader: i.lines[0] ?? i.title,
    tone: 'info', badgeText: 'Ação necessária',
    heading: escapeHtml(i.title.replace(/^Dr\. Exame — /, '')),
    lead: i.lines.map(escapeHtml).join('<br>'),
    body: '',
    cta: { href: i.adminUrl, label: 'Abrir Médicos em análise' },
    note: 'Aviso interno do Dr. Exame — KYC de médicos.',
  });
}
```

- [ ] **Step 5: Envio** — `src/kyc/notify.ts`

```ts
import { sendEmail } from '../utils/mailer';
import { createLogger } from '../utils/logger';
import { DOCTOR_KYC_SUBJECTS, doctorKycEmail, kycAdminEmail } from './emails';
import { kycMessage } from './messages';

const log = createLogger('kyc-notify');
const portalUrl = () => process.env.DOCTOR_PORTAL_URL || 'https://drexame.janocaminho.com.br/#/doctor';
const adminUrl = () => process.env.ADMIN_PANEL_URL || 'https://janocaminho.com.br/minhasaude/#/admin';

/** E-mail ao dono (mesmo destino do aviso de cadastro — auth.routes.ts:57). Nunca lança. */
export async function notifyKycAdmin(subject: string, lines: string[]): Promise<void> {
  const to = process.env.ADMIN_EMAIL || 'edmls2008@gmail.com';
  await sendEmail({ to, subject, html: kycAdminEmail({ title: subject, lines, adminUrl: adminUrl() }) })
    .catch((e: any) => log.warn('falha no e-mail ao dono (KYC)', { msg: e?.message }));
}

/** E-mail ao médico nas transições (spec §5b). Nunca lança; sem e-mail → no-op. */
export async function notifyDoctorKyc(
  doctor: { name: string; email: string; crm?: string | null },
  kind: 'received' | 'approved' | 'rejected',
  reasonCode?: string | null,
  reasonText?: string | null, // motivo escrito pelo dono na recusa manual — vai para o médico (dono, 28/10)
): Promise<void> {
  if (!doctor.email) return;
  const reason = reasonText?.trim() || kycMessage(reasonCode);
  await sendEmail({
    to: doctor.email,
    subject: DOCTOR_KYC_SUBJECTS[kind],
    html: doctorKycEmail({ name: doctor.name, crm: doctor.crm, kind, reason, portalUrl: portalUrl() }),
  }).catch((e: any) => log.warn('falha no e-mail ao médico (KYC)', { kind, msg: e?.message }));
}
```

- [ ] **Step 6: Rodar e ver passar** — mesmo comando do Step 2 → PASS (6 testes).

- [ ] **Step 7: Prévia visual (acabamento premium)** — criar `scripts/preview-kyc-emails.ts`:

```ts
// Prévia visual dos e-mails de KYC (dev): gera os HTML no diretório temporário e imprime a URL file://.
// Uso: npx tsx scripts/preview-kyc-emails.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { doctorKycEmail, kycAdminEmail } from '../src/kyc/emails';

const dir = join(tmpdir(), 'kyc-email-preview');
mkdirSync(dir, { recursive: true });
const portalUrl = 'https://drexame.janocaminho.com.br/#/doctor';
for (const kind of ['received', 'approved', 'rejected'] as const) {
  writeFileSync(join(dir, `${kind}.html`), doctorKycEmail({
    name: 'Dra. Maria da Silva Souza', crm: '116739-SP', kind, portalUrl,
    reason: kind === 'rejected' ? 'O rosto não bateu com a foto do documento. Tente de novo com boa luz e sem óculos.' : null,
  }));
}
writeFileSync(join(dir, 'admin.html'), kycAdminEmail({
  title: 'Dr. Exame — médico pronto para aprovar (tudo verde)',
  lines: ['Médico: Dra. Maria da Silva Souza · CRM 116739-SP', 'Motivo: manual_policy'],
  adminUrl: 'https://janocaminho.com.br/minhasaude/#/admin',
}));
console.log(pathToFileURL(dir).href);
```
e tirar os prints (se faltar o navegador: `npx playwright install chromium`):
```bash
cd packages/server
URL=$(npx tsx scripts/preview-kyc-emails.ts)
OUT=$(node -p "require('path').join(require('os').tmpdir(),'kyc-email-preview')")
for k in received approved rejected admin; do
  npx playwright screenshot --full-page --viewport-size=600,1000 "$URL/$k.html" "$OUT/$k-600.png"
  npx playwright screenshot --full-page --viewport-size=390,1000 "$URL/$k.html" "$OUT/$k-390.png"
  npx playwright screenshot --full-page --color-scheme=dark --viewport-size=390,1000 "$URL/$k.html" "$OUT/$k-390-dark.png"
done
```
Abrir os PNGs (Read) e conferir com `design-system-guardian`: teal/cobre da marca, mascote visível, hierarquia selo → título → texto → trilha → CTA, **um** CTA claro, nada quebrando a 390px, contraste ok no escuro. Ajustar só estilo se algo destoar (assuntos e textos travados pelos testes). Relatar os caminhos dos PNGs ao revisor.

- [ ] **Step 8: Commit (só com ok do dono)** — `git add packages/server/src/kyc/messages.ts packages/server/src/kyc/emails.ts packages/server/src/kyc/notify.ts packages/server/scripts/preview-kyc-emails.ts packages/server/test/kyc-notify.test.ts && git commit -m "feat(kyc): e-mails premium do Portal do Médico (recebido/aprovado/recusado) + aviso ao dono"`

---

### Task 7: Sincronização tentativa ↔ médico

**Files:**
- Create: `packages/server/src/kyc/sync.ts`
- Test: `packages/server/test/kyc-sync.test.ts`

**Interfaces:**
- Consumes: `getUaiidVerification` (Task 5), `decideDoctorVerification`, `DoctorKycStatus` (Task 6), `notifyKycAdmin`, `notifyDoctorKyc` (Task 6b), `getDoctorKycConfig` (Task 1), `audit` (`utils/audit.ts:6`), `createLogger` (`utils/logger`).
- Produces:
  - `type SyncSource = 'webhook' | 'poll' | 'on_demand'`
  - `syncVerification(providerId: string, source: SyncSource, opts?: { documentName?: string | null; now?: Date }): Promise<{ ok: boolean; doctorStatus?: string }>`
  - `nextDoctorStatus(current: string, proposed: DoctorKycStatus): DoctorKycStatus | null`
  - E-mails só em transição (decisão da tentativa mudou): dono em `needs_admin` / `uaiid_review` / fraude; médico "recebido" / "aprovado" / "recusado".

- [ ] **Step 1: Teste que falha** — `test/kyc-sync.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/utils/uaiid', async (orig) => ({
  ...(await orig<typeof import('../src/utils/uaiid')>()),
  getUaiidVerification: vi.fn(),
}));

import { prisma } from '../src/prisma';
import { resetDb, createDoctor } from './helpers';
import { getUaiidVerification, type UaiidVerification } from '../src/utils/uaiid';
import { sendEmail } from '../src/utils/mailer';
import { syncVerification } from '../src/kyc/sync';
import { saveSettings } from '../src/utils/settings';

const remote = (over: Partial<UaiidVerification> = {}): UaiidVerification => ({
  id: 'v', status: 'approved', reasonCode: null, score: 830, nameRatio: null, cpfSituacao: 'REGULAR',
  externalReference: null, completedAt: new Date('2026-10-28T12:00:00Z'), ...over,
});
let seq = 60000;
async function seed(doctorStatus = 'in_progress') {
  const crm = `${seq++}-SP`;
  const { doctor } = await createDoctor({ crm, verificationStatus: doctorStatus });
  const providerId = `v-${doctor.id}`;
  await prisma.doctorVerification.create({ data: { doctorId: doctor.id, crm, providerId, status: 'collecting', cfmName: 'MARIA DA SILVA SOUZA', cfmSituation: 'Ativo' } });
  return { doctor, providerId };
}
const doctorRow = async (id: string) => prisma.doctor.findUnique({ where: { id }, select: { verificationStatus: true, blocked: true, blockedReason: true, verifiedBy: true } });

describe('syncVerification (spec §5)', () => {
  beforeEach(async () => {
    await resetDb();
    // a maioria dos casos testa o caminho automático; o da política do começo liga 0 no próprio teste
    await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 1 });
    vi.mocked(getUaiidVerification).mockReset();
    vi.mocked(sendEmail).mockClear();
  });

  it('approved + nome do documento = CFM (acento/caixa/partícula) → approved automático', async () => {
    const { doctor, providerId } = await seed();
    vi.mocked(getUaiidVerification).mockResolvedValue(remote());
    expect(await syncVerification(providerId, 'webhook', { documentName: 'Maria Silva Souza' })).toEqual({ ok: true, doctorStatus: 'approved' });
    expect(await doctorRow(doctor.id)).toMatchObject({ verificationStatus: 'approved', verifiedBy: 'auto' });
    expect(await prisma.doctorVerification.findUnique({ where: { providerId } }))
      .toMatchObject({ status: 'approved', nameMatch: true, decision: 'approved', decidedBy: 'auto', syncSource: 'webhook', documentName: 'Maria Silva Souza' });
  });

  it('approved + nome diferente → needs_admin + e-mail ao dono', async () => {
    const { doctor, providerId } = await seed();
    vi.mocked(getUaiidVerification).mockResolvedValue(remote());
    await syncVerification(providerId, 'webhook', { documentName: 'Maria Silva Santos' });
    expect((await doctorRow(doctor.id))?.verificationStatus).toBe('needs_admin');
    await vi.waitFor(() => expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining('aguardando') })));
  });

  it('poll sem nome: name_ratio 1 → approved', async () => {
    const { doctor, providerId } = await seed();
    vi.mocked(getUaiidVerification).mockResolvedValue(remote({ nameRatio: 1 }));
    await syncVerification(providerId, 'poll');
    expect((await doctorRow(doctor.id))?.verificationStatus).toBe('approved');
  });

  it('fraud_confirmed → rejected + bloqueado kyc_fraud', async () => {
    const { doctor, providerId } = await seed();
    vi.mocked(getUaiidVerification).mockResolvedValue(remote({ status: 'rejected', reasonCode: 'fraud_confirmed' }));
    await syncVerification(providerId, 'webhook');
    expect(await doctorRow(doctor.id)).toMatchObject({ verificationStatus: 'rejected', blocked: true, blockedReason: 'kyc_fraud' });
  });

  it('manual_review → uaiid_review', async () => {
    const { doctor, providerId } = await seed();
    vi.mocked(getUaiidVerification).mockResolvedValue(remote({ status: 'manual_review', reasonCode: 'document_not_recognized' }));
    await syncVerification(providerId, 'webhook');
    expect((await doctorRow(doctor.id))?.verificationStatus).toBe('uaiid_review');
  });

  it('legacy não regride com recusa; sobe com aprovação', async () => {
    const a = await seed('legacy');
    vi.mocked(getUaiidVerification).mockResolvedValue(remote({ status: 'rejected', reasonCode: 'face_mismatch' }));
    await syncVerification(a.providerId, 'webhook');
    expect((await doctorRow(a.doctor.id))?.verificationStatus).toBe('legacy');
    const b = await seed('legacy');
    vi.mocked(getUaiidVerification).mockResolvedValue(remote());
    await syncVerification(b.providerId, 'webhook', { documentName: 'MARIA SILVA SOUZA' });
    expect((await doctorRow(b.doctor.id))?.verificationStatus).toBe('approved');
  });

  it('decisão humana não é sobrescrita por evento atrasado', async () => {
    const { doctor, providerId } = await seed('approved');
    await prisma.doctorVerification.update({ where: { providerId }, data: { decision: 'approved', decidedBy: 'admin-1' } });
    vi.mocked(getUaiidVerification).mockResolvedValue(remote({ status: 'rejected', reasonCode: 'face_mismatch' }));
    await syncVerification(providerId, 'poll');
    expect((await doctorRow(doctor.id))?.verificationStatus).toBe('approved');
    expect((await prisma.doctorVerification.findUnique({ where: { providerId } }))?.decidedBy).toBe('admin-1');
  });

  it('tentativa antiga terminando atrasada não mexe no médico', async () => {
    const { doctor, providerId } = await seed();
    await prisma.doctorVerification.create({ data: { doctorId: doctor.id, crm: 'x', providerId: `${providerId}-new`, status: 'collecting', createdAt: new Date(Date.now() + 1000) } });
    vi.mocked(getUaiidVerification).mockResolvedValue(remote({ status: 'rejected', reasonCode: 'face_mismatch' }));
    await syncVerification(providerId, 'poll');
    expect((await doctorRow(doctor.id))?.verificationStatus).toBe('in_progress');
  });

  it('UaiID fora (null) → ok:false e lastSyncedAt intacto', async () => {
    const { providerId } = await seed();
    vi.mocked(getUaiidVerification).mockResolvedValue(null);
    expect(await syncVerification(providerId, 'poll')).toEqual({ ok: false });
    expect((await prisma.doctorVerification.findUnique({ where: { providerId } }))?.lastSyncedAt).toBeNull();
  });

  it('política do começo (autoApprove 0): tudo verde → needs_admin manual_policy + e-mails (dono "pronto", médico "recebemos")', async () => {
    await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 0 });
    const { doctor, providerId } = await seed();
    vi.mocked(getUaiidVerification).mockResolvedValue(remote());
    await syncVerification(providerId, 'webhook', { documentName: 'Maria Silva Souza' });
    expect((await doctorRow(doctor.id))?.verificationStatus).toBe('needs_admin');
    expect(await prisma.doctorVerification.findUnique({ where: { providerId } }))
      .toMatchObject({ decision: 'needs_admin', reasonCode: 'manual_policy', nameMatch: true });
    await vi.waitFor(() => {
      const subjects = vi.mocked(sendEmail).mock.calls.map((c: any) => c[0].subject);
      expect(subjects).toEqual(expect.arrayContaining([expect.stringContaining('pronto para aprovar'), expect.stringContaining('Recebemos')]));
    });
  });

  it('aprovação automática avisa o médico; recusa avisa com o motivo', async () => {
    const a = await seed();
    vi.mocked(getUaiidVerification).mockResolvedValue(remote());
    await syncVerification(a.providerId, 'webhook', { documentName: 'Maria Silva Souza' });
    await vi.waitFor(() => expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining('já pode atender') })));
    vi.mocked(sendEmail).mockClear();
    const b = await seed();
    vi.mocked(getUaiidVerification).mockResolvedValue(remote({ status: 'rejected', reasonCode: 'face_mismatch' }));
    await syncVerification(b.providerId, 'webhook');
    await vi.waitFor(() => expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.stringContaining('não foi aprovada'), html: expect.stringContaining('O rosto não bateu'),
    })));
  });

  it('evento repetido não reenvia e-mail', async () => {
    const { providerId } = await seed();
    vi.mocked(getUaiidVerification).mockResolvedValue(remote({ status: 'manual_review', reasonCode: 'document_not_recognized' }));
    await syncVerification(providerId, 'webhook');
    await vi.waitFor(() => expect(vi.mocked(sendEmail)).toHaveBeenCalled());
    const n = vi.mocked(sendEmail).mock.calls.length;
    await syncVerification(providerId, 'poll');
    await new Promise((r) => setTimeout(r, 50));
    expect(vi.mocked(sendEmail).mock.calls.length).toBe(n);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test --workspace packages/server -- test/kyc-sync.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — `src/kyc/sync.ts`

```ts
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { audit } from '../utils/audit';
import { createLogger } from '../utils/logger';
import { getDoctorKycConfig } from '../utils/settings';
import { getUaiidVerification } from '../utils/uaiid';
import { decideDoctorVerification, type DoctorKycStatus } from './decide';
import { notifyDoctorKyc, notifyKycAdmin } from './notify';

const log = createLogger('kyc-sync');

export type SyncSource = 'webhook' | 'poll' | 'on_demand';

/** "Não regride" (spec §1): approved não muda por evento; legacy só sobe p/ approved. */
export function nextDoctorStatus(current: string, proposed: DoctorKycStatus): DoctorKycStatus | null {
  if (current === 'approved') return null;
  if (current === 'legacy') return proposed === 'approved' ? 'approved' : null;
  return proposed === current ? null : proposed;
}

/**
 * Sincroniza 1 tentativa com o UaiID (GET = fonte da verdade) e aplica no médico.
 * Idempotente: webhook repetido, poll e on-demand gravam o mesmo resultado.
 */
export async function syncVerification(
  providerId: string,
  source: SyncSource,
  opts: { documentName?: string | null; now?: Date } = {},
): Promise<{ ok: boolean; doctorStatus?: string }> {
  const now = opts.now ?? new Date();
  const attempt = await prisma.doctorVerification.findUnique({
    where: { providerId },
    select: { id: true, doctorId: true, documentName: true, cfmName: true, cfmSituation: true, expiresAt: true, decision: true, decidedBy: true },
  });
  if (!attempt) { log.warn('verificação desconhecida', { providerId, source }); return { ok: false }; }
  const remote = await getUaiidVerification(providerId);
  if (!remote) return { ok: false }; // UaiID fora → não marca lastSyncedAt; o job tenta de novo

  const documentName = opts.documentName ?? attempt.documentName ?? null;
  const d = decideDoctorVerification({
    remote: { status: remote.status, reasonCode: remote.reasonCode, nameRatio: remote.nameRatio },
    expiresAt: attempt.expiresAt,
    documentName,
    cfm: attempt.cfmName ? { name: attempt.cfmName, situation: attempt.cfmSituation } : null,
    autoApprove: getDoctorKycConfig().autoApprove === 1,
    now,
  });
  const humanDecided = !!attempt.decidedBy && attempt.decidedBy !== 'auto';
  await prisma.doctorVerification.update({
    where: { id: attempt.id },
    data: {
      status: d.attemptStatus,
      reasonCode: remote.reasonCode ?? d.reason,
      score: remote.score,
      nameRatio: remote.nameRatio,
      cpfSituacao: remote.cpfSituacao,
      documentName,
      nameMatch: d.nameMatch,
      ...(humanDecided ? {} : { decision: d.doctorStatus, decidedBy: d.doctorStatus === 'approved' || d.doctorStatus === 'rejected' ? 'auto' : null }),
      completedAt: remote.completedAt,
      lastSyncedAt: now,
      syncSource: source,
    },
  });
  if (!attempt.doctorId || humanDecided) return { ok: true };

  const latest = await prisma.doctorVerification.findFirst({ where: { doctorId: attempt.doctorId }, orderBy: { createdAt: 'desc' }, select: { id: true } });
  if (latest?.id !== attempt.id) return { ok: true }; // tentativa antiga terminando atrasada
  const doc = await prisma.doctor.findUnique({
    where: { id: attempt.doctorId },
    select: { id: true, name: true, email: true, crm: true, verificationStatus: true, blocked: true },
  });
  if (!doc) return { ok: true };

  const next = nextDoctorStatus(doc.verificationStatus, d.doctorStatus);
  const data: Prisma.DoctorUpdateInput = {};
  if (next) {
    data.verificationStatus = next;
    if (next === 'approved') { data.verifiedAt = now; data.verifiedBy = 'auto'; }
  }
  const fraudBlock = d.fraud && !doc.blocked;
  if (fraudBlock) { data.blocked = true; data.blockedAt = now; data.blockedReason = 'kyc_fraud'; }
  if (Object.keys(data).length) await prisma.doctor.update({ where: { id: doc.id }, data });

  void audit('DOCTOR_KYC_RESULT', null, {
    actorType: 'SYSTEM', targetType: 'DOCTOR', targetId: doc.id,
    after: { providerId, status: d.attemptStatus, decision: d.doctorStatus, reason: d.reason, source },
  });
  // E-mails só na TRANSIÇÃO (spec §5b): evento repetido/poll não reenvia. Linhas em texto puro (o template escapa).
  if (d.doctorStatus !== attempt.decision || fraudBlock) {
    const who = `Médico: ${doc.name} · CRM ${doc.crm}`;
    if (fraudBlock) {
      void notifyKycAdmin('Dr. Exame — fraude confirmada no KYC de médico', [who, `Motivo: ${d.reason}`, 'A conta foi bloqueada automaticamente.']);
    } else if (d.doctorStatus === 'needs_admin') {
      void notifyKycAdmin(
        d.reason === 'manual_policy' ? 'Dr. Exame — médico pronto para aprovar (tudo verde)' : 'Dr. Exame — médico aguardando sua análise',
        [who, `Motivo: ${d.reason ?? '-'}`],
      );
    } else if (d.doctorStatus === 'uaiid_review') {
      void notifyKycAdmin('Dr. Exame — KYC em revisão no painel do UaiID', [who, `Motivo: ${d.reason ?? '-'}`, 'Decida no painel do UaiID; o resultado volta sozinho.']);
    }
    if (next === 'approved') void notifyDoctorKyc(doc, 'approved');
    else if (d.doctorStatus === 'rejected') void notifyDoctorKyc(doc, 'rejected', d.reason);
    else if (d.doctorStatus === 'needs_admin' || d.doctorStatus === 'uaiid_review') void notifyDoctorKyc(doc, 'received');
  }
  return { ok: true, doctorStatus: next ?? doc.verificationStatus };
}
```

- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS (9 testes).

- [ ] **Step 5: Commit (só com ok do dono)** — `git add packages/server/src/kyc/sync.ts packages/server/test/kyc-sync.test.ts && git commit -m "feat(kyc): sync idempotente tentativa↔médico (não regride, fraude bloqueia, aviso ao dono)"`

---

### Task 8: Rotas do médico — `POST/GET /api/doctor/verification`

**Files:**
- Create: `packages/server/src/routes/doctor-verification.routes.ts`
- Modify: `packages/server/src/app.ts` (import junto das rotas, ~`:64`; mount após `:436`)
- Test: `packages/server/test/doctor-verification.routes.test.ts`

**Interfaces:**
- Consumes: `doctorAccessDenial` (T2), `lookupCfm` (`utils/cfm.ts:32`), `decryptPII` (`utils/crypto.ts:35`), `createUaiidVerification`/`UaiidError` (T5), `NON_FINAL_ATTEMPT` (T6), `kycMessage` (T6b), `syncVerification` (T7).
- Produces: `POST /api/doctor/verification` → `201 {verifyUrl, expiresAt, status}` | `409 ALREADY_APPROVED|IN_REVIEW` | `400 CPF_REQUIRED` | `429 KYC_ATTEMPT_LIMIT` | `503 KYC_UNAVAILABLE`; `GET /api/doctor/verification` → `{status, attempt: {status, reasonCode, message, expiresAt} | null}`.

- [ ] **Step 1: Teste que falha** — `test/doctor-verification.routes.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/utils/uaiid', async (orig) => ({
  ...(await orig<typeof import('../src/utils/uaiid')>()),
  createUaiidVerification: vi.fn(),
  getUaiidVerification: vi.fn(),
}));
vi.mock('../src/utils/cfm', async (orig) => ({
  ...(await orig<typeof import('../src/utils/cfm')>()),
  lookupCfm: vi.fn(async () => ({ name: 'DRA MARIA SOUZA', specialty: null, crm: '12345-SP', uf: 'SP', situation: 'Ativo', source: 'cfm' as const })),
}));

import { prisma } from '../src/prisma';
import { api, authHeader, resetDb, createDoctor } from './helpers';
import { createUaiidVerification, getUaiidVerification, UaiidError } from '../src/utils/uaiid';

let seq = 81000;
const crm = () => `${seq++}-SP`;
const created = { verificationId: 'v-r1', verifyUrl: 'https://uaiid.com.br/verify/ab12cd34', expiresAt: new Date('2026-10-29T12:00:00Z'), reused: false };
const post = (token: string) => api().post('/api/doctor/verification').set(authHeader(token));

describe('/api/doctor/verification (spec §3)', () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(createUaiidVerification).mockReset();
    vi.mocked(getUaiidVerification).mockReset();
  });

  it('pending → 201; declara o nome do CFM e o CPF do cadastro; médico vira in_progress', async () => {
    const { doctor, token } = await createDoctor({ crm: crm(), verificationStatus: 'pending' });
    vi.mocked(createUaiidVerification).mockResolvedValue({ ...created });
    const r = await post(token);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ verifyUrl: created.verifyUrl, status: 'in_progress' });
    expect(vi.mocked(createUaiidVerification)).toHaveBeenCalledWith(expect.objectContaining({
      fullName: 'DRA MARIA SOUZA', externalReference: doctor.id, cpf: expect.any(String),
      returnUrl: 'https://drexame.janocaminho.com.br/#/doctor?kyc=1',
    }));
    expect(await prisma.doctorVerification.findUnique({ where: { providerId: 'v-r1' } }))
      .toMatchObject({ doctorId: doctor.id, status: 'created', cfmName: 'DRA MARIA SOUZA', cfmSituation: 'Ativo' });
    expect((await prisma.doctor.findUnique({ where: { id: doctor.id } }))?.verificationStatus).toBe('in_progress');
  });

  it('legacy → 201 e continua legacy', async () => {
    const { doctor, token } = await createDoctor({ crm: crm(), verificationStatus: 'legacy' });
    vi.mocked(createUaiidVerification).mockResolvedValue({ ...created, verificationId: 'v-leg' });
    expect((await post(token)).body.status).toBe('legacy');
    expect((await prisma.doctor.findUnique({ where: { id: doctor.id } }))?.verificationStatus).toBe('legacy');
  });

  it('approved → 409 ALREADY_APPROVED; needs_admin → 409 IN_REVIEW', async () => {
    const a = await createDoctor({ crm: crm() });
    expect((await post(a.token)).body.code).toBe('ALREADY_APPROVED');
    const b = await createDoctor({ crm: crm(), verificationStatus: 'needs_admin' });
    const r = await post(b.token);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('IN_REVIEW');
  });

  it('limite de tentativas → 429; UaiID fora → 503', async () => {
    const { token } = await createDoctor({ crm: crm(), verificationStatus: 'pending' });
    vi.mocked(createUaiidVerification).mockRejectedValueOnce(new UaiidError('KYC_ATTEMPT_LIMIT', 3));
    const r = await post(token);
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ code: 'KYC_ATTEMPT_LIMIT', retryAfterHours: 3 });
    vi.mocked(createUaiidVerification).mockRejectedValueOnce(new UaiidError('KYC_UNAVAILABLE'));
    expect((await post(token)).status).toBe(503);
  });

  it('sem CPF no cadastro → 400 CPF_REQUIRED', async () => {
    const { doctor, token } = await createDoctor({ crm: crm(), verificationStatus: 'pending' });
    await prisma.doctor.update({ where: { id: doctor.id }, data: { cpfEncrypted: null, cpfIv: null } });
    const r = await post(token);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('CPF_REQUIRED');
  });

  it('bloqueado → 403 DOCTOR_BLOCKED', async () => {
    const { doctor, token } = await createDoctor({ crm: crm(), verificationStatus: 'pending' });
    await prisma.doctor.update({ where: { id: doctor.id }, data: { blocked: true } });
    expect((await post(token)).body.code).toBe('DOCTOR_BLOCKED');
  });

  it('GET reconcilia na hora se parado há >60s', async () => {
    const { doctor, token } = await createDoctor({ crm: crm(), verificationStatus: 'in_progress' });
    await prisma.doctorVerification.create({ data: { doctorId: doctor.id, crm: '1-SP', providerId: 'v-g1', status: 'collecting', cfmName: 'DRA MARIA SOUZA', cfmSituation: 'Ativo', lastSyncedAt: new Date(Date.now() - 120_000) } });
    vi.mocked(getUaiidVerification).mockResolvedValue({ id: 'v-g1', status: 'approved', reasonCode: null, score: 900, nameRatio: 1, cpfSituacao: 'REGULAR', externalReference: doctor.id, completedAt: new Date() });
    const r = await api().get('/api/doctor/verification').set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('needs_admin'); // política do começo: tudo verde → fila do dono
    expect(vi.mocked(getUaiidVerification)).toHaveBeenCalledWith('v-g1');
  });

  it('GET sincronizado há pouco não chama o UaiID', async () => {
    const { doctor, token } = await createDoctor({ crm: crm(), verificationStatus: 'in_progress' });
    await prisma.doctorVerification.create({ data: { doctorId: doctor.id, crm: '2-SP', providerId: 'v-g2', status: 'collecting', lastSyncedAt: new Date() } });
    const r = await api().get('/api/doctor/verification').set(authHeader(token));
    expect(r.body).toMatchObject({ status: 'in_progress', attempt: { status: 'collecting' } });
    expect(vi.mocked(getUaiidVerification)).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test --workspace packages/server -- test/doctor-verification.routes.test.ts` → FAIL (404 nas rotas).

- [ ] **Step 3: Implementar** — `src/routes/doctor-verification.routes.ts`

```ts
// KYC do médico (spec docs/design/2026-10-28-verificacao-medico-spec.md §3). Montado em /api/doctor
// (sem overlap com doctor.routes.ts). Auth LOCAL (padrão D8) + política única com allowUnverified:
// o médico ainda não verificado precisa conseguir se verificar.
import { Router, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../prisma';
import { type AuthedRequest } from '../middleware/auth';
import { audit } from '../utils/audit';
import { decryptPII } from '../utils/crypto';
import { lookupCfm } from '../utils/cfm';
import { DOCTOR_ACCESS_SELECT, doctorAccessDenial } from '../utils/doctorAccess';
import { createUaiidVerification, UaiidError } from '../utils/uaiid';
import { NON_FINAL_ATTEMPT } from '../kyc/decide';
import { syncVerification } from '../kyc/sync';
import { kycMessage } from '../kyc/messages';

const router = Router();

interface KycRequest extends AuthedRequest { doctorId?: string }

const RETURN_URL = () => process.env.UAIID_RETURN_URL || 'https://drexame.janocaminho.com.br/#/doctor?kyc=1';
const OPEN_STATUSES = [...NON_FINAL_ATTEMPT, 'manual_review'];
const STARTABLE = ['pending', 'in_progress', 'rejected', 'legacy'];
const ATTEMPT_SELECT = { providerId: true, status: true, reasonCode: true, expiresAt: true, lastSyncedAt: true } as const;

async function requireKycDoctor(req: KycRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) { res.status(401).json({ error: 'Token obrigatório.' }); return; }
  let payload: any;
  try { payload = jwt.verify(header.slice(7), config.jwtSecret); } catch { res.status(401).json({ error: 'Token médico inválido.' }); return; }
  if (payload?.type !== 'doctor' || !payload?.doctorId) { res.status(401).json({ error: 'Token médico inválido.' }); return; }
  const doc = await prisma.doctor.findUnique({ where: { id: payload.doctorId }, select: DOCTOR_ACCESS_SELECT });
  if (!doc) { res.status(401).json({ error: 'Médico não encontrado.' }); return; }
  const denial = doctorAccessDenial(doc, { allowUnverified: true });
  if (denial) { res.status(denial.status).json(denial.body); return; }
  req.doctorId = doc.id;
  next();
}

router.post('/verification', requireKycDoctor, async (req: KycRequest, res, next) => {
  try {
    const now = new Date();
    const doc = await prisma.doctor.findUnique({
      where: { id: req.doctorId! },
      select: { id: true, name: true, crm: true, crmUf: true, cpfEncrypted: true, cpfIv: true, verificationStatus: true },
    });
    if (!doc) { res.status(401).json({ error: 'Médico não encontrado.' }); return; }
    if (doc.verificationStatus === 'approved') { res.status(409).json({ code: 'ALREADY_APPROVED', error: 'Sua identidade já foi verificada.' }); return; }
    if (!STARTABLE.includes(doc.verificationStatus)) { res.status(409).json({ code: 'IN_REVIEW', status: doc.verificationStatus, error: 'Sua verificação está em análise.' }); return; }
    const cpf = decryptPII(doc.cpfEncrypted, doc.cpfIv);
    if (!cpf) { res.status(400).json({ code: 'CPF_REQUIRED', error: 'Cadastre seu CPF no perfil antes de verificar a identidade.' }); return; }

    // Nome do CFM declarado ao UaiID (o crosscheck dele compara com o documento). Reusa o snapshot
    // da tentativa anterior p/ não gastar a cota do consultaCRM (100/mês).
    const last = await prisma.doctorVerification.findFirst({ where: { doctorId: doc.id }, orderBy: { createdAt: 'desc' }, select: { cfmName: true, cfmSituation: true } });
    const attempts = await prisma.doctorVerification.count({ where: { doctorId: doc.id } });
    let cfmName = last?.cfmName ?? null;
    let cfmSituation = last?.cfmSituation ?? null;
    // crmUf pode estar nulo em cadastro antigo/de teste ("12345-SP" sem UF separada) → UF do sufixo da chave.
    const uf = doc.crmUf ?? doc.crm.match(/-([A-Za-z]{2})$/)?.[1]?.toUpperCase() ?? null;
    if (!cfmName && uf) {
      const cfm = await lookupCfm(doc.crm, uf).catch(() => null);
      cfmName = cfm?.name ?? null;
      cfmSituation = cfm?.situation ?? null;
    }

    const created = await createUaiidVerification({
      cpf,
      fullName: cfmName ?? doc.name,
      externalReference: doc.id,
      returnUrl: RETURN_URL(),
      idempotencyKey: `drexame-${doc.id}-${attempts + 1}-${Math.floor(now.getTime() / 60_000)}`,
    });
    await prisma.doctorVerification.upsert({
      where: { providerId: created.verificationId },
      create: { doctorId: doc.id, crm: doc.crm, providerId: created.verificationId, status: 'created', cfmName, cfmSituation, expiresAt: created.expiresAt, lastSyncedAt: now, syncSource: 'on_demand' },
      update: { expiresAt: created.expiresAt },
    });
    if (doc.verificationStatus === 'pending' || doc.verificationStatus === 'rejected') {
      await prisma.doctor.update({ where: { id: doc.id }, data: { verificationStatus: 'in_progress' } });
    }
    void audit('DOCTOR_KYC_STARTED', req, { actorType: 'DOCTOR', actorId: doc.id, targetType: 'DOCTOR', targetId: doc.id, after: { providerId: created.verificationId, reused: created.reused } });
    res.status(201).json({ verifyUrl: created.verifyUrl, expiresAt: created.expiresAt, status: doc.verificationStatus === 'legacy' ? 'legacy' : 'in_progress' });
  } catch (e) {
    if (e instanceof UaiidError) {
      if (e.code === 'KYC_ATTEMPT_LIMIT') {
        res.status(429).json({ code: 'KYC_ATTEMPT_LIMIT', retryAfterHours: e.retryAfterHours ?? null, error: 'Limite de tentativas atingido. Tente mais tarde.' });
        return;
      }
      res.status(503).json({ code: 'KYC_UNAVAILABLE', error: 'Verificação indisponível no momento. Tente em alguns minutos.' });
      return;
    }
    next(e);
  }
});

router.get('/verification', requireKycDoctor, async (req: KycRequest, res, next) => {
  try {
    const now = new Date();
    const latest = () => prisma.doctorVerification.findFirst({ where: { doctorId: req.doctorId! }, orderBy: { createdAt: 'desc' }, select: ATTEMPT_SELECT });
    let attempt = await latest();
    if (attempt && OPEN_STATUSES.includes(attempt.status) && (!attempt.lastSyncedAt || now.getTime() - attempt.lastSyncedAt.getTime() > 60_000)) {
      await syncVerification(attempt.providerId, 'on_demand', { now });
      attempt = await latest();
    }
    const doc = await prisma.doctor.findUnique({ where: { id: req.doctorId! }, select: { verificationStatus: true } });
    res.json({
      status: doc?.verificationStatus ?? 'pending',
      attempt: attempt
        ? { status: attempt.status, reasonCode: attempt.reasonCode, message: kycMessage(attempt.reasonCode), expiresAt: attempt.expiresAt }
        : null,
    });
  } catch (e) { next(e); }
});

export default router;
```

- [ ] **Step 4: Montar** — em `src/app.ts`, junto dos imports de rotas: `import doctorVerificationRoutes from './routes/doctor-verification.routes';` e logo após `app.use('/api/doctor', collectionChecklistDoctorRouter); ...` (`:436`):
```ts
app.use('/api/doctor', doctorVerificationRoutes); // KYC do médico: POST/GET /verification (sem overlap)
```

- [ ] **Step 5: Rodar e ver passar** — mesmo comando → PASS (8 testes).

- [ ] **Step 6: Commit (só com ok do dono)** — `git add packages/server/src/routes/doctor-verification.routes.ts packages/server/src/app.ts packages/server/test/doctor-verification.routes.test.ts && git commit -m "feat(kyc): POST/GET /api/doctor/verification (sessão UaiID + reconciliação on-demand)"`

---

### Task 9: Webhook do UaiID

**Files:**
- Create: `packages/server/src/routes/uaiid-webhook.routes.ts`
- Modify: `packages/server/src/app.ts` (antes de `:111`)
- Test: `packages/server/test/uaiid-webhook.test.ts`

**Interfaces:**
- Consumes: `verifyUaiidSignature` (T5), `syncVerification` (T7).
- Produces: `uaiidWebhookHandler(req, res): Promise<void>` em `POST /api/webhooks/uaiid`.

- [ ] **Step 1: Teste que falha** — `test/uaiid-webhook.test.ts` (payloads reais colados pelo dono em 28/10/26)

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';

vi.mock('../src/kyc/sync', async (orig) => ({
  ...(await orig<typeof import('../src/kyc/sync')>()),
  syncVerification: vi.fn(async () => ({ ok: true })),
}));

import { api } from './helpers';
import { syncVerification } from '../src/kyc/sync';

const SECRET = 'whsec_test';
const sign = (body: string, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex')}`;
const post = (body: string, sig?: string) => {
  const r = api().post('/api/webhooks/uaiid').set('Content-Type', 'application/json');
  return (sig ? r.set('X-Uai-Signature', sig) : r).send(body);
};
const APPROVED = JSON.stringify({ id: '9d2c7a41-0f3e-4f2a-8b1c-2e7d6f5a4b3c', event: 'verification.approved', verification_id: '6c5db95c-8d67-41b3-aabc-2e1439f614c3', data: { verification_id: '6c5db95c-8d67-41b3-aabc-2e1439f614c3', score: 830, reason_code: null, full_name: 'MARIA DA SILVA', birth_date: '1990-01-01', cpf_masked: '123.***.***-09', cpf_situacao: 'REGULAR', cpf_consulta_cache: false } });
const MANUAL = JSON.stringify({ id: 'b5095a09-5dc9-4fd7-87b6-6da3eba7f187', data: { reason_code: 'document_not_recognized', verification_id: '5fc6fac8-47bc-4734-a1fd-f01cffb5aa1c' }, event: 'verification.manual_review', verification_id: '5fc6fac8-47bc-4734-a1fd-f01cffb5aa1c' });

describe('POST /api/webhooks/uaiid (spec §3)', () => {
  beforeEach(() => {
    process.env.UAIID_WEBHOOK_SECRET = SECRET;
    vi.mocked(syncVerification).mockClear();
  });

  it('sem assinatura ou com assinatura errada → 401, sem sync', async () => {
    expect((await post(APPROVED)).status).toBe(401);
    const bad = `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}`;
    const r = await post(APPROVED, bad);
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('BAD_SIGNATURE');
    expect(vi.mocked(syncVerification)).not.toHaveBeenCalled();
  });

  it('timestamp velho (>300s) → 401', async () => {
    expect((await post(APPROVED, sign(APPROVED, Math.floor(Date.now() / 1000) - 301))).status).toBe(401);
  });

  it('approved assinado → 200 e sync com o nome do documento', async () => {
    expect((await post(APPROVED, sign(APPROVED))).status).toBe(200);
    await vi.waitFor(() => expect(vi.mocked(syncVerification))
      .toHaveBeenCalledWith('6c5db95c-8d67-41b3-aabc-2e1439f614c3', 'webhook', { documentName: 'MARIA DA SILVA' }));
  });

  it('manual_review enxuto (só reason_code) → 200 e sync sem nome', async () => {
    expect((await post(MANUAL, sign(MANUAL))).status).toBe(200);
    await vi.waitFor(() => expect(vi.mocked(syncVerification))
      .toHaveBeenCalledWith('5fc6fac8-47bc-4734-a1fd-f01cffb5aa1c', 'webhook', { documentName: null }));
  });

  it('evento que não é verification.* → 200, sem sync', async () => {
    const body = JSON.stringify({ id: 'b1', event: 'billing.spend_alert', data: {} });
    expect((await post(body, sign(body))).status).toBe(200);
    expect(vi.mocked(syncVerification)).not.toHaveBeenCalled();
  });

  it('corpo não-JSON assinado → 400', async () => {
    expect((await post('nao-json', sign('nao-json'))).status).toBe(400);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test --workspace packages/server -- test/uaiid-webhook.test.ts` → FAIL (404).

- [ ] **Step 3: Implementar** — `src/routes/uaiid-webhook.routes.ts`

```ts
// Webhook do UaiID (spec §3). Montado em app.ts ANTES do express.json global, com express.raw:
// o HMAC (X-Uai-Signature) é sobre o corpo CRU. O corpo é só a campainha — o resultado vem do
// GET (syncVerification). Exceção: data.full_name (nome do documento) só existe aqui, assinado.
import type { Request, Response } from 'express';
import { verifyUaiidSignature } from '../utils/uaiid';
import { syncVerification } from '../kyc/sync';
import { createLogger } from '../utils/logger';

const log = createLogger('uaiid-webhook');

export async function uaiidWebhookHandler(req: Request, res: Response): Promise<void> {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyUaiidSignature(raw, req.header('x-uai-signature'), process.env.UAIID_WEBHOOK_SECRET || '')) {
    log.warn('assinatura inválida', { bytes: raw.length });
    res.status(401).json({ code: 'BAD_SIGNATURE' });
    return;
  }
  let evt: any;
  try { evt = JSON.parse(raw.toString('utf8')); } catch { res.status(400).json({ code: 'BAD_JSON' }); return; }
  res.status(200).json({ ok: true }); // responde já; o processamento segue (o job cobre falhas)
  const id = String(evt?.verification_id ?? evt?.data?.verification_id ?? '');
  if (!id || !String(evt?.event ?? '').startsWith('verification.')) return;
  const documentName = typeof evt?.data?.full_name === 'string' ? evt.data.full_name : null;
  void syncVerification(id, 'webhook', { documentName })
    .catch((e) => log.warn('sync do webhook falhou (o job reconcilia)', { id, msg: (e as Error)?.message }));
}
```

- [ ] **Step 4: Montar ANTES do json global** — em `src/app.ts`: import `import { uaiidWebhookHandler } from './routes/uaiid-webhook.routes';` e, imediatamente antes de `app.use(express.json({ limit: '2mb' }));` (`:111`):
```ts
// Webhook UaiID (KYC do médico): HMAC sobre o corpo CRU → precisa vir ANTES do express.json global.
app.post('/api/webhooks/uaiid', express.raw({ type: 'application/json', limit: '256kb' }), uaiidWebhookHandler);
```

- [ ] **Step 5: Rodar e ver passar** — mesmo comando → PASS (6 testes).

- [ ] **Step 6: Commit (só com ok do dono)** — `git add packages/server/src/routes/uaiid-webhook.routes.ts packages/server/src/app.ts packages/server/test/uaiid-webhook.test.ts && git commit -m "feat(kyc): webhook UaiID assinado (corpo cru antes do json) → sync"`

---

### Task 10: Job de reconciliação

**Files:**
- Create: `packages/server/src/jobs/kycReconcile.ts`
- Modify: `packages/server/src/index.ts` (`:17-18` import; após `startReconciliationJob();` `:56`)
- Test: `packages/server/test/kyc-reconcile.test.ts`

**Interfaces:**
- Consumes: `syncVerification` (T7), `NON_FINAL_ATTEMPT` (T6).
- Produces: `runKycReconcile(now?: number, limit?: number): Promise<{ candidates: number; synced: number; expired: number }>`; `startKycReconcileJob(): void`.

- [ ] **Step 1: Teste que falha** — `test/kyc-reconcile.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/utils/uaiid', async (orig) => ({
  ...(await orig<typeof import('../src/utils/uaiid')>()),
  getUaiidVerification: vi.fn(),
}));

import { prisma } from '../src/prisma';
import { resetDb, createDoctor } from './helpers';
import { getUaiidVerification } from '../src/utils/uaiid';
import { runKycReconcile } from '../src/jobs/kycReconcile';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const NOW = Date.now();
let seq = 50000;

async function seed(opts: { status?: string; createdAgoMs?: number; syncedAgoMs?: number | null; doctorStatus?: string } = {}) {
  const crm = `${seq++}-SP`;
  const { doctor } = await createDoctor({ crm, verificationStatus: opts.doctorStatus ?? 'in_progress' });
  const providerId = `v-${doctor.id}`;
  await prisma.doctorVerification.create({
    data: {
      doctorId: doctor.id, crm, providerId, status: opts.status ?? 'collecting', cfmName: 'DR TESTE', cfmSituation: 'Ativo',
      createdAt: new Date(NOW - (opts.createdAgoMs ?? 30 * MIN)),
      lastSyncedAt: opts.syncedAgoMs === null ? null : new Date(NOW - (opts.syncedAgoMs ?? 20 * MIN)),
    },
  });
  return { doctor, providerId };
}

describe('runKycReconcile (spec §5)', () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(getUaiidVerification).mockReset();
    vi.mocked(getUaiidVerification).mockResolvedValue({ id: 'x', status: 'processing', reasonCode: null, score: null, nameRatio: null, cpfSituacao: null, externalReference: null, completedAt: null });
  });

  it('aberta sem sync há >10min → consulta o UaiID', async () => {
    const { providerId } = await seed({ syncedAgoMs: 20 * MIN });
    const r = await runKycReconcile(NOW);
    expect(r).toMatchObject({ candidates: 1, synced: 1 });
    expect(vi.mocked(getUaiidVerification)).toHaveBeenCalledWith(providerId);
  });

  it('sincronizada há 2 min → não consulta', async () => {
    await seed({ syncedAgoMs: 2 * MIN });
    expect((await runKycReconcile(NOW)).candidates).toBe(0);
    expect(vi.mocked(getUaiidVerification)).not.toHaveBeenCalled();
  });

  it('aberta há >7 dias → expired e o médico volta a pending', async () => {
    const { doctor, providerId } = await seed({ createdAgoMs: 8 * DAY });
    expect((await runKycReconcile(NOW)).expired).toBe(1);
    expect((await prisma.doctorVerification.findUnique({ where: { providerId } }))?.status).toBe('expired');
    expect((await prisma.doctor.findUnique({ where: { id: doctor.id } }))?.verificationStatus).toBe('pending');
  });

  it('manual_review há >7 dias não expira (aguarda o painel do UaiID)', async () => {
    const { providerId } = await seed({ status: 'manual_review', createdAgoMs: 8 * DAY, doctorStatus: 'uaiid_review' });
    expect((await runKycReconcile(NOW)).expired).toBe(0);
    expect((await prisma.doctorVerification.findUnique({ where: { providerId } }))?.status).toBe('manual_review');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test --workspace packages/server -- test/kyc-reconcile.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — `src/jobs/kycReconcile.ts`

```ts
import { prisma } from '../prisma';
import { syncVerification } from '../kyc/sync';
import { NON_FINAL_ATTEMPT } from '../kyc/decide';

const MS_MIN = 60_000;
const MS_DAY = 24 * 60 * MS_MIN;
const OPEN = [...NON_FINAL_ATTEMPT, 'manual_review'];

/**
 * Uma passada (testável). Spec §5: tentativas abertas < 7 dias e sem sync há > 10 min → GET no
 * UaiID (cobre webhook esgotado — o log real tem 5/5 em 500/503); não finais > 7 dias → expired.
 * manual_review não expira: aguarda o painel do UaiID.
 */
export async function runKycReconcile(now: number = Date.now(), limit = 50): Promise<{ candidates: number; synced: number; expired: number }> {
  const at = new Date(now);
  const rows = await prisma.doctorVerification.findMany({
    where: {
      status: { in: OPEN },
      createdAt: { gt: new Date(now - 7 * MS_DAY) },
      OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date(now - 10 * MS_MIN) } }],
    },
    orderBy: { lastSyncedAt: 'asc' },
    take: limit,
    select: { providerId: true },
  });
  let synced = 0;
  for (const r of rows) if ((await syncVerification(r.providerId, 'poll', { now: at })).ok) synced++;

  const stale = await prisma.doctorVerification.findMany({
    where: { status: { in: [...NON_FINAL_ATTEMPT] }, createdAt: { lte: new Date(now - 7 * MS_DAY) } },
    select: { id: true, doctorId: true, createdAt: true },
  });
  for (const s of stale) {
    await prisma.doctorVerification.update({ where: { id: s.id }, data: { status: 'expired', decision: 'pending', lastSyncedAt: at, syncSource: 'poll' } });
    if (!s.doctorId) continue;
    const newer = await prisma.doctorVerification.count({ where: { doctorId: s.doctorId, createdAt: { gt: s.createdAt } } });
    if (!newer) await prisma.doctor.updateMany({ where: { id: s.doctorId, verificationStatus: 'in_progress' }, data: { verificationStatus: 'pending' } });
  }
  return { candidates: rows.length, synced, expired: stale.length };
}

/** Job (padrão reconciliation.ts:260-277): a cada 10 min + 1ª passada 1 min após o boot. */
export function startKycReconcileJob(): void {
  const tick = async () => {
    try {
      const r = await runKycReconcile(Date.now());
      if (r.synced || r.expired) console.log(`[kyc-reconcile] ${r.synced}/${r.candidates} sincronizada(s), ${r.expired} expirada(s)`);
    } catch (e) {
      console.error('[kyc-reconcile] job error:', (e as Error)?.message);
    }
  };
  setInterval(tick, 10 * MS_MIN);
  setTimeout(tick, MS_MIN);
  console.log('[kyc-reconcile] job iniciado (KYC médico · a cada 10 min)');
}
```

- [ ] **Step 4: Registrar no boot** — `src/index.ts`: junto de `import { startReconciliationJob } from './jobs/reconciliation';` acrescentar `import { startKycReconcileJob } from './jobs/kycReconcile';`; logo após `startReconciliationJob(); ...` (`:56`):
```ts
  startKycReconcileJob(); // KYC médico: reconcilia tentativas sem webhook + expira > 7 dias (10 min)
```

- [ ] **Step 5: Rodar e ver passar** — mesmo comando → PASS (4 testes).

- [ ] **Step 6: Commit (só com ok do dono)** — `git add packages/server/src/jobs/kycReconcile.ts packages/server/src/index.ts packages/server/test/kyc-reconcile.test.ts && git commit -m "feat(kyc): job de reconciliação (webhook esgotado + expiração 7d)"`

---

### Task 11: Admin — fila de decisão, aprovar, recusar, legados

**Files:**
- Modify: `packages/server/src/routes/admin.routes.ts` (logo após `router.get('/doctors', ...)`, `:1111`)
- Test: `packages/server/test/admin-doctor-verification.test.ts`

**Interfaces:**
- Produces: `GET /api/admin/doctors/verification-queue` → `{ review: Array<attempt & { doctor, priorAttempts: number, decideIn: 'drexame' | 'uaiid' }>, legacy: Array<{ id, name, crm, crmUf, email, createdAt }> }`; `POST /api/admin/doctors/:id/verification/approve` `{note?}`; `POST /api/admin/doctors/:id/verification/reject` `{reason}`; `POST /api/admin/doctors/verification/approve-legacy` `{ids}` → `{ ok, approved }`.

- [ ] **Step 1: Teste que falha** — `test/admin-doctor-verification.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/prisma';
import { api, authHeader, resetDb, createDoctor, mintToken } from './helpers';
import { getDoctorKycConfig, saveSettings } from '../src/utils/settings';
import { sendEmail } from '../src/utils/mailer';

async function createAdmin() {
  const passwordHash = await bcrypt.hash('senha123', 10);
  const u = await prisma.user.create({
    data: { email: `admin-kyc-${Date.now().toString(36)}@exemplo.com`, name: 'Admin KYC', passwordHash, role: 'ADMIN', credits: 0, emailVerified: true },
    select: { id: true },
  });
  return { id: u.id, token: mintToken(u.id) };
}
let seq = 40000;
const crm = () => `${seq++}-SP`;

describe('admin — KYC do médico (spec §3)', () => {
  beforeEach(async () => { await resetDb(); });

  it('fila: needs_admin com nomes lado a lado + tentativas anteriores no CRM (inclusive conta excluída) + legados', async () => {
    const admin = await createAdmin();
    const c = crm();
    const { doctor } = await createDoctor({ crm: c, verificationStatus: 'needs_admin' });
    await prisma.doctorVerification.create({ data: { doctorId: null, crm: c, providerId: 'v-old', status: 'rejected', decision: 'rejected', decidedBy: 'auto' } });
    await prisma.doctorVerification.create({ data: { doctorId: doctor.id, crm: c, providerId: 'v-new', status: 'approved', decision: 'needs_admin', reasonCode: 'name_mismatch', documentName: 'MARIA SANTOS', cfmName: 'MARIA SOUZA' } });
    const leg = await createDoctor({ crm: crm(), verificationStatus: 'legacy' });
    const r = await api().get('/api/admin/doctors/verification-queue').set(authHeader(admin.token));
    expect(r.status).toBe(200);
    expect(r.body.review).toHaveLength(1);
    expect(r.body.review[0]).toMatchObject({ providerId: 'v-new', documentName: 'MARIA SANTOS', cfmName: 'MARIA SOUZA', priorAttempts: 1, decideIn: 'drexame' });
    expect(r.body.legacy.map((d: any) => d.id)).toEqual([leg.doctor.id]);
  });

  it('aprovar → approved com verifiedBy = admin; a tentativa guarda quem decidiu', async () => {
    const admin = await createAdmin();
    const { doctor } = await createDoctor({ crm: crm(), verificationStatus: 'needs_admin' });
    await prisma.doctorVerification.create({ data: { doctorId: doctor.id, crm: 'x', providerId: 'v-a', status: 'approved', decision: 'needs_admin' } });
    const r = await api().post(`/api/admin/doctors/${doctor.id}/verification/approve`).set(authHeader(admin.token)).send({ note: 'conferi no painel' });
    expect(r.status).toBe(200);
    expect(await prisma.doctor.findUnique({ where: { id: doctor.id }, select: { verificationStatus: true, verifiedBy: true } })).toEqual({ verificationStatus: 'approved', verifiedBy: admin.id });
    expect((await prisma.doctorVerification.findUnique({ where: { providerId: 'v-a' } }))?.decidedBy).toBe(admin.id);
    await vi.waitFor(() => expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining('já pode atender') })));
  });

  it('recusar exige motivo', async () => {
    const admin = await createAdmin();
    const { doctor } = await createDoctor({ crm: crm(), verificationStatus: 'needs_admin' });
    expect((await api().post(`/api/admin/doctors/${doctor.id}/verification/reject`).set(authHeader(admin.token)).send({})).body.code).toBe('REASON_REQUIRED');
    const r = await api().post(`/api/admin/doctors/${doctor.id}/verification/reject`).set(authHeader(admin.token)).send({ reason: 'não é o titular' });
    expect(r.status).toBe(200);
    expect((await prisma.doctor.findUnique({ where: { id: doctor.id } }))?.verificationStatus).toBe('rejected');
  });

  it('aprovar legados em lote só mexe em quem é legacy', async () => {
    const admin = await createAdmin();
    const leg = await createDoctor({ crm: crm(), verificationStatus: 'legacy' });
    const pend = await createDoctor({ crm: crm(), verificationStatus: 'pending' });
    const r = await api().post('/api/admin/doctors/verification/approve-legacy').set(authHeader(admin.token)).send({ ids: [leg.doctor.id, pend.doctor.id] });
    expect(r.body).toMatchObject({ ok: true, approved: 1 });
    expect((await prisma.doctor.findUnique({ where: { id: pend.doctor.id } }))?.verificationStatus).toBe('pending');
  });

  it('prazo dos legados editável pelo PATCH de config existente', async () => {
    const admin = await createAdmin();
    const r = await api().patch('/api/admin/config/costs').set(authHeader(admin.token)).send({ category: 'doctorKyc', legacyGraceUntilMs: 1767225600000, autoApprove: 1 });
    expect(r.status).toBe(200);
    expect(getDoctorKycConfig()).toEqual({ legacyGraceUntilMs: 1767225600000, autoApprove: 1 });
    await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 0 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test --workspace packages/server -- test/admin-doctor-verification.test.ts` → FAIL (404 nas rotas novas).

- [ ] **Step 3: Implementar** — em `src/routes/admin.routes.ts`, acrescentar `import { notifyDoctorKyc } from '../kyc/notify';` nos imports e, logo após o fim de `router.get('/doctors', ...)` (`:1111`):

```ts
// KYC do médico (spec verificação §3): decisões humanas. needs_admin decide AQUI; uaiid_review
// decide no painel do UaiID (aqui só leitura). Legados: aprovação em lote.
router.get('/doctors/verification-queue', async (_req, res, next) => {
  try {
    const review = await prisma.doctorVerification.findMany({
      where: { decision: { in: ['needs_admin', 'uaiid_review'] }, decidedBy: null, doctorId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, providerId: true, crm: true, status: true, reasonCode: true, decision: true, documentName: true,
        cfmName: true, nameRatio: true, score: true, createdAt: true,
        doctor: { select: { id: true, name: true, crm: true, crmUf: true, email: true, verificationStatus: true } },
      },
    });
    const crms = [...new Set(review.map((a) => a.crm))];
    const counts = crms.length
      ? await prisma.doctorVerification.groupBy({ by: ['crm'], where: { crm: { in: crms } }, _count: { _all: true } })
      : [];
    const byCrm = new Map(counts.map((c) => [c.crm, c._count._all]));
    const legacy = await prisma.doctor.findMany({
      where: { verificationStatus: 'legacy' },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: { id: true, name: true, crm: true, crmUf: true, email: true, createdAt: true },
    });
    res.json({
      review: review.map((a) => ({ ...a, priorAttempts: (byCrm.get(a.crm) ?? 1) - 1, decideIn: a.decision === 'uaiid_review' ? 'uaiid' : 'drexame' })),
      legacy,
    });
  } catch (e) { next(e); }
});

router.post('/doctors/:id/verification/approve', async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const doc = await prisma.doctor.findUnique({ where: { id }, select: { id: true, name: true, email: true, crm: true, verificationStatus: true } });
    if (!doc) { res.status(404).json({ code: 'NOT_FOUND', error: 'Médico não encontrado.' }); return; }
    const note = req.body?.note ? String(req.body.note).slice(0, 500) : null;
    const latest = await prisma.doctorVerification.findFirst({ where: { doctorId: id }, orderBy: { createdAt: 'desc' }, select: { id: true } });
    await prisma.$transaction([
      prisma.doctor.update({ where: { id }, data: { verificationStatus: 'approved', verifiedAt: new Date(), verifiedBy: req.userId! } }),
      ...(latest ? [prisma.doctorVerification.update({ where: { id: latest.id }, data: { decision: 'approved', decidedBy: req.userId! } })] : []),
    ]);
    void audit('DOCTOR_VERIFICATION_DECIDED', req, { targetType: 'DOCTOR', targetId: id, before: { status: doc.verificationStatus }, after: { status: 'approved', crm: doc.crm, note } });
    void notifyDoctorKyc(doc, 'approved'); // e-mail premium "Sua conta foi aprovada"
    res.json({ ok: true, status: 'approved' });
  } catch (e) { next(e); }
});

router.post('/doctors/:id/verification/reject', async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const reason = String(req.body?.reason ?? '').trim().slice(0, 500);
    if (!reason) { res.status(400).json({ code: 'REASON_REQUIRED', error: 'Informe o motivo.' }); return; }
    const doc = await prisma.doctor.findUnique({ where: { id }, select: { id: true, name: true, email: true, crm: true, verificationStatus: true } });
    if (!doc) { res.status(404).json({ code: 'NOT_FOUND', error: 'Médico não encontrado.' }); return; }
    const latest = await prisma.doctorVerification.findFirst({ where: { doctorId: id }, orderBy: { createdAt: 'desc' }, select: { id: true } });
    await prisma.$transaction([
      prisma.doctor.update({ where: { id }, data: { verificationStatus: 'rejected', verifiedAt: null, verifiedBy: null } }),
      ...(latest ? [prisma.doctorVerification.update({ where: { id: latest.id }, data: { decision: 'rejected', decidedBy: req.userId!, reasonCode: 'admin_rejected' } })] : []),
    ]);
    void audit('DOCTOR_VERIFICATION_DECIDED', req, { targetType: 'DOCTOR', targetId: id, before: { status: doc.verificationStatus }, after: { status: 'rejected', crm: doc.crm, reason } });
    void notifyDoctorKyc(doc, 'rejected', 'admin_rejected', reason); // o motivo escrito pelo dono vai no e-mail do médico (dono, 28/10)
    res.json({ ok: true, status: 'rejected' });
  } catch (e) { next(e); }
});

router.post('/doctors/verification/approve-legacy', async (req: AuthedRequest, res, next) => {
  try {
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, 500) : [];
    if (!ids.length) { res.status(400).json({ code: 'IDS_REQUIRED', error: 'Informe os médicos.' }); return; }
    const r = await prisma.doctor.updateMany({
      where: { id: { in: ids }, verificationStatus: 'legacy' },
      data: { verificationStatus: 'approved', verifiedAt: new Date(), verifiedBy: req.userId! },
    });
    void audit('DOCTOR_VERIFICATION_DECIDED', req, { targetType: 'DOCTOR', after: { status: 'approved', via: 'legacy_bulk', ids, count: r.count } });
    res.json({ ok: true, approved: r.count });
  } catch (e) { next(e); }
});
```

- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS (5 testes).

- [ ] **Step 5: Commit (só com ok do dono)** — `git add packages/server/src/routes/admin.routes.ts packages/server/test/admin-doctor-verification.test.ts && git commit -m "feat(kyc): admin — fila de decisão, aprovar/recusar, legados em lote"`

---

### Task 12: Cadastro e convite (AUD-003 parte 1)

**Files:**
- Modify: `packages/server/src/routes/doctor.routes.ts` (`:311-317` CFM; `:325-335` claim/conflito)
- Modify: `packages/server/src/app.ts` (`:533-616` convite; import)
- Test: `packages/server/test/doctor-register-kyc.test.ts`

**Interfaces:**
- Consumes: `cfmState`, `BR_UFS`, `lookupCfm` (T4), `notifyKycAdmin` (T6b).
- Produces: `409 {code:'CRM_IN_USE_UNVERIFIED'}` no cadastro; `422 {code:'CRM_INVALID'|'CRM_INACTIVE'}` no convite; audit `DOCTOR_CRM_CONFLICT`.

- [ ] **Step 1: Teste que falha** — `test/doctor-register-kyc.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/utils/cfm', async (orig) => ({
  ...(await orig<typeof import('../src/utils/cfm')>()),
  lookupCfm: vi.fn(async () => null),
}));

import { prisma } from '../src/prisma';
import { api, authHeader, resetDb, createDoctor, createUser, createPatient, testCpf } from './helpers';
import { lookupCfm } from '../src/utils/cfm';
import { sendEmail } from '../src/utils/mailer';

let n = 0;
const mail = () => `kyc-reg-${n++}-${Date.now().toString(36)}@exemplo.com`;
const register = (over: Record<string, unknown> = {}) => api().post('/api/doctor/register')
  .send({ name: 'Dra Ana', cpf: testCpf(), crm: '23456', crmUf: 'SP', specialty: 'Clinico Geral', email: mail(), password: 'senha123', ...over });
const cfmAs = (situation: string) => vi.mocked(lookupCfm).mockResolvedValueOnce({ name: 'DRA ANA', specialty: null, crm: '23456-SP', uf: 'SP', situation, source: 'cfm' });

async function invite() {
  const { user } = await createUser();
  const patient = await createPatient(user.id);
  const token = `${Date.now().toString(16)}${'a'.repeat(24)}`;
  await prisma.appSetting.create({ data: { key: `doc_invite:${token}`, value: { status: 'pending', expiresAt: new Date(Date.now() + 86_400_000).toISOString(), patientId: patient.id, scopes: ['exams'], examIds: [] } } });
  return token;
}

describe('cadastro de médico + convite (spec §7, AUD-003)', () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(lookupCfm).mockReset();
    vi.mocked(lookupCfm).mockResolvedValue(null);
    vi.mocked(sendEmail).mockClear();
  });

  it('CFM "Inativo" bloqueia o cadastro (antes /ativo/i deixava passar)', async () => {
    cfmAs('Inativo');
    expect((await register()).status).toBe(400);
  });

  it('CRM de conta NÃO aprovada, outro e-mail → 409 CRM_IN_USE_UNVERIFIED + audit + e-mail ao dono', async () => {
    await createDoctor({ crm: '23456-SP', verificationStatus: 'pending' });
    const r = await register();
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('CRM_IN_USE_UNVERIFIED');
    await vi.waitFor(async () => expect(await prisma.auditLog.count({ where: { action: 'DOCTOR_CRM_CONFLICT' } })).toBe(1));
    await vi.waitFor(() => expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining('CRM disputado') })));
  });

  it('CRM de conta aprovada, outro e-mail → 409 de sempre + audit do conflito', async () => {
    await createDoctor({ crm: '23456-SP' });
    const r = await register();
    expect(r.status).toBe(409);
    expect(r.body.code).toBeUndefined();
    await vi.waitFor(async () => expect(await prisma.auditLog.count({ where: { action: 'DOCTOR_CRM_CONFLICT' } })).toBe(1));
  });

  it('claim de placeholder herda pending, nunca legacy', async () => {
    await prisma.doctor.create({ data: { name: 'Pendente', crm: '34567-SP', crmUf: 'SP', email: 'placeholder-34567@exemplo.com', passwordHash: 'pending-invite', verificationStatus: 'legacy' } });
    expect((await register({ crm: '34567' })).status).toBe(201);
    expect((await prisma.doctor.findUnique({ where: { crm: '34567-SP' } }))?.verificationStatus).toBe('pending');
  });

  it('convite: UF inválida (PoC 000000-ZZ) → 422 CRM_INVALID', async () => {
    const token = await invite();
    const r = await api().post(`/api/public/doctor-invite/${token}/register`).send({ name: 'Médico Fake', crm: '000000', crmUf: 'ZZ', email: mail(), password: 'senha123' });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('CRM_INVALID');
  });

  it('convite: CFM inativo → 422 CRM_INACTIVE', async () => {
    const token = await invite();
    cfmAs('Cancelado');
    const r = await api().post(`/api/public/doctor-invite/${token}/register`).send({ name: 'Dra Ana', crm: '23456', crmUf: 'SP', email: mail(), password: 'senha123' });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('CRM_INACTIVE');
  });

  it('convite válido → 201, conta pending e o token NÃO abre dado de paciente', async () => {
    const token = await invite();
    const r = await api().post(`/api/public/doctor-invite/${token}/register`).send({ name: 'Dra Ana', crm: '45678', crmUf: 'SP', email: mail(), password: 'senha123' });
    expect(r.status).toBe(201);
    expect((await prisma.doctor.findUnique({ where: { crm: '45678-SP' } }))?.verificationStatus).toBe('pending');
    const g = await api().get('/api/doctor/patients').set(authHeader(r.body.token));
    expect(g.status).toBe(403);
    expect(g.body.code).toBe('VERIFICATION_REQUIRED');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test --workspace packages/server -- test/doctor-register-kyc.test.ts` → FAIL.

- [ ] **Step 3: `doctor.routes.ts` — CFM exato.** Estender o import de `../utils/cfm` com `cfmState` e acrescentar `import { notifyKycAdmin } from '../kyc/notify';`. Trocar:
```ts
    if (cfm && cfm.situation && !/ativo/i.test(cfm.situation)) {
```
por:
```ts
    if (cfm && cfmState(cfm.situation) === 'inactive') { // /ativo/i casava "Inativo"
```

- [ ] **Step 4: `doctor.routes.ts` — claim e conflito.** No `prisma.doctor.update` do claim (`passwordHash === 'pending-invite'`), acrescentar ao `data` (depois de `identityLockedAt: null`):
```ts
, verificationStatus: 'pending' // KYC: quem reivindica nasce pending — os shares herdados só abrem após verificação
```
e trocar:
```ts
      } else {
        res.status(409).json({ error: 'CRM ou e-mail já cadastrado. Faça login.' }); return;
      }
```
por:
```ts
      } else {
        // Mesmo CRM, outro e-mail = alguém tentando o CRM de quem já tem conta (spec §7): fica registrado.
        const crmConflict = existing.crm === crmKey && existing.email !== mail;
        if (crmConflict) {
          void audit('DOCTOR_CRM_CONFLICT', req, { actorType: 'SYSTEM', targetType: 'DOCTOR', targetId: existing.id, after: { crm: crmKey, attemptedEmail: mail, existingStatus: existing.verificationStatus } });
          if (!['approved', 'legacy'].includes(existing.verificationStatus)) {
            void notifyKycAdmin('Dr. Exame — CRM disputado por dois cadastros', [
              `CRM ${crmKey}: já existe cadastro NÃO verificado e chegou outro com e-mail diferente.`,
              'Se o novo for o titular, libere o CRM no admin.',
            ]);
            res.status(409).json({ code: 'CRM_IN_USE_UNVERIFIED', error: 'Este CRM já tem um cadastro em verificação. Se o CRM é seu, fale com o suporte: contato@janocaminho.com.br' });
            return;
          }
        }
        res.status(409).json({ error: 'CRM ou e-mail já cadastrado. Faça login.' }); return;
      }
```

- [ ] **Step 5: `app.ts` — convite.** Acrescentar `import { lookupCfm, cfmState, BR_UFS } from './utils/cfm';` nos imports. Na rota `app.post('/api/public/doctor-invite/:token/register'`, logo depois do bloco `if (!name || !crm || !email || !password) { ... }`, inserir:
```ts
    // AUD-003 parte 1 (spec §7): CRM/UF válidos + CFM não inativo. A conta nasce 'pending' (default
    // do schema) → o token abaixo só abre o onboarding; dado de paciente só após o KYC (gate).
    const crmDigits = String(crm).replace(/[-/\s]*[A-Za-z]{2}\s*$/, '').replace(/\D/g, '');
    const ufIn = String(crmUf || String(crm).match(/([A-Za-z]{2})\s*$/)?.[1] || '').trim().toUpperCase();
    if (!/^\d{3,7}$/.test(crmDigits) || !BR_UFS.has(ufIn)) {
      res.status(422).json({ code: 'CRM_INVALID', error: 'CRM ou UF inválidos.' });
      return;
    }
    const cfm = await lookupCfm(crmDigits, ufIn).catch(() => null);
    if (cfm && cfmState(cfm.situation) === 'inactive') {
      res.status(422).json({ code: 'CRM_INACTIVE', error: `CRM consta como "${cfm.situation}" no CFM. Se for engano, contate o suporte.` });
      return;
    }
```
e no `prisma.doctor.update` do claim dessa rota, acrescentar ao `data`: `verificationStatus: 'pending',`.

- [ ] **Step 6: Rodar e ver passar** — mesmo comando → PASS (7 testes).

- [ ] **Step 7: Commit (só com ok do dono)** — `git add packages/server/src/routes/doctor.routes.ts packages/server/src/app.ts packages/server/test/doctor-register-kyc.test.ts && git commit -m "fix(kyc): cadastro barra CRM inativo de verdade + conflito de CRM registrado + AUD-003 parte 1 no convite"`

---

### Task 13: Repasse só para quem pode atender

**Files:**
- Modify: `packages/server/src/finance/payout.ts:112-118`
- Test: `packages/server/test/finance-payout.test.ts` (+1 teste no mesmo `describe` do teste "médico sem PIX", `:189`)

**Interfaces:**
- Consumes: `doctorCanPractice` (T2); `enqueueException(kind, chave, payload)` (`jobs/reconciliation.ts:51`).
- Produces: exceção `payout_doctor_unverified` com chave `payout:doctor:<id>`.

- [ ] **Step 1: Teste que falha** — em `test/finance-payout.test.ts`, logo depois do teste `'médico sem PIX → NÃO cria payout; ...'` (`:189-197`):
```ts
  it('médico não verificado (KYC) → NÃO cria payout; exceção payout_doctor_unverified', async () => {
    const doc = await seedDoctor();
    await prisma.doctor.update({ where: { id: doc.id }, data: { verificationStatus: 'pending' } });
    await seedEligible(doc.id);
    const p = await runPayoutPass(Date.now());
    expect(p.created).toBe(0);
    expect(p.exceptionsCreated).toBe(1);
    expect(await openExceptions('payout_doctor_unverified', `payout:doctor:${doc.id}`)).toBe(1);
    expect(await prisma.payout.count()).toBe(0);
  });
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test --workspace packages/server -- test/finance-payout.test.ts` → FAIL no teste novo.

- [ ] **Step 3: Implementar** — em `src/finance/payout.ts`, import `import { doctorCanPractice } from '../utils/doctorAccess';` e trocar:
```ts
    const doctor = await prisma.doctor.findUnique({
      where: { id: doctorId },
      select: { payoutPixKeyEnc: true, payoutPixKeyIv: true, payoutPixKeyType: true },
    }).catch(() => null);
```
por:
```ts
    const doctor = await prisma.doctor.findUnique({
      where: { id: doctorId },
      select: { payoutPixKeyEnc: true, payoutPixKeyIv: true, payoutPixKeyType: true, blocked: true, verificationStatus: true },
    }).catch(() => null);
    // KYC (spec §7): repasse só p/ quem pode atender (approved ou legacy no prazo) e não bloqueado.
    if (doctor && (doctor.blocked || !doctorCanPractice(doctor.verificationStatus))) {
      if (await enqueueException('payout_doctor_unverified', `payout:doctor:${doctorId}`, { doctorId })) report.exceptionsCreated++;
      continue;
    }
```

- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS (arquivo inteiro).

- [ ] **Step 5: Commit (só com ok do dono)** — `git add packages/server/src/finance/payout.ts packages/server/test/finance-payout.test.ts && git commit -m "feat(kyc): repasse retido p/ médico não verificado (exceção payout_doctor_unverified)"`

---

### Task 13b: E2E do fluxo completo (servidor)

**Files:**
- Test: `packages/server/test/kyc-e2e.test.ts`

**Interfaces:**
- Consumes: tudo das Tasks 1-13 **sem mock de módulo** do UaiID — o UaiID é simulado na camada HTTP (`fetch` → `https://api.uaiid.com.br/v1/...`), então o teste atravessa rota → cliente → decisão → sync → e-mails → admin → gate de verdade. Só o consultaCRM é mockado (cota real de 100/mês).

- [ ] **Step 1: Escrever o E2E** — `test/kyc-e2e.test.ts`

```ts
// E2E do KYC do médico (spec §10/§11): cadastro → verificação → webhook assinado → fila do dono →
// aprovação → gate abre, com os e-mails no caminho. UaiID simulado no fetch (contrato real).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import bcrypt from 'bcryptjs';

vi.mock('../src/utils/cfm', async (orig) => ({
  ...(await orig<typeof import('../src/utils/cfm')>()),
  lookupCfm: vi.fn(async () => ({ name: 'MARIA DA SILVA SOUZA', specialty: null, crm: '98765-SP', uf: 'SP', situation: 'Ativo', source: 'cfm' as const })),
}));

import { prisma } from '../src/prisma';
import { api, authHeader, resetDb, createDoctor, mintToken } from './helpers';
import { sendEmail } from '../src/utils/mailer';
import { saveSettings } from '../src/utils/settings';
import { runKycReconcile } from '../src/jobs/kycReconcile';

const SECRET = 'whsec_e2e';
const VID = '6c5db95c-8d67-41b3-aabc-2e1439f614c3';
let uaiidStatus = 'collecting';
const setupFetch = globalThis.fetch; // stub do setup (Mercado Pago) — nunca a rede

/** UaiID simulado no contrato real (POST cria, GET devolve VerificationOut). */
function stubUaiid() {
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: any) => {
    const u = String(url);
    if (u === 'https://api.uaiid.com.br/v1/verifications' && init?.method === 'POST') {
      return { ok: true, status: 201, json: async () => ({ verification_id: VID, verify_url: 'https://uaiid.com.br/verify/e2e00001', expires_at: new Date(Date.now() + 3_600_000).toISOString(), reused_session: false }) };
    }
    if (u === `https://api.uaiid.com.br/v1/verifications/${VID}`) {
      return { ok: true, status: 200, json: async () => ({
        id: VID, status: uaiidStatus, reason_code: null, external_reference: null,
        completed_at: uaiidStatus === 'approved' ? new Date().toISOString() : null,
        result: { score: 830, declared_vs_document: { name_ratio: 1 }, receita_federal: { situacao_cadastral: 'REGULAR' } },
      }) };
    }
    return (setupFetch as any)(url, init);
  }));
}

const signed = (body: string) => {
  const t = Math.floor(Date.now() / 1000);
  return `t=${t},v1=${createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex')}`;
};
const webhook = (body: string, sig = signed(body)) =>
  api().post('/api/webhooks/uaiid').set('Content-Type', 'application/json').set('X-Uai-Signature', sig).send(body);
const subjects = () => vi.mocked(sendEmail).mock.calls.map((c: any) => String(c[0].subject));

async function createAdmin() {
  const passwordHash = await bcrypt.hash('senha123', 10);
  const u = await prisma.user.create({
    data: { email: `admin-e2e-${Date.now().toString(36)}@exemplo.com`, name: 'Admin E2E', passwordHash, role: 'ADMIN', credits: 0, emailVerified: true },
    select: { id: true },
  });
  return { id: u.id, token: mintToken(u.id) };
}

describe('E2E — KYC do médico, do cadastro ao atendimento', () => {
  beforeEach(async () => {
    await resetDb();
    process.env.UAIID_API_KEY = 'uai_test_e2e';
    process.env.UAIID_WEBHOOK_SECRET = SECRET;
    await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 0 }); // política do começo
    uaiidStatus = 'collecting';
    stubUaiid();
    vi.mocked(sendEmail).mockClear();
  });

  it('caminho feliz: tudo verde cai na fila, dono aprova, médico passa a atender (com os e-mails premium)', async () => {
    const admin = await createAdmin();
    const { doctor, token } = await createDoctor({ crm: '98765-SP', name: 'Maria da Silva Souza', verificationStatus: 'pending' });

    // 1) pending não atende
    expect((await api().get('/api/doctor/patients').set(authHeader(token))).body.code).toBe('VERIFICATION_REQUIRED');

    // 2) inicia o KYC (declara o nome do CFM)
    const start = await api().post('/api/doctor/verification').set(authHeader(token));
    expect(start.status).toBe(201);
    expect(start.body.verifyUrl).toBe('https://uaiid.com.br/verify/e2e00001');

    // 3) UaiID aprova a identidade e manda o webhook assinado (payload real do caminho feliz)
    uaiidStatus = 'approved';
    const body = JSON.stringify({ id: 'evt-1', event: 'verification.approved', verification_id: VID, data: { verification_id: VID, score: 830, reason_code: null, full_name: 'MARIA DA SILVA SOUZA', cpf_masked: '123.***.***-09', cpf_situacao: 'REGULAR' } });
    expect((await webhook(body)).status).toBe(200);
    await vi.waitFor(async () => expect((await prisma.doctor.findUnique({ where: { id: doctor.id } }))?.verificationStatus).toBe('needs_admin'));

    // 4) e-mails: dono ("pronto para aprovar") e médico ("Recebemos seu cadastro")
    await vi.waitFor(() => expect(subjects()).toEqual(expect.arrayContaining([expect.stringContaining('pronto para aprovar'), expect.stringContaining('Recebemos seu cadastro')])));

    // 5) a fila mostra o caso com os dois nomes
    const q = await api().get('/api/admin/doctors/verification-queue').set(authHeader(admin.token));
    expect(q.body.review[0]).toMatchObject({ providerId: VID, reasonCode: 'manual_policy', documentName: 'MARIA DA SILVA SOUZA', cfmName: 'MARIA DA SILVA SOUZA', decideIn: 'drexame' });

    // 6) o médico vê "em análise" e segue sem atender
    expect((await api().get('/api/doctor/verification').set(authHeader(token))).body.status).toBe('needs_admin');
    expect((await api().get('/api/doctor/patients').set(authHeader(token))).status).toBe(403);

    // 7) dono aprova → e-mail "já pode atender" → gate abre
    expect((await api().post(`/api/admin/doctors/${doctor.id}/verification/approve`).set(authHeader(admin.token)).send({})).status).toBe(200);
    await vi.waitFor(() => expect(subjects()).toEqual(expect.arrayContaining([expect.stringContaining('já pode atender')])));
    expect((await api().get('/api/doctor/patients').set(authHeader(token))).status).toBe(200);
  });

  it('impostor: identidade real com nome diferente do CFM → fila com nomes lado a lado; dono recusa; evidência sobrevive', async () => {
    const admin = await createAdmin();
    const { doctor, token } = await createDoctor({ crm: '98765-SP', name: 'Maria da Silva Souza', verificationStatus: 'pending' });
    await api().post('/api/doctor/verification').set(authHeader(token));
    uaiidStatus = 'approved';
    const body = JSON.stringify({ id: 'evt-2', event: 'verification.approved', verification_id: VID, data: { verification_id: VID, full_name: 'JOAO PEREIRA LIMA' } });
    await webhook(body);
    await vi.waitFor(async () => expect((await prisma.doctorVerification.findUnique({ where: { providerId: VID } }))?.reasonCode).toBe('name_mismatch'));
    expect((await api().post(`/api/admin/doctors/${doctor.id}/verification/reject`).set(authHeader(admin.token)).send({ reason: 'documento de outra pessoa' })).status).toBe(200);
    await vi.waitFor(() => expect(subjects()).toEqual(expect.arrayContaining([expect.stringContaining('não foi aprovada')])));
    expect((await api().get('/api/doctor/patients').set(authHeader(token))).status).toBe(403);
    await prisma.doctor.delete({ where: { id: doctor.id } }); // dono libera o CRM
    expect(await prisma.doctorVerification.findUnique({ where: { providerId: VID } }))
      .toMatchObject({ doctorId: null, crm: '98765-SP', documentName: 'JOAO PEREIRA LIMA' });
  });

  it('webhook perdido: o job reconcilia pelo GET (sem nome, vale o name_ratio 1)', async () => {
    const { doctor, token } = await createDoctor({ crm: '98765-SP', name: 'Maria da Silva Souza', verificationStatus: 'pending' });
    await api().post('/api/doctor/verification').set(authHeader(token));
    uaiidStatus = 'approved';
    await prisma.doctorVerification.update({ where: { providerId: VID }, data: { lastSyncedAt: new Date(Date.now() - 20 * 60_000) } });
    expect((await runKycReconcile(Date.now())).synced).toBe(1);
    expect((await prisma.doctor.findUnique({ where: { id: doctor.id } }))?.verificationStatus).toBe('needs_admin');
  });

  it('assinatura falsa não muda nada', async () => {
    const { doctor, token } = await createDoctor({ crm: '98765-SP', verificationStatus: 'pending' });
    await api().post('/api/doctor/verification').set(authHeader(token));
    uaiidStatus = 'approved';
    const body = JSON.stringify({ id: 'evt-x', event: 'verification.approved', verification_id: VID, data: { full_name: 'X' } });
    expect((await webhook(body, `t=${Math.floor(Date.now() / 1000)},v1=${'a'.repeat(64)}`)).status).toBe(401);
    expect((await prisma.doctor.findUnique({ where: { id: doctor.id } }))?.verificationStatus).toBe('in_progress');
  });
});
```

- [ ] **Step 2: Rodar** — `npm test --workspace packages/server -- test/kyc-e2e.test.ts`
Expected: PASS (4). Se algum falhar, a falha aponta qual task anterior divergiu do spec — corrigir lá, nunca afrouxar o E2E.

- [ ] **Step 3: Commit (só com ok do dono)** — `git add packages/server/test/kyc-e2e.test.ts && git commit -m "test(kyc): E2E do fluxo completo — cadastro→webhook→fila→aprovação→gate (+ impostor, webhook perdido, assinatura falsa)"`

---

### Task 14: Fechamento — env, suíte, drift gate, grafo

**Files:**
- Modify: `packages/server/.env.example`, `packages/server/.env.prod.example`

- [ ] **Step 1: Documentar as variáveis** — acrescentar ao fim de `.env.example` **e** de `.env.prod.example`:
```bash
# KYC do médico (UaiID) — spec docs/design/2026-10-28-verificacao-medico-spec.md §8
UAIID_API_KEY=
UAIID_WEBHOOK_SECRET=
# UAIID_BASE_URL=https://api.uaiid.com.br
# UAIID_TIMEOUT_MS=8000
# UAIID_RETURN_URL=https://drexame.janocaminho.com.br/#/doctor?kyc=1
```

- [ ] **Step 2: Suíte inteira + typecheck**
```bash
npm test --workspace packages/server
cd packages/server && npx prisma generate && npx tsc --noEmit
```
Expected: tudo verde; zero erro de tipo.

- [ ] **Step 3: Drift gate (CLAUDE.md)** — toda coluna nova do schema existe na migration:
```bash
cd packages/server
for c in verificationStatus verifiedAt verifiedBy doctor_verifications nameRatio cfmSituation lastSyncedAt; do
  grep -q "$c" prisma/migrations/20261029b_doctor_kyc/migration.sql && echo "ok $c" || echo "FALTA $c"
done
```
Expected: só "ok".

- [ ] **Step 4: Fumaça contra o UaiID real (dev)** — com o servidor local (`npm run dev --workspace packages/server`) e um médico `pending` de dev, `POST /api/doctor/verification` deve devolver `201` com `verifyUrl` em `https://uaiid.com.br/verify/...`; abrir o link no celular e concluir. Sem túnel, o resultado entra pelo `GET /api/doctor/verification` (> 60s) ou pelo job.

- [ ] **Step 5: Atualizar o grafo** — da raiz: `graphify update .`

- [ ] **Step 6: Commit (só com ok do dono)** — `git add packages/server/.env.example packages/server/.env.prod.example graphify-out && git commit -m "chore(kyc): env do UaiID documentado + grafo atualizado"`

---

## Depois deste plano
- **Plano 2 (web/admin/APK):** card do portal, aba "Médicos em análise", selo do paciente, retorno App Link/popup/QR, AUD-003 parte 2 (OTP antes do JWT no convite), Playwright do nosso lado, AAB.
- **No painel do UaiID (dono):** cadastrar o webhook (spec §8) depois do deploy; limite de tentativas = 3; gerar chave nova depois dos testes.
