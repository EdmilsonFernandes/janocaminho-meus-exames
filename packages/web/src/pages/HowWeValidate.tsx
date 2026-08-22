import {
  Box, Button, Card, CardContent, Chip, Container, Typography,
} from '@mui/material';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import RuleIcon from '@mui/icons-material/Rule';
import ChildCareIcon from '@mui/icons-material/ChildCare';
import BlockIcon from '@mui/icons-material/Block';
import LockIcon from '@mui/icons-material/Lock';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { useNavigate } from 'react-router-dom';
import { DrExame } from '../components/DrExame';

/** Página pública "Como validamos" (D4 — confiança estrutural): cada regra com fonte,
 *  o que a IA faz e o que nunca faz, privacidade. Contra marketing de fachada (claims de
 *  acurácia sem metodologia), a transparência é o posicionamento — nada aqui é claim vazio. */

interface Section {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  cite?: string;
}

const SECTIONS: Section[] = [
  {
    icon: <FactCheckIcon sx={{ color: '#20b2aa' }} />,
    title: '1 · Valores do laudo, nunca da imaginação',
    body: <>A extração lê o <b>texto do PDF</b> do seu exame (não imagem, não palpite). Todo valor exibido no app veio do laudo que você enviou — e antes de salvar, <b>você confere item por item</b> e corrige o que precisar. A IA explica o que já está escrito; não inventa número.</>,
  },
  {
    icon: <RuleIcon sx={{ color: '#20b2aa' }} />,
    title: '2 · Regras primeiro, IA depois',
    body: <>A checagem de "normal / alterado" é <b>determinística</b>: comparação de valor contra faixa de referência, feita por regras — o mesmo valor sempre dá o mesmo resultado, sem variação de humor de modelo. A IA entra depois, para <b>explicar e contextualizar</b>, com um filtro que bloqueia linguagem de diagnóstico.</>,
  },
  {
    icon: <ChildCareIcon sx={{ color: '#20b2aa' }} />,
    title: '3 · Faixas de referência com fonte',
    body: <>A régua que vale é a <b>do seu laboratório</b> — está impressa no laudo e é ela que usamos. Para crianças e adolescentes, quando o laudo não traz faixa própria da idade, aplicamos bandas pediátricas por analito e marcamos o item com um selo <Chip size="small" label="Pediátrico" sx={{ height: 18, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(32,178,170,.14)', color: '#178f89' }} /> indicando a faixa usada. Se você digitar uma faixa manual, <b>a sua edição vence sempre</b>.</>,
    cite: 'Bandas pediátricas aproximadas do The Harriet Lane Handbook (Johns Hopkins Hospital, 22ª ed.) — quando aplicadas, o selo no item indica a faixa etária usada.',
  },
  {
    icon: <BlockIcon sx={{ color: '#20b2aa' }} />,
    title: '4 · O que a IA nunca faz',
    body: <>Não diagnostica, não prescreve, não substitui seu médico. O Dr. Exame é uma ferramenta <b>educativa</b>: explica valores, mostra tendências e monta as perguntas certas pra sua consulta — a decisão clínica é sempre do profissional de saúde. Nos alinhamos à linha regulatória da ANVISA que separa software educativo de dispositivo de diagnóstico.</>,
    cite: 'ANVISA, RDC nº 657/2022 — requisitos para software como dispositivo médico (SaMD); o Dr. Exame se posiciona como ferramenta educativa, fora do escopo de diagnóstico.',
  },
  {
    icon: <LockIcon sx={{ color: '#20b2aa' }} />,
    title: '5 · Seus dados são seus',
    body: <>Seguimos a <b>LGPD</b>: dados de identificação (como CPF) são armazenados <b>criptografados</b>, os PDFs dos exames ficam fora do banco de dados, e o acesso é seu — e de quem você autorizar explicitamente. Você pode excluir exames individualmente ou pedir a exclusão completa da conta a qualquer momento.</>,
    cite: 'Lei nº 13.709/2018 (Lei Geral de Proteção de Dados) — dado de saúde é dado sensível: tratamos com criptografia e minimização.',
  },
  {
    icon: <CompareArrowsIcon sx={{ color: '#20b2aa' }} />,
    title: '6 · Por que não só colar num chatbot grátis',
    body: <>Um chatbot genérico não lembra seu exame anterior, não conhece seu perfil, não guarda sua família — e estudos vêm mostrando que <b>sem contexto clínico a qualidade da resposta cai</b>, pior ainda em português. O Dr. Exame cruza seus exames ao longo do tempo, o perfil de cada familiar e as perguntas que você já fez — e entrega um relatório que seu médico consegue usar.</>,
  },
];

export const HowWeValidatePage = () => {
  const navigate = useNavigate();
  return (
    <Box sx={{ background: 'background.default', minHeight: '100vh', py: { xs: 3, md: 5 } }}>
      <Container maxWidth="md">
        <Box sx={{ textAlign: 'center', mb: 3, background: 'background.paper', borderRadius: '14px', p: { xs: 2.5, md: 4 }, boxShadow: 1 }}>
          <DrExame size={56} sx={{ borderRadius: '18%' }} />
          <Typography variant="h5" sx={{ fontWeight: 800, mt: 1 }}>Como validamos</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 480, mx: 'auto', mt: 0.5 }}>
            Sem promessa mágica de acurácia: cada regra do Dr. Exame, com a fonte dela. É assim que acreditamos que ferramenta de saúde se constrói.
          </Typography>
        </Box>

        {SECTIONS.map((s) => (
          <Card key={s.title} variant="outlined" sx={{ mb: 1.5, borderRadius: '14px', '&:hover': { boxShadow: '0 6px 18px rgba(32,178,170,0.12)' } }}>
            <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', py: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ mt: 0.5, flexShrink: 0 }}>{s.icon}</Box>
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: '0.98rem', mb: 0.75 }}>{s.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>{s.body}</Typography>
                {s.cite && (
                  <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.disabled', fontStyle: 'italic', lineHeight: 1.5 }}>
                    {s.cite}
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        ))}

        <Box sx={{ textAlign: 'center', mt: 3, mb: 2 }}>
          <Button
            variant="contained" onClick={() => navigate('/registrar')}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '12px', px: 4, mr: 1 }}
          >
            Criar conta grátis
          </Button>
          <Button onClick={() => navigate('/landing')} sx={{ textTransform: 'none', fontWeight: 700, color: '#178f89' }}>
            ← Voltar ao início
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            Meus Exames — análise educativa, não substitui avaliação médica.
          </Typography>
        </Box>
      </Container>
    </Box>
  );
};
