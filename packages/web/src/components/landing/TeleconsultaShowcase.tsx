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
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SecurityIcon from '@mui/icons-material/Security';
import { DrExame } from '../DrExame';

type Phase = 'prejoin' | 'connecting' | 'incall';

const DOCTOR = {
  name: 'Dr. Lucas Silva',
  crm: 'CRM 142.890-SP',
  specialty: 'Clínica Geral & Telemedicina',
};

const DOCTOR_IMG = `${import.meta.env.BASE_URL}assets/telemed/doctor.jpg`;
const PATIENT_IMG = `${import.meta.env.BASE_URL}assets/telemed/patient.jpg`;

export const TeleconsultaShowcase = ({ onCta }: { onCta?: () => void }) => {
  const [phase, setPhase] = useState<Phase>('prejoin');
  const [secs, setSecs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Ciclo automático da demonstração:
  // prejoin (6s) -> connecting (1.8s) -> in-call (14s) -> reinicia
  useEffect(() => {
    let t: number;
    if (phase === 'prejoin') {
      t = window.setTimeout(() => setPhase('connecting'), 6500);
    } else if (phase === 'connecting') {
      t = window.setTimeout(() => setPhase('incall'), 1800);
    } else {
      t = window.setTimeout(() => {
        setPhase('prejoin');
        setSecs(0);
      }, 14000);
    }
    return () => window.clearTimeout(t);
  }, [phase]);

  // Cronômetro da chamada ao vivo
  useEffect(() => {
    if (phase !== 'incall') {
      setSecs(0);
      return;
    }
    timerRef.current = window.setInterval(() => setSecs((s) => s + 1), 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [phase]);

  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');

  return (
    <Box
      component="section"
      id="teleconsulta"
      sx={{
        py: { xs: 6, md: 10 },
        scrollMarginTop: 80,
        position: 'relative',
        overflow: 'hidden',
        bgcolor: 'background.default',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: '10%',
          right: { xs: '-80px', md: '5%' },
          width: 480,
          height: 480,
          borderRadius: '50%',
          pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(32,178,170,0.18) 0%, transparent 68%)',
          animation: 'dxTeleglow 8s ease-in-out infinite',
          '@keyframes dxTeleglow': {
            '0%,100%': { opacity: 0.6, transform: 'scale(1)' },
            '50%': { opacity: 1, transform: 'scale(1.12)' },
          },
        },
      }}
    >
      <Box
        sx={{
          maxWidth: 1120,
          mx: 'auto',
          px: { xs: 2.5, sm: 4 },
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1.05fr 0.95fr' },
          gap: { xs: 5, md: 8 },
          alignItems: 'center',
        }}
      >
        {/* ── Coluna Textos & Vantagens ─────────────────────────────── */}
        <Box>
          <Chip
            label="NOVO ✨ Telemedicina Oficial no App"
            sx={{
              mb: 2,
              height: 32,
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: '0.02em',
              bgcolor: 'rgba(32,178,170,0.12)',
              color: '#0f766e',
              border: '1px solid rgba(32,178,170,0.3)',
            }}
          />
          <Typography
            sx={{
              fontFamily: '"Poppins",sans-serif',
              fontWeight: 800,
              fontSize: { xs: '2rem', md: '2.75rem' },
              lineHeight: 1.15,
              letterSpacing: '-0.025em',
              color: 'text.primary',
              mb: 2,
            }}
          >
            A consulta médica agora acontece{' '}
            <Box
              component="span"
              sx={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontStyle: 'italic',
                fontWeight: 400,
                color: '#178f89',
              }}
            >
              aqui dentro
            </Box>
          </Typography>
          <Typography
            sx={{
              color: 'text.secondary',
              fontSize: 16.5,
              lineHeight: 1.75,
              maxWidth: 500,
              mb: 3.5,
            }}
          >
            Seu médico agenda, você recebe o aviso no celular, autoriza com um único toque e entra
            na chamada — com vídeo nítido em alta definição, histórico integrado e total segurança
            jurídica e médica.
          </Typography>

          <Stack spacing={2} sx={{ mb: 4 }}>
            {[
              {
                icon: <VideocamIcon sx={{ fontSize: 21 }} />,
                title: 'Chamada Direto no App (Sem App Externo)',
                desc: 'Vídeo e áudio de alta fidelidade sem precisar baixar Google Meet ou Zoom.',
              },
              {
                icon: <VerifiedIcon sx={{ fontSize: 21 }} />,
                title: 'Consentimento Art. 15 · CFM 2.314/22',
                desc: 'Registro eletrônico de autorização antes de iniciar, cumprindo o padrão CFM.',
              },
              {
                icon: <NotificationsActiveIcon sx={{ fontSize: 21 }} />,
                title: 'Lembretes Inteligentes no Celular',
                desc: 'Push e avisos programados para paciente e médico não perderem o horário.',
              },
              {
                icon: <SecurityIcon sx={{ fontSize: 21 }} />,
                title: 'Sala Privativa & Criptografia Ponta a Ponta',
                desc: 'Seus dados de saúde e sua consulta protegidos com tecnologia WebRTC segura.',
              },
            ].map((f) => (
              <Stack key={f.title} direction="row" spacing={1.75} alignItems="flex-start">
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: '13px',
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: 'rgba(32,178,170,0.12)',
                    color: '#14b8a6',
                    flexShrink: 0,
                  }}
                >
                  {f.icon}
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: 15.5, color: 'text.primary' }}>
                    {f.title}
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: 13.5, lineHeight: 1.55 }}>
                    {f.desc}
                  </Typography>
                </Box>
              </Stack>
            ))}
          </Stack>

          <Button
            variant="contained"
            size="large"
            endIcon={<PlayArrowIcon />}
            onClick={onCta}
            sx={{
              textTransform: 'none',
              fontWeight: 800,
              fontSize: 16,
              borderRadius: '999px',
              px: 4,
              py: 1.5,
              background: 'linear-gradient(135deg,#20b2aa,#0f766e)',
              boxShadow: '0 8px 24px rgba(32,178,170,0.35)',
              '&:hover': {
                background: 'linear-gradient(135deg,#24c9c1,#118a81)',
                boxShadow: '0 10px 28px rgba(32,178,170,0.48)',
                transform: 'translateY(-2px)',
              },
              transition: 'all 0.2s ease',
            }}
          >
            Quero consultar pelo app
          </Button>
        </Box>

        {/* ── Simulacro de Celular Interativo Ultra-Realista ─────────── */}
        <Box sx={{ justifySelf: { xs: 'center', md: 'end' }, position: 'relative' }}>
          {/* Sombra 3D e Brilho de Borda do Smartphone */}
          <Box
            sx={{
              width: { xs: 300, sm: 330 },
              borderRadius: '46px',
              p: '11px',
              position: 'relative',
              background: 'linear-gradient(165deg, #2d3f3d 0%, #101c1a 60%, #080f0e 100%)',
              boxShadow:
                '0 30px 80px rgba(10,35,33,0.45), 0 10px 25px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.15)',
            }}
          >
            {/* Dynamic Island / Notch */}
            <Box
              sx={{
                position: 'absolute',
                top: 21,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 98,
                height: 24,
                borderRadius: '14px',
                background: '#000',
                zIndex: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 1.5,
              }}
            >
              <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: '#122522' }} />
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  bgcolor: phase === 'incall' ? '#10b981' : '#334155',
                  boxShadow: phase === 'incall' ? '0 0 6px #10b981' : 'none',
                }}
              />
            </Box>

            {/* Tela do Celular */}
            <Box
              sx={{
                position: 'relative',
                borderRadius: '36px',
                overflow: 'hidden',
                aspectRatio: '9/18.8',
                background: '#0a1413',
                color: '#fff',
                fontFamily: '"Inter",sans-serif',
              }}
            >
              {/* ═══════════════════════════════════════════════════════════
                  FASE 3: IN-CALL (MÉDICO AO VIVO EM TELA CHEIA)
                  ═══════════════════════════════════════════════════════════ */}
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  opacity: phase === 'incall' ? 1 : 0,
                  pointerEvents: phase === 'incall' ? 'auto' : 'none',
                  transition: 'opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                  backgroundImage: `url(${DOCTOR_IMG})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center 15%',
                  animation: phase === 'incall' ? 'dxDoctorDrift 12s ease-in-out infinite alternate' : 'none',
                  '@keyframes dxDoctorDrift': {
                    '0%': { transform: 'scale(1)' },
                    '100%': { transform: 'scale(1.045) translateY(-4px)' },
                  },
                }}
              >
                {/* Vinhetas escuras nos cantos para leitura perfeita */}
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    background:
                      'linear-gradient(180deg, rgba(8,18,17,0.78) 0%, rgba(8,18,17,0.12) 35%, rgba(8,18,17,0.10) 60%, rgba(6,14,13,0.85) 100%)',
                  }}
                />

                {/* Header Superior da Chamada */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: 52,
                    left: 14,
                    right: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    zIndex: 10,
                  }}
                >
                  <Stack direction="row" spacing={1.25} alignItems="center">
                    <DrExame size={32} sx={{ borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        noWrap
                        sx={{ fontSize: 13.5, fontWeight: 800, color: '#fff', lineHeight: 1.2, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
                      >
                        {DOCTOR.name}
                      </Typography>
                      <Typography sx={{ fontSize: 10.5, color: '#86efac', fontWeight: 600 }}>
                        {DOCTOR.crm}
                      </Typography>
                    </Box>
                  </Stack>

                  {/* Badge Timer & HD */}
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Box
                      sx={{
                        px: 1,
                        py: 0.35,
                        borderRadius: '999px',
                        bgcolor: 'rgba(0,0,0,0.5)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.6,
                      }}
                    >
                      <Box
                        sx={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          bgcolor: '#10b981',
                          boxShadow: '0 0 8px #10b981',
                          animation: 'dxBlink 1.4s ease-in-out infinite',
                          '@keyframes dxBlink': {
                            '0%,100%': { opacity: 1 },
                            '50%': { opacity: 0.3 },
                          },
                        }}
                      />
                      <Typography sx={{ fontSize: 11, fontWeight: 800, fontFamily: 'monospace', color: '#fff' }}>
                        {mm}:{ss}
                      </Typography>
                    </Box>
                    <SignalCellularAltIcon sx={{ fontSize: 16, color: '#10b981' }} />
                  </Stack>
                </Box>

                {/* Equalizador de Voz do Médico ao Vivo (falando agora) */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: 14,
                    bottom: 96,
                    px: 1.25,
                    py: 0.65,
                    borderRadius: '14px',
                    bgcolor: 'rgba(10,25,23,0.72)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(32,178,170,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    zIndex: 10,
                  }}
                >
                  <Stack direction="row" spacing={0.4} alignItems="center" sx={{ height: 14 }}>
                    {[0.6, 1.2, 0.8, 1.4, 0.9].map((delay, i) => (
                      <Box
                        key={i}
                        sx={{
                          width: 3,
                          borderRadius: '2px',
                          bgcolor: '#20b2aa',
                          animation: `dxWave 0.9s ease-in-out infinite alternate`,
                          animationDelay: `${delay * 0.25}s`,
                          '@keyframes dxWave': {
                            '0%': { height: 3 },
                            '100%': { height: 14 },
                          },
                        }}
                      />
                    ))}
                  </Stack>
                  <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: '#99f6e4' }}>
                    Dr. Lucas falando…
                  </Typography>
                </Box>

                {/* PiP do Paciente no Canto Superior Direito */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: 100,
                    right: 12,
                    width: 86,
                    height: 116,
                    borderRadius: '16px',
                    overflow: 'hidden',
                    border: '2px solid rgba(255,255,255,0.4)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    backgroundImage: camOff ? 'none' : `url(${PATIENT_IMG})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center 20%',
                    bgcolor: '#132825',
                    zIndex: 10,
                    transition: 'all 0.25s ease',
                  }}
                >
                  <Chip
                    size="small"
                    label="Você"
                    sx={{
                      position: 'absolute',
                      bottom: 5,
                      left: 5,
                      height: 16,
                      fontSize: 8.5,
                      fontWeight: 800,
                      bgcolor: 'rgba(0,0,0,0.6)',
                      color: '#fff',
                      backdropFilter: 'blur(4px)',
                      '& .MuiChip-label': { px: 0.6 },
                    }}
                  />
                  {muted && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 5,
                        right: 5,
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        bgcolor: 'rgba(239,68,68,0.85)',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <MicOffIcon sx={{ fontSize: 11, color: '#fff' }} />
                    </Box>
                  )}
                </Box>

                {/* Barra Inferior com Controles de Chamada */}
                <Stack
                  direction="row"
                  spacing={1.5}
                  justifyContent="center"
                  alignItems="center"
                  sx={{
                    position: 'absolute',
                    bottom: 26,
                    left: 0,
                    right: 0,
                    zIndex: 10,
                  }}
                >
                  {/* Botão Microfone */}
                  <Box
                    onClick={() => setMuted((m) => !m)}
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: muted ? '#ef4444' : 'rgba(0,0,0,0.55)',
                      backdropFilter: 'blur(8px)',
                      color: '#fff',
                      cursor: 'pointer',
                      border: '1px solid rgba(255,255,255,0.15)',
                      transition: 'all 0.2s ease',
                      '&:hover': { transform: 'scale(1.08)' },
                    }}
                  >
                    {muted ? <MicOffIcon sx={{ fontSize: 20 }} /> : <MicIcon sx={{ fontSize: 20 }} />}
                  </Box>

                  {/* Botão Câmera */}
                  <Box
                    onClick={() => setCamOff((c) => !c)}
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: camOff ? '#ef4444' : 'rgba(0,0,0,0.55)',
                      backdropFilter: 'blur(8px)',
                      color: '#fff',
                      cursor: 'pointer',
                      border: '1px solid rgba(255,255,255,0.15)',
                      transition: 'all 0.2s ease',
                      '&:hover': { transform: 'scale(1.08)' },
                    }}
                  >
                    {camOff ? <VideocamOffOutlinedIcon sx={{ fontSize: 20 }} /> : <VideocamIcon sx={{ fontSize: 20 }} />}
                  </Box>

                  {/* Botão Encerrar / Reiniciar Demo */}
                  <Box
                    onClick={() => {
                      setPhase('prejoin');
                      setSecs(0);
                    }}
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                      color: '#fff',
                      cursor: 'pointer',
                      boxShadow: '0 4px 16px rgba(239,68,68,0.5)',
                      transition: 'all 0.2s ease',
                      '&:hover': { transform: 'scale(1.08)' },
                    }}
                  >
                    <CallEndIcon sx={{ fontSize: 22 }} />
                  </Box>
                </Stack>
              </Box>

              {/* ═══════════════════════════════════════════════════════════
                  FASE 2: CONECTANDO (ANÉIS HOLOGRÁFICOS & CRIPTOGRAFIA)
                  ═══════════════════════════════════════════════════════════ */}
              {phase === 'connecting' && (
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 15,
                    background: 'radial-gradient(circle at 50% 40%, #112826 0%, #06100f 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    p: 3,
                  }}
                >
                  {/* Anéis de Radar com Foto do Médico */}
                  <Box sx={{ position: 'relative', width: 110, height: 110, mb: 3 }}>
                    {/* Anéis Pulsantes */}
                    {[1, 2].map((ring) => (
                      <Box
                        key={ring}
                        sx={{
                          position: 'absolute',
                          inset: 0,
                          borderRadius: '50%',
                          border: '2px solid rgba(32,178,170,0.4)',
                          animation: `dxPulseRing 1.8s cubic-bezier(0.2, 0.8, 0.4, 1) infinite`,
                          animationDelay: `${ring * 0.6}s`,
                          '@keyframes dxPulseRing': {
                            '0%': { transform: 'scale(0.8)', opacity: 0.8 },
                            '100%': { transform: 'scale(1.6)', opacity: 0 },
                          },
                        }}
                      />
                    ))}
                    {/* Foto do Médico Redonda */}
                    <Box
                      sx={{
                        position: 'absolute',
                        inset: 4,
                        borderRadius: '50%',
                        overflow: 'hidden',
                        border: '3px solid #20b2aa',
                        boxShadow: '0 0 20px rgba(32,178,170,0.5)',
                        backgroundImage: `url(${DOCTOR_IMG})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center 15%',
                      }}
                    />
                  </Box>

                  <Typography sx={{ fontSize: 16, fontWeight: 800, color: '#fff', mb: 0.5 }}>
                    Conectando com a sala…
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, color: '#20b2aa', fontWeight: 600, mb: 2 }}>
                    {DOCTOR.name}
                  </Typography>

                  <Chip
                    icon={<LockOutlinedIcon sx={{ '&&': { fontSize: 13, color: '#99f6e4' } }} />}
                    label="Criptografia ponta a ponta ativa"
                    sx={{
                      height: 24,
                      fontSize: 10,
                      fontWeight: 700,
                      bgcolor: 'rgba(32,178,170,0.15)',
                      color: '#99f6e4',
                      border: '1px solid rgba(32,178,170,0.3)',
                    }}
                  />
                </Box>
              )}

              {/* ═══════════════════════════════════════════════════════════
                  FASE 1: PRÉ-JOIN (CÂMERA REAL DO PACIENTE + SCANNER FACIAL)
                  ═══════════════════════════════════════════════════════════ */}
              {phase === 'prejoin' && (
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 15,
                    p: 2.5,
                    pt: 7.5,
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'linear-gradient(180deg, #0e1e1c 0%, #081312 100%)',
                  }}
                >
                  {/* Cabeçalho do Agendamento */}
                  <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 2 }}>
                    <DrExame size={40} sx={{ borderRadius: '12px' }} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 15, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
                        Teleconsulta de Retorno
                      </Typography>
                      <Typography sx={{ fontSize: 11.5, color: '#99f6e4', fontWeight: 600 }}>
                        {DOCTOR.name} · {DOCTOR.crm}
                      </Typography>
                    </Box>
                  </Stack>

                  {/* Preview da Câmera do Paciente (Foto Real com Scanner Facial HUD) */}
                  <Box
                    sx={{
                      position: 'relative',
                      borderRadius: '20px',
                      overflow: 'hidden',
                      flex: 1,
                      minHeight: 200,
                      backgroundImage: `url(${PATIENT_IMG})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center 20%',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                      border: '1px solid rgba(255,255,255,0.12)',
                    }}
                  >
                    {/* Vinheta suave */}
                    <Box
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        background:
                          'radial-gradient(circle at 50% 50%, transparent 40%, rgba(0,0,0,0.45) 100%)',
                      }}
                    />

                    {/* HUD: Retângulo de Foco Facial Inteligente */}
                    <Box
                      sx={{
                        position: 'absolute',
                        top: '18%',
                        left: '22%',
                        width: '56%',
                        height: '52%',
                        borderRadius: '16px',
                        border: '2px dashed rgba(32,178,170,0.7)',
                        boxShadow: '0 0 16px rgba(32,178,170,0.2)',
                        pointerEvents: 'none',
                        animation: 'dxFaceScan 3s ease-in-out infinite',
                        '@keyframes dxFaceScan': {
                          '0%,100%': { borderColor: 'rgba(32,178,170,0.85)', transform: 'scale(1)' },
                          '50%': { borderColor: 'rgba(52,211,153,0.4)', transform: 'scale(1.02)' },
                        },
                      }}
                    >
                      {/* Cantoneiras HUD */}
                      <Box sx={{ position: 'absolute', top: -3, left: -3, width: 10, height: 10, borderTop: '3px solid #20b2aa', borderLeft: '3px solid #20b2aa' }} />
                      <Box sx={{ position: 'absolute', top: -3, right: -3, width: 10, height: 10, borderTop: '3px solid #20b2aa', borderRight: '3px solid #20b2aa' }} />
                      <Box sx={{ position: 'absolute', bottom: -3, left: -3, width: 10, height: 10, borderBottom: '3px solid #20b2aa', borderLeft: '3px solid #20b2aa' }} />
                      <Box sx={{ position: 'absolute', bottom: -3, right: -3, width: 10, height: 10, borderBottom: '3px solid #20b2aa', borderRight: '3px solid #20b2aa' }} />
                    </Box>

                    {/* Badge "Sua Câmera Ao Vivo" */}
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 10,
                        left: 10,
                        px: 1,
                        py: 0.35,
                        borderRadius: '999px',
                        bgcolor: 'rgba(0,0,0,0.65)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.6,
                      }}
                    >
                      <Box
                        sx={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          bgcolor: '#10b981',
                          boxShadow: '0 0 6px #10b981',
                        }}
                      />
                      <Typography sx={{ fontSize: 9.5, fontWeight: 700, color: '#fff', letterSpacing: '0.03em' }}>
                        SUA CÂMERA AO VIVO
                      </Typography>
                    </Box>

                    {/* Tag de Resolução & Status */}
                    <Box
                      sx={{
                        position: 'absolute',
                        bottom: 10,
                        left: 10,
                        px: 1,
                        py: 0.35,
                        borderRadius: '999px',
                        bgcolor: 'rgba(0,0,0,0.65)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                      }}
                    >
                      <CheckCircleIcon sx={{ fontSize: 12, color: '#10b981' }} />
                      <Typography sx={{ fontSize: 9.5, fontWeight: 700, color: '#e2e8f0' }}>
                        1080p HD · Microfone OK
                      </Typography>
                    </Box>
                  </Box>

                  {/* Texto Legal CFM Art. 15 */}
                  <Typography
                    sx={{
                      fontSize: 11,
                      lineHeight: 1.5,
                      color: 'rgba(255,255,255,0.72)',
                      mt: 1.5,
                      mb: 1.75,
                      textAlign: 'center',
                    }}
                  >
                    Autorizo a telemedicina conforme o <strong>Art. 15 da Res. CFM 2.314/22</strong>{' '}
                    com gravação de registro clínico.
                  </Typography>

                  {/* Botão Interativo "Autorizar e Entrar" */}
                  <Button
                    fullWidth
                    variant="contained"
                    startIcon={<VerifiedIcon sx={{ fontSize: 20 }} />}
                    onClick={() => setPhase('connecting')}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 800,
                      fontSize: 15,
                      borderRadius: '999px',
                      py: 1.35,
                      background: 'linear-gradient(135deg, #20b2aa, #0f766e)',
                      boxShadow: '0 8px 24px rgba(32,178,170,0.45)',
                      animation: 'dxPulseBtn 2.2s ease-in-out infinite',
                      '@keyframes dxPulseBtn': {
                        '0%,100%': { boxShadow: '0 8px 24px rgba(32,178,170,0.45)', transform: 'scale(1)' },
                        '50%': { boxShadow: '0 8px 32px rgba(32,178,170,0.7)', transform: 'scale(1.02)' },
                      },
                      '&:hover': {
                        background: 'linear-gradient(135deg, #24c9c1, #118a81)',
                        transform: 'scale(1.03)',
                      },
                    }}
                  >
                    Autorizar e entrar
                  </Button>

                  <Typography
                    sx={{
                      textAlign: 'center',
                      fontSize: 10.5,
                      color: 'rgba(255,255,255,0.5)',
                      mt: 1,
                    }}
                  >
                    🔒 Sala médica privativa · Toque para testar
                  </Typography>
                </Box>
              )}

              {/* Tag Discreta de Simulação no Rodapé */}
              <Chip
                size="small"
                label="simulação interativa ao vivo"
                sx={{
                  position: 'absolute',
                  bottom: 8,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 25,
                  height: 19,
                  fontSize: 8.5,
                  fontWeight: 700,
                  bgcolor: 'rgba(0,0,0,0.45)',
                  color: 'rgba(255,255,255,0.7)',
                  backdropFilter: 'blur(4px)',
                }}
              />
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
