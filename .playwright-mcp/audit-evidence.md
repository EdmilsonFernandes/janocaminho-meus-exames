# Audit Evidence — Dr. Exame (dev localhost:5173)

Data: 2026-08-18. Playwright MCP, aba dedicada. Métricas DOM por rota/viewport.
Metodologia: navigate (hash) → wait 1.5s → browser_evaluate (função padrão). Viewport via setViewportSize. Screenshots viewport (scale css) no mesmo diretório.

Notas de coleta:
- `primeiraDobra` vazia em landing/login: conteúdo fora de `<main>` (páginas sem layout react-admin).
- Em 1280×800/768×1024 o `els.slice(0,1200)` captura primeiro a sidebar (Exames/Cuidados/Pessoas) — primeiraDobra reflete menu, não conteúdo.
- `/` anônimo: redirect para `#/login` (vitrine em `#/landing`; App.tsx usa `loginPage=LandingPage` só na raiz web, mas o guard redirecionou — landing capturada diretamente em `#/landing`).
- `overflowX=false` com `cortados` preenchido = elementos além da borda dentro de containers com scroll/overflow próprio (clip visual sem scroll horizontal do documento).
- Portal médico: não auditado ao vivo (exige login CRM).

## / — 390×844

```json
{
  "rota": "#/",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": [],
  "contadores": { "cards": 11, "cardsAninhados": 0, "papers": 13, "botoes": 34, "chips": 0, "inputs": 0, "iconesSvg": 51, "dividers": 1, "accordions": 0, "tabs": 0 },
  "fontSizes": ["29× 13px", "10× 11px", "6× 12px", "6× 10px", "5× 16px", "2× 20px"],
  "raios": ["308× 0px", "22× 10px", "17× 12px", "11× 16px", "5× 50%"],
  "coresBg": ["10× rgb(255, 255, 255)", "6× rgb(250, 251, 252)", "5× rgba(32, 178, 170, 0.14)", "4× rgba(32, 178, 170, 0.07)", "3× rgb(32, 178, 170)", "3× rgba(0, 0, 0, 0.04)"],
  "coresTexto": ["31× rgb(100, 116, 139)", "18× rgb(26, 32, 44)", "3× rgb(255, 255, 255)", "3× rgba(0, 0, 0, 0.38)", "2× rgb(23, 143, 137)"],
  "sombras": ["5× rgba(0,0,0,0.05) 0px 2px 6px, rgba(0,0,0,0.03) 0px 1px 2px", "4× rgba(0,0,0,0.06) 0px 4px 10px", "3× rgba(32,178,170,0.3) 0px 4px 12px", "1× rgba(15,95,90,0.45) 0px 3px 10px"],
  "labelsCaixaAlta": ["Sua saúde hoje [ls:0.88px]"],
  "primeiraDobra": ["P y81 fs24px w800: Boa noite, Edmilson 👋", "SPAN y115 fs12px: Seu painel de saúde — educativo, não", "P y188 fs26px w800: 45", "P y210 fs10px: de 100", "P y170 fs11px w700: Sua saúde hoje", "P y189 fs22px w800: Pede atenção", "SPAN y225 fs13.5px w700: ● 6 moderados", "P y466 fs11px: Cardiometabólico", "P y491 fs16px w800: Em dia", "P y511 fs11px: sem fatores", "DIV y475 fs20px: 🧬", "P y466 fs11px: Idade biológica", "P y479 fs16px w800: Em breve", "P y499 fs11px: estimativa c/ +exames"],
  "sticky": ["HEADER MuiPaper h=65 pos=sticky", "NAV MuiBox h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=796 pos=fixed", "DIV.MuiBackdrop h=844 pos=fixed", "DIV.MuiPaper h=844 pos=fixed"],
  "overflowX": false,
  "cortados": [],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38"]
}
```

Screenshot: `audit2-home-390.png`

## /exams — 390×844

```json
{
  "rota": "#/exams",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": ["H5 fs21.6px w800: Seus exames", "H3 fs16px w400: 📅 20265"],
  "contadores": { "cards": 7, "cardsAninhados": 1, "papers": 10, "botoes": 53, "chips": 12, "inputs": 2, "iconesSvg": 67, "dividers": 1, "accordions": 1, "tabs": 0 },
  "fontSizes": ["45× 13px", "15× 12px", "7× 16px", "5× 8.925px", "5× 10.5px", "5× 10px"],
  "raios": ["388× 0px", "26× 12px", "23× 50%", "22× 10px", "7× 16px"],
  "coresBg": ["9× rgb(255, 255, 255)", "5× rgb(250, 251, 252)", "5× rgba(5, 150, 105, 0.12)", "4× rgb(32, 178, 170)", "3× rgba(32, 178, 170, 0.12)", "3× rgba(32, 178, 170, 0.07)"],
  "coresTexto": ["37× rgb(100, 116, 139)", "26× rgb(26, 32, 44)", "7× rgb(255, 255, 255)", "5× rgb(5, 150, 105)", "3× rgba(0, 0, 0, 0.54)"],
  "sombras": ["5× rgba(0,0,0,0.06) 0px 4px 10px", "2× rgba(227,6,19,0.333) 0px 1px 3px", "2× rgba(99,102,241,0.333) 0px 1px 3px", "1× rgba(15,95,90,0.45) 0px 3px 10px"],
  "labelsCaixaAlta": ["Último exame [ls:0.88px]"],
  "primeiraDobra": ["H5 y98 fs21.6px w800: Seus exames", "P y126 fs14px: 5 no total • toque para ver detalhes", "BUTTON y223 fs13px w700: Todos", "BUTTON y223: Alterados", "BUTTON y223: Recentes", "BUTTON y265: 📅 Por data", "BUTTON y265: 🗂️ Por categoria", "SPAN y315 fs13px w700: Todos (5)", "SPAN y315: Hemograma (3)", "SPAN y315: Glicemia e Diabetes (1)", "SPAN y315: Lipídios e Colesterol (1)", "P y372 fs11px w700: Último exame", "P y391 fs19px w800: HEMOGRAMA", "SPAN y424 fs13.12px: Data não identificada"],
  "sticky": ["HEADER MuiPaper h=65 pos=sticky", "BUTTON.MuiFab h=56 pos=fixed", "NAV MuiBox h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=796 pos=fixed", "DIV.MuiBackdrop h=844 pos=fixed"],
  "overflowX": false,
  "cortados": ["DIV.MuiChip r=420", "SPAN.MuiChip-label r=420", "DIV.MuiChip r=609", "SPAN.MuiChip-label r=608", "DIV.MuiBox css-1nwjjb6 r=459"],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38", "Todos 66×34", "Alterados 91×34", "Recentes 87×34", "📅 Por data 103×34"]
}
```

Screenshot: `audit2-exams-390.png`

## /exams/<id>/show (exam detail) — 390×844

```json
{
  "rota": "#/exams/cmqpetsv90001nq20v84utyv9/show",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": ["H1 fs18.4px w700: HEMOGRAMA", "H3 fs16px: Leucograma 12 itens", "H3 fs16px: Plaquetas 1 alterado 1 item", "H3 fs16px: Série Vermelha 1 alterado 7 itens", "H6 fs17.6px w700: Análise de saúde", "H6 fs17.6px w700: 📋 Preparar visita ao médico"],
  "contadores": { "cards": 5, "cardsAninhados": 0, "papers": 11, "botoes": 80, "chips": 33, "inputs": 0, "iconesSvg": 65, "dividers": 18, "accordions": 3, "tabs": 0 },
  "fontSizes": ["64× 13px", "52× 12px", "36× 10px", "23× 13.6px", "20× 16.8px", "20× 12.8px"],
  "raios": ["646× 0px", "102× 12px", "56× 50%", "33× 999px", "25× 8px"],
  "coresBg": ["30× rgba(245, 158, 11, 0.15)", "28× rgb(239, 68, 68)", "18× rgb(5, 150, 105)", "15× rgb(234, 238, 245)", "15× rgba(46, 125, 50, 0.28)", "15× rgba(239, 68, 68, 0.12)"],
  "coresTexto": ["80× rgb(100, 116, 139)", "37× rgb(26, 32, 44)", "30× rgb(3, 105, 73)", "27× rgb(255, 255, 255)", "20× rgb(32, 178, 170)"],
  "sombras": ["15× rgba(0,0,0,0.25) 0px 1px 3px", "15× rgba(0,0,0,0.2) 0px 2px 6px", "5× rgba(0,0,0,0.05)+0.03 dupla", "2× rgba(32,178,170,0.3) 0px 4px 12px"],
  "labelsCaixaAlta": [],
  "primeiraDobra": ["H1 y93 fs18.4px w700: HEMOGRAMA", "SPAN y96 fs13px w600: Pronto", "SPAN y96: Hemograma", "SPAN y96: conferir dados", "SPAN y126 fs13.6px w700: Data não identificada", "DIV y196 fs10.625px w800: V", "SPAN y203 fs12.5px w800: VOLPI ara Vol! Jnir BIANCARDI LABORA", "SPAN y155 fs13.6px: 1 pág.", "P y324 fs13.6px: 👤 BIANCA) pr mpi", "DIV y364 fs13px: Alguns dados do cabeçalho vieram da ", "P y483 fs16px w800: ⚠️ Confirme o titular antes da análi", "STRONG y514 fs14px w700: BIANCA) pr mpi", "STRONG y535 fs14px w700: Edmilson Lopes Fernandes dos Santos", "SPAN y565 fs13px w800: Similaridade 0%"],
  "sticky": ["HEADER MuiPaper h=65 pos=sticky", "NAV MuiBox h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=796 pos=fixed", "DIV.MuiBackdrop h=844 pos=fixed", "DIV.MuiPaper h=844 pos=fixed"],
  "overflowX": false,
  "cortados": ["DIV.MuiBox css-mebgut r=521", "DIV.MuiPaper r=513", "DIV.MuiCardContent r=513", "DIV.MuiStack r=497", "DIV.MuiChip r=465"],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38", "↓ Plaquetas: 116.000/mm³ 191×32", "↓ VCM: 80,8 105×32", "O que é este exame? 28×28", "pág. 1 35×21"]
}
```

