# Release 1.8.0 — Portal do Médico premium + correções

**Data:** 2026-06-21 · **versionCode 33** · AAB assinado, pronto pra Play Store.

> Deploy automático via `git push` (web + server). A migration `20260621180000_add_doctor_notes`
> roda no boot do container (`prisma migrate deploy`), criando a tabela `doctor_notes`.

## ✅ O que foi feito (fase "Portal do Médico premium", itens 1–4)

### #1 Anotações / histórico de atendimento (`DoctorNote`)
- Nova tabela `doctor_notes` (migration) + modelo Prisma.
- Endpoints: `GET/POST /api/doctor/patients/:pid/notes`, `PATCH/DELETE /api/doctor/notes/:id` (scoped por share ativa).
- Tab **📝 Anotações** no portal (sempre disponível p/ qualquer paciente compartilhado): criar, editar, excluir.

### #2 Gráficos de evolução
- Tab 📈 Evolução agora renderiza **LineChart por analito** com **zona de referência** (faixa verde) e filtros **6 meses / 1 ano / Tudo**.
- Endpoint `/doctor/patients/:pid/evolution` ampliado (`take` 100→300).

### #3 Hero "resumo de 10 segundos"
- Card no topo do paciente: nº de valores alterados, último exame + data, chips dos alterados. Contraste alto pra leitura rápida na consulta.

### #4 Copiar resumo pro prontuário
- Botão **📋 Copiar resumo** no hero: copia texto formatado (paciente, convênio, exames, alterações) pra colar no sistema do médico.

### Arquitetura / qualidade
- `categorize` + `CATS` movidos p/ `utils/medicalData.ts` (fonte única, testável).
- **Bug corrigido** (pego pelo teste): HbA1c ("hemoglobina glicosada") agora categoriza como **Glicemia** (antes caía em Hemograma).

### Correções incluídas nesta versão (acumuladas)
- Safe area do topo do portal médico · PDF abre via `@capacitor/browser` (antes só girava)
- Foto do paciente aparece nos cards do médico · menu rodapé igual o app do paciente
- Resumos de IA aparecem na tab do médico · botão Voltar duplicado corrigido
- Médico solicitante nos cards de exame (médico + paciente)
- Score de saúde com **cache** (só recalcula quando muda o último exame)
- Extrato de créditos: carrega tudo + filtra/pagina client-side (corrigiu filtro "Compras")
- Fix do `AppUpdate.performImmediateUpdate` (que travava o CI)

## 🧪 Testes (todos verdes)
- **Backend:** `91/91` — inclui `doctor-notes.test.ts` (CRUD + isolamento médico/paciente + 403/401). Rode: `npm test --workspace packages/server`
- **Frontend:** `9/9` — `medicalData.test.ts` (categorização que alimenta gráficos + detalhe do exame). Rode: `npm test --workspace packages/web`
- **E2E:** ⚠️ o projeto **não tem** harness Playwright/Cypress. Backend tem cobertura API ampla; front tem teste de lógica. Montar e2e é tarefa dedicada (sinalizado).

## 📦 Artefatos
```
APK (teste):  packages/mobile/android/app/build/outputs/apk/debug/app-debug.apk
AAB (publish): packages/mobile/android/app/build/outputs/bundle/release/app-release.aab
```

## 🔍 Como validar em produção

### Web (imediatamente após deploy)
1. `https://janocaminho.com.br/minhasaude` → login **🩺 Médico** (e-mail ou CRM + senha).
2. **Hero:** abra um paciente → card escuro no topo mostra alterações + último exame + botão **Copiar resumo** (cole num bloco de notas p/ conferir).
3. **Gráficos:** tab **📈 Evolução** → veja gráficos por analito com faixa verde (referência) → troque o filtro 6m/1ano/Tudo.
4. **Anotações:** tab **📝 Anotações** → crie uma nota → edite → exclua → recarregue (persistiu).
5. **Menu rodapé:** Pacientes · Perfil · Mais (Sair/Trocar senha). Confira o topo NÃO brigando com o notch (safe area).

### Mobile (APK 1.8.0 / Play)
- Mesmo fluxo acima. **Pra publicar:** subir `app-release.aab` na Play Store (versionCode 33). O in-app update nativo + force-update derivam do `versionName` automaticamente.

### Checagens rápidas de não-regressão
- Login de **paciente** ainda funciona (isolamento médico/paciente garantido).
- Paciente: **Meus Médicos** → cards premium com escopos toggleáveis numa linha.
- Paciente: **Evolução** → grupos por categoria entram recolhidos; **Exames** → médico solicitante aparece.

## ⏭️ Próximos passos sugeridos
- E2E (Playwright) cobrindo: cadastro → OTP → upload → relatório → portal médico.
- Detecção de outlier + base de conhecimento (backlog).
- Hero com IA técnica real (hoje é derivado dos dados; opcional chamar a IA p/ linguagem clínica).
