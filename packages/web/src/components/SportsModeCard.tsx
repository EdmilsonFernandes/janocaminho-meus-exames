import { useEffect, useRef, useState } from 'react';
import { Box, Button, Chip, FormControlLabel, Stack, Switch, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import LockIcon from '@mui/icons-material/Lock';
import { useNotify, useStore } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { API_URL, apiHeaders, fetchPublicConfig } from '../config';
import { usePremium } from './PremiumGate';
import { DeclaredSubstanceForm } from './DeclaredSubstanceForm';
import { SportsProfileWizard } from './sports/SportsProfileWizard';
import { useSportsProfile } from '../hooks/useSportsProfile';
import { tealText } from '../theme';

/**
 * SAÚDE ESPORTIVA (E1.5) — card do Perfil › Preferências.
 *
 * Camadas de gate (nesta ordem):
 *  1. KILL-SWITCH ADMIN: /api/public/config sportsMode.enabled=0 → o card NEM EXISTE
 *     (default OFF — paciente normal intocável).
 *  2. PREMIUM: card visível, mas ATIVAR exige plano (padrão usePremium do app; CTA
 *     "Disponível no Premium" → /planos, como os outros gates).
 *  3. Toggle persistido por paciente via useStore + PUT /sports/profile (active nos
 *     DOIS sentidos — E4.1). Com active=true o DashboardV2 troca pro SportsDashboard;
 *     off = dashboard normal, idêntico ao atual. Form de substância declarada (E1.4).
 */

/** Corpo do card com TODAS as decisões como props (contrato testável via SSR). */
export const SportsModeCardBase = ({ pid, enabled, premium }: { pid: string; enabled: boolean; premium: boolean }) => {
  const notify = useNotify();
  const navigate = useNavigate();
  // Persistido POR PACIENTE (useStore re-sincroniza quando a key muda — ver ra-core useStore).
  const [on, setOn] = useStore(pid ? `sportsMode.${pid}` : 'sportsMode', false);
  // Fonte da verdade do toggle é o SERVIDOR (E4.1). O useStore é só cache local — cego,
  // deixava o Switch OFF num device onde o modo já estava ativo noutro (dessincronizado).
  // Hidrata UMA vez ao montar, sem pisar em toggle que o usuário já mexeu nesta sessão.
  const { profile } = useSportsProfile();
  const hydratedRef = useRef(false);
  const touchedRef = useRef(false);
  useEffect(() => {
    if (!profile || hydratedRef.current || touchedRef.current) return;
    hydratedRef.current = true;
    setOn(profile.active === true);
  }, [profile, setOn]);

  const toggle = async (next: boolean) => {
    touchedRef.current = true;
    setOn(next);
    // E4.1: os DOIS sentidos persistem no servidor (commit 3938a58f gravava só o "on" —
    // desligar deixava active=true e o dashboard continuava esportivo). Dados declarados
    // permanecem (LGPD); só o flag de exibição muda.
    const r = await fetch(`${API_URL}/sports/profile`, { method: 'PUT', headers: apiHeaders(true), body: JSON.stringify({ active: next }) });
    if (!r.ok) {
      setOn(false);
      notify(r.status === 403 ? 'Saúde Esportiva está desativada no momento.' : 'Não foi possível salvar o modo esportivo.', { type: 'error' });
      return;
    }
    notify(next ? 'Modo esportivo ativado ✨' : 'Modo esportivo desativado', { type: next ? 'success' : 'info' });
    // E4.1: invalida o cache de sessão do useSportsProfile → o dashboard troca na hora.
    try { window.dispatchEvent(new Event('sports-profile-changed')); } catch { /* SSR/test */ }
  };

  // ── gate 1: kill-switch admin (default OFF) → o card nem existe ──
  if (!enabled) return null;

  // ── gate 2: sem premium → card de upgrade com o QUE entra (3 bullets do painel) ──
  if (!premium) {
    return (
      <Box sx={{ mt: 2.5, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Box sx={{
          p: 2, borderRadius: '12px', textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75,
          background: 'linear-gradient(135deg, rgba(32,178,170,.10), rgba(32,178,170,.02))',
          border: '1px dashed rgba(32,178,170,.45)',
        }}>
          <LockIcon sx={{ fontSize: 26, color: (t) => tealText(t.palette.mode) }} />
          <Typography sx={{ fontWeight: 800, fontSize: 14.5, color: 'text.primary' }}>Saúde Esportiva</Typography>
          <Stack spacing={0.5} sx={{ textAlign: 'left', my: 0.5 }}>
            {[
              'Régua do laboratório com a meta definida pelo seu médico',
              'Substâncias declaradas com impacto esperado nos exames',
              'Perguntas prontas para levar à consulta',
            ].map((b) => (
              <Stack key={b} direction="row" spacing={0.75} alignItems="flex-start">
                <CheckIcon sx={{ fontSize: 16, mt: 0.25, color: (t) => tealText(t.palette.mode) }} />
                <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.45 }}>{b}</Typography>
              </Stack>
            ))}
          </Stack>
          <Button variant="contained" size="small" onClick={() => navigate('/planos')}
            sx={{ mt: 0.5, borderRadius: '12px', textTransform: 'none', fontWeight: 700, bgcolor: '#20b2aa', boxShadow: 'none', '&:hover': { bgcolor: 'primary.dark' } }}>
            Ver planos
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
            Seu painel dedicado está no Início — o esporte e o contexto hormonal abaixo mudam a LENTE de análise.
          </Typography>
          <SportsProfileWizard pid={pid} />
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
