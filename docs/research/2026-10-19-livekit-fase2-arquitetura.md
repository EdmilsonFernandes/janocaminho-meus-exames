# F2 LiveKit — Arquitetura e contratos (19/10/26)

Fonte: plano `2026-10-19-livekit-fase2-plano.md` (aprovado). Lido antes: `meet.ts`,
`reminder.routes.ts`, `doctor.routes.ts` L949-992, `Reminders.tsx`, `jobs/reminderEmails.ts`
(roll), `middleware/auth.ts`.

## 0. Decisões (com justificativa)

- **D1 — Colunas novas `provider String?` + `roomName String?` no Reminder (NÃO derivar por URL).**
  Por quê: linkUrl manual aceita qualquer domínio (Teams/WhatsApp/Zoom) → sniffing frágil;
  room não é derivável de URL (LiveKit room não tem URL pública); join precisa branch
  determinístico; F3 (Egress/gravação) referenciará a sala pelo nome salvo. Nullable =
  drift-safe (legado = null = comportamento atual). Migration aditiva `IF NOT EXISTS`.
- **D2 — Recorrente: SALA RENASCIDA (mesma `roomName`), não sufixo por ocorrência.**
  LiveKit Cloud destrói sala vazia (`emptyTimeout` 300s — setamos no create); próxima
  ocorrência recria o mesmo nome. O roll JÁ reseta `consentAt: null` (reminderEmails.ts L95)
  → paciente re-consente a cada ocorrência (Art.15 é por consulta). TTL 2h « intervalo
  mínimo de recorrência (diário=24h) → token de ocorrência N nunca alcança N+1. Sufixo
  `dueDate-epoch` foi rejeitado: desatualizaria `roomName` a cada roll (exigiria tocar o job,
  arquivo de outro dono) e complicaria lookup F3.
- **D3 — Precedência no agendamento: `createLiveKit` > `createMeet` > link manual.**
  `createLiveKit` só é oferecido/honrado com `LIVEKIT_*` no env (padrão `hasMeetConfig`).

## 1. Contratos

### 1a. GET `/api/teleconsulta/:id/join` (backend2)
Auth: `Bearer` com middleware DUAL local (`requireJoinIdentity` em teleconsulta.routes.ts):
- JWT `type:'doctor'` → `req.doctorId` (valida doctor existe); `role='doctor'`.
- senão → espelha `requireAuth` (user bloqueado/tokenVersion) → `req.userId`; `role='patient'`.
(Não mexer em middleware/auth.ts — doctor token é rejeitado pelo requireAuth original.)

Fluxo:
1. `reminder.findUnique(id)` → 404 se ausente ou `type!=='teleconsulta'`.
2. Ownership: doctor → `doctorShare.findFirst({doctorId, patientId, active:true})` (cópia
   local de 3 linhas do `requireShare`; doctor.routes.ts é de outro dono) → 403 sem share.
   Patient → `reminder.patientId ∈ userPatientIds(req.userId)` → 403 senão.
3. Provider: `reminder.provider!=='livekit' || !hasLiveKitConfig()` →
   **501** `{ error, code:'LIVEKIT_UNAVAILABLE', configured:boolean, linkUrl }`
   (client cai no linkUrl = Meet/manual).
4. Consent (só paciente): sem `consentAt` → **403** `{ error:'…', code:'CONSENT_REQUIRED' }`.
   Médico NÃO precisa: o consentimento Art.15/CFM 2.314/22 é do PACIENTE (titular dos dados
   sensíveis transmitidos — LGPD art. 11); o médico é o profissional do ato, não fonte de consentimento.
5. Token: `buildJoinToken({ identity: 'patient:<userId>' | 'doctor:<doctorId>',
   name: user.name | 'Dr. <nome> (CRM/UF)', room: reminder.roomName ?? 'teleconsulta-<id>',
   ttlSec: 7200, metadata: { reminderId, role } })`.
6. **200** `{ serverUrl: process.env.LIVEKIT_URL, token, room }`.

Token NUNCA é persistido: cliente chama join a cada (re)entrada → token expirado na hora da
consulta se resolve sozinho (re-join gera novo).

### 1b. Schema (backend1)
```prisma
// model Reminder — depois de createdByDoctorId:
provider   String?  // 'meet' | 'livekit' | null (link manual colado)
roomName   String?  // sala LiveKit p/ provider='livekit' (F3 egress referencia)
```
Migration (aditiva, idempotente):
```sql
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "roomName" TEXT;
```
Boot do container roda `prisma migrate deploy` antes de servir (Dockerfile CMD) → coluna
existe antes de qualquer rota ler (drift gate coberto).

### 1c. POST `/api/doctor/patients/:patientId/teleconsulta` (backend1, bloco L949-992)
Body: `{ dueDate, title?, recurrence?, linkUrl?, createMeet?, createLiveKit?: boolean }`.
- `createLiveKit && hasLiveKitConfig()` → gerar o id ANTES (`const id = createId()` de
  `@paralleldrive/cuid2`, mesma família do default do Prisma) para casar o padrão do plano:
  `roomName = 'teleconsulta-' + id`, create com `data.id` explícito. Reminder:
  `{ provider:'livekit', roomName, linkUrl: null }` (linkUrl DEIXA de ser obrigatório
  neste ramo — validação L975 vira condicional).
