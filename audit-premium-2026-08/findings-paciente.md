# Auditoria Premium — achados ao vivo (scratch) — 390×844

> Sem credenciais aqui. Sem mutações em prod.

## Landing
- ✔ Hero claro (valor + como funciona + trust inline: "IA não inventa números"/LGPD), demo interativa "Decifre um exame em 5s", 5-step segurança, sliders IMC, FAQ, pricing, QR Play Store.
- ⚠ [P1?] 7 depoimentos nomeados ("pré-diabetes revertido", "anemia tratada") — PRODUCT.md marca depoimentos como AUSÊNCIA confirmável. Procedência a confirmar com dono; se fictícios = risco de credibilidade/CONAR. 
- [P2] 21 requests 401 no boot ANÔNIMO (exams/patients/billing/notifications/achievements disparam atrás da landing) — desperdício no 1º paint + ruído de monitoramento.
- [P3] Links do rodapé = divs clicáveis (não <a>); h6 como título de cards (semântica).

## Login (V2, ontem)
- Toggle voltou; ok. (não re-auditado em profundidade — feito ontem)

## Home (DashboardV2)
- [P1] DOIS modais empilhados na entrada: "Novidades v1.4.4" (label de versão PODRE — app está 2.7.x) + nudge "envie seu primeiro exame" em conta COM 3 exames/8 alterados → estado mentiroso na 1ª tela.
- [P1] Tile "Idade biológica 49a — s/ idade cadastrada": mostra número sem dado. 
- [P1] "Desde seu último exame: 3 pioraram 2 melhoraram" + lista com ↑/↓/• SEM legenda, nomes crus de lab (BASTONETES 0%). O que o paciente faz com isso?
- [P2] Score 93 "Nada crítico" × "8 alterados / 3 pioraram" no mesmo viewport — tensão sem nuance (data 11/11/2025 = 9 meses).
- [P2] Créditos duplicados no drawer header (💎19 + ⚡19). 
- ✔ QuickActions 4 (Enviar/Evolução/Família/Relatório), CreditsCard transparente, FAB chat global.

## Menu (drawer "Mais") — núcleo da auditoria
- Estrutura: header perfil+créditos → GRID 9 atalhos (Início, Exames, Valores alterados, Evolução da saúde, Tendências, Linha do Tempo, Relatório completo, Perguntas, Saúde da Família) → 3 acordeões (Minha saúde: Valores alterados†, Tendências†, Linha do Tempo†, Medições, Vacinas, Lembretes, Cartão de Emergência, Conquistas | Família & médicos: Dependentes, Meus Médicos, Despesas Médicas | Conta: Meu perfil, Segurança, Privacidade e termos, Planos e Créditos) → Ajuda & Suporte, Sobre, Sair.
- † = DUPLICADO do grid (confirmado no código: App.tsx grid 198-227 vs acordeão 230-239).
- [P1 arquitetura] Menu = 9 + 3×(3-8) = ~24 destinos visíveis/empilhados; 3 duplicados grid×acordeão; rótulos INCONSISTENTES pro mesmo destino: grid "Evolução da saúde"×bottom "Evolução"×quick "Evolução"; grid "Saúde da Família"×acordeão "Dependentes" (/familia vs /patients — telas diferentes!); grid "Perguntas"×acordeão nada.
- [P2] "Despesas Médicas" mora em Família & médicos (deslocado da intenção).
- Bottom nav: Início/Exames/Dr. Exame(chat)/Evolução/Mais — "Mais" abre o MESMO drawer (15 rotas secundárias).
- Do código (agente): /exams alcançável de 4 lugares; /evolucao de 5; /tendencias de 4; /chat de 3 (bottom robô + AiCard + FloatingChat).

