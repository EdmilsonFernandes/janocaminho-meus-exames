import { useReuiThemeSync as useBaseReuiThemeSync } from './use-reui-theme';

/**
 * Sincroniza reativamente a classe `.dark` no `document.documentElement` com o
 * tema ativo do MUI e retorna `'dark'` | `''` para compor className de `.reui-scope`.
 */
export function useReuiThemeSync(): 'dark' | '' {
  const isDark = useBaseReuiThemeSync();
  return isDark ? 'dark' : '';
}

