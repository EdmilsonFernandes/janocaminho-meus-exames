import { Card, CardContent, Typography, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, Stack, Divider, Button } from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import VolumeUpIcon from '@mui/icons-material/RecordVoiceOver';
import { DrExame } from './DrExame';
import ReactMarkdown from 'react-markdown';

interface ComparativoRow { name: string; anterior?: string | null; atual?: string | null; leitura?: string | null; entenda?: string | null }
interface Summary {
  resumoGeral?: string;
  comparativo?: ComparativoRow[];
  pontosAtencao?: { titulo: string; detalhe: string }[];
  coisasBoas?: string[];
  leituraFinal?: string;
  perguntasParaOMedico?: string[];
  disclaimer?: string;
}

const num = (s?: string | null): number | null => {
  if (!s) return null;
  const m = String(s).replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

const Variation = ({ anterior, atual, leitura }: { anterior?: string | null; atual?: string | null; leitura?: string | null }) => {
  const a = num(anterior), b = num(atual);
  if (a != null && b != null) {
    const d = b - a;
    const up = d > 0;
    const eq = Math.abs(d) < 1e-9;
    const color = eq ? 'default' : 'success';
    const label = eq ? 'estável' : `${up ? '↑' : '↓'} ${d > 0 ? '+' : ''}${Number(d.toFixed(2))}`;
    return <Chip size="small" color={eq ? 'default' : color} sx={eq ? {} : { bgcolor: up ? '#e3f2fd' : '#e8f5e9', color: '#1565c0' }} label={label} />;
  }
  if (leitura) return <Chip size="small" variant="outlined" label={leitura} />;
  return null;
};

export const HealthSummary = ({ analysis }: { analysis?: any }) => {
  const structured: Summary | undefined = analysis?.structured;
  const contentMd: string | undefined = analysis?.contentMd;

  const speak = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const text = [structured?.resumoGeral, structured?.leituraFinal].filter(Boolean).join('. ');
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR';
    const v = synth.getVoices().find((vv) => vv.lang?.toLowerCase().startsWith('pt'));
    if (v) u.voice = v;
    synth.speak(u);
  };

  const printSummary = () => {
    const w = window.open('', '_blank', 'width=820,height=940');
    if (!w) return;
    const esc = (s?: string) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const rows = (structured?.comparativo ?? [])
      .map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.anterior ?? '—')}</td><td>${esc(c.atual ?? '—')}</td><td>${esc(c.leitura ?? '')}</td><td>${esc(c.entenda ?? '')}</td></tr>`).join('');
    const atencao = (structured?.pontosAtencao ?? []).map((p) => `<li><b>${esc(p.titulo)}</b> — ${esc(p.detalhe)}</li>`).join('');
    const boas = (structured?.coisasBoas ?? []).map((b) => `<li>${esc(b)}</li>`).join('');
    const perg = (structured?.perguntasParaOMedico ?? []).map((q) => `<li>${esc(q)}</li>`).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Resumo de Saúde</title>
      <style>body{font-family:Segoe UI,Arial,sans-serif;padding:34px;line-height:1.55;color:#15233b;max-width:760px;margin:auto}
      h1{font-size:22px}h2{font-size:16px;margin-top:22px;color:#0b5cab}
      table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #ccc;padding:6px 8px;text-align:left}
      th{background:#eef3fb}ul,ol{padding-left:20px}.muted{color:#666;font-size:12px}</style></head><body>
      <h1>🩺 Resumo de Saúde</h1>
      ${structured?.resumoGeral ? `<p>${esc(structured.resumoGeral)}</p>` : ''}
      ${rows ? `<h2>Comparativo (anterior × atual)</h2><table><tr><th>Exame</th><th>Anterior</th><th>Atual</th><th>Variação</th><th>O que significa</th></tr>${rows}</table>` : ''}
      ${atencao ? `<h2>Pontos que merecem atenção</h2><ul>${atencao}</ul>` : ''}
      ${boas ? `<h2>Coisas boas</h2><ul>${boas}</ul>` : ''}
      ${structured?.leituraFinal ? `<h2>Leitura final</h2><p>${esc(structured.leituraFinal)}</p>` : ''}
      ${perg ? `<h2>Perguntas para o médico</h2><ol>${perg}</ol>` : ''}
      <p class="muted">${esc(structured?.disclaimer || 'Análise educativa. Não substitui avaliação médica.')}</p>
      </body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };

  if (!structured) {
    return (
      <Card variant="outlined" sx={{ mt: 3, background: '#fbfdff' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>🤖 Resumo de saúde (educativo)</Typography>
          <ReactMarkdown>{contentMd || ''}</ReactMarkdown>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="outlined" sx={{ mt: 3, background: '#fbfdff' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="h6">🤖 Análise de saúde (educativa — não substitui o médico)</Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button size="small" variant="contained" startIcon={<DrExame size={22} />} onClick={speak}>Dr. Exame fala</Button>
            <Button size="small" variant="outlined" startIcon={<PrintIcon />} onClick={printSummary}>Imprimir / PDF</Button>
          </Stack>
        </Box>

        {structured.resumoGeral && (
          <Typography sx={{ mb: 2, fontSize: '1.05rem' }}>{structured.resumoGeral}</Typography>
        )}

        {structured.comparativo && structured.comparativo.length > 0 && (
          <>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 1, mb: 1 }}>📊 Comparativo (anterior × atual)</Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ background: '#eef3fb' }}>
                    <TableCell sx={{ fontWeight: 700 }}>Exame</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">Anterior</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">Atual</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">Variação</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>O que significa</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {structured.comparativo.map((c, i) => (
                    <TableRow key={i} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{c.name}</TableCell>
                      <TableCell align="center">{c.anterior || '—'}</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>{c.atual || '—'}</TableCell>
                      <TableCell align="center"><Variation anterior={c.anterior} atual={c.atual} leitura={c.leitura} /></TableCell>
                      <TableCell sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>{c.entenda || c.leitura || ''}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}

        {structured.pontosAtencao && structured.pontosAtencao.length > 0 && (
          <Box sx={{ mt: 1, mb: 2, p: 1.5, background: 'rgba(230,81,0,.06)', borderRadius: 2, borderLeft: '5px solid', borderColor: 'warning.main' }}>
            <Typography sx={{ fontWeight: 700, color: 'warning.main', mb: 1 }}>🚩 Pontos que merecem atenção</Typography>
            {structured.pontosAtencao.map((p, i) => (
              <Box key={i} sx={{ mb: 1 }}>
                <Typography sx={{ fontWeight: 600 }}>{i + 1}. {p.titulo}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>{p.detalhe}</Typography>
              </Box>
            ))}
          </Box>
        )}

        {structured.coisasBoas && structured.coisasBoas.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography sx={{ fontWeight: 700, color: 'success.main', mb: 0.5 }}>✅ Coisas boas</Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {structured.coisasBoas.map((b, i) => <Chip key={i} size="small" color="success" variant="outlined" label={b} />)}
            </Stack>
          </Box>
        )}

        {structured.leituraFinal && (
          <Box sx={{ mb: 2, p: 1.5, background: '#eef3fb', borderRadius: 2 }}>
            <Typography sx={{ fontWeight: 700, mb: 0.5 }}>📌 Leitura final</Typography>
            <Typography>{structured.leituraFinal}</Typography>
          </Box>
        )}

        {structured.perguntasParaOMedico && structured.perguntasParaOMedico.length > 0 && (
          <Box sx={{ mb: 1 }}>
            <Typography sx={{ fontWeight: 700, mb: 0.5 }}>🩺 Perguntas para levar ao médico</Typography>
            {structured.perguntasParaOMedico.map((q, i) => (
              <Typography key={i} sx={{ pl: 1 }}>{i + 1}. {q}</Typography>
            ))}
          </Box>
        )}

        <Divider sx={{ my: 1.5 }} />
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {structured.disclaimer || 'Análise educativa. Leve ao seu médico para interpretação clínica.'}
        </Typography>
      </CardContent>
    </Card>
  );
};
