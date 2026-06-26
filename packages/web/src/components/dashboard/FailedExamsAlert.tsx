import { Alert, Button } from '@mui/material';

// Aviso de exames que falharam na extração (reprocessar). Extração pura.
export const FailedExamsAlert = ({ count, onClick }: { count: number; onClick: () => void }) => {
  if (count <= 0) return null;
  return (
    <Alert severity="warning" sx={{ mt: 2, mb: 1, borderRadius: 3 }} action={<Button size="small" color="inherit" onClick={onClick}>Ver</Button>} onClick={onClick}>
      {count} exame(s) falhou(aram) na leitura — abra e toque em “Re-extrair”.
    </Alert>
  );
};
