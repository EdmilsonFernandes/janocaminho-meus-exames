import { useState } from 'react';
import { Box, Button, Typography, Stack, Chip, TextField, CircularProgress, Collapse } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import LockIcon from '@mui/icons-material/Lock';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { API_URL } from '../config';

const TEAL = '#20b2aa';
const TEAL_DARK = '#178f89';
const GREEN = '#059669';
const ORANGE = '#c2410c';

const FLAG_META: Record<string, { label: string; color: string; bg: string }> = {
  HIGH: { label: '↑ acima', color: ORANGE, bg: 'rgba(234,88,12,.14)' },
  LOW: { label: '↓ abaixo', color: ORANGE, bg: 'rgba(234,88,12,.14)' },
  NORMAL: { label: '✓ normal', color: GREEN, bg: 'rgba(5,150,105,.12)' },
  UNKNOWN: { label: '— sem faixa', color: '#6b7280', bg: 'rgba(107,114,128,.10)' },
};

const fmt = (n: number | null) => (n == null ? '—' : String(n).replace('.', ','));

/**
 * "Decifre seu exame" — VERSÃO REAL (F1.2): o visitante cola o texto do exame e recebe os
 * valores organizados na hora, SEM CADASTRO (rate-limit 3/dia por IP, cache, nada salvo).
 * A IA só extrai; as flags são determinísticas contra a faixa do próprio laudo. A
 * interpretação completa é o CTA — cria conta (1º resumo grátis).
 */
