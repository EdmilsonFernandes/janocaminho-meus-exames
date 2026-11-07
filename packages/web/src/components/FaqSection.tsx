import { useState, useEffect } from 'react';
import { Box, Container, Typography, Accordion, AccordionSummary, AccordionDetails, Stack, Button } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useNavigate } from 'react-router-dom';
import { Reveal } from './Reveal';
import { fetchPublicConfig } from '../config';
import { Badge } from '@/components/reui/badge';
import { IconTile } from '@/components/reui/icon-tile';
import { HelpCircle, ChevronDown, ArrowRight } from 'lucide-react';

const TEAL = '#20b2aa';
const TEAL_DARK = '#178f89';

// FAQ (F4) — mata as objeções críticas de um app de IA em saúde.
// Exportado: a Landing reusa o MESMO array no schema FAQPage (JSON-LD) — fonte única.
export const FAQ_ITEMS = [
  {
    q: 'A IA do Dr. Exame substitui o médico?',
    a: 'Não. Ela é educativa: explica cada valor em português simples, compara com a faixa de referência e sugere perguntas para levar à consulta. A decisão e o diagnóstico são sempre do seu médico.',
  },
  {
    q: 'A IA inventa os valores do meu exame?',
    a: 'Não. Os valores vêm direto do seu laudo (extração determinística, com a página de origem). A IA só interpreta o que já está escrito: ela não chuta nem cria números.',
  },
  {
    q: 'Funciona com o exame do meu laboratório?',
    a: 'Sim. Qualquer PDF ou foto de exame de sangue, imagem ou laudo. A IA extrai os valores do texto do documento, independente do laboratório.',
  },
  {
    q: 'Meus dados estão seguros?',
    a: 'Sim. Dados sensíveis (CPF/RG) são criptografados, os PDFs ficam fora do banco, e o compartilhamento com o médico é por link com PIN (que você revoga a qualquer momento). Você pode excluir tudo quando quiser. Conforme a LGPD.',
  },
  {
    q: 'Preciso pagar para testar?',
    a: `Não. Envie seu primeiro exame (PDF ou foto) e ganhe créditos grátis, sem cartão. Use para conversar com a IA, gerar relatórios e perguntar ao médico. Só assina ou compra créditos avulsos se precisar de mais.`,
  },
  {
    q: 'Como funciona a consulta por vídeo dentro do app?',
    a: 'Seu médico agenda e você entra na chamada direto no Dr. Exame — sem link externo, sem Meet ou Zoom. Antes de começar, você autoriza a telemedicina (Art. 15 da Res. CFM 2.314/22). Se quiser, a IA transcreve a consulta: o áudio é descartado e o texto organizado fica no seu prontuário. Consultas particulares são pagas por PIX no próprio card da consulta — o médico define o valor.',
  },
  {
    q: 'Treino pesado ou tomo suplementos. O Dr. Exame entende meus exames esportivos?',
    a: 'Sim! Atletas de alta performance, corredores e praticantes de musculação frequentemente têm CK, TGO e creatinina elevadas sem que haja qualquer doença no fígado ou rins. O Dr. Exame conta com o Modo Saúde Esportiva: ele cruza os dados com o histórico de treinos e suplementação declarada (como creatina), desmistifica falsos positivos e avisa quando marcadores críticos (como hematócrito em reposição hormonal/TRT) pedem atenção clínica.',
  },
  // Leva 2 — saúde mental, fontes da IA, efeitos relatados, voz, pesquisa clínica
  {
    q: 'O questionário de saúde mental é diagnóstico?',
    a: 'Não. O PHQ-9 e o GAD-7 são rastreamentos validados, usados no mundo inteiro: eles medem como você andou se sentindo em 2 minutos. O resultado é educativo e vai junto pro seu médico. Se em algum momento você pensar em se machucar, procure ajuda na hora: CVV, ligação gratuita 188, 24 horas.',
  },
  {
    q: 'De onde vêm as fontes que a IA cita?',
    a: 'Das sociedades médicas de referência: SBC (cardiologia), SBD (diabetes) e ADA, entre outras. Cada resposta traz um rodapé "Fontes" com a diretriz usada — sempre à vista, pra você conferir de onde veio cada orientação.',
  },
  {
    q: 'O que são os "efeitos mais relatados" do meu remédio?',
    a: 'É um painel com os efeitos que mais aparecem nos relatos do mundo inteiro sobre aquele remédio — da base pública da FDA (agência americana), traduzido pra português. Importante: são relatos espontâneos, não uma previsão do que vai acontecer com você. Use pra informar a conversa com seu médico ou farmacêutico.',
  },
  {
    q: 'A voz funciona no meu celular?',
    a: 'No app Android e nos navegadores Chrome você pode ditar a pergunta no chat em vez de digitar — o app entende português. Ele mostra o texto na tela e só envia depois que você confirma, nada vai por acidente.',
  },
  {
    q: 'Tem pesquisa clínica pra minha condição?',
    a: 'Seu médico encontra no portal as pesquisas clínicas recrutando no Brasil relacionadas ao seu perfil — uma via a mais de acesso a tratamento de ponta, indicada por quem acompanha você de perto.',
  },
];