- `createMeet` (google conectado) → como hoje + `provider:'meet'`.
- Manual colado → `provider: null` (comportamento atual).
- `createLiveKit` enviado sem env LIVEKIT → ignora silenciosamente e segue Meet/manual
  (degradação da casa; UI nem mostra o toggle).
- Falha createLiveKitRoom → 502 com msg p/ colar manual (espelha createMeet L970-972).
Retorno: `201 { reminder }` — reminder agora inclui `provider`, `roomName`, `linkUrl|null`.
Push imediato inalterado.

### 1d. PUT `/api/reminders/:id` — guard de link (backend1, 3 linhas)
Hoje L116-117 rejeita `teleconsulta` sem link — quebraria marcar-done de consulta livekit
(`linkUrl:null`). Relaxar: link obrigatório somente quando `provider !== 'livekit'`.

### 1e. `packages/server/src/utils/livekit.ts` (backend1 — assinaturas EXATAS)
```ts
export function hasLiveKitConfig(): boolean; // LIVEKIT_URL + LIVEKIT_API_KEY + LIVEKIT_API_SECRET
export interface LiveKitJoinInput {
  identity: string;            // 'patient:<id>' | 'doctor:<id>'
  name: string;                // display name
  room: string;                // roomName
  ttlSec?: number;             // default 7200
  metadata?: Record<string, unknown>; // JSON.stringify interno
}
export async function createLiveKitRoom(roomName: string): Promise<{ roomName: string }>;
  // RoomService.createRoom { name, maxParticipants: 2, emptyTimeout: 300 } — idempotente.
export async function buildJoinToken(input: LiveKitJoinInput): Promise<string>;
```
Dep: `@livekit/server-sdk` ^2 em `packages/server/package.json`. Estilo = meet.ts
(comentário de degradação no topo).

## 2. Mapa de arquivos / ownership (ZERO overlap)

| Dono | Arquivos |
|---|---|
| **backend1** | `prisma/schema.prisma` (model Reminder) · `prisma/migrations/<nova>/migration.sql` · `src/utils/livekit.ts` (novo) · `src/routes/doctor.routes.ts` (SÓ bloco POST teleconsulta L949-992) · `src/routes/reminder.routes.ts` (SÓ guard 1d) · `package.json` (server) |
| **backend2** | `src/routes/teleconsulta.routes.ts` (novo) · `src/app.ts` (1 linha: `app.use('/api/teleconsulta', …)` perto de L343) · `test/teleconsulta.routes.test.ts` (novo) |
| **frontend** | `web/src/pages/Teleconsulta.tsx` (novo) · `App.tsx` (só rota) · `Reminders.tsx` (1 bloco: `provider==='livekit'` → consent → navegar `/teleconsulta/:id`; senão fluxo linkUrl atual) |

Ninguém toca: `jobs/reminderEmails.ts`, `middleware/auth.ts`, `meet.ts`.

## 3. Edge cases

| Caso | Comportamento |
|---|---|
| Token expira na hora H | Join é chamado a cada entrada/reconexão → novo token (TTL 2h). Cliente nunca cacheia token. |
| Médico entra sem consent do paciente | Médico entra NORMAL (4-①); consent Art.15 é ônus do paciente. |
| Recorrente rola | `consentAt→null` (já existe no roll) + sala renascida D2 → re-consente, nova sala efêmera. |
| Reminder legado (provider null) | Join → 501 `LIVEKIT_UNAVAILABLE` + linkUrl → client abre link externo como hoje. |
| dueDate passado não-recorrente | Join ainda funciona (atraso do médico) — TTL 2h domina. |
| `createLiveKit` + `createMeet` juntos | LiveKit vence (D3). |
| DELETE teleconsulta | Inalterado; sala LiveKit órfã expira sozinha (emptyTimeout) — sem cleanup server-side. |

## 4. Fallback matrix

| Cenário | Agendamento | Join |
|---|---|---|
| `LIVEKIT_*` completo | createLiveKit default (UI mostra toggle) | 200 token |
| `LIVEKIT_*` ausente | Meet/manual como hoje (UI esconde toggle) | 501 `{configured:false}` |
| Configurado, reminder meet/manual | — | 501 `{configured:true, linkUrl}` → client abre externo |

## 5. Contrato mínimo de testes (backend2, supertest + `vi.mock('./utils/livekit')`)
1. paciente sem consent → 403 `CONSENT_REQUIRED`.
2. paciente com consent → 200 `{serverUrl, token, room}` (token do mock).
3. doctor com share → 200 sem consent; sem share → 403.
4. provider null/manual → 501; env ausente (`hasLiveKitConfig:false`) → 501 `configured:false`.
5. rollout: reminder legado (sem colunas preenchidas) não quebra listagem PUT/GET existentes.

Regra de validação padrão: `node ../../node_modules/typescript/bin/tsc --noEmit` no dir do
package; testes SEMPRE em `packages/server` (nunca raiz).
