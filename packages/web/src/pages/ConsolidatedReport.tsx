import { useState } from 'react';
import { Box, Card, CardContent, Typography, Button, CircularProgress, Divider, Stack, Alert, Chip } from '@mui/material';
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
interface SourceExam { title: string; performedAt: string | null; sourceLab: string | null; kind: string }

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <>
    <Typography variant="subtitle1" sx={{ mt: 2, mb: 1, color: '#336886', fontWeight: 700 }}>{title}</Typography>
    {children}
  </>
);

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : 's/d');

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

  const asArr = (x: any): any[] => (Array.isArray(x) ? x : x == null ? [] : [x]);
  const s: Summary | undefined = analysis?.structured
    ? {
        ...analysis.structured,
        comparativo: asArr(analysis.structured.comparativo),
        pontosAtencao: asArr(analysis.structured.pontosAtencao),
        coisasBoas: asArr(analysis.structured.coisasBoas),
        perguntasParaOMedico: asArr(analysis.structured.perguntasParaOMedico),
        interacoesMedicamentos: asArr(analysis.structured.interacoesMedicamentos),
        sugestoesNutricao: asArr(analysis.structured.sugestoesNutricao),
        metasSaude: asArr(analysis.structured.metasSaude),
      }
    : undefined;
  const sourceExams: SourceExam[] = analysis?.sourceExams ?? [];

  /** Imprime/salva PDF premium (nova janela com HTML estilizado). */
  const printReport = () => {
    const w = window.open('', '_blank', 'width=840,height=1000');
    if (!w) return;
    const esc = (str?: string) => (str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
    const examList = sourceExams
      .map((e) => `<li><b>${esc(e.title)}</b>${e.performedAt ? ' — ' + fmtDate(e.performedAt) : ''}${e.sourceLab ? ' • ' + esc(e.sourceLab) : ''}</li>`)
      .join('');
    const comp = (s?.comparativo ?? []).map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.anterior ?? '—')}</td><td><b>${esc(c.atual ?? '—')}</b></td><td>${esc(c.leitura ?? '')}</td></tr>`).join('');
    const atencao = (s?.pontosAtencao ?? []).map((p) => `<li><b>${esc(p.titulo)}</b> — ${esc(p.detalhe)}</li>`).join('');
    const boas = (s?.coisasBoas ?? []).map((b) => `<li>${esc(b)}</li>`).join('');
    const nut = (s?.sugestoesNutricao ?? []).map((b) => `<li>${esc(b)}</li>`).join('');
    const metas = (s?.metasSaude ?? []).map((m) => `<li><b>${esc(m.analito)}</b>: ${esc(m.meta)}${m.prazo ? ` (${esc(m.prazo)})` : ''}</li>`).join('');
    const inter = (s?.interacoesMedicamentos ?? []).map((m) => `<li><b>${esc(m.medicamento)}</b> × ${esc(m.analito)}: ${esc(m.observacao)}</li>`).join('');
    const perg = (s?.perguntasParaOMedico ?? []).map((q) => `<li>${esc(q)}</li>`).join('');
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de Saúde</title>
<style>
*{box-sizing:border-box}body{font-family:'Inter','Segoe UI',Arial,sans-serif;color:#15233b;background:#f8fafc;margin:0;padding:32px;line-height:1.6}
.doc{max-width:760px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 6px 30px rgba(0,0,0,.1)}
.head{background:linear-gradient(135deg,#336886,#2a5a73);color:#fff;padding:28px 32px}
.head h1{margin:0;font-size:24px;font-weight:800}.head p{margin:4px 0 0;opacity:.85;font-size:13px}
.body{padding:28px 32px}
.base{background:#f0f7ff;border-left:4px solid #336886;border-radius:10px;padding:14px 16px;margin-bottom:18px;font-size:13px}
.base b{color:#336886}
h2{font-size:15px;color:#336886;margin:22px 0 8px;border-bottom:2px solid #eef2f7;padding-bottom:4px}
ul,ol{margin:6px 0;padding-left:22px}li{margin:4px 0;font-size:14px}
table{border-collapse:collapse;width:100%;font-size:13px;margin-top:6px}
td,th{border:1px solid #e2e8f0;padding:7px 9px;text-align:left}th{background:#f0f7ff;font-weight:700}
.foot{text-align:center;color:#94a3b8;font-size:11px;padding:16px}
</style></head><body>
<div class="doc">
  <div class="head"><h1>Relatório de Saúde</h1><p>Análise educativa consolidada — não substitui consulta médica</p></div>
  <div class="body">
    ${examList ? `<div class="base"><b>Relatório baseado em ${sourceExams.length} exame(s):</b><ul style="margin:6px 0 0">${examList}</ul></div>` : ''}
    ${s?.resumoGeral ? `<h2>Resumo geral</h2><p>${esc(s.resumoGeral)}</p>` : ''}
    ${comp ? `<h2>Itens em destaque</h2><table><tr><th>Exame</th><th>Anterior</th><th>Atual</th><th>Variação</th></tr>${comp}</table>` : ''}
    ${atencao ? `<h2>🚩 Pontos de atenção</h2><ul>${atencao}</ul>` : ''}
    ${boas ? `<h2>✅ Pontos positivos</h2><ul>${boas}</ul>` : ''}
    ${inter ? `<h2>💊 Interações com medicação</h2><ul>${inter}</ul>` : ''}
    ${nut ? `<h2>🥗 Sugestões de nutrição</h2><ul>${nut}</ul>` : ''}
    ${metas ? `<h2>🎯 Metas</h2><ul>${metas}</ul>` : ''}
    ${s?.leituraFinal ? `<h2>Leitura final</h2><p>${esc(s.leituraFinal)}</p>` : ''}
    ${perg ? `<h2>🩺 Perguntas para o médico</h2><ol>${perg}</ol>` : ''}
    <div class="foot">${esc(s?.disclaimer || 'Análise educativa gerada por IA. A interpretação final deve ser feita por profissional de saúde.')}</div>
  </div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`);
    w.document.close();
  };

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
        <Card sx={{ mt: 2, borderRadius: 4, overflow: 'hidden', boxShadow: '0 4px 20px rgba(11,92,171,.08)' }}>
          <Box sx={{ background: 'linear-gradient(135deg,#336886,#2a5a73)', color: '#fff', p: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>Relatório consolidado 🩺</Typography>
              <Typography sx={{ fontSize: 13, opacity: 0.9 }}>Análise educativa — não substitui consulta médica</Typography>
            </Box>
            <Button size="small" variant="outlined" sx={{ color: '#fff', borderColor: 'rgba(255,255,255,.5)' }} startIcon={<PrintIcon />} onClick={printReport}>Imprimir / PDF</Button>
          </Box>

          <CardContent sx={{ p: 3 }}>
            {sourceExams.length > 0 && (
              <Box sx={{ mb: 2, p: 1.5, borderRadius: 2, background: '#f0f7ff', borderLeft: '4px solid #336886' }}>
                <Typography sx={{ fontWeight: 700, color: '#336886', fontSize: 14, mb: 1 }}>📊 Relatório baseado em {sourceExams.length} exame(s):</Typography>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  {sourceExams.map((e, i) => (
                    <Chip key={i} size="small" sx={{ bgcolor: '#33688615', color: '#336886', fontWeight: 600 }} label={`${e.title}${e.performedAt ? ` • ${fmtDate(e.performedAt)}` : ''}`} />
                  ))}
                </Stack>
              </Box>
            )}

            {s.resumoGeral && <Typography paragraph sx={{ fontSize: '1.05rem', lineHeight: 1.7 }}>{s.resumoGeral}</Typography>}

            {s.comparativo?.length ? (
              <Section title="Itens em destaque">
                <Stack spacing={1}>{s.comparativo.map((c, i) => (
                  <Box key={i}><Typography><strong>{c.name}</strong>{c.atual ? ` — ${c.atual}` : ''} {c.leitura && `→ ${c.leitura}`}</Typography>
                  {c.entenda && <Typography variant="body2" color="text.secondary">{c.entenda}</Typography>}</Box>
                ))}</Stack>
              </Section>
            ) : null}

            {s.pontosAtencao?.length ? (
              <Section title="🚩 Pontos de atenção">
                <Stack spacing={1}>{s.pontosAtencao.map((p, i) => <Typography key={i} variant="body2"><strong>{p.titulo}</strong> — {p.detalhe}</Typography>)}</Stack>
              </Section>
            ) : null}

            {s.coisasBoas?.length ? (
              <Section title="✅ Pontos positivos">
                <ul style={{ margin: 0, paddingLeft: 20 }}>{s.coisasBoas.map((b, i) => <li key={i}><Typography variant="body2">{b}</Typography></li>)}</ul>
              </Section>
            ) : null}

            {s.interacoesMedicamentos?.length ? (
              <Section title="💊 Interações com medicação">
                <Stack spacing={1}>{s.interacoesMedicamentos.map((m, i) => <Typography key={i} variant="body2"><strong>{m.medicamento}</strong> × {m.analito}: {m.observacao}</Typography>)}</Stack>
              </Section>
            ) : null}

            {s.sugestoesNutricao?.length ? (
              <Section title="🥗 Sugestões de nutrição">
                <ul style={{ margin: 0, paddingLeft: 20 }}>{s.sugestoesNutricao.map((b, i) => <li key={i}><Typography variant="body2">{b}</Typography></li>)}</ul>
              </Section>
            ) : null}

            {s.metasSaude?.length ? (
              <Section title="🎯 Metas">
                <Stack spacing={1}>{s.metasSaude.map((m, i) => <Typography key={i} variant="body2"><strong>{m.analito}</strong>: {m.meta}{m.prazo ? ` (${m.prazo})` : ''}</Typography>)}</Stack>
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
          </CardContent>
        </Card>
      )}
    </Box>
  );
};
