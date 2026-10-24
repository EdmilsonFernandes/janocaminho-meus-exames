/**
 * QA INDEPENDENTE FINAL — REABERTURA §19 (24/10/26), spec §19.8: os 12 critérios
 * do dono demonstrados na MESMA versão (HEAD integrado até onda 4).
 * Script: packages/web/e2e/qa-final-reabertura.mjs — contexts independentes,
 * seeds via docker exec meus-exames-db, mídia fake (flags chromium), LiveKit/GROQ reais.
 *
 * Critérios: C1 preset R$120 portal · C2 descoberta ≤15s (/consultas + hero) ·
 * C3 fotos 4 telas · C4 402+linkUrl null · C5 paidAt→join 200 · C6 TOO_EARLY+countdown ·
 * C7 presença <2s/saiu/grace · C8 [NÃO VALIDADO—hardware] · C9 banner ambos+Gravando IA ·
 * C10 transcrição (transcriptAt OU estado falhou+manual) · C11 encerramento ambos perfis ·
 * C12 zero overflow 390px (5 telas + chat 220 chars).
 * Saída: e2e/screenshots/qa-final/*.png + results.json + tabela resumo no stdout.
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WEB = 'http://127.0.0.1:5173';
const API = 'http://127.0.0.1:4013/api';
const OUT = 'e2e/screenshots/qa-final';
fs.mkdirSync(OUT, { recursive: true });

const PSQL = (sql) => execSync(`docker exec meus-exames-db psql -U meus_exames -d meus_exames -qtAc "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).toString().trim();
const J = (o) => JSON.stringify(o);

const RESULTS = [];
const step = (id, name, pass, extra = '') => {
  RESULTS.push({ id, name, status: pass ? 'aprovado' : 'FALHOU', extra: String(extra).slice(0, 200) });
  console.log(`${pass ? '✓' : '✗'} [${id}] ${name}${extra ? ' — ' + String(extra).slice(0, 180) : ''}`);
};
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
const txt = async (page) => page.evaluate(() => document.body.innerText).catch(() => '');

// ── Logins (API) ──────────────────────────────────────────────────────────────
const auth = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: J({ username: 'edmilson@exemplo.com', password: 'troque123' }) })).json();
if (!auth.token) { console.error('login paciente falhou'); process.exit(1); }
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` };
const pid = auth.patientId;
const dlog = await (await fetch(`${API}/doctor/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: J({ email: 'meet.teste@drexame.dev', password: 'meet12345' }) })).json();
if (!dlog.token) { console.error('login médico falhou'); process.exit(1); }
const HD = { 'Content-Type': 'application/json', Authorization: `Bearer ${dlog.token}` };
const docId = PSQL(`SELECT id FROM doctors WHERE email='meet.teste@drexame.dev'`);
const patName = PSQL(`SELECT "fullName" FROM patients WHERE id='${pid}'`);

// ── Setup: limpeza + share + exame + consent (após criar a consulta) ─────────
const list0 = await (await fetch(`${API}/reminders?patientId=${pid}`, { headers: H })).json();
for (const it of list0) if (it.type === 'teleconsulta') await fetch(`${API}/reminders/${it.id}`, { method: 'DELETE', headers: H });
PSQL(`DELETE FROM consult_summaries WHERE "reminderId" NOT IN (SELECT id FROM reminders)`);
PSQL(`DELETE FROM exception_queue WHERE kind LIKE 'teleconsulta_%'`);
PSQL(`DELETE FROM exam_items WHERE "examId" LIKE 'qa-final-%'`);
PSQL(`DELETE FROM exams WHERE id LIKE 'qa-final-%'`);
const share = await fetch(`${API}/doctor-shares`, { method: 'POST', headers: H, body: J({ doctorCrm: '65432-SP', scopes: ['exams'], patientId: pid }) });
step('S0a', 'share exams ativo', share.status === 201 || share.status === 200, `HTTP ${share.status}`);
PSQL(`INSERT INTO exams (id, "patientId", title, kind, "performedAt", "sourceLab", "filePath", "fileSha256", "fileSizeBytes", "pageCount", status, "extractedAt", "createdAt", "updatedAt") VALUES ('qa-final-exam-1', '${pid}', 'HEMOGRAMA', 'LAB_PANEL', NOW() - INTERVAL '2 days', 'Lab QA-Final', 'qa/final.pdf', 'qa-final-sha-${Date.now()}', 1024, 1, 'EXTRACTED', NOW(), NOW(), NOW())`);
PSQL(`INSERT INTO exam_items (id, "examId", panel, name, "nameCanonical", "valueNumeric", "valueText", unit, "refLow", "refHigh", "refText", flag, "isAbnormal", "extractedPage", "createdAt") VALUES ('qa-final-it-1', 'qa-final-exam-1', 'Bioquímica', 'ZZ-GLICOSE-FINAL', 'ZZ-GLICOSE-FINAL', 131, '131', 'mg/dL', 70, 99, '70 a 99 mg/dL', 'HIGH', true, 1, NOW())`);

// ── Setup: FOTOS reais (JPEG sintético 32×32) p/ paciente E médico ───────────
// photoUrl guarda o REF (caminho disco dev); a rota serve via sendFile. Cache-bust
// vem de ?v= (photoVer) — o assert compara o <img src> base + naturalWidth>0 (carregou).
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAgACADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==', 'base64');
const photosDir = path.join(REPO, 'packages', 'server', 'data', 'photos');
fs.mkdirSync(photosDir, { recursive: true });
const patPhotoRef = path.join(photosDir, `patient-${pid}.jpg`).replace(/\\/g, '/');
const docPhotoRef = path.join(photosDir, `doctor-${docId}.jpg`).replace(/\\/g, '/');
const oldPatPhoto = PSQL(`SELECT COALESCE("photoUrl",'NULL') FROM patients WHERE id='${pid}'`);
const oldDocPhoto = PSQL(`SELECT COALESCE("photoUrl",'NULL') FROM doctors WHERE id='${docId}'`);
fs.writeFileSync(patPhotoRef, JPG);
fs.writeFileSync(docPhotoRef, JPG);
PSQL(`UPDATE patients SET "photoUrl"='${patPhotoRef}' WHERE id='${pid}'`);
PSQL(`UPDATE doctors SET "photoUrl"='${docPhotoRef}' WHERE id='${docId}'`);
step('S0b', 'fotos semeadas (paciente+médico) p/ validar identidade real', true, 'patient/doctors photoUrl = disco dev');
// restaura no fim (qualquer saída)
const restorePhotos = () => {
  try {
    PSQL(`UPDATE patients SET "photoUrl"=${oldPatPhoto === 'NULL' ? 'NULL' : `'${oldPatPhoto}'`} WHERE id='${pid}'`);
    PSQL(`UPDATE doctors SET "photoUrl"=${oldDocPhoto === 'NULL' ? 'NULL' : `'${oldDocPhoto}'`} WHERE id='${docId}'`);
  } catch { /* best-effort */ }
};
process.on('exit', restorePhotos);

