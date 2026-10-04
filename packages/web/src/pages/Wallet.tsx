import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Card, CardContent, Skeleton, Chip, Fade, alpha,
} from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import RedeemOutlinedIcon from '@mui/icons-material/RedeemOutlined';
import CardGiftcardOutlinedIcon from '@mui/icons-material/CardGiftcardOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import ChatBubbleOutlineOutlinedIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import SummarizeOutlinedIcon from '@mui/icons-material/SummarizeOutlined';
import LibraryBooksOutlinedIcon from '@mui/icons-material/LibraryBooksOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import GroupAddOutlinedIcon from '@mui/icons-material/GroupAddOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import TrendingDownOutlinedIcon from '@mui/icons-material/TrendingDownOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import ArrowDownwardOutlinedIcon from '@mui/icons-material/ArrowDownwardOutlined';
import TerminalOutlinedIcon from '@mui/icons-material/TerminalOutlined';
import { API_URL, token } from '../config';
import { DrExame } from '../components/DrExame';
import { PageContainer } from '../components/layout/PageContainer';

/** Carteira de créditos (padrão wallet de apps maduros): saldo em destaque + extrato completo.
 *  Consome endpoints que JÁ existiam (/billing/status + /billing/credits/history) — o ledger
 *  sempre gravou tudo (kind/label), só faltava a tela. Chips do saldo no header apontam pra cá. */

interface Tx { id: string; delta: number; kind: string; label: string; refId?: string | null; createdAt: string }

// Ícone + cor tonal por tipo de lançamento (kind do CreditTransaction).
const KIND_META: Record<string, { icon: React.ReactNode; tint: string }> = {
  signup: { icon: <RedeemOutlinedIcon />, tint: '#8b5cf6' },
  referral: { icon: <CardGiftcardOutlinedIcon />, tint: '#d4a574' },
  achievement: { icon: <EmojiEventsOutlinedIcon />, tint: '#f59e0b' },
  quiz: { icon: <SchoolOutlinedIcon />, tint: '#3b82f6' },
  purchase: { icon: <ShoppingCartOutlinedIcon />, tint: '#20b2aa' },
  plan_monthly: { icon: <WorkspacePremiumOutlinedIcon />, tint: '#20b2aa' },
  api_pack: { icon: <TerminalOutlinedIcon />, tint: '#64748b' },
  api_call: { icon: <TerminalOutlinedIcon />, tint: '#64748b' },
  ai_chat: { icon: <ChatBubbleOutlineOutlinedIcon />, tint: '#0ea5e9' },
  ai_summary: { icon: <SummarizeOutlinedIcon />, tint: '#0ea5e9' },
  ai_consolidated: { icon: <LibraryBooksOutlinedIcon />, tint: '#0ea5e9' },
  upload: { icon: <UploadFileOutlinedIcon />, tint: '#94a3b8' },
  share: { icon: <ShareOutlinedIcon />, tint: '#94a3b8' },
  patient_extra: { icon: <GroupAddOutlinedIcon />, tint: '#94a3b8' },
};
const kindMeta = (k: string) => KIND_META[k] ?? { icon: <BoltIcon />, tint: '#20b2aa' };

