import { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Stack, Chip, Alert, Table, TableHead, TableRow, TableCell, TableBody, LinearProgress } from '@mui/material';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';
const H = () => ({ Authorization: `Bearer ${token()}` });

/**
 * Risco & IA — duas alavancas de evolução da IA:
 *  1) QUALIDADE: taxa de aprovação (👍/👎) do plano de ação por condição + comentários negativos
 *     → orienta onde refinar os cards .md e os prompts.
 *  2) FLYWHEEL: dataset ANONIMIZADO (opt-in LGPD) doado pelos pacientes → retreinar o ML de risco.
 */
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
          <Card key={k.l} variant="outlined" sx={{ borderRadius: 2 }}><CardContent sx={{ textAlign: 'center', py: 1.5 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 20, color: '#178f89' }}>{k.v}</Typography>
            <Typography variant="caption" color="text.secondary">{k.l}</Typography>
          </CardContent></Card>
        ))}
      </Box>

      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 800 }}>Qualidade do plano por condição (loop de melhoria)</Typography>
      {q.byCondition?.length ? (
        <Card variant="outlined" sx={{ borderRadius: 2, mb: 2 }}><Table size="small">
          <TableHead><TableRow>
            <TableCell>Condição</TableCell>
            <TableCell align="right">Avaliações</TableCell>
            <TableCell>% 👍</TableCell>
            <TableCell>👎</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {q.byCondition.map((c: any) => {
              const pct = c.total ? Math.round((c.up / c.total) * 100) : 0;
              const color = pct >= 70 ? '#16a34a' : pct >= 40 ? '#ca8a04' : '#dc2626';
              return (
                <TableRow key={c.conditionKey}>
                  <TableCell sx={{ fontWeight: 700 }}>{c.conditionKey}</TableCell>
                  <TableCell align="right">{c.total}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Box sx={{ width: 60 }}><LinearProgress variant="determinate" value={pct} sx={{ height: 8, borderRadius: 5, bgcolor: '#eee', '& .MuiLinearProgress-bar': { bgcolor: color } }} /></Box>
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>{pct}%</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>{c.down}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table></Card>
      ) : (
        <Alert severity="info" sx={{ mb: 2 }}>Ainda sem avaliações. Quando os pacientes clicarem em 👍/👎 no plano de ação, a taxa de aprovação por condição aparece aqui — é o que orienta onde refinar os cards de conhecimento clínico.</Alert>
      )}

      {q.negativeComments?.length > 0 && (
        <>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 800 }}>Comentários 👎 recentes (onde melhorar)</Typography>
          <Stack spacing={1} sx={{ mb: 2 }}>
            {q.negativeComments.map((c: any) => (
              <Card key={c.id} variant="outlined" sx={{ borderRadius: 2 }}><CardContent sx={{ py: 1.25 }}>
                <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" sx={{ mb: 0.5 }}>
                  <Chip size="small" label={c.riskAssessment?.conditionKey ?? '?'} variant="outlined" />
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
          {ds.byCondition?.map((c: any) => <Chip key={c.conditionKey} size="small" variant="outlined" label={`${c.conditionKey}: ${c._count}`} />)}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">Nenhum paciente ativou o opt-in ainda. Quando ativar (toggle no app), cada leitura de risco doa um registro anônimo aqui.</Typography>
      )}
    </Box>
  );
};
