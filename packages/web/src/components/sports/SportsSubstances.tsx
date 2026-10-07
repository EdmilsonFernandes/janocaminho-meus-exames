// SportsSubstances (E4.2 §7) — substâncias/suplementos DECLARADOS (grid de AppCards,
// padrão do preview §3). Fontes (E1.4): Medications com prefixo "[Classe] Nome" +
// `declaredSubstances` do SportsProfile. Confidenciais (LGPD) — o card declara isso.
// NUNCA sugere dose/ciclo: só espelha o que o próprio paciente declarou.
// E5 §2: cada card traz "Impacto nos exames" do catálogo educativo (HAARLEM/JCEM) —
// descritivo (O QUE esperar), sem dose/range/recomendação. Nome sem match no catálogo
// → linha genérica honesta (a declaração já contextualiza; efeito não é inventado).
import { Box, Chip, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import MedicationIcon from '@mui/icons-material/Medication';
import { AppCard } from '../AppCard';
import { EmptyState } from '../EmptyState';
import { RADIUS } from '../../theme';
import { impactFor } from './substanceCatalog';

export interface DeclaredSubstanceView {
  id: string;
  /** Nome sem o prefixo "[Classe]". */
  name: string;
  /** "Hormônio" | "Suplemento" | "Outro" (do prefixo) ou "Declarada". */
  klass?: string | null;
  dosage?: string | null;
  startedAt?: string | null;
}

const CLASS_TINT: Record<string, string> = { 'Hormônio': '#d4a574', 'Suplemento': '#20b2aa', 'Outro': '#64748b' };

export const SportsSubstances = ({ substances }: { substances: DeclaredSubstanceView[] }) => (
  <AppCard sx={{ p: { xs: 2, sm: 2.5 } }}>
    <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1} sx={{ mb: 0.5, flexWrap: 'wrap' }}>
      <Typography component="h2" sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 15 }}>
        Substâncias declaradas
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Confidencial · Registro LGPD</Typography>
    </Stack>
    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.75 }}>
      O que você declarou entra como CONTEXTO da análise — o app nunca sugere dose, ciclo ou substância.
    </Typography>

    {substances.length === 0 ? (
      <EmptyState emoji="💊" title="Nenhuma substância declarada"
        desc="Declare hormônios e suplementos no seu Perfil › Saúde Esportiva para contextualizar a leitura dos exames." />
    ) : (
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
        {substances.map((s) => {
          const tint = CLASS_TINT[s.klass ?? ''] ?? '#64748b';
          // Impacto nos exames: catálogo (match exato nome/alias) OU linha genérica.
          const impacto = impactFor(s.name) ?? 'Impacto depende da substância — sua declaração já contextualiza a análise.';
          return (
            <Box key={s.id} sx={{
              borderRadius: RADIUS.tile, p: 1.5, minWidth: 0,
              bgcolor: alpha(tint, 0.06), border: `1px solid ${alpha(tint, 0.25)}`,
            }}>
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <Box sx={{ width: 32, height: 32, borderRadius: '10px', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: alpha(tint, 0.14), color: tint }}>
                  <MedicationIcon sx={{ fontSize: 18 }} />
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" spacing={0.5} alignItems="center" useFlexGap flexWrap="wrap">
                    <Typography sx={{ fontWeight: 800, fontSize: 13.5, lineHeight: 1.2, wordBreak: 'break-word' }}>{s.name}</Typography>
                    {s.dosage && (
                      <Chip size="small" label={`dose declarada`} sx={{ height: 20, fontSize: 10.5, fontWeight: 700, bgcolor: alpha(tint, 0.12), color: 'text.secondary' }} />
                    )}
                  </Stack>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.35 }}>
                    {s.klass ?? 'Declarada'}{s.dosage ? ` · ${s.dosage}` : ''}{s.startedAt ? ` · desde ${new Date(s.startedAt).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}` : ''}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.5, lineHeight: 1.45, color: 'text.secondary' }}>
                    <Box component="b" sx={{ fontWeight: 800, color: 'text.primary' }}>Impacto nos exames:</Box> {impacto}
                  </Typography>
                </Box>
              </Stack>
            </Box>
          );
        })}
      </Box>
    )}
  </AppCard>
);
