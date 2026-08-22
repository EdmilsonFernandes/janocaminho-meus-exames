import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, MenuItem, Stack, Typography, CircularProgress, IconButton, Box, LinearProgress, useMediaQuery, useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useTranslate, useRefresh } from 'react-admin';
import { API_URL, apiHeaders } from '../config';
import { useSelectedPatient } from '../patient-context';
import { DateFieldBR } from './DateFieldBR';
import { formatCpf, isValidCpf } from '../utils/cpf';

// Supressão de "Agora não" POR SESSÃO (não mais localStorage permanente): o flag por dispositivo
// fazia o modal nunca mais aparecer depois de 1 skip ou 1 troca de aparelho — e a completude
// real é avaliada pelo SERVER (profileCompleteness), então usuário que completa em outro
// dispositivo não é re-perguntado. O Dashboard (NextStepsCard) continua orientando depois.
const SKIP_FLAG = 'profileSkippedSession';

/** "70,5" → 70.5 · "70.5" → 70.5 · lixo → NaN. Com vírgula: pontos são milhar (1.70,5→170.5); sem vírgula: ponto é decimal. */
const parseBR = (s: string) => {
  const t = String(s).trim();
  if (!t) return NaN;
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'));
  return Number(t);
};
/** Mantém dígitos + UM separador (.,) — normaliza '.' repetido/trailing. */
const sanitizeDecimal = (s: string) => {
  const t = s.replace(/[^\d.,]/g, '');
  const i = t.search(/[.,]/);
  if (i < 0) return t;
  return t.slice(0, i + 1).replace(/[.,]/, ',') + t.slice(i + 1).replace(/[^\d]/g, '');
};

type StepKey = 'profile' | 'body' | 'cpf';

/**
 * ONBOARDING DE DADOS ("Vamos preparar o Dr. Exame pra você") — stepper pós-login quando
 * faltam dados ESSENCIAIS (sexo, nascimento, altura, peso, CPF).
 * PASSOS DINÂMICOS (fix 2026-08-22): só o que está FALTANDO aparece — faltando só CPF,
 * o usuário cai DIRETO no CPF (antes: passeava por sexo/altura/peso já preenchidos).
 * Etapa salva ao avançar (abandono no meio não perde o que já digitou). Peso/altura aceitam
 * vírgula E ponto (teclado BR) — inputs são text + sanitize, nunca type=number.
 */
