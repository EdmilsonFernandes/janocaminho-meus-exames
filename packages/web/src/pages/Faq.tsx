import { useMemo, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Button, Chip, Container,
  InputAdornment, Link as MuiLink, TextField, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import { useNavigate } from 'react-router-dom';
import { DrExame } from '../components/DrExame';

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
  { cat: 'exames', q: 'A IA pode inventar valores?', a: 'Os valores saem direto do seu laudo — a IA só explica o que já está escrito. Antes de salvar, você confere tudo o que foi extraído e corrige se precisar.' },
  { cat: 'exames', q: 'Funciona sem internet?', a: 'Sim. Seus últimos exames e dados ficam disponíveis offline no app; quando a conexão volta, tudo sincroniza automaticamente.' },
  // Médico
  { cat: 'medico', q: 'Como compartilho meus exames com meu médico?', a: 'No app, escolha o que compartilhar e indique o CRM do médico. Ele recebe acesso de leitura — exames, valores alterados e relatório — sem precisar cadastrar nada.' },
  { cat: 'medico', q: 'O que o médico vê exatamente?', a: 'Você escolhe o escopo: exames, alterados, relatório e evolução. No portal, o médico ainda recebe um brief de pré-consulta com as principais mudanças desde a última visita e as perguntas que você fez no app.' },
  { cat: 'medico', q: 'Posso cancelar o compartilhamento?', a: 'Sim, a qualquer momento e com um toque. Ao revogar, o médico perde o acesso na hora.' },
  // Privacidade
  { cat: 'privacidade', q: 'Meus dados de saúde estão seguros?', a: 'Sim. Seguimos a LGPD: dados de identificação são criptografados, os PDFs dos exames ficam armazenados fora do banco de dados e o acesso é exclusivamente seu — e de quem você autorizar.' },
  { cat: 'privacidade', q: 'Quem pode ver meus exames?', a: 'Só você — e os médicos que você autorizar explicitamente, com o escopo que você definir. Nada é compartilhado sem o seu ato.' },
  { cat: 'privacidade', q: 'Como excluo meus dados?', a: 'Você pode excluir exames individualmente dentro do app ou pedir a exclusão completa da conta pelo suporte — removemos seus dados em conformidade com a LGPD.' },
];

/** Perguntas frequentes — acessível sem login (landing / Play Store / suporte). */
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
    <Box sx={{ background: 'background.default', minHeight: '100vh', py: { xs: 3, md: 5 } }}>
      <Container maxWidth="md" sx={{ background: 'background.paper', borderRadius: '14px', p: { xs: 2.5, md: 4 }, boxShadow: 1 }}>
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <DrExame size={56} sx={{ borderRadius: '18%' }} />
          <Typography variant="h5" sx={{ fontWeight: 800, mt: 1 }}>Perguntas frequentes</Typography>
          <Typography variant="body2" color="text.secondary">Tudo sobre exames, IA, planos e privacidade — direto ao ponto</Typography>
        </Box>

        <TextField
          fullWidth
          size="small"
          placeholder="Busque sua dúvida… (ex.: créditos, PDF, médico)"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setExpanded(false); }}
          sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: 'background.default' } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center', mb: 3 }}>
          {CATEGORIES.map(({ id, label }) => (
            <Chip
              key={id}
              label={label}
              clickable
              onClick={() => { setCategory(id); setExpanded(false); }}
              sx={{
                borderRadius: '999px',
                fontWeight: 600,
                ...(id === category
                  ? { background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff' }
                  : { bgcolor: 'background.default' }),
              }}
            />
          ))}
        </Box>

        {filtered.length === 0 ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            Nenhuma pergunta encontrada com esse termo. Tente outra palavra ou fale com o suporte.
          </Typography>
        ) : (
          filtered.map(({ index, q, a }) => (
            <Accordion
              key={index}
              expanded={expanded === index}
              onChange={(_, isOpen) => setExpanded(isOpen ? index : false)}
              disableGutters
              sx={{
                mb: 1.5,
                borderRadius: '14px !important',
                border: '1px solid',
                borderColor: 'divider',
                boxShadow: 'none',
                '&:before': { display: 'none' },
                '&:hover': { boxShadow: '0 6px 18px rgba(32,178,170,0.12)' },
              }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#20b2aa' }} />} sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
                {q}
              </AccordionSummary>
              <AccordionDetails sx={{ color: 'text.secondary', lineHeight: 1.7, pt: 0 }}>{a}</AccordionDetails>
            </Accordion>
          ))
        )}

        <Box sx={{ textAlign: 'center', mt: 4, p: 2.5, border: '1px solid', borderColor: 'divider', borderRadius: '14px' }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>Ainda com dúvidas?</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Abra um chamado no app (Suporte) ou fale com a gente por e-mail.</Typography>
          <Button
            variant="contained"
            href="mailto:contato@janocaminho.com.br"
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '12px', px: 4 }}
          >
            Falar com o suporte
          </Button>
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 2 }}>
          <MuiLink onClick={() => navigate('/landing')} sx={{ cursor: 'pointer', fontWeight: 700 }}>← Voltar ao início</MuiLink>
          {' · '}Meus Exames — análise educativa, não substitui avaliação médica.
        </Typography>
      </Container>
    </Box>
  );
};
