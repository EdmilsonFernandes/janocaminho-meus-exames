import { useEffect, useRef, useState } from 'react';
import { Box, Button, Typography, Stack, Chip, TextField, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import LockIcon from '@mui/icons-material/Lock';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { API_URL } from '../config';
import { GradientButton } from './GradientButton';

const GREEN = '#34d399';
const ORANGE = '#fb923c';
const GRAY = '#9ca3af';

const FLAG_META: Record<string, { label: string; color: string; bg: string }> = {
  HIGH: { label: '↑ acima', color: ORANGE, bg: 'rgba(251,146,60,.18)' },
  LOW: { label: '↓ abaixo', color: ORANGE, bg: 'rgba(251,146,60,.18)' },
  NORMAL: { label: '✓ normal', color: GREEN, bg: 'rgba(52,211,153,.16)' },
  UNKNOWN: { label: '— sem faixa', color: GRAY, bg: 'rgba(156,163,175,.16)' },
};

const fmt = (n: number | null) => (n == null ? '—' : String(n).replace('.', ','));

/** Fases do "calculando" — texto vivo + skeleton shimmer (a sensação de trabalho real). */
const PHASES = ['Abrindo o laudo…', 'Encontrando os valores…', 'Conferindo as faixas de referência…', 'Quase lá…'];

/**
 * "Decifre seu exame" — VERSÃO REAL do funil público: PDF do laboratório (o fluxo real do
 * app) OU texto colado → valores organizados na hora, sem cadastro. IA só extrai; flags
 * determinísticas; 3/dia por IP; cache; nada salvo (LGPD). Interpretação completa é o CTA.
 */
export const DecifreReal = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'pdf' | 'texto'>('pdf');
  const [file, setFile] = useState<File | null>(null);
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState(0);
  const [result, setResult] = useState<{ items: any[]; totalDetected: number; cached?: boolean; disclaimer?: string } | null>(null);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Ciclo de fases durante o loading (a cada 1.4s avança — "tá calculando")
  useEffect(() => {
    if (!loading) { setPhase(0); return; }
    const iv = setInterval(() => setPhase((p) => Math.min(p + 1, PHASES.length - 1)), 1400);
    return () => clearInterval(iv);
  }, [loading]);

  const canSend = mode === 'pdf' ? !!file : texto.trim().length >= 20;

  const decifrar = async () => {
    setLoading(true); setErr(''); setResult(null);
    try {
      let r: Response;
      if (mode === 'pdf' && file) {
        const fd = new FormData();
        fd.append('file', file, file.name);
        r = await fetch(`${API_URL}/public/decifre`, { method: 'POST', body: fd });
      } else {
        r = await fetch(`${API_URL}/public/decifre`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texto: texto.trim().slice(0, 4000) }),
        });
      }
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Não conseguimos ler esse exame. Tente o PDF do laboratório ou cole o texto.'); return; }
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
    }}>
      {/* KEYFRAMES (shimmer + reveal) */}
      <style>{`
        @keyframes dxShimmer { 0% { background-position: -300px 0; } 100% { background-position: 300px 0; } }
        @keyframes dxRowIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      `}</style>

      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
        <Box sx={{ width: 44, height: 44, borderRadius: '12px', bgcolor: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.28)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <AutoAwesomeIcon sx={{ fontSize: 24 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 19, md: 23 }, lineHeight: 1.15 }}>
            Decifre seu exame agora — de graça
          </Typography>
          <Typography sx={{ fontSize: 13, opacity: 0.9 }}>Envie o PDF do laboratório ou cole o texto. Sem cadastro.</Typography>
        </Box>
      </Stack>

      {/* MODO: PDF (default — é o fluxo real) | texto */}
      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
        {([['pdf', '📄 PDF do exame'], ['texto', '📝 Colar texto']] as const).map(([m, label]) => (
          <Box key={m} component="button" onClick={() => { setMode(m); setErr(''); }}
            sx={{ px: 2.25, py: 0.85, borderRadius: '999px', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, border: '1.5px solid', borderColor: mode === m ? '#fff' : 'rgba(255,255,255,.35)', bgcolor: mode === m ? 'rgba(255,255,255,.18)' : 'transparent', color: '#fff', transition: 'all .15s ease', '&:hover': { bgcolor: 'rgba(255,255,255,.12)' } }}>
            {label}
          </Box>
        ))}
      </Stack>

      {mode === 'pdf' ? (
        <Box>
          <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErr(''); }} />
          <Box
            component="button" onClick={() => fileRef.current?.click()}
            sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 3.5, px: 2, borderRadius: '12px', cursor: 'pointer', bgcolor: 'rgba(255,255,255,.96)', border: '2px dashed', borderColor: file ? '#20b2aa' : 'rgba(15,95,90,.35)', transition: 'border-color .15s ease', '&:hover': { borderColor: '#20b2aa' } }}
          >
            {file
              ? <PictureAsPdfIcon sx={{ fontSize: 34, color: '#178f89' }} />
              : <UploadFileIcon sx={{ fontSize: 34, color: '#178f89' }} />}
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#0f5f5a', maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {file ? file.name : 'Escolher PDF do exame'}
            </Typography>
            <Typography sx={{ fontSize: 11.5, color: 'rgba(15,95,90,.6)' }}>
              {file ? `${(file.size / 1024 / 1024).toFixed(1).replace('.', ',')} MB — pronto pra decifrar` : 'O arquivo que o laboratório te mandou (até 8 MB)'}
            </Typography>
          </Box>
        </Box>
      ) : (
        <TextField
          multiline minRows={4} maxRows={8} fullWidth
          placeholder={'Cole aqui o resultado do exame, como está no laudo…\n\nEx.: Hemoglobina 13,5 g/dL (12 - 16)\nLDL 190 mg/dL (< 130)'}
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setErr(''); }}
          disabled={loading}
          sx={{
            '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: 'rgba(255,255,255,.96)', fontSize: 14 },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,.35)' },
          }}
        />
      )}

      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1.5, flexWrap: 'wrap' }} useFlexGap>
        <GradientButton onClick={() => void decifrar()} disabled={loading || !canSend}
          startIcon={loading ? <CircularProgress size={17} sx={{ color: '#fff' }} /> : <AutoAwesomeIcon sx={{ fontSize: 19 }} />}
          sx={{ borderRadius: '999px', px: 3.5, py: 1.15, fontWeight: 800, boxShadow: '0 10px 24px rgba(0,0,0,.25)' }}>
          {loading ? PHASES[phase] : 'Decifrar grátis'}
        </GradientButton>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ opacity: 0.9 }}>
          <LockIcon sx={{ fontSize: 14 }} />
          <Typography sx={{ fontSize: 12 }}>Não salvamos seu exame — processa e esquece (LGPD)</Typography>
        </Stack>
      </Stack>

      {err && (
        <Typography sx={{ mt: 1.5, fontSize: 13.5, bgcolor: 'rgba(0,0,0,.28)', borderRadius: '10px', px: 1.5, py: 1 }}>
          ⚠️ {err}
        </Typography>
      )}

      {/* LOADING — skeleton shimmer (a sensação de "tá calculando") */}
      {loading && (
        <Box sx={{ mt: 2.5, borderRadius: '14px', bgcolor: 'rgba(0,0,0,.28)', border: '1px solid rgba(255,255,255,.16)', p: 2.5 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 1.5, color: 'rgba(255,255,255,.92)' }}>{PHASES[phase]}</Typography>
          {[0, 1, 2, 3].map((i) => (
            <Box key={i} sx={{
              height: 34, borderRadius: '8px', mb: 1,
              background: 'linear-gradient(90deg, rgba(255,255,255,.06) 25%, rgba(255,255,255,.16) 50%, rgba(255,255,255,.06) 75%)',
              backgroundSize: '600px 100%',
              animation: `dxShimmer 1.3s ease-in-out ${i * 0.12}s infinite`,
              width: `${88 - i * 7}%`,
            }} />
          ))}
        </Box>
      )}

      {/* RESULTADO — reveal escalonado por linha */}
      {result && !loading && (
        <Box sx={{ mt: 2.5, borderRadius: '14px', bgcolor: 'rgba(0,0,0,.30)', border: '1px solid rgba(255,255,255,.18)', p: { xs: 2, md: 2.5 } }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.25, flexWrap: 'wrap' }} useFlexGap>
            <Typography sx={{ fontWeight: 800, fontSize: 15 }}>
              {result.items.length} valores encontrados
            </Typography>
            {abnormal > 0
              ? <Chip size="small" label={`${abnormal} ${abnormal > 1 ? 'pedem atenção' : 'pede atenção'}`} sx={{ height: 24, fontWeight: 800, bgcolor: 'rgba(251,146,60,.25)', color: '#ffd9b3' }} />
              : <Chip size="small" label="tudo dentro da faixa do laudo" sx={{ height: 24, fontWeight: 800, bgcolor: 'rgba(52,211,153,.25)', color: '#a7f3d0' }} />}
            {result.cached && <Chip size="small" label="instantâneo (cache)" sx={{ height: 22, fontSize: 10.5, bgcolor: 'rgba(255,255,255,.14)', color: 'rgba(255,255,255,.75)' }} />}
          </Stack>
          <Stack spacing={0.75}>
            {result.items.map((it: any, idx: number) => {
              const meta = FLAG_META[it.flag as string] ?? FLAG_META.UNKNOWN;
              return (
                <Stack key={idx} direction="row" spacing={1.25} alignItems="center"
                  sx={{ py: 0.6, borderBottom: idx < result.items.length - 1 ? '1px dashed rgba(255,255,255,.14)' : 'none', animation: `dxRowIn .4s ease ${idx * 0.09}s both` }}>
                  <Typography sx={{ flex: 1, fontSize: 14, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</Typography>
                  <Typography sx={{ fontSize: 14.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(it.value)}{it.unit ? <span style={{ fontSize: 11, opacity: 0.75 }}> {it.unit}</span> : null}
                  </Typography>
                  <Typography sx={{ fontSize: 11, opacity: 0.7, display: { xs: 'none', sm: 'block' }, width: 90, textAlign: 'right' }}>
                    {it.refLow != null || it.refHigh != null ? `${fmt(it.refLow)}–${fmt(it.refHigh)}` : '—'}
                  </Typography>
                  <Chip size="small" label={meta.label} sx={{ height: 22, fontSize: 11, fontWeight: 800, bgcolor: meta.bg, color: meta.color, border: `1px solid ${meta.color}44` }} />
                </Stack>
              );
            })}
          </Stack>
          <Box sx={{ mt: 2, borderRadius: '12px', bgcolor: 'rgba(255,255,255,.12)', p: 1.75, textAlign: 'center' }}>
            <Typography sx={{ fontSize: 13.5, lineHeight: 1.5 }}>
              Quer entender <b>o que isso significa</b> — explicação com IA, tendência entre exames e perguntas pro seu médico?
            </Typography>
            <GradientButton onClick={() => navigate('/registrar')} endIcon={<ArrowForwardIcon />}
              sx={{ mt: 1.25, borderRadius: '999px', px: 3.5, fontWeight: 800, boxShadow: '0 10px 24px rgba(0,0,0,.28)' }}>
              Criar conta grátis — 1º resumo por nossa conta
            </GradientButton>
            <Typography sx={{ fontSize: 10.5, opacity: 0.75, mt: 1 }}>Créditos de boas-vindas · sem cartão · cancele quando quiser</Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
};