export const DecifreReal = () => {
  const navigate = useNavigate();
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ items: any[]; totalDetected: number; cached?: boolean; disclaimer?: string } | null>(null);
  const [err, setErr] = useState('');

  const decifrar = async () => {
    if (texto.trim().length < 20) { setErr('Cole o resultado do exame (pelo menos 20 caracteres).'); return; }
    setLoading(true); setErr(''); setResult(null);
    try {
      const r = await fetch(`${API_URL}/public/decifre`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: texto.trim().slice(0, 4000) }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Não conseguimos ler esse texto. Tente colar o resultado com os números.'); return; }
      setResult(d);
    } catch { setErr('Falha de conexão. Tente novamente.'); }
    setLoading(false);
  };

  const abnormal = (result?.items ?? []).filter((i) => i.flag === 'HIGH' || i.flag === 'LOW').length;

  return (
    <Box sx={{
      position: 'relative', overflow: 'hidden',
      borderRadius: '18px', p: { xs: 2.5, md: 4 },
      background: 'linear-gradient(135deg,#0f5f5a 0%,#137a72 55%,#178f89 100%)',
      color: '#fff', boxShadow: '0 30px 60px rgba(15,61,58,.28)',
      '&::after': {
        content: '""', position: 'absolute', inset: 0,
        background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,.10) 50%, transparent 60%)',
        pointerEvents: 'none',
      },
    }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5, position: 'relative' }}>
        <Box sx={{ width: 44, height: 44, borderRadius: '12px', bgcolor: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.28)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <AutoAwesomeIcon sx={{ fontSize: 24 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 19, md: 23 }, lineHeight: 1.15 }}>
            Decifre seu exame agora — de graça
          </Typography>
          <Typography sx={{ fontSize: 13, opacity: 0.88 }}>Cole o resultado abaixo e veja seus valores organizados em segundos. Sem cadastro.</Typography>
        </Box>
      </Stack>

      <TextField
        multiline minRows={4} maxRows={8} fullWidth
        placeholder={'Cole aqui o resultado do exame, como está no laudo…\n\nEx.: Hemoglobina 13,5 g/dL (12 - 16)\nLDL 190 mg/dL (< 130)'}
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setErr(''); }}
        disabled={loading}
        sx={{
          position: 'relative',
          '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: 'rgba(255,255,255,.96)', fontSize: 14 },
          '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,.35)' },
        }}
      />

      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1.5, position: 'relative', flexWrap: 'wrap' }} useFlexGap>
        <Button
          variant="contained" onClick={() => void decifrar()} disabled={loading || texto.trim().length < 20}
          startIcon={loading ? <CircularProgress size={17} color="inherit" /> : <ContentPasteIcon />}
          sx={{ borderRadius: '999px', px: 3.5, py: 1.15, textTransform: 'none', fontWeight: 800, bgcolor: '#fff', color: TEAL_DARK, '&:hover': { bgcolor: '#f0fafa' }, boxShadow: '0 10px 24px rgba(0,0,0,.20)' }}
        >
          {loading ? 'Lendo o exame…' : 'Decifrar grátis'}
        </Button>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ opacity: 0.85 }}>
          <LockIcon sx={{ fontSize: 14 }} />
          <Typography sx={{ fontSize: 12 }}>Não salvamos seu exame — processa e esquece (LGPD)</Typography>
        </Stack>
      </Stack>

      {err && (
        <Typography sx={{ mt: 1.5, fontSize: 13.5, bgcolor: 'rgba(0,0,0,.25)', borderRadius: '10px', px: 1.5, py: 1, position: 'relative' }}>
          ⚠️ {err}
        </Typography>
      )}

      {/* RESULTADO */}
      <Collapse in={!!result}>
        {result && (
          <Box sx={{ mt: 2.5, borderRadius: '14px', bgcolor: 'rgba(0,0,0,.28)', border: '1px solid rgba(255,255,255,.16)', p: { xs: 2, md: 2.5 }, position: 'relative' }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.25, flexWrap: 'wrap' }} useFlexGap>
              <Typography sx={{ fontWeight: 800, fontSize: 15 }}>
                {result.items.length} valores encontrados
              </Typography>
              {abnormal > 0
                ? <Chip size="small" label={`${abnormal} ${abnormal > 1 ? 'pedem atenção' : 'pede atenção'}`} sx={{ height: 22, fontWeight: 800, bgcolor: 'rgba(234,88,12,.22)', color: '#ffd9b3' }} />
                : <Chip size="small" label="tudo dentro da faixa do laudo" sx={{ height: 22, fontWeight: 800, bgcolor: 'rgba(5,150,105,.22)', color: '#a7f3d0' }} />}
              {result.cached && <Chip size="small" label="instantâneo (cache)" sx={{ height: 22, fontSize: 10.5, bgcolor: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.7)' }} />}
            </Stack>
            <Stack spacing={0.75}>
              {result.items.map((it: any, idx: number) => {
                const meta = FLAG_META[it.flag as string] ?? FLAG_META.UNKNOWN;
                return (
                  <Stack key={idx} direction="row" spacing={1.25} alignItems="center"
                    sx={{ py: 0.6, borderBottom: idx < result.items.length - 1 ? '1px dashed rgba(255,255,255,.14)' : 'none' }}>
                    <Typography sx={{ flex: 1, fontSize: 14, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</Typography>
                    <Typography sx={{ fontSize: 14.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(it.value)}{it.unit ? <span style={{ fontSize: 11, opacity: 0.7 }}> {it.unit}</span> : null}
                    </Typography>
                    <Typography sx={{ fontSize: 11, opacity: 0.65, display: { xs: 'none', sm: 'block' }, width: 90, textAlign: 'right' }}>
                      {it.refLow != null || it.refHigh != null ? `${fmt(it.refLow)}–${fmt(it.refHigh)}` : '—'}
                    </Typography>
                    <Chip size="small" label={meta.label} sx={{ height: 20, fontSize: 10.5, fontWeight: 800, bgcolor: meta.bg, color: meta.color }} />
                  </Stack>
                );
              })}
            </Stack>
            <Box sx={{ mt: 2, borderRadius: '12px', bgcolor: 'rgba(255,255,255,.10)', p: 1.75, textAlign: 'center' }}>
              <Typography sx={{ fontSize: 13.5, lineHeight: 1.5 }}>
                Quer entender <b>o que isso significa</b> — explicação com IA, tendência entre exames e perguntas pro seu médico?
              </Typography>
              <Button
                variant="contained" onClick={() => navigate('/registrar')} endIcon={<ArrowForwardIcon />}
                sx={{ mt: 1.25, borderRadius: '999px', px: 3.5, textTransform: 'none', fontWeight: 800, bgcolor: '#fff', color: TEAL_DARK, '&:hover': { bgcolor: '#f0fafa' } }}
              >
                Criar conta grátis — 1º resumo por nossa conta
              </Button>
              <Typography sx={{ fontSize: 10.5, opacity: 0.65, mt: 1 }}>Créditos de boas-vindas · sem cartão · cancele quando quiser</Typography>
            </Box>
          </Box>
        )}
      </Collapse>
    </Box>
  );
};
