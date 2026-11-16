/**
 * Helpers da jornada E2E do paciente (16/11/26).
 * Usuário NOVO via API (register → OTP local → verify-email → login), PDF sintético
 * e autenticação no browser. Nenhuma credencial real: tudo gerado por execução.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { APIRequestContext, Page } from '@playwright/test';

export const API = process.env.E2E_API_URL || 'http://127.0.0.1:4001/api';

/** CPF válido (dígitos verificadores mod-11) — sintético, não pertence a ninguém. */
export function cpfValido(): string {
  const n: number[] = Array.from({ length: 9 }, () => Math.floor(Math.random() * 9));
  const dv = (base: number[]): number => {
    let s = 0;
    for (let i = 0; i < base.length; i++) s += base[i] * (base.length + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(n);
  const m = [...n, d1];
  return [...m, dv(m)].join('');
}

/** PDF mínimo VÁLIDO (xref correto) com um laudo sintético realista em pt-BR.
 *  O pipeline de extração roda pdftotext → GLM: as linhas abaixo são suficientes
 *  para o leitor achar marcadores com valor + referência. Dados 100% fictícios. */
export function buildPdfExame(seed = Date.now()): Buffer {
  const lines = [
    'LABORATORIO E2E - RESULTADOS DE EXAMES LABORATORIAIS',
    `Paciente: Teste E2E ${seed}          Data de coleta: 15/11/2026`,
    '',
    'HEMOGRAMA COMPLETO',
    'Hemoglobina           14,2 g/dL        Ref: 13,0 - 17,0',
    'Hematocrito           42,5 %           Ref: 40,0 - 50,0',
    'Leucocitos            6.800 /mm3       Ref: 4.000 - 10.000',
    'Plaquetas             250.000 /mm3     Ref: 150.000 - 400.000',
    'VCM                   89,0 fL          Ref: 80,0 - 100,0',
    '',
    'FERRITINA',
    'Ferritina             118 ng/mL        Ref: 30 - 300',
  ];
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const content = ['BT', '/F1 11 Tf', '50 800 Td', '16 TL', ...lines.map((l) => `(${esc(l)}) Tj T*`), 'ET'].join('\n');
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${Buffer.byteLength(content, 'latin1')}>>\nstream\n${content}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

export interface SessaoNova { token: string; patientId?: string; user: Record<string, unknown>; email: string }

/** Cria usuário NOVO (register → OTP do arquivo local do server dev → verify → login).
 *  Créditos iniciais esperados: 0 (bônus de cadastro removido — só após o 1º exame). */
export async function criarUsuarioNovo(request: APIRequestContext): Promise<SessaoNova> {
  const email = `e2e.jornada.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@exemplo.com`;
  const password = `t${Math.random().toString(36).slice(2)}A1`;
  const reg = await request.post(`${API}/auth/register`, {
    data: { name: 'Jornada Primeiro Exame', email, password, cpf: cpfValido() },
  });
  if (reg.status() !== 201) throw new Error(`register ${reg.status()}: ${await reg.text()}`);

  // OTP persistido pelo server dev (issueOtp) — dev roda NESTA máquina, leitura local.
  // Caminhos por tentativa: o runner pode executar de packages/web (cwd) ou transformar
  // __dirname (ESM não define) — cobrimos os dois.
  const otpPaths = [
    path.resolve(process.cwd(), '../server/data/agent/otp-store.json'),
    path.resolve(process.cwd(), '../../server/data/agent/otp-store.json'),
    // docker local (4011): AGENT_DIR é o volume ./data/agent montado na raiz do repo
    path.resolve(process.cwd(), '../../data/agent/otp-store.json'),
  ];
  try { otpPaths.unshift(path.resolve(__dirname, '../../server/data/agent/otp-store.json')); } catch { /* ESM: sem __dirname */ }
  let code = '';
  for (let i = 0; i < 24 && !code; i++) {
    await new Promise((r) => setTimeout(r, 250));
    for (const otpPath of otpPaths) {
      try {
        const j = JSON.parse(fs.readFileSync(otpPath, 'utf8'));
        const hit = j[email];
        code = typeof hit === 'string' ? hit : hit?.code ?? '';
        if (code) break;
      } catch { /* arquivo/entrada ainda não existe */ }
    }
  }
  if (!code) throw new Error('código OTP não encontrado no otp-store.json (server dev precisa rodar local)');
  const ver = await request.post(`${API}/auth/verify-email`, { data: { email, code } });
  if (!ver.ok()) throw new Error(`verify-email ${ver.status()}: ${await ver.text()}`);
  const login = await request.post(`${API}/auth/login`, { data: { username: email, password } });
  if (!login.ok()) throw new Error(`login ${login.status()}: ${await login.text()}`);
  const sess = await login.json();
  return { token: sess.token, patientId: sess.patientId, user: sess.user, email };
}

/** Autentica o browser com a sessão passada (limpa storageState do projeto/setup).
 *  addInitScript (não evaluate pós-goto): o script roda ANTES de qualquer código da
 *  página em TODA navegação — mata a corrida em que um /auth/me em voo do boot
 *  anterior (token do storageState demo) sobrescrevia a sessão nova depois do set. */
export async function entrarComo(page: Page, s: SessaoNova): Promise<void> {
  await page.addInitScript((ctx) => {
    try { localStorage.clear(); } catch { /* origem ainda não disponível */ }
    localStorage.setItem('token', ctx.token);
    if (ctx.patientId) { localStorage.setItem('patientId', ctx.patientId); localStorage.setItem('selPatientId', ctx.patientId); }
    localStorage.setItem('user', JSON.stringify(ctx.user));
  }, { token: s.token, patientId: s.patientId, user: s.user });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
}

/** Dispensa overlays de 1ª visita (onboarding/notificação/biometria). Não-fatal. */
export async function dispensarOverlays(page: Page): Promise<void> {
  for (const label of ['Pular', 'Depois', 'Agora não']) {
    try { await page.getByRole('button', { name: label }).first().click({ timeout: 800 }); } catch { /* ausente */ }
  }
}

/** Saldo atual de créditos via API (fonte de verdade — /auth/me devolve {user:{credits}}). */
export async function creditosDe(request: APIRequestContext, token: string): Promise<number> {
  const r = await request.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok()) throw new Error(`auth/me ${r.status()}`);
  const j = await r.json();
  return j?.user?.credits ?? -1;
}
