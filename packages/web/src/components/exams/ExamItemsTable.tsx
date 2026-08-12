import { Box, Card, CardContent, Typography, Stack, Chip, Accordion, AccordionSummary, AccordionDetails, Divider } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { ValueBar } from '../ValueBar';
import { RefBar } from '../RefBar';
import { UnitLabel } from '../UnitLabel';
import { ExplainButton } from '../ExplainItem';
import { fmtVal, unitSuffix } from '../../utils/format';
import { displayStatus } from '../../utils/examStatus';

/** flagMeta — cores/labels das flags técnicas (NORMAL/HIGH/LOW/ABNORMAL/CRITICAL/UNKNOWN).
 *  Cópia fiel do ExamShow (mesma identidade visual nas duas superfícies). */
const flagMeta: Record<string, { color: 'success' | 'warning' | 'error' | 'default'; label: string }> = {
  NORMAL: { color: 'success', label: 'Normal' },
  HIGH: { color: 'error', label: '↑ Acima' },
  LOW: { color: 'warning', label: '↓ Abaixo' },
  ABNORMAL: { color: 'error', label: 'Alterado' },
  CRITICAL: { color: 'error', label: 'Crítico' },
  UNKNOWN: { color: 'default', label: '—' },
};

/** fmtRef — texto da faixa de referência (refText > low-high+unit > "não informada"). */
function fmtRef(it: any): string {
  if (it.refText) return it.refText;
  const lo = it.refLow, hi = it.refHigh;
  if (lo != null || hi != null) {
    const range = `${lo ?? ''} a ${hi ?? ''}`.trim();
    return it.unit ? `${range} ${it.unit}` : range;
  }
  return 'não informada';
}

/** fm() — resolvedor de flag híbrido: UNKNOWN/displayStatus para não mostrar '—' cru. */
const fm = (it: any) => {
  const f = (it?.flag ?? '').toUpperCase();
  if (f === 'UNKNOWN' || !flagMeta[f]) {
    const s = displayStatus(it?.flag, it?.name, it?.refLow, it?.refHigh);
    return { color: 'default' as const, label: s.short, title: s.label };
  }
  return flagMeta[f];
};

/**
 * ExamItemsTable — tabela de itens de um exame (somente leitura). Espelha o bloco de itens
 * do ExamShow (banner + Accordions por painel + linhas com ValueBar/RefBar), SEM:
 *  - EditableItemValue (valor editável) → usa fmtVal cru
 *  - botão "pág." (citação) — sem openCitation aqui
 *  - TelemedicineButton
 *  - Sparkline (sem histórico)
 * Usado pelo portal do médico (read-only viewer).
 */
