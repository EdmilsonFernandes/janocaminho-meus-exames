import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Chip, Stack, Typography, IconButton, Box,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { DrExame } from './DrExame';

/** Quiz-first onboarding (licença Mito): "o que você quer entender?" ANTES do upload —
 *  personaliza a primeira experiência com valor instantâneo. 1 tela, <60s, 1x por dispositivo.
 *  Resposta fica em localStorage (preferência de UI, não dado clínico — NÃO vai pro
 *  clinicalProfile, que alimenta prompts de IA). Pular salva lista vazia = nunca mais pergunta. */
const KEY = 'dxGoals';

export const GOALS = [
  { id: 'entender', emoji: '🧬', label: 'Entender o que meus exames significam' },
  { id: 'tendencia', emoji: '📈', label: 'Acompanhar a evolução ao longo do tempo' },
  { id: 'alterados', emoji: '⚠️', label: 'Ficar de olho em valores alterados' },
  { id: 'familia', emoji: '👨‍👩‍👧', label: 'Cuidar da saúde de um familiar' },
  { id: 'consulta', emoji: '🩺', label: 'Chegar na consulta com perguntas prontas' },
  { id: 'prevencao', emoji: '🛡️', label: 'Prevenção e longevidade' },
] as const;

export type GoalId = (typeof GOALS)[number]['id'];

/** Lidas no Dashboard pra personalizar o estado vazio. */
export const getGoals = (): GoalId[] => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((g) => GOALS.some((o) => o.id === g)) : [];
  } catch { return []; }
};

/** Linha do hero p/ 1º exame conforme o objetivo principal (vazio → copy padrão). */
export const goalSubtitle = (goals: GoalId[]): string | null => {
  switch (goals[0]) {
    case 'entender': return 'Você quer entender seus exames — envie o primeiro laudo e a IA explica cada valor em português simples.';
    case 'tendencia': return 'Cada exame enviado deixa sua evolução mais precisa — comece com o laudo mais recente.';
    case 'alterados': return 'Envie seu exame mais recente e o app destaca na hora o que está fora da faixa.';
    case 'familia': return 'Envie um exame do familiar e cadastre o perfil dele na Família — cada um com histórico próprio.';
    case 'consulta': return 'A partir do seu exame, o app monta as perguntas certas pra levar na consulta.';
    case 'prevencao': return 'Exames + idade biológica + risco cardiometabólico: tudo começa com o primeiro laudo.';
    default: return null;
  }
};

export const GoalQuiz = () => {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<GoalId[]>([]);

  useEffect(() => {
    if (localStorage.getItem(KEY)) return; // já respondeu/pulou — nunca mais
    // Espera tour/perfil/notificação fecharem (todos são .MuiDialog-root) pra não empilhar
    // modais no 1º login. Se em 30s não deu, desiste sem marcar (pergunta no próximo boot).
    const iv = setInterval(() => {
      if (document.querySelector('.MuiDialog-root')) return;
      setOpen(true);
      clearInterval(iv);
    }, 1200);
    const kill = setTimeout(() => clearInterval(iv), 30000);
    return () => { clearInterval(iv); clearTimeout(kill); };
  }, []);

  const save = (goals: GoalId[]) => {
    try { localStorage.setItem(KEY, JSON.stringify(goals)); } catch { /* ignore */ }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <Dialog open onClose={() => save([])} PaperProps={{ sx: { borderRadius: '16px', maxWidth: 440, width: '100%' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: 1, pb: 1 }}>
        <DrExame size={40} sx={{ borderRadius: '28%' }} />
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 19, color: 'text.primary' }}>
            O que você quer entender?
          </Typography>
          <Typography variant="caption" color="text.secondary">Isso personaliza o app pra você — menos de 1 minuto</Typography>
        </Box>
        <IconButton size="small" onClick={() => save([])} aria-label="Fechar"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 1, pt: 0.5 }}>
          {GOALS.map((g) => {
            const on = sel.includes(g.id);
            return (
              <Chip
                key={g.id}
                label={`${g.emoji}  ${g.label}`}
                onClick={() => setSel((s) => (on ? s.filter((x) => x !== g.id) : [...s, g.id]))}
                sx={{
                  justifyContent: 'flex-start',
                  borderRadius: '12px',
                  height: 44,
                  fontSize: 15,
                  fontWeight: on ? 800 : 600,
                  border: '1.5px solid',
                  borderColor: on ? '#20b2aa' : 'divider',
                  bgcolor: on ? 'rgba(32,178,170,.12)' : 'background.default',
                  color: 'text.primary',
                  '& .MuiChip-label': { whiteSpace: 'normal' },
                }}
              />
            );
          })}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', gap: 1, px: 3, pb: 2.5 }}>
        <Button onClick={() => save([])} variant="text" sx={{ textTransform: 'none' }}>Pular</Button>
        <Button
          onClick={() => save(sel)} disabled={sel.length === 0} endIcon={<ArrowForwardIcon />}
          variant="contained" sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 800 }}
        >
          Continuar
        </Button>
      </DialogActions>
    </Dialog>
  );
};
