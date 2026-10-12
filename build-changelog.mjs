// Gerador do Artifact "Changelog Visual v2.7.66".
// Lê os PNGs, redimensiona p/ JPEG leve (sharp) e inlineia como data URI.
// O HTML é escrito em disco — o base64 NÃO passa pelo contexto do agente.
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';

const ROOT = process.cwd();

async function img(file, w = 760) {
  const buf = await sharp(`${ROOT}/${file}`)
    .resize({ width: w, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

const primitives = [
  { name: 'AppCard', tag: 'Novo', desc: 'Primitiva de Card unificadora. 6 variantes — default, elevated, interactive, tinted, accent, outline. Substitui 259 Cards inline em 63 arquivos. <em>tone</em> + <em>tone2</em> (two-tone teal+cobre) e <em>glow</em> (sombra colorida).' },
  { name: 'GradientButton', tag: 'Novo', desc: 'Botão com gradiente teal de marca garantido. Elimina 13+ duplicações inline do containedPrimary.' },
  { name: 'SeverityBadge', tag: 'Acessível', desc: 'Severidade por emoji + texto + tom (🟠 Moderada, 🟡 Leve) — não só cor. Legível por contraste e leitor de tela.' },
  { name: 'ExamMarker', tag: 'Unificado', desc: 'Item de marcador alterado compartilhado paciente↔médico: acento + badge + ref + valor + status + ValueBar. ~85% de código duplicado eliminado.' },
  { name: 'TrendsChart', tag: 'Unificado', desc: 'Gráfico de tendências extraído para primitiva única. Paciente e médico renderizam o MESMO gráfico.' },
  { name: 'Cores & tipos', tag: 'Refinado', desc: 'Vermelhos off-brand → error; roxos de IA/premium → indigo premium (26 ocorrências em 11 arquivos). fontSizes decimais → inteiros.' },
];

const screens = [
  { group: 'Paciente', file: 'chg-01-landing-mobile.png', title: 'Landing',
    changes: [['Refinado','Cores de IA/premium unificadas (indigo consistente)'],['Novo','Hero e cards de destaque com AppCard two-tone']] },
  { group: 'Paciente', file: 'chg-02b-login-form-mobile.png', title: 'Entrar / Login',
    changes: [['Refinado','Botão primário com GradientButton (gradiente teal de marca)'],['Refinado','Layout e espaçamento refinados']] },
  { group: 'Paciente', file: 'chg-03-dashboard-mobile.png', title: 'Dashboard',
    changes: [['Novo','CurrentStateCard, HealthSummary e CreditsCard agora usam AppCard'],['Novo','Hero de Score com glow; cards two-tone teal+cobre']] },
  { group: 'Paciente', file: 'chg-04-alterados-mobile.png', title: 'Valores Alterados',
    changes: [['Acessível','SeverityBadge (🟠🟡 + Moderada/Leve) em cada marcador'],['Refinado','Cards achatados — sem Card-in-Card'],['Acessível','Status em texto: “↑ Acima da ref.” / “↓ Abaixo”'],['Unificado','ExamMarker — mesma primitiva do médico']] },
  { group: 'Paciente', file: 'chg-05-tendencias-mobile.png', title: 'Tendências',
    changes: [['Unificado','TrendsChart — mesmo gráfico do portal do médico']] },
  { group: 'Paciente', file: 'chg-06-relatorio-mobile.png', title: 'Relatório IA',
    changes: [['Novo','ReportHero — cabeçalho hero two-tone teal+cobre'],['Refinado','Tipografia e hierarquia refinadas']] },
  { group: 'Médico', file: 'chg-07-doctor-portal-entry-mobile.png', title: 'Portal · Pacientes',
    changes: [['Refinado','Lista de pacientes com selos de alerta por severidade']] },
  { group: 'Médico', file: 'chg-08-doctor-alterados-mobile.png', title: 'Médico · Alterados',
    changes: [['Unificado','ExamMarker + SeverityBadge — IDÊNTICO ao app do paciente (−50 linhas)'],['Acessível','Severidade por emoji + texto + tom']] },
  { group: 'Médico', file: 'chg-09-doctor-tendencias-mobile.png', title: 'Médico · Tendências',
    changes: [['Unificado','TrendsChart — IDÊNTICO ao app do paciente (−87 linhas)']] },
];

const TAG_STYLE = {
  'Novo':      'novo',
  'Unificado': 'unif',
  'Refinado':  'refi',
  'Acessível': 'aces',
};

const dataUri = {};
for (const s of screens) dataUri[s.file] = await img(s.file);

const primitiveCard = (p) => `
  <article class="prim">
    <div class="prim-head"><span class="tag ${TAG_STYLE[p.tag]}">${p.tag}</span><h3>${p.name}</h3></div>
    <p>${p.desc}</p>
  </article>`;

const screenCard = (s) => `
  <article class="shot">
    <div class="shot-img"><img alt="${s.title}" src="${dataUri[s.file]}"></div>
    <div class="shot-meta">
      <h3>${s.title}</h3>
      <ul class="changes">
        ${s.changes.map(([t,c]) => `<li><span class="tag ${TAG_STYLE[t]}">${t}</span><span>${c}</span></li>`).join('')}
      </ul>
    </div>
  </article>`;

const html = `<style>
  :root{
    --bg:#eef7f6; --paper:#ffffff; --paper-2:#f4fafa; --text:#2d3748; --dim:#5b6b7a;
    --border:#e1ece8; --teal:#20b2aa; --teal-d:#178f89; --cobre:#d4a574; --premium:#6366f1;
    --chip-novo-bg: rgba(32,178,170,.14); --chip-novo-fg:#0f6e68;
    --chip-unif-bg: rgba(99,102,241,.14); --chip-unif-fg:#4250e0;
    --chip-refi-bg: rgba(212,165,116,.22); --chip-refi-fg:#8a5a1f;
    --chip-aces-bg: rgba(56,142,60,.16); --chip-aces-fg:#2e6b32;
    --shadow: 0 1px 2px rgba(15,40,40,.04), 0 8px 24px rgba(15,40,40,.06);
  }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --bg:#0f1818; --paper:#1a2424; --paper-2:#15201f; --text:#e8eef0; --dim:#94a8a6;
      --border:#27332f; --teal:#20b2aa; --teal-d:#5fc9c3; --cobre:#d4a574; --premium:#818cf8;
      --chip-novo-bg: rgba(32,178,170,.20); --chip-novo-fg:#7fe3dc;
      --chip-unif-bg: rgba(129,140,248,.18); --chip-unif-fg:#b4bdfb;
      --chip-refi-bg: rgba(212,165,116,.20); --chip-refi-fg:#e6c39a;
      --chip-aces-bg: rgba(102,187,106,.18); --chip-aces-fg:#9edca2;
      --shadow: 0 1px 2px rgba(0,0,0,.3), 0 10px 30px rgba(0,0,0,.34);
    }
  }
  :root[data-theme="dark"]{
    --bg:#0f1818; --paper:#1a2424; --paper-2:#15201f; --text:#e8eef0; --dim:#94a8a6;
    --border:#27332f; --teal-d:#5fc9c3; --premium:#818cf8;
    --chip-novo-bg: rgba(32,178,170,.20); --chip-novo-fg:#7fe3dc;
    --chip-unif-bg: rgba(129,140,248,.18); --chip-unif-fg:#b4bdfb;
    --chip-refi-bg: rgba(212,165,116,.20); --chip-refi-fg:#e6c39a;
    --chip-aces-bg: rgba(102,187,106,.18); --chip-aces-fg:#9edca2;
    --shadow: 0 1px 2px rgba(0,0,0,.3), 0 10px 30px rgba(0,0,0,.34);
  }
  *{box-sizing:border-box;}
  body{margin:0;background:var(--bg);color:var(--text);
    font-family:Inter,'Segoe UI',system-ui,-apple-system,Roboto,sans-serif;
    font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased;font-feature-settings:"cv02","cv03","cv04";}
  .wrap{max-width:880px;margin:0 auto;padding:40px 22px 80px;}
  h1,h2,h3,.display{font-family:Poppins,'Segoe UI',system-ui,-apple-system,sans-serif;line-height:1.2;}
  .eyebrow{font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--teal-d);margin:0 0 8px;}
  header.hero{margin-bottom:34px;}
  .version-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px;}
  .ver-chip{font-family:Poppins,'Segoe UI',system-ui,sans-serif;font-weight:700;font-size:13px;color:#fff;
    background:linear-gradient(135deg,var(--teal),var(--teal-d));padding:5px 12px;border-radius:999px;letter-spacing:.02em;}
  .ver-meta{font-size:13px;color:var(--dim);}
  h1{font-size:30px;margin:0 0 12px;letter-spacing:-.01em;text-wrap:balance;}
  .thesis{font-size:16.5px;color:var(--dim);max-width:62ch;margin:0 0 22px;}
  .thesis b{color:var(--text);}
  .stats{display:flex;flex-wrap:wrap;gap:10px;}
  .stat{background:var(--paper);border:1px solid var(--border);border-radius:12px;padding:10px 14px;box-shadow:var(--shadow);}
  .stat b{display:block;font-family:Poppins,system-ui,sans-serif;font-size:20px;color:var(--teal-d);line-height:1.1;}
  .stat span{font-size:12px;color:var(--dim);}
  section{margin-top:46px;}
  h2{font-size:22px;margin:0 0 4px;display:flex;align-items:center;gap:10px;}
  h2 .ico{font-size:20px;}
  .sec-sub{color:var(--dim);font-size:14px;margin:0 0 20px;}
  .prim-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;}
  .prim{background:var(--paper);border:1px solid var(--border);border-radius:14px;padding:16px 16px 14px;box-shadow:var(--shadow);}
  .prim-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
  .prim-head h3{font-size:15px;margin:0;}
  .prim p{margin:0;font-size:13.5px;color:var(--dim);}
  .prim p em{font-style:normal;color:var(--text);font-weight:600;}
  .shots{display:flex;flex-direction:column;gap:22px;}
  .shot{background:var(--paper);border:1px solid var(--border);border-radius:16px;overflow:hidden;box-shadow:var(--shadow);
    display:grid;grid-template-columns:minmax(0,1fr);}
  @media(min-width:760px){ .shot{grid-template-columns:300px minmax(0,1fr);} }
  .shot-img{background:var(--paper-2);display:flex;justify-content:center;align-items:flex-start;padding:14px;border-bottom:1px solid var(--border);}
  @media(min-width:760px){ .shot-img{border-bottom:0;border-right:1px solid var(--border);} }
  .shot-img img{display:block;width:100%;max-width:272px;height:auto;border-radius:14px;border:1px solid var(--border);}
  .shot-meta{padding:18px 20px;}
  .shot-meta h3{font-size:16px;margin:0 0 12px;}
  ul.changes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;}
  ul.changes li{display:flex;align-items:flex-start;gap:9px;font-size:14px;}
  ul.changes li > span:last-child{flex:1;color:var(--text);}
  .tag{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
    padding:3px 7px;border-radius:6px;white-space:nowrap;margin-top:1px;flex:none;}
  .tag.novo{background:var(--chip-novo-bg);color:var(--chip-novo-fg);}
  .tag.unif{background:var(--chip-unif-bg);color:var(--chip-unif-fg);}
  .tag.refi{background:var(--chip-refi-bg);color:var(--chip-refi-fg);}
  .tag.aces{background:var(--chip-aces-bg);color:var(--chip-aces-fg);}
  .group-divider{display:flex;align-items:center;gap:12px;margin:50px 0 20px;}
  .group-divider .ln{flex:1;height:1px;background:var(--border);}
  footer{margin-top:60px;padding-top:20px;border-top:1px solid var(--border);color:var(--dim);font-size:12.5px;}
  footer b{color:var(--text);}
  :focus-visible{outline:2px solid var(--teal-d);outline-offset:2px;border-radius:6px;}
  @media (prefers-reduced-motion: reduce){ *{animation:none!important;transition:none!important;} }
</style>
</head>
<body>
<div class="wrap">
  <header class="hero">
    <div class="version-row">
      <span class="ver-chip">v2.7.66 · build 305</span>
      <span class="ver-meta">commit 65386ed · 13/ago/2026</span>
    </div>
    <p class="eyebrow">Changelog visual</p>
    <h1>O que mudou nas telas do Dr. Exame</h1>
    <p class="thesis">Esta versão consolida o <b>design-system</b>. A mudança mais visível: <b>paciente e médico passam a compartilhar as mesmas primitivas</b> — heros com two-tone teal+cobre e glow, <b>SeverityBadge</b> acessível em todos os marcadores, e o mesmo <b>gráfico de tendências</b> nas duas experiências.</p>
    <div class="stats">
      <div class="stat"><b>6</b><span>primitivas de DS</span></div>
      <div class="stat"><b>9</b><span>telas mapeadas</span></div>
      <div class="stat"><b>43</b><span>arquivos (+504/−378)</span></div>
      <div class="stat"><b>259</b><span>Cards unificados</span></div>
    </div>
  </header>

  <section>
    <p class="eyebrow">A base</p>
    <h2>Primitivas do design-system</h2>
    <p class="sec-sub">Os componentes novos que sustentam todas as telas abaixo.</p>
    <div class="prim-grid">${primitives.map(primitiveCard).join('')}</div>
  </section>

  <div class="group-divider"><span class="eyebrow" style="margin:0">👤 Paciente</span><span class="ln"></span></div>
  <div class="shots">${screens.filter(s=>s.group==='Paciente').map(screenCard).join('')}</div>

  <div class="group-divider"><span class="eyebrow" style="margin:0">🩺 Médico</span><span class="ln"></span></div>
  <div class="shots">${screens.filter(s=>s.group==='Médico').map(screenCard).join('')}</div>

  <footer>
    <b>Como ler:</b> cada card mostra a tela atual (build 305) e as mudanças visuais específicas desta versão, marcadas por tipo —
    <span class="tag novo">Novo</span> <span class="tag unif">Unificado</span> <span class="tag refi">Refinado</span> <span class="tag aces">Acessível</span>.
    Screenshots capturados no app local (mobile 390px). Tema claro/escuro segue o seu sistema.
  </footer>
</div>`;

writeFileSync(`${ROOT}/changelog-v305.html`, html);
console.log('OK changelog-v305.html', (html.length / 1024).toFixed(0) + 'KB');
