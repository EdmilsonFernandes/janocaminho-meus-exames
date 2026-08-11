import { useEffect, useMemo, useState } from 'react';
import { Box, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography, Accordion, AccordionSummary, AccordionDetails, Chip } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { API_URL } from '../../config';
import { ExamCard } from '../exams/ExamCard';
import { ListSkeleton } from '../Skeleton';
import { EmptyState } from '../EmptyState';
import { groupByYear } from '../../utils/groupByYear';
import { categorizeExam, CATS } from '../../utils/medicalData';
import { useDoctorT } from '../../utils/i18n-doctor';

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
  const [q, setQ] = useState('');
  const [view, setView] = useState<'date' | 'category'>('date');
  const [cat, setCat] = useState<string>('all');

  useEffect(() => {
    setLoading(true);
    const h: Record<string, string> = { Authorization: `Bearer ${token}` };
    fetch(`${API_URL}/doctor/patients/${patientId}/exams`, { headers: h })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setExams(d.items ?? []))
      .catch(() => setExams([]))
      .finally(() => setLoading(false));
  }, [patientId, token]);

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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 18, color: 'text.primary' }}>
        {t('doctor.tabs.exams')}
      </Typography>

      <Stack spacing={1.25}>
        <TextField
          size="small" fullWidth value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por título ou laboratório…"
          slotProps={{ input: { startAdornment: (<SearchIcon fontSize="small" sx={{ color: 'text.secondary', mr: 1 }} />) } }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3, bgcolor: 'background.paper' } }}
        />
        <ToggleButtonGroup exclusive size="small" value={view} onChange={(_, v) => { if (v) setView(v); }}>
          <ToggleButton value="date" sx={{ px: 1.25, py: 0.25, textTransform: 'none', fontWeight: 700 }}>Por data</ToggleButton>
          <ToggleButton value="category" sx={{ px: 1.25, py: 0.25, textTransform: 'none', fontWeight: 700 }}>Por categoria</ToggleButton>
        </ToggleButtonGroup>
        {presentCats.length > 1 && (
          <Stack direction="row" spacing={0.75} sx={{ overflowX: 'auto', flexWrap: 'nowrap', pb: 0.25, mx: -0.25, px: 0.25, '&::-webkit-scrollbar': { display: 'none' } }}>
            <Chip size="small" label={`Todos (${exams.length})`} onClick={() => setCat('all')} sx={{ height: 26, flexShrink: 0, fontWeight: 700, whiteSpace: 'nowrap', bgcolor: cat === 'all' ? '#0f3d3a' : '#0f3d3a14', color: cat === 'all' ? '#fff' : '#0f3d3a' }} />
            {presentCats.map((c) => (
              <Chip key={c.key} size="small" label={`${c.emoji} ${c.cat} (${catCounts[c.key]})`} onClick={() => setCat(cat === c.key ? 'all' : c.key)} sx={{ height: 26, flexShrink: 0, fontWeight: 700, whiteSpace: 'nowrap', bgcolor: cat === c.key ? c.color : c.color + '1a', color: cat === c.key ? '#fff' : c.color, border: `1px solid ${cat === c.key ? c.color : c.color + '40'}` }} />
            ))}
          </Stack>
        )}
      </Stack>

      {loading ? (
        <ListSkeleton count={3} />
      ) : exams.length === 0 ? (
        <EmptyState emoji="📄" title="Nenhum exame compartilhado" desc="Este paciente ainda não compartilhou exames com você." />
      ) : (
        <>
          {view === 'date' && dateGroups.map((g) => (
            <Accordion key={String(g.year ?? 'sdata')} defaultExpanded elevation={0} disableGutters sx={{ borderRadius: '12px !important', overflow: 'hidden', border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: 'rgba(32,178,170,.04)' }}>
                <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif' }}>{g.label}</Typography>
                <Chip size="small" label={g.items.length} sx={{ ml: 1, bgcolor: 'rgba(32,178,170,.12)', color: '#178f89', fontWeight: 700, height: 20 }} />
              </AccordionSummary>
              <AccordionDetails sx={{ p: 1 }}>
                <Stack spacing={1}>
                  {g.items.map((r: any) => <ExamCard key={r.id} exam={r} onOpen={onOpen} />)}
                </Stack>
              </AccordionDetails>
            </Accordion>
          ))}
          {view === 'category' && catGroups.map((g) => (
            <Accordion key={g.cat.key} defaultExpanded elevation={0} disableGutters sx={{ borderRadius: '12px !important', overflow: 'hidden', border: `1px solid ${g.cat.color}26`, '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: g.cat.color + '0a' }}>
                <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', color: g.cat.color }}>{g.cat.emoji} {g.cat.cat}</Typography>
                <Chip size="small" label={g.items.length} sx={{ ml: 1, bgcolor: g.cat.color + '1a', color: g.cat.color, fontWeight: 700, height: 20 }} />
              </AccordionSummary>
              <AccordionDetails sx={{ p: 1 }}>
                <Stack spacing={1}>
                  {g.items.map((r: any) => <ExamCard key={r.id} exam={r} onOpen={onOpen} />)}
                </Stack>
              </AccordionDetails>
            </Accordion>
          ))}
        </>
      )}
    </Box>
  );
};