Screenshot: `audit2-exam-detail-390.png`

## /alterados — 390×844

```json
{
  "rota": "#/alterados",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": ["H5 fs21.6px w800: Valores fora da faixa", "H3 fs16px: 🟠PERFIL LIPÍDICO📅 09/07/2026", "H3 fs16px: 🟠GLICEMIA DE JEJUM📅 09/07/20", "H3 fs16px: 🟡HEMOGRAMA📅 s/d2 alterado(s)"],
  "contadores": { "cards": 1, "cardsAninhados": 0, "papers": 6, "botoes": 48, "chips": 11, "inputs": 0, "iconesSvg": 59, "dividers": 1, "accordions": 3, "tabs": 0 },
  "fontSizes": ["31× 13px", "26× 12px", "15× 16px", "9× 11px", "9× 21.6px", "6× 12.8px"],
  "raios": ["429× 0px", "28× 12px", "25× 50%", "22× 10px", "8× 99px"],
  "coresBg": ["6× rgba(234, 88, 12, 0.05)", "6× rgba(234, 88, 12, 0.15)", "5× rgb(250, 251, 252)", "3× rgb(32, 178, 170)", "3× rgb(255, 255, 255)", "3× rgba(32, 178, 170, 0.07)"],
  "coresTexto": ["41× rgb(100, 116, 139)", "25× rgb(234, 88, 12)", "20× rgb(26, 32, 44)", "10× rgb(202, 138, 4)", "4× rgb(3, 105, 73)"],
  "sombras": ["2× rgba(4,120,87,0.3) 0px 10px 22px + rgba(15,23,42,0.1)", "2× rgba(0,0,0,0.25) 0px 1px 3px", "1× rgba(15,95,90,0.45)", "1× rgba(255,255,255,0.95) ring + rgba(0,0,0,0.28)"],
  "labelsCaixaAlta": [],
  "primeiraDobra": ["H5 y81 fs21.6px w800: Valores fora da faixa", "STRONG y110 fs14px w700: prioridade de atenção", "SPAN y201 fs16px w800: 🔴 0 Importantes", "SPAN y201: 🟠 6 Moderadas", "SPAN y238: 🟡 2 Leves", "STRONG y274 fs12px: 🟠 moderados", "STRONG y274: 🟡 leves", "SPAN y360 fs18px: 🟠", "P y353 fs16px w800: PERFIL LIPÍDICO", "SPAN y373 fs12px: 📅 09/07/2026 · há 1 mês", "SPAN y362 fs13px w700: 4 alterado(s)", "P y432 fs16px w700: COLESTEROL TOTAL", "SPAN y458 fs11px w700: 🟠 Moderada", "SPAN y489 fs12px: Ref: 200 mg/dL"],
  "sticky": ["HEADER MuiPaper h=65 pos=sticky", "BUTTON.MuiBox h=46 pos=fixed", "NAV MuiBox h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=796 pos=fixed", "DIV.MuiBackdrop h=844 pos=fixed"],
  "overflowX": false,
  "cortados": ["DIV.MuiBox css-idz1d7 r=392"],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38", "O que é este exame? 28×28", "O que significa mg/dL? 18×18", "O que é este exame? 28×28", "O que significa mg/dL? 18×18"]
}
```

Screenshot: `audit2-alterados-390.png`

## /evolucao — 390×844

```json
{
  "rota": "#/evolucao",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": ["H5 fs21.6px w800: Evolução ao longo do tempo"],
  "contadores": { "cards": 6, "cardsAninhados": 0, "papers": 9, "botoes": 36, "chips": 7, "inputs": 1, "iconesSvg": 52, "dividers": 1, "accordions": 0, "tabs": 0 },
  "fontSizes": ["35× 13px", "6× 14px", "5× 15px", "5× 10px", "4× 16px", "2× 12px"],
  "raios": ["292× 0px", "24× 12px", "22× 10px", "9× 50%", "5× 8px"],
  "coresBg": ["6× rgb(255, 255, 255)", "5× rgb(250, 251, 252)", "3× rgb(32, 178, 170)", "3× rgba(32, 178, 170, 0.07)", "3× rgba(32, 178, 170, 0.14)", "2× rgba(32, 178, 170, 0.12)"],
  "coresTexto": ["26× rgb(100, 116, 139)", "20× rgb(26, 32, 44)", "3× rgb(239, 68, 68)", "2× rgb(255, 255, 255)", "1× rgb(15, 118, 110)"],
  "sombras": ["6× rgba(0,0,0,0.05) dupla", "1× rgba(15,95,90,0.45)", "1× ring branco + sombra", "1× rgba(0,0,0,0.04) 0px -2px 12px"],
  "labelsCaixaAlta": [],
  "primeiraDobra": ["H5 y81 fs21.6px w800: Evolução ao longo do tempo", "P y135 fs14px: Como cada exame evoluiu entre as col", "SPAN y205 fs16px w800: 🟢 1 Melhoraram", "SPAN y205: 🔴 0 Pioraram", "SPAN y245: ✅ 27 Estáveis", "STRONG y307 fs12px: ·", "SPAN y389 fs13px w700: 📋 Todos (28)", "SPAN y389: 🔴 Fora da faixa (7)", "SPAN y435: 🟠 Em mudança (3)", "SPAN y435: ✅ Estável (18)", "STRONG y469 fs12px w700: 🟠 Em mudança", "P y648 fs15px w800: Glicemia e Diabetes", "DIV y649 fs14px: 🔴", "SPAN y650 fs13px w700: 1 alterado"],
  "sticky": ["HEADER MuiPaper h=65 pos=sticky", "DIV.MuiPaper outlined h=35 pos=sticky", "BUTTON.MuiBox h=46 pos=fixed", "NAV MuiBox h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=796 pos=fixed"],
  "overflowX": false,
  "cortados": [],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38", "📋 Todos (28) 166×38", "🔴 Fora da faixa (7) 166×38", "🟠 Em mudança (3) 166×38", "✅ Estável (18) 166×38"]
}
```

Screenshot: `audit2-evolucao-390.png`

## /tendencias — 390×844

```json
{
  "rota": "#/tendencias",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": ["H5 fs21.6px w800: 📈 Tendências", "H6 fs16px w800: Plaquetas", "H6 fs14px w600: Histórico (do mais recente)"],
  "contadores": { "cards": 3, "cardsAninhados": 0, "papers": 5, "botoes": 41, "chips": 8, "inputs": 1, "iconesSvg": 46, "dividers": 1, "accordions": 0, "tabs": 0 },
  "fontSizes": ["36× 13px", "14× 10px", "7× 14px", "5× 16px", "3× 12px", "3× 13.6px"],
  "raios": ["335× 0px", "22× 10px", "19× 12px", "13× 50%", "8× 999px"],
  "coresBg": ["5× rgb(250, 251, 252)", "4× rgb(32, 178, 170)", "4× rgba(0, 0, 0, 0.08)", "3× rgb(255, 255, 255)", "3× rgba(0, 0, 0, 0.04)", "3× rgba(32, 178, 170, 0.07)"],
  "coresTexto": ["31× rgb(100, 116, 139)", "28× rgb(26, 32, 44)", "5× rgb(255, 255, 255)", "2× rgb(23, 143, 137)", "2× rgb(9, 115, 163)"],
  "sombras": ["3× rgba(0,0,0,0.05) dupla", "1× rgba(15,95,90,0.45)", "1× ring branco + sombra", "1× rgba(0,0,0,0.04) -2px"],
  "labelsCaixaAlta": [],
  "primeiraDobra": ["H5 y102 fs21.6px w800: 📈 Tendências", "P y134 fs14px: Veja como seus resultados evoluíram ", "SPAN y241 fs13px w700: Hemácias", "SPAN y241: Hematócrito", "SPAN y241: Hemoglobina", "SPAN y283: Leucócitos", "SPAN y283: Plaquetas", "DIV y323 fs15px: Plaquetas (3 exames)", "H6 y415 fs16px w800: Plaquetas", "SPAN y451 fs30px: /mm3", "P y467 fs16px w700: ↑ 105%", "P y501 fs16px w700: ↓ Tendência de queda · 3 medições", "STRONG y530 fs14px w700: 09/07/26", "SPAN y556 fs12.5px w700: 150.000 – 450.000 /mm3"],
  "sticky": ["HEADER MuiPaper h=65 pos=sticky", "BUTTON.MuiBox h=46 pos=fixed", "NAV MuiBox h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=796 pos=fixed", "DIV.MuiBackdrop h=844 pos=fixed"],
  "overflowX": false,
  "cortados": [],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38", "Hemácias 79×36", "Hematócrito 95×36", "Hemoglobina 100×36", "Leucócitos 86×36"]
}
```

## /linha-do-tempo — 390×844

