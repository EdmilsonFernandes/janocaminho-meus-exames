// Diário de Saúde (estudo Guava 21/11 — gap #1): registro diário de sintomas +
// humor + energia em 15 segundos. UMA entrada por dia (upsert no server).
// Padrão visual: ReUI Frame/IconTile/Alert + Rating editável (mesma família da
// ficha de emergência). Streak alimenta retenção; os dados alimentam as
// correlações com IA (gap #2 — "Por que me sinto assim?").
import { useCallback, useEffect, useState } from 'react';
import { Button, Chip, Skeleton, TextField, Typography } from '@mui/material';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import {
  Frame, FramePanel, FrameHeader, FrameTitle, FrameDescription,
} from '@/components/reui/frame';
import { Badge as ReuiBadge } from '@/components/reui/badge';
import { IconTile } from '@/components/reui/icon-tile';
import { Rating } from '@/components/reui/rating';
import { PulseIcon } from '@/components/reui/icons';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';

interface DailyLogRow {
  id: string;
  date: string;
  symptoms: string[];
  mood: number | null;
  energy: number | null;
  note: string | null;
}

const SYMPTOMS: { key: string; label: string }[] = [
  { key: 'DOR_CABECA', label: 'Dor de cabeça' },
  { key: 'CANSAICO', label: 'Cansaço' },
  { key: 'INSONIA', label: 'Insônia' },
  { key: 'DOR_CORPO', label: 'Dor no corpo' },
  { key: 'NAUSEA', label: 'Náusea' },
  { key: 'TONTURA', label: 'Tontura' },
  { key: 'ANSIEDADE', label: 'Ansiedade' },
  { key: 'FALTA_AR', label: 'Falta de ar' },
  { key: 'DOR_ABDOMINAL', label: 'Dor abdominal' },
  { key: 'FEBRE', label: 'Febre' },
];
const SYMPTOM_LABEL = new Map(SYMPTOMS.map((s) => [s.key, s.label]));

const todayBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const dayLabel = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  const today = todayBR();
  const yest = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() - 86400000));
  if (iso.slice(0, 10) === today) return 'Hoje';
  if (iso.slice(0, 10) === yest) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

