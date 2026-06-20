# Portal do Médico — Plano (épico, NÃO implementado ainda)

> Salvo em 20/06/2026. Implementar DEPOIS (cirúrgico + E2E). Veja `docs/PROJECT_STATE.md` p/ contexto.

## Objetivo
Paciente compartilha dados (exames, evolução, alertas) seletivamente com médicos. Médico tem login próprio + dashboard objetivo. Tudo com notificação (e-mail + push + deep link).

## Modelagem de Dados (Prisma)
```prisma
model Doctor {
  id           String   @id @default(cuid())
  name         String
  crm          String   @unique
  specialty    String?
  photoUrl     String?
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  shares       DoctorShare[]
  @@map("doctors")
}

model DoctorShare {
  id         String    @id @default(cuid())
  patientId  String
  patient    Patient   @relation(fields: [patientId], references: [id], onDelete: Cascade)
  doctorId   String
  doctor     Doctor    @relation(fields: [doctorId], references: [id], onDelete: Cascade)
  scopes     String[]  // ['exams','evolution','alerts','summary'] — controle granular
  convenio   String?   // particular / convênio X
  active     Boolean   @default(true)
  createdAt  DateTime  @default(now())
  revokedAt  DateTime?
  @@unique([patientId, doctorId])
  @@index([doctorId, active])
  @@map("doctor_shares")
}
```
- Médico: login próprio (`/api/doctor/login`) — auth SEPARADA do paciente.
- `scopes`: paciente escolhe o quê compartilha. Médico só vê o que tiver no `active` share.

## Cenários de Teste E2E (vitest+supertest — blindar antes de mexer)
1. **Paciente adiciona médico** (busca por CRM/nome, ou cria) → `POST /doctor-shares` com scopes → médico recebe e-mail + push ("X compartilhou").
2. **Paciente revoga** → `PATCH /doctor-shares/:id { active: false }` → médico perde acesso + notificado.
3. **Médico loga** → `GET /doctor/patients` → lista só de quem compartilhou (ativo).
4. **Médico acessa dados do paciente** → `GET /doctor/patients/:id/exams` → retorna SÓ se `exams` no scope + share ativo.
5. **Médico tenta dado fora do scope** → **403** (autorização backend).
6. **Fluxos atuais do paciente (testes existentes ~75) continuam 100% verdes.**

## Notificações + Deep Links
- Share/revogação → `sendEmail` (template "Paciente X compartilhou exames com você") + `sendPushToUser` (se médico tiver app/token) com `data: { route: '/doctor/paciente/:id' }`.
- Reusar: `Notification` table (já existe) + `utils/push.ts` (sendPushToUser) + `utils/mailer.ts`.

## Fases (1 por vez, cirúrgico)
1. **Modelagem + migration + E2E do estado atual** (blindar: garantir que os ~75 testes existentes passam antes de mexer).
2. **Backend:** doctor auth (`/api/doctor/*`) + share CRUD + endpoints de dados **scoped** (só o permitido) + notificações (e-mail/push).
3. **UI Paciente:** `/medicos` — tela premium (card médico: foto, nome, CRM, especialidade) + adicionar/buscar + gerenciar shares/scopes (toggle por módulo) + revogar.
4. **UI Médico:** login (`/doctor`) + dashboard (total pacientes, ativos, convênio/particular) + lista de pacientes + visão scoped (exames/evolução/alertas conforme o share).

## Decisões em aberto (confirmar antes de implementar)
- Médico usa o MESMO app (role DOCTOR) ou app/site separado? → sugerido: mesmo app, role DOCTOR, rotas `/doctor/*`.
- Busca de médico: lista fixa (cadastra médico) ou busca por CRM num registro? → MVP: paciente cadastra o médico (nome/CRM/especialidade/foto) + compartilha.
- Foto do médico: upload do paciente ou logo genérica? → MVP: upload (foto) ou inicial.
- Convênio: o paciente informa no share (particular / convênio X) pra o médico filtrar.