```json
{
  "rota": "#/linha-do-tempo",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": ["H5 fs21.6px w800: Sua jornada de saúde"],
  "contadores": { "cards": 5, "cardsAninhados": 0, "papers": 7, "botoes": 35, "chips": 16, "inputs": 0, "iconesSvg": 47, "dividers": 1, "accordions": 0, "tabs": 0 },
  "fontSizes": ["44× 13px", "7× 12px", "6× 10px", "5× 16.32px", "1× 16px", "1× 11px"],
  "raios": ["305× 0px", "30× 12px", "22× 10px", "14× 50%", "6× 999px"],
  "coresBg": ["5× rgb(250, 251, 252)", "5× rgb(255, 255, 255)", "5× rgba(42, 147, 184, 0.082)", "4× rgb(32, 178, 170)", "3× rgb(239, 68, 68)", "3× rgba(32, 178, 170, 0.07)"],
  "coresTexto": ["30× rgb(100, 116, 139)", "19× rgb(26, 32, 44)", "5× rgb(42, 147, 184)", "4× rgb(255, 255, 255)", "4× rgb(239, 68, 68)"],
  "sombras": ["5× rgba(0,0,0,0.2) 0px 2px 6px", "5× rgba(0,0,0,0.05) dupla", "1× rgba(15,95,90,0.45)", "1× ring branco + sombra"],
  "labelsCaixaAlta": [],
  "primeiraDobra": ["H5 y81 fs21.6px w800: Sua jornada de saúde", "P y109 fs14px: 5 exames • 0 medições • 0 vacinas • ", "SPAN y190 fs13px w700: Tudo", "SPAN y190: 🧪 Exames", "SPAN y190: 💓 Medições", "SPAN y190: 💉 Vacinas", "SPAN y234 fs13px w800: 📅 2026", "SPAN y234 fs12px: 4 exames", "P y289 fs16.32px w800: GLICEMIA DE JEJUM", "SPAN y321 fs12px: 09 de julho de 2026", "SPAN y350 fs13px w600: Laboratorial", "SPAN y385 fs13px w600: ⚠️ 2 valor(es) fora da faixa", "P y452 fs16.32px w800: PERFIL LIPÍDICO", "SPAN y484 fs12px: 09 de julho de 2026"],
  "sticky": ["HEADER MuiPaper h=65 pos=sticky", "BUTTON.MuiBox h=46 pos=fixed", "NAV MuiBox h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=796 pos=fixed", "DIV.MuiBackdrop h=844 pos=fixed"],
  "overflowX": false,
  "cortados": [],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38", "Tudo 48×24", "🧪 Exames 86×24", "💓 Medições 99×24", "💉 Vacinas 87×24"]
}
```

## /medicoes — 390×844

```json
{
  "rota": "#/medicoes",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": ["H5 fs21.6px w800: Medições", "H6 fs17.6px w700: Nova medição", "H6 fs17.6px w700: ⚖️ Peso", "H6 fs17.6px w700: Medições vitais"],
  "contadores": { "cards": 3, "cardsAninhados": 0, "papers": 5, "botoes": 33, "chips": 0, "inputs": 5, "iconesSvg": 42, "dividers": 1, "accordions": 0, "tabs": 0 },
  "fontSizes": ["28× 13px", "6× 10px", "4× 14px", "3× 16px", "3× 17.6px", "3× 11.25px"],
  "raios": ["254× 0px", "22× 10px", "19× 12px", "9× 50%", "5× 8px"],
  "coresBg": ["5× rgb(250, 251, 252)", "3× rgb(32, 178, 170)", "3× rgb(255, 255, 255)", "2× rgba(32, 178, 170, 0.12)", "2× rgba(32, 178, 170, 0.1)", "2× rgba(32, 178, 170, 0.16)"],
  "coresTexto": ["27× rgb(100, 116, 139)", "18× rgb(26, 32, 44)", "1× rgb(15, 118, 110)", "1× rgb(255, 255, 255)", "1× rgb(250, 251, 252)"],
  "sombras": ["3× rgba(0,0,0,0.05) dupla", "1× rgba(15,95,90,0.45)", "1× ring branco + sombra", "1× rgba(0,0,0,0.04) -2px"],
  "labelsCaixaAlta": [],
  "primeiraDobra": ["H5 y90 fs21.6px w800: Medições", "H6 y165 fs17.6px w700: Nova medição", "LABEL y207 fs14px: Tipo", "DIV y216 fs15px: Peso", "SPAN y211 fs11.25px: Tipo", "LABEL y272 fs14px: Valor", "SPAN y258: Valor", "LABEL y300 fs14px: Data", "SPAN y304: Data", "BUTTON y356 fs14px w700: Adicionar", "H6 y258 fs17.6px w700: ⚖️ Peso", "P y294 fs16px: Nenhum peso registrado ainda.", "H6 y393 fs17.6px w700: Medições vitais", "P y428 fs16px: Nenhuma medição vital ainda. Registr"],
  "sticky": ["HEADER MuiPaper h=65 pos=sticky", "BUTTON.MuiBox h=46 pos=fixed", "NAV MuiBox h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=796 pos=fixed", "DIV.MuiBackdrop h=844 pos=fixed"],
  "overflowX": false,
  "cortados": ["DIV.MuiBox css-idz1d7 r=393"],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38"]
}
```

## /vacinas — 390×844

```json
{
  "rota": "#/vacinas",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": ["H5 fs21.6px w800: Carteira de Vacinação", "H6 fs17.6px w700: Registrar vacina", "H6 fs17.6px w700: Histórico de vacinas"],
  "contadores": { "cards": 2, "cardsAninhados": 0, "papers": 4, "botoes": 32, "chips": 0, "inputs": 8, "iconesSvg": 40, "dividers": 1, "accordions": 0, "tabs": 0 },
  "fontSizes": ["28× 13px", "6× 10px", "5× 14px", "4× 11.25px", "2× 16px", "2× 17.6px"],
  "raios": ["246× 0px", "22× 10px", "20× 12px", "9× 50%", "5× 8px"],
  "coresBg": ["5× rgb(250, 251, 252)", "3× rgb(32, 178, 170)", "2× rgba(32, 178, 170, 0.12)", "2× rgba(32, 178, 170, 0.1)", "2× rgb(255, 255, 255)", "2× rgba(32, 178, 170, 0.16)"],
  "coresTexto": ["27× rgb(100, 116, 139)", "17× rgb(26, 32, 44)", "1× rgb(15, 118, 110)", "1× rgb(255, 255, 255)", "1× rgb(250, 251, 252)"],
  "sombras": ["2× rgba(0,0,0,0.05) dupla", "1× rgba(15,95,90,0.45)", "1× ring branco + sombra", "1× rgba(0,0,0,0.04) -2px"],
  "labelsCaixaAlta": [],
  "primeiraDobra": ["H5 y90 fs21.6px w800: Carteira de Vacinação", "H6 y158 fs17.6px w700: Registrar vacina", "LABEL y201 fs14px: Vacina", "SPAN y187 fs11.25px: Vacina", "LABEL y229 fs14px: Aplicada em", "SPAN y233: Aplicada em", "LABEL y276 fs14px: Próxima dose", "SPAN y280: Próxima dose", "LABEL y341 fs14px: Lote", "SPAN y327: Lote", "BUTTON y378 fs14px w700: Adicionar", "H6 y480 fs17.6px w700: Histórico de vacinas", "P y515 fs16px: Nenhuma vacina registrada. Cadastre "],
  "sticky": ["HEADER MuiPaper h=65 pos=sticky", "BUTTON.MuiBox h=46 pos=fixed", "NAV MuiBox h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=796 pos=fixed", "DIV.MuiBackdrop h=844 pos=fixed"],
  "overflowX": false,
  "cortados": [],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38"]
}
```

## /relatorio — 390×844

```json
{
  "rota": "#/relatorio",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": ["H5 fs21.6px w800: 🧾 Relatório completo de saúde", "H6 fs17.6px w800: Relatório consolidado 🩺", "H3 fs16px: Pontos positivos 2", "H3 fs16px: Sugestões de nutrição 1", "H3 fs16px: Metas de saúde 2"],
  "contadores": { "cards": 5, "cardsAninhados": 0, "papers": 10, "botoes": 43, "chips": 15, "inputs": 3, "iconesSvg": 61, "dividers": 1, "accordions": 3, "tabs": 0 },
  "fontSizes": ["40× 13px", "20× 14px", "18× 16px", "11× 12px", "7× 16.32px", "6× 10px"],
  "raios": ["432× 0px", "39× 12px", "24× 50%", "22× 10px", "9× 16px"],
  "coresBg": ["5× rgb(250, 251, 252)", "5× rgb(255, 255, 255)", "3× rgba(32, 178, 170, 0.12)", "3× rgb(32, 178, 170)", "2× rgba(5, 150, 105, 0.094)", "2× rgba(2, 136, 209, 0.05)"],
  "coresTexto": ["38× rgb(100, 116, 139)", "34× rgb(26, 32, 44)", "12× rgb(32, 178, 170)", "7× rgb(11, 92, 171)", "4× rgb(5, 150, 105)"],
  "sombras": ["5× rgba(0,0,0,0.05) dupla", "1× rgba(15,95,90,0.45)", "1× ring branco + sombra", "1× rgba(32,178,170,0.3)"],
  "labelsCaixaAlta": [],
  "primeiraDobra": ["H5 y81 fs21.6px w800: 🧾 Relatório completo de saúde", "P y146 fs14px: A IA junta seus últimos exames (sang", "H6 y242 fs17.6px w800: Relatório consolidado 🩺", "P y270 fs13px: Análise educativa — não substitui co", "P y332 fs22px w800: 4", "SPAN y361 fs12px: Itens", "P y332 fs22px w800: 3", "SPAN y361: Atenção", "P y332 fs22px w800: 2", "SPAN y361: Positivos", "P y515 fs16.8px: Edmilson, seu exame mais recente mos"],
  "sticky": ["HEADER MuiPaper h=65 pos=sticky", "BUTTON.MuiBox h=46 pos=fixed", "NAV MuiBox h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=796 pos=fixed", "DIV.MuiBackdrop h=844 pos=fixed"],
  "overflowX": false,
  "cortados": [],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38", "O que é este exame? 28×28 ×4"]
}
```

