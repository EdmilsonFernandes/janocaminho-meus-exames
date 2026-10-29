// Lucian UX/UI Prompt #217 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#217
// Plan comparison with differences only — tabela 3 planos; nome do plano fica pinado no
// topo ao rolar (sticky header no scroll interno), coluna sob o cursor/toque acende e o
// chip de preço do header inverte. "Só diferenças" dobra (grid-template-rows 1fr→0fr,
// .45s cubic-bezier(.3,.8,.3,1)) linhas iguais nos 3 planos e grupos que esvaziam.
// Porte React/MUI (sx): teal #20b2aa como accent, cobre #d4a574 no badge "mais escolhido",
// Poppins títulos. Mobile (<sm): regra absoluta do dono — tabela vira CARTÕES empilhados
// com o plano selecionado destacado; sticky header só no sm+.
import { useState, type ReactNode } from 'react';
import { Box, Typography, alpha, useMediaQuery, useTheme } from '@mui/material';
import { tealText } from '../theme';

export type CellValue = string | boolean;
export interface ComparisonRow { label: string; cells: [CellValue, CellValue, CellValue]; }
export interface ComparisonGroup { title: string; rows: ComparisonRow[] }
export interface ComparisonColumn { name: string; period: string; price: string; badge?: string }

const isSame = (c: ComparisonRow) => c.cells[0] === c.cells[1] && c.cells[1] === c.cells[2];

const CellValueView = ({ v }: { v: CellValue }) => {
  if (v === true) return (
    <svg role="img" aria-label="Incluído" width={13} height={13} viewBox="0 0 14 14" style={{ display: 'block' }}>
      <path d="M3 7.5l2.6 2.6L11 4.5" fill="none" stroke="#10b981" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  if (v === false) return (
    <svg role="img" aria-label="Não incluído" width={13} height={13} viewBox="0 0 14 14" style={{ display: 'block' }}>
      <path d="M4 7h6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" style={{ color: 'rgba(128,128,128,.6)' }} />
    </svg>
  );
  return <Typography component="span" sx={{ fontSize: 10.5, fontWeight: 700, textAlign: 'center', lineHeight: 1.3 }}>{v}</Typography>;
};

/** Linha/grupa que dobra: 1fr↔0fr com overflow hidden (u217-rw / u217-gp). */
const Fold = ({ off, children, sx }: { off: boolean; children: ReactNode; sx?: object }) => (
  <Box sx={{
    display: 'grid', gridTemplateRows: off ? '0fr' : '1fr', opacity: off ? 0 : 1,
    transition: 'grid-template-rows .45s cubic-bezier(.3,.8,.3,1), opacity .3s',
    '&>div': { minHeight: 0, overflow: 'hidden' },
    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
    ...sx,
  }}>
    <div>{children}</div>
  </Box>
);

/** Switch "Só diferenças" (u217-df): track 28×18, knob 14 pop translateX(10px). */
const DiffSwitch = ({ on, onToggle }: { on: boolean; onToggle: () => void }) => (
  <Box
    component="button" type="button" role="switch" aria-checked={on}
    onClick={onToggle}
    sx={{
      display: 'inline-flex', alignItems: 'center', gap: '7px', minHeight: 44, px: '10px',
      border: 0, borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
      bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.03)',
      boxShadow: (t) => `inset 0 0 0 1px ${t.palette.divider}`,
      color: 'text.secondary', fontSize: 10.5, fontWeight: 700,
      '&:focus-visible': { outline: '2px solid #20b2aa', outlineOffset: 2 },
    }}
  >
    Só diferenças
    <Box aria-hidden="true" sx={{
      position: 'relative', width: 28, height: 18, borderRadius: 9, flex: 'none',
      background: on ? '#20b2aa' : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.10)',
      transition: 'background .2s',
      '&::after': {
        content: '""', position: 'absolute', left: 2, top: 2, width: 14, height: 14, borderRadius: '50%',
        background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.25)',
        transform: on ? 'translateX(10px)' : 'translateX(0)',
        transition: 'transform .25s cubic-bezier(.3,1.5,.5,1)',
      },
      '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&::after': { transition: 'none' } },
    }} />
  </Box>
);

