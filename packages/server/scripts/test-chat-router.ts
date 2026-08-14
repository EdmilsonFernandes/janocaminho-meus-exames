// Valida o pré-roteador do chat (tryLocalAnswer) sem chamar a IA nem gastar créditos.
// As sugestões interpretativas que ANTES batiam em LIST_EXAMS (e voltavam só com a lista de
// títulos) agora devem rotear pra IA (answered=false). Roda: npx tsx scripts/test-chat-router.ts
import { tryLocalAnswer } from '../src/analysis/chat-router';

const CASES: { msg: string; expect: 'IA' | 'LOCAL' }[] = [
  // Sugestões que antes retornavam a lista de exames (BUG) — agora devem ir à IA:
  { msg: 'Quais exames de rotina estão faltando no meu histórico conforme minha idade e perfil?', expect: 'IA' },
  { msg: 'Há sinais nos meus exames ligados a cansaço, sono, estresse ou saúde mental que eu devia observar?', expect: 'IA' },
  { msg: 'Com base nos meus exames, sugira metas de saúde realistas para os próximos meses.', expect: 'IA' },
  { msg: 'Avalie meu risco cardiovascular (colesterol, pressão, glicemia) com base nos meus exames e diga como reduzir.', expect: 'IA' },
  { msg: 'Com base nos meus exames, que mudanças na alimentação você recomenda?', expect: 'IA' },
  { msg: 'Verifique meu histórico de vacinas e diga quais estão em atraso ou faltando conforme o calendário.', expect: 'IA' },
  // Pedidos curtos/fatuais — devem continuar respondendo LOCAL (sem IA):
  { msg: 'Quantos exames eu tenho?', expect: 'LOCAL' },
  { msg: 'Liste meus exames', expect: 'LOCAL' },
];

(async () => {
  let fails = 0;
  for (const c of CASES) {
    // patientId inexistente: casos LOCAL que chegam ao DB retornam 0/[] (seguro); casos IA retornam antes.
    const r = await tryLocalAnswer({ message: c.msg, userId: 'test', patientId: 'nonexistent' });
    const got = r.answered ? 'LOCAL' : 'IA';
    const ok = got === c.expect;
    if (!ok) fails++;
    console.log(`${ok ? '✅' : '❌'} esperado=${c.expect} got=${got} | ${c.msg.slice(0, 60)}`);
  }
  console.log(fails === 0 ? '\nTUDO OK — roteamento correto.' : `\n${fails} caso(s) fora do esperado.`);
  process.exit(fails === 0 ? 0 : 1);
})();
