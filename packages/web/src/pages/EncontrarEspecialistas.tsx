import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Autocomplete, Avatar, Box, Button, Card, CardContent, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import TravelExploreRoundedIcon from '@mui/icons-material/TravelExploreRounded';
import AddTaskRoundedIcon from '@mui/icons-material/AddTaskRounded';
import BookmarkAddedRoundedIcon from '@mui/icons-material/BookmarkAddedRounded';
import { useNotify } from 'react-admin';
import { API_URL, token, doctorPhotoUrl } from '../config';
import { UFS } from '../utils/medicalData';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { ListSkeleton } from '../components/Skeleton';
import { hapticLight, hapticSuccess } from '../utils/haptic';
import { INSURANCE_OPERATOR_NAMES, SPECIALTIES } from '../utils/medicalData';
import { tealText } from '../theme';
import type { SpecialistItem } from '../types/consultations';

// §3 "Encontrar especialistas" (28/10/26): busca no DIRETÓRIO PRÓPRIO do Dr. Exame —
// 100% desenvolvimento nosso (nenhum provedor pago, sem scraping; decisão do dono).
// Honestidade é regra: cada card mostra a FONTE dos dados (portal do médico vs
// cadastro de pacientes) e o que não sabemos aparece como "não informado —
// confirme com o consultório" (ausência ≠ recusa).

