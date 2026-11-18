import { useMemo, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Link as MuiLink, Typography,
} from '@mui/material';
import { useNavigate, useSearchParams, Link as RouterLink } from 'react-router-dom';
import { Title } from 'react-admin';
import { DrExame } from '../components/DrExame';
import { PageContainer } from '../components/layout/PageContainer';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';
import {
  ArrowLeft, Search, HelpCircle, LifeBuoy, Mail, ChevronDown,
  Sparkles, CreditCard, User, FileText, ShieldCheck, Stethoscope,
  ArrowRight, Layers, MessageSquare,
} from 'lucide-react';

type FaqCategory = 'comecando' | 'planos' | 'conta' | 'exames' | 'confianca' | 'medico' | 'privacidade';

interface FaqEntry {
  q: string;
  a: string;
  cat: FaqCategory;
  /** Link opcional no fim da resposta (deep-link interno, ex.: /como-validamos). */
  linkTo?: string;
  linkLabel?: string;
}

const CATEGORIES: { id: FaqCategory | 'all'; label: string; icon: typeof Layers }[] = [
  { id: 'all', label: 'Todas', icon: Layers },
  { id: 'comecando', label: 'Começando', icon: Sparkles },
  { id: 'planos', label: 'Créditos & planos', icon: CreditCard },
  { id: 'conta', label: 'Conta', icon: User },
  { id: 'exames', label: 'Exames & IA', icon: FileText },
  { id: 'confianca', label: 'Como validamos', icon: ShieldCheck },
  { id: 'medico', label: 'Médico', icon: Stethoscope },
  { id: 'privacidade', label: 'Privacidade', icon: ShieldCheck },
];

const CAT_LABELS: Record<FaqCategory, string> = {
  comecando: 'Começando',
  planos: 'Créditos & planos',
  conta: 'Conta',
  exames: 'Exames & IA',
  confianca: 'Como validamos',
  medico: 'Médico',
  privacidade: 'Privacidade',
};