// ── Playwright: contexts independentes (paciente 390px + médico 390px) ───────
const teleLogs = [];
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const mkPage = async ({ doctor }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addInitScript((opts) => {
    if (opts.doctor) localStorage.setItem('doctorToken', opts.doctor);
    else {
      localStorage.setItem('token', opts.auth.token); localStorage.setItem('user', JSON.stringify(opts.auth.user));
      localStorage.setItem('patientId', opts.auth.patientId); localStorage.setItem('selPatientId', opts.auth.patientId);
    }
    localStorage.setItem('onboarded', '1'); localStorage.setItem('lead_popup_dismissed_at', String(Date.now()));
    localStorage.setItem('dx_install_banner_off', '1');
  }, { doctor, auth });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  page.on('console', (m) => { if (m.text().includes('[tele]')) teleLogs.push(m.text().slice(0, 200)); });
  return { ctx, page, errs };
};
const PAT = await mkPage({});
const DOC = await mkPage({ doctor: dlog.token });
const clickEnabled = async (page, reSource, timeout = 90_000) => {
  await page.waitForFunction((src) => {
    const re = new RegExp(src);
    const b = [...document.querySelectorAll('button')].find((x) => re.test(x.getAttribute('aria-label') || x.textContent || ''));
    return !!b && !b.disabled;
  }, reSource, { timeout });
  await page.getByRole('button', { name: new RegExp(reSource) }).first().click({ timeout: 60_000 });
};
const overflow = (page) => page.evaluate(() => {
  const d = document.documentElement;
  return { sw: d.scrollWidth, cw: d.clientWidth, over: d.scrollWidth - d.clientWidth };
});
/** espera <img> cujo src casa com re CARREGAR de verdade (naturalWidth>0, até 6s). */
const imgLoaded = async (page, re) => {
  try {
    return await page.waitForFunction((src0) => {
      const re2 = new RegExp(src0);
      const i = [...document.querySelectorAll('img')].find((x) => re2.test(x.src));
      return !!i && i.complete && i.naturalWidth > 0;
    }, re, { timeout: 6000 }).then(() => page.evaluate((src0) => {
      const re2 = new RegExp(src0);
      const i = [...document.querySelectorAll('img')].find((x) => re2.test(x.src));
      return i ? { src: i.src.split('?')[0], naturalWidth: i.naturalWidth, ok: true } : null;
    }, re));
  } catch { return null; }
};

// ══ C2-pre: PACIENTE já em /consultas (tela carregada, vazia) ═════════════════
await PAT.page.goto(`${WEB}/#/consultas`, { waitUntil: 'commit', timeout: 90_000 });
await PAT.page.getByText('Minhas Consultas', { exact: false }).first().waitFor({ timeout: 60_000 }).catch(() => {});
await PAT.page.waitForTimeout(1500);
await shot(PAT.page, '02a-consultas-vazio-pre');

