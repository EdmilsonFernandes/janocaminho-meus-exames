// Fumaça MANUAL do cliente UaiID contra a API REAL (T14 step 4). Cria 1 sessão de verificação
// (consome 1 verificação do plano) — rode só quando quiser validar o contrato de verdade.
//
//   UAIID_API_KEY=<chave> node ../../node_modules/tsx/dist/cli.mjs scripts/kyc-smoke-uaiid.ts   (a partir de packages/server)
//   (PowerShell: $env:UAIID_API_KEY='<chave>'; node ../../node_modules/tsx/dist/cli.mjs scripts/kyc-smoke-uaiid.ts)
//
// Nada sensível é impresso: sem CPF, sem a chave inteira, sem o token do link de verificação.
// O CPF enviado é sintético (dígitos válidos, não pertence a ninguém conhecido) e nunca completa o fluxo.
import crypto from 'node:crypto';
import { createUaiidVerification, getUaiidVerification, verifyUaiidSignature, UaiidError } from '../src/utils/uaiid';

const base = (process.env.UAIID_BASE_URL || 'https://api.uaiid.com.br').replace(/\/$/, '');
const key = process.env.UAIID_API_KEY || '';
if (!key) { console.log('SEM UAIID_API_KEY no ambiente'); process.exit(2); }
console.log(`chave: presente · prefixo ${key.slice(0, 9)}… · ${key.length} chars · base ${base}`);

const RETURN_URL = 'https://drexame.janocaminho.com.br/#/doctor?kyc=1';

/** Corpo do erro da API (só `error_code` e `detail`) — o cliente do produto esconde a causa de propósito. */
async function explainFailure(ts: number): Promise<void> {
  const res = await fetch(`${base}/v1/verifications`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `smoke-explain-${ts}` },
    body: JSON.stringify({ cpf: '11144477735', full_name: 'MARIA TESTE SMOKE', external_reference: `smoke-explain-${ts}`, return_url: RETURN_URL, mode: 'full', flow: 'own' }),
    signal: AbortSignal.timeout(15_000),
  });
  const body: any = await res.json().catch(() => ({}));
  if (res.ok) {
    // 2xx que o cliente não aceitou = o CONTRATO mudou. Só nomes de campo e o formato do verify_url (sem valores).
    const v = typeof body?.verify_url === 'string' ? body.verify_url : null;
    console.log(`   resposta ${res.status} NÃO aceita pelo cliente · campos: ${Object.keys(body ?? {}).join(', ')} · verify_url: ${v === null ? 'ausente' : v.startsWith('/') ? 'relativo' : v.split('/')[0]}`);
    return;
  }
  console.log(`   causa → HTTP ${res.status} · error_code=${body?.error_code ?? 'n/d'} · ${String(body?.detail ?? '').slice(0, 200)}`);
}

async function main() {
  // A) a chave autentica? GET de id inexistente: 404 = chave ok · 401/403 = chave rejeitada.
  const probe = await fetch(`${base}/v1/verifications/00000000-0000-0000-0000-000000000000`, {
    headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000),
  });
  console.log(`A) GET id inexistente → HTTP ${probe.status}  (esperado 404; 401/403 = chave rejeitada)`);

  // B) cria 1 sessão pelo CLIENTE do produto (contrato real: corpo, headers, parse).
  const ts = Date.now();
  try {
    const c = await createUaiidVerification({
      cpf: '11144477735', fullName: 'MARIA TESTE SMOKE', externalReference: `smoke-${ts}`, returnUrl: RETURN_URL, idempotencyKey: `smoke-${ts}`,
    });
    const u = new URL(c.verifyUrl);
    console.log(`B) criada · id ${c.verificationId} · link ${u.protocol}//${u.host}${u.pathname.replace(/[^/]+$/, '…')} · expira ${c.expiresAt ? c.expiresAt.toISOString() : 'null'} · reused ${c.reused}`);

    // C) lê de volta pelo cliente (status + external_reference devem bater).
    const g = await getUaiidVerification(c.verificationId);
    console.log('C) GET →', g ? { status: g.status, reasonCode: g.reasonCode, externalReference: g.externalReference, score: g.score } : null);
    console.log(`   external_reference confere: ${g?.externalReference === `smoke-${ts}`}`);
  } catch (e) {
    if (e instanceof UaiidError) {
      console.log(`B) FALHOU · UaiidError code=${e.code} status=${e.status ?? 'n/d'} retryAfterHours=${e.retryAfterHours ?? 'n/d'}`);
      await explainFailure(ts).catch((x) => console.log('   (não consegui ler a causa:', (x as Error).message + ')'));
    } else console.log('B) erro inesperado:', (e as Error).message);
  }

  // D) HMAC do webhook (offline, segredo inventado): válido passa; corpo adulterado e segredo vazio falham.
  const secret = 'whsec_smoke_local';
  const body = Buffer.from(JSON.stringify({ id: 'evt_smoke', event: 'verification.approved', verification_id: 'x', data: {} }));
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.`).update(body).digest('hex');
  console.log(`D) HMAC válido → ${verifyUaiidSignature(body, `t=${t},v1=${v1}`, secret)} · corpo adulterado → ${verifyUaiidSignature(Buffer.concat([body, Buffer.from(' ')]), `t=${t},v1=${v1}`, secret)} · segredo vazio → ${verifyUaiidSignature(body, `t=${t},v1=${v1}`, '')}`);
}

main().catch((e) => { console.log('FALHA:', (e as Error).message); process.exit(1); });
