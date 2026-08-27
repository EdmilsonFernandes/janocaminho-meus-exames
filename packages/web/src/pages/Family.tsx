import { useEffect, useState } from 'react';
import { useTranslate } from 'react-admin';
import { Box, Card, CardContent, Typography, CircularProgress, Grid, Stack, Chip, Avatar, Alert, AlertTitle, Skeleton, Button } from '@mui/material';
import Diversity3Icon from '@mui/icons-material/Diversity3';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useNavigate } from 'react-router-dom';
import { API_URL, token, photoUrlFor } from '../config';
import { ExplainButton } from '../components/ExplainItem';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { DrExame } from '../components/DrExame';
import { setSelectedPatient } from '../patient-context';

interface FamPatient {
  id: string; fullName: string; relationship: string | null; photoUrl: string | null;
  score: number | null; abnormalCount: number; examTitle: string | null; performedAt: string | null;
  topAbnormal: { name: string; value: string | null; flag: string }[];
}
interface CrossAlert { analyte: string; patients: string[]; }

const scoreColor = (s: number | null) => (s == null ? '#9e9e9e' : s >= 80 ? '#059669' : s >= 60 ? '#f59e0b' : '#ef4444');
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : null);

/** Helper para formatar nomes de marcadores (ALL_CAPS / snake_case -> Title Case limpo) */
const prettyName = (n: string) => {
  if (!n) return '';
  const tokens = n.split(/[_\s]+/);
  return tokens.map((tok) => {
    if (tok.length <= 4 && /^[A-Z0-9]+$/.test(tok) && !['ACIDO', 'URICO', 'BILIRRUBINA', 'DIRETA', 'INDIRETA', 'TOTAL'].includes(tok)) return tok;
    return tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase();
  }).join(' ');
};

