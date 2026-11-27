import { joinNames, type PanoramaModel, type Translate } from './panoramaPresenter';

const sentence = (s: string): string => {
  const text = s.trim();
  if (!text) return '';
  return /[.!?…:]$/.test(text) ? text : `${text}.`;
};

/**
 * O roteiro do botão "Ouvir panorama": o que a tela mostra, na mesma ordem, em frases curtas.
 *
 * Só FATOS que já estão no modelo da tela (placar, o que mudou, uma frase por área, o que falta)
 * — não chama IA e não custa crédito. Saúde mental com alerta de crise fica fora da leitura em
 * voz alta: é assunto para ler com calma no cartão da área, não para sair do alto-falante.
 */
export function panoramaSpeech(model: PanoramaModel, t: Translate): string {
  const out: string[] = [];
  const { hero } = model;
  // Mente e humor e Diário não são exame: na PRIMEIRA vez que a área é citada (em "o que mudou" ou na
  // lista de áreas), uma frase curta diz o que ela é (pedido do dono, 27/11/26).
  const explained = new Set<string>();
  const explain = (key: string) => {
    if ((key === 'mind' || key === 'diary') && !explained.has(key)) { explained.add(key); out.push(t(`panorama.listen.explain_${key}`)); }
  };

  if (hero.score != null) out.push(t('panorama.listen.score', { score: hero.score, verdict: hero.verdict }));
  else out.push(sentence(hero.verdict), sentence(hero.noScoreText));
  if (hero.outOfRange) out.push(t('panorama.listen.out', { smart_count: hero.outOfRange }));
  if (hero.inRange) out.push(t('panorama.listen.in', { smart_count: hero.inRange }));
  if (hero.pullLead && hero.pullDown.length) out.push(sentence(`${hero.pullLead} ${joinNames(hero.pullDown, t)}`));
  else if (hero.nothingPulls) out.push(sentence(hero.nothingPulls));

  const quiet = new Set(model.tiles.filter((tile) => tile.crisis).map((tile) => tile.key));
  const changes = model.changes.filter((c) => !quiet.has(c.key)).slice(0, 3);
  if (changes.length) {
    out.push(t('panorama.listen.changes'));
    for (const c of changes) { explain(c.key); out.push(sentence(`${c.area}: ${c.title}`)); }
  }

  const tiles = model.tiles.filter((tile) => !tile.crisis);
  if (tiles.length) {
    out.push(t('panorama.listen.areas'));
    for (const tile of tiles) {
      const fact = tile.take || [`${tile.big} ${tile.unit}`.trim(), tile.pill].filter(Boolean).join(', ');
      explain(tile.key);
      out.push(sentence(`${tile.name}: ${fact}`));
    }
  }

  if (model.todo.length) out.push(t('panorama.listen.todo', { names: joinNames(model.todo.map((x) => x.name), t) }));
  out.push(t('panorama.listen.end'));
  return out.filter(Boolean).join('\n');
}