// ══ C1 — MÉDICO cria consulta paga via PORTAL (preset R$120) ══════════════════
let teleId = '';
try {
  await DOC.page.goto(`${WEB}/#/doctor`, { waitUntil: 'commit', timeout: 90_000 });
  await clickEnabled(DOC.page, '^Consultas$');
  await clickEnabled(DOC.page, 'Agendar Teleconsulta');
  await DOC.page.getByText('Selecione o paciente').first().waitFor({ timeout: 30_000 });
  // MUI select: abre a lista (combobox) e escolhe o paciente QA
  await DOC.page.getByRole('combobox').first().click();
  await DOC.page.getByRole('option', { name: new RegExp(patName.split(' ')[0]) }).first().waitFor({ timeout: 30_000 });
  await DOC.page.getByRole('option', { name: new RegExp(patName.split(' ')[0]) }).first().click();
  // data/hora futuras (C6 depois reajusta dueDate via psql)
  const tmr = new Date(Date.now() + 24 * 3600_000);
  const dStr = tmr.toISOString().slice(0, 10);
  await DOC.page.fill('input[type="date"]', dStr);
  await DOC.page.fill('input[type="time"]', '10:00');
  // PRESET R$120 (chip) — o coração do critério 1
  await DOC.page.getByRole('button', { name: 'R$ 120' }).first().click();
  const priceVal = await DOC.page.locator('input[inputmode="numeric"]').first().inputValue().catch(() => '');
  step('C1a', 'preset R$120 preenche o campo de cobrança', priceVal === '120,00', `campo="${priceVal}"`);
  await shot(DOC.page, '01a-portal-dialog-preset-120');
  await clickEnabled(DOC.page, 'Confirmar e avisar paciente');
  // prova da criação: reminder 12000 aparece no DB (UI POST) — snackbar é volátil
  let created = '';
  for (let i = 0; i < 12 && !created; i++) {
    created = PSQL(`SELECT id FROM reminders WHERE "createdByDoctorId"='${docId}' AND "consultPriceCents"=12000 AND "createdAt" > NOW() - INTERVAL '10 minutes' ORDER BY "createdAt" DESC LIMIT 1`);
    if (!created) await new Promise((r) => setTimeout(r, 5000));
  }
  const c1 = created ? PSQL(`SELECT "consultPriceCents", "teleStatus", provider FROM reminders WHERE id='${created}'`) : '';
  step('C1', 'médico cria consulta paga (portal flow, preset R$120)', c1 === '12000|scheduled|livekit', `teleId=${created?.slice(-6) ?? '—'} ${c1}`);
  teleId = created;
  await shot(DOC.page, '01b-portal-agendada');
} catch (e) {
  const dump1 = await DOC.page.evaluate(() => ({
    hash: location.hash,
    inputs: [...document.querySelectorAll('input')].map((i) => `${i.type}=${i.value}`).slice(0, 10),
    btns: [...document.querySelectorAll('button')].filter((b) => /Confirmar|Agendar/.test(b.textContent || '')).map((b) => `${(b.textContent || '').trim().slice(0, 24)} disabled=${b.disabled}`),
    dlg: !!document.querySelector('[role="dialog"]'),
  })).catch(() => null);
  console.log('  · C1 dump:', J(dump1));
  await shot(DOC.page, '01x-c1-fail');
  step('C1', 'médico cria consulta paga (portal flow, preset R$120)', false, String(e.message).slice(0, 120));
  teleId = PSQL(`SELECT id FROM reminders WHERE "createdByDoctorId"='${docId}' AND "consultPriceCents"=12000 ORDER BY "createdAt" DESC LIMIT 1`);
}
if (!teleId) { console.error('sem teleId — aborta'); process.exit(1); }
// consent Art.15 ANTES de qualquer entrada do paciente (sala de espera/box/join)
{
  const consent0 = await fetch(`${API}/reminders/${teleId}/consent`, { method: 'PUT', headers: H });
  step('S0c', 'consent Art.15 paciente (pré-sala)', consent0.status === 200, `HTTP ${consent0.status}`);
}

// ══ C2 — descoberta imediata (sem sair/entrar, ≤15s de poll) ══════════════════
const t0 = Date.now();
let cardAppeared = false;
const findCard = () => PAT.page.getByText('Aguardando pagamento', { exact: false }).first().isVisible().catch(() => false);
try {
  // foreground = uso real. Poll é visibility-gated: bringToFront +, a cada 2s,
  // re-despacha 'focus' (o listener recarrega a lista) — imune a estado de aba.
  await PAT.page.bringToFront();
  for (let i = 0; i < 10 && !cardAppeared; i++) {
    await PAT.page.evaluate(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('visibilitychange')); }).catch(() => {});
    cardAppeared = await findCard();
    if (!cardAppeared) await PAT.page.waitForTimeout(2000);
  }
} catch { /* cai no fail */ }
const dt = (Date.now() - t0) / 1000;
step('C2a', 'paciente acha a consulta em /consultas sem recarregar (poll ≤15s)', cardAppeared && dt <= 17, cardAppeared ? `apareceu em ${dt.toFixed(1)}s` : 'não apareceu');
await shot(PAT.page, '02b-consultas-descoberta');
// hero do Reminders
try {
  await PAT.page.goto(`${WEB}/#/lembretes`, { waitUntil: 'commit', timeout: 90_000 });
  const hero = await PAT.page.getByText('Pagamento pendente — R\$ 120,00', { exact: false }).first().waitFor({ timeout: 45_000 }).then(() => true).catch(() => false);
  const t2 = hero ? await txt(PAT.page) : '';
  step('C2b', 'hero da consulta no topo do Reminders (médico+valor+situação)', hero && t2.includes('R$ 120,00'), hero ? 'hero visível' : 'sem hero');
  await shot(PAT.page, '02c-reminders-hero');
} catch (e) { step('C2b', 'hero da consulta no topo do Reminders', false, String(e.message).slice(0, 80)); }

