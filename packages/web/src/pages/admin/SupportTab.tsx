import { Box, Card, CardContent, Typography, Alert } from '@mui/material';

/** Suporte — central de chamados (SupportTicket). MVP: atalhos de contato + status. */
export const SupportTab = () => (
  <Box>
    <Alert severity="info" sx={{ mb: 2 }}>Sistema de chamados (<strong>SupportTicket</strong>) chega na próxima fase — vai capturar problemas de upload, pagamento, CRM/compartilhamento, com histórico por usuário.</Alert>
    <Card variant="outlined" sx={{ borderRadius: 2 }}><CardContent>
      <Typography sx={{ fontWeight: 800, mb: 1 }}>📞 Atendimento direto (hoje)</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>✉️ <strong>contato@janocaminho.com.br</strong></Typography>
      <Typography variant="body2" color="text.secondary">🌐 janocaminho.com.br/minhasaude</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>Dica: use as abas <strong>Exames</strong> (falhas de OCR), <strong>Usuários</strong> (bloqueio/acesso) e <strong>Médicos</strong> (validação de CRM) pra resolver chamados hoje.</Typography>
    </CardContent></Card>
  </Box>
);
