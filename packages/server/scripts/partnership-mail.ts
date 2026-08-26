/**
 * Disparo da campanha de parceria (marketing/emails-parceria) via SMTP do app
 * (contato@janocaminho.com.br — Zoho). Um a um (4s de espaço), NUNCA em cópia —
 * cada alvo recebe o SEU e-mail; cópia oculta (BCC) vai pro dono.
 *
 *   npx tsx scripts/partnership-mail.ts --list            # vê os alvos
 *   npx tsx scripts/partnership-mail.ts --test            # cópia de TUDO pra contato@ (auto-teste)
 *   npx tsx scripts/partnership-mail.ts --only=farmaicias # dispara 1 grupo
 *   npx tsx scripts/partnership-mail.ts --all             # dispara o lote 1 (6 e-mails)
 *
 * Lote 1 = SÓ e-mails DIRETOS verificados (CONTATOS.md). Formulários (Pague Menos,
 * São João, RD, Rakuten, Lomadee) são preenchimento manual — não automatizamos.
 */
import path from 'path';
import 'dotenv/config'; // script standalone: carrega SMTP_* do .env (o server faz isso no boot)
import { sendEmail } from '../src/utils/mailer';

const BCC_DONO = 'edmls2008@gmail.com'; // cópia oculta de tudo (registro)
// Sem links clicáveis de propósito (pedido do dono): URL escrita por extenso passa
// mais confiança em e-mail frio do que hyperlink (que lembra phishing).
const PRINTS = path.resolve(__dirname, '../../../marketing/emails-parceria/prints');

const SIGN = `
<p style="margin:24px 0 0">Abraço,<br>
<b>Edmilson Fernandes</b> — fundador, Meus Exames / Dr. Exame<br>
<span style="color:#555">Site: drexame.janocaminho.com.br<br>
Tour de 40s: youtube.com/watch?v=jyHezElJyjA<br>
App (Google Play): pesquise "Meus Exames"</span></p>
<p style="color:#999;font-size:11px;margin-top:16px">P.S.: consegui este e-mail no site de vocês (página de contato).<br>
Não quer mais receber prospecção? Responda "remover".</p>`;

const P = (s: string) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${s}</p>`;
const LI = (items: string[]) => `<ul style="margin:0 0 12px 20px;font-size:15px;line-height:1.7">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

const farmaiciasHtml = (empresa: string) => `
${P(`Olá, equipe comercial da <b>${empresa}</b>,`)}
${P(`Sou fundador do <b>Dr. Exame</b> (Meus Exames) — sistema brasileiro de saúde que acompanha o paciente de ponta a ponta: ele envia o <b>exame de laboratório</b> e a IA explica cada valor em português simples; o <b>médico dele acompanha</b> por um portal de pré-consulta; a <b>família inteira</b> fica no mesmo lugar (dependentes inclusos); e os <b>remédios de uso contínuo</b> moram no app, com checagem de interações e o <b>menor preço em 9 farmácias</b> — é aí que a ${empresa} entra <i>(prints anexos — app real)</i>.`)}
${P(`O paciente conta pro app o que toma, o app sugere onde comprar: a <b>${empresa} como farmácia destacada</b>, com cupom próprio, pra um cliente que compra todo mês — remédio contínuo é recorrente. Tudo mensurável (UTM) desde o dia 1; CPS/CPA sem intermediário.`)}
${P('<b>Conheçam o produto</b> (digitando, sem clicar em nada meu):<br>• Site: drexame.janocaminho.com.br — seção "Economize nos seus remédios"<br>• Tour de 40s: youtube.com/watch?v=jyHezElJyjA<br>• App: Google Play, pesquise "Meus Exames"<br>Também temos <b>API pública pra devs</b> (preço de remédios, interações, extração de laudo): drexame.janocaminho.com.br/api/docs')}
${P('Gostando do que vir, é só responder este e-mail.')}
${SIGN}`;

