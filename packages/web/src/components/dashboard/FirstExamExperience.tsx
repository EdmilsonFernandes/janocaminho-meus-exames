import { useState } from 'react';
import { Box, Button, Stack, Typography, alpha } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

import { stashExamFiles } from '../../utils/examHandoff';
import { usePlanInfo } from '../../utils/planInfo';
import { useCredits } from '../../hooks/useCredits';

/**
 * FirstExamExperience — estado vazio FOCADO do dashboard (first-exam flow,
 * insight Kantesti: o momento de maior fricção vira o de menor).
 *
 * Quem tem 0 exames não vê score vazio, bio-idade vazia nem tiles mudos: vê
 * UMA missão — enviar o primeiro exame. Zona de upload grande (drag&drop real
 * no desktop: o arquivo viaja pra tela de envio via examHandoff), câmera como
 * ação irmã no mobile, e os 3 passos do que acontece depois.
 */

const TEAL = '#20b2aa';
const TEAL_DARK = '#178f89';

export const FirstExamExperience = ({ firstName, onGoCreate, onDemo }: { firstName?: string; onGoCreate: () => void; onDemo?: () => void }) => {
  const [dragging, setDragging] = useState(false);
  const planInfo = usePlanInfo();
  const { bonusPending } = useCredits();
  // Promete o bônus só enquanto é verdade (usuário que extraiu e deletou não re-ganha).
  const bonus = bonusPending !== false ? (planInfo?.signupBonus ?? 0) : 0;

  const goWithFiles = (files: FileList | null) => {
    // Handoff: quem arrastou o PDF até aqui não pode perdê-lo na navegação.
    stashExamFiles(files);
    onGoCreate();
  };

  return (
    <Stack spacing={2.5} sx={{ mt: 1.5 }} alignItems="center">
      {/* ZONA DE UPLOAD — grande, única dona da tela */}
      <Box
        component="label"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); goWithFiles(e.dataTransfer?.files ?? null); }}
        sx={{
          width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5,
          py: { xs: 4.5, md: 6 }, px: { xs: 2.5, md: 5 },
          borderRadius: '20px',
          border: dragging ? `2.5px dashed ${TEAL}` : '2px dashed rgba(32,178,170,.45)',
          bgcolor: dragging ? alpha(TEAL, 0.12) : alpha(TEAL, 0.04),
          cursor: 'pointer', textAlign: 'center',
          transition: 'background-color .2s ease, border-color .2s ease, box-shadow .2s ease',
          '&:hover': {
            bgcolor: alpha(TEAL, 0.08),
            borderColor: TEAL,
            boxShadow: '0 12px 32px rgba(32,178,170,.14)',
          },
        }}
      >
        <input
          type="file"
          hidden
          multiple
          accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf"
          onChange={(e) => { goWithFiles(e.target.files); if (e.target) e.target.value = ''; }}
        />
        {/* ícone estático (dieta de movimento: float infinito removido) */}
        <Box sx={{
          width: 76, height: 76, borderRadius: '20px',
          background: 'linear-gradient(135deg,#20b2aa,#178f89)',
          display: 'grid', placeItems: 'center',
          boxShadow: '0 14px 34px rgba(32,178,170,.35)',
        }}>
          <UploadFileIcon sx={{ fontSize: 38, color: '#fff' }} />
        </Box>
        <Box>
          <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: { xs: 18, md: 21 }, color: 'text.primary', lineHeight: 1.25 }}>
            {firstName ? `${firstName}, envie seu primeiro exame` : 'Envie seu primeiro exame'}
          </Typography>
          <Typography sx={{ fontSize: 15, color: 'text.secondary', mt: 0.5, lineHeight: 1.5 }}>
            PDF ou foto — a IA analisa em segundos. <b style={{ color: 'text.primary' }}>Grátis.</b>
          </Typography>
        </Box>
        {/* BÔNUS VISÍVEL (auditoria 31/10): a conta nasce com 0 💎 e o grant de boas-vindas só
            chega após o 1º exame extraído — ninguém sabia que ele existia antes de enviar. */}
        {bonus > 0 && (
          <Box sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.75, py: 0.6,
            borderRadius: '999px', bgcolor: 'rgba(212,165,116,.14)', border: '1px solid rgba(212,165,116,.4)',
          }}>
            <Typography component="span" sx={{ fontSize: 13.5, fontWeight: 800, color: '#a16207' }}>
              🎁 Seu 1º exame libera +{bonus} créditos de IA
            </Typography>
          </Box>
        )}
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          {['PDF', 'JPG', 'PNG'].map((f) => (
            <Box key={f} sx={{ px: 1.5, py: 0.4, borderRadius: '8px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', fontSize: 12.5, fontWeight: 800, color: TEAL_DARK }}>
              {f}
            </Box>
          ))}
        </Stack>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Arraste aqui ou toque para escolher · até 32 MB
        </Typography>
      </Box>

      {/* CÂMERA — irmã do upload (no celular é o caminho natural) */}
      <Button
        variant="outlined"
        size="large"
        startIcon={<PhotoCameraIcon />}
        onClick={onGoCreate}
        sx={{
          borderRadius: '12px', px: 4, py: 1.2, textTransform: 'none', fontWeight: 800, fontSize: 15.5,
          borderColor: alpha(TEAL, 0.4), color: TEAL_DARK,
          bgcolor: 'background.paper',
          '&:hover': { borderColor: TEAL, bgcolor: alpha(TEAL, 0.06) },
        }}
      >
        Escanear com a câmera
      </Button>

      {/* 3 PASSOS — o que acontece depois do envio */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={{ xs: 1, sm: 2.5 }}
        sx={{ width: '100%', maxWidth: 640, pt: 1 }}
      >
        {[
          ['Envie', 'PDF do lab ou foto do papel'],
          ['IA analisa', 'extrai cada valor do laudo'],
          ['Entenda', 'régua, tendência e perguntas pro médico'],
        ].map(([t, d], i) => (
          <Stack key={t} direction="row" spacing={1.25} alignItems="flex-start" sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff', fontWeight: 800, fontSize: 13 }}>
              {i + 1}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 800, color: 'text.primary' }}>{t}</Typography>
              <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.45 }}>{d}</Typography>
            </Box>
          </Stack>
        ))}
      </Stack>

      {/* Escape (preserva o modo exemplo R1 sem virar ruído) */}
      {onDemo && (
        <Button
          variant="text"
          endIcon={<ArrowForwardIcon sx={{ fontSize: 16 }} />}
          onClick={onDemo}
          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '12px', color: TEAL_DARK, px: 2 }}
        >
          👀 Ver com dados de exemplo
        </Button>
      )}
    </Stack>
  );
};
