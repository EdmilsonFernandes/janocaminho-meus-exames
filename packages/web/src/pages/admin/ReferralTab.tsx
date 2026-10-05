import { useEffect, useState } from 'react';
import {
  Box, Typography, Stack, Card, CardContent, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, LinearProgress, Button, Tooltip,
} from '@mui/material';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { API_URL, token } from '../../config';

interface ReferralStats {
  totalReferred: number;
  verifiedReferred: number;
  withExams: number;
  premiumReferred: number;
  totalBonus: number;
  conversionRate: number;
  examRate: number;
}

interface TopReferrer {
  referralCode: string;
  count: number;
  userName: string;
  userEmail: string;
  userCredits: number;
}

interface RecentReferral {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  emailVerified: boolean;
  isPremium: boolean;
  examCount: number;
  credits: number;
  referredByCode: string;
  referrerName: string;
  referrerEmail: string;
}

interface ReferralData {
  stats: ReferralStats;
  topReferrers: TopReferrer[];
  recent: RecentReferral[];
}

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

export const ReferralTab = ({ onGoToConfig }: { onGoToConfig?: () => void }) => {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/admin/referrals`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const copy = (txt: string) => {
    try {
      navigator.clipboard.writeText(txt);
      setCopiedCode(txt);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {}
  };

  if (loading) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}>
        <LinearProgress sx={{ borderRadius: 2, height: 6, bgcolor: 'rgba(32,178,170,0.12)', '& .MuiLinearProgress-bar': { bgcolor: '#20b2aa' } }} />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Carregando dados de indicações...</Typography>
      </Box>
    );
  }

  if (!data) {
    return (
      <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        Não foi possível carregar os dados do programa de indicação.
      </Typography>
    );
  }

  const { stats, topReferrers, recent } = data;

  return (
    <Stack spacing={3}>
      {/* ── HEADER & CONTEXTO ── */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 1.5 }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <CardGiftcardIcon sx={{ color: '#20b2aa', fontSize: 28 }} />
            <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif' }}>
              Indicações & Crescimento (MGM)
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Acompanhe usuários que vieram por indicação, taxas de ativação e quem são seus maiores promotores.
          </Typography>
        </Box>
        {onGoToConfig && (
          <Button
            variant="outlined"
            size="small"
            onClick={onGoToConfig}
            startIcon={<SettingsOutlinedIcon />}
            sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700, borderColor: 'divider' }}
          >
            Configurar bônus & mensagem
          </Button>
        )}
      </Box>

      {/* ── KPI CARDS ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)', md: 'repeat(5, 1fr)' }, gap: 1.5 }}>
        <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper' }}>
          <CardContent sx={{ p: 2 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block' }}>Total de Indicados</Typography>
            <Typography sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 800, color: '#178f89', mt: 0.25, lineHeight: 1.1 }}>
              {stats.totalReferred.toLocaleString('pt-BR')}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>cadastros com código</Typography>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper' }}>
          <CardContent sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>Verificados</Typography>
              <CheckCircleOutlineIcon sx={{ fontSize: 16, color: 'success.main' }} />
            </Stack>
            <Typography sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 800, color: '#047857', mt: 0.25, lineHeight: 1.1 }}>
              {stats.verifiedReferred.toLocaleString('pt-BR')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'success.dark', fontWeight: 700, mt: 0.5, display: 'block' }}>
              {stats.conversionRate}% de conversão
            </Typography>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper' }}>
          <CardContent sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>Subiram Exame</Typography>
              <DescriptionOutlinedIcon sx={{ fontSize: 16, color: '#0369a1' }} />
            </Stack>
            <Typography sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 800, color: '#0369a1', mt: 0.25, lineHeight: 1.1 }}>
              {stats.withExams.toLocaleString('pt-BR')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mt: 0.5, display: 'block' }}>
              {stats.examRate}% dos verificados
            </Typography>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper' }}>
          <CardContent sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>Viraram Premium</Typography>
              <WorkspacePremiumOutlinedIcon sx={{ fontSize: 16, color: '#d4a574' }} />
            </Stack>
            <Typography sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 800, color: '#b45309', mt: 0.25, lineHeight: 1.1 }}>
              {stats.premiumReferred.toLocaleString('pt-BR')}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>assinantes ativos</Typography>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper', gridColumn: { xs: 'span 2', sm: 'auto' } }}>
          <CardContent sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>Bônus Distribuídos</Typography>
              <TrendingUpIcon sx={{ fontSize: 16, color: '#7c3aed' }} />
            </Stack>
            <Typography sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 800, color: '#7c3aed', mt: 0.25, lineHeight: 1.1 }}>
              +{stats.totalBonus.toLocaleString('pt-BR')}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>créditos em recompensas</Typography>
          </CardContent>
        </Card>
      </Box>

      {/* ── TOP PROMOTORES ── */}
      <Card variant="outlined" sx={{ borderRadius: '16px', overflow: 'hidden' }}>
        <Box sx={{ p: 2.5, pb: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: 15 }}>🏆 Top Promotores (Quem mais indica)</Typography>
            <Typography variant="caption" color="text.secondary">
              Usuários que mais trouxeram novos membros ativos para a plataforma.
            </Typography>
          </Box>
          <Chip label={`${topReferrers.length} promotores`} size="small" sx={{ fontWeight: 700 }} />
        </Box>
        <TableContainer sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <Table size="small" sx={{ minWidth: 600 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell sx={{ py: 1.25, fontWeight: 800 }}>#</TableCell>
                <TableCell sx={{ py: 1.25, fontWeight: 800 }}>Promotor (Padrinho)</TableCell>
                <TableCell sx={{ py: 1.25, fontWeight: 800 }}>Código</TableCell>
                <TableCell align="right" sx={{ py: 1.25, fontWeight: 800 }}>Total Indicados</TableCell>
                <TableCell align="right" sx={{ py: 1.25, fontWeight: 800 }}>Saldo Atual</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {topReferrers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} sx={{ py: 4, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">Nenhuma indicação registrada até o momento.</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                topReferrers.map((r, i) => (
                  <TableRow key={r.referralCode} hover>
                    <TableCell sx={{ fontWeight: 800, color: i < 3 ? '#178f89' : 'text.secondary' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700, fontSize: 13.5 }}>{r.userName}</Typography>
                      <Typography variant="caption" color="text.secondary">{r.userEmail}</Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={copiedCode === r.referralCode ? 'Copiado!' : 'Copiar código'}>
                        <Chip
                          label={r.referralCode}
                          size="small"
                          onClick={() => copy(r.referralCode)}
                          icon={<ContentCopyIcon sx={{ fontSize: '13px !important' }} />}
                          sx={{ fontFamily: 'monospace', fontWeight: 800, cursor: 'pointer' }}
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right">
                      <Chip
                        label={`${r.count} indicações`}
                        size="small"
                        color={r.count >= 5 ? 'primary' : 'default'}
                        sx={{ fontWeight: 800 }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography sx={{ fontWeight: 700, fontSize: 13, color: 'text.secondary' }}>
                        {r.userCredits.toLocaleString('pt-BR')} cr
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* ── ÚLTIMOS CADASTROS VIA INDICAÇÃO ── */}
      <Card variant="outlined" sx={{ borderRadius: '16px', overflow: 'hidden' }}>
        <Box sx={{ p: 2.5, pb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Typography sx={{ fontWeight: 800, fontSize: 15 }}>⏱️ Últimos Usuários que Vieram de Indicação</Typography>
          <Typography variant="caption" color="text.secondary">
            Rastreamento em tempo real de novos cadastros gerados por links e códigos de convite.
          </Typography>
        </Box>
        <TableContainer sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <Table size="small" sx={{ minWidth: 680 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell sx={{ py: 1.25, fontWeight: 800 }}>Novo Usuário</TableCell>
                <TableCell sx={{ py: 1.25, fontWeight: 800 }}>Data</TableCell>
                <TableCell sx={{ py: 1.25, fontWeight: 800 }}>Status</TableCell>
                <TableCell sx={{ py: 1.25, fontWeight: 800 }}>Padrinho (Quem Indicou)</TableCell>
                <TableCell align="right" sx={{ py: 1.25, fontWeight: 800 }}>Exames</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recent.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} sx={{ py: 4, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">Nenhum cadastro recente via indicação.</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                recent.map((u) => (
                  <TableRow key={u.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700, fontSize: 13.5 }}>{u.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: 12.5, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                        {fmtDate(u.createdAt)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        {u.emailVerified ? (
                          <Chip label="Verificado" size="small" color="success" sx={{ height: 20, fontSize: 10.5, fontWeight: 700 }} />
                        ) : (
                          <Chip label="Pendente" size="small" sx={{ height: 20, fontSize: 10.5, fontWeight: 600 }} />
                        )}
                        {u.isPremium && (
                          <Chip label="Premium" size="small" sx={{ height: 20, fontSize: 10.5, fontWeight: 700, bgcolor: 'rgba(212,165,116,0.18)', color: '#b45309' }} />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700, fontSize: 13 }}>{u.referrerName}</Typography>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'text.secondary' }}>
                          [{u.referredByCode}]
                        </Typography>
                        {u.referrerEmail && (
                          <Typography variant="caption" color="text.secondary">· {u.referrerEmail}</Typography>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <Chip
                        label={u.examCount > 0 ? `${u.examCount} exame(s)` : 'Nenhum'}
                        size="small"
                        color={u.examCount > 0 ? 'info' : 'default'}
                        variant={u.examCount > 0 ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 700, height: 22 }}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Stack>
  );
};
