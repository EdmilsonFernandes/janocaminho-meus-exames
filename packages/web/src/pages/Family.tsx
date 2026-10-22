import { useEffect, useState, useMemo } from 'react';
import { useTranslate } from 'react-admin';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Stack,
  Chip,
  Avatar,
  Alert,
  Skeleton,
  Button,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  CircularProgress,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import Diversity3Icon from '@mui/icons-material/Diversity3';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import StethoscopeIcon from '@mui/icons-material/MedicalServices';
import EditIcon from '@mui/icons-material/Edit';
import ChildCareIcon from '@mui/icons-material/ChildCare';
import FavoriteIcon from '@mui/icons-material/Favorite';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import { useNavigate } from 'react-router-dom';
import { API_URL, token, photoUrlFor } from '../config';
import { PageContainer } from '../components/layout/PageContainer';
import { DrExame } from '../components/DrExame';
import { setSelectedPatient } from '../patient-context';
import { SEM, tealText } from '../theme';
import { formatCpf, isValidCpf } from '../utils/cpf';

interface FamPatient {
  id: string;
  fullName: string;
  relationship: string | null;
  photoUrl: string | null;
  dateOfBirth?: string | null;
  score: number | null;
  abnormalCount: number;
  examTitle: string | null;
  performedAt: string | null;
  topAbnormal: { name: string; value: string | null; flag: string }[];
}

interface CrossAlert {
  analyte: string;
  patients: string[];
}

const scoreColor = (s: number | null, isDark: boolean) => {
  if (s == null) return isDark ? '#64748b' : '#94a3b8';
  if (s >= 80) return isDark ? SEM.ok.dark : SEM.ok.light;
  if (s >= 60) return isDark ? SEM.warn.dark : SEM.warn.light;
  return isDark ? SEM.bad.dark : SEM.bad.light;
};

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : null);

const ageFrom = (dob?: string | null) => {
  if (!dob) return null;
  try {
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return null;
    const diff = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
    return diff >= 0 ? diff : null;
  } catch {
    return null;
  }
};

/** Helper para formatar nomes de marcadores de exames */
const prettyName = (n: string) => {
  if (!n) return '';
  const tokens = n.split(/[_\s]+/);
  return tokens
    .map((tok) => {
      if (
        tok.length <= 4 &&
        /^[A-Z0-9]+$/.test(tok) &&
        !['ACIDO', 'URICO', 'BILIRRUBINA', 'DIRETA', 'INDIRETA', 'TOTAL'].includes(tok)
      ) {
        return tok;
      }
      return tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase();
    })
    .join(' ');
};