const relDate = (iso: string): string => {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `${min} min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h atrás`;
  const days = Math.floor(h / 24);
  if (days === 1) return 'ontem';
  if (days < 7) return `${days} dias atrás`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

export const WalletPage = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<{ credits: number; active: boolean; planExpiresAt: string | null } | null>(null);
  const [items, setItems] = useState<Tx[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const totals = useRef<{ earned: number; spent: number }>({ earned: 0, spent: 0 });

  const loadStatus = () => {
    fetch(`${API_URL}/billing/status`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStatus(d ? { credits: d.credits ?? 0, active: !!d.active, planExpiresAt: d.planExpiresAt ?? null } : null))
      .catch(() => setStatus(null));
  };

  const loadPage = (p: number, replace = false) => {
    const done = (d: any) => {
      const list: Tx[] = d?.items ?? [];
      // Totais somados uma única vez por item (replace=false = append — soma só os novos).
      for (const t of list) { if (t.delta > 0) totals.current.earned += t.delta; else totals.current.spent += -t.delta; }
      setItems((prev) => (replace ? list : [...(prev ?? []), ...list]));
      setHasMore(!!d?.hasMore);
      setPage(p);
      setLoadingMore(false);
    };
    return fetch(`${API_URL}/billing/credits/history?page=${p}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then(done)
      .catch(() => setLoadingMore(false));
  };

  useEffect(() => {
    loadStatus();
    loadPage(1, true);
    const h = () => loadStatus();
    window.addEventListener('creditsChanged', h);
    return () => window.removeEventListener('creditsChanged', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const credits = status?.credits ?? 0;
  const premUntil = status?.planExpiresAt ? new Date(status.planExpiresAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : null;

  return (
    <Fade in timeout={300}>
      <PageContainer width={720} sx={{ pb: { xs: 10, sm: 4 } }}>
        {/* HERO — saldo: gradiente é assinatura da MARCA (reservado a momentos de identidade) */}
        <Card elevation={0} sx={{
          position: 'relative', overflow: 'hidden', borderRadius: '18px',
          background: 'linear-gradient(135deg,#20b2aa,#178f89)',
          color: '#fff', mb: 2,
          boxShadow: '0 12px 32px rgba(32,178,170,.28)',
          '&::after': { // brilho diagonal sutil (profundidade premium sem imagem)
            content: '""', position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'linear-gradient(115deg, rgba(255,255,255,.14) 0%, transparent 42%)',
          },
        }}>
          <CardContent sx={{ p: { xs: 2.5, sm: 3 }, position: 'relative' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <BoltIcon sx={{ fontSize: 18, opacity: 0.95 }} />
              <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 600, fontSize: 13, letterSpacing: '0.04em', opacity: 0.95 }}>
                SEUS CRÉDITOS
              </Typography>
              <Box sx={{ flexGrow: 1 }} />
              {status?.active && premUntil && (
                <Chip size="small" label={`Premium até ${premUntil}`} sx={{ bgcolor: 'rgba(255,255,255,.18)', color: '#fff', fontWeight: 700, fontSize: 11, height: 24 }} />
              )}
            </Box>
            {status == null ? (
              <Skeleton sx={{ bgcolor: 'rgba(255,255,255,.25)', width: 160, height: 52 }} />
            ) : (
              <Typography sx={{
                fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: { xs: 44, sm: 52 },
                lineHeight: 1.05, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums',
              }}>
                {credits.toLocaleString('pt-BR')}
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 1.5, mt: 2.5, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button
                onClick={() => navigate('/planos')}
                variant="contained"
                endIcon={<ShoppingCartOutlinedIcon />}
                sx={{
                  bgcolor: '#fff', color: '#0f6e68', textTransform: 'none', fontWeight: 800,
                  borderRadius: '12px', px: 2.5, boxShadow: '0 4px 14px rgba(0,0,0,.14)',
                  '&:hover': { bgcolor: '#f0fdfa' },
                }}
              >
                Comprar créditos
              </Button>
              <Typography sx={{ fontSize: 12, opacity: 0.85, maxWidth: 210 }}>
                Cada IA usa alguns créditos — resumo 10 · chat 2 · consolidado 20
              </Typography>
            </Box>
          </CardContent>
        </Card>

        {/* STATS — ganhos / gastos / lançamentos (calculados do extrato carregado).
            minmax(0,1fr): número grande não infla a track além da coluna (armadilha clássica
            de grid — min-width:auto estoura o layout pra direita no mobile). */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5, mb: 2 }}>
          {[
            { icon: <TrendingUpOutlinedIcon sx={{ fontSize: 16 }} />, label: 'Ganhos', value: totals.current.earned, color: '#178f89' },
            { icon: <TrendingDownOutlinedIcon sx={{ fontSize: 16 }} />, label: 'Gastos', value: totals.current.spent, color: '#c2703e' },
            { icon: <ReceiptLongOutlinedIcon sx={{ fontSize: 16 }} />, label: 'Lançamentos', value: items?.length ?? 0, color: 'text.secondary' },
          ].map((s) => (
            <Card key={s.label} elevation={0} sx={{ borderRadius: '14px', minWidth: 0, overflow: 'hidden', border: (t) => `1px solid ${alpha(t.palette.divider, 0.6)}` }}>
              <CardContent sx={{ p: 1.5, minWidth: 0, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: s.color, mb: 0.25 }}>{s.icon}</Box>
                <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: { xs: 18, sm: 20 }, fontVariantNumeric: 'tabular-nums' }}>
                  {s.value.toLocaleString('pt-BR')}
                </Typography>
                <Typography sx={{ fontSize: 11, color: 'text.secondary', fontWeight: 600 }}>{s.label}</Typography>
              </CardContent>
            </Card>
          ))}
        </Box>

        {/* EXTRATO */}
        <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 700, fontSize: 15, mb: 1, px: 0.5 }}>
          Extrato
        </Typography>
        {items == null ? (
          <Box>
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={64} sx={{ borderRadius: '14px', mb: 1 }} />)}
          </Box>
        ) : items.length === 0 ? (
          <Card elevation={0} sx={{ borderRadius: '16px', border: (t) => `1px solid ${alpha(t.palette.divider, 0.6)}` }}>
            <CardContent sx={{ p: 3, textAlign: 'center' }}>
              <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}><DrExame size={56} /></Box>
              <Typography sx={{ fontWeight: 700, fontSize: 15 }}>Nada por aqui ainda</Typography>
              <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5 }}>
                Envie seu primeiro exame ou converse com a IA — cada movimento de créditos aparece aqui.
              </Typography>
            </CardContent>
          </Card>
        ) : (
          <>
            {items.map((t) => {
              const meta = kindMeta(t.kind);
              const gain = t.delta > 0;
              return (
                <Card key={t.id} elevation={0} sx={{
                  borderRadius: '14px', mb: 1, border: (th) => `1px solid ${alpha(th.palette.divider, 0.5)}`,
                  transition: 'border-color .15s ease',
                  '&:hover': { borderColor: alpha(meta.tint, 0.45) },
                }}>
                  <CardContent sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box sx={{
                      width: 40, height: 40, borderRadius: '12px', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      bgcolor: alpha(meta.tint, 0.12), color: meta.tint,
                      '& svg': { fontSize: 20 },
                    }}>
                      {meta.icon}
                    </Box>
                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.label}
                      </Typography>
                      <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>
                        {relDate(t.createdAt)}
                      </Typography>
                    </Box>
                    <Typography sx={{
                      fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 15, flexShrink: 0,
                      fontVariantNumeric: 'tabular-nums',
                      color: gain ? '#0f8f86' : 'text.secondary',
                    }}>
                      {gain ? '+' : ''}{t.delta.toLocaleString('pt-BR')}
                    </Typography>
                  </CardContent>
                </Card>
              );
            })}
            {hasMore && (
              <Button
                fullWidth
                disabled={loadingMore}
                onClick={() => { setLoadingMore(true); loadPage(page + 1); }}
                startIcon={<ArrowDownwardOutlinedIcon />}
                sx={{ mt: 0.5, textTransform: 'none', fontWeight: 700, borderRadius: '12px', py: 1 }}
              >
                {loadingMore ? 'Carregando…' : 'Carregar mais'}
              </Button>
            )}
          </>
        )}
      </PageContainer>
    </Fade>
  );
};