const apiHtml = (nome: string, introLabs: boolean) => `
${P(`Oi ${nome},`)}
${introLabs
  ? P(`Quantos laudos o seu setor ainda digita/manualiza por dia? Temos um motor em produção no app <b>Dr. Exame</b> que lê o <b>PDF do laudo e devolve JSON estruturado</b> — itens, valores, unidades, faixas e a página-fonte — e abrimos como <b>API pública</b> para laboratórios e associados <i>(print anexo do produto)</i>.`)
  : P(`Toda vez que a pergunta é <b>"quanto custa esse remédio?"</b>, alguém precisa manter scraper, catálogo e preço atualizado. Nós já fazemos isso — sou fundador do <b>Dr. Exame</b> e abrimos nossa infraestrutura como <b>API pública</b> <i>(print anexo do comparador real)</i>.`)}
${LI([
  '<code>GET /meds/prices</code> — preço de <b>9 farmácias brasileiras</b> com foto, link e EAN;',
  '<code>GET /meds/interactions</code> — base curada de interações <b>D/X</b>;',
  '<code>POST /meds/normalize</code> — "Dorflex 10cp" digitado por humano → chave canônica;',
  '<code>POST /exams/extract</code> — <b>laudo em PDF → JSON estruturado</b> com IA;',
  '<code>POST /exams/interpret</code> — valor × faixa → rótulo com grau (determinístico).',
])}
${P('Tudo documentado em português, com curl copiável — a documentação fica em <b>drexame.janocaminho.com.br/api/docs</b> (pode digitar na mão), e a aprovação de acesso vem com <b>25 chamadas grátis</b>: dá pra testar de verdade sem falar com ninguém.')}
${introLabs
  ? P('Se fizer sentido pros laboratórios associados, me respondem — rodo 5 laudos de exemplo na hora que pedirem (é mandar um PDF anonimizado).')
  : P('Testem com calma. Se rolar, me respondem que eu monto a chave de teste na hora.')}
${SIGN}`;

const afiliadosHtml = () => `
${P('Olá, time de Publishers,')}
${P(`Sou fundador do <b>Dr. Exame</b> (Meus Exames) — app brasileiro de saúde (web + Android) com um caso de afiliação raro: <b>comparador de preços de medicamentos</b> integrado à jornada do paciente. O usuário cadastra o remédio de uso contínuo e o app mostra o menor preço entre as farmácias — <b>clique = intenção de compra real e recorrente</b>.`)}
${P('<b>O que buscamos:</b> afiliação nos anunciantes de farmácia da rede para substituir links diretos por links rastreáveis. Volume inicial modesto, qualidade alta (saúde/remédio recorrente).')}
${P('Podem me indicar o passo a passo de aprovação (e se aceitam app mobile + PWA como publisher)? Se houver formulário direto, me mandam o link que preencho hoje.')}
${SIGN}`;

const PRINTS_FARMA = [
  { filename: '01-remedios-com-precos.png', path: path.join(PRINTS, '01-remedios-com-precos.png') },
  { filename: '02-card-detalhe.png', path: path.join(PRINTS, '02-card-detalhe.png') },
  { filename: '03-landing-comparador.png', path: path.join(PRINTS, '03-landing-comparador.png') },
];
const PRINT_API = [{ filename: 'comparador-dr-exame.png', path: path.join(PRINTS, '03-landing-comparador.png') }];

