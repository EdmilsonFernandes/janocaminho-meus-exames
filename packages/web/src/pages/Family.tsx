import { useEffect, useState, useMemo } from 'react';
import {
  Typography,
  Grid,
  Alert,
  Skeleton,
  Button as MuiButton,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useNavigate } from 'react-router-dom';
import { API_URL, token, photoUrlFor } from '../config';
import { PageContainer } from '../components/layout/PageContainer';
import { setSelectedPatient } from '../patient-context';
import { formatCpf, isValidCpf } from '../utils/cpf';
import { familyMemberStatus } from '../utils/familyMemberStatus';
import { BellRing, Check, ChevronRight, Stethoscope, TrendingDown, TrendingUp, TriangleAlert, Upload, UserPlus, Users } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame';
import { Badge } from '@/components/reui/badge';
import { Alert as ReuiAlert, AlertDescription, AlertTitle } from '@/components/reui/alert';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface FamPatient {
  id: string;
  fullName: string;
  relationship: string | null;
  photoUrl: string | null;
  dateOfBirth?: string | null;
  score: number | null;
  abnormalCount: number;
  examTitle: string | null;
  performedAt: string | null;
  topAbnormal: { name: string; value: string | null; flag: string }[];
}

interface CrossAlert {
  analyte: string;
  patients: string[];
}

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : null);

const ageFrom = (dob?: string | null) => {
  if (!dob) return null;
  try {
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return null;
    const diff = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
    return diff >= 0 ? diff : null;
  } catch {
    return null;
  }
};

/** Helper para formatar nomes de marcadores de exames */
const prettyName = (n: string) => {
  if (!n) return '';
  const tokens = n.split(/[_\s]+/);
  return tokens
    .map((tok) => {
      if (
        tok.length <= 4 &&
        /^[A-Z0-9]+$/.test(tok) &&
        !['ACIDO', 'URICO', 'BILIRRUBINA', 'DIRETA', 'INDIRETA', 'TOTAL'].includes(tok)
      ) {
        return tok;
      }
      return tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase();
    })
    .join(' ');
};

// ───────────────────────── peças (ReUI) ─────────────────────────

type CompareStatus = 'alto' | 'baixo' | 'alterado' | 'normal';

interface CompareMember {
  patientId?: string;
  name?: string;
  relationship?: string | null;
  value?: string | null;
  valueNumeric?: number | null;
  refLow?: number | null;
  refHigh?: number | null;
  flag?: string | null;
}
interface CompareRowData { analyte: string; unit?: string | null; members: CompareMember[] }

const firstNameOf = (name?: string | null) => (name || '').trim().split(/\s+/)[0] || 'Pessoa';

/**
 * Onde o resultado está em relação à faixa DO PRÓPRIO laudo da pessoa.
 * Sem faixa inventada: antes a tela usava uma tabela fixa de referências quando o laudo não
 * trazia a faixa, o que podia chamar de "elevado" um valor normal para a idade/sexo da pessoa.
 */
const compareStatus = (m: CompareMember): CompareStatus => {
  const num = m.valueNumeric != null ? Number(m.valueNumeric) : null;
  const low = m.refLow != null ? Number(m.refLow) : null;
  const high = m.refHigh != null ? Number(m.refHigh) : null;
  if (m.flag === 'LOW' || (num != null && low != null && num < low)) return 'baixo';
  if (m.flag === 'HIGH' || (num != null && high != null && num > high)) return 'alto';
  if (m.flag === 'ABNORMAL' || m.flag === 'CRITICAL') return 'alterado';
  return 'normal';
};

const refRange = (m: CompareMember): string => {
  const n = (v: number) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  if (m.refLow != null && m.refHigh != null) return `faixa ${n(m.refLow)} a ${n(m.refHigh)}`;
  if (m.refLow != null) return `faixa a partir de ${n(m.refLow)}`;
  return m.refHigh != null ? `faixa até ${n(m.refHigh)}` : 'laudo sem faixa';
};

