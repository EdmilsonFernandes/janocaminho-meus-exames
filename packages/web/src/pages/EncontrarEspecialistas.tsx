import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Autocomplete, Avatar, Box, Button, Card, CardContent, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import TravelExploreRoundedIcon from '@mui/icons-material/TravelExploreRounded';
import AddTaskRoundedIcon from '@mui/icons-material/AddTaskRounded';
import BookmarkAddedRoundedIcon from '@mui/icons-material/BookmarkAddedRounded';
import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded';
import { useNotify } from 'react-admin';
import { API_URL, token, doctorPhotoUrl } from '../config';
import { useSelectedPatient } from '../patient-context';
import { UFS } from '../utils/medicalData';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { ListSkeleton } from '../components/Skeleton';
import { hapticLight, hapticSuccess } from '../utils/haptic';
import { INSURANCE_OPERATOR_NAMES, SPECIALTIES } from '../utils/medicalData';
import { tealText } from '../theme';
import { EmptySearchLoosensFilters } from '../components/EmptySearchLoosensFilters';
import type { LooseFilterOption } from '../components/EmptySearchLoosensFilters';
import type { SpecialistItem } from '../types/consultations';

// §3 "Encontrar especialistas" (28/10/26): busca no DIRETÓRIO PRÓPRIO do Dr. Exame —
// 100% desenvolvimento nosso (nenhum provedor pago, sem scraping; decisão do dono).
// Padrão de UX inspirado em grandes apps de saúde (Amil, SulAmérica, Fleury):
//  - Busca fluida com filtros rápidos em pílulas deslizantes;
//  - Cards limpos com foto, badges semânticos e identificação clara de fontes;
//  - Vínculo direto ao paciente selecionado (useSelectedPatient).

