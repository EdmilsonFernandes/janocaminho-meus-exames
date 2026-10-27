/**
 * Fase do hero "Sua saúde hoje" no dashboard.
 *
 * Bug 27/10/26: score null + 0 exames é o ESTADO INICIAL do hook, não a realidade do
 * usuário — o hero mostrava "Começa com seu primeiro exame" + "Enviar primeiro exame"
 * enquanto os dados carregavam, para quem já tinha exames. Antes de `loaded` não
 * existe "vazio": é carregamento.
 */
export type HeroPhase = 'loading' | 'empty' | 'unscored' | 'scored';

export const heroPhase = (loaded: boolean, score: number | null, exams: number): HeroPhase => {
  if (!loaded) return 'loading';
  if (score != null) return 'scored';
  return exams === 0 ? 'empty' : 'unscored';
};