type Alvo = { grupo: string; nome: string; to: string; subject: string; html: string; attachments?: { filename: string; path: string }[] };
const ALVOS: Alvo[] = [
  { grupo: 'farmaicias', nome: 'Farmais', to: 'contato@farmais.com.br', subject: 'Parceria: pacientes chegando com a receita na mão — Dr. Exame × Farmais', html: farmaiciasHtml('Farmais'), attachments: PRINTS_FARMA },
  { grupo: 'farmaicias', nome: 'Farmais (vendas)', to: 'vendas@farmais.com.br', subject: 'Parceria: pacientes chegando com a receita na mão — Dr. Exame × Farmais', html: farmaiciasHtml('Farmais'), attachments: PRINTS_FARMA },
  { grupo: 'afiliados', nome: 'Awin Brasil', to: 'brasil-nb@awin.com', subject: 'Publisher BR: app de saúde com intenção de compra de remédio — quero afiliar', html: afiliadosHtml() },
  { grupo: 'api', nome: 'CliqueFarma', to: 'cliquefarma@cliquefarma.com.br', subject: 'Parceria de dado: API de preços de remédios (9 farmácias) + interações D/X', html: apiHtml('equipe CliqueFarma', false), attachments: PRINT_API },
  { grupo: 'api', nome: 'SBAC', to: 'geral@sbac.org.br', subject: 'API que estrutura laudo (PDF→JSON) — parceria/divulgação p/ laboratórios associados', html: apiHtml('equipe SBAC', true), attachments: PRINT_API },
  { grupo: 'api', nome: 'SBPC/ML', to: 'faleconosco@sbpc.org.br', subject: 'API que estrutura laudo (PDF→JSON) — parceria/divulgação p/ laboratórios associados', html: apiHtml('equipe SBPC/ML', true), attachments: PRINT_API },
];

const args = process.argv.slice(2);
const flag = args[0] ?? '--list';

async function main() {
  if (flag === '--list') {
    console.log('ALVOS (lote 1 — e-mails diretos verificados):');
    ALVOS.forEach((a) => console.log(` [${a.grupo}] ${a.nome} <${a.to}> — ${a.subject}${a.attachments ? ` (+${a.attachments.length} prints)` : ''}`));
    return;
  }
  if (flag === '--sample') {
    // UMA amostra (a de farmácias) pra o dono avaliar — não bombardeia a caixa nem o Zoho.
    const a = ALVOS[0];
    const r = await sendEmail({ to: 'contato@janocaminho.com.br', bcc: BCC_DONO, subject: `[AMOSTRA·${a.nome}] ${a.subject}`, html: a.html, ...(a.attachments?.length ? { attachments: a.attachments } : {}) });
    console.log(`Amostra (${a.nome}): ${r.sent ? 'enviada pra contato@janocaminho.com.br + BCC' : 'FALHOU'}`);
    return;
  }
  if (flag === '--test') {
    console.log('SELF-TEST: cópia de todos pra contato@janocaminho.com.br (com BCC do dono)');
    for (const a of ALVOS) {
      const r = await sendEmail({ to: 'contato@janocaminho.com.br', bcc: BCC_DONO, subject: `[TESTE·${a.nome}] ${a.subject}`, html: a.html, ...(a.attachments?.length ? { attachments: a.attachments } : {}) });
      console.log(` ${a.nome}: ${r.sent ? 'ok' : 'FALHOU/dev-preview'}`);
      await new Promise((res) => setTimeout(res, 30_000)); // Zoho corta conexões rápidas demais
    }
    return;
  }
  const enviar = flag === '--all' ? ALVOS : flag.startsWith('--only=') ? ALVOS.filter((a) => a.grupo === flag.slice(7)) : [];
  if (!enviar.length) { console.log('Nada a enviar. Use --list, --test, --only=<grupo> ou --all.'); return; }
  for (const a of enviar) {
    const r = await sendEmail({ to: a.to, bcc: BCC_DONO, subject: a.subject, html: a.html, ...(a.attachments?.length ? { attachments: a.attachments } : {}) });
    console.log(`${r.sent ? '✓' : '✗'} ${a.nome} <${a.to}>`);
    await new Promise((res) => setTimeout(res, 30_000)); // Zoho corta conexões em rajada
  }
  console.log(`\nEnviados: ${enviar.length}. Registre no marketing/emails-parceria/tracking.csv`);
}

void main();
