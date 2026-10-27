// SportsStackCard (redesign hormonal v2, mock T3) — "Seu stack": substâncias declaradas
// com arte por via, badge de estado (EM USO/PAREI), meta de uso relatado e CHIPS DE
// IMPACTO derivados do catálogo educativo (HDL ↓ · Hematócrito ↑ · eixo ↓ · CK ↑…).
// Substitui a lista do SportsSubstances no dashboard (export antigo mantido p/ imports).
// LGPD: sem logs; exclusão 1-tap; nome/dose = só o que o próprio paciente declarou.
import { Box, Chip, IconButton, Stack, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import AddIcon from '@mui/icons-material/Add';
import { useNotify } from 'react-admin';
import { API_URL, token } from '../../config';
import { AppCard } from '../AppCard';
import { tealText } from '../../theme';
import { impactFor, catalogFindByToken, artFor } from './substanceCatalog';
import { SubstanceArt } from './SubstanceArt';
import { readProfileList, putSportsProfile } from './DeclareSubstanceSheet';
import type { DeclaredSubstanceView } from './SportsSubstances';

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** ISO yyyy-mm-… → "ago/26" (meta curta do mock). */
const mmYy = (iso?: string | null): string | null => {
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? '');
  if (!m) return null;
  return `${MONTHS_SHORT[Number(m[2]) - 1]}/${m[1].slice(2)}`;
};

const monthsBetween = (a?: string | null, b?: string | null): number | null => {
  const ma = /^(\d{4})-(\d{2})/.exec(a ?? '');
  const mb = /^(\d{4})-(\d{2})/.exec(b ?? '');
  if (!ma || !mb) return null;
  const diff = (Number(mb[1]) - Number(ma[1])) * 12 + (Number(mb[2]) - Number(ma[2]));
  return diff > 0 ? diff : null;
};

/** Chips curtos de impacto (spec §StackCard): parse simples do texto educativo do
 *  catálogo — 2-4 chips; sem match → 1 chip genérico honesto (nunca inventa efeito). */
const impactChips = (name: string): { label: string; warn?: boolean }[] => {
  const txt = impactFor(name);
  const out: { label: string; warn?: boolean }[] = [];
  const push = (label: string, warn = false) => { if (!out.some((c) => c.label === label)) out.push({ label, warn }); };
  if (!txt) return [{ label: 'impacto no perfil hormonal' }];
  if (/HDL/.test(txt)) push('HDL ↓', true);
  if (/hemat[oó]crito|hemoglobina|\bHb\b|eritro/.test(txt)) push('Hematócrito ↑', true);
  if (/LH\/FSH|eixo/.test(txt)) push('eixo LH/FSH ↓', true);
  if (/\bCK\b/.test(txt)) push('CK ↑', true);
  if (/estradiol|estrog[eê]|\bE2\b/.test(txt)) push('E2 ~');
  if (/testosterona total/.test(txt)) push('Testosterona ↑');
  if (/IGF-1/.test(txt)) push('IGF-1 ↑');
  if (/insulina|glicemia|sensibilidade/.test(txt)) push('glicemia/insulina');
  if (/press[aã]o/.test(txt)) push('PA ↑');
  if (/TGO|TGP|hep[aá]tic/.test(txt)) push('TGO/TGP ↑');
  if (/creatinina/.test(txt)) push('Creatinina ↑');
  if (/ureia/.test(txt)) push('Ureia ↑');
  if (/taquicardia|frequ[eê]ncia card|eletrocardiograma|pot[aá]ssio/.test(txt)) push('FC/eletrolitos');
  return out.length > 0 ? out.slice(0, 4) : [{ label: 'impacto no perfil hormonal' }];
};

export interface SportsStackCardProps {
  pid: string | null;
  substances: DeclaredSubstanceView[];
  onAdd: () => void;
  onEdit: (s: DeclaredSubstanceView) => void;
  /** Pós DELETE/mirror → dashboard recarrega meds+perfil. */
  onChanged: () => void;
}