function StatusBadge({ status }: { status: CompareStatus }) {
  if (status === 'normal') return <Badge className="shrink-0 border-0" variant="success-light"><Check aria-hidden="true" />Na faixa</Badge>;
  return (
    <Badge className="shrink-0 border-0" variant="warning-light">
      {status === 'alto' ? <TrendingUp aria-hidden="true" /> : status === 'baixo' ? <TrendingDown aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
      {status === 'alto' ? 'Acima' : status === 'baixo' ? 'Abaixo' : 'Alterado'}
    </Badge>
  );
}

/** Uma pessoa da família: quem é, como está e o atalho para o painel dela. */
function MemberRow({ p, isTitular, onOpen, onUpload }: { p: FamPatient; isTitular: boolean; onOpen: () => void; onUpload: () => void }) {
  const status = familyMemberStatus(p);
  const age = ageFrom(p.dateOfBirth);
  const first = firstNameOf(p.fullName);
  const who = [isTitular ? 'Você' : p.relationship || 'Dependente', age != null ? `${age} ano${age === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  const top = p.topAbnormal.slice(0, 2).map((a) => prettyName(a.name)).join(', ');
  const extra = p.abnormalCount - Math.min(2, p.topAbnormal.length);
  return (
    <div className="flex items-stretch">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Abrir o painel de ${p.fullName}`}
        className="flex min-h-18 min-w-0 flex-1 cursor-pointer appearance-none items-center gap-3 border-0 bg-transparent py-3 ps-4 pe-2 text-left transition-colors duration-200 hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <Avatar className="size-11">
          {p.photoUrl ? <AvatarImage src={photoUrlFor(p.id)} alt="" /> : null}
          <AvatarFallback className="text-base font-semibold">{first.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 text-sm leading-snug font-semibold break-words text-foreground">{p.fullName}</span>
          <span className="truncate text-xs text-muted-foreground">{who}</span>
          <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {status === 'atencao' ? (
              <Badge className="shrink-0 border-0" variant="warning-light"><TriangleAlert aria-hidden="true" />{p.abnormalCount} fora da faixa</Badge>
            ) : status === 'na-meta' ? (
              <Badge className="shrink-0 border-0" variant="success-light"><Check aria-hidden="true" />Tudo na faixa</Badge>
            ) : (
              <Badge className="shrink-0" variant="outline">Sem exame ainda</Badge>
            )}
            {p.score != null ? <span className="text-xs whitespace-nowrap text-muted-foreground min-[360px]:hidden">score {p.score} de 100</span> : null}
            {status === 'atencao' && top ? (
              <span className="min-w-0 truncate text-xs text-muted-foreground">{top}{extra > 0 ? ` +${extra}` : ''}</span>
            ) : status === 'na-meta' && p.performedAt ? (
              <span className="text-xs whitespace-nowrap text-muted-foreground">exame de {fmtDate(p.performedAt)}</span>
            ) : null}
          </span>
        </span>
        {p.score != null ? (
          <span className="flex shrink-0 flex-col items-end max-[359px]:hidden" aria-label={`Score de saúde ${p.score} de 100`}>
            <span className="text-xl leading-none font-semibold text-foreground tabular-nums">{p.score}</span>
            <span className="mt-0.5 text-xs text-muted-foreground">de 100</span>
          </span>
        ) : null}
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </button>
      <div className="flex shrink-0 items-center pe-3">
        {status === 'sem-exame' ? (
          <Button variant="outline" size="lg" className="h-10 whitespace-nowrap" onClick={onUpload}><Upload aria-hidden="true" /><span className="max-[359px]:sr-only">Enviar</span></Button>
        ) : (
          <Button variant="ghost" size="icon" className="size-10" aria-label={`Enviar exame de ${first}`} onClick={onUpload}><Upload aria-hidden="true" /></Button>
        )}
      </div>
    </div>
  );
}

/** Um exame comparado: cada pessoa com o próprio valor, a própria faixa e a situação escrita. */
function CompareRow({ row }: { row: CompareRowData }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <p className="m-0 text-sm font-semibold text-foreground">
        {prettyName(row.analyte)}
        {row.unit ? <span className="ms-1.5 text-xs font-normal text-muted-foreground">{row.unit}</span> : null}
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {row.members.map((m, i) => (
          <li key={m.patientId ?? i} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm text-foreground">{firstNameOf(m.name)}</span>
              <span className="truncate text-xs text-muted-foreground">{refRange(m)}</span>
            </span>
            <span className="shrink-0 text-sm font-semibold whitespace-nowrap text-foreground tabular-nums">{m.valueNumeric != null && Number.isFinite(Number(m.valueNumeric)) ? Number(m.valueNumeric).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : m.value || '—'}</span>
            <StatusBadge status={compareStatus(m)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export const FamilyPage = () => {
  useReuiThemeSync();
  const navigate = useNavigate();

  const [data, setData] = useState<{ patients: FamPatient[]; crossAlerts: CrossAlert[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [cmp, setCmp] = useState<any[]>([]);
  const [err, setErr] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Lado a lado: por padrão só os exames com alguém fora da faixa; "ver todos" abre o resto.
  const [showAllCompare, setShowAllCompare] = useState(false);
  const [compareLimit, setCompareLimit] = useState(10);

  // Filtro clínico rigoroso: hábitos compartilhados da casa (alimentação, sedentarismo, ambiente)
  // Exclui hormônios sexuais e desvios agudos que possuem eixos biológicos individuais por sexo/idade.
  const EXCLUDE_FROM_HOUSEHOLD_HABITS = [
    'TESTOSTERONA', 'ESTRADIOL', 'PROGESTERONA', 'PROLACTINA', 'FSH', 'LH', 'DHEA', 'DHT', 'BASTONETES'
  ];

  const householdCrossAlerts = useMemo(() => {
    return (data?.crossAlerts ?? []).filter((c) => {
      const up = (c.analyte || '').toUpperCase();
      return !EXCLUDE_FROM_HOUSEHOLD_HABITS.some((k) => up.includes(k));
    });
  }, [data?.crossAlerts]);

  // Modal rápido de adicionar dependente
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRelationship, setNewRelationship] = useState('Filho(a)');
  const [newDob, setNewDob] = useState('');
  const [newCpf, setNewCpf] = useState('');
  const [savingDependent, setSavingDependent] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(false);

    Promise.all([
      fetch(`${API_URL}/patients/family-overview`, { headers: { Authorization: `Bearer ${token()}` } })
        .then((r) => {
          if (!r.ok) throw new Error('http');
          return r.json();
        }),
      fetch(`${API_URL}/patients/family-compare`, { headers: { Authorization: `Bearer ${token()}` } })
        .then((r) => r.json())
        .catch(() => ({ rows: [] })),
      fetch(`${API_URL}/patients`, { headers: { Authorization: `Bearer ${token()}` } })
        .then((r) => r.json())
        .catch(() => []),
    ])
      .then(([overviewData, compareData, allPatients]) => {
        // Enriquecer dados dos pacientes com datas de nascimento e perfis completos
        const enrichedPatients = (overviewData?.patients ?? []).map((p: FamPatient) => {
          const detail = Array.isArray(allPatients) ? allPatients.find((ap: any) => String(ap.id) === String(p.id)) : null;
          return {
            ...p,
            dateOfBirth: detail?.dateOfBirth ?? p.dateOfBirth ?? null,
            relationship: detail?.relationship ?? p.relationship ?? null,
          };
        });

        setData({
          patients: enrichedPatients,
          crossAlerts: overviewData?.crossAlerts ?? [],
        });
        setCmp(compareData?.rows ?? []);
      })
      .catch(() => {
        setData(null);
        setErr(true);
      })
      .finally(() => setLoading(false));
  }, [reloadKey]);

  const handleSelectMemberAndGo = (patientId: string, path = '/') => {
    setSelectedPatient(patientId);
    navigate(path);
  };

  const handleCreateDependent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setModalError('Informe o nome completo do dependente.');
      return;
    }
    if (newCpf && !isValidCpf(newCpf)) {
      setModalError('CPF informado é inválido.');
      return;
    }

    setSavingDependent(true);
    setModalError(null);

    try {
      const payload: any = {
        fullName: newName.trim(),
        relationship: newRelationship,
      };
      if (newDob) payload.dateOfBirth = newDob;
      if (newCpf) payload.cpf = newCpf.replace(/\D/g, '');

      const res = await fetch(`${API_URL}/patients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Não foi possível cadastrar o dependente.');
      }

      window.dispatchEvent(new Event('patients-changed'));
      window.dispatchEvent(new Event('selPatientChanged'));
      setAddModalOpen(false);
      setNewName('');
      setNewDob('');
      setNewCpf('');
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      setModalError(err.message || 'Falha ao salvar dependente.');
    } finally {
      setSavingDependent(false);
    }
  };

  if (loading) {
    return (
      <PageContainer width={1020}>
        <Skeleton variant="rectangular" height={160} sx={{ borderRadius: '24px', mb: 3 }} />
        <Grid container spacing={2.5}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Skeleton variant="rounded" height={260} sx={{ borderRadius: '20px' }} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Skeleton variant="rounded" height={260} sx={{ borderRadius: '20px' }} />
          </Grid>
        </Grid>
      </PageContainer>
    );
  }

  if (err && !data) {
    return (
      <PageContainer width={1020}>
        <Alert
          severity="error"
          sx={{ mt: 3, borderRadius: '20px' }}
          action={
            <MuiButton color="inherit" size="small" onClick={() => setReloadKey((k) => k + 1)}>
              Tentar novamente
            </MuiButton>
          }
        >
          Não foi possível carregar as informações da família. Verifique sua conexão e tente novamente.
        </Alert>
      </PageContainer>
    );
  }

  const patients = data?.patients ?? [];
  const titular = patients.find((p) => /titular/i.test(p.relationship || '')) || patients[0];


  // Quem precisa de atenção primeiro; quem ainda não tem exame por último.
  const statusRank = (p: FamPatient) => ({ atencao: 0, 'na-meta': 1, 'sem-exame': 2 })[familyMemberStatus(p)];
  const orderedPatients = [...patients].sort((a, b) => statusRank(a) - statusRank(b) || b.abnormalCount - a.abnormalCount);
  const needAttention = patients.filter((p) => familyMemberStatus(p) === 'atencao').length;
  const noExam = patients.filter((p) => familyMemberStatus(p) === 'sem-exame').length;
  const peopleSummary = patients.length <= 1
    ? 'Adicione filhos, cônjuge ou pais para acompanhar todos aqui.'
    : [
        `${patients.length} pessoas`,
        needAttention > 0 ? `${needAttention} com exame fora da faixa` : '',
        noExam > 0 ? `${noExam} sem exame ainda` : '',
      ].filter(Boolean).join(' · ');

  const compareRows = cmp as CompareRowData[];
  const divergentRows = compareRows.filter((row) => row.members.some((m) => compareStatus(m) !== 'normal'));
  const compareSource = showAllCompare || divergentRows.length === 0 ? compareRows : divergentRows;
  const visibleCompare = compareSource.slice(0, compareLimit);
  const hiddenCompare = compareSource.length - visibleCompare.length;


  return (
    <PageContainer width={1020} sx={{ pb: { xs: 16, sm: 6 } }}>
      <PageHeader
        title="Família"
        subtitle="A saúde de quem você cuida, num só lugar."
        icon={<Users size={24} aria-hidden="true" />}
      />

      <div className="dx-island flex flex-col gap-4 [&_button]:font-[inherit]">
        {/* ───────── 1. Pessoas: quem precisa de atenção vem primeiro ───────── */}
        <Frame>
          <FrameHeader className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex min-w-0 flex-1 basis-40 flex-col gap-px">
              <FrameTitle role="heading" aria-level={2}>Pessoas</FrameTitle>
              <FrameDescription>{peopleSummary}</FrameDescription>
            </div>
            <Button size="lg" className="h-10 shrink-0 whitespace-nowrap" onClick={() => setAddModalOpen(true)}><UserPlus aria-hidden="true" />Adicionar</Button>
          </FrameHeader>
          <FramePanel className="p-0!">
            <ul className="m-0 flex list-none flex-col p-0">
              {orderedPatients.map((p, i) => (
                <li key={p.id}>
                  <MemberRow
                    p={p}
                    isTitular={p === titular}
                    onOpen={() => handleSelectMemberAndGo(p.id, '/')}
                    onUpload={() => handleSelectMemberAndGo(p.id, '/exams/create')}
                  />
                  {i < orderedPatients.length - 1 ? <Separator /> : null}
                </li>
              ))}
            </ul>
          </FramePanel>
        </Frame>

        {/* ───────── 2. O que se repete na casa ───────── */}
        {householdCrossAlerts.length > 0 ? (
          <ReuiAlert variant="warning">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Fora da faixa em mais de uma pessoa</AlertTitle>
            <AlertDescription>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {householdCrossAlerts.slice(0, 4).map((c) => (
                  <li key={c.analyte}><strong className="font-semibold">{prettyName(c.analyte)}:</strong> {c.patients.map((n) => firstNameOf(n)).join(', ')}</li>
                ))}
              </ul>
              <p className="m-0 mt-1.5">Quando se repete na mesma casa, vale conversar com o médico sobre hábitos em comum.</p>
            </AlertDescription>
          </ReuiAlert>
        ) : null}

        {/* ───────── 3. Lado a lado: só o que duas ou mais pessoas fizeram ───────── */}
        {compareRows.length > 0 ? (
          <Frame>
            <FrameHeader className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="flex min-w-0 flex-1 basis-40 flex-col gap-px">
                <FrameTitle role="heading" aria-level={2}>Lado a lado</FrameTitle>
                <FrameDescription>
                  {divergentRows.length === 0
                    ? `${compareRows.length} ${compareRows.length === 1 ? 'exame em comum, na faixa' : 'exames em comum, todos na faixa'}.`
                    : `${divergentRows.length} de ${compareRows.length} exames em comum com alguém fora da faixa.`}
                </FrameDescription>
              </div>
              {divergentRows.length > 0 && divergentRows.length < compareRows.length ? (
                <Button variant="outline" size="lg" className="h-10 shrink-0 whitespace-nowrap" aria-pressed={showAllCompare} onClick={() => setShowAllCompare((v) => !v)}>
                  {showAllCompare ? 'Só fora da faixa' : `Ver todos (${compareRows.length})`}
                </Button>
              ) : null}
            </FrameHeader>
            <FramePanel className="p-0!">
              <ul className="m-0 flex list-none flex-col p-0">
                {visibleCompare.map((row, i) => (
                  <li key={row.analyte}>
                    <CompareRow row={row} />
                    {i < visibleCompare.length - 1 ? <Separator /> : null}
                  </li>
                ))}
              </ul>
              {hiddenCompare > 0 ? (
                <>
                  <Separator />
                  <div className="px-4 py-2">
                    <Button variant="ghost" size="lg" className="h-10 w-full" onClick={() => setCompareLimit((n) => n + 10)}>Mostrar mais {Math.min(10, hiddenCompare)}</Button>
                  </div>
                </>
              ) : null}
            </FramePanel>
          </Frame>
        ) : null}

        {/* ───────── 4. Atalhos ───────── */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="lg" className="h-10" onClick={() => navigate('/patients')}><Users aria-hidden="true" />Editar perfis</Button>
          <Button variant="outline" size="lg" className="h-10" onClick={() => navigate('/reminders')}><BellRing aria-hidden="true" />Lembretes</Button>
          <Button variant="outline" size="lg" className="h-10" onClick={() => navigate('/medicos')}><Stethoscope aria-hidden="true" />Compartilhar com médico</Button>
        </div>
      </div>

      {/* DIÁLOGO / MODAL DE ADICIONAR DEPENDENTE */}
      <Dialog
        open={addModalOpen}
        onClose={() => !savingDependent && setAddModalOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '22px',
            p: { xs: 1, sm: 1.5 },
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 19, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Adicionar Novo Dependente</span>
          <IconButton size="small" onClick={() => setAddModalOpen(false)} disabled={savingDependent}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <form onSubmit={handleCreateDependent}>
          <DialogContent sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Cadastre um dependente (filho, cônjuge, pai/mãe) para centralizar os exames e acompanhar a saúde com históricos individuais.
            </Typography>

            {modalError && (
              <Alert severity="error" sx={{ borderRadius: '12px', fontSize: 13 }}>
                {modalError}
              </Alert>
            )}

            <TextField
              label="Nome completo do dependente"
              placeholder="Ex: Heloisa Fernandes"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              fullWidth
              required
              size="small"
            />

            <TextField
              select
              label="Grau de parentesco"
              value={newRelationship}
              onChange={(e) => setNewRelationship(e.target.value)}
              fullWidth
              size="small"
            >
              <MenuItem value="Filho(a)">Filho(a)</MenuItem>
              <MenuItem value="Cônjuge">Cônjuge / Parceiro(a)</MenuItem>
              <MenuItem value="Pai/Mãe">Pai / Mãe</MenuItem>
              <MenuItem value="Irmão(ã)">Irmão(ã)</MenuItem>
              <MenuItem value="Outro">Outro familiar</MenuItem>
            </TextField>

            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Data de Nascimento"
                  type="date"
                  value={newDob}
                  onChange={(e) => setNewDob(e.target.value)}
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                  helperText="Para cálculo de idade e faixas pediátricas"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="CPF (Opcional)"
                  placeholder="000.000.000-00"
                  value={newCpf}
                  onChange={(e) => setNewCpf(formatCpf(e.target.value))}
                  fullWidth
                  size="small"
                  inputProps={{ inputMode: 'numeric' }}
                  helperText="Para validação de laudos laboratoriais"
                />
              </Grid>
            </Grid>
          </DialogContent>

          <DialogActions sx={{ p: 2.5, pt: 1 }}>
            <MuiButton
              onClick={() => setAddModalOpen(false)}
              disabled={savingDependent}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              Cancelar
            </MuiButton>
            <MuiButton
              type="submit"
              variant="contained"
              disabled={savingDependent}
              sx={{
                borderRadius: '999px',
                textTransform: 'none',
                fontWeight: 800,
                px: 3,
                background: 'linear-gradient(135deg, #20b2aa 0%, #178f89 100%)',
              }}
            >
              {savingDependent ? <CircularProgress size={20} color="inherit" /> : 'Salvar Dependente'}
            </MuiButton>
          </DialogActions>
        </form>
      </Dialog>
    </PageContainer>
  );
};
