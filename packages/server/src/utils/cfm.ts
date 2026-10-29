/**
 * Consulta de médico por CRM + UF via consultaCRM (https://www.consultacrm.com.br).
 * API com chave (100 consultas/mês no plano atual). Resposta JSON:
 *   { status:"true", total:1, item:[{ nome, profissao, numero, uf, situacao }], api_consultas, api_limite }
 *
 * Provider ISOLADO e defensivo: qualquer falha (rede, timeout, status!="true",
 * cota esgotada, JSON inválido) → retorna `null`. O chamador degrada pra preenchimento
 * manual. Assim a feature nunca trava.
 *
 * CHAVE: defina CONSULTA_CRM_KEY no .env do server (.env.prod) e no dev (.env).
 * Sem chave → retorna null SEM consumir cota (busca só no nosso banco + manual).
 * Override: CONSULTA_CRM_URL, CONSULTA_CRM_KEY, CFM_TIMEOUT_MS (env).
 */

import { normalizeKey } from './normalize';

export interface CfmDoctor {
  name: string;
  specialty: string | null;
  crm: string; // normalizado "116739-SP"
  uf: string;
  situation?: string;
  source: 'cfm';
}

const CONSULTA_CRM_URL = process.env.CONSULTA_CRM_URL || 'https://www.consultacrm.com.br/api/index.php';
const CFM_TIMEOUT_MS = Number(process.env.CFM_TIMEOUT_MS) || 8000;

/**
 * Busca médico por CRM (número) + UF. Retorna `null` se não achar, se faltar chave,
 * ou se algo falhar. `crmRaw` aceita "116739" ou "116739-SP" (extrai só dígitos).
 * A chave é lida no momento da chamada (CONSULTA_CRM_KEY) — assim basta definir no env.
 */
export async function lookupCfm(crmRaw: string, ufRaw: string): Promise<CfmDoctor | null> {
  const crm = String(crmRaw || '').replace(/\D/g, '');
  const uf = String(ufRaw || '').trim().toUpperCase();
  if (!crm || uf.length !== 2) return null;
  const chave = process.env.CONSULTA_CRM_KEY || '';
  if (!chave) return null; // sem chave → não consome cota, degrada pra manual
  try {
    const url = `${CONSULTA_CRM_URL}?tipo=crm&uf=${encodeURIComponent(uf)}&q=${encodeURIComponent(crm)}&chave=${chave}&destino=json`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(CFM_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (String(data?.status) !== 'true') return null; // erro da API / não encontrado
    const items: any[] = Array.isArray(data?.item) ? data.item : data?.item ? [data.item] : [];
    const m = items.find((x) => x?.nome) || items[0];
    if (!m?.nome) return null;
    return {
      name: String(m.nome).trim(),
      specialty: String(m.profissao || '').trim() || null,
      crm: `${String(m.numero || crm)}-${uf}`,
      uf,
      situation: String(m.situacao || '').trim() || undefined,
      source: 'cfm',
    };
  } catch {
    return null; // timeout / rede / parse → degrada pra manual
  }
}

/** 27 UFs — valida CRM/UF de entrada (AUD-003: '000000-ZZ' passava). */
export const BR_UFS: ReadonlySet<string> = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

/**
 * Situação do CFM em 3 estados. O `/ativo/i` do cadastro casava "Inativo" (bug). Aqui só a palavra
 * "Ativo"/"Ativa" SOZINHA é `active`; "Ativo - …" / "Ativo (…)" (qualificado) é `unknown` — o dono decide.
 * Termos de inatividade (inativo, cancelamento, cassação, suspensão, falecimento, interdição,
 * aposentadoria, transferência, baixa — verbo ou substantivo) são `inactive`; o resto é `unknown`.
 */
export type CfmState = 'active' | 'inactive' | 'unknown';
export function cfmState(situation: string | null | undefined): CfmState {
  const s = normalizeKey(String(situation ?? '')).trim();
  if (!s) return 'unknown';
  if (/^ATIV[OA]$/.test(s)) return 'active';
  if (/^ATIV[OA]\b/.test(s)) return 'unknown'; // "Ativo - …" / "Ativo (…)": qualificado/ambíguo → o dono decide
  return /INATIV|CANCELA|CASSA[CD]|SUSPEN|FALEC|INTERDI|APOSENT|TRANSFER|BAIXA/.test(s) ? 'inactive' : 'unknown';
}
