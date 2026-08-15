// Gera RELATORIO-FINAL.html AUTOCONTIDO (screenshots embutidos em base64 — abre offline, 2 cliques).
// Rodar: node gen-relatorio.mjs  (de dentro de audit-premium-2026-08/)
import { readFileSync, writeFileSync } from 'node:fs';

const b64 = (f) => { try { return `data:image/jpeg;base64,${readFileSync(f).toString('base64')}`; } catch { return null; } };
const img = (f, alt, cap) => { const d = b64(f); return d ? `<figure><img src="${d}" alt="${alt}"/><figcaption>${cap}</figcaption></figure>` : `<figure class="missing"><figcaption>📝 ${alt} (imagem: ${f})</figcaption></figure>`; };

const pair = (antes, depois, altA, altD) => `
<div class="pair">
  ${img(antes, altA, 'ANTES')}
  ${img(depois, altD, 'DEPOIS')}
</div>`;

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Auditoria Premium Dr. Exame — Relatório Final</title>
<style>
  :root{--teal:#20b2aa;--teal-d:#00796b;--ink:#1a202c;--mut:#64748b;--bg:#eef7f6;--ok:#059669;--warn:#d97706;--defer:#94a3b8;--bad:#dc2626}
  *{box-sizing:border-box} body{margin:0;font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--ink);line-height:1.55}
  .wrap{max-width:1060px;margin:0 auto;padding:24px 16px 80px}
  header.hero{background:linear-gradient(135deg,#20b2aa,#00796b);color:#fff;border-radius:16px;padding:28px 24px;margin-bottom:24px}
  header.hero h1{margin:0 0 6px;font-size:26px} header.hero p{margin:4px 0;opacity:.95}
  .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
  .chip{background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:4px 12px;font-size:13px;font-weight:600}
  h2{font-size:20px;margin:34px 0 10px;color:var(--teal-d);border-bottom:2px solid var(--teal);padding-bottom:6px}
  h3{font-size:16px;margin:20px 0 8px}
  .card{background:#fff;border:1px solid #dbe7e5;border-radius:14px;padding:18px;margin:12px 0}
  table{width:100%;border-collapse:collapse;font-size:14px;background:#fff;border-radius:12px;overflow:hidden}
  th{background:var(--teal-d);color:#fff;text-align:left;padding:9px 10px;font-size:13px}
  td{padding:8px 10px;border-top:1px solid #e5efed;vertical-align:top}
  .ok{color:var(--ok);font-weight:700}.part{color:var(--warn);font-weight:700}.def{color:var(--defer);font-weight:700}.bad{color:var(--bad);font-weight:700}
  figure{margin:0;background:#0f1818;border-radius:12px;overflow:hidden}
  figure img{width:100%;display:block}
  figcaption{font-size:11px;color:#94a3b8;text-align:center;padding:5px;letter-spacing:.08em}
  .pair{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}
  @media(max-width:640px){.pair{grid-template-columns:1fr}}
  .note{background:#fff8e6;border:1px solid #f2d9a4;border-radius:10px;padding:10px 14px;font-size:13.5px}
  .okbox{background:#eafaf3;border:1px solid #b7e4d0;border-radius:10px;padding:10px 14px;font-size:13.5px}
  ul{margin:6px 0;padding-left:22px} li{margin:4px 0}
  code{background:#f0f6f5;border-radius:6px;padding:1px 6px;font-size:12.5px}
</style></head><body><div class="wrap">

<header class="hero">
  <h1>🩺 Auditoria Premium — Dr. Exame / Minha Saúde</h1>
  <p>Relatório final de implementação · 15–16/08/2026 · tudo validado ao vivo com Playwright na produção</p>
  <div class="chips">
    <span class="chip">Commits 52bb502 + 553d9a8</span>
    <span class="chip">AAB 312 (2.7.71)</span>
    <span class="chip">Testes 377 + 41 ✓</span>
    <span class="chip">tsc server+web ✓</span>
    <span class="chip">Deploy automático ✓</span>
  </div>
</header>

<div class="okbox"><b>Como ler:</b> cada item da auditoria aparece com status (<span class="ok">✓ feito e validado no ar</span>, <span class="part">◐ feito — visível com dados reais</span>, <span class="def">⏸ adiado com motivo</span>). As telas ANTES/DEPOIS estão lado a lado; capturas tiradas da própria produção.</div>

<h2>1 · Mapa geral — o que mudou</h2>
<div class="card">
<table>
<tr><th>Ponto da auditoria</th><th>Status</th><th>Onde ver</th></tr>
<tr><td><b>P0</b> Placeholder "[data não informada no contexto]" no relatório</td><td class="ok">✓ novo não gera + antigos saneados no render</td><td>/relatorio</td></tr>
<tr><td><b>P0</b> Duplo modal na entrada (Versão 1.4.4 + nudge fantasma)</td><td class="ok">✓ versão real 2.7.x + nudge obsoleto some</td><td>Home</td></tr>
<tr><td><b>P1</b> Menu: 24 destinos, 3 duplicados, grid de 9</td><td class="ok">✓ 4 seções por intenção, 18 itens, 0 duplicatas</td><td>Mais / sidebar</td></tr>
<tr><td><b>P1</b> Cartão de emergência a 3 toques</td><td class="ok">✓ botão de emergência a 1 toque no drawer</td><td>Drawer (topo)</td></tr>
<tr><td><b>P1</b> Idade biológica "49a s/ idade cadastrada"</td><td class="ok">✓ vira CTA "cadastre seu nascimento"</td><td>Home (tiles)</td></tr>
<tr><td><b>P1</b> Exame de terceiro contaminando agregações</td><td class="ok">✓ filtrado em 7 pontos (incl. fonte canônica)</td><td>Home / alterados / evolução / família</td></tr>
<tr><td><b>P1</b> Contagens divergindo entre telas</td><td class="ok">✓ uma única fonte (health-state) para todos</td><td>Home × alterados × família</td></tr>
<tr><td><b>P1</b> Landing: 7 depoimentos fictícios</td><td class="ok">✓ seção removida (dono confirmou)</td><td>Landing</td></tr>
<tr><td><b>P2</b> Landing promete PES/CID-10 inexistente</td><td class="ok">✓ claim removido (SOAP real ficou)</td><td>Landing · Pro</td></tr>
<tr><td><b>P2</b> /alterados ordenado por data (🟡 antes de 🔴)</td><td class="ok">✓ severidade primeiro (paridade c/ médico)</td><td>/alterados</td></tr>
<tr><td><b>P2</b> Família "✅ Tudo dentro da faixa" enganoso</td><td class="ok">✓ "Nada relevante agora" (escopo honesto)</td><td>/familia</td></tr>
<tr><td><b>P2</b> Tendências do médico sem período</td><td class="ok">✓ 6m / 1a / 2a / todo histórico</td><td>Portal médico › Tendências</td></tr>
<tr><td><b>P2</b> Botão "PDF" sem rótulo claro (médico)</td><td class="ok">✓ renomeado "Abrir laudo"</td><td>Portal médico › Exame</td></tr>
<tr><td><b>P2</b> Evolução × Tendências / Família × Dependentes (nomes soltos)</td><td class="ok">✓ entradas únicas + cross-link nas páginas</td><td>Menu + /evolucao + /familia</td></tr>
<tr><td><b>P2</b> "Trocar senha" fora de Segurança</td><td class="ok">✓ seção renomeada "Segurança & senha"</td><td>Menu › Conta</td></tr>
<tr><td><b>P2</b> Créditos duplicados no drawer</td><td class="ok">✓ 1 só</td><td>Drawer header</td></tr>
<tr><td><b>P3</b> Bottom nav sem estado ativo em rotas secundárias</td><td class="ok">✓ SECONDARY_ROUTES completa</td><td>Mais fica ativo</td></tr>
<tr><td>Boot anônimo (21 requests 401 na landing)</td><td class="def">⏸ adiado — mexer no gate de auth arrisca o login por ganho só de performance</td><td>—</td></tr>
<tr><td>Dashboard desktop em 2 colunas / master-detail médico</td><td class="def">⏸ adiado — refactors de layout maiores, fora do escopo das ondas aprovadas</td><td>—</td></tr>
<tr><td>Glossário "Em mudança" · default inteligente /tendencias · botão "Agendar"</td><td class="def">⏸ backlog declarado</td><td>—</td></tr>
</table>
</div>

<h2>2 · Antes → Depois (produção)</h2>
<h3>Menu lateral — de grid de 9 + duplicatas para 4 seções por intenção</h3>
${pair('menu-mais-mobile-390-closed.jpeg', 'AFTER-menu-novo-390.jpeg',
  'ANTES: 9 atalhos + “Minha saúde” repetindo 3 deles (~24 destinos)',
  'DEPOIS: Exames · Cuidados · Pessoas · Conta + botão de EMERGÊNCIA no topo')}

<h3>Home — estado de confiança</h3>
${pair('home-mobile-390.jpeg', 'AFTER-home-390.jpeg',
  'ANTES: modais empilhados (versão podre + nudge fantasma), bio-idade sem dado',
  'DEPOIS: sem modal fantasma; bio-idade “49a · cadastre seu nascimento”; contagens reconciliadas')}

<h3>Valores alterados</h3>
${pair('home-mobile-390.jpeg', 'AFTER-alterados-390.jpeg',
  'ANTES: contava valores de exames de terceira pessoa (CPF divergente)',
  'DEPOIS: só valores do próprio perfil — “Tudo dentro da faixa” é a verdade desta conta de teste')}

<h3>Relatório completo</h3>
${pair('relatorio-placeholder-leak.jpeg', 'AFTER-relatorio-390.jpeg',
  'ANTES: “exames de [data não informada no contexto]” vazado pela IA',
  'DEPOIS: texto saneado no render; novas gerações interpolam a data real')}

<h3>Portal do médico — tendências e laudo</h3>
${pair('doctor-relatorio-desktop.jpeg', 'AFTER-doctor-trends-390.jpeg',
  'ANTES: histórico de 6 anos sempre inteiro; botão “PDF” sem rótulo',
  'DEPOIS: filtro de período (6m/1a/2a/tudo) + “Abrir laudo”')}

<h2>3 · Validação Playwright ao vivo (produção)</h2>
<div class="card">
<table>
<tr><th>Verificação</th><th>Resultado</th></tr>
<tr><td>WhatsNew mostra “Versão 2.7.70” com conteúdo atual</td><td class="ok">✓ confirmado no DOM</td></tr>
<tr><td>Nudge “envie seu primeiro exame” em conta com exames</td><td class="ok">✓ não aparece mais</td></tr>
<tr><td>Bio-idade com CTA em vez de “s/ idade cadastrada”</td><td class="ok">✓ “49a | cadastre seu nascimento”</td></tr>
<tr><td>Drawer: 4 seções novas + botão Cartão de emergência</td><td class="ok">✓ presente</td></tr>
<tr><td>Duplicatas grid×acordeão (“Minha saúde”, “Família & médicos”)</td><td class="ok">✓ removidas</td></tr>
<tr><td>/alterados sem valores de terceiro</td><td class="ok">✓ “Tudo dentro da faixa!” (conta só tinha exames mismatch)</td></tr>
<tr><td>/familia com rótulo novo</td><td class="ok">✓ “Nada relevante agora”</td></tr>
<tr><td>Placeholder no relatório armazenado</td><td class="ok">✓ saneado no render (553d9a8)</td></tr>
<tr><td>Médico: seletor de período + gráfico</td><td class="ok">✓ presente e renderizando</td></tr>
<tr><td>Médico: botão “Abrir laudo” no detalhe</td><td class="ok">✓ presente</td></tr>
<tr><td>Evolução: link “Gráfico por marcador”</td><td class="part">◐ visível quando há itens próprios (conta de teste não tem)</td></tr>
<tr><td>Ordenação 🔴→🟡 em /alterados</td><td class="part">◐ código no ar; sem dados próprios para exibir na conta de teste</td></tr>
</table>
<p style="font-size:13px;color:var(--mut);margin-top:10px">Nota: a conta de teste tinha <b>todos</b> os 3 exames com CPF divergente — por isso as telas ficam “vazias”: é o filtro de identidade funcionando. Com exames próprios, as telas exibem normalmente.</p>
</div>

<h2>4 · Commits e artefatos</h2>
<div class="card">
<ul>
  <li><code>a1b53f1</code> Login V2 (WCAG, erros inline, rota do médico, nativo-feel) — ontem</li>
  <li><code>c76987b</code> Fix pré-roteador do chat + toggle de volta — ontem</li>
  <li><code>52bb502</code> Auditoria: ondas 1–4 (confiança, menu, médico, identityMatch)</li>
  <li><code>553d9a8</code> Onda final: fonte canônica filtrada + relatórios antigos saneados</li>
  <li><b>AAB:</b> <code>packages/mobile/android/app/build/outputs/bundle/release/app-release.aab</code> — versionCode <b>312</b> (2.7.71) — subir no Play Console</li>
</ul>
</div>

<h2>5 · Pendências declaradas (próximas ondas)</h2>
<div class="card">
<ul>
  <li>Boot anônimo: gate das 21 chamadas 401 na landing (perf/higiene — requer cuidado com o fluxo de auth)</li>
  <li>Dashboard desktop em 2 colunas + master/detail do portal médico</li>
  <li>Glossário de 1 linha para “Em mudança” (🟠) e delta absoluto junto do %</li>
  <li>Default inteligente em /tendencias (marcador alterado mais relevante em vez de alfabético)</li>
  <li>“Agendar” prometido no subtítulo de /alterados (ou remover a promessa)</li>
  <li>DS contínuo: AppCard/botão-gradiente/SectionTitle como primitivas (136 Cards crus hoje)</li>
  <li>Re-testar troca de paciente A→B no portal médico (contexto stale)</li>
</ul>
</div>

<p style="text-align:center;color:var(--mut);font-size:12px;margin-top:30px">Gerado automaticamente · evidências completas em audit-premium-2026-08/ · credenciais nunca incluídas</p>
</div></body></html>`;

writeFileSync('RELATORIO-FINAL.html', html);
console.log('RELATORIO-FINAL.html gerado:', (html.length / 1024).toFixed(0) + 'KB');
