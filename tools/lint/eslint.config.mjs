// Verificador de ORDEM DE HOOKS do front (regra oficial do React).
//
// Por que existe: hook chamado depois de um `return` antecipado ou dentro de condição quebra a
// tela em produção (React #300/#310) e o TypeScript não vê. Aconteceu no mapa do corpo (out/26)
// e no painel esportivo (achado em 25/11/26). Aqui só essa regra roda — não é um lint de estilo.
//
// Roda da RAIZ do repositório (ver o script `hooks` no package.json desta pasta).
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['**/generated/**', '**/*.d.ts', '**/node_modules/**'] },
  {
    files: ['packages/web/src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    // O plugin do typescript-eslint entra só para os comentários `eslint-disable` que já citam
    // regras dele resolverem o nome; nenhuma regra dele está ligada.
    plugins: { 'react-hooks': reactHooks, '@typescript-eslint': tseslint.plugin },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: { 'react-hooks/rules-of-hooks': 'error' },
  },
];