export const DiarioPage = () => {
  useReuiThemeSync();
  const [pid] = useSelectedPatient();
  const [logs, setLogs] = useState<DailyLogRow[] | null>(null);
  const [streak, setStreak] = useState(0);
  const [mood, setMood] = useState(0);
  const [energy, setEnergy] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Gap #2 — "Por que me sinto assim?": estatística do diário × Health Connect + IA
  const [insight, setInsight] = useState<{ ready: boolean; daysLogged: number; insights: { title: string; detail: string; support: number }[]; narration: string | null } | null>(null);
  const [insightBusy, setInsightBusy] = useState(false);

  const askWhy = async () => {
    if (!pid || insightBusy) return;
    setInsightBusy(true);
    setInsight(null);
    try {
      const r = await fetch(`${API_URL}/daily-logs/insights?patientId=${pid}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (r.ok) setInsight(await r.json());
    } finally { setInsightBusy(false); }
  };

  const load = useCallback(() => {
    if (!pid) return;
    const h = { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' };
    fetch(`${API_URL}/daily-logs?patientId=${pid}&days=30`, { headers: h })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: DailyLogRow[]) => setLogs(Array.isArray(rows) ? rows : []))
      .catch(() => setLogs([]));
    fetch(`${API_URL}/daily-logs/streak?patientId=${pid}`, { headers: h })
      .then((r) => (r.ok ? r.json() : { streak: 0 }))
      .then((j) => setStreak(Number(j.streak) || 0))
      .catch(() => {});
  }, [pid]);

  useEffect(() => { setLogs(null); load(); }, [load]);

  // Pré-carrega o registro de HOJE (se existir) no formulário
  useEffect(() => {
    if (!logs) return;
    const today = todayBR();
    const row = logs.find((l) => l.date.slice(0, 10) === today);
    if (row) {
      setMood(row.mood ?? 0);
      setEnergy(row.energy ?? 0);
      setSelected(row.symptoms ?? []);
      setNote(row.note ?? '');
    }
  }, [logs]);

  const toggleSymptom = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const canSave = mood > 0 || energy > 0 || selected.length > 0 || note.trim().length > 0;

  const save = async () => {
    if (!pid || !canSave || saving) return;
    setSaving(true);
    setSaved(false);
    try {
      const r = await fetch(`${API_URL}/daily-logs`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: pid,
          symptoms: selected,
          mood: mood || undefined,
          energy: energy || undefined,
          note: note.trim() || undefined,
          replaceSymptoms: true,
        }),
      });
      if (r.ok) { setSaved(true); load(); }
    } finally { setSaving(false); }
  };

  const recent = (logs ?? []).slice(0, 14);

  return (
    <PageContainer width="narrow" sx={{ pb: { xs: 10, sm: 5 } }}>
      <PageHeader
        icon={<PulseIcon className="size-6 text-teal-600 dark:text-teal-400" />}
        title="Diário de Saúde"
        subtitle="15 segundos por dia: como você está. Alimenta seus insights de IA e fica pronto para a próxima consulta."
      />

      <div className="dx-island space-y-4">
        {/* STREAK */}
        {streak > 0 && (
          <Frame>
            <FramePanel className="flex items-center justify-between gap-3 p-3.5">
              <div className="flex items-center gap-2.5">
                <span className="text-xl" aria-hidden>🔥</span>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {streak === 1 ? '1 dia seguido' : `${streak} dias seguidos`}
                </Typography>
              </div>
              <ReuiBadge variant="primary-light" size="xs">constância</ReuiBadge>
            </FramePanel>
          </Frame>
        )}

        {/* REGISTRO DE HOJE */}
        <Frame>
          <FrameHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <FrameTitle>Como você está hoje?</FrameTitle>
                <FrameDescription>Toque para responder — dá para mudar durante o dia.</FrameDescription>
              </div>
              <IconTile size="sm" variant="soft" className="text-teal-600 dark:text-teal-400">
                <PulseIcon className="size-4" />
              </IconTile>
            </div>
          </FrameHeader>
          <FramePanel className="space-y-4 p-3.5 sm:p-4">
            {/* HUMOR + ENERGIA */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-muted/40 px-3.5 py-3">
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                  😊 Humor geral
                </Typography>
                <Rating rating={mood} editable onRatingChange={setMood} size="lg" maxRating={5} />
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/40 px-3.5 py-3">
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                  ⚡ Energia
                </Typography>
                <Rating rating={energy} editable onRatingChange={setEnergy} size="lg" maxRating={5} />
              </div>
            </div>

            {/* SINTOMAS */}
            <div>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.25 }}>
                Teve algum destes sintomas? (opcional)
              </Typography>
              <div className="flex flex-wrap gap-1.5">
                {SYMPTOMS.map((s) => {
                  const on = selected.includes(s.key);
                  return (
                    <Chip
                      key={s.key}
                      label={s.label}
                      onClick={() => toggleSymptom(s.key)}
                      color={on ? 'primary' : 'default'}
                      variant={on ? 'filled' : 'outlined'}
                      sx={{ minHeight: 40, borderRadius: '10px' }}
                      aria-pressed={on}
                    />
                  );
                })}
              </div>
            </div>

            {/* NOTA */}
            <TextField
              fullWidth
              size="small"
              multiline
              minRows={2}
              maxRows={4}
              placeholder="Alguma observação? (ex.: comecei remédio novo, dormi mal…)"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              slotProps={{ htmlInput: { 'aria-label': 'Observação do dia' } }}
            />

            <div className="flex items-center justify-between gap-2">
              {saved ? (
                <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>
                  ✓ Registrado
                </Typography>
              ) : <span />}
              <Button
                variant="contained"
                disabled={!canSave || saving}
                onClick={save}
                sx={{ minHeight: 44, minWidth: 132, borderRadius: '12px' }}
              >
                {saving ? 'Salvando…' : 'Registrar hoje'}
              </Button>
            </div>
          </FramePanel>
        </Frame>

        {/* POR QUE ME SINTO ASSIM? (gap #2) */}
        <Frame>
          <FrameHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <FrameTitle>Por que me sinto assim? ✨</FrameTitle>
                <FrameDescription>Cruzamos seu diário com sono, movimento e exames — a IA explica os padrões.</FrameDescription>
              </div>
            </div>
          </FrameHeader>
          <FramePanel className="p-3.5 sm:p-4">
            {!insight ? (
              <div className="flex flex-col items-center gap-2.5 py-1 text-center">
                <Button
                  variant="contained"
                  onClick={askWhy}
                  disabled={insightBusy || !pid}
                  sx={{ minHeight: 44, borderRadius: '12px', px: 3 }}
                >
                  {insightBusy ? 'Analisando…' : 'Analisar meus padrões'}
                </Button>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Quanto mais dias no diário, mais preciso fica.
                </Typography>
              </div>
            ) : !insight.ready ? (
              <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
                Ainda preciso de mais alguns dias de diário (você tem {insight.daysLogged}).
                Registre pelo menos 4 dias que a análise fica disponível. ✨
              </Typography>
            ) : (
              <div className="space-y-3">
                {insight.narration && (
                  <Typography variant="body2" sx={{ lineHeight: 1.55 }}>{insight.narration}</Typography>
                )}
                {insight.insights.map((it, i) => (
                  <div key={i} className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{it.title}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                      {it.detail} · base: {it.support} dias
                    </Typography>
                  </div>
                ))}
                {insight.insights.length === 0 && !insight.narration && (
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Nenhum padrão forte ainda — continue registrando.
                  </Typography>
                )}
                <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled', textAlign: 'center' }}>
                  Padrões observados, não causas. Sempre valide com seu médico.
                </Typography>
              </div>
            )}
          </FramePanel>
        </Frame>

        {/* HISTÓRICO */}
        <Frame>
          <FrameHeader>
            <div>
              <FrameTitle>Seus últimos dias</FrameTitle>
              <FrameDescription>Quanto mais dias registrados, melhores os insights de IA.</FrameDescription>
            </div>
          </FrameHeader>
          <FramePanel className="p-3.5 sm:p-4">
            {logs === null ? (
              <div className="space-y-2">
                <Skeleton height={44} />
                <Skeleton height={44} />
                <Skeleton height={44} />
              </div>
            ) : recent.length === 0 ? (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Ainda sem registros. O primeiro é hoje — leva 15 segundos. ✨
              </Typography>
            ) : (
              <ul className="m-0 list-none space-y-2 p-0">
                {recent.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{dayLabel(row.date)}</Typography>
                        {row.mood != null && (
                          <Rating rating={row.mood} size="xs" aria-label={`Humor ${row.mood} de 5`} />
                        )}
                      </div>
                      {row.symptoms?.length > 0 && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                          {row.symptoms.map((k) => SYMPTOM_LABEL.get(k) ?? k).join(' · ')}
                        </Typography>
                      )}
                      {row.note && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontStyle: 'italic', mt: 0.25 }}>
                          “{row.note}”
                        </Typography>
                      )}
                    </div>
                    {row.energy != null && (
                      <ReuiBadge variant="outline" size="xs" className="shrink-0">⚡ {row.energy}/5</ReuiBadge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </FramePanel>
        </Frame>
      </div>
    </PageContainer>
  );
};
