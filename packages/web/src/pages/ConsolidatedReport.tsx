import { useState } from 'react';
import { Box, Card, CardContent, Typography, Button, CircularProgress, Divider, Stack, Alert } from '@mui/material';
import { Title } from 'react-admin';
import DescriptionIcon from '@mui/icons-material/Description';
import PrintIcon from '@mui/icons-material/Print';
import { API_URL, apiHeaders } from '../config';
import { useSelectedPatient } from '../patient-context';

interface Summary {
  resumoGeral?: string;
  comparativo?: { name: string; anterior?: string | null; atual?: string | null; leitura?: string | null; entenda?: string | null }[];
  pontosAtencao?: { titulo: string; detalhe: string }[];
  coisasBoas?: string[];
  leituraFinal?: string;
  perguntasParaOMedico?: string[];
  interacoesMedicamentos?: { medicamento: string; analito: string; observacao: string }[];
  sugestoesNutricao?: string[];
  metasSaude?: { analito: string; meta: string; prazo?: string | null }[];
  disclaimer?: string;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <>
    <Typography variant="subtitle1" sx={{ mt: 2, mb: 1, color: '#336886', fontWeight: 700 }}>{title}</Typography>
    {children}
  </>
);

export const ConsolidatedReportPage = () => {
  const [pid] = useSelectedPatient();
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [error, setError] = useState('');

  const generate = () => {
    if (!pid) return;
    setLoading(true);
    setError('');
    fetch(`${API_URL}/analyses/consolidated`, {
      method: 'POST', headers: apiHeaders(true), body: JSON.stringify({ patientId: pid }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Falha ao gerar relatório');
        return r.json();
      })
      .then((a) => setAnalysis(a))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  const s: Summary | undefined = analysis?.structured;

  return (
    <Box>
      <Title title="Relatório completo" />
      <Typography variant="h5" gutterBottom>🧾 Relatório completo de saúde</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        A IA junta seus últimos exames (sangue, imagem e laudo) num documento único — ótimo para levar ao médico ou pedir segunda opinião documental.
      </Typography>

      {!analysis && (
        <Button variant="contained" size="large" startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <DescriptionIcon />} onClick={generate} disabled={loading || !pid}>
          {loading ? 'Gerando...' : 'Gerar relatório completo'}
        </Button>
      )}
      {!pid && <Typography color="text.secondary" sx={{ mt: 1 }}>Selecione um perfil no topo para gerar o relatório.</Typography>}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      {analysis && s && (
        <Card sx={{ mt: 2 }}><CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="h6">Relatório gerado 🩺</Typography>
            <Button size="small" startIcon={<PrintIcon />} onClick={() => window.print()}>Imprimir</Button>
          </Stack>
          <Divider sx={{ mb: 2 }} />

          {s.resumoGeral && <Typography paragraph>{s.resumoGeral}</Typography>}

          {s.comparativo?.length ? (
            <Section title="Itens em destaque">
              <Stack spacing={1}>
                {s.comparativo.map((c, i) => (
                  <Box key={i}>
                    <Typography><strong>{c.name}</strong>{c.atual ? ` — ${c.atual}` : ''} {c.leitura && `→ ${c.leitura}`}</Typography>
                    {c.entenda && <Typography variant="body2" color="text.secondary">{c.entenda}</Typography>}
                  </Box>
                ))}
              </Stack>
            </Section>
          ) : null}

          {s.pontosAtencao?.length ? (
            <Section title="🚩 Pontos de atenção">
              <Stack spacing={1}>
                {s.pontosAtencao.map((p, i) => (
                  <Typography key={i} variant="body2"><strong>{p.titulo}</strong> — {p.detalhe}</Typography>
                ))}
              </Stack>
            </Section>
          ) : null}

          {s.coisasBoas?.length ? (
            <Section title="✅ Pontos positivos">
              <ul style={{ margin: 0, paddingLeft: 20 }}>{s.coisasBoas.map((b, i) => <li key={i}><Typography variant="body2">{b}</Typography></li>)}</ul>
            </Section>
          ) : null}

          {s.interacoesMedicamentos?.length ? (
            <Section title="💊 Interações com medicação">
              <Stack spacing={1}>
                {s.interacoesMedicamentos.map((m, i) => (
                  <Typography key={i} variant="body2"><strong>{m.medicamento}</strong> × {m.analito}: {m.observacao}</Typography>
                ))}
              </Stack>
            </Section>
          ) : null}

          {s.sugestoesNutricao?.length ? (
            <Section title="🥗 Sugestões de nutrição">
              <ul style={{ margin: 0, paddingLeft: 20 }}>{s.sugestoesNutricao.map((b, i) => <li key={i}><Typography variant="body2">{b}</Typography></li>)}</ul>
            </Section>
          ) : null}

          {s.metasSaude?.length ? (
            <Section title="🎯 Metas">
              <Stack spacing={1}>
                {s.metasSaude.map((m, i) => (
                  <Typography key={i} variant="body2"><strong>{m.analito}</strong>: {m.meta}{m.prazo ? ` (${m.prazo})` : ''}</Typography>
                ))}
              </Stack>
            </Section>
          ) : null}

          {s.leituraFinal && <Section title="Leitura final"><Typography paragraph>{s.leituraFinal}</Typography></Section>}

          {s.perguntasParaOMedico?.length ? (
            <Section title="🩺 Perguntas para levar ao médico">
              <ol style={{ margin: 0, paddingLeft: 20 }}>{s.perguntasParaOMedico.map((q, i) => <li key={i}><Typography variant="body2">{q}</Typography></li>)}</ol>
            </Section>
          ) : null}

          <Divider sx={{ my: 2 }} />
          <Typography variant="caption" color="text.secondary">
            {s.disclaimer || 'Análise educativa gerada por IA a partir dos seus exames. A interpretação final deve ser feita por profissional de saúde.'}
          </Typography>
        </CardContent></Card>
      )}
    </Box>
  );
};
