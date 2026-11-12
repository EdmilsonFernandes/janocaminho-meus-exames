import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Dialog, DialogActions, DialogContent, Stack, Typography, alpha, useTheme } from '@mui/material';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import DocumentScannerIcon from '@mui/icons-material/DocumentScanner';
import RefreshIcon from '@mui/icons-material/Refresh';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import { DrExame } from './DrExame';
import { RADIUS, tealText } from '../theme';

/**
 * ExamFailureSheet — "por que meu exame não deu certo", estilo notificação de push
 * (pedido do dono 10/11: o usuário precisa ENTENDER — pedido≠resultado, foto ruim,
 * PDF-foto — com a ação certa a 1 toque, guiado pelo failureKind/mensagem do server).
 *
 * Autocontido: monta no ExamShow, abre SOZINHO 1× por exame (dedup localStorage) e
 * reabre pelo botão "Entender o que houve". Nada de hooks extra no pai.
 */
type FailKind = 'not_a_document' | 'low_quality' | 'ia_error' | 'generic';

const kindOf = (exam: { extractionError?: string | null; failureKind?: string | null }): FailKind => {
  if (exam.failureKind === 'not_a_document' || /PEDIDO|COMPROVANTE de agendamento/i.test(exam.extractionError ?? '')) return 'not_a_document';
  if (exam.failureKind === 'low_quality' || /difícil de decifrar|mais nítida|foto de exame salva como PDF|não foi possível extrair texto/i.test(exam.extractionError ?? '')) return 'low_quality';
  if (exam.failureKind === 'ia_error' || /exame grande demais|IA/i.test(exam.extractionError ?? '')) return 'ia_error';
  return 'generic';
};

const META: Record<FailKind, { title: string; hint: string }> = {
  not_a_document: { title: 'Isso ainda é o pedido, não o resultado', hint: 'O documento que você enviou é a solicitação/agendamento do exame — ele não tem os valores. Dá pra criar um lembrete pra não esquecer de buscar o resultado.' },
  low_quality: { title: 'A imagem ficou difícil de ler', hint: 'O Dr. Exame lê os valores da foto/PDF, mas dessa vez não deu pra decifrar com segurança. O Escanear ajusta borda, luz e nitidez pra você — é o caminho que mais acerta.' },
  ia_error: { title: 'A leitura travou do nosso lado', hint: 'O documento chegou bem, mas o processamento falhou. Tentar de novo resolve na maioria dos casos — e não gasta créditos novos.' },
  generic: { title: 'Não conseguimos ler este exame', hint: 'Sem problema: tente enviar novamente com uma foto nítida ou o PDF do laboratório.' },
};

export const ExamFailureSheet = ({ exam, onRetry, open, onOpenChange }: {
  exam: { id: string; title?: string | null; extractionError?: string | null; failureKind?: string | null };
  onRetry?: () => void;
  /** Controlado pelo pai (botão "Entender o que houve"); o auto-open 1× continua aqui dentro. */
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) => {
  const t = useTheme();
  const navigate = useNavigate();
  const [autoOpen, setAutoOpen] = useState(false);
  const isOpen = open ?? autoOpen;
  const setOpen = (v: boolean) => { setAutoOpen(v); onOpenChange?.(v); };

  // Abre sozinho 1× por exame (a falha é nova informação — na 2ª visita o Alert resumido basta).
  useEffect(() => {
    if (!exam?.id) return;
    const key = `dx:failsheet:${exam.id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch { /* storage indisponível: abre sempre */ }
    setAutoOpen(true);
  }, [exam?.id]);

  const kind = kindOf(exam);
  const meta = META[kind];

  const goLembrete = () => { setOpen(false); navigate('/reminders'); };
  const goEscanear = () => { setOpen(false); navigate('/exams/create'); };
  const retry = () => { setOpen(false); onRetry?.(); };

  return (
    <Dialog open={isOpen} onClose={() => setOpen(false)} fullWidth maxWidth="xs"
      aria-labelledby="fail-sheet-title"
      slotProps={{ paper: { sx: { position: { xs: 'absolute', sm: 'relative' }, bottom: 0, m: 0, width: '100%', borderRadius: { xs: '22px 22px 0 0', sm: '22px' }, p: 0.5 } } }}>
      {/* Cabeçalho estilo push */}
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ px: 2, pt: 2, pb: 1 }}>
        <DrExame size={38} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary', letterSpacing: '0.04em' }}>Dr. Exame · agora</Typography>
          <Typography id="fail-sheet-title" sx={{ fontWeight: 800, fontSize: 15.5, lineHeight: 1.2, fontFamily: 'Poppins, sans-serif' }}>
            {meta.title}
          </Typography>
        </Box>
      </Stack>
      <DialogContent sx={{ px: 2, pb: 1.5 }}>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>{meta.hint}</Typography>
        {exam.extractionError && kind !== 'generic' && (
          <Box sx={{ mt: 1.25, p: 1.25, borderRadius: RADIUS.md || 12, bgcolor: (th) => alpha(th.palette.mode === 'dark' ? '#fff' : '#000', 0.04) }}>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.55, display: 'block' }}>
              <b style={{ color: tealText(t.palette.mode) }}>Mensagem técnica:</b> {exam.extractionError}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 2, flexDirection: 'column', gap: 1 }}>
        {(kind === 'not_a_document' ? (
          <Button fullWidth variant="contained" startIcon={<EventAvailableOutlinedIcon />} onClick={goLembrete} sx={{ minHeight: 46, borderRadius: '14px', fontWeight: 800, textTransform: 'none' }}>
            Criar lembrete do resultado
          </Button>
        ) : kind === 'low_quality' ? (
          <Button fullWidth variant="contained" startIcon={<DocumentScannerIcon />} onClick={goEscanear} sx={{ minHeight: 46, borderRadius: '14px', fontWeight: 800, textTransform: 'none' }}>
            Escanear de novo
          </Button>
        ) : (
          <Button fullWidth variant="contained" startIcon={<RefreshIcon />} onClick={retry} sx={{ minHeight: 46, borderRadius: '14px', fontWeight: 800, textTransform: 'none' }}>
            Tentar de novo
          </Button>
        ))}
        <Stack direction="row" spacing={1} sx={{ width: '100%' }}>
          {kind === 'not_a_document' && (
            <Button fullWidth variant="outlined" color="inherit" onClick={goEscanear} sx={{ minHeight: 42, borderRadius: '12px', fontWeight: 700, textTransform: 'none', borderColor: 'divider' }}>
              Enviar outro exame
            </Button>
          )}
          <Button fullWidth variant={kind === 'not_a_document' ? 'text' : 'outlined'} color="inherit" onClick={() => setOpen(false)} sx={{ minHeight: 42, borderRadius: '12px', fontWeight: 700, textTransform: 'none', ...(kind !== 'not_a_document' ? { borderColor: 'divider' } : {}) }}>
            {kind === 'ia_error' ? 'Entendi' : 'Fechar'}
          </Button>
          {kind === 'ia_error' && (
            <Button fullWidth variant="outlined" color="inherit" startIcon={<SupportAgentOutlinedIcon />} component="a" href="https://wa.me/551239334979" target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} sx={{ minHeight: 42, borderRadius: '12px', fontWeight: 700, textTransform: 'none', borderColor: 'divider' }}>
              Suporte
            </Button>
          )}
        </Stack>
      </DialogActions>
    </Dialog>
  );
};
