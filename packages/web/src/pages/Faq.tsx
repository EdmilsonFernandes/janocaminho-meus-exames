import { useMemo, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Chip,
  InputAdornment, Link as MuiLink, TextField, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useNavigate } from 'react-router-dom';
import { Title } from 'react-admin';
import { DrExame } from '../components/DrExame';
import { GradientButton } from '../components/GradientButton';
import { PageContainer } from '../components/layout/PageContainer';

type FaqCategory = 'comecando' | 'planos' | 'conta' | 'exames' | 'medico' | 'privacidade';

interface FaqEntry {
  q: string;
  a: string;
  cat: FaqCategory;
}

const CATEGORIES: { id: FaqCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'comecando', label: 'Começando' },
  { id: 'planos', label: 'Créditos & planos' },
  { id: 'conta', label: 'Conta' },
  { id: 'exames', label: 'Exames & IA' },
  { id: 'medico', label: 'Médico' },
  { id: 'privacidade', label: 'Privacidade' },
];

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
  { cat: 'exames', q: 'Como vocês validam a análise?', a: 'A checagem de valores é determinística (regras com a faixa do seu laboratório), a IA só explica — e cada regra tem fonte pública: veja a página Como validamos em /como-validamos.' },
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
];

/**
 * Perguntas frequentes — tela DO APP (rota com layout: header, voltar e menu — era noLayout,
 * "tela solta" com "voltar ao início" jogando pra landing). O suporte agora é IN-APP:
 * "Falar com o suporte" abre o painel de chamados (/suporte), sem sair pra e-mail.
 */
export const FaqPage = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FaqCategory | 'all'>('all');
  const [expanded, setExpanded] = useState<number | false>(false);

  // Todos os hooks ANTES de qualquer return (React #310).
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return FAQ.map((entry, index) => ({ ...entry, index })).filter(({ q, a, cat }) => {
      const matchesCategory = category === 'all' || cat === category;
      const matchesSearch = !term || q.toLowerCase().includes(term) || a.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [query, category]);

  return (
    <PageContainer width={720}>
      <Title title="Dúvidas frequentes" />

      {/* HERO — mascote + título integrados (antes: logo solto em cima, texto solto embaixo).
          Aura teal + flutuação sutil = assinatura de marca dos empty states; brilho diagonal
          discreto dá vida sem distrair. */}
      <Box sx={{
        position: 'relative', overflow: 'hidden', mb: 3,
        borderRadius: '18px', p: { xs: 2.5, md: 3.5 },
        background: 'linear-gradient(135deg,#20b2aa,#178f89)',
        color: '#fff',
        '&::after': {
          content: '""', position: 'absolute', inset: 0,
          background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,.14) 50%, transparent 60%)',
          transform: 'translateX(-120%)', animation: 'faqShine 5.5s ease-in-out infinite',
        },
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
          <Box sx={{
            width: 84, height: 84, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center',
            background: 'radial-gradient(circle at 50% 42%, rgba(255,255,255,.32), rgba(255,255,255,.08) 72%)',
            animation: 'faqFloat 3s ease-in-out infinite',
          }}>
            <DrExame size={54} sx={{ borderRadius: '50%' }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', opacity: 0.9 }}>
              Central de ajuda
            </Typography>
            <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: { xs: 24, md: 28 }, lineHeight: 1.15, mt: 0.25 }}>
              Perguntas frequentes
            </Typography>
            <Typography sx={{ opacity: 0.92, fontSize: 14, mt: 0.5 }}>
              Exames, IA, planos e privacidade — direto ao ponto. Não achou? O suporte abre um chamado aqui mesmo, no app.
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* BUSCA + CATEGORIAS */}
      <TextField
        fullWidth
        size="small"
        placeholder="Busque sua dúvida… (ex.: créditos, PDF, médico)"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setExpanded(false); }}
        sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2.5 }}>
        {CATEGORIES.map(({ id, label }) => (
          <Chip
            key={id}
            label={label}
            clickable
            onClick={() => { setCategory(id); setExpanded(false); }}
            sx={{
              borderRadius: '999px', fontWeight: 600,
              ...(id === category
                ? { background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff' }
                : { bgcolor: 'background.default' }),
            }}
          />
        ))}
      </Box>

      {/* LISTA — entrada em cascata (stagger): a lista "chega" em vez de pipocar. */}
      {filtered.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          Nenhuma pergunta encontrada com esse termo. Tente outra palavra ou fale com o suporte.
        </Typography>
      ) : (
        filtered.map(({ index, q, a }, i) => (
          <Accordion
            key={index}
            expanded={expanded === index}
            onChange={(_, isOpen) => setExpanded(isOpen ? index : false)}
            disableGutters
            sx={{
              mb: 1.5, animation: `faqUp .45s cubic-bezier(.16,1,.3,1) both`, animationDelay: `${Math.min(i, 8) * 45}ms`,
              borderRadius: '14px !important',
              border: '1px solid', borderColor: expanded === index ? 'rgba(32,178,170,.45)' : 'divider',
              boxShadow: 'none',
              '&:before': { display: 'none' },
              transition: 'border-color .25s ease',
              '&:hover': { boxShadow: '0 6px 18px rgba(32,178,170,0.12)' },
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#20b2aa' }} />} sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
              {q}
            </AccordionSummary>
            <AccordionDetails sx={{ color: 'text.secondary', lineHeight: 1.7, pt: 0, animation: 'faqUp .3s ease both' }}>{a}</AccordionDetails>
          </Accordion>
        ))
      )}

      {/* SUPORTE IN-APP — ação primária única da tela (design system: 1 CTA por tela). */}
      <Box sx={{
        mt: 4, p: { xs: 2.5, md: 3 }, textAlign: 'center', position: 'relative', overflow: 'hidden',
        borderRadius: '18px',
        background: (t) => (t.palette.mode === 'dark' ? 'rgba(32,178,170,.10)' : 'linear-gradient(135deg, rgba(32,178,170,.10), rgba(212,165,116,.08))'),
        border: '1px solid', borderColor: 'rgba(32,178,170,.30)',
      }}>
        <SupportAgentIcon sx={{ fontSize: 34, color: '#178f89' }} />
        <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 18, mt: 0.5 }}>Ainda com dúvidas?</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 380, mx: 'auto', mb: 2 }}>
          Abra um chamado direto no app — você acompanha a resposta por aqui e por notificação. Resposta em até 1 dia útil.
        </Typography>
        <GradientButton onClick={() => navigate('/suporte')} endIcon={<ArrowForwardIcon />} sx={{ px: 4 }}>
          Falar com o suporte
        </GradientButton>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          Prefere e-mail? <MuiLink href="mailto:contato@janocaminho.com.br" sx={{ fontWeight: 700 }}>contato@janocaminho.com.br</MuiLink>
        </Typography>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 2.5 }}>
        Meus Exames — análise educativa, não substitui avaliação médica.
      </Typography>

      <style>{`
        @keyframes faqFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes faqUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes faqShine{0%,55%{transform:translateX(-120%)}80%,100%{transform:translateX(120%)}}
      `}</style>
    </PageContainer>
  );
};
