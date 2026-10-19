import { useEffect, useRef, useState } from 'react';
import { Box, Chip, Stack, Typography, Button } from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VideocamOffOutlinedIcon from '@mui/icons-material/VideocamOffOutlined';
import CallEndIcon from '@mui/icons-material/CallEnd';
import VerifiedIcon from '@mui/icons-material/Verified';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { DrExame } from '../DrExame';

/**
 * NOVO (19/10/26) — vitrine da teleconsulta EMBUTIDA (F2 LiveKit) na landing.
 * "Me surpreenda" (dono): um simulacro VIVO do fluxo real dentro de um phone frame —
 * pré-join com consent Art.15 → conectando → in-call com timer de verdade e PiP
 * espelhado. Cicla sozinho (demo passiva) e reage ao clique do visitante no
 * "Autorizar e entrar". Sem vídeo real, sem rede — tudo CSS/estado local.
 */

type Phase = 'prejoin' | 'connecting' | 'incall';

const DOCTOR = { name: 'Dra. Ana Souza', crm: 'CRM 116739-SP' };

export const TeleconsultaShowcase = ({ onCta }: { onCta?: () => void }) => {
  const [phase, setPhase] = useState<Phase>('prejoin');
  const [secs, setSecs] = useState(0);
  const [muted, setMuted] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Demo autônoma: pré-join (6s) → conectando (1.6s) → in-call (12s) → recomeça.
  // Clique do visitante ("Autorizar e entrar") assume o controle e pula pra conectando.
  useEffect(() => {
    let t: number;
    if (phase === 'prejoin') t = window.setTimeout(() => setPhase('connecting'), 6000);
    else if (phase === 'connecting') t = window.setTimeout(() => setPhase('incall'), 1600);
    else t = window.setTimeout(() => { setPhase('prejoin'); setSecs(0); }, 12000);
    return () => window.clearTimeout(t);
  }, [phase]);

  // Timer real da chamada (o detalhe que dá vida — números correndo de verdade).
  useEffect(() => {
    if (phase !== 'incall') { setSecs(0); return; }
    timerRef.current = window.setInterval(() => setSecs((s) => s + 1), 1000);
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [phase]);

  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');

  return (
    <Box component="section" id="teleconsulta" sx={{
      py: { xs: 6, md: 9 }, scrollMarginTop: 80, position: 'relative', overflow: 'hidden',
      bgcolor: 'background.default',
      // Glow teal atrás do phone (profundidade premium, some em reduced-motion via media query)
      '&::before': {
        content: '""', position: 'absolute', top: '12%', right: { xs: '-80px', md: '6%' },
        width: 420, height: 420, borderRadius: '50%', pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(32,178,170,0.16) 0%, transparent 65%)',
        '@media (prefers-reduced-motion: no-preference)': {
          animation: 'dxTeleglow 7s ease-in-out infinite',
        },
        '@keyframes dxTeleglow': { '0%,100%': { opacity: 0.7, transform: 'scale(1)' }, '50%': { opacity: 1, transform: 'scale(1.08)' } },
      },
    }}>
      <Box sx={{ maxWidth: 1080, mx: 'auto', px: { xs: 2.5, sm: 4 }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.05fr 0.95fr' }, gap: { xs: 5, md: 7 }, alignItems: 'center' }}>

        {/* ── Coluna copy ─────────────────────────────────────────────── */}
        <Box>
          <Chip label="NOVO ✨ Telemedicina no app" sx={{
            mb: 2, height: 30, fontWeight: 800, fontSize: 12.5, letterSpacing: '0.02em',
            bgcolor: 'rgba(212,165,116,0.16)', color: '#8a6134', border: '1px solid rgba(212,165,116,0.35)',
          }} />
          <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: { xs: '1.85rem', md: '2.5rem' }, lineHeight: 1.15, letterSpacing: '-0.02em', color: 'text.primary', mb: 2 }}>
            A consulta agora acontece <Box component="span" sx={{ fontFamily: "'Instrument Serif', Georgia, serif", fontStyle: 'italic', fontWeight: 400, color: '#178f89' }}>aqui dentro</Box>
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 16.5, lineHeight: 1.75, maxWidth: 480, mb: 3 }}>
            Seu médico agenda, você recebe o push, autoriza com um toque e entra na chamada —
            sem sair do Dr. Exame, sem link perdido no WhatsApp. Sala exclusiva, vídeo seguro e
            o lembrete que nunca deixa a consulta passar.
          </Typography>

          <Stack spacing={1.75} sx={{ mb: 3.5 }}>
            {[
              { icon: <VideocamIcon sx={{ fontSize: 20 }} />, title: 'Chamada dentro do app', desc: 'Sala exclusiva criada na hora — nada de app externo.' },
              { icon: <VerifiedIcon sx={{ fontSize: 20 }} />, title: 'Consentimento Art. 15 · CFM 2.314/22', desc: 'Você autoriza a telemedicina antes de entrar. Registrado.' },
              { icon: <NotificationsActiveIcon sx={{ fontSize: 20 }} />, title: 'Push na hora certa', desc: 'Aviso de 1 dia, 1 hora e na hora da consulta.' },
              { icon: <EventRepeatIcon sx={{ fontSize: 20 }} />, title: 'Recorrência que rola sozinha', desc: 'Consulta mensal? O lembrete se renova a cada ocorrência.' },
              { icon: <LockOutlinedIcon sx={{ fontSize: 20 }} />, title: 'Sala fechada', desc: 'Só você e seu médico. Criptografia ponta a ponta do vídeo.' },
            ].map((f) => (
              <Stack key={f.title} direction="row" spacing={1.5} alignItems="flex-start">
                <Box sx={{ width: 38, height: 38, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: 'rgba(32,178,170,0.10)', color: '#178f89', flexShrink: 0 }}>{f.icon}</Box>
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: 15, color: 'text.primary' }}>{f.title}</Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: 13.5, lineHeight: 1.55 }}>{f.desc}</Typography>
                </Box>
              </Stack>
            ))}
          </Stack>

          <Button
            variant="contained" size="large" endIcon={<PlayArrowIcon />} onClick={onCta}
            sx={{
              textTransform: 'none', fontWeight: 800, fontSize: 15.5, borderRadius: '999px', px: 3.5, py: 1.4,
              background: 'linear-gradient(135deg,#20b2aa,#178f89)',
              boxShadow: '0 6px 20px rgba(32,178,170,0.35)',
              '&:hover': { background: 'linear-gradient(135deg,#23c4bb,#1a9d96)', boxShadow: '0 8px 24px rgba(32,178,170,0.45)' },
            }}
          >
            Quero consultar pelo app
          </Button>
        </Box>

        {/* ── Phone frame com a simulação viva ─────────────────────────── */}
        <Box sx={{ justifySelf: { xs: 'center', md: 'end' }, position: 'relative' }}>
          {/* Moldura */}
          <Box sx={{
            width: { xs: 292, sm: 318 }, borderRadius: '42px', p: '10px', position: 'relative',
            background: 'linear-gradient(160deg,#1c2b2a,#0e1918)',
            boxShadow: '0 24px 64px rgba(15,60,58,0.35), 0 4px 16px rgba(0,0,0,0.25)',
          }}>
            {/* Notch */}
            <Box sx={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', width: 96, height: 22, borderRadius: 12, background: '#0a1110', zIndex: 5 }} />
            {/* Tela */}
            <Box sx={{
              position: 'relative', borderRadius: '34px', overflow: 'hidden', aspectRatio: '9/18.6',
              background: '#0c1818', color: '#e8eef0', fontFamily: '"Inter",sans-serif',
            }}>
              {/* ── IN-CALL (camada de fundo — aparece com fade) ── */}
              <Box sx={{
                position: 'absolute', inset: 0, opacity: phase === 'incall' ? 1 : 0,
                transition: 'opacity .6s ease', pointerEvents: 'none',
              }}>
                {/* "Vídeo" do médico — gradiente vivo com movimento suave */}
                <Box sx={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(135deg,#123f3c 0%,#1d5c57 45%,#2b7a72 100%)',
                  '&::after': {
                    content: '""', position: 'absolute', inset: 0,
                    background: 'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.10), transparent 55%)',
                    '@media (prefers-reduced-motion: no-preference)': { animation: 'dxTeledrift 9s ease-in-out infinite alternate' },
                    '@keyframes dxTeledrift': { from: { transform: 'translate(0,0) scale(1)' }, to: { transform: 'translate(4%,6%) scale(1.07)' } },
                  },
                }} />
                {/* Silhueta do médico (avatar pulsando no centro-baixo) */}
                <Box sx={{ position: 'absolute', left: '50%', bottom: 96, transform: 'translateX(-50%)', display: 'grid', justifyItems: 'center', gap: 1 }}>
                  <Box sx={{
                    width: 74, height: 74, borderRadius: '50%',
                    background: 'linear-gradient(135deg,#d4a574,#b88a54)', display: 'grid', placeItems: 'center',
                    fontSize: 26, fontWeight: 800, color: '#fff',
                    boxShadow: '0 0 0 4px rgba(255,255,255,0.12), 0 8px 24px rgba(0,0,0,0.35)',
                    '@media (prefers-reduced-motion: no-preference)': { animation: 'dxTelebreath 4s ease-in-out infinite' },
                    '@keyframes dxTelebreath': { '0%,100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.035)' } },
                  }}>A</Box>
                </Box>

                {/* Header vidro */}
                <Stack direction="row" spacing={1} alignItems="center" sx={{ position: 'absolute', top: 44, left: 14, right: 14 }}>
                  <DrExame size={30} sx={{ borderRadius: '9px' }} />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography noWrap sx={{ fontSize: 13, fontWeight: 800, lineHeight: 1.2 }}>{DOCTOR.name}</Typography>
                    <Typography sx={{ fontSize: 10.5, opacity: 0.75 }}>{DOCTOR.crm}</Typography>
                  </Box>
                  <Chip size="small" label={`${mm}:${ss}`} sx={{ height: 24, fontWeight: 800, fontSize: 12, bgcolor: 'rgba(0,0,0,0.35)', color: '#fff', fontFamily: 'monospace', '& .MuiChip-label': { px: 1 } }} />
                </Stack>

                {/* PiP do paciente (espelhado = preview de câmera) */}
                <Box sx={{
                  position: 'absolute', right: 12, top: 108, width: 84, height: 112, borderRadius: 14,
                  border: '2px solid rgba(255,255,255,0.25)', overflow: 'hidden',
                  background: 'linear-gradient(200deg,#2e6f8e,#17323f)', transform: 'scaleX(-1)',
                  display: 'grid', placeItems: 'center',
                  boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
                }}>
                  <Box sx={{ width: 30, height: 30, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.18)', transform: 'scaleX(-1)' }} />
                </Box>

                {/* Chip autorizada */}
                <Chip size="small" icon={<VerifiedIcon sx={{ fontSize: 13, color: '#5fc9c3 !important' }} />} label="telemedicina autorizada" sx={{
                  position: 'absolute', left: 14, top: 108, height: 22, fontSize: 9.5, fontWeight: 700,
                  bgcolor: 'rgba(32,178,170,0.22)', color: '#9fe5e0', '& .MuiChip-label': { px: 0.75 },
                }} />

                {/* Controles */}
                <Stack direction="row" spacing={1.5} justifyContent="center" sx={{ position: 'absolute', bottom: 34, left: 0, right: 0 }}>
                  <Box sx={{ width: 46, height: 46, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'rgba(0,0,0,0.38)', color: muted ? '#fff' : '#e8eef0' }}>
                    {muted ? <MicOffIcon sx={{ fontSize: 20 }} /> : <MicIcon sx={{ fontSize: 20 }} />}
                  </Box>
                  <Box sx={{ width: 46, height: 46, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'rgba(0,0,0,0.38)', color: '#e8eef0' }}>
                    <VideocamIcon sx={{ fontSize: 20 }} />
                  </Box>
                  <Box sx={{
                    width: 46, height: 46, borderRadius: '50%', display: 'grid', placeItems: 'center',
                    background: 'linear-gradient(135deg,#d4a574,#b88a54)', color: '#fff',
                    boxShadow: '0 4px 14px rgba(212,165,116,0.5)',
                  }}>
                    <CallEndIcon sx={{ fontSize: 20 }} />
                  </Box>
                </Stack>
              </Box>

              {/* ── CONECTANDO (overlay) ── */}
              {phase === 'connecting' && (
                <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(12,24,24,0.92)', zIndex: 3 }}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Box sx={{
                      width: 52, height: 52, mx: 'auto', mb: 2, borderRadius: '50%',
                      border: '3px solid rgba(32,178,170,0.25)', borderTopColor: '#20b2aa',
                      '@media (prefers-reduced-motion: no-preference)': { animation: 'dxTelespin 0.9s linear infinite' },
                      '@keyframes dxTelespin': { to: { transform: 'rotate(360deg)' } },
                    }} />
                    <Typography sx={{ fontSize: 14, fontWeight: 700, opacity: 0.9 }}>Conectando com {DOCTOR.name.split(' ')[0]}…</Typography>
                  </Box>
                </Box>
              )}

              {/* ── PRÉ-JOIN (overlay) ── */}
              {phase === 'prejoin' && (
                <Box sx={{ position: 'absolute', inset: 0, background: 'rgba(10,20,20,0.94)', zIndex: 3, p: 2.5, pt: 9, display: 'flex', flexDirection: 'column' }}>
                  <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 2 }}>
                    <DrExame size={44} sx={{ borderRadius: '13px' }} />
                    <Box>
                      <Typography sx={{ fontSize: 16, fontWeight: 800 }}>Teleconsulta de retorno</Typography>
                      <Typography sx={{ fontSize: 12, opacity: 0.75 }}>com {DOCTOR.name} · {DOCTOR.crm}</Typography>
                    </Box>
                  </Stack>

                  {/* Preview "câmera" */}
                  <Box sx={{
                    position: 'relative', borderRadius: 16, overflow: 'hidden', flex: 1, minHeight: 130,
                    background: 'linear-gradient(200deg,#243b36,#152622)',
                    transform: 'scaleX(-1)', display: 'grid', placeItems: 'center',
                  }}>
                    <Box sx={{ width: 56, height: 56, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.14)', transform: 'scaleX(-1)' }} />
                    <Chip size="small" label="sua câmera" sx={{ position: 'absolute', top: 10, left: 10, height: 22, fontSize: 10, bgcolor: 'rgba(0,0,0,0.4)', color: '#cfe8e6', transform: 'scaleX(-1)' }} />
                  </Box>

                  <Typography sx={{ fontSize: 11, lineHeight: 1.6, opacity: 0.8, mt: 1.75, mb: 1.5 }}>
                    Autorizo a telemedicina conforme o Art. 15 da Res. CFM 2.314/2022 — consulta por vídeo com
                    registro no meu histórico.
                  </Typography>

                  <Button
                    fullWidth variant="contained" startIcon={<VerifiedIcon />} onClick={() => setPhase('connecting')}
                    sx={{
                      textTransform: 'none', fontWeight: 800, fontSize: 15, borderRadius: '999px', py: 1.25,
                      background: 'linear-gradient(135deg,#20b2aa,#178f89)', boxShadow: '0 6px 18px rgba(32,178,170,0.4)',
                      '&:hover': { background: 'linear-gradient(135deg,#23c4bb,#1a9d96)' },
                      '@media (prefers-reduced-motion: no-preference)': { animation: 'dxTelepulse 2.4s ease-in-out infinite' },
                      '@keyframes dxTelepulse': { '0%,100%': { boxShadow: '0 6px 18px rgba(32,178,170,0.35)' }, '50%': { boxShadow: '0 6px 26px rgba(32,178,170,0.6)' } },
                    }}
                  >
                    Autorizar e entrar
                  </Button>
                  <Typography sx={{ textAlign: 'center', fontSize: 10.5, opacity: 0.55, mt: 1 }}>
                    🔒 Sala exclusiva · você e seu médico
                  </Typography>
                </Box>
              )}

              {/* Legenda "demonstração" discreta */}
              <Chip size="small" label="demonstração" sx={{
                position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 6,
                height: 20, fontSize: 9, fontWeight: 700, bgcolor: 'rgba(0,0,0,0.35)', color: 'rgba(255,255,255,0.65)',
              }} />
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