const FAQ: FaqEntry[] = [
  // Começando
  { cat: 'comecando', q: 'O que é o Dr. Exame?', a: 'É o app que guarda, interpreta e monitora seus exames. Você envia o laudo e a IA explica cada valor em linguagem simples, compara com a sua faixa ideal (não só a de referência), mostra a evolução entre exames e gera um relatório pra levar ao médico.' },
  { cat: 'comecando', q: 'Preciso pagar pra começar?', a: 'Não. Crie sua conta grátis e envie seu primeiro exame. Você assina ou compra créditos só quando precisar de mais — comece grátis, pague só pelo que usar.' },
  { cat: 'comecando', q: 'Como envio meu exame?', a: 'Envie o PDF do laboratório (ideal) ou uma foto do laudo. A extração lê os valores automaticamente e você confere antes de salvar. PDF com vários exames de datas diferentes? O app divide em exames separados sozinho.' },
  // Créditos & planos
  { cat: 'planos', q: 'Como funcionam os créditos?', a: 'Enviar exames é grátis. Recursos que consomem mais processamento — como relatório inteligente e o chat com a IA — usam créditos. Você ganha créditos bônus ao começar e ao completar conquistas, e pode comprar mais via PIX a qualquer momento.' },
  { cat: 'planos', q: 'O que muda com o plano mensal?', a: 'O plano mensal libera o uso dos recursos premium com cota mensal generosa — sem ficar contando crédito por crédito. Cancele quando quiser, direto no app, sem multa.' },
  { cat: 'planos', q: 'Como funciona o programa de indicação?', a: 'Compartilhe seu código com amigos. Quando alguém cria a conta usando ele, vocês dois ganham créditos bônus pra usar no app.' },
  // Conta
  { cat: 'conta', q: 'Esqueci minha senha, e agora?', a: 'Toque em "Esqueci minha senha" na tela de login e informe seu e-mail. Você recebe um link de redefinição — por segurança, o link é de uso único e expira.' },
  { cat: 'conta', q: 'Posso entrar com o Google?', a: 'Sim — no app Android e no navegador. É a mesma conta nos dois: seus exames ficam sincronizados onde você entrar.' },
  { cat: 'conta', q: 'Dá pra gerenciar exames de familiares?', a: 'Dá. Cada familiar entra como dependente, com histórico e evolução próprios — e você alterna entre as pessoas no painel da família.' },
  // Exames & IA
  { cat: 'exames', q: 'A IA dá diagnóstico?', a: 'Não — e isso é por design. A IA educa: compara seus valores com a faixa de referência e com a faixa ideal, contextualiza pelo seu perfil e monta perguntas pra levar ao médico. A decisão clínica é sempre do profissional.' },
  { cat: 'exames', q: 'Como vocês validam a análise?', a: 'A checagem de valores é determinística (regras com a faixa do seu laboratório), a IA só explica — e cada regra tem fonte pública.', linkTo: '/como-validamos', linkLabel: 'Veja a página completa com as fontes' },
  // Como validamos (destilado da página /como-validamos — que sai do menu e vive aqui + link)
  { cat: 'confianca', q: 'De onde vêm os valores e as faixas?', a: 'Os valores saem do laudo que você enviou, nunca de "memória" da IA. As faixas usadas na comparação vêm do próprio laboratório e, quando o laudo não traz, de fontes médicas de referência.' },
  { cat: 'confianca', q: 'O que a IA faz — e o que ela nunca faz?', a: 'A IA explica, contextualiza pelo seu perfil e monta perguntas pra levar ao médico. Ela nunca diagnostica, nunca prescreve e nunca inventa valores: a checagem é feita por regras antes de qualquer texto (alinhado à ANVISA RDC 657/2022).' },
  { cat: 'confianca', q: 'Como meus dados são tratados?', a: 'Seguimos a LGPD: dados de identificação são criptografados, os PDFs ficam fora do banco de dados e nada é compartilhado sem o seu ato — nem com médicos, sem autorização explícita.' },
  { cat: 'confianca', q: 'Por que não colar meu exame num chatbot grátis?', a: 'Aqui cada número que você vê é rastreável até o laudo, com faixa e fonte — e seus dados de saúde não viram conteúdo de treinamento. Num chat genérico, nada disso é garantido.' },
  { cat: 'exames', q: 'A IA pode inventar valores?', a: 'Os valores saem direto do seu laudo — a IA só explica o que já está escrito. Antes de salvar, você confere tudo o que foi extraído e corrige se precisar.' },
  { cat: 'exames', q: 'Funciona sem internet?', a: 'Sim. Seus últimos exames e dados ficam disponíveis offline no app; quando a conexão volta, tudo sincroniza automaticamente.' },
  { cat: 'exames', q: 'Meu exame não foi adicionado (CPF divergente). E agora?', a: 'Quando o CPF do documento é diferente do CPF da conta, o exame fica de fora das suas análises — é a proteção contra exames de outra pessoa. Se o documento é seu, toque em "Acredito que houve um erro" no aviso do exame: a leitura automática pode errar em documentos ilegíveis e o suporte confere o arquivo original.' },
  // Médico
  { cat: 'medico', q: 'Como compartilho meus exames com meu médico?', a: 'No app, escolha o que compartilhar e indique o CRM do médico. Ele recebe acesso de leitura — exames, valores alterados e relatório — sem precisar cadastrar nada.' },
  { cat: 'medico', q: 'O que o médico vê exatamente?', a: 'Você escolhe o escopo: exames, alterados, relatório e evolução. No portal, o médico ainda recebe um brief de pré-consulta com as principais mudanças desde a última visita e as perguntas que você fez no app.' },
  { cat: 'medico', q: 'Posso cancelar o compartilhamento?', a: 'Sim, a qualquer momento e com um toque. Ao revogar, o médico perde o acesso na hora.' },
  // Privacidade
  { cat: 'privacidade', q: 'Meus dados de saúde estão seguros?', a: 'Sim. Seguimos a LGPD: dados de identificação são criptografados, os PDFs dos exames ficam armazenados fora do banco de dados e o acesso é exclusivamente seu — e de quem você autorizar.' },
  { cat: 'privacidade', q: 'Quem pode ver meus exames?', a: 'Só você — e os médicos que você autorizar explicitamente, com o escopo que você definir. Nada é compartilhado sem o seu ato.' },
  { cat: 'privacidade', q: 'Como excluo meus dados?', a: 'Você pode baixar tudo ou excluir sua conta em Privacidade e dados — na hora, sem intermediário. A exclusão apaga exames, análises e perfil definitivamente.' },
  // Leva 2 — saúde mental, fontes da IA, efeitos relatados, voz, pesquisa clínica
  { cat: 'exames', q: 'O questionário de saúde mental é diagnóstico?', a: 'Não. O PHQ-9 e o GAD-7 são rastreamentos validados, usados no mundo inteiro: medem como você andou se sentindo em 2 minutos. O resultado é educativo e vai junto pro seu médico. Se em algum momento você pensar em se machucar, procure ajuda na hora: CVV, ligação gratuita 188, 24 horas.' },
  { cat: 'confianca', q: 'De onde vêm as fontes que a IA cita?', a: 'Das sociedades médicas de referência: SBC (cardiologia), SBD (diabetes) e ADA, entre outras. Cada resposta traz um rodapé "Fontes" com a diretriz usada — sempre à vista, pra você conferir de onde veio cada orientação.', linkTo: '/como-validamos', linkLabel: 'Como validamos cada análise' },
  { cat: 'confianca', q: 'O que são os "efeitos mais relatados" do meu remédio?', a: 'É um painel com os efeitos que mais aparecem nos relatos do mundo inteiro sobre aquele remédio — da base pública da FDA (agência americana), em português. Importante: são relatos espontâneos, não uma previsão do que vai acontecer com você. Use pra informar a conversa com seu médico ou farmacêutico.' },
  { cat: 'exames', q: 'A voz funciona no meu celular?', a: 'No app Android e nos navegadores Chrome você pode ditar a pergunta no chat em vez de digitar — o app entende português. Ele mostra o texto na tela e só envia depois que você confirma, nada vai por acidente.' },
  { cat: 'medico', q: 'Tem pesquisa clínica pra minha condição?', a: 'Seu médico encontra no portal as pesquisas clínicas recrutando no Brasil relacionadas ao seu perfil — uma via a mais de acesso a tratamento de ponta, indicada por quem acompanha você de perto.' },
];