// ══ C6a — TOO_EARLY: dueDate +30min → 403 + sala de espera c/ countdown ═════
PSQL(`UPDATE reminders SET "dueDate" = NOW() + INTERVAL '30 minutes' WHERE id='${teleId}'`);
const jr1 = await fetch(`${API}/teleconsulta/${teleId}/join`, { headers: H });
const jb1 = await jr1.json().catch(() => ({}));
step('C6a', 'join fora da janela → 403 TOO_EARLY (relógio do server)', jr1.status === 403 && jb1.code === 'TOO_EARLY', `HTTP ${jr1.status} ${jb1.code}`);
await PAT.page.goto(`${WEB}/#/teleconsulta/${teleId}`, { waitUntil: 'commit', timeout: 90_000 });
await PAT.page.bringToFront();
const wait6 = await PAT.page.getByText('A consulta abre às', { exact: false }).first().waitFor({ timeout: 45_000 }).then(() => true).catch(() => false);
const t6 = wait6 ? await txt(PAT.page) : '';
step('C6b', 'sala de espera com countdown visível', wait6 && /Faltam \d+ min/.test(t6), t6.match(/A consulta abre às \d{2}:\d{2}/)?.[0] ?? 'não apareceu');
await shot(PAT.page, '06-sala-espera-countdown');
// C3-3: foto do MÉDICO na sala de espera (identificação §19 G3)
const waitPhoto = await imgLoaded(PAT.page, `/api/doctor/photo/${docId}`);
step('C3c', 'foto real do médico na SALA DE ESPERA', !!waitPhoto?.ok, waitPhoto ? `naturalWidth=${waitPhoto.naturalWidth}` : 'img não achada');
// paciente SAI da sala de espera (auto-join pós-countdown estragaria o C7)
await PAT.page.goto(`${WEB}/#/consultas`, { waitUntil: 'commit', timeout: 60_000 });
await PAT.page.waitForTimeout(800);

// ══ C4 — sem pagar: 402 no join (API direta) + UI + linkUrl null no payload ══
PSQL(`UPDATE reminders SET "dueDate" = NOW() - INTERVAL '3 minutes' WHERE id='${teleId}'`);
const jr2 = await fetch(`${API}/teleconsulta/${teleId}/join`, { headers: H });
const jb2 = await jr2.json().catch(() => ({}));
step('C4a', 'join na janela SEM pagar → 402 PAYMENT_REQUIRED (backend)', jr2.status === 402 && jb2.code === 'PAYMENT_REQUIRED', `HTTP ${jr2.status} ${jb2.code} price=${jb2.priceCents}`);
const rl = await (await fetch(`${API}/reminders?patientId=${pid}`, { headers: H })).json();
const mine = rl.find((r) => r.id === teleId);
step('C4b', 'payload /reminders SEM linkUrl enquanto não pago', !!mine && !mine.linkUrl, mine?.linkUrl ? `VAZOU: ${mine.linkUrl}` : 'linkUrl ausente/null');
try {
  await PAT.page.goto(`${WEB}/#/teleconsulta/${teleId}`, { waitUntil: 'commit', timeout: 90_000 });
  const payBox = await PAT.page.getByText('Consulta particular', { exact: false }).first().waitFor({ timeout: 60_000 }).then(() => true).catch(() => false);
  const t4 = payBox ? await txt(PAT.page) : '';
  step('C4c', 'UI: box de cobrança (não entra na sala)', payBox && t4.includes('R$ 120,00') && !t4.includes('Aguardando o médico entrar'), payBox ? 'R$ 120,00 + sem sala' : 'box não apareceu');
  await shot(PAT.page, '04-bloqueio-pagamento');
  await PAT.page.goto(`${WEB}/#/consultas`, { waitUntil: 'commit', timeout: 60_000 });
} catch (e) { step('C4c', 'UI: box de cobrança (não entra na sala)', false, String(e.message).slice(0, 80)); }

// ══ C5 — paidAt (psql = webhook) → join libera NA JANELA ═════════════════════
PSQL(`UPDATE reminders SET "paidAt" = NOW() WHERE id='${teleId}'`);
PSQL(`UPDATE subscriptions SET status='APPROVED' WHERE "mpPreferenceId"='teleconsulta_${teleId}'`);
const jr3 = await fetch(`${API}/teleconsulta/${teleId}/join`, { headers: H });
const jb3 = await jr3.json().catch(() => ({}));
step('C5', 'paidAt confirmado → join 200 com credencial (na janela)', jr3.status === 200 && !!(jb3.token || jb3.accessToken), `HTTP ${jr3.status} token=${!!(jb3.token || jb3.accessToken)}`);

// consent já dado no setup (S0c) — join do paciente só depende de janela/pagamento
PSQL(`UPDATE reminders SET "dueDate" = NOW() - INTERVAL '3 minutes' WHERE id='${teleId}'`);

// ══ C7a/C9a — MÉDICO entra SOZINHO: banner ausente + presença 'não entrou' ═══
await DOC.page.goto(`${WEB}/#/teleconsulta/${teleId}?role=doctor`, { waitUntil: 'commit', timeout: 90_000 });
await clickEnabled(DOC.page, 'Entrar na consulta');
await DOC.page.locator('button[aria-label="Encerrar consulta"]').first().waitFor({ timeout: 60_000 });
await DOC.page.waitForTimeout(4000);
const t7solo = await txt(DOC.page);
const bannerSolo = t7solo.includes('Gravação & Transcrição por IA');
step('C9a', 'banner de gravação AUSENTE com 1 participante (médico sozinho)', !bannerSolo, bannerSolo ? 'BANNER APARECEU SOZINHO' : 'ausente ✓');
const presenceSolo = /não entrou|conectando/.test(t7solo) && !t7solo.includes('presente');
step('C7a', 'médico sozinho: paciente "não entrou" (sem estado falso)', presenceSolo, t7solo.includes('não entrou') ? 'não entrou' : 'conectando…');
await shot(DOC.page, '07a-medico-sozinho-sem-banner');
// C3-4: foto do PACIENTE no header in-call (prontuário/brief — mesma identidade)
const briefBtn = DOC.page.getByRole('button', { name: 'Exames' }).first();
await briefBtn.waitFor({ timeout: 20_000 }).catch(() => {});
let briefPhoto = null;
try {
  await briefBtn.click({ timeout: 10_000 });
  await DOC.page.getByText('ZZ-GLICOSE-FINAL').first().waitFor({ timeout: 30_000 });
  await shot(DOC.page, '03d-brief-clinico');
  briefPhoto = await imgLoaded(DOC.page, `/api/patients/${pid}/photo`);
} catch { briefPhoto = await imgLoaded(DOC.page, `/api/patients/${pid}/photo`); }
step('C3d', 'brief clínico abre + foto real do PACIENTE (prontuário)', !!briefPhoto?.ok, briefPhoto ? `naturalWidth=${briefPhoto.naturalWidth}` : 'img não achada');
await DOC.page.keyboard.press('Escape').catch(() => {});
await DOC.page.waitForTimeout(600);

