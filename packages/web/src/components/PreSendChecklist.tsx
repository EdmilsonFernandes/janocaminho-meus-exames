import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography, useTheme, alpha } from '@mui/material';
import type { Theme } from '@mui/material/styles';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import CropFreeIcon from '@mui/icons-material/CropFree';
import DocumentScannerIcon from '@mui/icons-material/DocumentScanner';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import { tealText } from '../theme';

const TEAL = '#20b2aa';

/** Viu o checklist de PDF 1x — não nag eterno (PDF de laboratório é o caminho bom,
 *  a maioria dos PDFs está certa; o objetivo é EDUCAR na primeira vez). */
export const PRESEND_PDF_SEEN_KEY = 'meus_exames_presend_pdf_v1';

/** Deve mostrar o checklist pré-envio?
 *  - 'image' = SEMPRE (maior risco: foto torta/borrada/documento errado);
 *  - 'pdf'   = só na 1ª vez (educar sobre foto-salva-como-PDF — caso real 09/11:
 *              PDF de 4,6MB com 3 caracteres extraíveis);
 *  - null    = não mostra. */
export function shouldShowPreSendCheck(files: File[]): 'image' | 'pdf' | null {
  const hasImage = files.some((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|bmp)$/i.test(f.name));
  if (hasImage) return 'image';
  const hasPdf = files.some((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (!hasPdf) return null;
  try { return localStorage.getItem(PRESEND_PDF_SEEN_KEY) ? null : 'pdf'; } catch { return 'pdf'; }
}

export function markPdfCheckSeen() {
  try { localStorage.setItem(PRESEND_PDF_SEEN_KEY, '1'); } catch { /* storage indisponível */ }
}

/** Popup inteligente pré-envio: garante que é RESULTADO (não pedido do médico) e
 *  legível, ANTES de gastar upload + extração. Educacional, não punitivo — o
 *  usuário sempre pode seguir ("Está certo, enviar"). */
export const PreSendChecklist = ({ open, kind, onConfirm, onBack }: { open: boolean; kind: 'image' | 'pdf'; onConfirm: () => void; onBack: () => void }) => {
  const t = useTheme();
  const items = [
    {
      icon: <FactCheckOutlinedIcon sx={{ fontSize: 20 }} />,
      title: 'É o resultado, não o pedido',
      desc: 'O app lê o exame pronto, com os valores. Se for o pedido do médico, os números ainda não existem.',
    },
    {
      icon: <CropFreeIcon sx={{ fontSize: 20 }} />,
      title: 'Documento inteiro e nítido',
      desc: 'Sem corte nas bordas, sem sombra ou reflexo, com os números legíveis.',
    },
    kind === 'image'
      ? {
          icon: <DocumentScannerIcon sx={{ fontSize: 20 }} />,
          title: 'Dica de ouro: Escanear',
          desc: 'A câmera ajusta borda, luz e nitidez por você — é o caminho que mais acerta.',
        }
      : {
          icon: <DescriptionOutlinedIcon sx={{ fontSize: 20 }} />,
          title: 'PDF do laboratório',
          desc: 'O PDF certo vem do portal do laboratório (dá pra selecionar o texto). Foto salva como PDF o app não consegue ler.',
        },
  ];
  return (
    <Dialog open={open} onClose={onBack} maxWidth="xs" fullWidth aria-labelledby="presend-check-title">
      <DialogTitle id="presend-check-title" sx={{ fontFamily: (th: Theme) => th.typography.h6.fontFamily, fontWeight: 800, pb: 1 }}>
        Conferência rápida antes de enviar
      </DialogTitle>
      <DialogContent sx={{ pb: 1 }}>
        <Stack spacing={2}>
          {items.map((it) => (
            <Stack key={it.title} direction="row" spacing={1.5} alignItems="flex-start">
              <Box sx={{
                width: 40, height: 40, borderRadius: '12px', flexShrink: 0, display: 'grid', placeItems: 'center',
                bgcolor: alpha(TEAL, 0.12), color: tealText(t.palette.mode),
              }}>{it.icon}</Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 14.5 }}>{it.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>{it.desc}</Typography>
              </Box>
            </Stack>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, flexDirection: { xs: 'column-reverse', sm: 'row' }, gap: 1 }}>
        <Button onClick={onBack} color="inherit" sx={{ minHeight: 44, width: { xs: '100%', sm: 'auto' }, borderRadius: '12px', fontWeight: 700 }}>
          Vou conferir antes
        </Button>
        <Button variant="contained" onClick={onConfirm} autoFocus sx={{ minHeight: 44, width: { xs: '100%', sm: 'auto' }, borderRadius: '12px', fontWeight: 700 }}>
          Está certo, enviar
        </Button>
      </DialogActions>
    </Dialog>
  );
};
