import { useEffect, useState } from 'react';
import { Box, Button, CircularProgress } from '@mui/material';
import ShareIcon from '@mui/icons-material/Share';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import GiftIcon from '@mui/icons-material/CardGiftcard';
import { API_URL, token, fetchPublicConfig } from '../config';
import { tealText } from '../theme';
import { Badge } from '@/components/reui/badge';
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import { IconTile } from '@/components/reui/patterns';
import { CopyableInput } from '@/components/reui/form-controls';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';

/** Card de indicação — mostra código, copia, compartilha e estatísticas (ReUI Ultimate). */
export const ReferralCard = ({ code }: { code?: string }) => {
  useReuiThemeSync();
  const [stats, setStats] = useState<{ count: number; creditsEarned: number; friends: any[] } | null>(null);
  const [refBonus, setRefBonus] = useState(10);
  // DOIS LADOS (05/10): newUser = bônus do AMIGO; recommender = bônus de QUEM INDICA.
  const [sides, setSides] = useState<{ newUser: number; recommender: number } | null>(null);
  const [shareTpl, setShareTpl] = useState('');

  useEffect(() => {
    fetchPublicConfig().then((c) => {
      setRefBonus(c.referralBonus);
      setSides({ newUser: c.referral.newUser, recommender: c.referral.recommender });
      setShareTpl(c.shareMessage || '');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!code) return;
    fetch(`${API_URL}/auth/referrals/stats`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then((d) => setStats(d)).catch(() => {});
  }, [code]);

  if (!code) return null;
  const link = `https://drexame.janocaminho.com.br/#/registrar?ref=${code}`;

  const buildText = () => (shareTpl
    ? shareTpl.replaceAll('{code}', code).replaceAll('{bonus}', String(refBonus)).replaceAll('{link}', link)
    : `📱 Dr. Exame — sua saúde com IA! Cadastre-se com meu código ${code} e ganhe +${sides?.newUser ?? refBonus} créditos grátis: ${link}`);

  const share = async () => {
    const text = buildText();
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        const { Share } = await import('@capacitor/share');
        await Share.share({ title: 'Dr. Exame', text, dialogTitle: 'Compartilhar indicação' });
        return;
      }
    } catch { /* cai pro web share */ }
    try { if (navigator.share) { await navigator.share({ title: 'Dr. Exame', text }); return; } } catch {}
    navigator.clipboard?.writeText(text);
  };

  const shareWhatsApp = () => {
    const text = buildText();
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <Frame className="mt-3 w-full">
      <FrameHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <IconTile tone="primary" size="sm">
              <GiftIcon sx={{ fontSize: 18 }} />
            </IconTile>
            <div>
              <FrameTitle>Seu Código e Link de Indicação</FrameTitle>
              <FrameDescription>
                Você ganha <strong>+{sides?.recommender ?? refBonus} créditos</strong> e seu amigo ganha{' '}
                <strong>+{sides?.newUser ?? refBonus} créditos</strong> no cadastro.
              </FrameDescription>
            </div>
          </div>
          <Badge variant="success-light" size="sm">
            +{sides?.recommender ?? refBonus} ⚡ por amigo
          </Badge>
        </div>
      </FrameHeader>

      <FramePanel className="space-y-4">
        {/* Código e Link com CopyableInput (ReUI c-input-group-11) */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <span className="mb-1.5 block text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
              Código pessoal
            </span>
            <CopyableInput
              value={code}
              className="border-primary/30 bg-primary/[0.04] font-bold"
            />
          </div>
          <div>
            <span className="mb-1.5 block text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
              Link direto com bônus
            </span>
            <CopyableInput value={link} />
          </div>
        </div>

        {/* Ações de compartilhamento rápido */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <Button
            variant="contained"
            fullWidth
            startIcon={<WhatsAppIcon />}
            onClick={shareWhatsApp}
            sx={{
              borderRadius: '12px',
              textTransform: 'none',
              fontWeight: 800,
              minHeight: 44,
              bgcolor: '#16a34a',
              color: '#fff',
              '&:hover': { bgcolor: '#15803d' },
            }}
          >
            Enviar no WhatsApp
          </Button>
          <Button
            variant="contained"
            fullWidth
            startIcon={<ShareIcon />}
            onClick={share}
            sx={{
              borderRadius: '12px',
              textTransform: 'none',
              fontWeight: 800,
              minHeight: 44,
              background: 'linear-gradient(135deg,#20b2aa,#178f89)',
              '&:hover': { background: 'linear-gradient(135deg,#178f89,#0f766e)' },
            }}
          >
            Compartilhar convite
          </Button>
        </div>

        {/* Estatísticas ReUI KPI */}
        {stats && (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col items-center justify-center rounded-xl border border-border/70 bg-muted/30 p-3 text-center">
                <span className="font-['Poppins',sans-serif] text-2xl font-extrabold text-primary tabular-nums">
                  {stats.count}
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  {stats.count === 1 ? 'amigo indicado' : 'amigos indicados'}
                </span>
              </div>
              <div className="flex flex-col items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3 text-center">
                <span className="font-['Poppins',sans-serif] text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  +{stats.creditsEarned} ⚡
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  créditos ganhos
                </span>
              </div>
            </div>

            {stats.friends?.length > 0 && (
              <div className="rounded-xl border border-border/60 bg-card p-3">
                <span className="mb-2 block text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                  Amigos que entraram com seu convite
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {stats.friends.slice(0, 12).map((f: any, i: number) => (
                    <Badge key={i} variant="primary-light" size="sm">
                      {f.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {stats === null && code && (
          <Box sx={{ textAlign: 'center', py: 1 }}>
            <CircularProgress size={20} sx={{ color: (t) => tealText(t.palette.mode) }} />
          </Box>
        )}
      </FramePanel>
    </Frame>
  );
};
