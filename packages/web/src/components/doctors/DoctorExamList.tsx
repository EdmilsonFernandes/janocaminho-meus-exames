import { useEffect, useMemo, useState } from 'react';
import { Box, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography, Accordion, AccordionSummary, AccordionDetails, Chip, Card, CardContent, Collapse } from '@mui/material';
import { alpha } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import HistoryIcon from '@mui/icons-material/History';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { API_URL } from '../../config';
import { ExamCard } from '../exams/ExamCard';
import { ListSkeleton } from '../Skeleton';
import { EmptyState } from '../EmptyState';
import { groupByYear } from '../../utils/groupByYear';
import { categorizeExam, CATS } from '../../utils/medicalData';
import { useDoctorT } from '../../utils/i18n-doctor';
import { RADIUS } from '../../theme';

/**
 * DoctorExamList — lista de exames do paciente compartilhados com o médico (READ-ONLY).
 * Busca /api/doctor/patients/:pid/exams (Bearer doctorToken). Toolbar: busca (título/lab)
 * + toggle data/categoria + chips de categoria (só se >1). Agrupa por ano/categoria e renderiza
 * <ExamCard onOpen> por exame. Loading→ListSkeleton; vazio→EmptyState.
 */
export const DoctorExamList = ({ patientId, token, onOpen }: { patientId: string; token: string; onOpen: (examId: string) => void }) => {
  const t = useDoctorT();
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // ERRO ≠ VAZIO (critique P1 26/08): catch silencioso transformava falha de rede em
  // "Nenhum exame compartilhado" — o médico concluía que o paciente não tem exames.
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');
  const [view, setView] = useState<'date' | 'category'>('date');
  const [cat, setCat] = useState<string>('all');

  const load = () => {
    setLoading(true); setError(false);
    const h: Record<string, string> = { Authorization: `Bearer ${token}` };
    fetch(`${API_URL}/doctor/patients/${patientId}/exams`, { headers: h })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => setExams(d.items ?? []))
      .catch(() => { setError(true); setExams([]); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [patientId, token]);

  const norm = (s: any) => (s == null ? '' : String(s)).toLowerCase().trim();
  const query = norm(q);
  const matchesSearch = (r: any) => !query || norm(r.title).includes(query) || norm(r.sourceLab).includes(query);
  const matchesCat = (r: any) => cat === 'all' || categorizeExam(r).key === cat;
  const visible = exams.filter((r) => matchesSearch(r) && matchesCat(r));

  const catCounts: Record<string, number> = {};
  for (const r of exams) { const k = categorizeExam(r).key; catCounts[k] = (catCounts[k] ?? 0) + 1; }
  const presentCats = CATS.filter((c) => catCounts[c.key]).sort((a, b) => catCounts[b.key] - catCounts[a.key]);

  const dateGroups = useMemo(() => groupByYear(visible, (r: any) => r.performedAt ?? r.createdAt), [visible]);
  const catGroups = presentCats.map((c) => ({ cat: c, items: visible.filter((r: any) => categorizeExam(r).key === c.key) })).filter((g) => g.items.length);

  /** openPdf — abre o PDF original do exame (try Capacitor Browser, fallback window.open). */
  const openPdf = async (examId: string) => {
    const url = `${API_URL}/doctor/patients/${patientId}/exams/${examId}/file?token=${encodeURIComponent(token)}`;
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url });
        return;
      }
    } catch { /* web fallback */ }
    window.open(url, '_blank');
  };

  const [showAllYears, setShowAllYears] = useState(false);
  const isFiltering = query.length > 0 || cat !== 'all';
  const initialDateGroups = useMemo(() => (isFiltering ? dateGroups : dateGroups.slice(0, 1)), [dateGroups, isFiltering]);
  const hiddenDateGroups = useMemo(() => (isFiltering ? [] : dateGroups.slice(1)), [dateGroups, isFiltering]);
  const hiddenExamsCount = useMemo(() => hiddenDateGroups.reduce((acc, g) => acc + g.items.length, 0), [hiddenDateGroups]);

  const renderDateAccordion = (g: (typeof dateGroups)[number]) => (
    <Accordion
      key={String(g.year ?? 'sdata')}
      defaultExpanded
      elevation={0}
      disableGutters
      sx={(t) => ({
        borderRadius: '20px !important',
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'divider',
        boxShadow: t.palette.mode === 'dark' ? '0 4px 14px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,0,0,0.03)',
        '&:before': { display: 'none' },
        '& .MuiAccordionSummary-root': {
          borderTopLeftRadius: '20px',
          borderTopRightRadius: '20px',
        },
        '& .MuiAccordionDetails-root': {
          borderBottomLeftRadius: '20px',
          borderBottomRightRadius: '20px',
        },
      })}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={(t) => ({ bgcolor: alpha(t.palette.primary.main, 0.04) })}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{g.label}</Typography>
        <Chip size="small" label={g.items.length} sx={(t) => ({ ml: 1, bgcolor: alpha(t.palette.primary.main, 0.12), color: t.palette.primary.dark, fontWeight: 700, height: 22 })} />
      </AccordionSummary>
      <AccordionDetails sx={{ p: 1 }}>
        <Stack spacing={1}>
          {g.items.map((r: any) => <ExamCard key={r.id} exam={r} onOpen={onOpen} onOpenPdf={r.filePath ? () => openPdf(r.id) : undefined} />)}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="h6" sx={{ color: 'text.primary' }}>
        {t('doctor.tabs.exams')}
      </Typography>

      <Stack spacing={1.25}>
        <TextField
          size="small" fullWidth value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por título ou laboratório…"
          slotProps={{ input: { startAdornment: (<SearchIcon fontSize="small" sx={{ color: 'text.secondary', mr: 1 }} />) } }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '14px', bgcolor: 'background.paper' } }}
        />
        <ToggleButtonGroup exclusive size="small" value={view} onChange={(_, v) => { if (v) setView(v); }} sx={{ '& .MuiToggleButton-root': { borderRadius: '10px' } }}>
          <ToggleButton value="date" sx={{ px: 1.5, py: 0.35, textTransform: 'none', fontWeight: 700 }}>Por data</ToggleButton>
          <ToggleButton value="category" sx={{ px: 1.5, py: 0.35, textTransform: 'none', fontWeight: 700 }}>Por categoria</ToggleButton>
        </ToggleButtonGroup>
        {presentCats.length > 1 && (
          // MOBILE: linha única deslizável (dedo). DESKTOP: WRAP — sem mouse não dá pra
          // descobrir o scroll horizontal e as categorias do fim "sumiam" cortadas.
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ overflowX: { xs: 'auto', md: 'visible' }, flexWrap: { xs: 'nowrap', md: 'wrap' }, pb: 0.25, mx: -0.25, px: 0.25, '&::-webkit-scrollbar': { display: 'none' } }}>
            <Chip
              size="small"
              label={`Todos (${exams.length})`}
              onClick={() => setCat('all')}
              sx={(t) => ({
                height: 38, flexShrink: 0, fontWeight: 700, whiteSpace: 'nowrap', borderRadius: RADIUS.pill,
                bgcolor: cat === 'all' ? t.palette.primary.dark : alpha(t.palette.primary.main, 0.1),
                color: cat === 'all' ? '#fff' : t.palette.primary.dark,
                transition: 'all 0.15s ease',
              })}
            />
            {presentCats.map((c) => (
              <Chip
                key={c.key}
                size="small"
                icon={<Box component={c.icon} sx={{ fontSize: 17, color: `${cat === c.key ? '#fff' : c.color} !important`, ml: 0.5, mr: -0.5 }} />}
                label={`${c.cat} (${catCounts[c.key]})`}
                onClick={() => setCat(cat === c.key ? 'all' : c.key)}
                sx={{
                  height: 38, flexShrink: 0, fontWeight: 700, whiteSpace: 'nowrap', borderRadius: RADIUS.pill,
                  bgcolor: cat === c.key ? c.color : alpha(c.color, 0.1),
                  color: cat === c.key ? '#fff' : c.color,
                  border: `1px solid ${cat === c.key ? c.color : alpha(c.color, 0.25)}`,
                  transition: 'all 0.15s ease',
                }}
              />
            ))}
          </Stack>
        )}
      </Stack>

      {loading ? (
        <ListSkeleton count={3} />
      ) : error ? (
        <EmptyState emoji="📡" title="Não consegui carregar os exames" desc="Falha de conexão — o paciente pode ter exames; não é lista vazia."
          cta="Tentar de novo" onCta={load} />
      ) : exams.length === 0 ? (
        <EmptyState emoji="📄" title="Nenhum exame compartilhado" desc="Este paciente ainda não compartilhou exames com você." />
      ) : (
        <>
          {view === 'date' && (
            <>
              {hiddenDateGroups.length > 0 && !isFiltering && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 0.5, pt: 0.5 }}>
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <AutoAwesomeIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      {showAllYears ? `Histórico Completo (${exams.length} exames)` : `Foco Recente: ${initialDateGroups[0]?.label ?? 'Mais Recente'}`}
                    </Typography>
                  </Stack>
                  <Chip
                    size="small"
                    label={showAllYears ? `Exibindo todos (${exams.length})` : `${initialDateGroups[0]?.items.length ?? 0} de ${exams.length} exames`}
                    sx={{ height: 22, fontSize: '0.72rem', fontWeight: 700, bgcolor: (t) => alpha(t.palette.primary.main, 0.1), color: 'primary.main' }}
                  />
                </Box>
              )}

              <Stack spacing={1.25}>
                {initialDateGroups.map(renderDateAccordion)}
              </Stack>

              {hiddenDateGroups.length > 0 && !isFiltering && (
                <>
                  <Collapse in={showAllYears} unmountOnExit timeout={300}>
                    <Stack spacing={1.25} sx={{ pt: 1.25 }}>
                      {hiddenDateGroups.map(renderDateAccordion)}
                    </Stack>
                  </Collapse>

                  <Card
                    variant="outlined"
                    onClick={() => setShowAllYears((v) => !v)}
                    sx={{
                      cursor: 'pointer',
                      borderRadius: '18px',
                      border: (t) => `1px dashed ${alpha(t.palette.primary.main, showAllYears ? 0.3 : 0.45)}`,
                      background: (t) =>
                        t.palette.mode === 'dark'
                          ? 'linear-gradient(135deg, rgba(32,178,170,0.10) 0%, rgba(32,178,170,0.02) 100%), #141f20'
                          : 'linear-gradient(135deg, rgba(32,178,170,0.08) 0%, rgba(32,178,170,0.02) 100%), #f8fcfa',
                      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      '&:hover': {
                        borderColor: 'primary.main',
                        transform: 'translateY(-2px)',
                        boxShadow: (t) => `0 6px 20px ${alpha(t.palette.primary.main, 0.15)}`,
                      },
                    }}
                  >
                    <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5}>
                        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                          <Box
                            sx={{
                              width: 38,
                              height: 38,
                              borderRadius: '12px',
                              bgcolor: (t) => alpha(t.palette.primary.main, 0.14),
                              color: 'primary.main',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {showAllYears ? <KeyboardArrowUpIcon /> : <HistoryIcon />}
                          </Box>
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary', lineHeight: 1.25 }}>
                              {showAllYears ? 'Recolher para o ano mais recente' : `Ver exames anteriores (+${hiddenExamsCount})`}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.2 }}>
                              {showAllYears ? 'Exibindo arquivo completo' : `Histórico de ${hiddenDateGroups.map((g) => g.label).join(', ')}`}
                            </Typography>
                          </Box>
                        </Stack>
                        <Chip
                          size="small"
                          icon={showAllYears ? <KeyboardArrowUpIcon sx={{ '&&': { fontSize: 16 } }} /> : <KeyboardArrowDownIcon sx={{ '&&': { fontSize: 16 } }} />}
                          label={showAllYears ? 'Recolher' : `+${hiddenExamsCount}`}
                          color="primary"
                          variant={showAllYears ? 'outlined' : 'filled'}
                          sx={{
                            fontWeight: 800,
                            borderRadius: '999px',
                            height: 28,
                            flexShrink: 0,
                            whiteSpace: 'nowrap',
                            px: 0.5,
                          }}
                        />
                      </Stack>
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          )}
          {view === 'category' && catGroups.map((g) => (
            <Accordion
              key={g.cat.key}
              defaultExpanded
              elevation={0}
              disableGutters
              sx={{
                borderRadius: '20px !important',
                overflow: 'hidden',
                border: `1px solid ${alpha(g.cat.color, 0.2)}`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                '&:before': { display: 'none' },
                '& .MuiAccordionSummary-root': {
                  borderTopLeftRadius: '20px',
                  borderTopRightRadius: '20px',
                },
                '& .MuiAccordionDetails-root': {
                  borderBottomLeftRadius: '20px',
                  borderBottomRightRadius: '20px',
                },
              }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: alpha(g.cat.color, 0.04) }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}><Box component={g.cat.icon} sx={{ fontSize: 18, color: g.cat.color }} /><Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>{g.cat.cat}</Typography></Box>
                <Chip size="small" label={g.items.length} sx={{ ml: 1, bgcolor: alpha(g.cat.color, 0.12), color: g.cat.color, fontWeight: 700, height: 22 }} />
              </AccordionSummary>
              <AccordionDetails sx={{ p: 1 }}>
                <Stack spacing={1}>
                  {g.items.map((r: any) => <ExamCard key={r.id} exam={r} onOpen={onOpen} onOpenPdf={r.filePath ? () => openPdf(r.id) : undefined} />)}
                </Stack>
              </AccordionDetails>
            </Accordion>
          ))}
        </>
      )}
    </Box>
  );
};
