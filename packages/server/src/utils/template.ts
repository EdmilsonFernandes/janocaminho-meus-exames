/**
 * interpolateTemplate — interpolação centralizada de merge fields `{{chave}}` em
 * templates de notificação (push FCM, Notification in-app, e-mail, MOTD).
 *
 * Nasceu do bug do "{{nome}}" literal: o push GLOBAL do admin enviava o template
 * cru pra todo mundo — só o caminho segmentado (dispatchCampaign) interpolava.
 * Agora TODO texto autorado no admin que vai pra usuário passa por aqui.
 *
 * CONTRATO (10/26, decisão do dono — NUNCA deixar {{...}} chegar no usuário):
 *  - Variável CONHECIDA com valor no contexto → substitui pelo valor.
 *  - Variável CONHECIDA sem valor no contexto → substitui por string VAZIA.
 *  - Variável DESCONHECIDA (typo, invenção) → REMOVE e loga warning.
 *  - Chaves toleram espaços (`{{ nome }}`), case (`{{NOME}}`) e separadores
 *    (`{{first_name}}` ≡ `{{firstName}}`) via dicionário central de aliases.
 *  - Valores são inseridos via callback de replace — "$" no valor nunca é
 *    interpretado como padrão de substituição.
 */

export type TemplateVars = Record<string, string | number | null | undefined>;

/**
 * Dicionário central: chave NORMALIZADA (minúscula, sem espaço/underscore/hífen)
 * → nome canônico (só para log legível). Toda variável que o sistema conhece em
 * qualquer template (push, campanha, MOTD, share, e-mail) deve estar aqui.
 */
const KNOWN_VARS: Record<string, string> = {
  // nome do usuário/paciente (push/campanha; MOTD não tem contexto por usuário)
  nome: 'nome', firstname: 'nome', name: 'nome', user: 'nome', usuario: 'nome',
  patientname: 'nome', nomepaciente: 'nome', nomedopaciente: 'nome',
  // dias seguidos ativo (streak)
  streak: 'streak', streakdays: 'streak', dias: 'streak', diasseguidos: 'streak',
  // passos de ontem (Health Connect)
  passosontem: 'passosOntem', passos: 'passosOntem', steps: 'passosOntem',
  stepsyesterday: 'passosOntem', passosdeontem: 'passosOntem',
  // créditos / bônus de indicação
  credits: 'credits', creditos: 'credits', credito: 'credits',
  bonus: 'bonus',
  // link genérico (deep link/rota compartilhada)
  link: 'link', url: 'link',
  // data do envio
  data: 'data', date: 'data',
  // exame / médico (contextos de exame pronto e portal)
  examname: 'examName', exame: 'examName', nomedoexame: 'examName', exam: 'examName',
  doctorname: 'doctorName', medico: 'doctorName', nomedomedico: 'doctorName', doctor: 'doctorName',
  // código de indicação / OTP
  code: 'code', codigo: 'code',
};

const normKey = (raw: string): string => raw.trim().toLowerCase().replace(/[\s_-]+/g, '');

// Warning 1x por chave POR PROCESSO — endpoint público (landing) chama por request.
const warnedKeys = new Set<string>();
const warnOnce = (msg: string, key: string): void => {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  console.warn(`[template] ${msg}`);
};

/** Interpola `{{chave}}` em `template` com `vars`. Função pura (sem I/O além do warn). */
export function interpolateTemplate(
  template: string,
  vars: TemplateVars,
  opts: { onUnknown?: (key: string) => void } = {},
): string {
  // Lookup por chave CANÔNICA (alias resolvido): vars {first_name} e {{nome}} casam,
  // e 'passosOntem' (var) com {{passos_ontem}} (template) também.
  const lookup = new Map<string, string>();
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) continue;
    const nk = normKey(k);
    lookup.set(KNOWN_VARS[nk] ?? nk, v == null ? '' : String(v));
  }
  // `[^{}]*` (não `+`): `{{}}` vazio também é capturado e removido — nada de braces no usuário.
  return template.replace(/\{\{\s*([^{}]*)\s*\}\}/g, (_full, rawKey: string) => {
    const norm = normKey(rawKey);
    const canonical = KNOWN_VARS[norm] ?? norm;
    if (lookup.has(canonical)) return lookup.get(canonical)!;
    if (KNOWN_VARS[norm] != null) {
      // conhecida (cânica ou alias) mas o chamador não forneceu → vazia, nunca "{{var}}" visível
      warnOnce(`variável conhecida "${canonical}" sem valor no contexto — substituída por string vazia`, norm);
      return '';
    }
    // desconhecida (typo/invenção) → removida + warning
    if (opts.onUnknown) opts.onUnknown(String(rawKey).trim());
    else warnOnce(`variável DESCONHECIDA "{{${String(rawKey).trim()}}}" removida — dicionário central em utils/template.ts; vars fornecidas: ${[...lookup.keys()].join(', ') || '(nenhuma)'}`, norm);
    return '';
  });
}