export const FamilyPage = () => {
  const translate = useTranslate();
  const navigate = useNavigate();
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';

  const [data, setData] = useState<{ patients: FamPatient[]; crossAlerts: CrossAlert[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [cmp, setCmp] = useState<any[]>([]);
  const [err, setErr] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Modal rápido de adicionar dependente
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRelationship, setNewRelationship] = useState('Filho(a)');
  const [newDob, setNewDob] = useState('');
  const [newCpf, setNewCpf] = useState('');
  const [savingDependent, setSavingDependent] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(false);

    Promise.all([
      fetch(`${API_URL}/patients/family-overview`, { headers: { Authorization: `Bearer ${token()}` } })
        .then((r) => {
          if (!r.ok) throw new Error('http');
          return r.json();
        }),
      fetch(`${API_URL}/patients/family-compare`, { headers: { Authorization: `Bearer ${token()}` } })
        .then((r) => r.json())
        .catch(() => ({ rows: [] })),
      fetch(`${API_URL}/patients`, { headers: { Authorization: `Bearer ${token()}` } })
        .then((r) => r.json())
        .catch(() => []),
    ])
      .then(([overviewData, compareData, allPatients]) => {
        // Enriquecer dados dos pacientes com datas de nascimento e perfis completos
        const enrichedPatients = (overviewData?.patients ?? []).map((p: FamPatient) => {
          const detail = Array.isArray(allPatients) ? allPatients.find((ap: any) => String(ap.id) === String(p.id)) : null;
          return {
            ...p,
            dateOfBirth: detail?.dateOfBirth ?? p.dateOfBirth ?? null,
            relationship: detail?.relationship ?? p.relationship ?? null,
          };
        });

        setData({
          patients: enrichedPatients,
          crossAlerts: overviewData?.crossAlerts ?? [],
        });
        setCmp(compareData?.rows ?? []);
      })
      .catch(() => {
        setData(null);
        setErr(true);
      })
      .finally(() => setLoading(false));
  }, [reloadKey]);

  const handleSelectMemberAndGo = (patientId: string, path = '/') => {
    setSelectedPatient(patientId);
    navigate(path);
  };

  const handleCreateDependent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setModalError('Informe o nome completo do dependente.');
      return;
    }
    if (newCpf && !isValidCpf(newCpf)) {
      setModalError('CPF informado é inválido.');
      return;
    }

    setSavingDependent(true);
    setModalError(null);

    try {
      const payload: any = {
        fullName: newName.trim(),
        relationship: newRelationship,
      };
      if (newDob) payload.dateOfBirth = newDob;
      if (newCpf) payload.cpf = newCpf.replace(/\D/g, '');

      const res = await fetch(`${API_URL}/patients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Não foi possível cadastrar o dependente.');
      }

      window.dispatchEvent(new Event('patients-changed'));
      window.dispatchEvent(new Event('selPatientChanged'));
      setAddModalOpen(false);
      setNewName('');
      setNewDob('');
      setNewCpf('');
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      setModalError(err.message || 'Falha ao salvar dependente.');
    } finally {
      setSavingDependent(false);
    }
  };

  if (loading) {
    return (
      <PageContainer width={1020}>
        <Skeleton variant="rectangular" height={160} sx={{ borderRadius: '24px', mb: 3 }} />
        <Grid container spacing={2.5}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Skeleton variant="rounded" height={260} sx={{ borderRadius: '20px' }} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Skeleton variant="rounded" height={260} sx={{ borderRadius: '20px' }} />
          </Grid>
        </Grid>
      </PageContainer>
    );
  }

  if (err && !data) {
    return (
      <PageContainer width={1020}>
        <Alert
          severity="error"
          sx={{ mt: 3, borderRadius: '20px' }}
          action={
            <Button color="inherit" size="small" onClick={() => setReloadKey((k) => k + 1)}>
              Tentar novamente
            </Button>
          }
        >
          Não foi possível carregar as informações da família. Verifique sua conexão e tente novamente.
        </Alert>
      </PageContainer>
    );
  }

  const patients = data?.patients ?? [];
  const titular = patients.find((p) => /titular/i.test(p.relationship || '')) || patients[0];
  const dependentes = patients.filter((p) => p !== titular);

  const validScores = patients.map((p) => p.score).filter((s): s is number => s != null);
  const avgScore = validScores.length > 0 ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : null;

  return (
    <PageContainer width={1020} sx={{ pb: { xs: 16, sm: 6 } }}>
      {/* 1. HERO BANNER: CENTRO DE CUIDADOS DA FAMÍLIA */}
      <Card
        elevation={0}
        sx={{
          mb: 3.5,
          borderRadius: { xs: '20px', sm: '26px' },
          background: dark
            ? 'linear-gradient(135deg, #07172b 0%, #0d2f33 50%, #0f5f5a 100%)'
            : 'linear-gradient(135deg, #0b2239 0%, #0e4e52 50%, #178f89 100%)',
          color: '#ffffff',
          overflow: 'hidden',
          position: 'relative',
          boxShadow: '0 16px 40px rgba(7, 23, 43, 0.35)',
          border: '1px solid rgba(95, 201, 195, 0.25)',
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at 85% 15%, rgba(95, 201, 195, 0.25), transparent 60%)',
            pointerEvents: 'none',
          },
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, sm: 4 }, position: 'relative', zIndex: 1 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            spacing={2.5}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1, flexWrap: 'wrap' }}>
                <Box
                  sx={{
                    bgcolor: 'rgba(255, 255, 255, 0.16)',
                    backdropFilter: 'blur(10px)',
                    p: 1,
                    borderRadius: '14px',
                    display: 'grid',
                    placeItems: 'center',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                  }}
                >
                  <Diversity3Icon sx={{ fontSize: 26, color: '#5fc9c3' }} />
                </Box>
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 900,
                    fontFamily: 'Poppins, sans-serif',
                    letterSpacing: '-0.02em',
                    fontSize: { xs: 20, sm: 24 },
                  }}
                >
                  Centro de Cuidados da Família
                </Typography>
                {avgScore != null && (
                  <Chip
                    size="small"
                    label={`Score Médio ${avgScore}/100`}
                    sx={{
                      bgcolor: 'rgba(95, 201, 195, 0.22)',
                      color: '#ffffff',
                      fontWeight: 800,
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(95, 201, 195, 0.4)',
                    }}
                  />
                )}
              </Box>

              <Typography sx={{ opacity: 0.9, fontSize: { xs: 13, sm: 14.5 }, maxWidth: 620, lineHeight: 1.5 }}>
                Acompanhe a saúde de quem você ama em um só lugar. Cada dependente possui exames, histórico e laudos 100% individuais e seguros.
              </Typography>

              {/* Status Pills */}
              <Stack direction="row" spacing={1.5} sx={{ mt: 2, flexWrap: 'wrap', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12, opacity: 0.9 }}>
                  <VerifiedUserIcon sx={{ fontSize: 16, color: '#5fc9c3' }} />
                  {patients.length} {patients.length === 1 ? 'perfil monitorado' : 'perfis monitorados'}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12, opacity: 0.9 }}>
                  <FavoriteIcon sx={{ fontSize: 16, color: '#f87171' }} />
                  Históricos e privacidade separados por pessoa
                </Box>
              </Stack>
            </Box>

            <Button
              variant="contained"
              onClick={() => setAddModalOpen(true)}
              startIcon={<PersonAddAlt1Icon />}
              sx={{
                background: 'linear-gradient(135deg, #20b2aa 0%, #178f89 100%)',
                color: '#ffffff',
                fontWeight: 800,
                textTransform: 'none',
                borderRadius: '999px',
                px: 2.75,
                py: 1.1,
                boxShadow: '0 8px 24px rgba(32, 178, 170, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 12px 28px rgba(32, 178, 170, 0.55)',
                },
              }}
            >
              + Adicionar Dependente
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* 2. ALERTA DE GENÉTICA & TENDÊNCIAS EM COMUM (Acolhedor e Educativo) */}
      {(data?.crossAlerts ?? []).length > 0 && (
        <Card
          variant="outlined"
          sx={{
            mb: 3.5,
            borderRadius: '20px',
            borderColor: 'rgba(245, 158, 11, 0.35)',
            background: dark
              ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(239, 68, 68, 0.04) 100%)'
              : 'linear-gradient(135deg, #fffcf5 0%, #fff6e8 100%)',
            boxShadow: '0 4px 16px rgba(245, 158, 11, 0.08)',
          }}
        >
          <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 1.25 }}>
              <WarningAmberIcon sx={{ color: '#d97706', fontSize: 24 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#b45309', fontFamily: 'Poppins, sans-serif' }}>
                🧬 Padrão Familiar Identificado em {data!.crossAlerts.length}{' '}
                {data!.crossAlerts.length === 1 ? 'Marcador' : 'Marcadores'}
              </Typography>
            </Stack>

            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.75, maxWidth: 840, lineHeight: 1.5 }}>
              Marcadores que apresentaram valores fora da meta tanto para você quanto para seus dependentes. Compartilhar
              hábitos alimentares e rotinas saudáveis em casa acelera a melhora mútua:
            </Typography>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} useFlexGap flexWrap="wrap">
              {data!.crossAlerts.map((c) => (
                <Box
                  key={c.analyte}
                  sx={{
                    p: 1.5,
                    borderRadius: '14px',
                    bgcolor: dark ? '#13202e' : '#ffffff',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  }}
                >
                  <Typography sx={{ fontWeight: 800, fontSize: 13.5, color: 'text.primary' }}>
                    {prettyName(c.analyte)}
                  </Typography>
                  <Stack direction="row" spacing={0.6}>
                    {c.patients.map((pName) => (
                      <Chip
                        key={pName}
                        size="small"
                        label={pName.split(' ')[0]}
                        sx={{
                          height: 22,
                          fontSize: 11.5,
                          fontWeight: 800,
                          bgcolor: 'rgba(239, 68, 68, 0.12)',
                          color: '#b91c1c',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                        }}
                      />
                    ))}
                  </Stack>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* 3. CARDS MODERNOS DOS MEMBROS (EDMILSON, HELOISA, ETC.) */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography
            component="h2"
            sx={{
              fontWeight: 800,
              fontFamily: 'Poppins, sans-serif',
              fontSize: { xs: 17, sm: 19 },
              color: 'text.primary',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <span>👨‍👩‍👧</span> Membros Monitorados ({patients.length})
          </Typography>
          <Button
            size="small"
            onClick={() => navigate('/patients')}
            sx={{ textTransform: 'none', fontWeight: 700, color: 'text.secondary', fontSize: 12 }}
          >
            Gerenciar perfis e cadastros →
          </Button>
        </Box>

        <Grid container spacing={2.5}>
          {patients.map((p) => {
            const isTit = /titular/i.test(p.relationship || '') || p === titular;
            const age = ageFrom(p.dateOfBirth);
            const sColor = scoreColor(p.score, dark);
            const isHealthy = p.abnormalCount === 0;

            return (
              <Grid key={p.id} size={{ xs: 12, md: 6 }}>
                <Card
                  variant="outlined"
                  sx={{
                    height: '100%',
                    borderRadius: '22px',
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    border: '1.5px solid',
                    borderColor: isTit ? alpha('#20b2aa', 0.4) : alpha('#d4a574', 0.4),
                    background: dark
                      ? isTit
                        ? 'linear-gradient(145deg, rgba(32, 178, 170, 0.08) 0%, #101c27 60%)'
                        : 'linear-gradient(145deg, rgba(212, 165, 116, 0.08) 0%, #101c27 60%)'
                      : isTit
                      ? 'linear-gradient(145deg, #f0fbfb 0%, #ffffff 60%)'
                      : 'linear-gradient(145deg, #fdfaf7 0%, #ffffff 60%)',
                    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.04)',
                    transition: 'all 0.25s ease',
                    '&:hover': {
                      borderColor: isTit ? '#20b2aa' : '#b88a54',
                      boxShadow: '0 12px 32px rgba(15, 95, 90, 0.12)',
                      transform: 'translateY(-2px)',
                    },
                  }}
                >
                  <CardContent sx={{ p: { xs: 2.25, sm: 2.75 } }}>
                    {/* Linha Superior: Avatar, Identificação e Score */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                        <Box sx={{ position: 'relative' }}>
                          <Avatar
                            src={p.photoUrl ? photoUrlFor(p.id) : undefined}
                            sx={{
                              width: 58,
                              height: 58,
                              bgcolor: isTit ? 'primary.main' : '#cfd8dc',
                              color: isTit ? '#ffffff' : '#455a64',
                              fontSize: 24,
                              fontWeight: 800,
                              border: `3px solid ${sColor}`,
                              boxShadow: `0 0 12px ${alpha(sColor, 0.45)}`,
                            }}
                          >
                            {p.fullName.charAt(0).toUpperCase()}
                          </Avatar>
                          {isTit && (
                            <Box
                              sx={{
                                position: 'absolute',
                                bottom: -2,
                                right: -2,
                                width: 18,
                                height: 18,
                                borderRadius: '50%',
                                bgcolor: '#d4a574',
                                color: '#ffffff',
                                border: '2px solid #ffffff',
                                display: 'grid',
                                placeItems: 'center',
                                fontSize: 11,
                                fontWeight: 900,
                              }}
                            >
                              ★
                            </Box>
                          )}
                        </Box>

                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            sx={{
                              fontWeight: 800,
                              fontFamily: 'Poppins, sans-serif',
                              fontSize: { xs: 16, sm: 17.5 },
                              color: 'text.primary',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              lineHeight: 1.2,
                            }}
                          >
                            {p.fullName}
                          </Typography>

                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5, flexWrap: 'wrap' }}>
                            <Chip
                              size="small"
                              label={isTit ? 'Titular · Responsável' : p.relationship || 'Dependente'}
                              sx={{
                                height: 21,
                                fontSize: 11,
                                fontWeight: 800,
                                bgcolor: isTit ? 'rgba(32, 178, 170, 0.14)' : 'rgba(212, 165, 116, 0.18)',
                                color: isTit ? (dark ? '#5fc9c3' : '#178f89') : (dark ? '#e6c8a5' : '#8c6031'),
                                textTransform: 'uppercase',
                                letterSpacing: '0.03em',
                              }}
                            />
                            {age != null && (
                              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                • {age} ano{age === 1 ? '' : 's'}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </Box>

                      {/* Score Numérico */}
                      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                        {p.score != null ? (
                          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 0.25 }}>
                            <Typography
                              sx={{
                                fontWeight: 900,
                                color: sColor,
                                lineHeight: 1,
                                fontFamily: 'Poppins, sans-serif',
                                fontSize: { xs: 26, sm: 30 },
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {p.score}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: 11 }}>
                              /100
                            </Typography>
                          </Box>
                        ) : (
                          <Chip size="small" label="Aguardando exames" sx={{ fontSize: 10.5, height: 20 }} />
                        )}
                      </Box>
                    </Box>

                    {/* Barra de Progresso do Score de Saúde */}
                    {p.score != null && (
                      <Box sx={{ height: 6, borderRadius: '999px', bgcolor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', mb: 2, overflow: 'hidden' }}>
                        <Box sx={{ height: '100%', width: `${p.score}%`, background: sColor, borderRadius: '999px' }} />
                      </Box>
                    )}

                    {/* Status de Exames e Marcadores */}
                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: '14px',
                        bgcolor: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        border: '1px solid',
                        borderColor: isHealthy ? 'rgba(5, 150, 105, 0.2)' : 'rgba(239, 68, 68, 0.25)',
                        mb: 2,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 800,
                            color: isHealthy ? (dark ? SEM.ok.dark : SEM.ok.light) : (dark ? SEM.bad.dark : SEM.bad.light),
                            fontSize: 13,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.6,
                          }}
                        >
                          {isHealthy ? <CheckCircleIcon sx={{ fontSize: 16 }} /> : <WarningAmberIcon sx={{ fontSize: 16 }} />}
                          {isHealthy
                            ? 'Todos os marcadores na meta'
                            : `${p.abnormalCount} marcador(es) precisam de atenção`}
                        </Typography>
                        {fmtDate(p.performedAt) && (
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11 }}>
                            {fmtDate(p.performedAt)}
                          </Typography>
                        )}
                      </Box>

                      {p.topAbnormal.length > 0 ? (
                        <Stack direction="row" spacing={0.6} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                          {p.topAbnormal.map((a, i) => (
                            <Chip
                              key={i}
                              size="small"
                              label={`${prettyName(a.name)}: ${a.value || 'Alterado'}`}
                              sx={{
                                height: 21,
                                fontSize: 11,
                                fontWeight: 700,
                                bgcolor: 'rgba(239, 68, 68, 0.1)',
                                color: dark ? '#fca5a5' : '#b91c1c',
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                              }}
                            />
                          ))}
                        </Stack>
                      ) : (
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                          {p.examTitle ? `Último laudo: ${p.examTitle}` : 'Histórico monitorado pelo Dr. Exame'}
                        </Typography>
                      )}
                    </Box>

                    {/* Ações Rápidas por Pessoa */}
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: 1,
                        pt: 1.5,
                        borderTop: '1px dashed',
                        borderColor: 'divider',
                      }}
                    >
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => handleSelectMemberAndGo(p.id, '/')}
                        sx={{
                          py: 0.9,
                          borderRadius: '10px',
                          textTransform: 'none',
                          fontWeight: 800,
                          fontSize: 12.5,
                          background: isTit
                            ? 'linear-gradient(135deg, #20b2aa 0%, #178f89 100%)'
                            : 'linear-gradient(135deg, #b88a54 0%, #9c7241 100%)',
                          color: '#ffffff',
                          boxShadow: 'none',
                          '&:hover': {
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                          },
                        }}
                      >
                        Abrir Dashboard →
                      </Button>

                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<UploadFileIcon sx={{ fontSize: 16 }} />}
                        onClick={() => handleSelectMemberAndGo(p.id, '/exams/create')}
                        sx={{
                          py: 0.9,
                          borderRadius: '10px',
                          textTransform: 'none',
                          fontWeight: 700,
                          fontSize: 12,
                          color: 'text.primary',
                          borderColor: 'divider',
                          '&:hover': {
                            borderColor: 'primary.main',
                            bgcolor: 'action.hover',
                          },
                        }}
                      >
                        Enviar Exame
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      </Box>

      {/* 4. COMPARATIVO CLÍNICO POR ANALITO (Valores entre os membros) */}
      {cmp.length > 0 && (
        <Card
          variant="outlined"
          sx={{
            mb: 4,
            borderRadius: '22px',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            p: { xs: 2.5, sm: 3 },
          }}
        >
          <Box sx={{ mb: 2.5 }}>
            <Typography
              component="h3"
              sx={{
                fontWeight: 900,
                fontFamily: 'Poppins, sans-serif',
                fontSize: 18,
                color: 'text.primary',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <span>🔬</span> Comparativo Direto entre Membros
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              Valores mais recentes dos exames laboratoriais realizados em comum na família.
            </Typography>
          </Box>

          <Grid container spacing={2}>
            {cmp.map((row) => (
              <Grid key={row.analyte} size={{ xs: 12, sm: 6 }}>
                <Box
                  sx={{
                    p: 1.75,
                    borderRadius: '14px',
                    bgcolor: dark ? '#101c27' : '#f8fafc',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 14, color: 'text.primary' }}>
                      {prettyName(row.analyte)}
                    </Typography>
                    {row.unit && (
                      <Chip
                        size="small"
                        label={row.unit}
                        sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: 'action.hover' }}
                      />
                    )}
                  </Box>

                  <Stack spacing={0.9}>
                    {row.members.map((m: any, i: number) => {
                      const isAbn = ['HIGH', 'LOW', 'ABNORMAL', 'CRITICAL'].includes(m.flag);
                      const isWarn = isAbn;
                      const statusCol = isAbn ? (dark ? SEM.bad.dark : SEM.bad.light) : (dark ? SEM.ok.dark : SEM.ok.light);

                      return (
                        <Box
                          key={i}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            p: '7px 10px',
                            borderRadius: '10px',
                            bgcolor: isAbn
                              ? dark
                                ? 'rgba(239, 68, 68, 0.12)'
                                : 'rgba(239, 68, 68, 0.06)'
                              : dark
                              ? 'rgba(5, 150, 105, 0.12)'
                              : 'rgba(5, 150, 105, 0.05)',
                            border: `1px solid ${alpha(statusCol, 0.3)}`,
                          }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 13, color: 'text.primary' }}>
                            {(m.name ?? '').split(' ')[0]}
                          </Typography>
                          <Typography
                            sx={{
                              fontWeight: 800,
                              fontSize: 13.5,
                              color: statusCol,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {m.value}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Card>
      )}

      {/* 5. TRILHAS DE CUIDADO PREVENTIVO & ORIENTAÇÕES DO DR. EXAME */}
      <Card
        variant="outlined"
        sx={{
          borderRadius: '22px',
          borderColor: 'rgba(32, 178, 170, 0.3)',
          background: dark
            ? 'linear-gradient(135deg, rgba(32, 178, 170, 0.07) 0%, rgba(15, 95, 90, 0.03) 100%)'
            : 'linear-gradient(135deg, #f0fdfa 0%, #ffffff 100%)',
          p: { xs: 2.25, sm: 3 },
        }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} alignItems="flex-start">
          <Box sx={{ flexShrink: 0 }}>
            <DrExame size={64} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography
              component="h4"
              sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 16, color: 'text.primary', mb: 0.5 }}
            >
              Proteção Contínua para Você e seus Dependentes
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.55, mb: 1.75 }}>
              O Dr. Exame mantém histórico perpétuo de vacinas, check-ups e evolução laboratorial. Cada familiar pode
              ter laudos compartilhados com seus próprios médicos (ex: pediatra para filhos, cardiologista para adultos),
              com links protegidos por senha e revogáveis a qualquer momento.
            </Typography>

            <Stack direction="row" spacing={1.5} flexWrap="wrap" gap={1}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<CalendarMonthIcon sx={{ fontSize: 16 }} />}
                onClick={() => navigate('/reminders')}
                sx={{
                  borderRadius: '999px',
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: 12,
                  color: 'primary.main',
                  borderColor: 'primary.main',
                }}
              >
                Configurar Lembretes Preventivos
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<StethoscopeIcon sx={{ fontSize: 16 }} />}
                onClick={() => navigate('/medicos')}
                sx={{
                  borderRadius: '999px',
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: 12,
                  color: 'text.secondary',
                  borderColor: 'divider',
                }}
              >
                Gerenciar Compartilhamento com Médicos
              </Button>
            </Stack>
          </Box>
        </Stack>
      </Card>

      {/* DIÁLOGO / MODAL DE ADICIONAR DEPENDENTE */}
      <Dialog
        open={addModalOpen}
        onClose={() => !savingDependent && setAddModalOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '22px',
            p: { xs: 1, sm: 1.5 },
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 19, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Adicionar Novo Dependente</span>
          <IconButton size="small" onClick={() => setAddModalOpen(false)} disabled={savingDependent}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <form onSubmit={handleCreateDependent}>
          <DialogContent sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Cadastre um dependente (filho, cônjuge, pai/mãe) para centralizar os exames e acompanhar a saúde com históricos individuais.
            </Typography>

            {modalError && (
              <Alert severity="error" sx={{ borderRadius: '12px', fontSize: 13 }}>
                {modalError}
              </Alert>
            )}

            <TextField
              label="Nome completo do dependente"
              placeholder="Ex: Heloisa Fernandes"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              fullWidth
              required
              size="small"
            />

            <TextField
              select
              label="Grau de parentesco"
              value={newRelationship}
              onChange={(e) => setNewRelationship(e.target.value)}
              fullWidth
              size="small"
            >
              <MenuItem value="Filho(a)">Filho(a)</MenuItem>
              <MenuItem value="Cônjuge">Cônjuge / Parceiro(a)</MenuItem>
              <MenuItem value="Pai/Mãe">Pai / Mãe</MenuItem>
              <MenuItem value="Irmão(ã)">Irmão(ã)</MenuItem>
              <MenuItem value="Outro">Outro familiar</MenuItem>
            </TextField>

            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Data de Nascimento"
                  type="date"
                  value={newDob}
                  onChange={(e) => setNewDob(e.target.value)}
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                  helperText="Para cálculo de idade e faixas pediátricas"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="CPF (Opcional)"
                  placeholder="000.000.000-00"
                  value={newCpf}
                  onChange={(e) => setNewCpf(formatCpf(e.target.value))}
                  fullWidth
                  size="small"
                  inputProps={{ inputMode: 'numeric' }}
                  helperText="Para validação de laudos laboratoriais"
                />
              </Grid>
            </Grid>
          </DialogContent>

          <DialogActions sx={{ p: 2.5, pt: 1 }}>
            <Button
              onClick={() => setAddModalOpen(false)}
              disabled={savingDependent}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={savingDependent}
              sx={{
                borderRadius: '999px',
                textTransform: 'none',
                fontWeight: 800,
                px: 3,
                background: 'linear-gradient(135deg, #20b2aa 0%, #178f89 100%)',
              }}
            >
              {savingDependent ? <CircularProgress size={20} color="inherit" /> : 'Salvar Dependente'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </PageContainer>
  );
};
