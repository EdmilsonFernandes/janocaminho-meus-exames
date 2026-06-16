import { Dialog, DialogTitle, DialogContent, Typography, IconButton, Box, keyframes, useMediaQuery, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { explainExam } from '../data/examDictionary';
import { DrExame } from './DrExame';

const bounce = keyframes`0%,100%{transform:translateY(0) rotate(0)}25%{transform:translateY(-6px) rotate(-3deg)}75%{transform:translateY(-4px) rotate(3deg)}`;

interface Props {
  open: boolean;
  item: any | null;
  onClose: () => void;
}

export const ExplainItem = ({ open, item, onClose }: Props) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  if (!item) return null;
  const ex = explainExam(item.nameCanonical);
  const titulo = ex?.titulo ?? item.name;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen} PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 3 } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pr: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <DrExame size={42} sx={{ animation: `${bounce} 1.5s ease-in-out infinite` }} />
          <Box>
            <Typography component="span" sx={{ fontWeight: 800, fontSize: '1.15rem' }}>{titulo}</Typography>
            <Typography component="div" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>Dr. Exame explica</Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {ex ? (
          <Box>
            <Typography sx={{ fontSize: '1.12rem', fontWeight: 600, mb: 1.5 }}>{ex.resumo}</Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 1.5, p: 1.5, background: '#eef3fb', borderRadius: 2 }}>
              <span style={{ fontSize: 22 }}>💡</span>
              <Typography>{ex.analogia}</Typography>
            </Box>
            <Box sx={{ p: 1.5, background: '#fff8e1', borderRadius: 2, borderLeft: '4px solid #ffb300' }}>
              <Typography sx={{ fontWeight: 700, mb: 0.5, fontSize: '0.95rem' }}>Se estiver alterado:</Typography>
              <Typography variant="body2">{ex.alterado}</Typography>
            </Box>
          </Box>
        ) : (
          <Box>
            <Typography sx={{ mb: 1 }}>Esse exame ainda não tem explicação pronta no nosso guia.</Typography>
            <Typography variant="body2" color="text.secondary">
              Use o <strong>Assistente de saúde</strong> (menu lateral) e pergunte “o que significa {item.name}?” que a IA explica de forma simples.
            </Typography>
          </Box>
        )}
        <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'text.secondary' }}>
          *Explicação educativa. Sempre confirme com seu médico.
        </Typography>
      </DialogContent>
    </Dialog>
  );
};

export const ExplainButton = ({ onClick }: { onClick: () => void }) => (
  <IconButton size="small" onClick={onClick} title="O que é isso?" sx={{ color: 'primary.main' }}>
    <HelpOutlineIcon fontSize="small" />
  </IconButton>
);
