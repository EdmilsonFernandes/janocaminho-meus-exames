# Saúde Esportiva — Como Funciona (doc operacional + técnica)

> Feature: modo opcional premium p/ praticantes de atividade física, atletas e quem declara uso de hormônios.
> Status: **E1 (fundação) em produção desde 06/10/2026** (`2d2c09dd`) — **INVISÍVEL até o admin ligar**.
> Docs irmãs: `RELATORIO.md` (estudo/decisões) · `BACKLOG.md` (épicos E1-E6) · `preview-sports-athlete-dashboard.html` (IA de layout do E4).

---

## 1. Em uma frase

O paciente **declara** seu contexto esportivo (esporte, treino, substâncias, suplementos) e isso passa a **enriquecer a interpretação** dos exames pela IA — **nunca** normaliza risco, **nunca** recomenda ciclo/dose/TPC, **nunca** esconde alerta.

## 2. Acender/apagar (admin — sem deploy)

| Passo | Onde |
|---|---|
| Ligar | Admin (web) → aba **Config** → categoria **sportsMode** → `enabled = 1` → salvar |
| Desligar | Mesmo lugar → `enabled = 0` |

Regras do interruptor (implementado em `sportsModeEnabled()` — `settings.ts`):
- **Ausência da chave nunca liga** (fail-safe: banco antigo/row parcial = feature off).
- É **global**: liga a feature pra todo o app. A visibilidade por paciente continua sendo: flag ON **+** plano premium **+** paciente ativar o toggle no Perfil.
- Efeito imediato (cache de settings invalida no save); o card some/aparece sem reload.

## 3. O que o paciente vê (com tudo ligado)

1. **Perfil → Preferências → "Saúde Esportiva"**:
   - Sem premium → card vira CTA "Disponível no Premium" → `/planos`.
   - Com premium → **toggle** (persistido por paciente: `useStore('sportsMode.<patientId>')`).
   - Toggle ON → cria `SportsProfile` vazio (PUT inicial) → chip "✓ Modo esportivo ativado".
2. **Substâncias declaradas** (form no mesmo card): classe (Hormônio/Suplemento/Outro) + nome + dose/período + início.
   - Vira uma **Medication** com `name = "[Hormônio] Testosterona"` e `dosage = "250mg/semana — declarado pelo paciente"`.
   - **Por que assim**: medicações ativas JÁ entram no contexto do chat (`medications-context.ts`) e nos cruzamentos de interação (ex.: testosterona × hemoglobina) — a substância declarada herda tudo isso sem código novo.
3. **Dashboard**: por enquanto **não muda** (E4 fará o modo esportivo). Hoje o efeito é: a IA do chat/resumo passa a considerar o contexto.

## 4. Modelo de dados

```
Patient 1—1 SportsProfile (NOVA, aditiva — patientId @unique, cascade)
  modality?        "Corrida" | "Musculação" | ... (string ≤60)
  trainingFreq?    "5x/semana" (≤30)
  goals?           "Hipertrofia" (≤300)
  supplements?     Jsonb (lista ≤20)
  collectionContext? Jsonb (treino <24h? horário da coleta? jejum? doença recente?)
  declaredSubstances? Jsonb (espelho p/ leitura rápida do front)

Medication (EXISTENTE, sem mudança) — substância declarada = name com prefixo [Classe]
```
- Migration: `20261006_sports_profiles` (CREATE TABLE IF NOT EXISTS — idempotente, aplicada via `migrate deploy` no boot).
- **Nenhuma coluna adicionada a Patient/Exam** — paciente normal intocado.
- Agregados futuros DEVEM filtrar `status:'EXTRACTED'` (drift gate do repo).

## 5. API