export const EncontrarEspecialistasPage = () => {
  const navigate = useNavigate();
  const notify = useNotify();
  const [q, setQ] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [city, setCity] = useState('');
  const [operator, setOperator] = useState('');
  const [withPrice, setWithPrice] = useState(false);
  const [claimedOnly, setClaimedOnly] = useState(false);

  const [items, setItems] = useState<SpecialistItem[]>([]);
  const [total, setTotal] = useState(0);
  // Facets: cidades que JÁ têm médicos no diretório (chips clicáveis — o usuário vê
  // onde vale buscar antes de digitar) + nota honesta quando a cidade não tem nada.
  const [cities, setCities] = useState<{ city: string; count: number }[]>([]);
  const [cityNote, setCityNote] = useState<string | null>(null);
  // Combo IBGE (5.571 municípios, vendored): carregado SOB DEMANDA (code-split — não
  // pesa o bundle inicial). O "(UF)" vai pro server, que stripa antes de comparar/salvar.
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
      setError('A busca falhou. Verifique sua conexão e tente de novo — ou cadastre o médico manualmente em Meus médicos.');
      setItems([]);
    } finally { setLoading(false); setSearched(true); }
  };

  // Primeira carga automática (região inicial de validação: SJC/SP — spec §8)
  useEffect(() => { void doSearch(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Busca com debounce enquanto digita (diretriz UX: não exigir Enter)
  useEffect(() => {
    if (!searched) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void doSearch(); }, 450);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, specialty, city, operator, withPrice, claimedOnly]);

  // Quem já está salvo (botão vira "Salvo ✓")
  useEffect(() => {
    fetch(`${API_URL}/my-doctors`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((d) => setSavedIds(new Set((d.items ?? []).map((i: any) => i.doctor.id))))
      .catch(() => {});
  }, []);

  // ── CNES (V1.3): salvar achado do catálogo oficial. O vínculo CNES traz o CRM de
  // médicos (conselho 10) → salvar DIRETO com CRM; demais profissões pedem CRM num
  // dialog (vira Doctor com cidade/clínica preenchidas, provenance paciente).
  const salvarCnesDireto = async (s: any) => {
    hapticLight();
    try {
      const r = await fetch(`${API_URL}/my-doctors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
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
      notify(`Dr(a). ${String(s.name).split(' ')[0]} salvo — sem acesso aos exames.`, { type: 'success' });
    } catch (e: any) { notify(e.message || 'Falha ao salvar', { type: 'error' }); }
  };
  const [cnesFor, setCnesFor] = useState<any | null>(null);
  const [cnesCrm, setCnesCrm] = useState('');
  const [cnesUf, setCnesUf] = useState('');
  const [cnesSaving, setCnesSaving] = useState(false);
  const salvarCnesComCrm = async () => {
    if (!cnesFor || !cnesCrm.replace(/\D/g, '') || cnesUf.length !== 2) {
      notify('Informe CRM e UF pra salvar com o cadastro oficial.', { type: 'warning' });
      return;
    }
    setCnesSaving(true);
    try {
      const r = await fetch(`${API_URL}/my-doctors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
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
      notify(`Dr(a). ${String(cnesFor.name).split(' ')[0]} salvo — sem acesso aos exames.`, { type: 'success' });
      setCnesFor(null); setCnesCrm(''); setCnesUf('');
    } catch (e: any) { notify(e.message || 'Falha ao salvar', { type: 'error' }); }
    finally { setCnesSaving(false); }
  };

  const salvar = async (s: SpecialistItem) => {
    hapticLight();
    try {
      const r = await fetch(`${API_URL}/my-doctors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ doctorId: s.id, source: 'search' }),
      });
      if (!r.ok) throw new Error();
      hapticSuccess();
      setSavedIds((p) => new Set(p).add(s.id));
      notify(`Dr(a). ${s.name.split(' ')[0]} salvo em Meus médicos. Ele NÃO ganha acesso aos seus exames.`, { type: 'success' });
    } catch { notify('Não consegui salvar. Tente de novo.', { type: 'error' }); }
  };

  return (
    <PageContainer width="content" sx={{ pb: { xs: 12, sm: 5 } }}>
      <PageHeader
        icon={<TravelExploreRoundedIcon />}
        title="Encontrar especialistas"
        subtitle="Busca no diretório do Dr. Exame — médicos com portal ativo e cadastros feitos por pacientes."
      />

      {/* FILTROS */}
      <Card sx={{ borderRadius: '16px', border: '1px solid', borderColor: 'divider', mb: 2.5 }}>
        <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Stack spacing={1.5}>
            <TextField
              placeholder="Nome do médico ou clínica…" value={q} onChange={(e) => setQ(e.target.value)}
              size="small" fullWidth slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment>,
                  sx: { borderRadius: '999px' },
                },
              }}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField select label="Especialidade" value={specialty} onChange={(e) => setSpecialty(e.target.value)} size="small" sx={{ flex: '1 1 160px' }}>
                <MenuItem value=""><em>Todas</em></MenuItem>
                {SPECIALTIES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
              {/* Combo IBGE (5.571 municípios) com digitação livre — o server stripa o "(UF)" */}
              <Autocomplete
                freeSolo disablePortal autoComplete
                options={cityOptions}
                inputValue={city}
                onInputChange={(_, v) => setCity(v)}
                renderInput={(p) => <TextField {...p} label="Cidade (perto de você)" size="small" placeholder="Ex.: São José dos Campos" />}
                sx={{ flex: '1 1 190px' }}
                noOptionsText="Cidade não encontrada — pode digitar livre"
              />
            </Stack>
            {cities.length > 0 && (
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', mb: 0.5, color: 'text.secondary' }}>
                  Onde já temos médicos:
                </Typography>
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                  {city && (
                    <Chip size="small" clickable label="✕ Todas as cidades" onClick={() => setCity('')}
                      sx={{ minHeight: 34, height: 34, fontWeight: 700, fontSize: 12, borderRadius: '999px', bgcolor: 'rgba(239,68,68,0.08)', color: '#b91c1c', border: '1px solid rgba(239,68,68,0.3)' }} />
                  )}
                  {cities.map((c) => (
                    <FilterChip key={c.city} label={`${c.city} (${c.count})`} active={deaccentEq(c.city, city)} onClick={() => setCity(c.city)} />
                  ))}
                </Stack>
              </Box>
            )}
            <TextField select label="Convênio aceito (informado)" value={operator} onChange={(e) => setOperator(e.target.value)} size="small" sx={{ maxWidth: { sm: 260 } }}>
              <MenuItem value=""><em>Qualquer / não filtrar</em></MenuItem>
              {INSURANCE_OPERATOR_NAMES.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
            </TextField>
            <Stack direction="row" spacing={2} flexWrap="wrap">
              <FilterChip label="Com preço particular publicado" active={withPrice} onClick={() => setWithPrice((v) => !v)} />
              <FilterChip label="Com portal ativo (teleconsulta)" active={claimedOnly} onClick={() => setClaimedOnly((v) => !v)} />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              ⚠️ Não filtrar por convênio não significa que o médico não atenda — quando não sabemos, dizemos “não informado”.
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      {/* ESTADOS: carregando / erro / vazio */}
      {loading && <ListSkeleton count={4} />}

      {!loading && error && (
        <Alert severity="error" sx={{ borderRadius: '12px', mb: 2 }}>{error}</Alert>
      )}

      {!loading && !error && searched && items.length === 0 && (
        <Card variant="outlined" sx={{ borderRadius: '20px', borderStyle: 'dashed', textAlign: 'center', py: 4, mb: 2 }}>
          <CardContent>
            <Box sx={{ fontSize: 44, mb: 1 }}>🔍</Box>
            <Typography sx={{ fontWeight: 800, fontSize: 16, mb: 0.5 }}>Nenhum especialista encontrado</Typography>
            <Typography color="text.secondary" sx={{ mb: 2, maxWidth: 360, mx: 'auto', fontSize: 13.5 }}>
              {cityNote ?? 'Nosso diretório ainda está crescendo. Tente só a especialidade sem cidade, ou cadastre seu médico manualmente — com CRM ele entra na busca pra todo mundo.'}
            </Typography>
            <Button variant="outlined" onClick={() => navigate('/medicos')} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: 3, borderColor: '#20b2aa', color: '#0f766e' }}>
              Cadastrar em Meus médicos
            </Button>
          </CardContent>
        </Card>
      )}

      {/* RESULTADOS */}
      {!loading && items.length > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
            {items.length} de {total} {total === 1 ? 'médico' : 'médicos'} • ordenados por dados confirmados
          </Typography>
        </Box>
      )}
      <Stack spacing={1.5}>
        {!loading && items.map((s: any) => {
          // ── Card CNES (catálogo oficial): sem CRM — salvar pede o CRM, registra consulta
          // com nome livre. Visual distinto (borda tracejada + badge oficial) pra nunca
          // confundir com médico do diretório do produto.
          if (s.origin === 'cnes') {
            return (
              <Card key={s.id} sx={{
                borderRadius: '16px', border: '1.5px dashed', borderColor: 'rgba(32,178,170,0.5)',
                bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(32,178,170,0.05)' : 'rgba(240,253,250,0.6)',
              }}>
                <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                  <Stack direction="row" spacing={1.75} alignItems="flex-start">
                    <Avatar sx={{ width: 44, height: 44, fontSize: 18, bgcolor: 'rgba(15,95,90,0.15)', color: '#0f766e', flexShrink: 0 }}>🩺</Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography sx={{ fontWeight: 800, fontSize: 14.5, fontFamily: '"Poppins",sans-serif', color: 'text.primary' }}>
                          {s.name}
                        </Typography>
                        {s.crm && (
                          <Chip size="small" label={`CRM ${String(s.crm).replace(/\D/g, '')}-${s.crmUf ?? ''}`} sx={{ height: 20, fontSize: 11, fontWeight: 700, fontFamily: 'monospace', bgcolor: 'rgba(15,95,90,0.08)', color: '#0f5f5a', borderRadius: '4px' }} />
                        )}
                        <Chip size="small" label="CNES oficial" sx={{ height: 20, fontSize: 10.5, fontWeight: 800, bgcolor: 'rgba(15,95,90,0.12)', color: '#0f766e' }} />
                      </Stack>
                      {s.specialty && (
                        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 600, mt: 0.25 }}>
                          🩺 {s.specialty}
                        </Typography>
                      )}
                      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}>
                        📍 {s.clinicName} • {s.clinicCity}
                      </Typography>
                      {s.address && (
                        <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled' }}>{s.address}</Typography>
                      )}
                      <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: 'text.disabled', fontSize: 10.5 }}>
                        🏛️ {s.provenance.label}
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }}>
                        {s.crm ? (
                          <Button size="small" variant="contained" onClick={() => void salvarCnesDireto(s)}
                            sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, minHeight: 40 }}>
                            Salvar em Meus médicos
                          </Button>
                        ) : (
                          <Button size="small" variant="contained" onClick={() => { hapticLight(); setCnesFor(s); }}
                            sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, minHeight: 40 }}>
                            Salvar com CRM
                          </Button>
                        )}
                        {/* Aquisição B2B de graça: "Te encontrei no Dr. Exame" com CRM
                            pré-validado no link — cada busca vira convite de médico. */}
                        {s.crm && s.phone && (
                          <Button
                            size="small" variant="outlined" component="a" target="_blank" rel="noopener"
                            href={`https://wa.me/55${String(s.phone).replace(/\D/g, '')}?text=${encodeURIComponent(conviteMedicoMsg(s))}`}
                            sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, minHeight: 40, color: '#059669', borderColor: 'rgba(5,150,105,0.4)' }}
                          >
                            💬 Convidar médico
                          </Button>
                        )}
                        <Button size="small" variant="outlined"
                          onClick={() => navigate('/consultas', { state: { tab: 'minhas', prefillDoctor: { doctorName: s.name, specialty: (s.specialty ?? '').replace(/^Médic[oa]\s*/i, '') } } })}
                          sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, minHeight: 40 }}>
                          Registrar consulta
                        </Button>
                      </Stack>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            );
          }
          const salvo = savedIds.has(s.id);
          return (
            <Card key={s.id} sx={{
              borderRadius: '16px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)', position: 'relative', overflow: 'hidden',
              transition: 'all .2s ease',
              '&:hover': { borderColor: '#178f89', boxShadow: '0 8px 24px rgba(15,95,90,0.12)', transform: 'translateY(-2px)' },
            }}>
              {s.claimed && <Box sx={{ position: 'absolute', right: 0, top: 0, bgcolor: 'rgba(32,178,170,0.12)', px: 1.5, py: 0.25, borderBottomLeftRadius: 10 }}>
                <Typography sx={{ fontSize: 10.5, fontWeight: 800, color: '#0f766e' }}>PORTAL ATIVO</Typography>
              </Box>}
              <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                <Stack direction="row" spacing={1.75} alignItems="flex-start">
                  <Avatar src={doctorPhotoUrl(s.id)} sx={{ width: 52, height: 52, fontWeight: 800, fontSize: 20, bgcolor: '#0f5f5a', flexShrink: 0 }}>
                    {s.name.charAt(0).toUpperCase()}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 15.5, fontFamily: '"Poppins",sans-serif', color: 'text.primary' }}>
                      {s.name}
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mt: 0.25, rowGap: 0.5, mb: 0.75 }}>
                      {s.specialty && <Chip size="small" label={s.specialty} sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(32,178,170,0.15)', color: (t) => tealText(t.palette.mode) }} />}
                      <Chip size="small" label={`CRM ${s.crm}`} sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(0,0,0,0.05)', color: 'text.secondary', borderRadius: '4px' }} />
                    </Stack>

                    {(s.clinicName || s.clinicCity) && (
                      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                        📍 {[s.clinicName, s.clinicCity].filter(Boolean).join(' • ')}
                      </Typography>
                    )}
                    {s.consultPriceCents != null && (
                      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 700, mt: 0.25 }}>
                        💳 Teleconsulta particular: R$ {(s.consultPriceCents / 100).toFixed(2).replace('.', ',')}
                      </Typography>
                    )}

                    {/* Convênios informados (§5: com provenance; vazio = não informado) */}
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
                        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                          🏥 Convênios não informados — confirme com o consultório
                        </Typography>
                      )}
                    </Box>

                    {/* PROVENANCE (§3: fonte e data sempre visíveis) */}
                    <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.disabled', fontSize: 10.5 }}>
                      {s.claimed ? '✓ ' : 'ℹ️ '}{s.provenance.label}
                    </Typography>

                    {/* AÇÕES */}
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }}>
                      <Button
                        size="small" variant={salvo ? 'outlined' : 'contained'} disabled={salvo}
                        startIcon={salvo ? <BookmarkAddedRoundedIcon /> : <BookmarkAddedRoundedIcon />}
                        onClick={() => void salvar(s)}
                        sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, minHeight: 40, ...(salvo ? { color: '#0f766e', borderColor: 'rgba(32,178,170,0.5)' } : {}) }}
                      >
                        {salvo ? 'Salvo ✓' : 'Meus médicos'}
                      </Button>
                      <Button
                        size="small" variant="outlined" startIcon={<AddTaskRoundedIcon />}
                        onClick={() => navigate('/consultas', { state: { prefillDoctor: { doctorId: s.id, doctorName: s.name, specialty: s.specialty ?? '' }, tab: 'minhas' } })}
                        sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, minHeight: 40 }}
                      >
                        Registrar consulta
                      </Button>
                      {s.phone && (
                        <Button size="small" component="a" href={`https://wa.me/${s.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener"
                          sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, minHeight: 40, color: '#059669', borderColor: 'rgba(5,150,105,0.4)' }} variant="outlined">
                          💬 WhatsApp
                        </Button>
                      )}
                    </Stack>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Stack>

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
