import { Box, Typography, Button, Stack, Chip, Fade } from '@mui/material';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ScienceIcon from '@mui/icons-material/Science';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

// Demo "Decifre seu exame" (F1) — momento mágico da landing.
// Arquitetura: CINEMÁTICO/SCRIPTED, não chamada IA ao vivo por visitante
// (custo/abuso/latência/flake num relay público). Reproduz uma saída de IA
// autêntica e medicamente correta com efeito de streaming + extração progressiva.
// Honesto: rotulado como "exemplo". A versão "cole seu exame" (IA real, rate-limited)
// fica como F1.2 opcional.

const TEAL = '#20b2aa';
const TEAL_DARK = '#178f89';
const GREEN = '#059669';
const ORANGE = '#ea580c';

// Exame fictício (mesmo perfil lipídico já usado na seção de risco da landing → coerente)
type Flag = 'high' | 'low' | 'ok';
const ROWS: { name: string; val: string; unit: string; ref: string; flag: Flag }[] = [
  { name: 'Colesterol Total', val: '295', unit: 'mg/dL', ref: '< 190', flag: 'high' },
  { name: 'LDL (ruim)', val: '190', unit: 'mg/dL', ref: '< 100', flag: 'high' },
  { name: 'HDL (bom)', val: '35', unit: 'mg/dL', ref: '> 40', flag: 'low' },
  { name: 'Triglicerídeos', val: '260', unit: 'mg/dL', ref: '< 150', flag: 'high' },
  { name: 'Glicemia', val: '92', unit: 'mg/dL', ref: '< 99', flag: 'ok' },
];
const ANALYSIS =
  'Seu LDL (190) está quase o dobro do ideal (≤100). Os triglicerídeos (260) também estão altos e o HDL — o "bom" — está baixo (35). Esse padrão aponta possível risco cardiovascular pelo perfil lipídico. A boa notícia: com ajuste de dieta e atividade física, esses valores costumam cair rápido.';
const WORDS = ANALYSIS.split(' ');

const flagMeta: Record<Flag, { label: string; color: string; bg: string }> = {
  high: { label: '↑ alto', color: ORANGE, bg: 'rgba(234,88,12,.14)' },
  low: { label: '↓ baixo', color: ORANGE, bg: 'rgba(234,88,12,.14)' },
  ok: { label: '✓ normal', color: GREEN, bg: 'rgba(5,150,105,.12)' },
};