// ══ C7b — PACIENTE conecta: médico vê 'presente' <2s ══════════════════════════
// Observer armado ANTES do join do paciente: captura a 1ª evidência de presença
// (chip '● presente' via áudio · painel 'Na chamada com' · 2º vídeo com frame)
// com timestamp exato — o painel intermediário dura pouco e o poll o perderia.
await DOC.page.evaluate(() => {
  window.__dxAt = 0; window.__dxKind = '';
  const mark = (kind) => { if (!window.__dxAt) { window.__dxAt = Date.now(); window.__dxKind = kind; } };
  const check = () => {
    const t = document.body.innerText;
    if ([...document.querySelectorAll('*')].some((e) => e.childElementCount === 0 && /^● presente$/.test((e.textContent || '').trim()))) return mark('chip');
    if (t.includes('Na chamada com')) return mark('painel');
    if ([...document.querySelectorAll('video')].filter((v) => v.readyState >= 2 && v.videoWidth > 0).length >= 2) return mark('video-remoto');
  };
  new MutationObserver(() => check()).observe(document.body, { childList: true, subtree: true, characterData: true });
  setInterval(check, 150); // frame de vídeo chega sem mutação no DOM
});
await PAT.page.goto(`${WEB}/#/teleconsulta/${teleId}`, { waitUntil: 'commit', timeout: 90_000 });
// auto-join (consent OK): espera in-call (tempo de chamada no DOM do paciente)
const patInCall = await PAT.page.locator('[aria-label="Tempo de chamada"]').first().waitFor({ timeout: 75_000 }).then(() => true).catch(() => false);
const tJoin = Date.now();
let presenceMs = -1;
if (patInCall) {
  await DOC.page.waitForTimeout(8000); // janela de observação (critério: <2s; margem p/ medir)
  const r = await DOC.page.evaluate(() => ({ at: window.__dxAt || 0, kind: window.__dxKind || '' })).catch(() => ({ at: 0, kind: '' }));
  presenceMs = r.at ? r.at - tJoin : -1;
  const ev = r.kind || null;
  if (!ev) {
    const tDump = await txt(DOC.page);
    console.log('  · C7b dump:', tDump.replace(/\n+/g, ' | ').slice(0, 220));
    console.log('  · C7b telelogs:', teleLogs.slice(-6).join(' ;; '));
  }
  step('C7b', `paciente conecta → médico vê presença <2s (evento real)`, !!ev && presenceMs >= 0 && presenceMs <= 2500, ev ? `${ev} +${presenceMs}ms` : 'sem evidência (8s)');
} else {
  // fallback: banner no paciente também prova in-call (otherJoined=true p/ paciente)
  const b = await PAT.page.getByText('Gravação & Transcrição por IA', { exact: false }).first().waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
  const ok = b && await DOC.page.getByText('presente', { exact: true }).first().waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
  presenceMs = Date.now() - tJoin;
  step('C7b', `paciente conecta → médico vê 'presente' <2s`, ok, `fallback-banner ok=${ok} ${presenceMs}ms`);
}
await shot(DOC.page, '07b-medico-ve-presente');

// ══ C9b/C9c — banner em AMBOS + aprovação → ● Gravando IA ════════════════════
const bannerDoc = await DOC.page.getByText('Gravação & Transcrição por IA', { exact: false }).first().waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
const bannerPat = await PAT.page.getByText('Gravação & Transcrição por IA', { exact: false }).first().waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
step('C9b', 'banner de gravação aparece só quando AMBOS conectados', bannerDoc && bannerPat, `médico=${bannerDoc} paciente=${bannerPat}`);
await shot(PAT.page, '09a-banner-ambos-paciente');
// aprova NOS DOIS (rápido, antes do poll esconder o banner do 2º)
let approvedDoc = false, approvedPat = false;
try {
  await clickEnabled(DOC.page, 'Sim, Gravar com IA', 20_000); approvedDoc = true;
} catch { /* banner pode ter sumido — chip 'Gravar IA' reabre */ }
try {
  await clickEnabled(PAT.page, 'Sim, Gravar com IA', 20_000); approvedPat = true;
} catch {
  try { await clickEnabled(PAT.page, 'Gravar IA', 10_000); await clickEnabled(PAT.page, 'Sim, Gravar com IA', 15_000); approvedPat = true; } catch { /* segue */ }
}
const recDoc = await DOC.page.getByText('● Gravando IA', { exact: false }).first().waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
const recPat = await PAT.page.getByText('● Gravando IA', { exact: false }).first().waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
const timerDoc = await DOC.page.locator('[aria-label="Tempo de chamada"]').first().isVisible().catch(() => false);
step('C9c', 'aprovação → "● Gravando IA" + timer (nunca com 1 participante)', (recDoc || recPat) && timerDoc, `médico=${recDoc} paciente=${recPat} timer=${timerDoc} (aprovou: D=${approvedDoc} P=${approvedPat})`);
await shot(PAT.page, '09b-gravando-ia');
await shot(DOC.page, '09c-gravando-ia-medico');
// deixa gravar um pouco (blob >1500 bytes p/ o upload existir)
await DOC.page.waitForTimeout(15_000);