Screenshot: `audit2-relatorio-390.png`

## /familia — 390×844

```json
{
  "rota": "#/familia",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": ["H5 fs21.6px w800: Saúde da Família", "H6 fs17.6px w700: Edmilson Lopes Fernandes dos S", "H4 fs28px w800: 45", "H6 fs17.6px w800: 🧬 Comparativo por analito"],
  "contadores": { "cards": 2, "cardsAninhados": 0, "papers": 4, "botoes": 34, "chips": 9, "inputs": 0, "iconesSvg": 43, "dividers": 1, "accordions": 0, "tabs": 0 },
  "fontSizes": ["39× 13px", "6× 10px", "3× 14px", "3× 12px", "2× 16px", "2× 20px"],
  "raios": ["264× 0px", "24× 12px", "22× 10px", "11× 50%", "5× 8px"],
  "coresBg": ["5× rgb(250, 251, 252)", "4× rgb(32, 178, 170)", "3× rgba(32, 178, 170, 0.16)", "2× rgba(32, 178, 170, 0.12)", "2× rgba(32, 178, 170, 0.1)", "2× rgb(255, 255, 255)"],
  "coresTexto": ["27× rgb(100, 116, 139)", "16× rgb(26, 32, 44)", "8× rgb(239, 68, 68)", "2× rgb(250, 251, 252)", "2× rgb(23, 143, 137)"],
  "sombras": ["2× rgba(0,0,0,0.05) dupla", "1× rgba(15,95,90,0.45)", "1× ring branco + sombra", "1× rgba(0,0,0,0.04) -2px"],
  "labelsCaixaAlta": [],
  "primeiraDobra": ["H5 y81 fs21.6px w800: Saúde da Família", "P y109 fs14px: Score de cada um e padrões que apare", "BUTTON y159 fs13px w700: Gerenciar dependentes →", "SPAN y221 fs13px w700: 🥇 Melhor score da família", "DIV y254 fs20px w700: E", "H6 y264 fs17.6px w700: Edmilson Lopes Fernandes dos Santos", "H4 y251 fs28px w800: 45", "SPAN y285 fs12px: /100", "P y333 fs14px: ⚠️ 6 relevante(s) agora", "SPAN y364 fs13px w600: COLESTEROL TOTAL", "SPAN y364: LDL COLESTEROL", "SPAN y392: HDL COLESTEROL", "SPAN y392: TRIGLICERÍDEOS", "SPAN y420: GLICEMIA"],
  "sticky": ["HEADER MuiPaper h=65 pos=sticky", "BUTTON.MuiBox h=46 pos=fixed", "NAV MuiBox h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=796 pos=fixed", "DIV.MuiBackdrop h=844 pos=fixed"],
  "overflowX": false,
  "cortados": [],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38", "O que é este exame? 28×28"]
}
```

## /medicos — 390×844

```json
{
  "rota": "#/medicos",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": ["H5 fs21.6px w800: Meus Médicos"],
  "contadores": { "cards": 1, "cardsAninhados": 0, "papers": 3, "botoes": 33, "chips": 2, "inputs": 3, "iconesSvg": 43, "dividers": 1, "accordions": 0, "tabs": 0 },
  "fontSizes": ["30× 13px", "7× 10px", "5× 15px", "4× 8px", "2× 20px", "1× 16px"],
  "raios": ["262× 0px", "22× 10px", "20× 12px", "18× 50%", "5× 8px"],
  "coresBg": ["6× rgba(32, 178, 170, 0.1)", "5× rgb(250, 251, 252)", "5× rgb(32, 178, 170)", "5× rgb(5, 150, 105)", "3× rgba(32, 178, 170, 0.16)", "2× rgba(32, 178, 170, 0.12)"],
  "coresTexto": ["24× rgb(100, 116, 139)", "17× rgb(26, 32, 44)", "7× rgb(23, 143, 137)", "2× rgb(250, 251, 252)", "1× rgb(15, 118, 110)"],
  "sombras": ["1× rgba(15,95,90,0.45)", "1× ring branco + sombra", "1× rgba(32,178,170,0.3)", "1× rgba(32,178,170,0.05) 0px 1px 2px"],
  "labelsCaixaAlta": [],
  "primeiraDobra": ["H5 y81 fs21.6px w800: Meus Médicos", "P y135 fs14px: Controle quem vê seus dados. Escolha", "P y346 fs13px: Só ativos", "SPAN y346 fs13px w700: 1 médicos • 1 ativos", "SPAN y387 fs10px w700: 1", "DIV y426 fs20px w800: D", "P y426 fs15px w800: Dr Teste QA", "SPAN y450 fs12px: CRM 99999-SP", "DIV y483 fs15px: 📋", "P y506 fs8px w700: Exames", "DIV y483 fs15px: 📈", "P y506 fs8px w700: Evol.", "DIV y483 fs15px: 🚨", "P y506 fs8px w700: Alertas"],
  "sticky": ["HEADER MuiPaper h=65 pos=sticky", "BUTTON.MuiBox h=46 pos=fixed", "NAV MuiBox h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=796 pos=fixed", "DIV.MuiBackdrop h=844 pos=fixed"],
  "overflowX": false,
  "cortados": ["DIV.MuiBox css-idz1d7 r=393"],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38", "BUTTON 30×30"]
}
```

## /perguntas — 390×844

```json
{
  "rota": "#/perguntas",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": ["H5 fs21.6px w800: Minhas perguntas"],
  "contadores": { "cards": 1, "cardsAninhados": 0, "papers": 3, "botoes": 31, "chips": 0, "inputs": 0, "iconesSvg": 40, "dividers": 1, "accordions": 0, "tabs": 0 },
  "fontSizes": ["28× 13px", "6× 10px", "2× 16px", "2× 14px", "1× 11px", "1× 20px"],
  "raios": ["226× 0px", "22× 10px", "12× 12px", "9× 50%", "5× 8px"],
  "coresBg": ["5× rgb(250, 251, 252)", "3× rgb(32, 178, 170)", "3× rgba(32, 178, 170, 0.16)", "2× rgba(32, 178, 170, 0.12)", "2× rgba(32, 178, 170, 0.1)", "1× rgba(255, 255, 255, 0.72)"],
  "coresTexto": ["24× rgb(100, 116, 139)", "13× rgb(26, 32, 44)", "1× rgb(15, 118, 110)", "1× rgb(255, 255, 255)", "1× rgb(250, 251, 252)"],
  "sombras": ["1× rgba(15,95,90,0.45)", "1× ring branco + sombra", "1× rgba(0,0,0,0.05) dupla", "1× rgba(0,0,0,0.04) -2px"],
  "labelsCaixaAlta": [],
  "primeiraDobra": ["H5 y90 fs21.6px w800: Minhas perguntas", "P y141 fs14px: Suas perguntas enviadas aos médicos ", "DIV y248 fs48px: 💬", "P y332 fs16px w800: Nenhuma pergunta ainda", "P y362 fs14px: Gere seu relatório consolidado e env"],
  "sticky": ["HEADER MuiPaper h=65 pos=sticky", "BUTTON.MuiBox h=46 pos=fixed", "NAV MuiBox h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=796 pos=fixed", "DIV.MuiBackdrop h=844 pos=fixed"],
  "overflowX": false,
  "cortados": [],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38"]
}
```

## /conquistas — 390×844

```json
{
  "rota": "#/conquistas",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": ["H6 fs17.6px w800: Minhas conquistas", "H6 fs14px w800: ♻️ Desafios do mês", "H6 fs14px w800: 🏆 Conquistas permanentes"],
  "contadores": { "cards": 13, "cardsAninhados": 0, "papers": 15, "botoes": 36, "chips": 6, "inputs": 0, "iconesSvg": 41, "dividers": 1, "accordions": 0, "tabs": 0 },
  "fontSizes": ["44× 13px", "26× 11px", "15× 10px", "12× 34px", "5× 12px", "4× 9px"],
  "raios": ["310× 0px", "30× 12px", "22× 10px", "15× 999px", "9× 50%"],
  "coresBg": ["15× rgb(32, 178, 170)", "10× rgb(255, 255, 255)", "9× rgba(0, 0, 0, 0.04)", "6× rgba(32, 178, 170, 0.12)", "5× rgb(250, 251, 252)", "3× rgba(32, 178, 170, 0.05)"],
  "coresTexto": ["54× rgb(100, 116, 139)", "29× rgb(26, 32, 44)", "12× rgb(184, 138, 84)", "7× rgb(255, 255, 255)", "6× rgb(23, 143, 137)"],
  "sombras": ["12× rgba(0,0,0,0.05) dupla", "1× rgba(15,95,90,0.45)", "1× ring branco + sombra", "1× rgba(15,61,58,0.18) 0px 12px 30px"],
  "labelsCaixaAlta": [],
  "primeiraDobra": ["H6 y83 fs17.6px w800: Minhas conquistas", "SPAN y162 fs13px w800: de 12 créditos resgatados", "P y185 fs13px: 3 conquistas desbloqueadas · saldo a", "SPAN y220 fs13px w800: 🔥", "SPAN y220: 1 dia", "BUTTON y262 fs14px w800: 🎁 Resgatar tudo (3 créditos)", "H6 y347 fs14px w800: ♻️ Desafios do mês", "SPAN y350 fs11px w700: agosto de 2026", "SPAN y377 fs12px: Recomeçam todo mês — mantê-los em di", "SPAN y436 fs9px w800: ♻️ mensal", "DIV y442 fs34px: 📤", "P y500 fs13px w800: Mês atualizado", "P y518 fs11px: Envie 1 exame neste mês", "P y548 fs11px w700: 🎁 2 créditos"],
  "sticky": ["HEADER MuiPaper h=65 pos=sticky", "BUTTON.MuiBox h=46 pos=fixed", "NAV MuiBox h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=796 pos=fixed", "DIV.MuiBackdrop h=844 pos=fixed"],
  "overflowX": false,
  "cortados": [],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38"]
}
```

