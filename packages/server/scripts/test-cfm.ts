// PROBE empírico do consultaCRM — valida a chave + o formato da resposta (lê CONSULTA_CRM_KEY do .env).
// Uso: npx tsx scripts/test-cfm.ts [crm] [uf]
import 'dotenv/config';
import { lookupCfm } from '../src/utils/cfm';

const crm = process.argv[2] || '12345';
const uf = process.argv[3] || 'SP';

async function raw() {
  const base = process.env.CONSULTA_CRM_URL || 'https://www.consultacrm.com.br/api/index.php';
  const chave = process.env.CONSULTA_CRM_KEY || '';
  const url = `${base}?tipo=crm&uf=${uf}&q=${crm}&chave=${chave}&destino=json`;
  console.log(`\n[raw] GET ${url}`);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    console.log(`[raw] status=${res.status} content-type=${res.headers.get('content-type')}`);
    const text = await res.text();
    console.log(`[raw] body (até 600 chars):\n${text.slice(0, 600)}`);
  } catch (e: any) {
    console.log(`[raw] ERRO: ${e?.message}`);
  }
}

(async () => {
  await raw();
  console.log('\n[lookupCfm] resultado:');
  const r = await lookupCfm(crm, uf);
  console.log(r ? JSON.stringify(r, null, 2) : 'null (não encontrado / bloqueado / fora do ar)');
})();