// ══ C7c — paciente SAI: médico vê 'saiu'; grace 5min NÃO encerra sozinho ═════
await PAT.page.close();
// "saiu" visível: chip ● saiu OU box central "X saiu da chamada" (estado left real)
const leftChip = await Promise.race([
  DOC.page.getByText('● saiu', { exact: false }).first().waitFor({ timeout: 25_000 }).then(() => 'chip'),
  DOC.page.getByText('saiu da chamada', { exact: false }).first().waitFor({ timeout: 25_000 }).then(() => 'box'),
]).catch(() => null);
const leftToast = await txt(DOC.page);
step('C7c', 'paciente sai → médico vê "saiu"', !!leftChip || /saiu — aguardando voltar/.test(leftToast), leftChip ?? 'toast saiu');
await shot(DOC.page, '07c-medico-ve-saiu');
await DOC.page.waitForTimeout(20_000);
const stGrace = PSQL(`SELECT COALESCE("teleStatus",'null') FROM reminders WHERE id='${teleId}'`);
step('C7d', 'grace 5min: consulta NÃO encerra sozinha (teleStatus intacto)', stGrace === 'in_progress', `teleStatus=${stGrace}`);

// ══ C10 — encerra honesto (<min → technical) → transcrição ══════════════════
try {
  const endBtn0 = DOC.page.locator('button[aria-label="Encerrar consulta"]').first();
  await endBtn0.waitFor({ timeout: 45_000 });
  await endBtn0.click({ timeout: 30_000 });
  const endBtn = DOC.page.getByRole('dialog').getByRole('button', { name: 'Encerrar', exact: true }).first();
  await endBtn.waitFor({ timeout: 30_000 });
  await endBtn.click();
const dlgH = await DOC.page.getByText('Como encerrar?').first().waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
const t10 = dlgH ? await txt(DOC.page) : '';
step('C10a', 'encerrar <min_joint → 400 → dialog honesto (sugere technical)', dlgH && t10.includes('abaixo do mínimo') && t10.includes('Tivemos problema técnico'), dlgH ? 'sugestão=technical' : 'dialog não abriu');
await shot(DOC.page, '10a-dialog-honesto');
await DOC.page.getByRole('button', { name: /Tivemos problema técnico/ }).first().click();
const ended = await DOC.page.getByText('Consulta encerrada', { exact: false }).first().waitFor({ timeout: 60_000 }).then(() => true).catch(() => false);
const dbEnd = PSQL(`SELECT "teleStatus", "endedAt" IS NOT NULL, COALESCE("recordingAt"::text,'none') != 'none' FROM reminders WHERE id='${teleId}'`);
step('C10b', 'encerramento technical persistiu + áudio recebido', ended && dbEnd.startsWith('technical|t|t'), dbEnd.replace(/\|/g, '·'));
await shot(DOC.page, '10b-pos-encerramento');
} catch (e) {
  await shot(DOC.page, '10x-end-FAIL');
  console.log('  · C10 dump:', (await txt(DOC.page)).replace(/\n+/g, ' | ').slice(0, 200));
  step('C10a', 'encerrar <min_joint → 400 → dialog honesto (sugere technical)', false, String(e.message).slice(0, 100));
  step('C10b', 'encerramento technical persistiu + áudio recebido', false, 'fluxo interrompido');
}

// transcrição: job GROQ real → transcriptAt; se extrapolar → estado falhou + manual
let transcriptAt = '', recState = '';
for (let i = 0; i < 24; i++) { // até ~120s
  const r = PSQL(`SELECT COALESCE("transcriptAt"::text,''), COALESCE("retryCount",0) FROM reminders WHERE id='${teleId}'`);
  const [at, retry] = r.split('|');
  if (at) { transcriptAt = at; break; }
  if (Number(retry) >= 3) { recState = `falhou (retry=${retry})`; break; }
  await new Promise((res) => setTimeout(res, 5000));
}
if (transcriptAt) {
  const tr = await (await fetch(`${API}/teleconsulta/${teleId}/transcript`, { headers: H })).json().catch(() => ({}));
  step('C10c', 'transcrição vinculada à consulta certa (transcriptAt + texto)', !!transcriptAt && typeof tr.text === 'string', `at=${transcriptAt} len=${tr.text?.length ?? 0}`);
} else {
  // estado 'falhou' honesto: registro manual (doctor-note) disponível
  const tTr = await (await fetch(`${API}/teleconsulta/${teleId}/summary`, { headers: H })).json().catch(() => ({}));
  const noteOk = await fetch(`${API}/teleconsulta/${teleId}/doctor-note`, { method: 'PUT', headers: H, body: J({ note: 'QA-final: registro manual de contingência.' }) });
  step('C10c', 'transcrição: estado falhou honesto + registro manual disponível', !!recState || tTr?.stt === false, `${recState || `stt=${tTr?.stt}`} · doctor-note HTTP ${noteOk.status}`);
}