| Endpoint | Quem | Comportamento |
|---|---|---|
| `GET /api/sports/profile` | paciente (auth) | Sempre responde (perfil `null` se nunca declarado) — mesmo com flag OFF |
| `PUT /api/sports/profile` | paciente (auth) | Upsert no **titular**; **403 `sports_mode_disabled`** se flag OFF; validações: modality≤60, trainingFreq≤30, goals≤300, Jsonb≤20 itens (400); merge parcial (campo ausente preserva, null limpa) |
| `GET /api/public/config` | público | expõe `sportsMode:{enabled}` (front esconde o card quando 0) |

Isolamento: `patientId` explícito só é aceito se pertencer ao usuário logado (senão 403). Testes: `sports-mode.test.ts`, `sports-profile.test.ts`, `sports-substance.test.ts` (15).

## 6. Regras de segurança embutidas (E1)

1. **Flag OFF por default** — nada aparece pra ninguém até o admin ligar.
2. **Paciente normal intocável** — zero mudança de comportamento com flag off (testado: suíte 840 verde sem edit em teste existente).
3. **PUT bloqueado com flag OFF** — mesmo bypassando o front, a API recusa.
4. Substância declarada é **registro declarado**, rotulado como tal ("declarado pelo paciente") — nunca vira "prescrição".
5. Alertas (`isAbnormal`/healthNudges) **sem mudança** — contexto esportivo nunca suprime alerta (vira regra testada no E2/E6).

## 7. O que NÃO existe ainda (roadmap — ver BACKLOG.md)

| Épico | Conteúdo | Gate |
|---|---|---|
| **E2** | `ClinicalGoal` (meta clínica **só médico**, justificada, auditada) + 4 camadas de referência + coluna `method` | — |
| **E3** | Knowledge esportivo (SHBG, LH/FSH, Hct, ALT/AST/CK, cistatina C...) + addendum de prompt IA | **médico revisor** (obrigatório antes do piloto) |
| **E4** | Dashboard "Saúde Esportiva" (IA do preview; componentes 100% do padrão) | E2 |
| **E5** | Portal médico: escopo `sports`, revisões (revisado/em acompanhamento/resolvido) | E2 |
| **E6** | Bateria de validação por família (metas ≠ referência, IA sem faixa segura, etc.) | contínuo |
| Go-to-market | **Pesquisa regulatória Anvisa/CFM pendente** (o deep research não validou esse ângulo) | jurídico |

## 8. FAQ suporte

- **"Não aparece o card Saúde Esportiva"** → (a) flag global off? (admin), (b) usuário premium? (c) recarregou o app p/ pegar o public/config?
- **"Ativei mas o dashboard é igual"** → normal; troca de dashboard é o E4. Hoje o efeito é no contexto da IA.
- **"Deleto uma substância declarada?"** → chips do form têm lixeira (exclui a Medication).
- **"Desligar o modo perde dados?"** → não; o `SportsProfile` fica guardado (LGPD: exclusão de conta já cascata).

## 9. Monetização

- Modo **Premium desde o dia 1** (decisão do dono 06/10) — gate no card do Perfil (`usePremium()`), CTA → `/planos`.
- Créditos de IA inalterados (chat 2, resumo 10, consolidado 20). **Alertas continuam grátis** (regra de segurança do produto).

## 10. Arquivos-chave (p/ dev/agent)

| Arquivo | O quê |
|---|---|
| `packages/server/src/utils/settings.ts` | `sportsMode` + `sportsModeEnabled()` (kill-switch) |
| `packages/server/src/routes/sports.routes.ts` | GET/PUT perfil (auth, validação, 403 flag) |
| `packages/server/src/routes/admin.routes.ts` | `sportsMode` em NUMERIC_CATEGORIES (live) |
| `packages/server/prisma/schema.prisma` | `SportsProfile` |
| `packages/web/src/components/SportsModeCard.tsx` | card do Perfil (3 gates: flag/premium/estado) |
| `packages/web/src/components/DeclaredSubstanceForm.tsx` | form de substâncias |
| `packages/web/src/config.ts` | `SportsModeConfig` no PublicConfig |
| Testes | `sports-mode/profile/substance.test.ts` (server, 15) + `SportsModeCard.test.tsx` (web, 4) |