export const SportsStackCard = ({ pid, substances, onAdd, onEdit, onChanged }: SportsStackCardProps) => {
  const notify = useNotify();
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const copperText = dark ? '#e3bd8f' : '#8a6240';

  const active = substances.filter((s) => s.endStatus !== 'interrompi').length;
  const stopped = substances.length - active;

  const remove = async (s: DeclaredSubstanceView) => {
    // Item só do SportsProfile (legacy "sp-*") → sai da lista do perfil via PUT.
    if (s.id.startsWith('sp-')) {
      const cur = await readProfileList(pid ?? '', 'declaredSubstances');
      const next = cur.filter((x) => x.toLowerCase() !== s.name.toLowerCase());
      const ok = await putSportsProfile(pid ? { patientId: pid, declaredSubstances: next } : { declaredSubstances: next });
      if (ok) { notify('Declaração removida.', { type: 'info' }); onChanged(); }
      else notify('Erro ao remover.', { type: 'error' });
      return;
    }
    const r = await fetch(`${API_URL}/medications/${s.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) { notify('Declaração removida.', { type: 'info' }); onChanged(); }
    else notify('Erro ao remover.', { type: 'error' });
  };

  return (
    <AppCard
      id="sports-stack"
      sx={{
        p: { xs: 2, sm: 2.5 },
        borderRadius: '18px',
        minWidth: 0,
        gridColumn: { md: '2' },
        border: '1px solid rgba(212,165,116,.3)',
        background: dark
          ? 'linear-gradient(150deg,rgba(212,165,116,.07),rgba(32,178,170,.04))'
          : 'linear-gradient(150deg,rgba(212,165,116,.08),rgba(32,178,170,.03))',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Box sx={{
          width: 30, height: 30, borderRadius: '10px', display: 'grid', placeItems: 'center', flexShrink: 0,
          bgcolor: 'rgba(212,165,116,.14)', fontSize: 15,
        }}>💊</Box>
        <Typography component="h2" sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 15 }}>
          Seu stack
        </Typography>
        {substances.length > 0 && (
          <Typography noWrap sx={{ ml: 'auto', fontSize: 11, fontWeight: 600, color: 'text.disabled' }}>
            {active} {active === 1 ? 'ativo' : 'ativos'}{stopped > 0 ? ` · ${stopped} ${stopped === 1 ? 'passado' : 'passados'}` : ''}
          </Typography>
        )}
      </Stack>

      {substances.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 13 }}>
          Nenhuma substância declarada ainda — declare em 2 toques para os seus exames ganharem contexto.
        </Typography>
      ) : (
        substances.map((s) => {
          const stop = s.endStatus === 'interrompi';
          const hit = catalogFindByToken(s.name);
          const started = mmYy(s.startedAt);
          const ended = mmYy(s.endedAt);
          const span = stop && started && ended ? monthsBetween(s.startedAt, s.endedAt) : null;
          const metaParts: string[] = [];
          if (started && ended) metaParts.push(`${started}–${ended}${span ? ` · ~${span} ${span === 1 ? 'mês' : 'meses'}` : ''}`);
          else if (started) metaParts.push(`desde ${started}`);
          else if (stop && ended) metaParts.push(`parou em ${ended}`);
          metaParts.push(s.dosage ? `${s.dosage} · relatado` : 'dose não informada');
          const badge = stop
            ? { label: 'PAREI', color: dark ? '#9db4b2' : '#5f6f6e', bg: alpha('#9db4b2', 0.14) }
            : s.endStatus === 'em_uso'
              ? { label: 'EM USO', color: dark ? '#5fd8d1' : '#0f766e', bg: alpha('#20b2aa', 0.16) }
              : { label: 'NÃO SEI', color: dark ? '#9db4b2' : '#5f6f6e', bg: alpha('#9db4b2', 0.1) };
          return (
            <Stack
              key={s.id}
              direction="row"
              spacing={1.25}
              alignItems="flex-start"
              sx={{ py: 1.5, borderBottom: '1px solid', borderColor: 'divider', '&:last-of-type': { borderBottom: 'none' } }}
            >
              <Box sx={{
                width: 44, height: 44, borderRadius: '13px', display: 'grid', placeItems: 'center', flexShrink: 0,
                bgcolor: 'rgba(212,165,116,.13)', border: '1px solid rgba(212,165,116,.3)',
                opacity: stop ? 0.6 : 1,
              }}>
                <SubstanceArt kind={artFor(hit)} size={26} tone="copper" />
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap">
                  <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 14.5, lineHeight: 1.2, wordBreak: 'break-word', color: stop ? 'text.secondary' : 'text.primary' }}>
                    {s.name}
                  </Typography>
                  <Chip
                    size="small"
                    label={badge.label}
                    sx={{
                      height: 20, fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em',
                      bgcolor: badge.bg, color: badge.color, '& .MuiChip-label': { px: 1 },
                    }}
                  />
                </Stack>
                <Typography sx={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: 'text.secondary', mt: 0.25, lineHeight: 1.4, wordBreak: 'break-word' }}>
                  {metaParts.join(' · ')}
                </Typography>
                <Stack direction="row" spacing={0.6} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
                  {impactChips(s.name).map((c) => (
                    <Chip
                      key={c.label}
                      size="small"
                      label={c.label}
                      sx={{
                        height: 22, fontSize: 10.5, fontWeight: 700,
                        bgcolor: c.warn ? 'rgba(212,165,116,.09)' : alpha(theme.palette.text.primary, 0.05),
                        border: `1px solid ${c.warn ? 'rgba(212,165,116,.25)' : alpha(theme.palette.text.primary, 0.09)}`,
                        color: c.warn ? copperText : 'text.secondary',
                        '& .MuiChip-label': { px: 1 },
                      }}
                    />
                  ))}
                </Stack>
              </Box>
              <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                <IconButton
                  aria-label={`Editar declaração de ${s.name}`}
                  onClick={() => onEdit(s)}
                  sx={{
                    width: 44, height: 44, borderRadius: '12px', border: '1px solid',
                    borderColor: 'divider', color: 'text.secondary', touchAction: 'manipulation',
                  }}
                >
                  <EditOutlinedIcon sx={{ fontSize: 17 }} />
                </IconButton>
                <IconButton
                  aria-label={`Remover declaração de ${s.name}`}
                  onClick={() => void remove(s)}
                  sx={{
                    width: 44, height: 44, borderRadius: '12px', border: '1px solid',
                    borderColor: 'divider', color: 'text.secondary', touchAction: 'manipulation',
                  }}
                >
                  <DeleteOutlineOutlinedIcon sx={{ fontSize: 17 }} />
                </IconButton>
              </Stack>
            </Stack>
          );
        })
      )}

      {/* CTA dashed — declaração SEMPRE via sheet (nunca /perfil — corrige A1) */}
      <Box
        component="button"
        type="button"
        onClick={onAdd}
        sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
          width: '100%', minHeight: 46, mt: 1, px: 1,
          border: '1.5px dashed rgba(32,178,170,.4)', borderRadius: '13px',
          bgcolor: 'rgba(32,178,170,.05)', color: tealText(theme.palette.mode),
          fontWeight: 700, fontSize: 13, cursor: 'pointer', touchAction: 'manipulation',
          '&:active': { transform: 'scale(.99)' },
        }}
      >
        <AddIcon sx={{ fontSize: 17 }} />
        Declarar outra substância
      </Box>

      <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.disabled', lineHeight: 1.5 }}>
        <b style={{ color: copperText }}>Educacional:</b> exames acompanham; não tornam o uso seguro. A decisão sobre continuar, pausar ou ajustar é sempre médica.
      </Typography>
    </AppCard>
  );
};