// FAQ médico (dual-funnel — padrão faq-1 da ReUI adaptado): objeções de quem ATENDE.
// Não entra no JSON-LD da home (o schema continua só com as perguntas de paciente).
export const FAQ_MEDICO_ITEMS = [
  {
    q: 'Sou médico. Como começo?',
    a: 'Crie a conta com seu CRM: a área fica pronta em minutos e validamos o registro antes de liberar o atendimento — só médico real atende. Configure agenda e PIX, convide seus pacientes por link e os exames já chegam organizados no seu painel.',
  },
  {
    q: 'Como recebo pelas consultas?',
    a: 'Você define o valor e o paciente paga por PIX no card da consulta — R$ 120 vira R$ 96 no seu PIX, com repasse automático via Asaas (instituição de pagamento regulada pelo Banco Central). No plano Grátis a taxa é de 20%, só quando você recebe; o Pro (R$ 29,90/mês) soma prontuário, SOAP e export em PDF.',
  },
  {
    q: 'A IA escreve o prontuário no meu lugar?',
    a: 'Não. A transcrição vira um rascunho de SOAP que você revisa e aprova — nada sai sem o seu ok. O uso de IA como apoio fica registrado no documento (Res. CFM 2.454/2026), então o prontuário já nasce regularizado.',
  },
  {
    q: 'Meus pacientes me encontram por aqui?',
    a: 'Primeiro, os seus: você envia um convite por link e o paciente entra já compartilhando os exames. Além disso, médicos com portal ativo aparecem na busca Encontrar especialistas do app — descoberta, não marketplace: ninguém compra posição.',
  },
];

export const FaqSection = () => {
  const navigate = useNavigate();
  const [credits, setCredits] = useState(60);
  const [openIndex, setOpenIndex] = useState<number | false>(0);
  const [tab, setTab] = useState<'paciente' | 'medico'>('paciente');
  const items = tab === 'paciente' ? FAQ_ITEMS : FAQ_MEDICO_ITEMS;
  useEffect(() => { fetchPublicConfig().then((c) => setCredits(c.freeSignup)); }, []);
  return (
    <Box sx={{ bgcolor: 'background.paper', borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider', py: { xs: 8, md: 11 } }}>
      <Container maxWidth="md">
        <Reveal>
          <Box sx={{ textAlign: 'center', mb: 5 }}>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 px-3 py-1 text-xs font-bold text-teal-700 dark:text-teal-300 mb-2.5">
              <HelpCircle className="size-3.5" />
              <span>Dúvidas Frequentes</span>
            </div>
            <Typography variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em', fontFamily: 'Poppins, sans-serif' }}>
              Tudo o que você precisa saber
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 17, maxWidth: 560, mx: 'auto' }}>
              Saúde e IA geram perguntas: a gente responde direto ao ponto com total transparência.
            </Typography>
          </Box>
        </Reveal>

        {/* Tabs dual-funnel (faq-1): a objeção certa pro público certo */}
        <Reveal delay={40}>
          <div className="mb-6 flex justify-center gap-2">
            {([['paciente', 'Sou paciente'], ['medico', 'Sou médico']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => { setTab(id); setOpenIndex(0); }}
                aria-pressed={tab === id}
                className={`rounded-full px-4 py-2 text-sm font-bold transition-colors cursor-pointer ${
                  tab === id
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Reveal>

        <Reveal delay={80}>
          <div className="space-y-2.5">
            {items.map((item, i) => {
              const isOpen = openIndex === i;
              return (
                <div
                  key={i}
                  className={`overflow-hidden rounded-2xl border transition-all ${
                    isOpen
                      ? 'border-teal-500/50 bg-teal-500/[0.03] shadow-xs'
                      : 'border-border/70 bg-card hover:border-border'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? false : i)}
                    className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors cursor-pointer"
                  >
                    <span className="font-heading text-[15px] sm:text-base font-bold text-foreground">
                      {item.q}
                    </span>
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-transform ${
                        isOpen ? 'rotate-180 text-teal-600' : ''
                      }`}
                    >
                      <ChevronDown className="size-4" />
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 text-sm sm:text-[14.5px] leading-relaxed text-muted-foreground border-t border-border/40">
                      {item.q === 'Preciso pagar para testar?'
                        ? `Não. Envie seu primeiro exame (PDF ou foto) e ganhe ${credits} créditos grátis, sem cartão. Use para conversar com a IA, gerar relatórios e perguntar ao médico.`
                        : item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Reveal>

        <Reveal delay={120}>
          <Box sx={{ textAlign: 'center', mt: 4.5 }}>
            <Typography sx={{ color: 'text.secondary', fontSize: 15, mb: 1.5 }}>
              {tab === 'paciente' ? 'Ainda com dúvidas? Teste sem compromisso na prática.' : 'Quer ver o portal funcionando antes de criar conta?'}
            </Typography>
            {tab === 'paciente' ? (
              <button
                type="button"
                onClick={() => navigate('/registrar')}
                className="inline-flex items-center gap-2 rounded-full bg-teal-600 px-6 py-2.5 text-sm font-extrabold text-white shadow-xs transition-all hover:bg-teal-700 hover:shadow-sm cursor-pointer"
              >
                <span>Começar grátis</span>
                <ArrowRight className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/para-medicos')}
                className="inline-flex items-center gap-2 rounded-full bg-teal-600 px-6 py-2.5 text-sm font-extrabold text-white shadow-xs transition-all hover:bg-teal-700 hover:shadow-sm cursor-pointer"
              >
                <span>Como funciona para médicos</span>
                <ArrowRight className="size-4" />
              </button>
            )}
          </Box>
        </Reveal>
      </Container>
    </Box>
  );
};
