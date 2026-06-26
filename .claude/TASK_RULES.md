# Task Rules — Como executar tarefas

Toda tarefa segue **exatamente** esta sequência. Não pular passos.

```
1. Graphify        — entender impacto/dependências antes de tocar
2. Analisar impacto — quem usa? mobile vs desktop vs server? risco?
3. Serena          — localizar arquivos/símbolos exatos
4. GSD             — dividir em tarefas (ou tasks nativas se GSD sem key)
5. Context7        — só se uma API de lib estiver em dúvida
6. Implementar     — Serena para editar; claro e no padrão do entorno
7. Atualizar Graphify — após mudanças estruturais relevantes
8. Testes          — typecheck + testes (tabela abaixo)
9. Relatório       — commit hash, escopo, arquivos, o que rodar
```

## Regra de "tarefa concluída"
Uma tarefa **só está concluída** quando:
1. Código alterado.
2. **Validado** (`tsc --noEmit` limpo em server **e** web; testes verdes se tocou lógica/rota).
3. **Commit + push** feitos (quando o user pedir — nunca commitar sem ordem).
4. User informado: **commit hash + escopo (server/web/mobile/db) + o que rodar**.

> **Nunca** dizer "concluído" sem validar. **Nunca** esconder erro.

## Validação OBRIGATÓRIA antes de commitar
| Tipo de mudança | Comando |
|---|---|
| Server (backend/rotas/schema) | `cd packages/server && npx prisma generate && npx tsc --noEmit && npm test` |
| Web (frontend) | `cd packages/web && npx tsc --noEmit` (vite build **não** type-checka — o CI pega e quebra o deploy) |
| Schema | `prisma generate` + `DATABASE_URL=...test... prisma db push` + `npm test` |
| Mobile | `npm run sync` + testar no aparelho (APK debug) |

- **NUNCA** `npx vitest` da raiz (CWD vaza, pode truncar DB dev). **SEMPRE** `npm test --workspace packages/server`.
- DB de teste: `meus_exames_test` (porta 5433). `test/setup.ts` seta o `DATABASE_URL`. `prisma db push` sincroniza (não `migrate dev` — há drift P3006).
- Novo código = novos testes: unit pra lógica pura, E2E (supertest) pra rotas, regressão pra bugs.

## Build mobile (APK/AAB)
```bash
cd packages/mobile && npm run sync        # build web (VITE_BASE './') + cap sync android
cd android && ./gradlew bundleRelease      # AAB (Play Store)
# ou ./gradlew assembleDebug               # APK (teste rápido)
```
- **versionCode +1 SEMPRE** antes de AAB (Play Store rejeita duplicado). Editar `app/build.gradle`.
- Mudança **patient-facing** (tela que o user vê no app) → precisa rebuild `www` + AAB (o app carrega o `www` empacotado; só `git push` não atualiza o app do celular).
- Mudança **server/admin-web** → `git push` basta (admin roda no navegador; server no deploy).

## Deploy
- `git push origin main` → CI (test = gate) → GHCR → EC2 pull. **Automático.**
- Verificar no ar: `curl -s https://janocaminho.com.br/minhasaude/api/health | grep versionLabel`.

## Princípios
- **Estudar antes de editar.** Reuso primeiro (Graphify/Serena) — não criar duplicata.
- **Não refatorar fora do pedido**, não alterar fora do escopo.
- **Não usar** `ANTHROPIC_API_KEY` real — só o relay (`ANTHROPIC_AUTH_TOKEN`+`BASE_URL`).
- **Não mexer** nos containers `janocaminho-*`.
- **Sempre informar** commit + escopo + o que rodar.

## Ops profundo
SSH EC2, migrations P3009, emergência 502, debug de push, monetização, gotchas completos → **`.ai/SKILL.md`**.