export const ExamItemsTable = ({ items }: { items: any[] }) => {
  if (!items || items.length === 0) return null;

  const abnormal = items.filter((i) => i.isAbnormal);
  const noRef = items.filter((i) => (i.flag ?? '').toUpperCase() === 'UNKNOWN');
  const grouped = items.reduce((acc: any, it: any) => {
    (acc[it.panel ?? 'Geral'] ??= []).push(it);
    return acc;
  }, {});
  const fewPanels = Object.keys(grouped).length <= 2;

  return (
    <>
      {/* banner de atenção */}
      <Card sx={{ mt: 2, borderLeft: abnormal.length ? '6px solid' : undefined, borderColor: 'warning.main' }}>
        <CardContent>
          {abnormal.length ? (
            <>
              <Typography sx={{ fontWeight: 700, color: 'warning.main' }}>
                🚩 {abnormal.length} valor(es) fora da faixa de referência
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                {abnormal.map((i) => (
                  <Chip key={i.id} color="warning" variant="outlined" label={`${i.name}: ${i.valueText ?? ''}`} />
                ))}
              </Stack>
            </>
          ) : noRef.length > 0 ? (
            <Typography sx={{ fontWeight: 700, color: 'text.secondary' }}>
              {noRef.length} de {items.length} valor(es) sem referência informada pelo laboratório — não foi possível classificar automaticamente.
            </Typography>
          ) : (
            <Typography sx={{ fontWeight: 700, color: 'success.main' }}>
              ✅ Todos os {items.length} valores estão dentro da faixa de referência.
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* itens por painel — Accordion colapsável */}
      {Object.entries(grouped).map(([panel, list]: any) => {
        const abn = (list as any[]).filter((i: any) => i.isAbnormal).length;
        return (
          <Accordion key={panel} disableGutters elevation={0} defaultExpanded={fewPanels}
            sx={{ mt: 1.5, borderRadius: '12px !important', overflow: 'hidden', border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: '48px !important', '& .MuiAccordionSummary-content': { my: 0.75, alignItems: 'center' } }}>
              <Typography sx={{ fontWeight: 700, fontSize: '1rem', flex: '1 1 auto', minWidth: 0, wordBreak: 'break-word', overflowWrap: 'anywhere', pr: 1 }}>{panel}</Typography>
              {/* Caption única: "5 itens · 2 alterados" (cor só no alterados). */}
              <Typography variant="caption" sx={{ flexShrink: 0, color: 'text.secondary', pr: 0.5 }}>
                {(list as any[]).length} itens{abn > 0 && (
                  <>
                    {' · '}
                    <Box component="span" sx={{ color: 'error.main', fontWeight: 700 }}>{abn} alterado{abn > 1 ? 's' : ''}</Box>
                  </>
                )}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 1 }}>
              <Stack divider={<Divider sx={{ borderColor: 'divider', my: 0.5 }} />}>
                {(list as any[]).map((it: any) => {
                  const m = fm(it);
                  const out = it.isAbnormal;
                  const valColor = out ? (m.color === 'error' ? 'error.main' : 'warning.main') : 'success.main';
                  return (
                    <Box key={it.id} sx={{
                      py: 1.25, pl: 1, borderRadius: 1,
                      borderLeft: out ? '5px solid' : '5px solid transparent',
                      borderColor: out ? (m.color === 'error' ? 'error.main' : 'warning.main') : 'transparent',
                      background: out ? (m.color === 'error' ? 'rgba(198,40,40,.06)' : 'rgba(230,81,0,.06)') : 'transparent',
                    }}>
                      {/* Nome + ? + status */}
                      <Stack direction="row" alignItems="flex-start" useFlexGap spacing={0.5} sx={{ mb: 0.25 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', flex: 1, minWidth: 0, wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.3 }}>{it.name}</Typography>
                        <ExplainButton name={it.name} nameCanonical={it.nameCanonical} />
                        <Chip color={m.color} label={m.label} size="small" sx={{ flexShrink: 0 }} />
                      </Stack>
                      {/* Valor grande + cor + unidade (read-only — fmtVal cru, sem EditableItemValue) */}
                      <Stack direction="row" spacing={1} alignItems="baseline" useFlexGap flexWrap="wrap">
                        <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.2, color: valColor }}>{fmtVal(it)}</Typography>
                        {unitSuffix(it) ? <UnitLabel unit={unitSuffix(it)} /> : null}
                      </Stack>
                      {/* Referência + barra visual */}
                      <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', mt: 0.25, wordBreak: 'break-word' }}>
                        <strong>Referência:</strong> {fmtRef(it)}
                      </Typography>
                      <ValueBar value={it.valueNumeric} low={it.refLow} high={it.refHigh} />
                      <RefBar value={it.valueNumeric} refLow={it.refLow} refHigh={it.refHigh} unit={it.unit} />
                      {out && it.valueNumeric != null && it.refLow != null && it.refHigh != null && (
                        <Typography variant="caption" sx={{ color: m.color === 'error' ? 'error.main' : 'warning.main', fontWeight: 700, mt: 0.25, display: 'block' }}>
                          {it.valueNumeric > it.refHigh
                            ? `↑ ${Math.round((it.valueNumeric - it.refHigh) / Math.abs(it.refHigh) * 100)}% acima do limite`
                            : `↓ ${Math.round((it.refLow - it.valueNumeric) / Math.abs(it.refLow || 1) * 100)}% abaixo do limite`}
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </>
  );
};