export const CompleteProfileModal = () => {
  const translate = useTranslate();
  const refresh = useRefresh();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [pid] = useSelectedPatient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [gender, setGender] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [dob, setDob] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [cpf, setCpf] = useState('');
  const [needsCpf, setNeedsCpf] = useState(false);
  const [cpfError, setCpfError] = useState('');
  // Passos que vão aparecer — decididos depois do load, pelo que falta de verdade.
  const [steps, setSteps] = useState<StepKey[]>([]);

  useEffect(() => {
    if (!pid) return;
    if (sessionStorage.getItem(SKIP_FLAG) === '1') { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_URL}/patients/${pid}`, { headers: apiHeaders() });
        if (!r.ok) return;
        const p = await r.json();
        if (cancelled) return;
        setGender(p.gender ?? '');
        setHeightCm(p.heightCm != null ? String(p.heightCm) : '');
        setDob(p.dateOfBirth ? p.dateOfBirth.split('T')[0] : '');
        setWeightKg(p.weightKg != null ? String(p.weightKg).replace('.', ',') : '');
        setNeedsCpf(!p.hasCpf);
        // INTELIGÊNCIA: monta a fila SÓ com o que falta (fonte: campos reais do paciente).
        // Faltando só CPF → passo único de CPF. Nada faltando → nem abre.
        const queue: StepKey[] = [];
        if (!p.gender || !p.dateOfBirth) queue.push('profile');
        if (p.heightCm == null || p.weightKg == null) queue.push('body');
        if (!p.hasCpf) queue.push('cpf');
        if (queue.length > 0) { setSteps(queue); setStep(0); setOpen(true); }
      } catch {
        // best-effort: se falhar (offline), simplesmente não mostra — não bloqueia o app.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pid]);

  const close = () => { sessionStorage.setItem(SKIP_FLAG, '1'); setOpen(false); };

  const current: StepKey | undefined = steps[step];
  const stepCount = Math.max(steps.length, 1);

  const saveProfileFields = async () => {
    await fetch(`${API_URL}/patients/${pid}`, {
      method: 'PUT',
      headers: apiHeaders(true),
      body: JSON.stringify({
        gender,
        heightCm: heightCm ? parseBR(heightCm) : null,
        dateOfBirth: dob || null,
      }),
    });
  };

  const saveWeight = async () => {
    const kg = parseBR(weightKg);
    if (!weightKg || !Number.isFinite(kg) || kg <= 0) return;
    await fetch(`${API_URL}/measurements`, {
      method: 'POST',
      headers: apiHeaders(true),
      // measuredAt é obrigatório no server (400 sem ele) — QA 2026-08 pegou o peso sumindo.
      // ISO COMPLETO (não date-only): '2026-08-22' vira meia-noite UTC e exibe como o dia
      // anterior no fuso BR (vi um peso de 22/08 aparecer como 21/08).
      body: JSON.stringify({ patientId: pid, type: 'WEIGHT', value: kg, unit: 'kg', measuredAt: new Date().toISOString() }),
    }).catch(() => {});
  };

  const saveCpf = async () => {
    if (!isValidCpf(cpf)) { setCpfError('CPF inválido — confira os números.'); return false; }
    const r = await fetch(`${API_URL}/patients/${pid}`, {
      method: 'PUT',
      headers: apiHeaders(true),
      body: JSON.stringify({ cpf: String(cpf).replace(/\D/g, '') }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setCpfError(d.error === 'CPF inválido.' || String(d.error).includes('outro paciente')
        ? 'Este CPF já está cadastrado em outra conta. Fale com o suporte se for seu.'
        : 'Não conseguimos salvar o CPF. Tente de novo.');
      return false;
    }
    return true;
  };

  const next = async () => {
    setSaving(true);
    try {
      if (current === 'profile') await saveProfileFields();
      if (current === 'body') { await saveProfileFields(); await saveWeight(); }
      if (current === 'cpf') { const ok = await saveCpf(); if (!ok) { setSaving(false); return; } }
      // Dados de perfil mudaram → dashboard/tiles reagem na hora (mesmo sem concluir).
      window.dispatchEvent(new Event('dx-profile-updated'));
      if (step < steps.length - 1) setStep(step + 1);
      else { setOpen(false); refresh(); }
    } finally {
      setSaving(false);
    }
  };

  // Validação por etapa: sexo/nascimento/altura são essenciais (gates de cálculo); peso e CPF
  // são encorajados mas avançam (o Dashboard orienta depois — nada de beco sem saída).
  const canAdvance =
    current === 'profile' ? (!!gender && !!dob)
    : current === 'body' ? (!!heightCm && parseBR(heightCm) > 50)
    : true;

  if (loading || !open) return null;

  return (
    <Dialog open onClose={close} fullScreen={isMobile} PaperProps={{ sx: { borderRadius: isMobile ? 0 : '12px', maxWidth: 440, width: '100%' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1, pb: 0.5 }}>
        <Box>
          <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 19, color: 'text.primary' }}>
            Vamos preparar o Dr. Exame
          </Typography>
          <Typography variant="caption" color="text.secondary">Passo {step + 1} de {steps.length}</Typography>
        </Box>
        <IconButton size="small" onClick={close} aria-label="Fechar"><CloseIcon /></IconButton>
      </DialogTitle>
      <LinearProgress variant="determinate" value={((step + 1) / stepCount) * 100} sx={{ mx: isMobile ? 2 : 3, borderRadius: 999, height: 6, mb: 1 }} />

      <DialogContent>
        {current === 'profile' && (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Essas informações personalizam as <b>faixas de referência</b> dos seus exames e os cálculos de idade biológica e função renal.
            </Typography>
            <TextField select label="Sexo" value={gender} onChange={(e) => setGender(e.target.value)} fullWidth required>
              <MenuItem value="male">Masculino</MenuItem>
              <MenuItem value="female">Feminino</MenuItem>
            </TextField>
            <DateFieldBR label="Data de nascimento" value={dob} onChange={setDob} fullWidth />
          </Stack>
        )}
        {current === 'body' && (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Altura e peso calculam seu <b>IMC</b> e entram na leitura de risco cardiometabólico.
            </Typography>
            {/* text + sanitize (NUNCA type=number): teclado decimal BR manda vírgula e o browser
                descarta silenciosamente em input[number] — era o "peso não aceita vírgula". */}
            <TextField label="Altura (cm)" value={heightCm} onChange={(e) => setHeightCm(e.target.value.replace(/[^\d]/g, '').slice(0, 3))} fullWidth required inputProps={{ inputMode: 'numeric' }} />
            <TextField label="Peso atual (kg)" value={weightKg} onChange={(e) => setWeightKg(sanitizeDecimal(e.target.value))} fullWidth inputProps={{ inputMode: 'decimal' }} helperText="Aceita vírgula ou ponto (ex.: 70,5). Vai pras suas Medições — acompanhe a tendência por lá." />
          </Stack>
        )}
        {current === 'cpf' && (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              O CPF confirma que os exames que você enviar são <b>seus</b> — é ele que valida a identidade nos PDFs e libera o bônus do 1º exame.
            </Typography>
            <TextField
              label="CPF" value={formatCpf(cpf)} onChange={(e) => { setCpf(e.target.value); setCpfError(''); }} fullWidth
              error={!!cpfError} helperText={cpfError || 'Só visível pra você — armazenado criptografado.'} inputProps={{ inputMode: 'numeric', maxLength: 14 }}
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', gap: 1, px: 3, pb: 2.5, alignItems: 'center' }}>
        <Button onClick={close} variant="text" sx={{ textTransform: 'none' }}>Agora não</Button>
        <Button onClick={next} variant="contained" disabled={saving || !canAdvance} endIcon={step < steps.length - 1 ? <ArrowForwardIcon /> : undefined} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 800 }}>
          {saving ? <CircularProgress size={20} /> : step < steps.length - 1 ? 'Continuar' : 'Concluir'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
