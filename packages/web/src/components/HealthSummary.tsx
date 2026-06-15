import { Card, CardContent, Typography, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, Stack, Divider, Button, IconButton } from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import { DrExame } from './DrExame';
import ShareIcon from '@mui/icons-material/Share';
import VolumeUpIcon from '@mui/icons-material/RecordVoiceOver';
import ReactMarkdown from 'react-markdown';
import { API_URL, token } from '../config';

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
    const eq = Math.abs(d) < 1e-9;
    if (eq) return <Chip size="small" label="estável" sx={{ bgcolor: '#f0f0f0', color: '#666' }} />;
    const up = d > 0;
    const cor = leitura?.toLowerCase().includes('aten') ? '#e65100' : up ? '#1565c0' : '#2e7d32';
    return <Chip size="small" sx={{ bgcolor: `${cor}15`, color: cor, fontWeight: 700 }} label={`${up ? '↑' : '↓'} ${d > 0 ? '+' : ''}${Number(d.toFixed(2))}`} />;
  }
  if (leitura) return <Chip size="small" variant="outlined" label={leitura} sx={{ fontSize: 12 }} />;
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

  const share = async () => {
    try {
      const r = await fetch(`${API_URL}/analyses/${analysis.id}/share`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` } });
      const d = await r.json();
      if (d.link) { navigator.clipboard?.writeText(d.link); alert('Link copiado! Cole e envie ao seu médico.'); }
    } catch { alert('Falha ao gerar link.'); }
  };

  const printSummary = () => {
    const w = window.open('', '_blank', 'width=820,height=940');
    if (!w) return;
    const esc = (s?: string) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const rows = (structured?.comparativo ?? []).map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.anterior ?? '—')}</td><td style="font-weight:700">${esc(c.atual ?? '—')}</td><td>${esc(c.leitura ?? '')}</td><td style="font-size:12px;color:#555">${esc(c.entenda ?? '')}</td></tr>`).join('');
    const atencao = (structured?.pontosAtencao ?? []).map((p) => `<li><b>${esc(p.titulo)}</b> — ${esc(p.detalhe)}</li>`).join('');
    const boas = (structured?.coisasBoas ?? []).map((b) => `<li>${esc(b)}</li>`).join('');
    const perg = (structured?.perguntasParaOMedico ?? []).map((q) => `<li>${esc(q)}</li>`).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Resumo de Saúde</title><style>body{font-family:Segoe UI,Arial,sans-serif;padding:34px;line-height:1.6;color:#15233b;max-width:760px;margin:auto}h1{font-size:22px}h2{font-size:16px;margin-top:22px;color:#0b5cab}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #ddd;padding:6px 8px}th{background:#eef3fb}</style></head><body><h1>Resumo de Saúde</h1>${structured?.resumoGeral ? `<p>${esc(structured.resumoGeral)}</p>` : ''}${rows ? `<h2>Comparativo</h2><table><tr><th>Exame</th><th>Anterior</th><th>Atual</th><th>Variação</th><th>O que significa</th></tr>${rows}</table>` : ''}${atencao ? `<h2>Pontos de atenção</h2><ul>${atencao}</ul>` : ''}${boas ? `<h2>Coisas boas</h2><ul>${boas}</ul>` : ''}${structured?.leituraFinal ? `<h2>Leitura final</h2><p>${esc(structured.leituraFinal)}</p>` : ''}${perg ? `<h2>Perguntas para o médico</h2><ol>${perg}</ol>` : ''}<p style="color:#888;font-size:12px">${esc(structured?.disclaimer || 'Análise educativa. Não substitui avaliação médica.')}</p></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };

  if (!structured) {
    return (
      <Card sx={{ mt: 3, background: 'linear-gradient(135deg,#f8fbff,#eef5ff)' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>🤖 Resumo de saúde</Typography>
          <ReactMarkdown>{contentMd || ''}</ReactMarkdown>
        </CardContent>
      </Card>
    );
  }

  const SectionCard = ({ icon, title, color, children }: any) => (
    <Box sx={{ mt: 2, p: 2, borderRadius: 3, background: `${color}08`, border: `1px solid ${color}22`, borderLeft: `4px solid ${color}` }}>
      <Typography sx={{ fontWeight: 800, color, mb: 1, display: 'flex', alignItems: 'center', gap: 1, fontSize: '1.05rem' }}>{icon} {title}</Typography>
      {children}
    </Box>
  );

  return (
    <Card sx={{ mt: 3, borderRadius: 4, overflow: 'hidden', boxShadow: '0 4px 20px rgba(11,92,171,.08)' }}>
      {/* Header premium */}
      <Box sx={{ background: 'linear-gradient(135deg,#0b5cab,#1565c0)', p: 2.5, color: '#fff' }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <DrExame size={48} sx={{ borderRadius: '12px', border: '2px solid rgba(255,255,255,.3)' }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>Análise de Saúde</Typography>
            <Typography sx={{ opacity: .85, fontSize: 13 }}>Resumo educativo — não substitui consulta médica</Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ mt: 2 }} useFlexGap flexWrap="wrap">
          <Button size="small" sx={{ color: '#fff', borderColor: 'rgba(255,255,255,.4)', bgcolor: 'rgba(255,255,255,.1)' }} startIcon={<DrExame size={20} />} onClick={speak}>Dr. Exame fala</Button>
          <Button size="small" variant="outlined" sx={{ color: '#fff', borderColor: 'rgba(255,255,255,.4)' }} startIcon={<ShareIcon />} onClick={share}>Compartilhar</Button>
          <Button size="small" variant="outlined" sx={{ color: '#fff', borderColor: 'rgba(255,255,255,.4)' }} startIcon={<PrintIcon />} onClick={printSummary}>Imprimir</Button>
        </Stack>
      </Box>

      <CardContent sx={{ p: 3 }}>
        {/* Resumo geral */}
        {structured.resumoGeral && (
          <Typography sx={{ fontSize: '1.08rem', lineHeight: 1.7, color: '#15233b' }}>{structured.resumoGeral}</Typography>
        )}

        {/* Comparativo */}
        {structured.comparativo?.length > 0 && (
          <SectionCard icon="📊" title="Comparativo (anterior × atual)" color="#1565c0">
            <TableContainer component={Paper} variant="outlined" sx={{ border: 'none' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#eef3fb', borderBottom: '2px solid #1565c0' } }}>
                    <TableCell>Exame</TableCell>
                    <TableCell align="center">Anterior</TableCell>
                    <TableCell align="center">Atual</TableCell>
                    <TableCell align="center">Variação</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {structured.comparativo.map((c, i) => (
                    <TableRow key={i} sx={{ '&:hover': { bgcolor: '#f8fbff' }, '& td': { py: 1.2, fontSize: '0.95rem' } }}>
                      <TableCell sx={{ fontWeight: 600 }}>{c.name}</TableCell>
                      <TableCell align="center" sx={{ color: 'text.secondary' }}>{c.anterior || '—'}</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 800, fontSize: '1.1rem !important' }}>{c.atual || '—'}</TableCell>
                      <TableCell align="center"><Variation anterior={c.anterior} atual={c.atual} leitura={c.leitura} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {structured.comparativo.some((c) => c.entenda) && (
              <Box sx={{ mt: 1 }}>
                {structured.comparativo.filter((c) => c.entenda).slice(0, 3).map((c, i) => (
                  <Typography key={i} variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>💡 <strong>{c.name}:</strong> {c.entenda}</Typography>
                ))}
              </Box>
            )}
          </SectionCard>
        )}

        {/* Pontos de atenção */}
        {structured.pontosAtencao?.length > 0 && (
          <SectionCard icon="🚩" title="Pontos que merecem atenção" color="#e65100">
            {structured.pontosAtencao.map((p, i) => (
              <Box key={i} sx={{ mb: 1.5, '&:last-child': { mb: 0 } }}>
                <Typography sx={{ fontWeight: 700, color: '#15233b' }}>{i + 1}. {p.titulo}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.3 }}>{p.detalhe}</Typography>
              </Box>
            ))}
          </SectionCard>
        )}

        {/* Coisas boas */}
        {structured.coisasBoas?.length > 0 && (
          <SectionCard icon="✅" title="Coisas boas" color="#2e7d32">
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {structured.coisasBoas.map((b, i) => <Chip key={i} sx={{ bgcolor: '#2e7d3215', color: '#2e7d32', fontWeight: 600 }} label={b} />)}
            </Stack>
          </SectionCard>
        )}

        {/* Leitura final */}
        {structured.leituraFinal && (
          <Box sx={{ mt: 2, p: 2.5, borderRadius: 3, background: 'linear-gradient(135deg,#eef3fb,#dde9f7)', border: '1px solid #c4d7ee' }}>
            <Typography sx={{ fontWeight: 800, color: '#0b5cab', mb: 0.5, fontSize: '1.05rem' }}>📌 Leitura final</Typography>
            <Typography sx={{ lineHeight: 1.7 }}>{structured.leituraFinal}</Typography>
          </Box>
        )}

        {/* Perguntas */}
        {structured.perguntasParaOMedico?.length > 0 && (
          <SectionCard icon="🩺" title="Perguntas para levar ao médico" color="#7b1fa2">
            {structured.perguntasParaOMedico.map((q, i) => (
              <Typography key={i} sx={{ py: 0.5, pl: 1, borderLeft: '3px solid #7b1fa233' }}>{i + 1}. {q}</Typography>
            ))}
          </SectionCard>
        )}

        <Divider sx={{ my: 2 }} />
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', textAlign: 'center' }}>
          {structured.disclaimer || 'Análise educativa. Leve ao seu médico para interpretação clínica.'}
        </Typography>
      </CardContent>
    </Card>
  );
};
