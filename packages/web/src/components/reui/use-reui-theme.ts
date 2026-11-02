import { useEffect } from 'react';
import { useTheme } from '@mui/material';
import '../../doctor-v2/tw.css';

/**
 * Sincroniza reativamente a classe `.dark` no `document.documentElement` com o
 * tema ativo do MUI (`theme.palette.mode`) e garante que `tw.css` (Tailwind v4
 * sem preflight + tokens ReUI do Consultório de Vidro) esteja carregado.
 */
export function useReuiThemeSync() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  return isDark;
}