## /despesas — 390×844

```json
{
  "rota": "#/despesas",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": ["H5 fs21.6px w800: Despesas Médicas", "H4 fs28px w800: R$ 0,00", "H6 fs17.6px w700: Registrar despesa", "H6 fs17.6px w700: Histórico de despesas"],
  "contadores": { "cards": 3, "cardsAninhados": 0, "papers": 5, "botoes": 32, "chips": 0, "inputs": 8, "iconesSvg": 41, "dividers": 1, "accordions": 0, "tabs": 0 },
  "fontSizes": ["28× 13px", "6× 10px", "5× 14px", "3× 16px", "3× 11.25px", "2× 17.6px"],
  "raios": ["249× 0px", "22× 10px", "20× 12px", "9× 50%", "5× 8px"],
  "coresBg": ["5× rgb(250, 251, 252)", "4× rgba(32, 178, 170, 0.16)", "3× rgb(32, 178, 170)", "3× rgb(255, 255, 255)", "2× rgba(32, 178, 170, 0.12)", "2× rgba(32, 178, 170, 0.1)"],
  "coresTexto": ["28× rgb(100, 116, 139)", "17× rgb(26, 32, 44)", "1× rgb(15, 118, 110)", "1× rgb(255, 255, 255)", "1× rgb(250, 251, 252)"],
  "sombras": ["3× rgba(0,0,0,0.05) dupla", "1× rgba(15,95,90,0.45)", "1× ring branco + sombra", "1× rgba(0,0,0,0.04) -2px"],
  "labelsCaixaAlta": [],
  "primeiraDobra": ["H5 y81 fs21.6px w800: Despesas Médicas", "P y109 fs14px: Consultas, exames, farmácia: registr", "H4 y226 fs28px w800: R$ 0,00", "P y260 fs16px: Total gasto em saúde", "H6 y351 fs17.6px w700: Registrar despesa", "LABEL y395 fs14px: Descrição", "SPAN y381 fs11.25px: Descrição", "LABEL y423 fs14px: Categoria", "DIV y432 fs15px: Exame", "SPAN y427: Categoria", "LABEL y488 fs14px: Valor (R$)", "SPAN y474: Valor (R$)", "BUTTON y572 fs14px w700: Adicionar", "H6 y674 fs17.6px w700: Histórico de despesas"],
  "sticky": ["HEADER MuiPaper h=65 pos=sticky", "BUTTON.MuiBox h=46 pos=fixed", "NAV MuiBox h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=796 pos=fixed", "DIV.MuiBackdrop h=844 pos=fixed"],
  "overflowX": false,
  "cortados": [],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38"]
}
```

## /lembretes — 390×844

```json
{
  "rota": "#/lembretes",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": ["H5 fs21.6px w800: Lembretes", "H6 fs17.6px w700: Novo lembrete"],
  "contadores": { "cards": 2, "cardsAninhados": 0, "papers": 4, "botoes": 39, "chips": 10, "inputs": 7, "iconesSvg": 44, "dividers": 2, "accordions": 0, "tabs": 0 },
  "fontSizes": ["35× 13px", "6× 10px", "5× 14px", "4× 11px", "3× 11.25px", "3× 12px"],
  "raios": ["277× 0px", "28× 12px", "22× 10px", "11× 50%", "5× 8px"],
  "coresBg": ["6× rgb(32, 178, 170)", "5× rgb(250, 251, 252)", "4× rgba(32, 178, 170, 0.16)", "2× rgba(32, 178, 170, 0.12)", "2× rgba(32, 178, 170, 0.1)", "2× rgb(255, 255, 255)"],
  "coresTexto": ["29× rgb(100, 116, 139)", "22× rgb(26, 32, 44)", "4× rgb(255, 255, 255)", "2× rgb(23, 143, 137)", "1× rgb(15, 118, 110)"],
  "sombras": ["2× rgba(0,0,0,0.05) dupla", "1× rgba(15,95,90,0.45)", "1× ring branco + sombra", "1× rgba(0,0,0,0.04) -2px"],
  "labelsCaixaAlta": [],
  "primeiraDobra": ["H5 y90 fs21.6px w800: Lembretes", "H6 y158 fs17.6px w700: Novo lembrete", "LABEL y208 fs14px: O que (ex.: Refazer hemograma)", "SPAN y187 fs11.25px: O que (ex.: Refazer hemograma)", "LABEL y245 fs14px: Data", "SPAN y249: Data", "LABEL y308 fs14px: Hora", "SPAN y312: Hora", "P y384 fs14px w600: Quando avisar?", "SPAN y411 fs13px w700: 1 semana antes", "SPAN y411: 1 dia antes", "SPAN y411: 12 h antes", "SPAN y439: 5 h antes", "SPAN y439: 1 hora antes"],
  "sticky": ["HEADER MuiPaper h=65 pos=sticky", "BUTTON.MuiBox h=46 pos=fixed", "NAV MuiBox h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=796 pos=fixed", "DIV.MuiBackdrop h=844 pos=fixed"],
  "overflowX": false,
  "cortados": [],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38", "1 semana antes 113×24", "1 dia antes 82×24", "12 h antes 79×24", "5 h antes 74×24"]
}
```

## /emergencia — 390×844

```json
{
  "rota": "#/emergencia",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": ["H5 fs21.6px w800: CARTÃO DE EMERGÊNCIA", "H6 fs17.6px w700: Edmilson Lopes Fernandes dos S"],
  "contadores": { "cards": 1, "cardsAninhados": 0, "papers": 3, "botoes": 32, "chips": 0, "inputs": 0, "iconesSvg": 40, "dividers": 2, "accordions": 0, "tabs": 0 },
  "fontSizes": ["28× 13px", "6× 10px", "5× 16px", "4× 14px", "1× 11px", "1× 20px"],
  "raios": ["238× 0px", "22× 10px", "14× 12px", "8× 50%", "5× 8px"],
  "coresBg": ["5× rgb(250, 251, 252)", "4× rgba(32, 178, 170, 0.16)", "3× rgb(32, 178, 170)", "2× rgba(32, 178, 170, 0.12)", "2× rgb(255, 255, 255)", "1× rgba(255, 255, 255, 0.72)"],
  "coresTexto": ["27× rgb(100, 116, 139)", "11× rgb(26, 32, 44)", "4× rgb(255, 255, 255)", "4× rgb(239, 68, 68)", "1× rgb(15, 118, 110)"],
  "sombras": ["1× rgba(15,95,90,0.45)", "1× ring branco + sombra", "1× rgba(211,47,47,0.15) 0px 4px 20px", "1× rgba(0,0,0,0.05)"],
  "labelsCaixaAlta": [],
  "primeiraDobra": ["H5 y169 fs21.6px w800: CARTÃO DE EMERGÊNCIA", "P y198 fs16px: Meus Exames", "H6 y271 fs17.6px w700: Edmilson Lopes Fernandes dos Santos", "P y360 fs16px w700: 🩸 Tipo Sanguíneo", "P y390 fs14px: Não informado — preencha no perfil", "P y427 fs16px w700: 💊 Medicações", "P y457 fs14px: Não informado", "P y494 fs16px w700: 📞 Contato de emergência", "P y523 fs14px: Não informado", "P y586 fs48px w900: E", "SPAN y640 fs12px: ID emergencial", "BUTTON y701 fs14px w700: 🖨️ Imprimir carteirinha"],
  "sticky": ["HEADER MuiPaper h=65 pos=sticky", "BUTTON.MuiBox h=46 pos=fixed", "NAV MuiBox h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=796 pos=fixed", "DIV.MuiBackdrop h=844 pos=fixed"],
  "overflowX": false,
  "cortados": [],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38"]
}
```

## /perfil — 390×844