/** 3 perguntas de acesso rápido no topo */
const QUICK_HIGHLIGHTS = [
  { index: 0, tag: 'O básico', title: 'O que é o Dr. Exame?', preview: 'Guarda, interpreta e monitora seus exames com IA clínica.' },
  { index: 1, tag: 'Planos', title: 'Preciso pagar pra começar?', preview: 'Não. Comece 100% grátis e envie seu primeiro exame.' },
  { index: 2, tag: 'Envio', title: 'Como envio meu exame?', preview: 'Envie PDF ou foto do laudo — leitura automática na hora.' },
];

/**
 * Perguntas frequentes — tela do Dr. Exame com layout premium e ReUI.
 * Suporte in-app direcionado para /suporte e canal de e-mail integrado.
 */
export const FaqPage = () => {
  useReuiThemeSync();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const [category, setCategory] = useState<FaqCategory | 'all'>('all');
  const [expanded, setExpanded] = useState<number | false>(false);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return FAQ.map((entry, index) => ({ ...entry, index })).filter(({ q, a, cat }) => {
      const matchesCategory = category === 'all' || cat === category;
      const matchesSearch = !term || q.toLowerCase().includes(term) || a.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [query, category]);

  const handleSelectQuick = (idx: number) => {
    setCategory('all');
    setQuery('');
    setExpanded(idx);
    setTimeout(() => {
      const el = document.getElementById(`faq-item-${idx}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  };

  return (
    <PageContainer width={740}>
      <Title title="Dúvidas frequentes" />

      {/* ── HERO BANNER ELEVADO COM GRADIENTE ── */}
      <div className="relative mb-5 overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-[#0a4d47] via-[#0d9488] to-[#20b2aa] p-4 sm:p-6 text-white shadow-lg">
        {/* Glow de fundo */}
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 size-60 rounded-full bg-teal-300/15 blur-2xl" />

        <div className="relative z-10">
          <div className="mb-3.5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-3 py-1.5 text-xs font-bold text-white shadow-xs backdrop-blur-md transition-all hover:bg-white/25 cursor-pointer"
            >
              <ArrowLeft className="size-3.5" />
              <span>Voltar</span>
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[10.5px] sm:text-[11px] font-bold text-white backdrop-blur-md">
              Central de Ajuda · Dr. Exame
            </span>
          </div>

          <div className="flex items-center gap-3 mb-2">
            <div className="relative flex size-11 sm:size-13 shrink-0 items-center justify-center rounded-2xl bg-white/15 border border-white/30 backdrop-blur-md shadow-md">
              <DrExame size={34} sx={{ borderRadius: '50%' }} />
            </div>
            <div className="min-w-0">
              <h1 className="font-heading text-lg sm:text-2xl font-black tracking-tight text-white leading-tight">
                Perguntas Frequentes
              </h1>
              <p className="text-xs sm:text-sm text-teal-50 font-medium truncate">
                {FAQ.length} respostas · Exames, IA, planos e segurança
              </p>
            </div>
          </div>

          {/* Mini estatísticas da central */}
          <div className="mt-3.5 flex items-center gap-4 sm:gap-6 pt-3 border-t border-white/15">
            <div>
              <div className="text-base sm:text-xl font-black text-white leading-none">{FAQ.length}</div>
              <div className="text-[10.5px] sm:text-[11px] text-teal-100 font-medium mt-0.5">Respostas</div>
            </div>
            <div className="h-5 sm:h-6 w-px bg-white/20" />
            <div>
              <div className="text-base sm:text-xl font-black text-white leading-none">{CATEGORIES.length - 1}</div>
              <div className="text-[10.5px] sm:text-[11px] text-teal-100 font-medium mt-0.5">Categorias</div>
            </div>
            <div className="h-5 sm:h-6 w-px bg-white/20" />
            <div>
              <div className="text-base sm:text-xl font-black text-white leading-none">&lt; 1 dia</div>
              <div className="text-[10.5px] sm:text-[11px] text-teal-100 font-medium mt-0.5">Suporte rápido</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── CAMPO DE BUSCA FLUTUANTE ── */}
      <div className="relative mb-5 -mt-3 px-1">
        <div className="relative flex items-center rounded-2xl border border-border/80 bg-card p-1.5 shadow-md shadow-teal-950/5 transition-all focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-600/20">
          <Search className="absolute left-4 size-4.5 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            placeholder="Busque sua dúvida… créditos, PDF, médico, LGPD…"
            aria-label="Buscar dúvida no FAQ"
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setQuery(e.target.value);
              setExpanded(false);
            }}
            className="w-full rounded-xl bg-transparent py-2 pl-10 pr-4 text-xs sm:text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="mr-2 text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* ── CATEGORIAS (PILLS COM ÍCONES) ── */}
      <div className="mb-6 flex gap-1.5 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar sm:flex-wrap">
        {CATEGORIES.map(({ id, label, icon: Icon }) => {
          const active = id === category;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setCategory(id);
                setExpanded(false);
              }}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                active
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'border border-border/80 bg-card text-muted-foreground hover:border-teal-500/40 hover:text-foreground'
              }`}
            >
              <Icon className="size-3.5" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* ── QUICK HIGHLIGHTS (PERGUNTAS MAIS COMUNS) ── */}
      {!query && category === 'all' && (
        <div className="mb-7">
          <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Perguntas mais comuns
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {QUICK_HIGHLIGHTS.map((item) => (
              <div
                key={item.index}
                onClick={() => handleSelectQuick(item.index)}
                className="group cursor-pointer rounded-2xl border border-border/80 bg-card p-3.5 shadow-2xs transition-all hover:-translate-y-0.5 hover:border-teal-500/40 hover:shadow-md"
              >
                <div className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-teal-600 dark:text-teal-400">
                  {item.tag}
                </div>
                <div className="text-xs sm:text-[13px] font-bold text-foreground group-hover:text-teal-600 transition-colors line-clamp-1">
                  {item.title}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                  {item.preview}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── LISTA DE PERGUNTAS COM ACCORDION ELEVADO ── */}
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? 'pergunta encontrada' : 'perguntas'}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border/80 bg-card p-8 text-center">
          <HelpCircle className="mx-auto mb-2 size-8 text-muted-foreground/60" />
          <Typography color="text.secondary" sx={{ fontSize: 13.5 }}>
            Nenhuma pergunta encontrada com esse termo. Tente outra palavra ou fale direto com nosso suporte.
          </Typography>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(({ index, q, a, cat, linkTo, linkLabel }, i) => {
            const isOpen = expanded === index;
            return (
              <Accordion
                key={index}
                id={`faq-item-${index}`}
                expanded={isOpen}
                onChange={(_, open) => setExpanded(open ? index : false)}
                disableGutters
                sx={{
                  borderRadius: '16px !important',
                  border: '1px solid',
                  borderColor: isOpen ? 'rgba(13,148,136,0.45)' : 'divider',
                  bgcolor: 'background.paper',
                  boxShadow: isOpen ? '0 4px 18px rgba(13,148,136,0.08)' : '0 1px 3px rgba(0,0,0,0.02)',
                  overflow: 'hidden',
                  transition: 'border-color .2s ease, box-shadow .2s ease',
                  '&:before': { display: 'none' },
                  '&:hover': {
                    borderColor: 'rgba(13,148,136,0.3)',
                    boxShadow: '0 4px 14px rgba(13,148,136,0.06)',
                  },
                }}
              >
                <AccordionSummary
                  sx={{
                    px: 2,
                    py: 1,
                    minHeight: 52,
                    '& .MuiAccordionSummary-content': { my: 0.75, alignItems: 'center' },
                  }}
                >
                  <div className="flex w-full items-center gap-2.5">
                    {/* Barra de destaque vertical à esquerda */}
                    <div
                      className={`h-7 w-1 shrink-0 rounded-full transition-colors ${
                        isOpen ? 'bg-teal-600' : 'bg-muted-foreground/20'
                      }`}
                    />
                    <div className="flex-1 min-w-0 pr-1">
                      <div className={`text-xs sm:text-[13.5px] font-semibold transition-colors ${
                        isOpen ? 'text-teal-600 dark:text-teal-400 font-bold' : 'text-foreground'
                      }`}>
                        {q}
                      </div>
                    </div>
                    {/* Tag de categoria */}
                    <span className="hidden sm:inline-flex shrink-0 items-center rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-bold text-teal-700 dark:text-teal-300">
                      {CAT_LABELS[cat] || cat}
                    </span>
                    {/* Ícone de expansão */}
                    <div className={`flex size-6 shrink-0 items-center justify-center rounded-full transition-transform duration-200 ${
                      isOpen ? 'rotate-180 bg-teal-500/15 text-teal-600' : 'bg-muted/50 text-muted-foreground'
                    }`}>
                      <ChevronDown className="size-3.5" />
                    </div>
                  </div>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 2.5, pb: 2.25, pt: 0.5, borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                  <Typography
                    sx={{
                      color: 'text.secondary',
                      fontSize: 13,
                      lineHeight: 1.7,
                      pl: 1.75,
                    }}
                  >
                    {a}
                  </Typography>
                  {linkTo && (
                    <Box sx={{ pl: 1.75, mt: 1.5 }}>
                      <MuiLink
                        component={RouterLink}
                        to={linkTo}
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.5,
                          fontWeight: 700,
                          fontSize: 12.5,
                          color: '#0d9488',
                          textDecoration: 'none',
                          '&:hover': { textDecoration: 'underline' },
                        }}
                      >
                        <span>{linkLabel ?? 'Saiba mais'}</span>
                        <ArrowRight className="size-3.5" />
                      </MuiLink>
                    </Box>
                  )}
                </AccordionDetails>
              </Accordion>
            );
          })}
        </div>
      )}

      {/* ── CARD PREMIUM DE SUPORTE IN-APP ── */}
      <div className="relative mt-8 overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-[#0a4d47] to-[#0d9488] p-5 sm:p-6 text-white shadow-lg">
        {/* Glow de fundo */}
        <div className="pointer-events-none absolute -right-10 -bottom-10 size-48 rounded-full bg-white/10 blur-xl" />

        <div className="relative z-10 space-y-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-white/15 border border-white/20 backdrop-blur-md">
            <LifeBuoy className="size-5.5 text-white" />
          </div>

          <div>
            <h2 className="font-heading text-lg sm:text-xl font-extrabold text-white">
              Ainda com dúvidas?
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-teal-50/90 leading-relaxed max-w-lg">
              Abra um chamado direto no app — você acompanha a resposta por aqui e por notificação em até 1 dia útil.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => navigate('/suporte')}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs sm:text-sm font-extrabold text-teal-800 shadow-md transition-all hover:bg-teal-50 hover:shadow-lg active:scale-98 cursor-pointer"
            >
              <MessageSquare className="size-4 text-teal-700" />
              <span>Falar com o suporte</span>
              <ArrowRight className="size-3.5 text-teal-700" />
            </button>
            <a
              href="mailto:contato@janocaminho.com.br"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-3.5 py-2.5 text-xs sm:text-sm font-bold text-white backdrop-blur-md transition-colors hover:bg-white/20"
            >
              <Mail className="size-4" />
              <span>Enviar e-mail</span>
            </a>
          </div>
        </div>
      </div>

      {/* ── RODAPÉ INFORMATIVO ── */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Mail className="size-3.5 text-teal-600" />
          Prefere e-mail?{' '}
          <MuiLink href="mailto:contato@janocaminho.com.br" sx={{ fontWeight: 700, color: 'inherit' }}>
            contato@janocaminho.com.br
          </MuiLink>
        </span>
        <span>Dr. Exame — análise educativa</span>
      </div>
    </PageContainer>
  );
};
