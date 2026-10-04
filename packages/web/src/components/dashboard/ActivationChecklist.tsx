import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Button, LinearProgress, alpha,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import MedicalServicesOutlinedIcon from '@mui/icons-material/MedicalServicesOutlined';
import { API_URL, token } from '../../config';

/** Checklist de ATIVAÇÃO (padrão home-stage de apps maduros): o dashboard de quem ainda
 *  não tem exames mostra passos concretos em vez de tiles vazios — ataca o cliff do dia 0
 *  (63% não voltam). Estado 100% REAL do server (exames / uso de IA / convite de médico),
 *  nada de localStorage — sobrevive a troca de aparelho. Renderiza SÓ no estado vazio:
 *  1º exame enviado = checklist cumpre a missão e sai de cena (a celebração W1 assume). */

interface Step {
  id: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
  done: boolean;
  cta: string;
  to: string;
}

export const ActivationChecklist = ({ exams }: { exams: number }) => {
  const navigate = useNavigate();
  const [aiUsed, setAiUsed] = useState<boolean | null>(null);
  const [doctorInvited, setDoctorInvited] = useState<boolean | null>(null);

  // Estado server: usou IA (algum lançamento ai_*) + convidou médico (shares). Paralelo, best-effort.
  useEffect(() => {
    const h = { Authorization: `Bearer ${token()}` };
    fetch(`${API_URL}/billing/credits/history?page=1`, { headers: h })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAiUsed((d?.items ?? []).some((t: any) => String(t.kind || '').startsWith('ai_'))))
      .catch(() => setAiUsed(null));
    fetch(`${API_URL}/doctor-shares`, { headers: h })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDoctorInvited(Array.isArray(d) ? d.length > 0 : Array.isArray(d?.shares) ? d.shares.length > 0 : false))
      .catch(() => setDoctorInvited(null));
  }, []);

  const steps: Step[] = [
    {
      id: 'exam', icon: <UploadFileOutlinedIcon />, title: 'Envie seu 1º exame',
      sub: 'PDF ou foto do laudo — a IA lê e explica cada valor', done: exams > 0,
      cta: 'Enviar agora', to: '/exams/create',
    },
    {
      id: 'ai', icon: <AutoAwesomeOutlinedIcon />, title: 'Converse com a IA',
      sub: 'Pergunte qualquer coisa sobre seus exames ou saúde', done: aiUsed === true,
      cta: 'Perguntar', to: '/chat',
    },
    {
      id: 'doctor', icon: <MedicalServicesOutlinedIcon />, title: 'Convide seu médico',
      sub: 'Ele acompanha sua evolução pelo portal dele', done: doctorInvited === true,
      cta: 'Convidar', to: '/medicos',
    },
  ];

  const done = steps.filter((s) => s.done).length;
  const pct = Math.round((done / steps.length) * 100);

  return (
    <Card elevation={0} sx={{
      borderRadius: '16px', mb: 2,
      border: (t) => `1px solid ${alpha(t.palette.primary.main, 0.22)}`,
      background: (t) => (t.palette.mode === 'dark'
        ? 'linear-gradient(160deg, rgba(32,178,170,.08), transparent 55%)'
        : 'linear-gradient(160deg, rgba(32,178,170,.06), transparent 55%)'),
    }}>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 15 }}>
            Ative sua conta
          </Typography>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: (t) => teal(t) }}>
            {done} de {steps.length}
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate" value={pct}
          sx={{
            height: 6, borderRadius: 3, mb: 1.5, bgcolor: 'rgba(32,178,170,.12)',
            '& .MuiLinearProgress-bar': { borderRadius: 3, background: 'linear-gradient(90deg,#20b2aa,#178f89)' },
          }}
        />
        {steps.map((s) => (
          <Box key={s.id} sx={{
            display: 'flex', alignItems: 'center', gap: 1.25, py: 1,
            opacity: s.done ? 0.62 : 1,
          }}>
            {/* círculo: done = check teal cheio; a fazer = ícone da ação em tonal */}
            <Box sx={{
              width: 38, height: 38, borderRadius: '12px', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              ...(s.done
                ? { background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff', '& svg': { fontSize: 19 } }
                : { bgcolor: 'rgba(32,178,170,.12)', color: '#178f89', '& svg': { fontSize: 19 } }),
            }}>
              {s.done ? <CheckIcon /> : s.icon}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{
                fontSize: 13.5, fontWeight: s.done ? 700 : 800,
                textDecoration: s.done ? 'line-through' : 'none',
                textDecorationColor: alpha('#178f89', 0.5),
              }}>
                {s.title}
              </Typography>
              <Typography sx={{ fontSize: 11.5, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.done ? 'Concluído ✓' : s.sub}
              </Typography>
            </Box>
            {!s.done && (
              <Button
                size="small" onClick={() => navigate(s.to)}
                sx={{
                  textTransform: 'none', fontWeight: 800, borderRadius: '10px', flexShrink: 0,
                  color: '#0f6e68', borderColor: 'rgba(32,178,170,.4)',
                }}
                variant="outlined"
              >
                {s.cta}
              </Button>
            )}
          </Box>
        ))}
      </CardContent>
    </Card>
  );
};

const teal = (t: { palette: { mode: string } }) => (t.palette.mode === 'dark' ? '#5fc9c3' : '#0f6e68');
