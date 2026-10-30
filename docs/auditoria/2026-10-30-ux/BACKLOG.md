# BACKLOG UX/UI — Lapidação Dr. Exame (30/10/2026)

> Missão: auditar e LAPIDAR (executar, não só sugerir) as áreas de paciente e médico.
> Fontes: auditoria multi-especialista 28/10 (`../2026-10-28/ACHADOS-CONSOLIDADOS.md`),
> auditoria UX 29/10 (artifact + commit d56fa613), teste real de teleconsulta 29/10
> (commit 8b46b86c) e inspeção Playwright desta data (evidências em `evidencias/`).
> Status: ⬜ pendente · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

## Regras de escopo desta rodada
- **Dashboard do paciente (home) = ⛔ BLOQUEADO**: redesign dashboard-v2 ativo pelo dono
  (commits e6aab138/baaebdf1 de 29-30/10). Mexer agora = conflito garantido. Achados de
  home ficam registrados e esperam o v2 estabilizar.
- Preservar identidade (teal #20b2aa, robô, ✨), componentes e regras existentes.
- Validação: tsc web/server + testes dos fluxos tocados + Playwright antes/depois
  (360/390/430 + desktop). Emulação ≠ APK: teclado/voltar/permissões nativas ficam
  marcados como "pendente aparelho".

## Onda 1 — Obstáculos para concluir ações (P1)

| ID | Tarefa | Área/Tela | Problema (evidência) | Status |
|---|---|---|---|---|
| UX-001 | Nome real do paciente (nunca "Edmilson") | Paciente · /minhas-consultas | AUD-010: `r.patient?.name \|\| 'Edmilson'` (MinhasConsultas.tsx:251) mostra o nome do dono do app para QUALQUER usuário | ✅ fallback "Paciente" |
| UX-002 | Estado de erro + "tentar de novo" no detalhe do exame | Paciente · /exams/:id/show | AUD-011: falha de fetch = spinner eterno (ExamShow.tsx:337) — usuário fica preso | ✅ tela de erro (rede/404) + retry + "Meus exames"; PATCH de correção de valor também avisa falha (S2) |
| UX-003 | Loading state nas consultas | Paciente · /minhas-consultas | AUD-013: flash de "Nenhuma consulta" antes dos dados chegarem | ✅ skeletons nas 2 abas até a 1ª resposta |
| UX-004 | ScopeToggle legível no dark | Paciente · /medicos | AUD-012: pílula de PERMISSÃO com rgba preto — invisível no tema escuro (Medicos.tsx ~70) | ✅ cores theme-aware (emerald no dark) |
| UX-005 | Criar pergunta a partir de /perguntas | Paciente · /perguntas | AUD-016: inbox sem campo de escrever; criação escondida em dialog do /medicos | ✅ botão "Nova pergunta" (header + empty state) com dialog próprio — mesmo POST/cobrança do /medicos |
| UX-006 | Touch targets ≥44px restantes | Ambos | AUD-014: Auth toggle, filtros ExamList, tabs do portal, switch "Atender agora" (28–40px) | ✅ Auth toggle 44px + 5 links com padding; ExamList toggles 44px; linha "Atender agora" inteira clicável 44px; tabs do portal já tinham sido refeitas (ícone+rótulo) |

## Onda 2 — Organização e clareza (P2)

| ID | Tarefa | Área/Tela | Problema | Status |
|---|---|---|---|---|
| UX-007 | Título duplicado nas abas do portal | Médico · portal | Auditoria 29/10: header da aba repete o título da página logo abaixo | ✅ não reproduz mais (redesign anterior) — validado 390 + 1366 (evidencias/portal-*.png) |
| UX-008 | Empty-state de vacinas | Paciente · /vacinas | 29/10: headers de tabela colados + 3 CTAs iguais competindo | ✅ já resolvido por redesign anterior (CTA único "Registrar primeira vacina") |
| UX-009 | Avatar fallback sem 404 | Paciente · /medicos, /encontrar | 29/10: foto de médico sem photo gera request 404 (console sujo + flash) | ✅ src condicionado a `photoUrl` nos 4 pontos |
| UX-010 | Sanitizar título vindo do OCR | Paciente · lista/detalhe de exame | 29/10: títulos tipo "VOLPI ara Vol! Jnir…" direto do OCR na UI | ⛔ decisão: corrigir na EXTRAÇÃO (server), não maquiar no display — sanitização heurística arrisca estragar título legítimo |
| UX-011 | Cards clicáveis operáveis por teclado | Ambos | AUD-015: Medicos:342,438 · MinhasConsultas:208 · Timeline:107 + valor editável do ExamShow + banner Play do Auth | ✅ chipA11y() nos 4 cards + valor editável; banner virou `<button>` real |
| UX-012 | @media print no Cartão de Emergência | Paciente · /emergencia | AUD-060: imprimir sai a UI inteira; dark mode arrisca texto invisível | ✅ `@media print` global no index.html (esconde chrome, tinta escura em fundo branco) |

## Onda 3 — Refinamento visual / consistência (P3)

| ID | Tarefa | Área | Problema | Status |
|---|---|---|---|---|
| UX-013 | Varredura i18n (chaves vazando) | Ambos | Auditoria D: chaves de i18n aparecendo cruas em telas secundárias | ⬜ |
| UX-016 | Piso de fonte 12px (textos informativos) | Ambos | Audit D §3.8: chips/labels 10.5–11px | ✅ MinhasConsultas (4 chips) + DoctorPortal (2) — DashboardV2 fica pro v2 |
| UX-017 | PIX dentro da sala de teleconsulta | Paciente · sala | Audit D item 9 (Teleconsulta.tsx:3676): pagamento fora da sala gera fricção no momento pago | ⬜ (médio esforço, componente PixPaymentBlock existe) |
| UX-014 | Densidade da home (top 3-5 marcadores + "ver todos") | Paciente · home | 29/10: MARKER_CAP=30 na primeira dobra | ⛔ dashboard-v2 |
| UX-015 | Home desktop em 2 colunas | Paciente · home | 29/10: coluna única em 1366px | ⛔ dashboard-v2 |

## Resolvidos em rodadas anteriores (não retrabalhar)
- AUD-001/002/003/004/030/090/091 (P0 segurança) — PRs #1/#2, deployados 29/10.
- AUD-020 (expiração de share na UI) — §6 implementado (renovar limpa expiração, estado "expirou em").
- AUD-022 (órfãos /sinais, /saude-mental) — NavItems presentes (App.tsx:880-882).
- AUD-023 (/faq duplicada) — intencional: pública fora do shell + logada no layout (comentário em App.tsx:1495).
- Fila/teleconsulta (presença, chamado audível, Safari mic, STT alucinação) — commit 8b46b86c.
- React #310, contagens, nav 390, falsa urgência — commit d56fa613.

## Validação executada (30/10)
- `tsc --noEmit` web limpo (erros pré-existentes em `doctor-v2/` são WIP de outra sessão, fora do commit).
- Sweep Playwright no build de produção (preview 4180, API dev 4001): 10 telas × paciente/médico,
  390 e 1366, light+dark — **zero overflow horizontal, zero erro de console** (após `prisma generate`
  local que o merge do KYC pedia). Interações testadas: dialog "Nova pergunta" (abre, seleciona médico,
  habilita envio), pílulas de permissão no dark, portal pós-KYC (qa-medico aprovado no banco dev).
- Evidências: `evidencias/*.png`. ⚠️ Emulação ≠ APK: teclado virtual, botão voltar nativo e permissões
  de câmera/mic continuam pendentes de teste em aparelho.
- Observação nova (menor, registrada): aba Teleconsultas do portal mostra 2 CTAs "Agendar" na mesma
  dobra quando a lista está vazia (topo + empty state) — padrão aceitável, sem ação.

## Validação por tarefa
Critério de aceite padrão: tela renderiza nos 3 viewports móveis sem overflow; ação
principal alcançável; estado de erro/vazio/loading presente onde o dado é remoto;
`tsc` limpo; teste de fluxo quando houver suíte cobrindo.
