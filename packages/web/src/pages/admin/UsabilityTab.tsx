import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Stack, Card, CardContent, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton, Collapse, LinearProgress,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { API_URL, token } from '../../config';

/**
 * USABILIDADE (28/09 — pedido do dono): visão global de ADOÇÃO de features.
 *
 * - Funil de ativação: contas → e-mail verificado → 1º exame → usou IA → premium.
 *   O gap "entrou e não subiu exame" (pesquisa de ativação set/26) fica escancarado aqui.
 * - Atividade: ativos nos últimos 7d/30d (streak server-side).
 * - Por feature: quantos usuários, % da base verificada, último uso e os 5 mais recentes
 *   (e-mail + data) — "quem cadastrou remédios / ligou Libras / conectou Health Connect…".
 * Tudo derivado de /api/admin/feature-usage (sem telemetria nova).
 */

interface RecentUser { email: string; name: string; at: string }
interface FeatureRow { key: string; label: string; users: number; pct: number; lastAt: string | null; recent: RecentUser[] }
interface UsageData {
  funnel: { signups: number; verified: number; firstExam: number; usedAI: number; premium: number };
  activity: { active7: number; active30: number };
  features: FeatureRow[];
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export const UsabilityTab = () => {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/admin/feature-usage`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}>
        <LinearProgress sx={{ borderRadius: 2, height: 6, bgcolor: 'rgba(32,178,170,0.12)', '& .MuiLinearProgress-bar': { bgcolor: '#20b2aa' } }} />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Carregando usabilidade...</Typography>
      </Box>
    );
  }

  if (!data) {
    return <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>Não foi possível carregar os dados de usabilidade.</Typography>;
  }

  const { funnel: f, activity, features } = data;
  const steps = [
    { label: 'Contas criadas', value: f.signups, base: f.signups, color: '#178f89' },
    { label: 'E-mail verificado', value: f.verified, base: f.signups, color: '#178f89' },
    { label: 'Subiu 1º exame', value: f.firstExam, base: f.verified, color: '#0369a1' },
    { label: 'Usou IA (chat/resumo)', value: f.usedAI, base: f.firstExam, color: '#7c3aed' },
    { label: 'Premium ativo', value: f.premium, base: f.verified, color: '#d4a574' },
  ];

  return (
    <Stack spacing={2.5}>
      {/* FUNIL DE ATIVAÇÃO — o "quem entrou e não ativou" em uma linha */}
      <Card variant="outlined" sx={{ borderRadius: '16px' }}>
        <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Typography sx={{ fontWeight: 800, fontSize: 15, mb: 0.5 }}>🎯 Funil de ativação</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Cada etapa mostra o % sobre a anterior — o degrau caído é onde o usuário trava.
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(5, 1fr)' }, gap: 1.5 }}>
            {steps.map((s, i) => {
              const pct = s.base ? Math.round((s.value / s.base) * 100) : 0;
              return (
                <Box key={s.label} sx={{ p: 1.5, borderRadius: '12px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                  <Typography sx={{ fontWeight: 800, fontSize: { xs: 22, sm: 26 }, lineHeight: 1.1, color: s.color }}>
                    {s.value.toLocaleString('pt-BR')}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 600, mt: 0.25 }}>{s.label}</Typography>
                  {i > 0 && (
                    <Typography sx={{ fontSize: 12, fontWeight: 800, mt: 0.5, color: pct >= 60 ? '#047857' : pct >= 30 ? '#b45309' : '#c2410c' }}>
                      {pct}% da etapa anterior
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Box>
        </CardContent>
      </Card>

      {/* ATIVIDADE RECENTE */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr' }, gap: 2 }}>
        {[
          { label: 'Ativos nos últimos 7 dias', value: activity.active7 },
          { label: 'Ativos nos últimos 30 dias', value: activity.active30 },
        ].map((a) => (
          <Card key={a.label} variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper' }}>
            <CardContent sx={{ p: 2.25 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block' }}>{a.label}</Typography>
              <Typography sx={{ fontSize: { xs: 26, sm: 30 }, fontWeight: 800, color: '#178f89', lineHeight: 1.1 }}>
                {a.value.toLocaleString('pt-BR')}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* ADOÇÃO POR FEATURE — expand mostra os últimos 5 usuários (e-mail + quando) */}
      <Card variant="outlined" sx={{ borderRadius: '16px', overflow: 'hidden' }}>
        <Box sx={{ p: { xs: 2, sm: 2.5 }, pb: 1.5 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 15 }}>📦 Adoção por funcionalidade</Typography>
          <Typography variant="caption" color="text.secondary">
            % sobre a base de e-mails verificados. Toque numa linha para ver quem usou por último.
          </Typography>
        </Box>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 560 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell width={44} />
                <TableCell sx={{ py: 1.5 }}><Typography sx={{ fontWeight: 800, fontSize: 13 }}>Funcionalidade</Typography></TableCell>
                <TableCell align="right" sx={{ py: 1.5 }}><Typography sx={{ fontWeight: 800, fontSize: 13 }}>Usuários</Typography></TableCell>
                <TableCell align="right" sx={{ py: 1.5, whiteSpace: 'nowrap' }}><Typography sx={{ fontWeight: 800, fontSize: 13 }}>% base</Typography></TableCell>
                <TableCell sx={{ py: 1.5, whiteSpace: 'nowrap' }}><Typography sx={{ fontWeight: 800, fontSize: 13 }}>Último uso</Typography></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {features.map((feat) => (
                <React.Fragment key={feat.key}>
                  <TableRow
                    hover
                    onClick={() => setExpanded(expanded === feat.key ? null : feat.key)}
                    sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                  >
                    <TableCell>
                      <IconButton size="small" sx={{ transform: expanded === feat.key ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                        <ExpandMoreIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary' }}>{feat.label}</Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 800, color: 'text.primary' }}>{feat.users.toLocaleString('pt-BR')}</Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', minWidth: 120 }}>
                      <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
                        <Box sx={{ width: 56, flexShrink: 0 }}>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(100, feat.pct)}
                            sx={{ height: 6, borderRadius: 3, bgcolor: 'rgba(32,178,170,0.12)', '& .MuiLinearProgress-bar': { bgcolor: '#20b2aa' } }}
                          />
                        </Box>
                        <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary', width: 44, textAlign: 'right' }}>
                          {feat.pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{fmt(feat.lastAt)}</Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={5} sx={{ py: 0, px: 2, borderBottom: expanded === feat.key ? '1px solid' : 'none', borderColor: 'divider', bgcolor: 'rgba(0,0,0,0.01)' }}>
                      <Collapse in={expanded === feat.key} timeout="auto" unmountOnExit>
                        <Box sx={{ py: 2 }}>
                          <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 1 }}>
                            👤 Últimos {feat.recent.length} usuário(s) — mais recente primeiro
                          </Typography>
                          {feat.recent.length === 0 ? (
                            <Typography variant="caption" color="text.secondary">Nenhum uso registrado ainda.</Typography>
                          ) : (
                            <Stack spacing={0.75}>
                              {feat.recent.map((u, i) => (
                                <Stack
                                  key={`${u.email}-${i}`}
                                  direction={{ xs: 'column', sm: 'row' }}
                                  spacing={{ xs: 0.25, sm: 1.5 }}
                                  sx={{ p: 0.75, borderRadius: '8px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}
                                >
                                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: 'text.primary', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: { xs: 'normal', sm: 'nowrap' } }}>
                                    {u.name || u.email}
                                  </Typography>
                                  <Typography sx={{ fontSize: 12, color: 'text.secondary', flex: { sm: 1 }, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: { xs: 'normal', sm: 'nowrap' } }}>
                                    {u.email}
                                  </Typography>
                                  <Typography sx={{ fontSize: 12, color: 'text.secondary', flexShrink: 0, textAlign: { xs: 'left', sm: 'right' } }}>{fmt(u.at)}</Typography>
                                </Stack>
                              ))}
                            </Stack>
                          )}
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Stack>
  );
};
