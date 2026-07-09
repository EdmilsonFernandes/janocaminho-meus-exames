import { useState } from 'react';
import { Box, Card, Typography, Button, Stack, Divider, Dialog, DialogTitle, DialogContent, Alert } from '@mui/material';
import { Title } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { TermsPage } from './Terms';

/** Página de Privacidade e Termos — separada do Perfil. */
export const PrivacyPage = () => {
  const navigate = useNavigate();
  const [termsOpen, setTermsOpen] = useState(false);
  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 780, mx: 'auto' }}>
      <Title title="Privacidade" />
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>🛡️ Privacidade e Termos</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Como seus dados são tratados e seus direitos (LGPD).</Typography>

      <Card sx={{ mb: 2, borderRadius: 3, background: 'background.default', border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary', mb: 1 }}>📋 Termos de Uso</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 13.5, lineHeight: 1.6, mb: 1.5 }}>
            O Meus Exames é um app de apoio à gestão de saúde pessoal. A análise gerada pela IA é <strong>educativa</strong> e <strong>não substitui</strong> consulta, diagnóstico ou tratamento médico. Em urgências, procure um serviço de saúde.
          </Typography>
          <Button variant="outlined" size="small" onClick={() => setTermsOpen(true)} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, borderColor: '#20b2aa', color: '#178f89' }}>
            Ler termos completos →
          </Button>
        </Box>
      </Card>

      <Card sx={{ mb: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary', mb: 1 }}>🧾 Antes de enviar um exame</Typography>
          <Alert severity="info" sx={{ mb: 1.5, borderRadius: 2 }}>
            Ao enviar PDF, foto ou usar a câmera, o arquivo e os dados de saúde são enviados ao Meus Exames para extração e análise educativa com IA.
          </Alert>
          <Stack spacing={1.25}>
            {[
              'A IA ajuda a organizar e explicar seus exames, mas não diagnostica, não prescreve e não substitui consulta médica.',
              'O processamento pode usar operadores necessários, como Z.ai/GLM para IA, Firebase para notificações, Sentry para erros e Mercado Pago para pagamentos.',
              'Você controla o compartilhamento com médicos; links usam PIN, expiram em 12 horas e podem ser revogados.',
              'Você pode apagar exames, exportar seus dados ou excluir a conta pelo Perfil.',
            ].map((t, i) => (
              <Stack key={i} direction="row" spacing={1.5} alignItems="flex-start">
                <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: 'rgba(51,104,134,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#336886', flexShrink: 0, mt: 0.2 }}>{i + 1}</Box>
                <Typography variant="body2" sx={{ color: 'text.primary', fontSize: 13.5, lineHeight: 1.5 }}>{t}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      </Card>

      <Card sx={{ mb: 2, borderRadius: 3 }}>
        <Box sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary', mb: 1 }}>🔐 LGPD (Lei Geral de Proteção de Dados)</Typography>
          <Stack spacing={1.5}>
            {[
              'Seus dados de saúde são tratados em ambiente controlado, com autenticação, HTTPS em produção e acesso restrito.',
              'Você controla quem acessa seus dados (compartilhamento com médicos é opcional e revogável).',
              'Você pode exportar todos os seus dados a qualquer momento (no Perfil).',
              'Você pode excluir sua conta e todos os dados permanentemente (no Perfil).',
              'Não vendemos seus dados; compartilhamos apenas com operadores necessários para IA, notificações, pagamentos, suporte e infraestrutura.',
            ].map((t, i) => (
              <Stack key={i} direction="row" spacing={1.5} alignItems="flex-start">
                <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: 'rgba(32,178,170,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#178f89', flexShrink: 0, mt: 0.2 }}>{i + 1}</Box>
                <Typography variant="body2" sx={{ color: 'text.primary', fontSize: 13.5, lineHeight: 1.5 }}>{t}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      </Card>

      <Card sx={{ borderRadius: 3, borderColor: 'error.main' }}>
        <Box sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, color: '#ef4444', mb: 0.5 }}>⚙️ Gerenciar seus dados</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13, mb: 1.5 }}>Exportar ou excluir seus dados está disponível no seu Perfil.</Typography>
          <Button variant="outlined" color="primary" size="small" onClick={() => navigate('/perfil')} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700 }}>Ir para o Perfil →</Button>
        </Box>
      </Card>

      {/* Modal com os termos completos (não navega pra fora → voltar não quebra) */}
      <Dialog open={termsOpen} onClose={() => setTermsOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 4, maxHeight: '85vh' } }}>
        <DialogTitle sx={{ fontWeight: 800, color: 'text.primary', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          📋 Termos de Uso
          <Button onClick={() => setTermsOpen(false)} sx={{ minWidth: 0, fontSize: 13 }}>✕ Fechar</Button>
        </DialogTitle>
        <DialogContent sx={{ '& p, & li': { fontSize: 13.5, lineHeight: 1.6 } }}>
          <TermsPage />
        </DialogContent>
      </Dialog>
    </Box>
  );
};