export const ExamDemo = () => {
  const navigate = useNavigate();
  // step: -1 = idle; 0..ROWS.length-1 = extraindo linhas; ROWS.length..+WORDS = streaming; >=TOTAL = pronto
  const [step, setStep] = useState(-1);
  const reduceRef = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      reduceRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  }, []);

  const TOTAL = ROWS.length + WORDS.length;
  const started = step >= 0;
  const done = step >= TOTAL;
  const reading = started && step < ROWS.length;
  const analyzing = step >= ROWS.length && step < TOTAL;

  // Timeline: agenda o próximo step com delay dependente da fase.
  useEffect(() => {
    if (step < 0 || step >= TOTAL) return;
    if (reduceRef.current) { setStep(TOTAL); return; }
    const revealing = step < ROWS.length;
    const streaming = step >= ROWS.length && step < TOTAL;
    const delay = revealing ? (step === 0 ? 500 : 430) : streaming ? 26 : 600;
    const t = setTimeout(() => setStep((s) => s + 1), delay);
    return () => clearTimeout(t);
  }, [step, TOTAL]);

  const rowsShown = started ? Math.min(Math.max(step, 0), ROWS.length) : 0;
  const wordsShown = step > ROWS.length ? Math.min(step - ROWS.length, WORDS.length) : (done ? WORDS.length : 0);
  const statusText = !started ? '' : reading ? 'Lendo o laudo…' : analyzing ? 'O Dr. Exame está explicando…' : 'Leitura pronta';

  return (
    <Box sx={{
      maxWidth: 720, mx: 'auto', width: '100%',
      borderRadius: 4, overflow: 'hidden', border: '1px solid', borderColor: 'divider',
      bgcolor: 'background.paper',
      boxShadow: '0 24px 60px rgba(32,178,170,.16), 0 8px 20px rgba(0,0,0,.06)',
    }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 2.5, py: 1.75, borderBottom: '1px solid', borderColor: 'divider', background: 'linear-gradient(135deg,rgba(32,178,170,.08),rgba(32,178,170,.02))' }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <ScienceIcon sx={{ fontSize: 19, color: TEAL_DARK }} />
          <Typography sx={{ fontWeight: 800, fontSize: 14, color: 'text.primary' }}>Exemplo · Perfil Lipídico</Typography>
        </Stack>
        {started && (
          <Stack direction="row" spacing={0.75} alignItems="center">
            {!done && <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: TEAL, animation: 'examPulse 1s ease-in-out infinite' }} />}
            <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: done ? GREEN : TEAL_DARK }}>{statusText}</Typography>
          </Stack>
        )}
      </Box>

      <Box sx={{ p: { xs: 2, sm: 2.75 } }}>
        {/* Laudo cru — some depois de lido (libera espaço pro resultado) */}
        {!started && (
          <Box sx={{ borderRadius: 2, bgcolor: '#0c2422', p: 2, mb: 2.5, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 12.5, color: '#9bc4c0', lineHeight: 1.9 }}>
            <Box sx={{ color: '#5fc9c3', mb: 0.5 }}>LAB CENTRAL · Perfil Lipídico</Box>
            <Box>COL Total ......... 295 mg/dL</Box>
            <Box>LDL ............... 190 mg/dL  <span style={{ color: ORANGE }}>← alterado</span></Box>
            <Box>HDL ................ 35 mg/dL  <span style={{ color: ORANGE }}>← baixo</span></Box>
            <Box>Triglicerídeos .... 260 mg/dL  <span style={{ color: ORANGE }}>← alterado</span></Box>
            <Box>Glicemia .......... 92 mg/dL</Box>
          </Box>
        )}

        {/* IDLE — CTA */}
        {!started && (
          <Box sx={{ textAlign: 'center' }}>
            <Button size="large" onClick={() => setStep(0)} startIcon={<PlayArrowIcon />} sx={{
              borderRadius: 99, px: 3.5, py: 1.4, fontSize: 16, textTransform: 'none', fontWeight: 800,
              bgcolor: TEAL, color: '#fff', boxShadow: '0 12px 28px rgba(32,178,170,.35)',
              animation: 'examPulse 2.2s ease-in-out infinite',
              '&:hover': { bgcolor: TEAL_DARK, transform: 'translateY(-2px)' }, transition: 'all .2s',
            }}>
              Decifrar este exame com IA
            </Button>
            <Typography sx={{ mt: 1.5, fontSize: 12.5, color: 'text.secondary' }}>Exame fictício · sem cadastro · veja como funciona</Typography>
          </Box>
        )}

        {/* RESULTADO — constrói progressivamente */}
        {started && (
          <Box>
            {/* Valores extraídos (limpos, com flag) */}
            <Box sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: 'text.secondary', letterSpacing: '0.04em', mb: 1, textTransform: 'uppercase', opacity: rowsShown ? 1 : 0 }}>
                {reading ? 'Extraindo valores do laudo…' : 'Valores extraídos'}
              </Typography>
              <Box sx={{ display: 'grid', gap: 0.75 }}>
                {ROWS.slice(0, rowsShown).map((r, i) => {
                  const m = flagMeta[r.flag];
                  return (
                    <Fade key={r.name} in timeout={260}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.6, px: 1.25, borderRadius: 2, bgcolor: 'action.hover' }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: 'text.primary' }}>{r.name}</Typography>
                          <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>ref. {r.ref} {r.unit}</Typography>
                        </Box>
                        <Typography sx={{ fontWeight: 800, fontSize: 16, color: r.flag === 'ok' ? GREEN : ORANGE }}>{r.val}<Typography component="span" sx={{ fontSize: 11, color: 'text.secondary', fontWeight: 600 }}> {r.unit}</Typography></Typography>
                        <Chip size="small" label={m.label} sx={{ height: 22, fontWeight: 800, fontSize: 11, bgcolor: m.bg, color: m.color }} />
                      </Box>
                    </Fade>
                  );
                })}
              </Box>
            </Box>

            {/* Explicação da IA (streaming) */}
            {(analyzing || done) && (
              <Box sx={{ mb: done ? 2 : 0, borderRadius: 2, p: 1.75, bgcolor: 'rgba(32,178,170,.06)', border: '1px solid', borderColor: 'rgba(32,178,170,.18)' }}>
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.75 }}>
                  <AutoAwesomeIcon sx={{ fontSize: 16, color: TEAL_DARK }} />
                  <Typography sx={{ fontSize: 12, fontWeight: 800, color: TEAL_DARK }}>Dr. Exame explica</Typography>
                </Stack>
                <Typography sx={{ fontSize: 14, lineHeight: 1.6, color: 'text.primary' }}>
                  {WORDS.slice(0, wordsShown).join(' ')}
                  {analyzing && <Box component="span" sx={{ display: 'inline-block', width: 7, height: 15, ml: 0.5, bgcolor: TEAL_DARK, verticalAlign: '-2px', animation: 'examCursor 1s steps(2) infinite' }} />}
                </Typography>
              </Box>
            )}

            {/* RiskCard + plano — monta ao final */}
            {done && (
              <Fade in timeout={450}>
                <Box sx={{ borderRadius: 3, p: 2, border: '1px solid', borderColor: 'divider', background: 'linear-gradient(135deg,rgba(234,88,12,.06),rgba(234,88,12,.02))' }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.25 }}>
                    <HealthAndSafetyIcon sx={{ fontSize: 20, color: ORANGE }} />
                    <Typography sx={{ fontWeight: 800, flex: 1, fontSize: 14.5 }}>Leitura de risco</Typography>
                    <Chip size="small" label="🟠 Moderado" sx={{ fontWeight: 800, height: 22, bgcolor: 'rgba(234,88,12,.16)', color: ORANGE }} />
                  </Stack>
                  <Typography sx={{ fontWeight: 800, color: ORANGE, fontSize: 13.5, mb: 1.25 }}>Possível risco cardiovascular (perfil lipídico)</Typography>
                  <Stack spacing={0.5} sx={{ mb: 1.5 }}>
                    {[
                      { n: 'LDL', v: '190 mg/dL' },
                      { n: 'Triglicerídeos', v: '260 mg/dL' },
                      { n: 'HDL', v: '35 mg/dL' },
                    ].map((f) => (
                      <Box key={f.n} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip size="small" label={`🟠 ${f.v}`} sx={{ fontWeight: 700, height: 20, bgcolor: 'rgba(234,88,12,.14)', color: ORANGE }} />
                        <Typography sx={{ fontWeight: 700, fontSize: '0.82rem' }}>{f.n}</Typography>
                      </Box>
                    ))}
                  </Stack>
                  <Box sx={{ borderRadius: 2, bgcolor: 'action.hover', p: 1.25 }}>
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.25 }}>
                      <AutoAwesomeIcon sx={{ fontSize: 15, color: TEAL_DARK }} />
                      <Typography sx={{ fontWeight: 800, fontSize: '0.82rem' }}>Plano de ação do Dr. Exame</Typography>
                    </Stack>
                    <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', lineHeight: 1.45 }}>
                      Reduza carnes vermelhas e frituras; mais aveia e azeite. Refazer perfil lipídico em 3 meses.
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 1, color: 'text.secondary' }}>*Educativo. Não substitui consulta médica.</Typography>
                </Box>
              </Fade>
            )}

            {/* Ações finais */}
            {done && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ mt: 2 }} useFlexGap>
                <Button fullWidth variant="contained" onClick={() => navigate('/registrar')} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 800 }}>
                  Ver minha leitura de risco →
                </Button>
                <Button fullWidth variant="outlined" onClick={() => setStep(-1)} startIcon={<RefreshIcon />} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, borderColor: '#bfe7e3', color: TEAL_DARK }}>
                  Ver de novo
                </Button>
              </Stack>
            )}
          </Box>
        )}
      </Box>

      {/* keyframes + disclaimer discreto */}
      <style>{`
        @keyframes examPulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.06);opacity:.82} }
        @keyframes examCursor { 0%{opacity:1} 50%{opacity:0} }
      `}</style>
      {!started && (
        <Box sx={{ px: 2.5, pb: 1.75, textAlign: 'center' }}>
          <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
            <CheckCircleIcon sx={{ fontSize: 14, color: GREEN }} />
            <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>Demonstração com saída real de IA · nenhum dado seu é processado</Typography>
          </Stack>
        </Box>
      )}
    </Box>
  );
};