export const EncontrarEspecialistasPage = () => {
  const navigate = useNavigate();
  const notify = useNotify();
  const [pid] = useSelectedPatient();
  const [q, setQ] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [city, setCity] = useState('');
  const [operator, setOperator] = useState('');
  const [withPrice, setWithPrice] = useState(false);
  const [claimedOnly, setClaimedOnly] = useState(false);

  const [items, setItems] = useState<SpecialistItem[]>([]);
  const [total, setTotal] = useState(0);
  // Facets: cidades que JÁ têm médicos no diretório (chips clicáveis)
  const [cities, setCities] = useState<{ city: string; count: number }[]>([]);
  const [cityNote, setCityNote] = useState<string | null>(null);
  // Combo IBGE (5.571 municípios, vendored): carregado SOB DEMANDA
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  useEffect(() => { void import('../utils/brazilCities').then((m) => setCityOptions(m.BRAZIL_CITIES)).catch(() => {}); }, []);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (specialty) params.set('specialty', specialty);
      if (city.trim()) params.set('city', city.trim());
      if (operator) params.set('operator', operator);
      if (withPrice) params.set('withPrice', 'true');
      if (claimedOnly) params.set('claimedOnly', 'true');
      const r = await fetch(`${API_URL}/specialists?${params}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setItems(d.items ?? []);
      setTotal(d.total ?? 0);
      setCities(d.cities ?? []);
      setCityNote(d.cityNote ?? null);
    } catch {
      setError('A busca não retornou resultados no momento. Verifique sua conexão ou tente outros filtros.');
      setItems([]);
    } finally { setLoading(false); setSearched(true); }
  };

  // Primeira carga automática
  useEffect(() => { void doSearch(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Busca com debounce enquanto digita
  useEffect(() => {
    if (!searched) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void doSearch(); }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, specialty, city, operator, withPrice, claimedOnly]);

  // Médicos já salvos pelo paciente atual
  const refreshSaved = () => {
    fetch(`${API_URL}/my-doctors`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((d) => setSavedIds(new Set((d.items ?? []).map((i: any) => i.doctor?.id).filter(Boolean))))
      .catch(() => {});
  };
  useEffect(() => { refreshSaved(); }, [pid]);

  // ── Salvar CNES direto (Conselho 10 = Medicina com CRM)
  const salvarCnesDireto = async (s: any) => {
    hapticLight();
    try {
      const r = await fetch(`${API_URL}/my-doctors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          patientId: pid,
          doctorCrm: String(s.crm).replace(/\D/g, ''), doctorUf: s.crmUf,
          doctorName: s.name,
          doctorSpecialty: s.specialty?.replace(/^Médic[oa]\s*/i, '') ?? undefined,
          clinicCity: s.clinicCity?.split(' - ')[0],
          clinicName: s.clinicName,
          source: 'search',
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha ao salvar');
      hapticSuccess();
      refreshSaved();
      notify(`Dr(a). ${String(s.name).split(' ')[0]} salvo em Meus Médicos com sucesso!`, { type: 'success' });
    } catch (e: any) { notify(e.message || 'Falha ao salvar', { type: 'error' }); }
  };

  const [cnesFor, setCnesFor] = useState<any | null>(null);
  const [cnesCrm, setCnesCrm] = useState('');
  const [cnesUf, setCnesUf] = useState('');
  const [cnesSaving, setCnesSaving] = useState(false);
  const salvarCnesComCrm = async () => {
    if (!cnesFor || !cnesCrm.replace(/\D/g, '') || cnesUf.length !== 2) {
      notify('Informe CRM e UF para salvar com o cadastro oficial.', { type: 'warning' });
      return;
    }
    setCnesSaving(true);
    try {
      const r = await fetch(`${API_URL}/my-doctors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          patientId: pid,
          doctorCrm: cnesCrm.replace(/\D/g, ''), doctorUf: cnesUf,
          doctorName: cnesFor.name,
          doctorSpecialty: cnesFor.specialty?.replace(/^Médic[oa]\s*/i, '') ?? undefined,
          clinicCity: cnesFor.clinicCity?.split(' - ')[0],
          clinicName: cnesFor.clinicName,
          source: 'search',
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha ao salvar');
      hapticSuccess();
      refreshSaved();
      notify(`Dr(a). ${String(cnesFor.name).split(' ')[0]} salvo em Meus Médicos!`, { type: 'success' });
      setCnesFor(null); setCnesCrm(''); setCnesUf('');
    } catch (e: any) { notify(e.message || 'Falha ao salvar', { type: 'error' }); }
    finally { setCnesSaving(false); }
  };

  const salvar = async (s: SpecialistItem) => {
    hapticLight();
    try {
      const r = await fetch(`${API_URL}/my-doctors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ doctorId: s.id, source: 'search', patientId: pid }),
      });
      if (!r.ok) throw new Error();
      hapticSuccess();
      setSavedIds((p) => new Set(p).add(s.id));
      refreshSaved();
      notify(`Dr(a). ${s.name.split(' ')[0]} salvo em Meus Médicos. Você pode compartilhar exames quando quiser.`, { type: 'success' });
    } catch { notify('Não foi possível salvar o médico. Tente novamente.', { type: 'error' }); }
  };

  // ── Empty search que afrouxa filtros (Lucian UX/UI #092): com 0 resultados e filtros
  // ativos, oferecemos remover cada filtro com a contagem que a remoção traria. As
  // contagens vêm SÓ do payload atual de /api/specialists — `cities` é facet do
  // diretório INTEIRO (não filtrada pela busca): cidade ativa ⇒ soma das counts das
  // OUTRAS cidades (o que a busca sem cidade alcançaria); especialidade ativa ⇒ soma
  // de todas as counts, oferecida apenas quando a especialidade é o ÚNICO filtro duro
  // (senão o número não seria honesto).
  const cityNorm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const stripUf = (s: string) => s.replace(/\s*\([A-Za-z]{2}\)\s*$/, '').trim();
  const activeCityNorm = city.trim() ? cityNorm(stripUf(city)) : '';
  const looseFilters: LooseFilterOption[] = [];
  if (searched && !loading && !error && items.length === 0) {
    if (activeCityNorm) {
      // Espelha o filtro do server: facet cujo nome CONTÉM a cidade buscada conta
      // como "a mesma cidade" — as demais são o que aparece sem o filtro.
      const n = cities.filter((c) => !cityNorm(c.city).includes(activeCityNorm)).reduce((s, c) => s + c.count, 0);
      if (n > 0) looseFilters.push({ label: stripUf(city), count: n, onRemove: () => setCity('') });
    }
    const onlySpecialty = !!specialty && !q.trim() && !activeCityNorm && !operator && !withPrice && !claimedOnly;
    if (onlySpecialty) {
      const n = cities.reduce((s, c) => s + c.count, 0);
      if (n > 0) looseFilters.push({ label: specialty, count: n, onRemove: () => setSpecialty('') });
    }
    looseFilters.sort((a, b) => b.count - a.count);
  }

  return (
    <PageContainer width="content" sx={{ pb: { xs: 12, sm: 5 } }}>
      <PageHeader
        icon={<TravelExploreRoundedIcon />}
        title="Encontrar especialistas"
        subtitle="Busca no diretório do Dr. Exame — médicos com portal ativo e cadastros feitos por pacientes."
      />

      {/* BARRA DE BUSCA E FILTROS RÁPIDOS — Padrão Amil / SulAmérica */}
      <Card sx={{
        borderRadius: '24px',
        border: '1px solid',
        borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(15,95,90,0.15)',
        boxShadow: (t) => t.palette.mode === 'dark' ? '0 8px 28px rgba(0,0,0,0.4)' : '0 8px 24px rgba(15,95,90,0.06)',
        mb: 3,
        overflow: 'hidden',
      }}>
        <CardContent sx={{ p: { xs: 2, sm: 2.75 } }}>
          <Stack spacing={2}>
            {/* Campo de Busca Amplo com Lupa e Limpar */}
            <TextField
              placeholder="Buscar por nome do médico, clínica ou especialidade..."
              inputProps={{ 'aria-label': 'Buscar especialista' }}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              fullWidth
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ fontSize: 22, color: '#0f766e', ml: 0.5 }} />
                    </InputAdornment>
                  ),
                  endAdornment: q ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setQ('')} aria-label="Limpar busca">
                        <CloseRoundedIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                  sx: {
                    borderRadius: '16px',
                    fontSize: 15,
                    bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f8fafc',
                    py: 0.5,
                  },
                },
              }}
            />

            {/* Linha de Seleção: Especialidade e Cidade (IBGE) */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="stretch">
              <TextField
                select
                label="Especialidade Médica"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                size="small"
                fullWidth
                sx={{
                  flex: { xs: '1 1 auto', sm: '1 1 180px' },
                  '& .MuiOutlinedInput-root': { borderRadius: '12px' },
                }}
              >
                <MenuItem value=""><em>Todas as especialidades</em></MenuItem>
                {SPECIALTIES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>

              <Autocomplete
                freeSolo
                autoComplete
                options={cityOptions}
                value={city}
                onChange={(_, newValue) => {
                  const val = typeof newValue === 'string' ? newValue.replace(/\s*\([A-Za-z]{2}\)\s*$/, '').trim() : '';
                  setCity(val);
                }}
                inputValue={city}
                onInputChange={(_, newInputValue, reason) => {
                  if (reason === 'input' || reason === 'clear') {
                    setCity(newInputValue.replace(/\s*\([A-Za-z]{2}\)\s*$/, ''));
                  }
                }}
                fullWidth
                sx={{
                  flex: { xs: '1 1 auto', sm: '1 1 220px' },
                  '& .MuiOutlinedInput-root': { borderRadius: '12px' },
                }}
                renderInput={(p) => (
                  <TextField
                    {...p}
                    label="Cidade (perto de você)"
                    size="small"
                    placeholder="Ex.: São Paulo, Rio, Campinas..."
                    InputProps={{
                      ...p.InputProps,
                      startAdornment: (
                        <InputAdornment position="start">
                          <LocationOnOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                        </InputAdornment>
                      ),
                    }}
                  />
                )}
                noOptionsText="Cidade não encontrada — pode digitar livremente"
              />

              <TextField
                select
                label="Convênio aceito"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                size="small"
                fullWidth
                sx={{
                  flex: { xs: '1 1 auto', sm: '1 1 180px' },
                  '& .MuiOutlinedInput-root': { borderRadius: '12px' },
                }}
              >
                <MenuItem value=""><em>Qualquer convênio</em></MenuItem>
                {INSURANCE_OPERATOR_NAMES.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
              </TextField>
            </Stack>

            {/* Pílulas de Filtro Rápido (Estilo Amil / SulAmérica) */}
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
              <FilterChip
                label="🎥 Teleconsulta online"
                active={claimedOnly}
                onClick={() => setClaimedOnly((v) => !v)}
              />
              <FilterChip
                label="💳 Preço particular informado"
                active={withPrice}
                onClick={() => setWithPrice((v) => !v)}
              />
              {city && (
                <Chip
                  size="small"
                  clickable
                  label={`📍 ${city} ✕`}
                  onClick={() => setCity('')}
                  sx={{
                    height: 32,
                    fontWeight: 700,
                    fontSize: 12,
                    borderRadius: '999px',
                    bgcolor: 'rgba(239,68,68,0.08)',
                    color: '#b91c1c',
                    border: '1px solid rgba(239,68,68,0.25)',
                  }}
                />
              )}
            </Stack>

            {/* Cidades com médicos cadastrados */}
            {cities.length > 0 && !city && (
              <Box sx={{ pt: 0.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.75 }}>
                  Cidades mais buscadas:
                </Typography>
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                  {cities.slice(0, 8).map((c) => (
                    <Chip
                      key={c.city}
                      size="small"
                      clickable
                      label={`${c.city} (${c.count})`}
                      onClick={() => setCity(c.city)}
                      sx={{
                        height: 26,
                        fontSize: 11.5,
                        fontWeight: 700,
                        borderRadius: '999px',
                        bgcolor: 'rgba(0,0,0,0.04)',
                        '&:hover': { bgcolor: 'rgba(15,118,110,0.1)', color: '#0f766e' },
                      }}
                    />
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* ESTADOS: carregando / erro / vazio */}
      {loading && <ListSkeleton count={4} />}

      {!loading && error && (
        <Alert severity="error" sx={{ borderRadius: '12px', mb: 2 }}>{error}</Alert>
      )}

      {!loading && !error && searched && items.length === 0 && (
        <Card variant="outlined" sx={{ borderRadius: '20px', borderStyle: 'dashed', py: 4, px: { xs: 1.5, sm: 3 }, mb: 2 }}>
          <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
            <EmptySearchLoosensFilters
              query={q.trim()}
              note={looseFilters.length > 0
                ? 'Remova um filtro pra ver o que já temos no diretório.'
                : (cityNote ?? 'Nosso diretório ainda está crescendo. Tente só a especialidade sem cidade, ou cadastre seu médico manualmente — com CRM ele entra na busca pra todo mundo.')}
              options={looseFilters}
              actions={[
                { label: 'Cadastrar em Meus médicos', onClick: () => navigate('/medicos'), primary: true },
                ...((q.trim() || specialty || city.trim() || operator || withPrice || claimedOnly)
                  ? [{
                      label: 'Limpar filtros',
                      onClick: () => {
                        setQ(''); setSpecialty(''); setCity(''); setOperator('');
                        setWithPrice(false); setClaimedOnly(false);
                      },
                    }]
                  : []),
              ]}
            />
          </CardContent>
        </Card>
      )}

      {/* RESULTADOS */}
      {!loading && items.length > 0 && (
        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 800, fontSize: 13.5 }}>
            {items.length} {items.length === 1 ? 'especialista encontrado' : 'especialistas encontrados'}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 12 }}>
            Ordenados por perfil verificado e dados confirmados
          </Typography>
        </Box>
      )}

      {/* Grid Responsivo: 1 coluna no mobile, 2 colunas no desktop (estilo Amil / SulAmérica) */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
        gap: 2,
        alignItems: 'stretch',
      }}>
        {!loading && items.map((s: any) => {
          // ── Card CNES (catálogo oficial): sem CRM — salvar pede o CRM, registra consulta
          // com nome livre. Visual distinto (borda tracejada + badge oficial) pra nunca
          // confundir com médico do diretório do produto.
          if (s.origin === 'cnes') {
            return (
              <Card key={s.id} sx={{
                borderRadius: '20px', border: '1.5px dashed', borderColor: 'rgba(32,178,170,0.5)',
                bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(32,178,170,0.05)' : 'rgba(240,253,250,0.6)',
                display: 'flex', flexDirection: 'column', height: '100%',
              }}>
                <CardContent sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <Stack direction="row" spacing={1.75} alignItems="flex-start" sx={{ flex: 1 }}>
                    <Avatar sx={{ width: 48, height: 48, fontSize: 20, bgcolor: 'rgba(15,95,90,0.15)', color: '#0f766e', flexShrink: 0 }}>🩺</Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: 15, fontFamily: '"Poppins",sans-serif', color: 'text.primary' }}>
                          {s.name}
                        </Typography>
                        <Chip size="small" label="Catálogo Oficial CNES" sx={{ height: 22, fontSize: 10.5, fontWeight: 800, bgcolor: 'rgba(15,95,90,0.12)', color: '#0f766e', borderRadius: '6px' }} />
                      </Stack>

                      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
                        {s.crm && (
                          <Chip size="small" label={`CRM ${String(s.crm).replace(/\D/g, '')}-${s.crmUf ?? ''}`} sx={{ height: 20, fontSize: 11, fontWeight: 700, fontFamily: 'monospace', bgcolor: 'rgba(15,95,90,0.08)', color: '#0f5f5a', borderRadius: '4px' }} />
                        )}
                        {s.specialty && (
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                            {s.specialty}
                          </Typography>
                        )}
                      </Stack>

                      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}>
                        📍 {s.clinicName} • {s.clinicCity}
                      </Typography>
                      {s.address && (
                        <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled' }}>{s.address}</Typography>
                      )}
                      <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: 'text.disabled', fontSize: 10.5 }}>
                        🏛️ {s.provenance.label}
                      </Typography>
                    </Box>
                  </Stack>

                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 2, pt: 1.5, borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                    {s.crm ? (
                      <Button size="small" variant="contained" onClick={() => void salvarCnesDireto(s)}
                        sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, minHeight: 38, fontSize: 12.5, bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}>
                        Salvar em Meus médicos
                      </Button>
                    ) : (
                      <Button size="small" variant="contained" onClick={() => { hapticLight(); setCnesFor(s); }}
                        sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, minHeight: 38, fontSize: 12.5, bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}>
                        Salvar com CRM
                      </Button>
                    )}
                    {s.crm && s.phone && (
                      <Button
                        size="small" variant="outlined" component="a" target="_blank" rel="noopener"
                        href={`https://wa.me/55${String(s.phone).replace(/\D/g, '')}?text=${encodeURIComponent(conviteMedicoMsg(s))}`}
                        sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, minHeight: 38, fontSize: 12.5, color: '#059669', borderColor: 'rgba(5,150,105,0.4)' }}
                      >
                        💬 WhatsApp
                      </Button>
                    )}
                    <Button size="small" variant="outlined"
                      onClick={() => navigate('/consultas', { state: { tab: 'minhas', prefillDoctor: { doctorName: s.name, specialty: (s.specialty ?? '').replace(/^Médic[oa]\s*/i, '') } } })}
                      sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, minHeight: 38, fontSize: 12.5, borderColor: '#0f766e', color: '#0f766e' }}>
                      + Anotar consulta
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            );
          }
          const salvo = savedIds.has(s.id);
          return (
            <Card key={s.id} sx={{
              borderRadius: '20px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper',
              boxShadow: '0 4px 16px rgba(0,0,0,0.03)', overflow: 'hidden',
              transition: 'all .2s ease',
              display: 'flex', flexDirection: 'column', height: '100%',
              '&:hover': { borderColor: '#178f89', boxShadow: '0 8px 24px rgba(15,95,90,0.12)', transform: 'translateY(-2px)' },
            }}>
              <CardContent sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Stack direction="row" spacing={1.75} alignItems="flex-start" sx={{ flex: 1 }}>
                  <Avatar
                    src={s.photoUrl ? doctorPhotoUrl(s.id) : undefined} /* sem foto → sem request 404 */
                    sx={{
                      width: 56,
                      height: 56,
                      fontWeight: 800,
                      fontSize: 22,
                      background: 'linear-gradient(135deg, #093f3c 0%, #0f766e 55%, #14b8a6 100%)',
                      color: '#ffffff',
                      flexShrink: 0,
                      border: '2.5px solid rgba(255,255,255,0.9)',
                      boxShadow: '0 6px 18px rgba(15,118,110,0.22)',
                    }}
                  >
                    🩺
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {/* Linha do Nome e Selo Atende no Dr. Exame */}
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
                      <Typography sx={{ fontWeight: 800, fontSize: 16, fontFamily: '"Poppins",sans-serif', color: 'text.primary' }}>
                        {s.name}
                      </Typography>
                      {s.claimed && (
                        <Chip
                          icon={<VerifiedRoundedIcon sx={{ fontSize: '14px !important', color: '#0f766e' }} />}
                          label="Atende no Dr. Exame"
                          size="small"
                          sx={{
                            bgcolor: 'rgba(15,118,110,0.09)',
                            color: '#0f766e',
                            fontWeight: 800,
                            fontSize: 11,
                            height: 24,
                            borderRadius: '6px',
                            border: '1px solid rgba(15,118,110,0.25)',
                            '& .MuiChip-icon': { color: '#0f766e' },
                          }}
                        />
                      )}
                    </Stack>

                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.75 }}>
                      {s.specialty && <Chip size="small" label={s.specialty} sx={{ height: 22, fontSize: 11.5, fontWeight: 700, bgcolor: 'rgba(32,178,170,0.15)', color: (t) => tealText(t.palette.mode) }} />}
                      <Chip size="small" label={`CRM ${s.crm}`} sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(0,0,0,0.05)', color: 'text.secondary', borderRadius: '4px' }} />
                    </Stack>

                    {(s.clinicName || s.clinicCity) && (
                      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontSize: 12 }}>
                        📍 {[s.clinicName, s.clinicCity].filter(Boolean).join(' • ')}
                      </Typography>
                    )}
                    {s.consultPriceCents != null && (
                      <Typography variant="caption" sx={{ display: 'block', color: '#0f766e', fontWeight: 800, fontSize: 12.5, mt: 0.5 }}>
                        💳 Teleconsulta particular: R$ {(s.consultPriceCents / 100).toFixed(2).replace('.', ',')}
                      </Typography>
                    )}

                    {/* Convênios informados */}
                    <Box sx={{ mt: 0.75 }}>
                      {s.insurances.length > 0 ? (
                        <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                          {s.insurances.slice(0, 4).map((ins: any, idx: number) => (
                            <Chip key={idx} size="small"
                              label={`${ins.operator}${ins.plan ? ` • ${ins.plan}` : ''}${ins.verificationStatus === 'confirmed' ? ' ✓' : ''}`}
                              title={ins.verificationLabel}
                              sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: ins.verificationStatus === 'confirmed' ? 'rgba(16,185,129,0.12)' : 'rgba(0,0,0,0.04)', color: ins.verificationStatus === 'confirmed' ? '#065f46' : 'text.secondary' }}
                            />
                          ))}
                        </Stack>
                      ) : (
                        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 11 }}>
                          🏥 Convênios não informados — confirme com o consultório
                        </Typography>
                      )}
                    </Box>

                    {/* Informação de procedência */}
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: 'text.disabled', fontSize: 10.5 }}>
                      {s.claimed ? '✓ ' : 'ℹ️ '}{s.provenance.label}
                    </Typography>
                  </Box>
                </Stack>

                {/* AÇÕES NA BASE DO CARD */}
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 2, pt: 1.5, borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                  <Button
                    size="small" variant={salvo ? 'outlined' : 'contained'} disabled={salvo}
                    startIcon={salvo ? <BookmarkAddedRoundedIcon /> : <BookmarkAddOutlinedIcon />}
                    onClick={() => void salvar(s)}
                    sx={{
                      borderRadius: '999px', textTransform: 'none', fontWeight: 800, minHeight: 38, fontSize: 12.5,
                      ...(salvo ? { color: '#0f766e', borderColor: 'rgba(32,178,170,0.5)', bgcolor: 'rgba(32,178,170,0.06)' } : { bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } })
                    }}
                  >
                    {salvo ? 'Salvo em Meus médicos ✓' : '+ Salvar em Meus médicos'}
                  </Button>
                  <Button
                    size="small" variant="outlined" startIcon={<AddTaskRoundedIcon />}
                    onClick={() => navigate('/consultas', { state: { prefillDoctor: { doctorId: s.id, doctorName: s.name, specialty: s.specialty ?? '' }, tab: 'minhas' } })}
                    sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, minHeight: 38, fontSize: 12.5, borderColor: '#0f766e', color: '#0f766e', '&:hover': { bgcolor: 'rgba(15,118,110,0.06)' } }}
                  >
                    + Anotar consulta
                  </Button>
                  {s.phone && (
                    <Button size="small" component="a" href={`https://wa.me/${s.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener"
                      sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, minHeight: 38, fontSize: 12.5, color: '#059669', borderColor: 'rgba(5,150,105,0.4)' }} variant="outlined">
                      💬 WhatsApp
                    </Button>
                  )}
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Box>

      {!loading && items.length > 0 && (
        <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 2.5, color: 'text.disabled' }}>
          Diretório do Dr. Exame (médicos com portal ou cadastrados por pacientes com CRM) + catálogo oficial CNES/DATASUS.
          Sabendo o CRM do seu médico, salve ele — isso ajuda o próximo paciente a achar.
        </Typography>
      )}

      {/* Dialog: salvar achado do CNES com o CRM (o catálogo oficial não lista CRM) */}
      <Dialog open={!!cnesFor} onClose={() => setCnesFor(null)} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogTitle sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 16, pb: 0.5 }}>
          Salvar {cnesFor?.name?.split(' ')[0]} com o CRM
        </DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            {cnesFor?.clinicName} • {cnesFor?.clinicCity}. O catálogo oficial não traz o CRM — se você sabe,
            ele entra no diretório com o cadastro certinho (sem acesso aos seus exames).
          </Typography>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <TextField
              label="CRM (número)" required value={cnesCrm}
              onChange={(e) => setCnesCrm(e.target.value.replace(/[^\d]/g, ''))}
              size="small" sx={{ flex: '1 1 120px' }} inputProps={{ inputMode: 'numeric' }}
            />
            <TextField select label="UF" required value={cnesUf} onChange={(e) => setCnesUf(e.target.value)} size="small" sx={{ width: 100 }}>
              <MenuItem value=""><em>—</em></MenuItem>
              {UFS.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setCnesFor(null)} sx={{ textTransform: 'none', fontWeight: 700 }}>Cancelar</Button>
          <Button variant="contained" onClick={() => void salvarCnesComCrm()} disabled={cnesSaving}
            sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: 3 }}>
            {cnesSaving ? <CircularProgress size={20} color="inherit" /> : 'Salvar médico'}
          </Button>
        </DialogActions>
      </Dialog>

      {loading && <Box sx={{ display: 'none' }}><CircularProgress size={20} /></Box>}
    </PageContainer>
  );
};

/** Mensagem de convite ao médico achado na busca (aquisição: "te encontrei no Dr.
 *  Exame" com CRM pré-validado no link → cadastro nasce cruzado com o diretório). */
const conviteMedicoMsg = (s: any) => {
  const crmUf = `${String(s.crm).replace(/\D/g, '')}-${s.crmUf ?? ''}`;
  const link = `${window.location.href.split('#')[0]}#/para-medicos?crm=${encodeURIComponent(crmUf)}&nome=${encodeURIComponent(s.name ?? '')}`;
  return `Olá! Te encontrei no Dr. Exame (app que organiza exames com IA) buscando por ${s.specialty || 'médico'} em ${s.clinicCity ?? 'minha cidade'}.\n\nOrganizo meus exames lá e queria compartilhar com você pelo portal médico gratuito — brief pré-consulta, exames organizados e teleconsulta com PIX.\n\nSeu CRM ${crmUf} já está pré-validado no cadastro, leva 2 minutos:\n${link}`;
};

/** Igualdade de cidade sem acento/case — espelha o deaccent do server (V1 "perto de você"). */
const deaccentEq = (a: string, b: string) =>
  a.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .includes(b.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()) && !!b.trim();

/** Chip de filtro reutilizável (toque ≥44px, estado on/off claro). */
const FilterChip = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <Chip
    size="small" clickable onClick={() => { hapticLight(); onClick(); }} label={label}
    sx={{
      minHeight: 36, height: 36, fontWeight: 700, fontSize: 12, borderRadius: '999px',
      bgcolor: active ? 'rgba(32,178,170,0.15)' : 'transparent',
      color: active ? '#0f766e' : 'text.secondary',
      border: '1px solid', borderColor: active ? 'rgba(32,178,170,0.5)' : 'divider',
    }}
  />
);
