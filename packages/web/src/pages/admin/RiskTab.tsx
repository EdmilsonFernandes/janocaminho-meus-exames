import { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Stack, Chip, Alert, LinearProgress } from '@mui/material';
import { useTable, type ColumnDef } from '@tanstack/react-table';
import { DataGrid, DataGridContainer, dataGridFeatures } from '@/components/reui/data-grid/data-grid';
import { DataGridTable } from '@/components/reui/data-grid/data-grid-table';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';
import '../../doctor-v2/tw.css';
const H = () => ({ Authorization: `Bearer ${token()}` });

/**
 * Risco & IA — duas alavancas de evolução da IA:
 *  1) QUALIDADE: taxa de aprovação (👍/👎) do plano de ação por condição + comentários negativos
 *     → orienta onde refinar os cards .md e os prompts.
 *  2) FLYWHEEL: dataset ANONIMIZADO (opt-in LGPD) doado pelos pacientes → retreinar o ML de risco.
 */
/** Tradução dos conditionKey crús (banco) → rótulo gerencial em pt-BR */
const CONDITION_LABEL: Record<string, string> = {
  cardiovascular_risk: 'Risco Cardiovascular',
  diabetes_risk: 'Risco de Diabetes',
  metabolic_risk: 'Risco Metabólico',
  anemia: 'Anemia',
  hypothyroidism: 'Hipotireoidismo',
  kidney_function: 'Função Renal',
  liver_function: 'Função Hepática',
  inflammation: 'Inflamação',
  obesity: 'Obesidade',
  hypertension: 'Hipertensão',
  dyslipidemia: 'Dislipidemia',
  none: 'Nenhuma',
};
const conditionLabel = (key: string | null | undefined) => CONDITION_LABEL[key ?? ''] ?? key ?? '—';

/** ReUI DataGrid — qualidade por condição (Fase B, worktree admin-reui). */
function RiskConditionsGrid({ rows }: { rows: any[] }) {
  const columns: ColumnDef<any, any>[] = [
    { accessorKey: 'conditionKey', header: 'Condição', cell: (i) => <span className="text-[13px] font-bold">{conditionLabel(i.getValue() as string)}</span> },
    { accessorKey: 'total', header: 'Avaliações', cell: (i) => <span className="tabular-nums">{i.getValue() as number}</span> },
    { accessorFn: (r) => (r.total ? Math.round((r.up / r.total) * 100) : 0), id: 'pct', header: '% 👍', cell: (i) => {
      const pct = i.getValue() as number;
      const cls = pct >= 70 ? 'text-success-foreground dark:text-success' : pct >= 40 ? 'text-warning-foreground dark:text-warning' : 'text-destructive-foreground dark:text-destructive';
      const bg = pct >= 70 ? 'bg-success' : pct >= 40 ? 'bg-warning' : 'bg-destructive';
      return (
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-14 overflow-hidden rounded-full bg-muted"><div className={'h-full rounded-full ' + bg} style={{ width: `${pct}%` }} /></div>
          <span className={'text-xs font-bold tabular-nums ' + cls}>{pct}%</span>
        </div>
      );
    } },
    { accessorKey: 'down', header: '👎', cell: (i) => <span className="tabular-nums text-muted-foreground">{i.getValue() as number}</span> },
  ];
  const table = useTable({ features: dataGridFeatures, data: rows, columns });
  return <DataGrid table={table} recordCount={rows.length}><DataGridContainer><DataGridTable /></DataGridContainer></DataGrid>;
}

export const RiskTab = () => {
  const [q, setQ] = useState<any>(null);
  const [ds, setDs] = useState<any>(null);
  const [err, setErr] = useState(false);
  const load = () => {
    setErr(false);
    Promise.all([
      fetch(`${API_URL}/admin/risk-quality`, { headers: H() }).then((r) => r.ok ? r.json() : Promise.reject()),
      fetch(`${API_URL}/admin/risk-dataset`, { headers: H() }).then((r) => r.ok ? r.json() : Promise.reject()),
    ]).then(([quality, dataset]) => { setQ(quality); setDs(dataset); }).catch(() => setErr(true));
  };
  useEffect(load, []);

  if (!q && !err) return <TabLoader />;
  if (err) return <SectionError message="Não foi possível carregar risco/IA." onRetry={load} />;

  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr 1fr' }, gap: 1.5, mb: 2 }}>
        {[
          { l: 'Avaliações de plano', v: String(q.totalFeedbacks ?? 0) },
          { l: 'Cond. com feedback', v: String(q.byCondition?.length ?? 0) },
          { l: 'Registros doados', v: String(ds.total ?? 0) },
          { l: 'Cond. no dataset', v: String(ds.byCondition?.length ?? 0) },
        ].map((k) => (
          <Card key={k.l} variant="outlined" sx={{ borderRadius: '12px' }}><CardContent sx={{ textAlign: 'center', py: 1.5 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 20, color: '#178f89' }}>{k.v}</Typography>
            <Typography variant="caption" color="text.secondary">{k.l}</Typography>
          </CardContent></Card>
        ))}
      </Box>

      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 800 }}>Qualidade do plano por condição (loop de melhoria)</Typography>
      {q.byCondition?.length ? (
        <Card variant="outlined" sx={{ borderRadius: '12px', mb: 2, p: 1.5 }}>
          <div className="dx-island"><RiskConditionsGrid rows={q.byCondition} /></div>
        </Card>
      ) : (
        <Alert severity="info" sx={{ mb: 2 }}>Ainda sem avaliações. Quando os pacientes clicarem em 👍/👎 no plano de ação, a taxa de aprovação por condição aparece aqui — é o que orienta onde refinar os cards de conhecimento clínico.</Alert>
      )}

      {q.negativeComments?.length > 0 && (
        <>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 800 }}>Comentários 👎 recentes (onde melhorar)</Typography>
          <Stack spacing={1} sx={{ mb: 2 }}>
            {q.negativeComments.map((c: any) => (
              <Card key={c.id} variant="outlined" sx={{ borderRadius: '12px' }}><CardContent sx={{ py: 1.25 }}>
                <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" sx={{ mb: 0.5 }}>
                  <Chip size="small" label={conditionLabel(c.riskAssessment?.conditionKey)} variant="outlined" />
                  <Typography variant="caption" color="text.secondary">{new Date(c.createdAt).toLocaleDateString('pt-BR')}</Typography>
                </Stack>
                <Typography variant="body2">{c.comment}</Typography>
              </CardContent></Card>
            ))}
          </Stack>
        </>
      )}

      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 800 }}>Dataset de treino (flywheel — anonimizado, opt-in)</Typography>
      <Alert severity="info" sx={{ mb: 1.5 }}>Registros <strong>anonimizados</strong> (sem nome/CPF/contato — só valores dos exames + faixa etária + sexo) doados por pacientes que ativaram o opt-in. Use pra retreinar o modelo de risco (<code>risk-ml/retrain.py</code>).</Alert>
      {ds.total > 0 ? (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {ds.byCondition?.map((c: any) => <Chip key={c.conditionKey} size="small" variant="outlined" label={`${conditionLabel(c.conditionKey)}: ${c._count}`} />)}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">Nenhum paciente ativou o opt-in ainda. Quando ativar (toggle no app), cada leitura de risco doa um registro anônimo aqui.</Typography>
      )}
    </Box>
  );
};