## Rotas (mobile 390)
- **/alterados** ✔✔ madura: severidade explicada, help "O que é este exame?" EXEMPLAR (analogia chave/insulina), valuebar c/ alt. [P2] promete "Agendar" que não existe no card; ordem diz 🔴→🟡 mas 🟡 vem primeiro; [P3] "HEMOGRAMA COMPLETO" contendo HOMA/glicose/insulina/FSH/estradiol (título×conteúdo).
- **/evolucao** ✔ filtros c/ contagem consistentes (62=3+27+32), busca c/ exemplo. [P2] "Em mudança" vago (TSH 2.83 DENTRO da faixa marcada 🟠 confunde); "+190%" sem delta absoluto; [P3] emojis como ícones de categoria (🍩 glicemia).
- **/tendencias** [P2] default = "Basofilos" (alfabético, irrelevante); "↓98%" com 2 medições = ruído como tendência; [P3] nomes de lab mal formatados ("Chcm", Title Case).
- **/linha-do-tempo** [P2] evento sem navegação pro exame; só exames (medições/vacinas não entram na "jornada"); [P3] "exame(s)" parentético dev-speak.
- **/relatorio** ✔✔ estrutura excelente (resumo humano, atenção nº+explicação, positivos, metas, perguntas c/ alerta educativo, leitura final, TTS/PDF/share). [P0] TEXTO DA IA VAZOU PLACEHOLDER: "exames de [data não informada no contexto]" (screenshot relatorio-placeholder-leak.jpeg). [P2] contagens divergem entre telas (2 atenção aqui × 8 alterados na Home × 1🔴7🟡 em alterados — escopos sem reconciliação).
- **/perguntas** ✔ empty state c/ próxima ação. Candidata a sair do grid-9 (inbox, não ferramenta diária).
- **/familia** ✔ painel comparativo. [P1] "✅ Tudo dentro da faixa" pra conta com 8 alterados (stale/escopo sem reconciliar); "🥇 Melhor score" com 1 membro.
- **/patients** gestão (Titular + Dependentes). Overlap conceitual com /familia CONFIRMADO + nomes desconectados no menu ("Saúde da Família" × "Dependentes").
- **/medicoes** ✔ peso c/ data; vitals empty c/ orientação. Form Tipo/Valor/Data no topo.
- **/vacinas** "Carteira de Vacinação" — form + empty ok.
- **/lembretes** ✔ form c/ exemplo no empty state ("Refazer hemograma em 6 meses").
- **/emergencia** [P1] 3 toques fundo (Mais→Minha saúde→Cartão) — terceiro NÃO acha em emergência; sem atalho APK/lockscreen; tudo "Não informado"; [P2] idade "49 anos" aqui × "s/ idade cadastrada" na Home (fontes divergem); [P3] heading ALL-CAPS.
- **/despesas** R$0 + form + empty. [P2] sem framing de valor (por que registrar aqui? posição no menu sob "Família & médicos" deslocada).
- **/conquistas** ✔ gamificação com payoff real (1 crédito por conquista) + explicação honesta. [P3] botão "Voltar" duplicado (AppBar + interno).
- **/medicos** ✔✔ subtitle É a mensagem de privacidade ("Controle quem vê... revogue a qualquer momento") + empty c/ CTA. (Fluxo de permissões granulares não testado — requer compartilhar.)
- **/perfil** ✔ seções agrupadas, peso→medições cross-link, referral, excluir/exportar/importar. [P2] "Trocar senha" aqui (ação de segurança fora de /seguranca); perfil clínico em 8 acordeões; scroll longo.
- **/seguranca** 2FA + dica de biometria. [P2] senha não está aqui (divisão perfil×segurança); h5 e h6 ambos dizem "Segurança"; dica menciona biometria sem controle visível.
- **/privacidade** ✔ 4 seções acordeão (não é muro jurídico).
- **/planos** ✔✔ transparência exemplar: saldo + "Sem assinatura — créditos custeiam a IA", Histórico de Uso, packs PIX (50/R$9,90 + MAIS VENDIDO 320/R$49,90), premium honesto ("créditos SOMAM, NÃO expiram"). [P3] não mostra tabela "o que custa quantos créditos" (chat=2/resumo=10...).
- **/exams** ✔✔ (V2): hero último exame (Ver análise + Abrir laudo), busca c/ exemplos, filtros data/categoria, chips c/ contagem, agrupamento por ano, FAB. [P3] bloco "Desde seu último exame" duplicado da Home.
- **/exams/show (CULTURA DE URINA)** ✔ h1 + status + lab c/ logo + "Abrir laudo" no topo; acordeão de itens c/ valuebar+alt; honesty note ("11 de 16 sem referência informada — não foi possível classificar"); custo upfront ("Gerar resumo 💎 10 créditos"); "Preparar visita". 🔴 **ACHADO GRAVE (dados)**: exame pertence a HELOISA CRISTINA FERNANDES c/ CPF divergente (***-78 × perfil ***-07) — gate bloqueia análise ✔ mas o exame SEGUE no hero/timeline/contagens do titular → suspeita de agregações sem filtro identityMatch (P1 verificar server-side).
- **/chat** visto por cima (canvas) — não aprofundado (trabalho recente).

## 360×800
✔ ZERO overflow real (5 telas densas scanneadas; chip em /exams = fileira rolável intencional).

## Desktop 1440×900
- [P2] Sidebar 240px SEMPRE aberta (menu 9-grid+acordeões permanente = redundância em tela o tempo todo).
- [P2] Dashboard em COLUNA ÚNICA: card de score esticado a 1200px (mobile-stretched; sem 2-col).
- ✔ /exams desktop = master/detail 440+727 (S5 vivo).
- Landing desktop não re-testada em detalhe (hero mobile ok; QR/planos ok no snapshot).

## Consistência cross-screen (acumulado)
- Contagens de "alterados" divergem por escopo sem explicação: Home "8 alterados"/"3 pioraram" × alterados "1🔴 7🟡" × relatório "2 atenção/4 positivos" × família "✅ tudo dentro da faixa". Paciente não tem como reconciliar.
- Idade: Home bio-age "s/ idade cadastrada (49a)" × emergência "49 anos".

