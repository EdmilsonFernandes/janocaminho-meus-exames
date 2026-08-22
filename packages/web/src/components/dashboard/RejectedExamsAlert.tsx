import { Alert, Button } from '@mui/material';

// Aviso de exames REJEITADOS por identidade (CPF do documento ≠ CPF da conta).
// Rejeição é decisão de integridade, não erro de leitura → severity "info" (não alarmista),
// com caminho claro: abrir o exame pra ver o motivo, apelar pro suporte ou excluir.
export const RejectedExamsAlert = ({ count, onClick }: { count: number; onClick: () => void }) => {
  if (count <= 0) return null;
  return (
    <Alert severity="info" sx={{ mt: 2, mb: 1, borderRadius: '12px' }} action={<Button size="small" color="inherit" onClick={onClick}>Ver</Button>} onClick={onClick}>
      {count} exame{count > 1 ? 's' : ''} não {count > 1 ? 'foram adicionados' : 'foi adicionado'} — o CPF do documento é diferente do CPF da sua conta.
    </Alert>
  );
};
