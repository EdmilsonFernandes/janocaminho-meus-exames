/**
 * GlassGlow — luz colorida por dentro de um cartão de destaque (classe `dx-glass` no painel).
 * É o que faz o vidro ler como vidro: sem cor atrás, superfície translúcida vira só cinza.
 * Dois focos estáticos (teal da marca + cobre), sem filtro de desfoque e sem animação:
 * custo zero na rolagem do WebView. Decorativo: fora da árvore de acessibilidade.
 */
export function GlassGlow() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]">
      <span className="dx-glass-orb dx-glass-orb-a" />
      <span className="dx-glass-orb dx-glass-orb-b" />
    </span>
  );
}
