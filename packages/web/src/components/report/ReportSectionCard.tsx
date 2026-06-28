import { useState } from 'react';
import type { ReactNode } from 'react';
import { Card, CardContent, Box, Typography, Chip, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

/** Cabeçalho compartilhado (ícone + título + contagem) — usado no Card e no Accordion. */
const SectionHeader = ({ icon, title, accent, count, expandable }: { icon: ReactNode; title: string; accent: string; count?: number; expandable?: boolean }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
    <Box sx={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: alpha(accent, 0.12), color: accent, '& svg': { fontSize: 20 } }}>{icon}</Box>
    <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', flex: 1, fontSize: '1.02rem', minWidth: 0 }}>{title}</Typography>
    {count != null && <Chip size="small" label={count} sx={{ bgcolor: alpha(accent, 0.13), color: accent, fontWeight: 700, height: 22, flexShrink: 0 }} />}
    {expandable && <Box sx={{ flexShrink: 0, color: accent, display: 'flex' }}><ExpandMoreIcon sx={{ fontSize: 22 }} /></Box>}
  </Box>
);

/**
 * Card de seção do relatório. Mesmo vocabulário premium (borda + fundo tinted no accent).
 * - `collapsible` (default false): renderiza como Card sempre-aberto (pra ler/imprimir) — comportamento histórico.
 * - `collapsible` true: renderiza como Accordion (M5 — relatório progressivo no mobile: seções de
 *   detalhe ficam colapsadas por padrão, reduzindo a "parede de texto"). `defaultExpanded` controla o estado inicial.
 */
export const ReportSectionCard = ({ icon, title, accent, count, children, collapsible = false, defaultExpanded = true }: {
  icon: ReactNode; title: string; accent: string; count?: number; children: ReactNode; collapsible?: boolean; defaultExpanded?: boolean;
}) => {
  const [open, setOpen] = useState(defaultExpanded);
  if (!collapsible) {
    return (
      <Card sx={{ overflow: 'hidden', background: alpha(accent, 0.04), border: '1px solid', borderColor: alpha(accent, 0.2), borderLeft: `4px solid ${accent}` }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.5 }}><SectionHeader icon={icon} title={title} accent={accent} count={count} /></Box>
        <CardContent sx={{ pt: 0.5, pb: 2, px: 2, '&:last-child': { pb: 2 } }}>{children}</CardContent>
      </Card>
    );
  }
  return (
    <Accordion expanded={open} onChange={(_, e) => setOpen(e)} elevation={0} sx={{ overflow: 'hidden', background: alpha(accent, 0.04), border: '1px solid', borderColor: alpha(accent, 0.2), borderLeft: `4px solid ${accent}`, borderRadius: '16px', '&:before': { display: 'none' } }}>
      <AccordionSummary sx={{ px: 2, py: 1.5, minHeight: '0 !important', '& .MuiAccordionSummary-content': { my: 0 } }}><SectionHeader icon={icon} title={title} accent={accent} count={count} expandable /></AccordionSummary>
      <AccordionDetails sx={{ pt: 0.5, pb: 2, px: 2 }}>{children}</AccordionDetails>
    </Accordion>
  );
};
