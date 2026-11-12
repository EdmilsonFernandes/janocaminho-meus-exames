import { useEffect, useState, useMemo } from 'react';
import { plural } from '../utils/format';
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
import GridViewIcon from '@mui/icons-material/GridView';
import TableChartIcon from '@mui/icons-material/TableChart';
import { useNavigate } from 'react-router-dom';
import { API_URL, token, photoUrlFor } from '../config';
import { PageContainer } from '../components/layout/PageContainer';
import { DrExame } from '../components/DrExame';
import { setSelectedPatient } from '../patient-context';
import { SEM, tealText } from '../theme';
import { formatCpf, isValidCpf } from '../utils/cpf';
import { familyMemberStatus } from '../utils/familyMemberStatus';

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
  const [activeFamilyCategory, setActiveFamilyCategory] = useState<string>('divergent');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Filtro clínico rigoroso: hábitos compartilhados da casa (alimentação, sedentarismo, ambiente)
  // Exclui hormônios sexuais e desvios agudos que possuem eixos biológicos individuais por sexo/idade.
  const EXCLUDE_FROM_HOUSEHOLD_HABITS = [
    'TESTOSTERONA', 'ESTRADIOL', 'PROGESTERONA', 'PROLACTINA', 'FSH', 'LH', 'DHEA', 'DHT', 'BASTONETES'
  ];

  const householdCrossAlerts = useMemo(() => {
    return (data?.crossAlerts ?? []).filter((c) => {
      const up = (c.analyte || '').toUpperCase();
      return !EXCLUDE_FROM_HOUSEHOLD_HABITS.some((k) => up.includes(k));
    });
  }, [data?.crossAlerts]);

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

      {/* 2. PADRÃO FAMILIAR DE HÁBITOS & ROTINA DOMÉSTICA (ReUI HealthTech) */}
      {householdCrossAlerts.length > 0 && (
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
          <CardContent sx={{ p: { xs: 2.25, sm: 2.75 } }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5, mb: 1.25 }}>
              <Stack direction="row" alignItems="center" spacing={1.25}>
                <Typography sx={{ fontSize: 24, lineHeight: 1 }}>🥗</Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#b45309', fontFamily: 'Poppins, sans-serif' }}>
                  Padrão Familiar de Hábitos & Rotina Doméstica ({householdCrossAlerts.length}{' '}
                  {householdCrossAlerts.length === 1 ? 'Ponto de Sinergia' : 'Pontos de Sinergia'})
                </Typography>
              </Stack>
              <Chip
                size="small"
                label="Filtro Biológico Ativo"
                sx={{
                  bgcolor: dark ? 'rgba(15, 118, 110, 0.2)' : '#CCFBF1',
                  color: dark ? '#5EEAD4' : '#0F766E',
                  fontWeight: 800,
                  fontSize: 12,
                  height: 24,
                }}
              />
            </Box>

            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, maxWidth: 840, lineHeight: 1.55 }}>
              Identificamos marcadores sensíveis à <strong>alimentação compartilhada</strong>, <strong>sedentarismo</strong> e <strong>ambiente da casa</strong> que estão fora da meta em ambos. Mudanças de rotina feitas em família aceleram o retorno à faixa em até <strong>2x mais rápido</strong>:
            </Typography>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} useFlexGap flexWrap="wrap">
              {householdCrossAlerts.map((c) => (
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
                          fontSize: 12,
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

            <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid rgba(245, 158, 11, 0.2)', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: 13 }}>🩺</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                <strong>Rigor Clínico Aplicado:</strong> Hormônios sexuais (Testosterona, Estradiol, Prolactina) possuem referências biológicas específicas por sexo e idade e são analisados individualmente.
              </Typography>
            </Box>
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
            // Sem exame NÃO é "na meta" (falsa calma — ver utils/familyMemberStatus).
            const status = familyMemberStatus(p);

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
                                fontSize: 12,
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
                                fontSize: 12,
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
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: 12 }}>
                              /100
                            </Typography>
                          </Box>
                        ) : (
                          <Chip size="small" label="Aguardando exames" sx={{ fontSize: 12, height: 20 }} />
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
                        borderColor: status === 'na-meta' ? 'rgba(5, 150, 105, 0.2)' : status === 'atencao' ? 'rgba(239, 68, 68, 0.25)' : 'divider',
                        mb: 2,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 800,
                            color: status === 'na-meta' ? (dark ? SEM.ok.dark : SEM.ok.light) : status === 'atencao' ? (dark ? SEM.bad.dark : SEM.bad.light) : 'text.secondary',
                            fontSize: 13,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.6,
                          }}
                        >
                          {status === 'na-meta' ? <CheckCircleIcon sx={{ fontSize: 16 }} />
                            : status === 'atencao' ? <WarningAmberIcon sx={{ fontSize: 16 }} />
                            : <UploadFileIcon sx={{ fontSize: 16 }} />}
                          {status === 'na-meta' ? 'Todos os marcadores na meta'
                            : status === 'atencao' ? `${plural(p.abnormalCount, 'marcador')} ${p.abnormalCount === 1 ? 'precisa' : 'precisam'} de atenção`
                            : 'Nenhum exame enviado ainda'}
                        </Typography>
                        {fmtDate(p.performedAt) && (
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 12 }}>
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
                                fontSize: 12,
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
                          {p.examTitle ? `Último laudo: ${p.examTitle}`
                            : status === 'sem-exame' ? 'Envie o primeiro para começar o acompanhamento.'
                            : 'Histórico monitorado pelo Dr. Exame'}
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

      {/* 4. COMPARATIVO CLÍNICO FAMILIAR (REUI DUAL-GAUGE & MATRIZ EXECUTIVA) */}
      {cmp.length > 0 && (() => {
        // Categorias clínicas
        const CATEGORY_MAP: Record<string, { label: string; icon: string; keys: string[] }> = {
          metabolic: {
            label: 'Perfil Lipídico & Glicêmico',
            icon: '🥗',
            keys: ['COLESTEROL', 'HDL', 'LDL', 'VLDL', 'TRIGLICERIDEOS', 'GLICOSE', 'GLICADA', 'HBA1C', 'INSULINA', 'HOMA', 'LIPIDICO'],
          },
          blood: {
            label: 'Hemograma & Sangue',
            icon: '🩸',
            keys: ['HEMOGLOBINA', 'HEMACIAS', 'HEMATOCRITO', 'VCM', 'HCM', 'CHCM', 'RDW', 'LEUCOCITOS', 'PLAQUETAS', 'NEUTROFILOS', 'LINFOCITOS', 'MONOCITOS', 'EOSINOFILOS', 'BASOFILOS', 'VHS', 'SANGUE'],
          },
          organ: {
            label: 'Fígado & Rim',
            icon: '🧪',
            keys: ['CREATININA', 'UREIA', 'TGO', 'TGP', 'AST', 'ALT', 'GAMA', 'FOSFATASE', 'ACIDO URICO', 'BILIRRUBINA', 'ALBUMINA', 'SODIO', 'POTASSIO', 'CALCIO'],
          },
          hormones: {
            label: 'Hormônios & Tireoide',
            icon: '⚡',
            keys: ['TSH', 'T4', 'T3', 'TESTOSTERONA', 'CORTISOL', 'PROLACTINA', 'DHEA', 'ESTRADIOL', 'PROGESTERONA', 'TIREOIDE', 'PTH', 'FSH', 'LH'],
          },
        };

        const FALLBACK_REFS: Record<string, { low: number; high: number; unit: string }> = {
          HEMOGLOBINA: { low: 12.0, high: 16.0, unit: 'g/dL' },
          HEMACIAS: { low: 4.0, high: 5.8, unit: 'mi/mm³' },
          HEMATOCRITO: { low: 36.0, high: 52.0, unit: '%' },
          VCM: { low: 80.0, high: 100.0, unit: 'fL' },
          LEUCOCITOS: { low: 4000, high: 10000, unit: '/mm³' },
          PLAQUETAS: { low: 150000, high: 450000, unit: '/mm³' },
          GLICOSE: { low: 70, high: 99, unit: 'mg/dL' },
          COLESTEROL_TOTAL: { low: 120, high: 190, unit: 'mg/dL' },
          HDL: { low: 40, high: 60, unit: 'mg/dL' },
          LDL: { low: 50, high: 100, unit: 'mg/dL' },
          TRIGLICERIDEOS: { low: 50, high: 150, unit: 'mg/dL' },
          CREATININA: { low: 0.6, high: 1.2, unit: 'mg/dL' },
          UREIA: { low: 15, high: 45, unit: 'mg/dL' },
          TSH: { low: 0.4, high: 4.5, unit: 'mUI/L' },
          T4_LIVRE: { low: 0.8, high: 1.8, unit: 'ng/dL' },
        };

        const MEMBER_COLORS = ['#0d9488', '#ec4899', '#8b5cf6', '#f59e0b', '#10b981'];

        // Analitos com divergência clínica em pelo menos um membro
        const divergentRows = cmp.filter((row) =>
          row.members.some((m: any) =>
            ['HIGH', 'LOW', 'ABNORMAL', 'CRITICAL'].includes(m.flag) ||
            (m.refLow != null && m.valueNumeric != null && m.valueNumeric < m.refLow) ||
            (m.refHigh != null && m.valueNumeric != null && m.valueNumeric > m.refHigh)
          )
        );

        // Classificação por categorias
        const categorizedRows: Record<string, any[]> = {
          all: cmp,
          divergent: divergentRows,
          metabolic: [],
          blood: [],
          organ: [],
          hormones: [],
          others: [],
        };

        cmp.forEach((row) => {
          const upper = (row.analyte || '').toUpperCase();
          let matched = false;
          for (const [catKey, catDef] of Object.entries(CATEGORY_MAP)) {
            if (catDef.keys.some((k) => upper.includes(k))) {
              categorizedRows[catKey].push(row);
              matched = true;
              break;
            }
          }
          if (!matched) categorizedRows.others.push(row);
        });

        // Categoria ativa: se 'divergent' estiver vazio no início, cai para 'metabolic' ou 'all'
        let activeCat = activeFamilyCategory;
        if (activeCat === 'divergent' && divergentRows.length === 0) {
          activeCat = 'all';
        }

        const currentRows = (categorizedRows[activeCat] && categorizedRows[activeCat].length > 0)
          ? categorizedRows[activeCat]
          : cmp;

        // Cálculos para o Card de Síntese Clínica Familiar
        const totalItems = cmp.length;
        const divergentItems: { analyte: string; memberName: string; value: string; flag: string }[] = [];
        cmp.forEach((row) => {
          row.members.forEach((m: any) => {
            if (['HIGH', 'LOW', 'ABNORMAL', 'CRITICAL'].includes(m.flag)) {
              divergentItems.push({
                analyte: prettyName(row.analyte),
                memberName: (m.name || '').split(' ')[0],
                value: `${m.value} ${row.unit || ''}`.trim(),
                flag: m.flag,
              });
            }
          });
        });

        const normalCount = totalItems - new Set(divergentItems.map((d) => d.analyte)).size;
        const alignmentPct = totalItems > 0 ? Math.round((normalCount / totalItems) * 100) : 100;

        return (
          <Card
            variant="outlined"
            sx={{
              mb: 4,
              borderRadius: '24px',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              p: { xs: 2.25, sm: 3.5 },
              boxShadow: dark ? '0 4px 20px rgba(0,0,0,0.3)' : '0 4px 20px rgba(15, 23, 42, 0.04)',
            }}
          >
            {/* Cabeçalho ReUI */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 3 }}>
              <Box>
                <Typography
                  component="h3"
                  sx={{
                    fontWeight: 900,
                    fontFamily: 'Poppins, sans-serif',
                    fontSize: { xs: 17, sm: 20 },
                    color: 'text.primary',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.25,
                  }}
                >
                  <Diversity3Icon sx={{ color: 'primary.main', fontSize: 24 }} />
                  Comparativo Clínico Familiar
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, maxWidth: 640 }}>
                  Cada membro comparado com a sua própria régua de normalidade biológica por sexo e faixa etária.
                </Typography>
              </Box>

              {/* Seletor de Modo de Visão ReUI (Cards vs Matriz) */}
              <Stack direction="row" spacing={0.5} sx={{ p: 0.5, bgcolor: dark ? 'rgba(255,255,255,0.05)' : '#f1f5f9', borderRadius: '12px' }}>
                <Button
                  size="small"
                  onClick={() => setViewMode('cards')}
                  startIcon={<GridViewIcon sx={{ fontSize: 16 }} />}
                  variant={viewMode === 'cards' ? 'contained' : 'text'}
                  sx={{
                    textTransform: 'none',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: 12,
                    py: 0.6,
                    px: 1.5,
                    bgcolor: viewMode === 'cards' ? (dark ? '#1e293b' : '#ffffff') : 'transparent',
                    color: viewMode === 'cards' ? 'text.primary' : 'text.secondary',
                    boxShadow: viewMode === 'cards' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                    '&:hover': { bgcolor: viewMode === 'cards' ? (dark ? '#1e293b' : '#ffffff') : 'action.hover' },
                  }}
                >
                  Cards Detalhados
                </Button>
                <Button
                  size="small"
                  onClick={() => setViewMode('table')}
                  startIcon={<TableChartIcon sx={{ fontSize: 16 }} />}
                  variant={viewMode === 'table' ? 'contained' : 'text'}
                  sx={{
                    textTransform: 'none',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: 12,
                    py: 0.6,
                    px: 1.5,
                    bgcolor: viewMode === 'table' ? (dark ? '#1e293b' : '#ffffff') : 'transparent',
                    color: viewMode === 'table' ? 'text.primary' : 'text.secondary',
                    boxShadow: viewMode === 'table' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                    '&:hover': { bgcolor: viewMode === 'table' ? (dark ? '#1e293b' : '#ffffff') : 'action.hover' },
                  }}
                >
                  Matriz Executiva
                </Button>
              </Stack>
            </Box>

            {/* Abas de Categorias Clínicas ReUI */}
            <Stack
              direction="row"
              spacing={1}
              sx={{
                overflowX: 'auto',
                pb: 1,
                mb: 3,
                borderBottom: '1px solid',
                borderColor: 'divider',
                '&::-webkit-scrollbar': { height: 4 },
                '&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 4 },
              }}
            >
              {/* Botão de Divergência Prioritário */}
              <Button
                variant={activeCat === 'divergent' ? 'contained' : 'outlined'}
                size="small"
                onClick={() => setActiveFamilyCategory('divergent')}
                sx={{
                  borderRadius: '999px',
                  textTransform: 'none',
                  fontWeight: 800,
                  fontSize: 12.5,
                  px: 2,
                  whiteSpace: 'nowrap',
                  bgcolor: activeCat === 'divergent' ? '#e11d48' : 'transparent',
                  color: activeCat === 'divergent' ? '#fff' : '#e11d48',
                  borderColor: activeCat === 'divergent' ? '#e11d48' : 'rgba(225, 29, 72, 0.3)',
                  '&:hover': {
                    bgcolor: activeCat === 'divergent' ? '#be123c' : 'rgba(225, 29, 72, 0.08)',
                  },
                }}
              >
                🚨 Apenas com Divergência ({divergentRows.length})
              </Button>

              {Object.entries(CATEGORY_MAP).map(([key, cat]) => {
                const count = categorizedRows[key]?.length || 0;
                if (count === 0) return null;
                const isSelected = activeCat === key;
                return (
                  <Button
                    key={key}
                    variant={isSelected ? 'contained' : 'text'}
                    size="small"
                    onClick={() => setActiveFamilyCategory(key)}
                    sx={{
                      borderRadius: '999px',
                      textTransform: 'none',
                      fontWeight: 700,
                      fontSize: 12.5,
                      px: 2,
                      whiteSpace: 'nowrap',
                      bgcolor: isSelected ? 'primary.main' : 'transparent',
                      color: isSelected ? '#fff' : 'text.secondary',
                    }}
                  >
                    {cat.icon} {cat.label} ({count})
                  </Button>
                );
              })}

              <Button
                variant={activeCat === 'all' ? 'contained' : 'text'}
                size="small"
                onClick={() => setActiveFamilyCategory('all')}
                sx={{
                  borderRadius: '999px',
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: 12.5,
                  px: 2,
                  whiteSpace: 'nowrap',
                  bgcolor: activeCat === 'all' ? 'primary.main' : 'transparent',
                  color: activeCat === 'all' ? '#fff' : 'text.secondary',
                }}
              >
                Todos ({cmp.length})
              </Button>
            </Stack>

            {/* MODO 1: CARDS DETALHADOS (DUAL-GAUGE INDIVIDUALIZADO) */}
            {viewMode === 'cards' && (
              <Stack spacing={2.5}>
                {currentRows.map((row) => {
                  const normUpper = (row.analyte || '').toUpperCase();
                  const fallback = FALLBACK_REFS[normUpper] || null;

                  // Membros com seus status e réguas individualizadas
                  const processedMembers = row.members.map((m: any, mIdx: number) => {
                    let num = m.valueNumeric != null ? Number(m.valueNumeric) : null;
                    if (num == null && m.value) {
                      const parsed = parseFloat(String(m.value).replace(',', '.').replace(/[^\d.]/g, ''));
                      if (!isNaN(parsed)) num = parsed;
                    }

                    // Limites individuais DESTE membro (sem herdar de outro membro de sexo diferente!)
                    const mRefLow = m.refLow != null ? Number(m.refLow) : fallback?.low ?? null;
                    const mRefHigh = m.refHigh != null ? Number(m.refHigh) : fallback?.high ?? null;

                    let minScale = 0;
                    let maxScale = 100;
                    let normalLeft = 25;
                    let normalWidth = 50;

                    if (mRefLow != null && mRefHigh != null && mRefHigh > mRefLow) {
                      const span = mRefHigh - mRefLow;
                      minScale = Math.max(0, mRefLow - span * 0.4);
                      maxScale = mRefHigh + span * 0.4;
                      if (num != null) {
                        if (num < minScale) minScale = Math.max(0, num - span * 0.1);
                        if (num > maxScale) maxScale = num + span * 0.1;
                      }
                      const totalSpan = maxScale - minScale || 1;
                      normalLeft = Math.max(0, Math.min(100, ((mRefLow - minScale) / totalSpan) * 100));
                      normalWidth = Math.max(6, Math.min(100 - normalLeft, ((mRefHigh - mRefLow) / totalSpan) * 100));
                    }

                    const totalSpan = maxScale - minScale || 1;
                    const posPct = num != null
                      ? Math.max(4, Math.min(96, ((num - minScale) / totalSpan) * 100))
                      : 50;

                    const isAbn = ['HIGH', 'LOW', 'ABNORMAL', 'CRITICAL'].includes(m.flag) ||
                      (mRefLow != null && num != null && num < mRefLow) ||
                      (mRefHigh != null && num != null && num > mRefHigh);

                    const pIdx = (data?.patients ?? []).findIndex(
                      (p) => String(p.id) === String(m.patientId) || (p.fullName && m.name && p.fullName.toLowerCase().includes(m.name.toLowerCase()))
                    );
                    const color = pIdx >= 0 ? MEMBER_COLORS[pIdx % MEMBER_COLORS.length] : MEMBER_COLORS[mIdx % MEMBER_COLORS.length];

                    return {
                      ...m,
                      numeric: num,
                      refLow: mRefLow,
                      refHigh: mRefHigh,
                      minScale,
                      maxScale,
                      normalLeft,
                      normalWidth,
                      posPct,
                      isAbn,
                      color,
                    };
                  });

                  const alteredMembers = processedMembers.filter((m: any) => m.isAbn);
                  const isBothAltered = alteredMembers.length >= 2;
                  const isSingleAltered = alteredMembers.length === 1;

                  return (
                    <Box
                      key={row.analyte}
                      sx={{
                        p: { xs: 2, sm: 2.5 },
                        borderRadius: '20px',
                        bgcolor: dark ? '#0a101d' : '#ffffff',
                        border: '1px solid',
                        borderColor: isBothAltered
                          ? 'rgba(239, 68, 68, 0.35)'
                          : isSingleAltered
                          ? 'rgba(245, 158, 11, 0.3)'
                          : dark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                        boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.3)' : '0 2px 10px rgba(15, 23, 42, 0.03)',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          borderColor: 'primary.main',
                          boxShadow: dark ? '0 6px 20px rgba(0,0,0,0.45)' : '0 6px 20px rgba(15, 23, 42, 0.06)',
                        },
                      }}
                    >
                      {/* Topo do Card do Analito */}
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
                        <Box>
                          <Typography sx={{ fontWeight: 800, fontSize: 15.5, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
                            {prettyName(row.analyte)}
                            {row.unit && (
                              <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary', fontFamily: 'monospace' }}>
                                · {row.unit}
                              </Typography>
                            )}
                          </Typography>
                        </Box>

                        {/* Badge de Status Familiar Consolidado */}
                        <Box>
                          {isBothAltered ? (
                            <Chip
                              size="small"
                              label="🚨 Ambos em Atenção"
                              sx={{
                                bgcolor: dark ? 'rgba(239, 68, 68, 0.18)' : '#FEF2F2',
                                color: dark ? '#fca5a5' : '#b91c1c',
                                fontWeight: 800,
                                fontSize: 12,
                                borderRadius: '999px',
                                border: '1px solid',
                                borderColor: dark ? 'rgba(239, 68, 68, 0.3)' : '#fecaca',
                              }}
                            />
                          ) : isSingleAltered ? (
                            <Chip
                              size="small"
                              label={`⚠️ ${(alteredMembers[0].name || '').split(' ')[0]} Fora da Meta`}
                              sx={{
                                bgcolor: dark ? 'rgba(245, 158, 11, 0.16)' : '#FFFBEB',
                                color: dark ? '#fcd34d' : '#b45309',
                                fontWeight: 800,
                                fontSize: 12,
                                borderRadius: '999px',
                                border: '1px solid',
                                borderColor: dark ? 'rgba(245, 158, 11, 0.3)' : '#fde68a',
                              }}
                            />
                          ) : (
                            <Chip
                              size="small"
                              label="✓ Família na Meta"
                              sx={{
                                bgcolor: dark ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5',
                                color: dark ? '#6ee7b7' : '#047857',
                                fontWeight: 800,
                                fontSize: 12,
                                borderRadius: '999px',
                                border: '1px solid',
                                borderColor: dark ? 'rgba(16, 185, 129, 0.3)' : '#a7f3d0',
                              }}
                            />
                          )}
                        </Box>
                      </Box>

                      {/* Lado a Lado dos Membros (Dual-Gauge ReUI) */}
                      <Grid container spacing={2}>
                        {processedMembers.map((m: any, mIdx: number) => {
                          const firstName = (m.name || '').split(' ')[0] || `Membro ${mIdx + 1}`;
                          return (
                            <Grid key={mIdx} size={{ xs: 12, md: 6 }}>
                              <Box
                                sx={{
                                  p: 2,
                                  borderRadius: '16px',
                                  bgcolor: dark ? 'rgba(255,255,255,0.02)' : '#f8fafc',
                                  border: '1px solid',
                                  borderColor: dark ? 'rgba(255,255,255,0.06)' : '#e2e8f0',
                                }}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Box
                                      sx={{
                                        width: 22,
                                        height: 22,
                                        borderRadius: '50%',
                                        bgcolor: m.color,
                                        color: '#ffffff',
                                        fontSize: 12,
                                        fontWeight: 800,
                                        display: 'grid',
                                        placeItems: 'center',
                                      }}
                                    >
                                      {firstName.charAt(0)}
                                    </Box>
                                    <Typography sx={{ fontWeight: 700, fontSize: 13, color: 'text.primary' }}>
                                      {firstName} {m.relationship ? `(${m.relationship})` : ''}
                                    </Typography>
                                  </Box>

                                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                                    <Typography
                                      sx={{
                                        fontWeight: 800,
                                        fontSize: 15.5,
                                        fontFamily: 'monospace',
                                        color: m.isAbn ? (dark ? '#f87171' : '#dc2626') : (dark ? '#34d399' : '#059669'),
                                      }}
                                    >
                                      {m.value} {row.unit || ''}
                                    </Typography>
                                    <Chip
                                      size="small"
                                      label={m.isAbn ? (m.flag === 'LOW' ? 'Baixo' : 'Elevado') : 'Na Meta'}
                                      sx={{
                                        height: 20,
                                        fontSize: 12,
                                        fontWeight: 800,
                                        bgcolor: m.isAbn ? 'rgba(239, 68, 68, 0.14)' : 'rgba(16, 185, 129, 0.14)',
                                        color: m.isAbn ? '#dc2626' : '#059669',
                                      }}
                                    />
                                  </Box>
                                </Box>

                                {/* Barra de Referência Individualizada */}
                                <Box sx={{ position: 'relative', height: 8, bgcolor: dark ? '#1e293b' : '#e2e8f0', borderRadius: '999px', my: 1.5 }}>
                                  <Box
                                    sx={{
                                      position: 'absolute',
                                      left: `${m.normalLeft}%`,
                                      width: `${m.normalWidth}%`,
                                      top: 0,
                                      bottom: 0,
                                      bgcolor: 'rgba(16, 185, 129, 0.35)',
                                      borderRadius: '999px',
                                    }}
                                  />
                                  <Box
                                    sx={{
                                      position: 'absolute',
                                      left: `${m.posPct}%`,
                                      top: '50%',
                                      transform: 'translate(-50%, -50%)',
                                      width: 14,
                                      height: 14,
                                      borderRadius: '50%',
                                      bgcolor: m.isAbn ? '#ef4444' : m.color,
                                      border: '2px solid #ffffff',
                                      boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                                    }}
                                  />
                                </Box>

                                {/* Labels de Metas Individuais */}
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'text.secondary', fontFamily: 'monospace' }}>
                                  <span>{m.refLow != null ? `Min: ${m.refLow}` : '—'}</span>
                                  <span style={{ color: '#059669', fontWeight: 700 }}>
                                    {m.refLow != null && m.refHigh != null ? `Meta: ${m.refLow} a ${m.refHigh}` : 'Faixa de Referência'}
                                  </span>
                                  <span>{m.refHigh != null ? `Max: ${m.refHigh}` : '—'}</span>
                                </Box>
                              </Box>
                            </Grid>
                          );
                        })}
                      </Grid>

                      {/* Insight Clínico Familiar Automatizado */}
                      <Box
                        sx={{
                          mt: 2,
                          p: 1.25,
                          borderRadius: '10px',
                          bgcolor: isBothAltered
                            ? (dark ? 'rgba(239, 68, 68, 0.08)' : '#fff1f2')
                            : (dark ? 'rgba(13, 148, 136, 0.08)' : '#f0fdfa'),
                          border: '1px solid',
                          borderColor: isBothAltered
                            ? (dark ? 'rgba(239, 68, 68, 0.2)' : '#ffe4e6')
                            : (dark ? 'rgba(13, 148, 136, 0.2)' : '#ccfbf1'),
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                        }}
                      >
                        <Typography sx={{ fontSize: 14 }}>{isBothAltered ? '🚨' : isSingleAltered ? '💡' : '✓'}</Typography>
                        <Typography variant="caption" sx={{ color: isBothAltered ? '#be123c' : 'text.secondary', fontWeight: 600 }}>
                          {isBothAltered
                            ? 'Atenção mútua da família: ambos os membros estão fora da meta. Indicado conversar com o médico sobre conduta conjunta.'
                            : isSingleAltered
                            ? `Divergência metabólica pontual em ${(alteredMembers[0].name || '').split(' ')[0]}. O restante da família permanece estável.`
                            : 'Parâmetro perfeitamente alinhado e equilibrado na rotina de ambos.'}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            )}

            {/* MODO 2: MATRIZ EXECUTIVA REUI (TABELA CLÍNICA) */}
            {viewMode === 'table' && (
              <Box
                sx={{
                  overflowX: 'auto',
                  borderRadius: '16px',
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: dark ? '#0a101d' : '#ffffff',
                }}
              >
                <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                  <Box component="thead" sx={{ bgcolor: dark ? 'rgba(255,255,255,0.03)' : '#f8fafc', borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Box component="tr">
                      <Box component="th" sx={{ p: 1.75, fontWeight: 800, fontSize: 12, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Marcador Clínico
                      </Box>
                      {data?.patients?.map((p) => (
                        <Box key={p.id} component="th" sx={{ p: 1.75, fontWeight: 800, fontSize: 12, color: 'text.primary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {p.fullName.split(' ')[0]} {p.relationship ? `(${p.relationship})` : ''}
                        </Box>
                      ))}
                      <Box component="th" sx={{ p: 1.75, fontWeight: 800, fontSize: 12, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Diagnóstico Familiar
                      </Box>
                    </Box>
                  </Box>
                  <Box component="tbody">
                    {currentRows.map((row, rIdx) => {
                      const altered = row.members.filter((m: any) => ['HIGH', 'LOW', 'ABNORMAL', 'CRITICAL'].includes(m.flag));
                      const isBoth = altered.length >= 2;
                      const isOne = altered.length === 1;

                      return (
                        <Box
                          key={rIdx}
                          component="tr"
                          sx={{
                            borderBottom: '1px solid',
                            borderColor: dark ? 'rgba(255,255,255,0.04)' : '#f1f5f9',
                            '&:hover': { bgcolor: dark ? 'rgba(255,255,255,0.02)' : '#f8fafc' },
                          }}
                        >
                          <Box component="td" sx={{ p: 1.75, fontWeight: 700, color: 'text.primary' }}>
                            <div>{prettyName(row.analyte)}</div>
                            <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>
                              {row.unit ? `Unidade: ${row.unit}` : ''}
                            </div>
                          </Box>

                          {data?.patients?.map((p) => {
                            const m = row.members.find((rm: any) => String(rm.patientId) === String(p.id) || (p.fullName && rm.name && p.fullName.toLowerCase().includes(rm.name.toLowerCase())));
                            if (!m) {
                              return (
                                <Box key={p.id} component="td" sx={{ p: 1.75, color: 'text.secondary', fontStyle: 'italic', fontSize: 12 }}>
                                  —
                                </Box>
                              );
                            }
                            const isAbn = ['HIGH', 'LOW', 'ABNORMAL', 'CRITICAL'].includes(m.flag);
                            return (
                              <Box key={p.id} component="td" sx={{ p: 1.75, fontFamily: 'monospace' }}>
                                <Chip
                                  size="small"
                                  label={`${m.value} ${isAbn ? (m.flag === 'LOW' ? '↓' : '↑') : '✓'}`}
                                  sx={{
                                    fontWeight: 800,
                                    fontSize: 12,
                                    bgcolor: isAbn ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                                    color: isAbn ? '#dc2626' : '#059669',
                                    border: '1px solid',
                                    borderColor: isAbn ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.25)',
                                  }}
                                />
                                {m.refLow != null && m.refHigh != null && (
                                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
                                    Ref: {m.refLow}-{m.refHigh}
                                  </div>
                                )}
                              </Box>
                            );
                          })}

                          <Box component="td" sx={{ p: 1.75, fontSize: 12 }}>
                            {isBoth ? (
                              <Chip size="small" label="🚨 Ambos Fora da Meta" sx={{ bgcolor: '#FEF2F2', color: '#b91c1c', fontWeight: 800, fontSize: 12 }} />
                            ) : isOne ? (
                              <Chip size="small" label={`⚠️ ${(altered[0].name || '').split(' ')[0]} Fora`} sx={{ bgcolor: '#FFFBEB', color: '#b45309', fontWeight: 800, fontSize: 12 }} />
                            ) : (
                              <Chip size="small" label="✓ Normal em Ambos" sx={{ bgcolor: '#ECFDF5', color: '#047857', fontWeight: 800, fontSize: 12 }} />
                            )}
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              </Box>
            )}

            {/* Banner de Síntese Clínica Familiar */}
            <Box
              sx={{
                mt: 3.5,
                p: { xs: 2, sm: 2.5 },
                borderRadius: '16px',
                bgcolor: dark ? 'rgba(15, 118, 110, 0.12)' : '#f0fdf4',
                border: '1px solid',
                borderColor: dark ? 'rgba(15, 118, 110, 0.3)' : '#bbf7d0',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 2,
              }}
            >
              <Typography sx={{ fontSize: 26, lineHeight: 1 }}>🧠</Typography>
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: 14.5, color: dark ? '#6ee7b7' : '#065f46' }}>
                  Diagnóstico Clínico Cruzado da Família: {alignmentPct}% de Alinhamento Saudável
                </Typography>
                <Typography variant="body2" sx={{ color: dark ? '#a7f3d0' : '#047857', mt: 0.5, lineHeight: 1.55 }}>
                  Dos {totalItems} biomarcadores avaliados em conjunto, {normalCount} estão devidamente calibrados dentro da faixa ideal.
                  {divergentItems.length > 0 ? (
                    <>
                      {' '}Recomenda-se atenção pontual para{' '}
                      <strong>
                        {divergentItems[0].analyte} de {divergentItems[0].memberName} ({divergentItems[0].value})
                      </strong>
                      {divergentItems.length > 1 ? ` e mais ${plural(divergentItems.length - 1, 'marcador')}` : ''}.
                    </>
                  ) : (
                    ' Todos os parâmetros comparados encontram-se em excelente estabilidade clínica para todos os membros!'
                  )}
                </Typography>
              </Box>
            </Box>
          </Card>
        );
      })()}


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