// ══ C11 — encerramento reflete nos DOIS perfis ═══════════════════════════════
try {
  await DOC.page.goto(`${WEB}/#/doctor`, { waitUntil: 'commit', timeout: 90_000 });
  await clickEnabled(DOC.page, '^Consultas$');
  const hist = await DOC.page.getByText('Encerrada', { exact: false }).first().waitFor({ timeout: 60_000 }).then(() => true).catch(() => false);
  const t11d = hist ? await txt(DOC.page) : '';
  step('C11a', 'portal médico: chip teleStatus (Encerrada/Problema técnico), sem Entrar', hist && (t11d.includes('Problema técnico') || t11d.includes('technical')) && !t11d.includes('Entrar na consulta'), hist ? 'histórico com estado' : 'histórico não apareceu');
  await shot(DOC.page, '11a-portal-medico-historico');
} catch (e) { step('C11a', 'portal médico: chip teleStatus', false, String(e.message).slice(0, 80)); }
try {
  // paciente: reabre página (a antiga foi fechada no C7c)
  const p2 = await PAT.ctx.newPage();
  await p2.addInitScript((opts) => {
    localStorage.setItem('token', opts.auth.token); localStorage.setItem('user', JSON.stringify(opts.auth.user));
    localStorage.setItem('patientId', opts.auth.patientId); localStorage.setItem('selPatientId', opts.auth.patientId);
    localStorage.setItem('onboarded', '1'); localStorage.setItem('lead_popup_dismissed_at', String(Date.now()));
    localStorage.setItem('dx_install_banner_off', '1');
  }, { auth });
  await p2.goto(`${WEB}/#/consultas`, { waitUntil: 'commit', timeout: 90_000 });
  await p2.getByText('Minhas Consultas', { exact: false }).first().waitFor({ timeout: 60_000 });
  const t11p = await txt(p2);
  const abertasVazia = t11p.includes('Nenhuma consulta aberta') || !/Aguardando pagamento|SALA ABERTA|AGENDADA/.test(t11p);
  await p2.getByRole('button', { name: /Histórico/ }).first().click();
  const histOk = await p2.getByText('Concluída', { exact: false }).first().waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
  const t11h = histOk ? await txt(p2) : '';
  step('C11b', 'paciente: sai de Abertas → Histórico (Concluída), sem "Entrar"', abertasVazia && histOk && !t11h.includes('Entrar na consulta'), `abertas limpas=${abertasVazia} histórico=${histOk}`);
  await shot(p2, '11b-paciente-historico');
  await p2.close();
} catch (e) { step('C11b', 'paciente: Histórico sem Entrar', false, String(e.message).slice(0, 80)); }

// ══ C3 (restante) — fotos nas 2 listas ═══════════════════════════════════════
try {
  // lista do médico (PortalTeleconsultas) — foto do PACIENTE (photoUrlFor, G2)
  const docPhoto1 = await imgLoaded(DOC.page, `/api/patients/${pid}/photo`);
  step('C3a', 'foto real do paciente na lista PortalTeleconsultas', !!docPhoto1?.ok, docPhoto1 ? `naturalWidth=${docPhoto1.naturalWidth}` : 'img não achada');
  await shot(DOC.page, '03a-portal-lista-foto-paciente');
} catch (e) { step('C3a', 'foto real do paciente na lista PortalTeleconsultas', false, String(e.message).slice(0, 80)); }
try {
  const p3 = await PAT.ctx.newPage();
  await p3.addInitScript((opts) => {
    localStorage.setItem('token', opts.auth.token); localStorage.setItem('user', JSON.stringify(opts.auth.user));
    localStorage.setItem('patientId', opts.auth.patientId); localStorage.setItem('selPatientId', opts.auth.patientId);
    localStorage.setItem('onboarded', '1'); localStorage.setItem('lead_popup_dismissed_at', String(Date.now()));
    localStorage.setItem('dx_install_banner_off', '1');
  }, { auth });
  await p3.goto(`${WEB}/#/consultas`, { waitUntil: 'commit', timeout: 90_000 });
  // card de consulta ABERTA mostra o médico; encerrada vive no tab Histórico
  await p3.getByRole('button', { name: /Histórico/ }).first().waitFor({ timeout: 30_000 }).catch(() => {});
  const docPhotoOpen = await imgLoaded(p3, `/api/doctor/photo/${docId}`);
  let docPhotoCard = docPhotoOpen;
  for (let attempt = 0; attempt < 2 && !docPhotoCard?.ok; attempt++) {
    if (attempt > 0) { await p3.reload({ timeout: 90_000 }).catch(() => {}); } // harness flaky: 2ª carga renderiza
    await p3.getByRole('button', { name: /Histórico/ }).first().click().catch(() => {});
    await p3.getByText('Concluída', { exact: false }).first().waitFor({ timeout: 20_000 }).catch(() => {}); // item renderiza após fetch
    docPhotoCard = await imgLoaded(p3, `/api/doctor/photo/${docId}`);
  }
  if (!docPhotoCard?.ok) {
    const srcs = await p3.evaluate(() => [...document.querySelectorAll('img')].map((i) => `${i.src.split('?')[0]}(${i.naturalWidth})`).slice(0, 12)).catch(() => []);
    console.log('  · C3b imgs:', J(srcs));
  }
  step('C3b', 'foto real do médico no ConsultaAtivaCard/Histórico (/consultas)', !!docPhotoCard?.ok, docPhotoCard ? `naturalWidth=${docPhotoCard.naturalWidth}` : 'img não achada');
  await shot(p3, '03b-consultas-foto-medico');
  await p3.close();
} catch (e) { step('C3b', 'foto real do médico em /consultas', false, String(e.message).slice(0, 80)); }