```json
{
  "rota": "#/perfil",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": ["H5 fs21.6px w800: Meu perfil", "H5 fs21.6px w800: Edmilson Lopes Fernandes dos S", "H6 fs17.6px w700: Dados e perfil clínico", "H6 fs17.6px w700: ⚖️ Peso atual", "H6 fs17.6px w700: 🔔 Notificações", "H6 fs17.6px w700: Trocar senha", "H6 fs17.6px w800: Indique e ganhe créditos", "H6 fs17.6px w700: Meus dados"],
  "contadores": { "cards": 7, "cardsAninhados": 0, "papers": 9, "botoes": 41, "chips": 1, "inputs": 25, "iconesSvg": 52, "dividers": 1, "accordions": 0, "tabs": 0 },
  "fontSizes": ["29× 13px", "17× 14px", "12× 12px", "12× 11.25px", "6× 10px", "5× 17.6px"],
  "raios": ["364× 0px", "52× 12px", "22× 10px", "14× 50%", "5× 8px"],
  "coresBg": ["9× rgb(255, 255, 255)", "6× rgb(32, 178, 170)", "5× rgb(250, 251, 252)", "4× rgba(32, 178, 170, 0.16)", "2× rgba(32, 178, 170, 0.12)", "2× rgba(32, 178, 170, 0.1)"],
  "coresTexto": ["48× rgb(100, 116, 139)", "31× rgb(26, 32, 44)", "5× rgb(255, 255, 255)", "4× rgb(23, 143, 137)", "2× rgb(250, 251, 252)"],
  "sombras": ["7× rgba(0,0,0,0.05) dupla", "2× rgba(32,178,170,0.3)", "1× rgba(15,95,90,0.45)", "1× ring branco + sombra"],
  "labelsCaixaAlta": [],
  "primeiraDobra": ["H5 y81 fs21.6px w800: Meu perfil", "P y109 fs14px: Sua conta, dados e preferências", "DIV y239 fs26.6px w800: E", "H5 y171 fs21.6px w800: Edmilson Lopes Fernandes dos Santos", "P y257 fs16px: ✉️ edmilson@exemplo.com", "SPAN y318 fs13px w600: Plano grátis", "SPAN y344 fs12px: Toque na câmera da foto para trocar ", "H6 y442 fs17.6px w700: Dados e perfil clínico", "LABEL y467 fs14px: Nome completo", "SPAN y471 fs11.25px: Nome completo", "LABEL y539 fs14px: CPF", "SPAN y525: CPF", "P y573 fs12px: Usado para confirmar que os exames p", "LABEL y638 fs14px: Telefone / WhatsApp"],
  "sticky": ["HEADER MuiPaper h=65 pos=sticky", "BUTTON.MuiBox h=46 pos=fixed", "NAV MuiBox h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=796 pos=fixed", "DIV.MuiBackdrop h=844 pos=fixed"],
  "overflowX": false,
  "cortados": [],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38", "BUTTON 28×28", "Abrir calendário 30×30"]
}
```

Screenshot: `audit2-perfil-390.png`

## /seguranca — 390×844

```json
{
  "rota": "#/seguranca",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": ["H5 fs21.6px w800: 🔐 Segurança", "H6 fs17.6px w800: 🔐 Segurança (2FA)"],
  "contadores": { "cards": 3, "cardsAninhados": 0, "papers": 5, "botoes": 32, "chips": 0, "inputs": 0, "iconesSvg": 39, "dividers": 1, "accordions": 0, "tabs": 0 },
  "fontSizes": ["28× 13px", "6× 10px", "5× 14px", "1× 16px", "1× 11px", "1× 20px"],
  "raios": ["230× 0px", "22× 10px", "15× 12px", "8× 50%", "5× 8px"],
  "coresBg": ["5× rgb(250, 251, 252)", "4× rgba(32, 178, 170, 0.16)", "3× rgb(32, 178, 170)", "3× rgb(255, 255, 255)", "2× rgba(32, 178, 170, 0.12)", "1× rgba(255, 255, 255, 0.72)"],
  "coresTexto": ["26× rgb(100, 116, 139)", "13× rgb(26, 32, 44)", "2× rgb(255, 255, 255)", "1× rgb(15, 118, 110)", "1× rgb(250, 251, 252)"],
  "sombras": ["3× rgba(0,0,0,0.05) dupla", "1× rgba(15,95,90,0.45)", "1× ring branco + sombra", "1× rgba(32,178,170,0.3)"],
  "labelsCaixaAlta": [],
  "primeiraDobra": ["H5 y81 fs21.6px w800: 🔐 Segurança", "P y114 fs14px: Proteja sua conta com autenticação e", "H6 y196 fs17.6px w800: 🔐 Segurança (2FA)", "P y233 fs14px: Autenticação em 2 fatores (TOTP). De", "BUTTON y333 fs14px w700: Ativar 2FA", "P y439 fs17px w800: 🔐 Biometria (face/digital)", "STRONG y471 fs14px w700: app Android", "STRONG y593 fs14px w700: Dica:"],
  "sticky": ["HEADER MuiPaper h=65 pos=sticky", "BUTTON.MuiBox h=46 pos=fixed", "NAV MuiBox h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=796 pos=fixed", "DIV.MuiBackdrop h=844 pos=fixed"],
  "overflowX": false,
  "cortados": [],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38"]
}
```

## /planos — 390×844

```json
{
  "rota": "#/planos",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": ["H5 fs21.6px w800: Planos e Créditos", "H6 fs17px w800: Histórico de Uso", "H6 fs17.6px w700: Comprar créditos (PIX instantâ", "H5 fs21.6px w800: R$ 9,90", "H5 fs21.6px w800: R$ 24,90", "H5 fs21.6px w800: R$ 49,90", "H6 fs17.6px w800: 💎 Premium Mensal", "H4 fs28px w800: R$ 19,90"],
  "contadores": { "cards": 6, "cardsAninhados": 0, "papers": 8, "botoes": 35, "chips": 1, "inputs": 0, "iconesSvg": 41, "dividers": 2, "accordions": 0, "tabs": 0 },
  "fontSizes": ["30× 13px", "10× 14px", "7× 12px", "6× 10px", "5× 16px", "4× 21.6px"],
  "raios": ["271× 0px", "22× 12px", "22× 10px", "10× 50%", "5× 8px"],
  "coresBg": ["5× rgb(250, 251, 252)", "4× rgb(32, 178, 170)", "4× rgb(255, 255, 255)", "4× rgba(32, 178, 170, 0.16)", "2× rgba(32, 178, 170, 0.12)", "2× rgba(32, 178, 170, 0.1)"],
  "coresTexto": ["35× rgb(100, 116, 139)", "18× rgb(26, 32, 44)", "5× rgb(255, 255, 255)", "5× rgb(32, 178, 170)", "4× rgb(23, 143, 137)"],
  "sombras": ["5× rgba(0,0,0,0.05) dupla", "2× rgba(32,178,170,0.3)", "1× rgba(15,95,90,0.45)", "1× ring branco + sombra"],
  "labelsCaixaAlta": ["Seus créditos [ls:2.4px]"],
  "primeiraDobra": ["H5 y81 fs21.6px w800: Planos e Créditos", "STRONG y110 fs14px w700: mensal", "STRONG y152 fs14px w700: créditos avulsos", "P y217 fs12px w700: Seus créditos", "P y240 fs52px w800: 71", "SPAN y312 fs12px: Sem assinatura — créditos custeiam a", "H6 y393 fs17px w800: Histórico de Uso", "SPAN y397 fs12px w700: Ver histórico ▼", "B y522 fs12px w700: 2", "B y540 fs12px w700: 10", "B y540: 20", "B y540: grátis", "P y586 fs28px w800: 50", "P y617 fs16px: créditos"],
  "sticky": ["HEADER MuiPaper h=65 pos=sticky", "BUTTON.MuiBox h=46 pos=fixed", "NAV MuiBox h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=796 pos=fixed", "DIV.MuiBackdrop h=844 pos=fixed"],
  "overflowX": false,
  "cortados": ["DIV.MuiBox css-1j5h3q8 r=396", "DIV.MuiBox css-idz1d7 r=383"],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38"]
}
```

## /suporte — 390×844

```json
{
  "rota": "#/suporte",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": ["H5 fs21.6px w800: Ajuda & Suporte"],
  "contadores": { "cards": 1, "cardsAninhados": 0, "papers": 3, "botoes": 32, "chips": 2, "inputs": 0, "iconesSvg": 41, "dividers": 1, "accordions": 0, "tabs": 0 },
  "fontSizes": ["30× 13px", "6× 10px", "3× 16px", "1× 11px", "1× 20px", "1× 21.6px"],
  "raios": ["237× 0px", "22× 10px", "14× 12px", "9× 50%", "5× 8px"],
  "coresBg": ["5× rgb(250, 251, 252)", "4× rgba(32, 178, 170, 0.16)", "3× rgb(32, 178, 170)", "2× rgba(32, 178, 170, 0.12)", "2× rgba(32, 178, 170, 0.1)", "2× rgb(23, 143, 137)"],
  "coresTexto": ["24× rgb(100, 116, 139)", "13× rgb(26, 32, 44)", "2× rgb(23, 143, 137)", "1× rgb(15, 118, 110)", "1× rgb(255, 255, 255)"],
  "sombras": ["1× rgba(15,95,90,0.45)", "1× ring branco + sombra", "1× rgba(32,178,170,0.3)", "1× rgba(0,0,0,0.05) dupla"],
  "labelsCaixaAlta": [],
  "primeiraDobra": ["H5 y81 fs21.6px w800: Ajuda & Suporte", "P y109 fs14px: Abra um chamado, acompanhe o status ", "P y244 fs16px w800: #1", "SPAN y247 fs13px w600: Erro no app", "SPAN y247 fs13px w700: Aguardando você", "P y274 fs16px w700: E2E: tela de exames trava", "SPAN y306 fs12px: Última atualização 30/06/26, 19:18"],
  "sticky": ["HEADER MuiPaper h=65 pos=sticky", "BUTTON.MuiBox h=46 pos=fixed", "NAV MuiBox h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=796 pos=fixed", "DIV.MuiBackdrop h=844 pos=fixed"],
  "overflowX": false,
  "cortados": [],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38"]
}
```

