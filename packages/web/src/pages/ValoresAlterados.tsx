import { useEffect, useState, useMemo } from 'react';
import { Box, Card, CardContent, Typography, CircularProgress, Stack, Chip, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import { Title } from 'react-admin';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { ExplainButton } from '../components/ExplainItem';
import { TelemedicineButton } from '../components/TelemedicineButton';
import { fmtVal } from '../utils/format';
import { refLabel, categorize } from '../utils/medicalData';

interface AbnItem { id: string; examId: string; examTitle: string; performedAt: string | null; name: string; nameCanonical: string; valueText: string; unit: string | null; flag: string | null; refText: string | null; refLow: number | null; refHigh: number | null; }

/** Valores fora da faixa, AGRUPADOS POR EXAME (e dentro de cada exame, ordenados por categoria). */
export const ValoresAlteradosPage = () => {
  const [pid] = useSelectedPatient();
  const [items, setItems] = useState<AbnItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/items/abnormal${pid ? `?patientId=${pid}` : ''}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [pid]);

  const groups = useMemo(() => {
    const map = new Map<string, { examId: string; examTitle: string; performedAt: string | null; items: AbnItem[] }>();
    for (const it of items) {
      if (!map.has(it.examId)) map.set(it.examId, { examId: it.examId, examTitle: it.examTitle, performedAt: it.performedAt, items: [] });
      map.get(it.examId)!.items.push(it);
    }
    // Dentro de cada exame, ordena por categoria (clusteriza Hemograma, Lipídios, etc.)
    for (const g of map.values()) g.items.sort((a, b) => categorize(a.nameCanonical).key.localeCompare(categorize(b.nameCanonical).key));
    return [...map.values()];
  }, [items]);

  const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : 's/d');

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: 'auto' }}>
      <Title title="Valores alterados" />
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <WarningAmberIcon sx={{ color: 'error.main' }} />
        <Typography variant="h5" sx={{ fontWeight: 800 }}>Valores fora da faixa</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Agrupado por exame (do mais recente), itens por categoria. Toque num exame pra expandir e em <strong>Agendar</strong> pro especialista.</Typography>

      {loading ? (
        <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>
      ) : items.length === 0 ? (
        <Card><CardContent><Typography color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>Nenhum valor alterado — tudo dentro da faixa. ✅</Typography></CardContent></Card>
      ) : (
        <Stack spacing={1}>
          {groups.map((g, gi) => (
            <Accordion key={g.examId} defaultExpanded={gi === 0} disableGutters elevation={0} sx={{ border: '1px solid #f3dada', borderRadius: '12px', overflow: 'hidden', '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: '#fff5f5' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
                  <Box component="span" sx={{ fontSize: 18 }}>🚨</Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 800, color: '#b91c1c', lineHeight: 1.2 }}>{g.examTitle}</Typography>
                    <Typography variant="caption" sx={{ color: '#9b3a3a' }}>{fmtDate(g.performedAt)}</Typography>
                  </Box>
                  <Chip size="small" color="error" label={`${g.items.length} alterado(s)`} sx={{ fontWeight: 700, height: 20 }} />
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 1.25 }}>
                <Stack spacing={0.75}>
                  {g.items.map((it) => (
                    <Card key={it.id} variant="outlined" sx={{ borderLeft: '4px solid #ef4444', borderRadius: 2, bgcolor: '#fffafa' }}>
                      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', py: 1.25, '&:last-child': { pb: 1.25 } }}>
                        <Box sx={{ flex: '1 1 55%', minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                            <Typography sx={{ fontWeight: 700, wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}>{it.name}</Typography>
                            <ExplainButton name={it.name} nameCanonical={it.nameCanonical} />
                          </Box>
                          <Typography variant="caption" sx={{ color: '#6b7b80' }}>{refLabel(it)}</Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                          <Typography component="span" sx={{ fontSize: '1.35rem', fontWeight: 800, color: 'error.main' }}>{fmtVal(it)}</Typography>
                          {it.unit ? <Typography component="span" sx={{ color: 'text.secondary', ml: 0.5, fontSize: '0.8rem' }}>{it.unit}</Typography> : null}
                        </Box>
                        <TelemedicineButton marker={it.nameCanonical} compact />
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          ))}
        </Stack>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>*Educativo. Sempre confirme com seu médico.</Typography>
    </Box>
  );
};