export const FamilyPage = () => {
  const translate = useTranslate();
  const navigate = useNavigate();
  const [data, setData] = useState<{ patients: FamPatient[]; crossAlerts: CrossAlert[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [cmp, setCmp] = useState<any[]>([]);
  const [err, setErr] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true); setErr(false);
    fetch(`${API_URL}/patients/family-overview`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => { if (!r.ok) throw new Error('http'); return r.json(); })
      .then((d) => setData(d))
      .catch(() => { setData(null); setErr(true); })
      .finally(() => setLoading(false));
    fetch(`${API_URL}/patients/family-compare`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((d) => setCmp(d.rows ?? []))
      .catch(() => {});
  }, [reloadKey]);

  if (loading) return (
    <PageContainer width={980}>
      <Skeleton variant="rectangular" height={140} sx={{ borderRadius: '16px', mb: 3 }} />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}><Skeleton variant="rounded" height={180} sx={{ borderRadius: '16px' }} /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><Skeleton variant="rounded" height={180} sx={{ borderRadius: '16px' }} /></Grid>
      </Grid>
    </PageContainer>
  );

  if (err && !data) return (
    <PageContainer width={980}>
      <PageHeader icon={<Diversity3Icon />} title={translate('page.family')} accent="#d4a574" subtitle={translate('page.family_sub')} />
      <Alert severity="error" sx={{ mt: 2, borderRadius: '16px' }} action={<Button color="inherit" size="small" onClick={() => setReloadKey((k) => k + 1)}>Tentar de novo</Button>}>
        Não carregamos a visão familiar. Verifique sua conexão e tente novamente.
      </Alert>
    </PageContainer>
  );

  const patients = data?.patients ?? [];
  const ranked = [...patients].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)); // 1º = maior score
  const validScores = patients.map((p) => p.score).filter((s): s is number => s != null);
  const avgScore = validScores.length > 0 ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : null;

  return (
    <PageContainer width={980} sx={{ pb: { xs: 10, sm: 5 } }}>
      {/* HERO BANNER PREMIUM */}
      <Card
        elevation={0}
        sx={{
          mb: 3,
          borderRadius: '20px',
          background: 'linear-gradient(135deg, #0f5f5a 0%, #178f89 100%)',
          color: '#fff',
          overflow: 'hidden',
          position: 'relative',
          boxShadow: '0 12px 32px rgba(15,95,90,0.22)',
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2}>
            <Box>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                <Box sx={{ bgcolor: 'rgba(255,255,255,0.2)', p: 1, borderRadius: '14px', display: 'flex', alignItems: 'center' }}>
                  <Diversity3Icon sx={{ fontSize: 28, color: '#fff' }} />
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 900, fontFamily: 'Poppins, sans-serif', letterSpacing: '-0.02em' }}>
                  Saúde da Família
                </Typography>
                {avgScore != null && (
                  <Chip
                    size="small"
                    label={`Média ${avgScore}/100`}
                    sx={{ bgcolor: 'rgba(255,255,255,0.22)', color: '#fff', fontWeight: 800, backdropFilter: 'blur(6px)' }}
                  />
                )}
              </Stack>
              <Typography sx={{ opacity: 0.9, fontSize: 14, maxWidth: 520, lineHeight: 1.4 }}>
                Monitoramento unificado, cruzamento de exames e scores de saúde de todos os seus dependentes.
              </Typography>
            </Box>

            <Button
              variant="contained"
              onClick={() => navigate('/patients')}
              sx={{
                bgcolor: 'rgba(255,255,255,0.18)',
                color: '#fff',
                fontWeight: 800,
                textTransform: 'none',
                borderRadius: '999px',
                px: 2.5,
                py: 1,
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.35)',
                whiteSpace: 'nowrap',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' },
              }}
            >
              ⚙️ Gerenciar dependentes →
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* PADRÃO FAMILIAR DETECTADO (CARD ESTILIZADO EM VEZ DE ALERT SIMPLES) */}
      {(data?.crossAlerts ?? []).length > 0 && (
        <Card
          variant="outlined"
          sx={{
            mb: 3,
            borderRadius: '18px',
            borderColor: 'rgba(245,158,11,0.4)',
            background: 'linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(239,68,68,0.04) 100%)',
          }}
        >
          <CardContent sx={{ p: 2.5 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
              <WarningAmberIcon sx={{ color: '#d97706', fontSize: 24 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#b45309', fontFamily: 'Poppins, sans-serif' }}>
                🧬 Padrão Familiar Detectado em {data!.crossAlerts.length} {data!.crossAlerts.length === 1 ? 'Marcador' : 'Marcadores'}
              </Typography>
            </Stack>
            <Stack spacing={1}>
              {data!.crossAlerts.map((c) => (
                <Box
                  key={c.analyte}
                  sx={{
                    p: 1.25,
                    borderRadius: '12px',
                    bgcolor: 'background.paper',
                    border: '1px solid rgba(245,158,11,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 1,
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.primary' }}>
                    {prettyName(c.analyte)}
                  </Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mr: 0.5 }}>
                      Alterado em:
                    </Typography>
                    {c.patients.map((pName) => (
                      <Chip
                        key={pName}
                        size="small"
                        label={pName}
                        sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: '#fee2e2', color: '#c2410c' }}
                      />
                    ))}
                  </Stack>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {patients.length === 0 && (
        <Card variant="outlined" sx={{ mt: 2, p: 3, textAlign: 'center', borderColor: 'divider', borderRadius: '20px' }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
            <DrExame size={72} />
          </Box>
          <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 18, mb: 0.5 }}>Cuide de quem você ama</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360, mx: 'auto' }}>
            Adicione dependentes (cônjuge, filhos, pais) tocando no seu avatar no topo da tela e acompanhe a saúde de cada um.
          </Typography>
        </Card>
      )}

      {/* CARDS DOS MEMBROS (VISUAL PREMIUM E CARD INDIVIDUAL) */}
      <Grid container spacing={2}>
        {ranked.map((p, idx) => {
          const sColor = scoreColor(p.score);
          return (
            <Grid key={p.id} size={{ xs: 12, md: 6 }}>
              <Card
                variant="outlined"
                onClick={() => { setSelectedPatient(p.id); navigate('/'); }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedPatient(p.id); navigate('/'); } }}
                sx={{
                  height: '100%',
                  cursor: 'pointer',
                  borderRadius: '20px',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.22s ease',
                  border: idx === 0 && p.score != null ? '2px solid #d4a574' : '1px solid',
                  borderColor: idx === 0 && p.score != null ? '#d4a574' : 'divider',
                  bgcolor: 'background.paper',
                  '&:hover': {
                    borderColor: '#178f89',
                    boxShadow: '0 10px 30px rgba(15,95,90,0.14)',
                    transform: 'translateY(-3px)',
                  },
                }}
              >
                <CardContent sx={{ p: 2.5 }}>
                  {idx === 0 && p.score != null && (
                    <Box
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        px: 1.25,
                        py: 0.4,
                        mb: 1.5,
                        borderRadius: '999px',
                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 800,
                        boxShadow: '0 2px 8px rgba(217,119,6,0.3)',
                      }}
                    >
                      🥇 Melhor score da família
                    </Box>
                  )}

                  <Stack direction="row" alignItems="center" spacing={1.75}>
                    <Avatar
                      src={p.photoUrl ? photoUrlFor(p.id) : undefined}
                      sx={{
                        width: 56,
                        height: 56,
                        bgcolor: 'primary.main',
                        fontSize: 22,
                        fontWeight: 800,
                        border: `3px solid ${sColor}`,
                        boxShadow: `0 0 10px ${sColor}44`,
                      }}
                    >
                      {p.fullName.charAt(0).toUpperCase()}
                    </Avatar>

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="h6" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 17 }}>
                        {p.fullName}
                      </Typography>
                      {p.relationship && (
                        <Chip
                          size="small"
                          label={p.relationship}
                          sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(15,95,90,0.08)', color: '#0f5f5a', mt: 0.25 }}
                        />
                      )}
                    </Box>

                    <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                      {p.score != null ? (
                        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 0.25 }}>
                          <Typography variant="h4" sx={{ fontWeight: 900, color: sColor, lineHeight: 1, fontFamily: 'Poppins, sans-serif' }}>
                            {p.score}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                            /100
                          </Typography>
                        </Box>
                      ) : (
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                          Sem score
                        </Typography>
                      )}
                    </Box>
                  </Stack>

                  {/* BARRA DE PROGRESSO DO SCORE */}
                  {p.score != null && (
                    <Box sx={{ height: 8, borderRadius: '999px', bgcolor: 'divider', mt: 2, overflow: 'hidden' }}>
                      <Box sx={{ height: '100%', width: `${p.score}%`, background: sColor, borderRadius: '999px', transition: 'width 0.6s ease' }} />
                    </Box>
                  )}

                  {/* RESUMO DE ALERTAS */}
                  <Typography variant="body2" sx={{ mt: 1.5, fontWeight: 700, color: p.abnormalCount > 0 ? '#c2410c' : '#059669', fontSize: 13 }}>
                    {p.abnormalCount > 0 ? `⚠️ ${p.abnormalCount} marcador(es) alterado(s)` : '✅ Todos os marcadores normais'}
                    {fmtDate(p.performedAt) && ` • ${fmtDate(p.performedAt)}`}
                  </Typography>

                  {/* CHIPS DOS ALTERADOS COM NOME FORMATADO */}
                  {p.topAbnormal.length > 0 && (
                    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 1.25 }}>
                      {p.topAbnormal.map((a, i) => (
                        <Chip
                          key={i}
                          size="small"
                          label={prettyName(a.name)}
                          sx={{
                            height: 22,
                            fontSize: 11,
                            fontWeight: 700,
                            bgcolor: 'rgba(239,68,68,0.12)',
                            color: '#b91c1c',
                            border: '1px solid rgba(239,68,68,0.3)',
                          }}
                        />
                      ))}
                    </Stack>
                  )}

                  <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5} sx={{ mt: 2, color: '#178f89' }}>
                    <Typography variant="caption" sx={{ fontWeight: 800, fontSize: 12 }}>
                      Ver painel completo
                    </Typography>
                    <ChevronRightIcon fontSize="small" />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* COMPARATIVO POR ANALITO (ENTRE MEMBROS DA FAMÍLIA) */}
      {cmp.length > 0 && (
        <Box sx={{ mt: 5, pt: 3, borderTop: '1px dashed', borderColor: 'divider' }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 900, fontFamily: 'Poppins, sans-serif' }}>
              🧬 Comparativo entre Membros
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Valores mais recentes nos exames em comum entre membros da família.
          </Typography>

          <Grid container spacing={1.5}>
            {cmp.map((row) => (
              <Grid key={row.analyte} size={{ xs: 12, sm: 6 }}>
                <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper', height: '100%' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <Typography sx={{ fontWeight: 800, fontSize: 15, color: 'text.primary' }}>
                        {prettyName(row.analyte)}
                      </Typography>
                      {row.unit && <Chip size="small" label={row.unit} sx={{ height: 20, fontSize: 10, fontWeight: 700 }} />}
                    </Box>

                    <Stack spacing={0.75}>
                      {row.members.map((m: any, i: number) => {
                        const isAbn = ['HIGH', 'LOW', 'ABNORMAL', 'CRITICAL'].includes(m.flag);
                        return (
                          <Box
                            key={i}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              p: 1,
                              borderRadius: '10px',
                              bgcolor: isAbn ? 'rgba(239,68,68,0.06)' : 'rgba(5,150,105,0.06)',
                              border: `1px solid ${isAbn ? 'rgba(239,68,68,0.2)' : 'rgba(5,150,105,0.2)'}`,
                            }}
                          >
                            <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                              {(m.name ?? '').split(' ')[0]}
                            </Typography>
                            <Chip
                              size="small"
                              label={m.value}
                              sx={{
                                height: 22,
                                fontWeight: 800,
                                fontSize: 12,
                                bgcolor: isAbn ? '#ef4444' : '#059669',
                                color: '#fff',
                              }}
                            />
                          </Box>
                        );
                      })}
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3, textAlign: 'center' }}>
        *Score de saúde calculado com base nos últimos 12 meses de exames. Conteúdo estritamente educativo.
      </Typography>
    </PageContainer>
  );
};