## /notificacoes — 390×844

```json
{
  "rota": "#/notificacoes",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": ["H5 fs21.6px w800: Notificações"],
  "contadores": { "cards": 36, "cardsAninhados": 0, "papers": 38, "botoes": 32, "chips": 36, "inputs": 0, "iconesSvg": 40, "dividers": 1, "accordions": 0, "tabs": 0 },
  "fontSizes": ["65× 13px", "37× 12px", "36× 18px", "36× 15px", "36× 14px", "6× 10px"],
  "raios": ["513× 0px", "47× 12px", "36× 16px", "22× 10px", "9× 50%"],
  "coresBg": ["36× rgb(255, 255, 255)", "22× rgba(32, 178, 170, 0.1)", "14× rgba(239, 68, 68, 0.1)", "5× rgb(250, 251, 252)", "4× rgba(32, 178, 170, 0.16)", "2× rgb(32, 178, 170)"],
  "coresTexto": ["97× rgb(100, 116, 139)", "82× rgb(26, 32, 44)", "22× rgb(32, 178, 170)", "15× rgb(239, 68, 68)", "1× rgb(15, 118, 110)"],
  "sombras": ["36× rgba(0,0,0,0.05) dupla", "1× rgba(15,95,90,0.45)", "1× ring branco + sombra", "1× rgba(0,0,0,0.04) -2px"],
  "labelsCaixaAlta": [],
  "primeiraDobra": ["H5 y81 fs21.6px w800: Notificações", "BUTTON y97 fs13px w700: Marcar todas como lidas", "DIV y187 fs18px: ✨", "P y187 fs15px w800: 🎉 Conquista: Saudável", "P y213 fs14px: Score de saúde acima de 80 — resgate", "SPAN y262 fs12px: 16/08, 08:33", "SPAN y188 fs13px w700: nova", "DIV y317 fs18px: ✨", "P y317 fs15px w800: 🎉 Conquista: Colecionador", "P y343 fs14px: Acumule 5 exames — resgate seu crédi", "SPAN y391 fs12px: 16/08, 08:33", "SPAN y317 fs13px w700: nova", "DIV y446 fs18px: ✨", "P y446 fs15px w800: 💡 Dica do Dr. Exame pra Edmilson"],
  "sticky": ["HEADER MuiPaper h=65 pos=sticky", "BUTTON.MuiBox h=46 pos=fixed", "NAV MuiBox h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=796 pos=fixed", "DIV.MuiBackdrop h=844 pos=fixed"],
  "overflowX": false,
  "cortados": [],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38"]
}
```

## /chat — 390×844

```json
{
  "rota": "#/chat",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": [],
  "contadores": { "cards": 0, "cardsAninhados": 0, "papers": 32, "botoes": 34, "chips": 0, "inputs": 1, "iconesSvg": 42, "dividers": 1, "accordions": 0, "tabs": 0 },
  "fontSizes": ["29× 20px", "28× 13px", "24× 16px", "22× 15px", "8× 14px", "7× 18px"],
  "raios": ["302× 0px", "41× 12px", "27× 8px", "23× 10px", "12× 50%"],
  "coresBg": ["31× rgb(255, 255, 255)", "22× rgba(32, 178, 170, 0.15)", "5× rgb(250, 251, 252)", "4× rgba(32, 178, 170, 0.16)", "3× rgb(32, 178, 170)", "2× rgba(0, 0, 0, 0.5)"],
  "coresTexto": ["67× rgb(26, 32, 44)", "29× rgb(23, 143, 137)", "26× rgb(100, 116, 139)", "4× rgb(255, 255, 255)", "1× rgb(15, 118, 110)"],
  "sombras": ["2× rgba(32,178,170,0.12) 0px 20px 40px", "1× rgba(15,95,90,0.45)", "1× ring branco + sombra", "1× rgba(255,255,255,0.45) ring"],
  "labelsCaixaAlta": [],
  "primeiraDobra": ["BUTTON y83 fs18px: ←", "P y99 fs11px: Assistente de saúde com IA · Edmilso", "SPAN y84 fs10px w500: 1", "P y123 fs19px w800: Como posso te ajudar, Edmilson?", "P y188 fs14px: Toque numa sugestão ou escreva sua d", "DIV y257 fs20px: 📊", "P y262 fs14px w600: Resumo dos meus exames", "SPAN y264 fs18px w800: ›", "DIV y316 fs20px: ⚠️", "P y321 fs14px w600: O que está alterado", "SPAN y323: ›", "DIV y376 fs20px: 📈", "P y381 fs14px w600: Minha evolução", "SPAN y383: ›"],
  "sticky": ["HEADER MuiPaper h=65 pos=sticky", "NAV MuiBox h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=796 pos=fixed", "DIV.MuiBackdrop h=844 pos=fixed", "DIV.MuiPaper h=844 pos=fixed"],
  "overflowX": false,
  "cortados": [],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38", "← 28×31", "1 30×30"]
}
```

Screenshot: `audit2-chat-390.png`

## / — 320×700

```json
{
  "rota": "#/",
  "headings": [],
  "contadores": { "cards": 11, "cardsAninhados": 0, "papers": 13, "botoes": 34, "chips": 0, "inputs": 0, "iconesSvg": 51, "dividers": 1 },
  "labelsCaixaAlta": ["Sua saúde hoje [ls:0.88px]"],
  "primeiraDobra": ["P y81 fs24px w800: Boa noite, Edmilson 👋", "P y217 fs26px w800: 45", "P y186 fs11px w700: Sua saúde hoje", "SPAN y267 fs13.5px w700: ● 6 moderados", "P y499 fs11px: Cardiometabólico", "P y499 fs11px: Idade biológica"],
  "sticky": ["HEADER h=65 pos=sticky", "NAV h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=652 pos=fixed", "DIV.MuiBackdrop h=700 pos=fixed", "DIV.MuiPaper h=700 pos=fixed"],
  "overflowX": false,
  "cortados": [],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38"]
}
```

## /exams — 320×700

```json
{
  "rota": "#/exams",
  "headings": ["H5 fs21.6px w800: Seus exames", "H3 fs16px: 📅 20265"],
  "contadores": { "cards": 7, "cardsAninhados": 1, "papers": 10, "botoes": 53, "chips": 12, "inputs": 2, "iconesSvg": 67, "dividers": 1, "accordions": 1 },
  "labelsCaixaAlta": ["Último exame [ls:0.88px]"],
  "primeiraDobra": ["H5 y98 fs21.6px w800: Seus exames", "P y126 fs14px: 5 no total • toque para ver detalhes", "BUTTON y244: Todos", "BUTTON y244: Alterados", "BUTTON y244: Recentes", "BUTTON y286: 📅 Por data", "BUTTON y286: 🗂️ Por categoria", "SPAN y336: Todos (5)/Hemograma (3)/Glicemia (1)/Lipídios (1)", "P y412 fs19px w800: HEMOGRAMA"],
  "sticky": ["HEADER h=65 pos=sticky", "BUTTON.MuiFab h=56 pos=fixed", "NAV h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=652 pos=fixed", "DIV.MuiBackdrop h=700 pos=fixed"],
  "overflowX": false,
  "cortados": ["DIV.MuiChip r=420", "SPAN.MuiChip-label r=420", "DIV.MuiChip r=609", "SPAN.MuiChip-label r=608", "DIV.MuiBox css-1nwjjb6 r=459"],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38", "Todos 66×34", "Alterados 91×34", "Recentes 87×34", "📅 Por data 103×34"]
}
```

## /alterados — 320×700

```json
{
  "rota": "#/alterados",
  "headings": ["H5 fs21.6px w800: Valores fora da faixa", "H3 fs16px: 🟠PERFIL LIPÍDICO", "H3 fs16px: 🟠GLICEMIA DE JEJUM", "H3 fs16px: 🟡HEMOGRAMA s/d 2 alterado(s)"],
  "contadores": { "cards": 1, "cardsAninhados": 0, "papers": 6, "botoes": 48, "chips": 11, "accordions": 3 },
  "coresTexto": ["41× rgb(100,116,139)", "25× rgb(234,88,12)", "20× rgb(26,32,44)", "10× rgb(202,138,4)", "4× rgb(3,105,73)"],
  "primeiraDobra": ["H5 y81 fs21.6px w800: Valores fora da faixa", "SPAN y247 fs16px w800: 🔴 0 Importantes", "SPAN y285: 🟠 6 Moderadas", "SPAN y285: 🟡 2 Leves", "P y425 fs16px w800: PERFIL LIPÍDICO", "P y563 fs16px w700: COLESTEROL TOTAL"],
  "sticky": ["HEADER h=65 pos=sticky", "BUTTON.MuiBox h=46 pos=fixed", "NAV h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=652 pos=fixed", "DIV.MuiBackdrop h=700 pos=fixed"],
  "overflowX": false,
  "cortados": [],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38", "O que é este exame? 28×28", "O que significa mg/dL? 18×18 ×2"]
}
```

## /chat — 320×700

