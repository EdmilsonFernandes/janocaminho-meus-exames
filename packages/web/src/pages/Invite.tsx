import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Button, Fade } from '@mui/material';
import GiftOutlinedIcon from '@mui/icons-material/CardGiftcard';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { API_URL, token, fetchPublicConfig } from '../config';
import { DrExame } from '../components/DrExame';
import { ReferralCard } from '../components/ReferralCard';
import { PageContainer } from '../components/layout/PageContainer';
import { hapticLight } from '../utils/haptic';
import { Badge } from '@/components/reui/badge';
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import { IconTile } from '@/components/reui/patterns';
import {
  Timeline,
  TimelineContent,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from '@/components/reui/timeline';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';

/** Página "Indique e ganhe" (padrão MGM de apps maduros) com ReUI Ultimate:
 *  Frame + Timeline de 3 etapas + ReferralCard com CopyableInput e WhatsApp. */

const STEPS = [
  {
    n: 1,
    title: 'Compartilhe seu código ou link exclusivo',
    sub: 'Envie pelo WhatsApp, Instagram ou copie o link direto em 1 toque.',
    badge: 'Passo 1',
  },
  {
    n: 2,
    title: 'Seu amigo cria a conta gratuita',
    sub: 'Assim que ele finalizar o cadastro, já recebe os créditos de boas-vindas na hora.',
    badge: 'Passo 2',
  },
  {
    n: 3,
    title: 'Os dois ganham créditos de leitura',
    sub: 'Os créditos entram automaticamente na Carteira de cada um, sem validade.',
    badge: 'Recompensa',
  },
];

export const InvitePage = () => {
  useReuiThemeSync();
  const navigate = useNavigate();
  // undefined = carregando · null = sem código · string = tem
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [refBonus, setRefBonus] = useState(10);
  const [sides, setSides] = useState<{ newUser: number; recommender: number } | null>(null);

  useEffect(() => {
    fetchPublicConfig()
      .then((c) => {
        setRefBonus(c.referralBonus);
        setSides({ newUser: c.referral.newUser, recommender: c.referral.recommender });
      })
      .catch(() => {});
    fetch(`${API_URL}/auth/referrals/stats`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCode(d?.code ?? null))
      .catch(() => setCode(null));
  }, []);

  const myReward = sides?.recommender ?? refBonus;
  const friendReward = sides?.newUser ?? refBonus;

  return (
    <Fade in timeout={300}>
      <PageContainer width={680} sx={{ pb: { xs: 10, sm: 5 } }}>
        {/* HERO PREMIUM — dois lados explícitos e transparentes */}
        <Box
          sx={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: '20px',
            color: '#fff',
            mb: 2.5,
            p: { xs: 2.5, sm: 3.5 },
            background: 'linear-gradient(135deg, #0b4f4a 0%, #0f766e 55%, #178f89 100%)',
            boxShadow: '0 14px 34px rgba(15, 118, 110, 0.26)',
            border: '1px solid rgba(255,255,255,0.14)',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              top: -50,
              right: -40,
              width: 180,
              height: 180,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />

          <div className="relative flex flex-col items-center text-center">
            <div className="mb-3 flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold backdrop-blur-md">
              <span>💚 Programa Indique & Ganhe</span>
            </div>
            <Box sx={{ mb: 1.5 }}>
              <DrExame size={56} sx={{ borderRadius: '28%', boxShadow: '0 6px 18px rgba(0,0,0,0.22)' }} />
            </Box>
            <Typography
              sx={{
                fontFamily: '"Poppins",sans-serif',
                fontWeight: 800,
                fontSize: { xs: 21, sm: 24 },
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
              }}
            >
              Ganhe +{myReward} créditos a cada amigo indicado
            </Typography>
            <Typography sx={{ fontSize: 13.5, opacity: 0.9, mt: 0.75, maxWidth: 420, lineHeight: 1.5 }}>
              Convide quem você ama para organizar seus exames com IA. Quando seu amigo cria a conta grátis, vocês dois ganham na hora.
            </Typography>

            {/* Pílulas comparativas dos dois lados */}
            <div className="mt-4 grid w-full max-w-md grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-white/20 bg-white/12 px-3 py-2.5 backdrop-blur-sm">
                <span className="block text-[11px] font-semibold tracking-wider text-white/80 uppercase">
                  Você recebe
                </span>
                <span className="mt-0.5 block font-['Poppins',sans-serif] text-lg font-extrabold text-white tabular-nums">
                  +{myReward} leituras ⚡
                </span>
              </div>
              <div className="rounded-xl border border-emerald-300/30 bg-emerald-400/15 px-3 py-2.5 backdrop-blur-sm">
                <span className="block text-[11px] font-semibold tracking-wider text-emerald-100 uppercase">
                  Seu amigo recebe
                </span>
                <span className="mt-0.5 block font-['Poppins',sans-serif] text-lg font-extrabold text-emerald-100 tabular-nums">
                  +{friendReward} leituras ⚡
                </span>
              </div>
            </div>
          </div>
        </Box>

        {/* CÓDIGO + LINK + COMPARTILHAMENTO (em destaque logo abaixo do Hero para ação imediata) */}
        {code === undefined ? null : <ReferralCard code={code ?? undefined} />}

        {/* COMO FUNCIONA — ReUI Frame + Timeline */}
        <Frame className="mt-3 w-full">
          <FrameHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <IconTile tone="primary" size="sm">
                  <GiftOutlinedIcon sx={{ fontSize: 18 }} />
                </IconTile>
                <div>
                  <FrameTitle>Como funciona na prática</FrameTitle>
                  <FrameDescription>
                    Simples, transparente e sem limite de amigos indicados
                  </FrameDescription>
                </div>
              </div>
              <Badge variant="primary-light" size="xs">
                3 passos rápidos
              </Badge>
            </div>
          </FrameHeader>
          <FramePanel>
            <Timeline value={3}>
              {STEPS.map((s) => (
                <TimelineItem key={s.n} step={s.n}>
                  <TimelineSeparator />
                  <TimelineIndicator>
                    <span className="text-[11px] font-extrabold tabular-nums">{s.n}</span>
                  </TimelineIndicator>
                  <TimelineHeader>
                    <TimelineTitle>{s.title}</TimelineTitle>
                    <Badge variant={s.n === 3 ? 'success-light' : 'outline'} size="xs">
                      {s.badge}
                    </Badge>
                  </TimelineHeader>
                  <TimelineContent className="mt-0.5 text-xs">{s.sub}</TimelineContent>
                </TimelineItem>
              ))}
            </Timeline>
          </FramePanel>
        </Frame>

        {/* CTA cruzado: onde o bônus cai */}
        <Button
          fullWidth
          variant="outlined"
          endIcon={<ArrowForwardIcon />}
          onClick={() => {
            hapticLight();
            navigate('/carteira');
          }}
          sx={{
            mt: 2.5,
            textTransform: 'none',
            fontWeight: 800,
            borderRadius: '12px',
            minHeight: 46,
            borderColor: 'rgba(32,178,170,.4)',
            color: (t) => (t.palette.mode === 'dark' ? '#5eead4' : '#0f6e68'),
          }}
        >
          Ver extrato de créditos na Carteira
        </Button>
      </PageContainer>
    </Fade>
  );
};
