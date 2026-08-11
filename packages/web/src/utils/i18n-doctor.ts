import pt from '../i18n/pt.json';
import en from '../i18n/en.json';

/** Dict estático (JSON import — resolveJsonModule on). Mantém paridade com o ra useTranslate. */
const DICT: Record<string, Record<string, any>> = { pt, en };

/** Lê o idioma do localStorage (mesma chave que o resto do app). Default pt. */
const readLang = (): string => {
  try {
    const l = localStorage.getItem('lang');
    return l === 'en' ? 'en' : 'pt';
  } catch {
    return 'pt';
  }
};

/** Resolve chave dotted. Flat PRIMEIRO (o projeto usa chaves dotted estilo polyglot:
 *  "menu.exams" é uma string única no JSON, não um objeto aninhado). Fallback aninhado
 *  p/ dicts estruturados. Não achou → devolve a chave original (caller trata). */
const lookup = (dict: Record<string, any>, key: string): string => {
  if (typeof dict[key] === 'string') return dict[key]; // flat: dict["doctor.tabs.exams"]
  const parts = key.split('.');
  let cur: any = dict;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
    else return key;
  }
  return typeof cur === 'string' ? cur : key;
};

/** Interpola {param} no template. Tolerante a params ausentes (deixa o placeholder). */
const interpolate = (tmpl: string, params?: Record<string, any>): string => {
  if (!params) return tmpl;
  return tmpl.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k] ?? '') : `{${k}}`));
};

/**
 * useDoctorT — hook de i18n do portal do médico. O portal roda FORA do <AdminContext> do
 * react-admin (CustomRoutes noLayout), então useTranslate não está disponível. Este hook lê
 * o idioma do localStorage (mesma chave que o toggle de tema/idioma do app) e devolve um
 * (key, params?) => string com lookup dotted + interpolação {param}. Fallback = própria chave.
 *
 * Uso: const t = useDoctorT(); t('doctor.tabs.exams'); t('altered.title', { count: 3 });
 */
export const useDoctorT = (): ((key: string, params?: Record<string, any>) => string) => {
  const lang = readLang();
  const dict = DICT[lang] ?? DICT.pt;
  return (key: string, params?: Record<string, any>) => {
    const v = lookup(dict, key);
    return v === key ? v : interpolate(v, params);
  };
};
