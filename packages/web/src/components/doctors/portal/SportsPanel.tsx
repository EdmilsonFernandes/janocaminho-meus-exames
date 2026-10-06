import { useEffect, useState, type ReactNode } from 'react';
import { Box, Card, CardContent, Typography, Stack, Chip, Divider } from '@mui/material';
import { API_URL } from '../../../config';
import { Empty } from './NotesTab';
import { copperText, tealText, RADIUS } from '../../../theme';
import type { Theme } from '@mui/material/styles';
import { Medal, Syringe } from '@phosphor-icons/react';

/** Selo fixo do painel esportivo: tudo aqui é autodeclarado, nunca verificado. */
const DECLARED_BADGE = 'DECLARADO PELO PACIENTE — não verificado';

/** Labels amigáveis p/ as chaves conhecidas do contexto de coleta (Jsonb flexível do E1). */
const COLLECTION_LABELS: Record<string, string> = {
  treinoAte24h: 'Treinou até 24h antes da coleta',
  trainingBefore: 'Treinou antes da coleta',
  horario: 'Horário da coleta',
  jejum: 'Jejum',
  doencaRecente: 'Doença recente',
  illness: 'Doença recente',
  observacoes: 'Observações',
};

/** Humaniza chave desconhecida de Jsonb: camelCase → "Camel case". */
const humanKey = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

/** Render genérico de valor Jsonb declarado (string/boolean/número/objeto raso). */
const jsonValue = (v: unknown): ReactNode => {
  if (v == null) return null;
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .filter(([, vv]) => vv != null && vv !== '')
      .map(([k, vv]) => `${COLLECTION_LABELS[k] ?? humanKey(k)}: ${typeof vv === 'boolean' ? (vv ? 'sim' : 'não') : String(vv)}`)
      .join(' · ');
  }
  return String(v);
};

/** Lista declarada (Jsonb do SportsProfile): aceita strings ou objetos pequenos. */
const declaredList = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  return v
    .map((it) => (typeof it === 'string' ? it.trim() : typeof it === 'object' && it ? Object.values(it as Record<string, unknown>).filter(Boolean).join(' · ') : ''))
    .map((s) => s.trim())
    .filter(Boolean);
};

interface SportsContextData {
  profile: {
    modality?: string | null;
    trainingFreq?: string | null;
    goals?: string | null;
    supplements?: unknown;
    collectionContext?: unknown;
    declaredSubstances?: unknown;
    active?: boolean;
    updatedAt?: string;
  } | null;
  disabledByPatient: boolean;
  medications: { id: string; name: string; dosage?: string | null; frequency?: string | null; notes?: string | null }[];
}

const SectionCard = ({ title, children }: { title: string; children: ReactNode }) => (
  <Card
    variant="outlined"
    sx={{
      borderRadius: '20px',
      borderColor: (t: Theme) => (t.palette.mode === 'dark' ? 'rgba(32,178,170,0.2)' : '#d8ece9'),
      boxShadow: (t: Theme) => (t.palette.mode === 'dark' ? '0 4px 20px rgba(0,0,0,0.25)' : '0 4px 14px rgba(32,178,170,0.05)'),
    }}
  >
    <CardContent sx={{ p: { xs: 2, md: 2.25 } }}>
      <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 1.25, color: (t: Theme) => tealText(t.palette.mode), display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Medal size={16} weight="duotone" />{title}
      </Typography>
      {children}
    </CardContent>
  </Card>
);

/** Linha "label: valor" — só renderiza quando há valor. */
const Row = ({ label, value }: { label: string; value: ReactNode }) => {
  if (value == null || value === '') return null;
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', py: 0.4, minWidth: 0 }}>
      <Typography component="span" sx={{ fontWeight: 700, fontSize: 13.5, color: 'text.secondary', flexShrink: 0 }}>{label}:</Typography>
      <Typography component="span" sx={{ fontSize: 13.5, color: 'text.primary', wordBreak: 'break-word' }}>{value}</Typography>
    </Box>
  );
};

/**
 * SportsPanel (E5.2) — aba "Esportivo" do portal médico. SÓ é renderizada quando o share
 * tem o escopo 'sports' (gate em DoctorPortal computeTabs). Todo o conteúdo é DECLARADO
 * pelo paciente: o selo "DECLARADO PELO PACIENTE — não verificado" acompanha o painel e a
 * dose das substâncias aparece SEMPRE rotulada como declarada (nunca como prescrição).
 */