export const PlanComparison = ({ title, columns, groups }: {
  title: string;
  columns: [ComparisonColumn, ComparisonColumn, ComparisonColumn];
  groups: ComparisonGroup[];
}) => {
  const t = useTheme();
  const isMobile = useMediaQuery(t.breakpoints.down('sm'));
  const [diffOnly, setDiffOnly] = useState(false);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [selCol, setSelCol] = useState(1); // mobile: Premium destacado por padrão
  const accent = t.palette.mode === 'dark' ? '#5fc9c3' : '#20b2aa';

  const decorated = groups.map((g) => ({
    ...g,
    rows: g.rows.map((r) => ({ ...r, off: diffOnly && isSame(r) })),
  }));

  /* ── MOBILE: tabela vira cartões empilhados; selecionado destacado (regra do dono). ── */
  if (isMobile) {
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
          <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 16 }}>{title}</Typography>
          <DiffSwitch on={diffOnly} onToggle={() => setDiffOnly((v) => !v)} />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {columns.map((c, i) => {
            const on = selCol === i;
            return (
              <Box
                key={c.name}
                component="button" type="button"
                aria-pressed={on}
                onClick={() => setSelCol(i)}
                sx={{
                  textAlign: 'left', border: '2px solid', cursor: 'pointer', fontFamily: 'inherit',
                  borderColor: on ? accent : 'divider', borderRadius: '16px', p: 1.5,
                  bgcolor: on ? (th) => alpha(accent, th.palette.mode === 'dark' ? 0.10 : 0.05) : 'background.paper',
                  color: 'text.primary',
                  boxShadow: on ? `0 12px 32px -12px ${alpha(accent, 0.45)}` : `0 0 0 1px ${t.palette.divider}`,
                  transition: 'border-color .2s ease, background-color .2s ease, box-shadow .2s ease',
                  minHeight: 44,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 15, flex: 1 }}>{c.name}</Typography>
                  {c.badge && (
                    <Box component="span" sx={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', px: '6px', py: '2px', borderRadius: 99, bgcolor: '#d4a574', color: '#3d2a05' }}>
                      {c.badge}
                    </Box>
                  )}
                  <Typography component="b" sx={{ fontSize: 14, fontWeight: 800, color: on ? tealText(t.palette.mode) : 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                    {c.price}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: 11, color: 'text.disabled', fontWeight: 700, mt: '2px' }}>{c.period}</Typography>
                <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column' }}>
                  {decorated.map((g) => {
                    const rows = g.rows.filter((r) => !r.off);
                    if (!rows.length) return null;
                    return (
                      <Box key={g.title} sx={{ mb: 0.75 }} aria-hidden={false}>
                        <Typography sx={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: tealText(t.palette.mode) }}>{g.title}</Typography>
                        {rows.map((r) => (
                          <Box key={r.label} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, minHeight: 32, borderBottom: `1px solid ${t.palette.divider}` }}>
                            <Typography component="span" sx={{ fontSize: 11.5, color: 'text.secondary' }}>{r.label}</Typography>
                            <Box component="span" sx={{ fontSize: 11.5, fontWeight: 700, textAlign: 'right', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                              <CellValueView v={r.cells[i]} />
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  }

  /* ── SM+ : tabela do #217 — header sticky no scroll interno, hover acende a coluna. ── */
  return (
    <Box sx={{
      position: 'relative', borderRadius: '20px', overflow: 'hidden',
      background: 'background.paper', color: 'text.primary',
      boxShadow: (th) => `0 0 0 1px ${th.palette.divider}, 0 30px 60px -36px rgba(15,110,104,.35)`,
    }}>
      <Box sx={{ px: 2, pt: 1.5, pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em' }}>{title}</Typography>
        <DiffSwitch on={diffOnly} onToggle={() => setDiffOnly((v) => !v)} />
      </Box>
      <Box
        sx={{ maxHeight: 440, overflowY: 'auto', overscrollBehavior: 'contain', px: 1.25, pb: 2 }}
        onPointerLeave={() => setHoverCol(null)}
        tabIndex={0}
        aria-label="Comparação de recursos dos planos"
      >
        {/* header pinado (u217-hd) */}
        <Box sx={{
          position: 'sticky', top: 0, zIndex: 2, bgcolor: 'background.paper',
          py: '6px', boxShadow: `0 1px 0 ${t.palette.divider}`,
          display: 'grid', gridTemplateColumns: '1fr 68px 68px 68px', alignItems: 'center',
        }}>
          <span />
          {columns.map((c, i) => {
            const hot = hoverCol === i;
            return (
              <Box key={c.name} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', position: 'relative', pt: '12px', px: '2px' }}>
                {c.badge && (
                  <Box component="em" sx={{
                    position: 'absolute', top: -1, fontStyle: 'normal', fontSize: 8.5, fontWeight: 800,
                    letterSpacing: '.05em', px: '6px', py: '1px', borderRadius: 99, bgcolor: '#d4a574', color: '#3d2a05', whiteSpace: 'nowrap',
                  }}>
                    {c.badge}
                  </Box>
                )}
                <Typography component="b" sx={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>{c.name}</Typography>
                <Typography component="small" sx={{ fontSize: 9.5, fontWeight: 700, color: 'text.disabled', fontVariantNumeric: 'tabular-nums' }}>{c.period}</Typography>
                <Box component="span" sx={{
                  mt: '4px', height: 22, px: '9px', borderRadius: 99, lineHeight: '22px', fontSize: 9.5, fontWeight: 800,
                  whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
                  boxShadow: hot ? 'none' : `inset 0 0 0 1px ${t.palette.divider}`,
                  bgcolor: hot ? 'text.primary' : 'transparent',
                  color: hot ? 'background.paper' : 'text.secondary',
                  transition: 'background .2s, color .2s, box-shadow .2s',
                }}>
                  {c.price}
                </Box>
              </Box>
            );
          })}
        </Box>
        {/* grupos/linhas (u217-gp / u217-rw) */}
        {decorated.map((g) => {
          const visible = g.rows.filter((r) => !r.off).length;
          return (
            <Fold key={g.title} off={visible === 0}>
              <Box>
                <Typography sx={{ px: '6px', pt: '14px', pb: '4px', fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: tealText(t.palette.mode) }}>
                  {g.title}
                </Typography>
                {g.rows.map((r) => (
                  <Fold key={r.label} off={r.off}>
                    <Box sx={{
                      display: 'grid', gridTemplateColumns: '1fr 68px 68px 68px', alignItems: 'center',
                      minHeight: 34, borderBottom: `1px solid ${t.palette.divider}`,
                    }}>
                      <Typography component="span" sx={{ px: '6px', fontSize: 11, fontWeight: 600, color: 'text.secondary', lineHeight: 1.3 }}>{r.label}</Typography>
                      {r.cells.map((v, i) => (
                        <Box
                          key={i}
                          component="span"
                          onPointerOver={() => setHoverCol(i)}
                          sx={{
                            display: 'grid', placeItems: 'center', alignSelf: 'stretch',
                            fontSize: 10.5, fontWeight: 700, px: '2px',
                            bgcolor: hoverCol === i ? alpha(accent, 0.09) : 'transparent',
                            transition: 'background .2s',
                          }}
                        >
                          <CellValueView v={v} />
                        </Box>
                      ))}
                    </Box>
                  </Fold>
                ))}
              </Box>
            </Fold>
          );
        })}
      </Box>
    </Box>
  );
};
