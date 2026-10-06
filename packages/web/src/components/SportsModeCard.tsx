import { useEffect, useState } from 'react';
import { Box, Button, Chip, FormControlLabel, Stack, Switch, Typography } from '@mui/material';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import LockIcon from '@mui/icons-material/Lock';
import { useNotify, useStore } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { API_URL, apiHeaders, fetchPublicConfig } from '../config';
import { usePremium } from './PremiumGate';
import { DeclaredSubstanceForm } from './DeclaredSubstanceForm';
import { tealText } from '../theme';

/**
 * SAÚDE ESPORTIVA (E1.5) — card do Perfil › Preferências.
 *
 * Camadas de gate (nesta ordem):
 *  1. KILL-SWITCH ADMIN: /api/public/config sportsMode.enabled=0 → o card NEM EXISTE
 *     (default OFF — paciente normal intocável).
 *  2. PREMIUM: card visível, mas ATIVAR exige plano (padrão usePremium do app; CTA
 *     "Disponível no Premium" → /planos, como os outros gates).
 *  3. Toggle persistido por paciente via useStore + PUT /sports/profile inicializando
 *     vazio no server. AINDA NÃO troca o dashboard (isso é E4) — MVP mostra o chip
 *     de confirmado "modo ativado" + o form de substância declarada (E1.4).
 */

/** Corpo do card com TODAS as decisões como props (contrato testável via SSR). */
export const SportsModeCardBase = ({ pid, enabled, premium }: { pid: string; enabled: boolean; premium: boolean }) => {
  const notify = useNotify();
  const navigate = useNavigate();
  // Persistido POR PACIENTE (useStore re-sincroniza quando a key muda — ver ra-core useStore).
  const [on, setOn] = useStore(pid ? `sportsMode.${pid}` : 'sportsMode', false);

  const toggle = async (next: boolean) => {
    setOn(next);
    if (!next) return; // desligar é só local — dados declarados permanecem (LGPD)
    const r = await fetch(`${API_URL}/sports/profile`, { method: 'PUT', headers: apiHeaders(true), body: JSON.stringify({}) });
    if (!r.ok) {
      setOn(false);
      notify(r.status === 403 ? 'Saúde Esportiva está desativada no momento.' : 'Não foi possível ativar o modo.', { type: 'error' });
      return;
    }
    notify('Modo esportivo ativado ✨', { type: 'success' });
  };

  // ── gate 1: kill-switch admin (default OFF) → o card nem existe ──
  if (!enabled) return null;

  // ── gate 2: sem premium → card de upgrade (padrão dos outros gates do app) ──
  if (!premium) {
    return (
      <Box sx={{ mt: 2.5, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Box sx={{
          p: 2, borderRadius: '14px', textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75,
          background: 'linear-gradient(135deg, rgba(32,178,170,.10), rgba(32,178,170,.02))',
          border: '1px dashed rgba(32,178,170,.45)',
        }}>
          <LockIcon sx={{ fontSize: 26, color: (t) => tealText(t.palette.mode) }} />
          <Typography sx={{ fontWeight: 800, fontSize: 14.5, color: 'text.primary' }}>Saúde Esportiva</Typography>
          <Typography variant="caption" color="text.secondary">
            Interprete seus exames no contexto do treino e das substâncias declaradas — com as perguntas certas pro seu médico.
          </Typography>
          <Button variant="contained" size="small" onClick={() => navigate('/planos')}
            sx={{ mt: 0.5, borderRadius: '12px', textTransform: 'none', fontWeight: 700, bgcolor: '#20b2aa', boxShadow: 'none', '&:hover': { bgcolor: 'primary.dark' } }}>
            Disponível no Premium
          </Button>
        </Box>
      </Box>
    );
  }

  // ── gate 3: premium + flag on → toggle + MVP (chip; dashboard esportivo é E4) ──
  return (
    <Box sx={{ mt: 2.5, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box sx={{
          width: 40, height: 40, borderRadius: '12px', display: 'grid', placeItems: 'center', flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(32,178,170,.18), rgba(32,178,170,.08))',
          color: (t) => tealText(t.palette.mode), border: '1px solid rgba(32,178,170,.15)',
        }}><FitnessCenterIcon /></Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 15, color: 'text.primary' }}>Saúde Esportiva</Typography>
          <Typography variant="caption" color="text.secondary">
            Organiza o que você declara (treino, substâncias, coleta) para contextualizar a análise — nunca esconde alterações.
          </Typography>
        </Box>
        <FormControlLabel control={<Switch checked={on} onChange={(e) => void toggle(e.target.checked)} />} label="" sx={{ m: 0 }} />
      </Stack>

      {on && (
        <>
          <Chip size="small" color="success" sx={{ mt: 1.5, fontWeight: 700 }} label="✓ Modo esportivo ativado" />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            O painel esportivo dedicado chega nas próximas semanas — suas declarações já alimentam a análise.
          </Typography>
          <DeclaredSubstanceForm pid={pid} />
        </>
      )}
    </Box>
  );
};

/** Container do Perfil: resolve a config pública (kill-switch) e o plano, e monta o Base. */
export const SportsModeCard = ({ pid }: { pid: string }) => {
  const premium = usePremium();
  const [enabled, setEnabled] = useState(false); // default OCULTO até o config responder
  useEffect(() => {
    let alive = true;
    fetchPublicConfig()
      .then((c) => { if (alive) setEnabled(c.sportsMode.enabled === 1); })
      .catch(() => { if (alive) setEnabled(false); });
    return () => { alive = false; };
  }, []);
  return <SportsModeCardBase pid={pid} enabled={enabled} premium={premium} />;
};