export const SportsPanel = ({ patientId, token, doctorId }: { patientId: string; token: string; doctorId: string }) => {
  const [data, setData] = useState<SportsContextData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`${API_URL}/doctor/${doctorId}/sports-context?patientId=${patientId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [patientId, token, doctorId]);

  if (loading) {
    return (
      <Card sx={{ borderRadius: RADIUS.sectionCard }}><CardContent>
        <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>Carregando contexto esportivo…</Typography>
      </CardContent></Card>
    );
  }

  if (!data) {
    return <Empty label="Sem permissão para o contexto esportivo deste paciente." icon="🔒" />;
  }

  const p = data.profile;
  const substancesFromProfile = declaredList(p?.declaredSubstances);
  const supplements = declaredList(p?.supplements);
  const collectionEntries = p?.collectionContext && typeof p.collectionContext === 'object' && !Array.isArray(p.collectionContext)
    ? Object.entries(p.collectionContext as Record<string, unknown>).filter(([, v]) => v != null && v !== '' && v !== false)
    : [];

  return (
    <Stack spacing={1.5}>
      {/* SELO — contexto autodeclarado, nunca verificado */}
      <Card
        sx={{
          borderRadius: '20px',
          background: (t: Theme) =>
            t.palette.mode === 'dark'
              ? 'radial-gradient(ellipse 90% 70% at 10% 0%, rgba(212,165,116,0.12), transparent 70%), #1c2320'
              : 'radial-gradient(ellipse 90% 70% at 10% 0%, rgba(212,165,116,0.10), transparent 70%), #ffffff',
          border: '1px solid',
          borderColor: 'rgba(212,165,116,0.35)',
        }}
      >
        <CardContent sx={{ py: 1.75, px: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              label={DECLARED_BADGE}
              sx={{ fontWeight: 800, fontSize: 11, bgcolor: 'rgba(212,165,116,0.18)', color: (t: Theme) => copperText(t.palette.mode), border: '1px solid rgba(212,165,116,0.4)' }}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Tudo nesta aba foi declarado pelo próprio paciente para dar contexto à interpretação — não é dado de prontuário verificado.
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      {data.disabledByPatient && (
        <Empty label="O paciente desativou o modo Saúde Esportiva — o contexto declarado não está sendo compartilhado agora." icon="🏅" />
      )}

      {!data.disabledByPatient && !p && (
        <Empty label="Paciente ainda não declarou contexto esportivo (modalidade, treino, substâncias)." icon="🏅" />
      )}

      {!data.disabledByPatient && p && (
        <>
          <SectionCard title="Perfil esportivo declarado">
            <Row label="Modalidade" value={p.modality ?? null} />
            <Row label="Frequência de treino" value={p.trainingFreq ?? null} />
            <Row label="Objetivos declarados" value={p.goals ?? null} />
            {p.updatedAt && (
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.75 }}>
                Última atualização pelo paciente: {new Date(p.updatedAt).toLocaleDateString('pt-BR')}
              </Typography>
            )}
          </SectionCard>

          {(substancesFromProfile.length > 0 || data.medications.length > 0) && (
            <SectionCard title="Substâncias e suplementos declarados">
              <Stack spacing={0.75}>
                {substancesFromProfile.map((s, i) => (
                  <Box key={`sp-${i}`} sx={{ p: 1, borderRadius: '12px', bgcolor: 'action.hover', display: 'flex', gap: 1, alignItems: 'baseline', minWidth: 0 }}>
                    <Syringe size={14} weight="duotone" style={{ flexShrink: 0, marginTop: 2 }} />
                    <Typography sx={{ fontSize: 13.5, wordBreak: 'break-word' }}>{s} <Typography component="span" variant="caption" sx={{ color: 'text.secondary' }}>· declarado pelo paciente</Typography></Typography>
                  </Box>
                ))}
                {data.medications.map((m) => (
                  <Box key={m.id} sx={{ p: 1, borderRadius: '12px', bgcolor: 'action.hover', minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 13.5, wordBreak: 'break-word' }}>{m.name}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                      {[m.dosage, m.frequency].filter(Boolean).join(' · ')}{[m.dosage, m.frequency].some(Boolean) ? ' · dose declarada pelo paciente' : '· declarado pelo paciente'}
                    </Typography>
                    {m.notes && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{m.notes}</Typography>}
                  </Box>
                ))}
              </Stack>
              <Divider sx={{ my: 1.25 }} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Posologia é autodeclarada e não foi verificada. Diretrizes clínicas citadas no app referem-se a uso prescrito.
              </Typography>
            </SectionCard>
          )}

          {supplements.length > 0 && (
            <SectionCard title="Suplementos declarados">
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                {supplements.map((s, i) => (
                  <Chip key={`sup-${i}`} size="small" label={s} sx={{ fontWeight: 600, borderRadius: '999px' }} />
                ))}
              </Stack>
            </SectionCard>
          )}

          {collectionEntries.length > 0 && (
            <SectionCard title="Contexto de coleta declarado">
              {collectionEntries.map(([k, v]) => (
                <Row key={k} label={COLLECTION_LABELS[k] ?? humanKey(k)} value={jsonValue(v)} />
              ))}
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.75 }}>
                Contexto declarado informa a interpretação — nunca suprime alerta nem muda a faixa de referência do laboratório.
              </Typography>
            </SectionCard>
          )}
        </>
      )}
    </Stack>
  );
};