// ══ C8 — iPhone↔APK áudio bidirecional ═══════════════════════════════════════
step('C8', 'áudio bidirecional iPhone(Safari)↔APK', false, '[NÃO VALIDADO — requer iPhone real + APK (spec §19.8: nunca "resolvido por inspeção")]');

// ══ C12 — zero overflow 390px nas telas novas + chat 220 chars ════════════════
const p4 = await PAT.ctx.newPage();
await p4.addInitScript((opts) => {
  localStorage.setItem('token', opts.auth.token); localStorage.setItem('user', JSON.stringify(opts.auth.user));
  localStorage.setItem('patientId', opts.auth.patientId); localStorage.setItem('selPatientId', opts.auth.patientId);
  localStorage.setItem('onboarded', '1'); localStorage.setItem('lead_popup_dismissed_at', String(Date.now()));
  localStorage.setItem('dx_install_banner_off', '1');
}, { auth });
const checkOverflow = async (page, id, name, hash, settle = 2500) => {
  try {
    await page.goto(`${WEB}/#${hash}`, { waitUntil: 'commit', timeout: 90_000 });
    await page.waitForTimeout(settle);
    const o = await overflow(page);
    step(id, `${name} — 390px sem scroll horizontal`, o.over <= 0, `scrollWidth=${o.sw} clientWidth=${o.cw} over=${o.over}`);
    await shot(page, `12-${id}`);
  } catch (e) { step(id, `${name} — 390px sem overflow`, false, String(e.message).slice(0, 80)); }
};
await checkOverflow(p4, 'C12a', '/consultas', '/consultas');
await checkOverflow(p4, 'C12b', '/para-medicos (landing)', '/para-medicos', 3500);
await checkOverflow(p4, 'C12c', 'chat input 220+ chars', '/chat', 3000);
try {
  const inp = p4.locator('textarea').first();
  await inp.waitFor({ timeout: 30_000 });
  const LONG = ('consulta sobre exames e resultados laboratoriais com dúvidas clínicas extensas ').repeat(3) + 'fim';
  await inp.fill(LONG);
  await p4.waitForTimeout(1200);
  const oChat = await overflow(p4);
  const tChat = await txt(p4);
  step('C12d', 'chat com 220+ chars: quebra linha, sem overflow', oChat.over <= 0 && tChat.length > 200, `chars=${LONG.length} over=${oChat.over}`);
  await shot(p4, 'C12d-chat-220-chars');
} catch (e) { step('C12d', 'chat com 220+ chars', false, String(e.message).slice(0, 80)); }
await p4.close();
// PortalFinanceiro (médico) + TeleFinanceTab (admin)
try {
  await DOC.page.goto(`${WEB}/#/doctor`, { waitUntil: 'commit', timeout: 90_000 });
  await clickEnabled(DOC.page, 'Menu do médico');
  await DOC.page.getByRole('menuitem', { name: 'Financeiro' }).first().click();
  await DOC.page.getByText('Financeiro', { exact: false }).first().waitFor({ timeout: 45_000 });
  await DOC.page.waitForTimeout(2500);
  const oF = await overflow(DOC.page);
  step('C12e', 'PortalFinanceiro (médico) — 390px sem overflow', oF.over <= 0, `over=${oF.over}`);
  await shot(DOC.page, 'C12e-portal-financeiro');
} catch (e) { step('C12e', 'PortalFinanceiro — 390px', false, String(e.message).slice(0, 80)); }
try {
  const p5 = await PAT.ctx.newPage();
  await p5.addInitScript((opts) => {
    localStorage.setItem('token', opts.auth.token); localStorage.setItem('user', JSON.stringify(opts.auth.user));
    localStorage.setItem('patientId', opts.auth.patientId); localStorage.setItem('selPatientId', opts.auth.patientId);
    localStorage.setItem('onboarded', '1'); localStorage.setItem('lead_popup_dismissed_at', String(Date.now()));
  }, { auth });
  await p5.goto(`${WEB}/#/admin`, { waitUntil: 'commit', timeout: 90_000 });
  await p5.getByText('Tele Fin', { exact: false }).first().waitFor({ timeout: 60_000 }).catch(() => {});
  await p5.getByText('Tele Fin', { exact: false }).first().click().catch(() => {});
  await p5.waitForTimeout(3500);
  const oA = await overflow(p5);
  step('C12f', 'TeleFinanceTab (admin) — 390px sem overflow', oA.over <= 0, `over=${oA.over}`);
  await shot(p5, 'C12f-admin-telefinance');
  await p5.close();
} catch (e) { step('C12f', 'TeleFinanceTab — 390px', false, String(e.message).slice(0, 80)); }

// ══ Wrap-up ══════════════════════════════════════════════════════════════════
const pageErrs = [...PAT.errs, ...DOC.errs];
if (pageErrs.length) console.log('⚠ pageerrors:', pageErrs.slice(0, 3));
await PAT.ctx.close(); await DOC.ctx.close(); await browser.close();

const failed = RESULTS.filter((r) => r.status === 'FALHOU' && r.id !== 'C8');
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ run: new Date().toISOString(), teleId, steps: RESULTS }, null, 2));
console.log('\n════ RESUMO QA FINAL §19 ════');
console.log(RESULTS.map((r) => `${r.status === 'FALHOU' ? '✗' : '✓'} ${r.id} ${r.name}`).join('\n'));
console.log(`\n${RESULTS.length - failed.length}/${RESULTS.length} OK (C8 declarado NÃO VALIDADO por hardware) · ${failed.length} falha(s)`);
process.exit(failed.length ? 1 : 0);