```json
{
  "rota": "#/chat",
  "headings": [],
  "contadores": { "cards": 0, "papers": 32, "botoes": 34, "inputs": 1, "iconesSvg": 42 },
  "primeiraDobra": ["BUTTON y92 fs18px: ←", "P y98 fs11px: Assistente de saúde com IA · Edmilso", "P y-41 fs19px w800: Como posso te ajudar, Edmilson? (acima do topo — scroll interno)", "DIV y93 fs20px: 📊", "P y98 fs14px w600: Resumo dos meus exames", "DIV y152: ⚠️ O que está alterado", "DIV y212: 📈 Minha evolução"],
  "sticky": ["HEADER h=65 pos=sticky", "NAV h=79 pos=fixed", "DIV.enabled h=40 pos=fixed", "DIV.MuiDrawer h=652 pos=fixed", "DIV.MuiBackdrop h=700 pos=fixed", "DIV.MuiPaper h=700 pos=fixed"],
  "overflowX": false,
  "cortados": ["DIV.MuiBox css-j2vig r=350", "DIV.MuiPaper r=342", "DIV.MuiBox css-shbjy3 r=342", "DIV.MuiBox css-1i6u1yp r=324", "DIV.MuiBox css-0 r=324"],
  "alvosPequenos": ["Pular para o conteúdo 16×16", "Notificações 38×38", "← 28×31", "1 30×30"]
}
```

## / — 1280×800

```json
{
  "rota": "#/",
  "headings": [],
  "contadores": { "cards": 11, "cardsAninhados": 0, "papers": 13, "botoes": 34, "chips": 0, "inputs": 0, "iconesSvg": 48, "dividers": 1 },
  "labelsCaixaAlta": ["Sua saúde hoje [ls:0.88px]"],
  "primeiraDobra": ["SPAN y88 fs13px w800: Exames (sidebar: Exames/Valores alterados/Evolução/Tendências/Linha do Tempo/Relatório completo)", "SPAN y146 fs13px w800: Cuidados (Medições/Vacinas/Lembretes/Cartão de Emergência/Conquistas)", "SPAN y204 fs13px w800: Pessoas"],
  "sticky": ["BUTTON.MuiButton h=36 pos=fixed", "HEADER MuiPaper h=65 pos=sticky", "DIV.enabled h=40 pos=fixed"],
  "overflowX": false,
  "cortados": [],
  "alvosPequenos": ["Pular para o conteúdo 164×36", "Notificações 38×38"]
}
```

## /exams — 1280×800

```json
{
  "rota": "#/exams",
  "headings": ["H6 fs17.6px w700: Exames", "H5 fs21.6px w800: Seus exames", "H3 fs16px: 📅 20265"],
  "contadores": { "cards": 7, "cardsAninhados": 1, "papers": 10, "botoes": 53, "chips": 12, "inputs": 2, "iconesSvg": 64, "accordions": 1 },
  "labelsCaixaAlta": ["Último exame [ls:0.88px]"],
  "sticky": ["BUTTON.MuiButton h=36 pos=fixed", "HEADER h=65 pos=sticky", "DIV.MuiBox css-3h4yjb h=784 pos=sticky", "DIV.MuiBox css-1f15ega h=211 pos=sticky", "BUTTON.MuiFab h=56 pos=fixed", "DIV.enabled h=40 pos=fixed"],
  "overflowX": false,
  "cortados": [],
  "alvosPequenos": ["Pular para o conteúdo 164×36", "Notificações 38×38", "Todos 62×28", "Alterados 87×28", "Recentes 83×28", "📅 Por data 99×28"]
}
```

## / — 768×1024

```json
{
  "rota": "#/",
  "headings": [],
  "contadores": { "cards": 11, "cardsAninhados": 0, "papers": 13, "botoes": 34, "chips": 0, "iconesSvg": 48, "dividers": 1 },
  "labelsCaixaAlta": ["Sua saúde hoje [ls:0.88px]"],
  "sticky": ["BUTTON.MuiButton h=36 pos=fixed", "HEADER h=65 pos=sticky", "DIV.enabled h=40 pos=fixed"],
  "overflowX": false,
  "cortados": [],
  "alvosPequenos": ["Pular para o conteúdo 164×36", "Notificações 38×38"]
}
```

## /landing (anônimo) — 390×844

```json
{
  "rota": "#/landing",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": ["H6 fs19px w800: Meus Exames", "H1 fs36.8px w800: Entenda seus exames como nunca", "H2 fs27.2px w800: Decifre um exame em 5 segundos", "H2 fs30.4px w800: Tudo que você precisa pra domi", "H6 fs17px w800: Leitura de risco", "H6 fs17px w800: Índices que o laudo não dá", "H6 fs17px w800: Plano de ação do Dr. Exame", "H6 fs17px w800: IA que lê seus exames"],
  "contadores": { "cards": 0, "cardsAninhados": 0, "papers": 6, "botoes": 30, "chips": 19, "inputs": 2, "iconesSvg": 73, "dividers": 0, "accordions": 6, "tabs": 0 },
  "fontSizes": ["64× 14px", "43× 13px", "27× 15px", "24× 17px", "12× 12px", "12× 16px"],
  "raios": ["633× 0px", "78× 12px", "36× 999px", "10× 50%", "6× 14px"],
  "coresBg": ["50× rgb(255, 255, 255)", "14× rgba(15, 61, 58, 0.22)", "13× rgb(250, 251, 252)", "11× rgb(32, 178, 170)", "3× rgba(234, 88, 12, 0.14)", "2× rgba(32, 178, 170, 0.12)"],
  "coresTexto": ["93× rgb(100, 116, 139)", "56× rgb(26, 32, 44)", "27× rgb(23, 143, 137)", "18× rgb(255, 255, 255)", "10× rgb(234, 88, 12)"],
  "sombras": ["4× rgba(32,178,170,0.3) 0px 4px 12px", "2× rgba(32,178,170,0.2) 0px 30px 60px + 0.07", "2× rgba(32,178,170,0.2) 0px 30px 60px + 0.1", "2× rgba(0,0,0,0.04) 0px 2px 8px"],
  "labelsCaixaAlta": ["Veja acontecer [ls:0.78px]", "Dúvidas frequentes [ls:0.78px]"],
  "primeiraDobra": [],
  "sticky": ["DIV.MuiBox css-1mchlk7 h=90 pos=fixed", "DIV.enabled h=40 pos=fixed"],
  "overflowX": false,
  "cortados": ["DIV.MuiBox css-32c6md r=400", "DIV.MuiBox css-1eh33co r=390", "DIV.MuiBox css-2w1tq4 r=400", "DIV.MuiBox css-15yrc7z r=400"],
  "alvosPequenos": ["Todos 75×32", "IA & Análise 114×32", "Acompanhamento 156×32", "Médico & Família 148×32", "Segurança 105×32", "🩺 Para o médico 160×37"]
}
```

Screenshot: `audit2-landing-390.png`

## /entrar (login, anônimo) — 390×844

```json
{
  "rota": "#/entrar",
  "titulo": "Dr. Exame — Seus exames com IA",
  "headings": [],
  "contadores": { "cards": 0, "cardsAninhados": 0, "papers": 0, "botoes": 7, "chips": 0, "inputs": 4, "iconesSvg": 8, "dividers": 0, "accordions": 0, "tabs": 0 },
  "fontSizes": ["3× 13px", "3× 14px", "3× 12px", "2× 11.25px", "1× 24px"],
  "raios": ["75× 0px", "6× 12px", "3× 50%", "3× 999px", "3× 8px"],
  "coresBg": ["4× rgb(255, 255, 255)", "2× rgb(250, 251, 252)", "1× rgba(0, 0, 0, 0.04)", "1× rgb(0, 121, 107)"],
  "coresTexto": ["5× rgb(100, 116, 139)", "4× rgb(26, 32, 44)", "2× rgb(0, 121, 107)", "1× rgb(60, 64, 67)"],
  "sombras": ["1× rgba(0,80,70,0.14) 0px 24px 60px", "1× rgba(32,178,170,0.094) ring 6.35px", "1× rgba(0,105,92,0.32) 0px 6px 18px"],
  "labelsCaixaAlta": [],
  "primeiraDobra": [],
  "sticky": ["DIV.enabled h=40 pos=fixed"],
  "overflowX": false,
  "cortados": [],
  "alvosPequenos": ["Mostrar senha 30×30", "Esqueci minha senha 133×20", "Criar conta 71×21"]
}
```

Screenshot: `audit2-login-390.png`

## Erros de console (sessão inteira, level error)

- **kebab-case CSS (Emotion)**: `WebkitTapHighlightColor` e `WebkitBackdropFilter` — 6 ocorrências (a cada cold load). Warning de dev do MUI/Emotion.
- **HTML nesting inválido**: `<div> (Chip) não pode ser descendente de <p> (Typography)` em **MedicosPage** (contador de médicos dentro de `<p>`) — 2 erros (hidratação/DOM inválido).
- **404**: `GET /api/doctor/photo/doctor-test-001` (foto de médico de teste inexistente) — 2×.
- **401 Unauthorized em massa** (~46): `/api/billing/status`, `/api/exams?_start=0&_end=1[&status=FAILED]`, `/api/items/flag-summary`, `/api/patients`, `/api/achievements/heartbeat` — todos durante a **fase anônima intencional** da auditoria (app seguiu fazendo fetch sem token). Não reproduz em sessão autenticada.
- **Google Identity Services**: `The given origin is not allowed for the given client ID` (origin `localhost:5173` não registrada no client Google) + erro 403 no botão GSI — 2× na tela de login.

## Portal médico

- portal médico: não auditado ao vivo (exige login CRM).
