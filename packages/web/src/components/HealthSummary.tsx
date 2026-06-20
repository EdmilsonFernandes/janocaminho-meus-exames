import { useState, useRef } from 'react';
import { Card, CardContent, Typography, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, Stack, Divider, Button, IconButton, Accordion, AccordionSummary, AccordionDetails, useMediaQuery, useTheme, Popover } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PrintIcon from '@mui/icons-material/Print';
import { DrExame } from './DrExame';
import { printDocument, speakText, stopSpeakText } from '../utils/nativeDoc';
import ShareIcon from '@mui/icons-material/Share';
import VolumeUpIcon from '@mui/icons-material/RecordVoiceOver';
import ReactMarkdown from 'react-markdown';
import { API_URL, token } from '../config';
import { ShareDialog } from './ShareDialog';

interface ComparativoRow { name: string; anterior?: string | null; atual?: string | null; leitura?: string | null; entenda?: string | null }
interface Summary {
  resumoGeral?: string;
  comparativo?: ComparativoRow[];
  pontosAtencao?: { titulo: string; detalhe: string }[];
  coisasBoas?: string[];
  leituraFinal?: string;
  perguntasParaOMedico?: string[];
  interacoesMedicamentos?: { medicamento: string; analito: string; observacao: string }[];
  sugestoesNutricao?: string[];
  comparacaoFamiliar?: string | null;
  metasSaude?: { analito: string; meta: string; prazo?: string | null }[];
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

const asArr = (x: any): any[] => (Array.isArray(x) ? x : x == null ? [] : [x]);

/** Nome de exame: trunca em 2 linhas; se longo, clica e abre popover com o texto completo + "entenda". */
export const NameToggle = ({ name, entenda }: { name: string; entenda?: string | null }) => {
  const [a, setA] = useState<HTMLElement | null>(null);
  const long = (name || '').length > 24;
  return (
    <>
      <Box
        component="span"
        onClick={long ? (e) => { e.stopPropagation(); setA(e.currentTarget); } : undefined}
        sx={{
          fontWeight: 700, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          cursor: long ? 'pointer' : 'default', minWidth: 0,
        }}
      >
        {name}{long && <Box component="span" sx={{ color: 'primary.main', fontSize: 12, ml: 0.5 }}>…mais</Box>}
      </Box>
      <Popover open={!!a} anchorEl={a} onClose={() => setA(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { maxWidth: 340, borderRadius: 3 } } }}>
        <Box sx={{ p: 2, maxWidth: 340 }}>
          <Typography sx={{ fontWeight: 800, color: '#178f89' }}>{name}</Typography>
          {entenda && <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>💡 {entenda}</Typography>}
        </Box>
      </Popover>
    </>
  );
};

export const HealthSummary = ({ analysis }: { analysis?: any }) => {
  const raw: Summary | undefined = analysis?.structured;
  const contentMd: string | undefined = analysis?.contentMd;
  const [shareOpen, setShareOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [rate, setRate] = useState(1);
  const restartingRef = useRef(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  // Normaliza: a IA às vezes devolve esses campos como string/null em vez de array — força array p/ não quebrar o .map
  const structured: Summary | undefined = raw
    ? {
        ...raw,
        comparativo: asArr(raw.comparativo),
        pontosAtencao: asArr(raw.pontosAtencao),
        coisasBoas: asArr(raw.coisasBoas),
        perguntasParaOMedico: asArr(raw.perguntasParaOMedico),
        interacoesMedicamentos: asArr(raw.interacoesMedicamentos),
        sugestoesNutricao: asArr(raw.sugestoesNutricao),
        metasSaude: asArr(raw.metasSaude),
      }
    : undefined;

  const speak = (newRate?: number) => {
    const text = [structured?.resumoGeral, structured?.leituraFinal].filter(Boolean).join('. ');
    if (!text) return;
    setSpeaking(true);
    // speakText usa TTS nativo (voz pt-BR) no APK e speechSynthesis no web.
    void speakText(text, {
      rate: newRate ?? rate,
      onDone: () => { if (!restartingRef.current) setSpeaking(false); },
      onFail: () => { if (!restartingRef.current) setSpeaking(false); },
    });
  };
  const stopSpeak = () => { void stopSpeakText(); setSpeaking(false); };
  const changeRate = (r: number) => {
    setRate(r);
    if (speaking) {
      restartingRef.current = true;
      speak(r);
      setTimeout(() => { restartingRef.current = false; }, 600);
    }
  };

  const printSummary = () => {
    const esc = (s?: string) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const rows = (structured?.comparativo ?? []).map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.anterior ?? '—')}</td><td style="font-weight:700">${esc(c.atual ?? '—')}</td><td>${esc(c.leitura ?? '')}</td><td style="font-size:12px;color:#555">${esc(c.entenda ?? '')}</td></tr>`).join('');
    const atencao = (structured?.pontosAtencao ?? []).map((p) => `<li><b>${esc(p.titulo)}</b> — ${esc(p.detalhe)}</li>`).join('');
    const boas = (structured?.coisasBoas ?? []).map((b) => `<li>${esc(b)}</li>`).join('');
    const perg = (structured?.perguntasParaOMedico ?? []).map((q) => `<li>${esc(q)}</li>`).join('');
    const __docHtml = (`<!doctype html><html><head><meta charset="utf-8"><title>Resumo de Saúde</title><style>body{font-family:Segoe UI,Arial,sans-serif;padding:34px;line-height:1.6;color:#15233b;max-width:760px;margin:auto}h1{font-size:22px}h2{font-size:16px;margin-top:22px;color:#0b5cab}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #ddd;padding:6px 8px}th{background:#eef3fb}</style></head><body><h1>Resumo de Saúde</h1>${structured?.resumoGeral ? `<p>${esc(structured.resumoGeral)}</p>` : ''}${rows ? `<h2>Comparativo</h2><table><tr><th>Exame</th><th>Anterior</th><th>Atual</th><th>Variação</th><th>O que significa</th></tr>${rows}</table>` : ''}${atencao ? `<h2>Pontos de atenção</h2><ul>${atencao}</ul>` : ''}${boas ? `<h2>Coisas boas</h2><ul>${boas}</ul>` : ''}${structured?.leituraFinal ? `<h2>Leitura final</h2><p>${esc(structured.leituraFinal)}</p>` : ''}${perg ? `<h2>Perguntas para o médico</h2><ol>${perg}</ol>` : ''}<p style="color:#888;font-size:12px">${esc(structured?.disclaimer || 'Análise educativa. Não substitui avaliação médica.')}</p></body></html>`);
    void printDocument('Resumo de Saúde', __docHtml);
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

  // Seção colapsável (Accordion) — acaba com o "scroll infinito" da análise.
  const AccordionSection = ({ icon, title, color, count, defaultExpanded = false, children }: any) => (
    <Accordion defaultExpanded={defaultExpanded} disableGutters elevation={0} sx={{
      mt: 1.5, borderRadius: '12px !important', overflow: 'hidden',
      background: `${color}08`, border: `1px solid ${color}22`, borderLeft: `4px solid ${color}`, '&:before': { display: 'none' },
    }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: '48px !important', '& .MuiAccordionSummary-content': { my: 0.75 } }}>
        <Typography sx={{ fontWeight: 800, color, display: 'flex', alignItems: 'center', gap: 1, fontSize: '1.02rem' }}>
          <Box component="span" sx={{ fontSize: '1.1rem' }}>{icon}</Box> {title}
          {count != null && <Chip size="small" label={count} sx={{ ml: 0.5, bgcolor: `${color}22`, color, height: 20, fontWeight: 700 }} />}
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 1, pb: 2, px: 2 }}>{children}</AccordionDetails>
    </Accordion>
  );

  return (
    <Card sx={{ mt: 3, borderRadius: 4, overflow: 'hidden', boxShadow: '0 4px 20px rgba(11,92,171,.08)' }}>
      {/* Header */}
      <Box sx={{ background: 'linear-gradient(135deg,#f0f7ff,#e6f3ff)', p: 2.5, borderBottom: '2px solid #336886' }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <DrExame size={48} sx={{ borderRadius: '50%', border: '3px solid #fff', boxShadow: '0 4px 14px rgba(11,92,171,.22)' }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a' }}>Análise de Saúde</Typography>
            <Typography sx={{ color: '#64748b', fontSize: 13 }}>Resumo educativo — não substitui consulta médica</Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ mt: 2, overflowX: 'auto', '&::-webkit-scrollbar': { display: 'none' }, '& .MuiButton-root': { flexShrink: 0, whiteSpace: 'nowrap' } }} useFlexGap>
          <Button size="small" variant="contained" startIcon={<DrExame size={20} />} onClick={speaking ? stopSpeak : () => speak()}>
            {speaking ? '⏹ Parar' : '🔊 Dr. Exame fala'}
          </Button>
          {speaking && (
            <>
              <Button size="small" variant={rate === 1 ? 'contained' : 'outlined'} onClick={() => changeRate(1)} sx={{ minWidth: 40, px: 1 }}>1x</Button>
              <Button size="small" variant={rate === 1.3 ? 'contained' : 'outlined'} onClick={() => changeRate(1.3)} sx={{ minWidth: 40, px: 1 }}>1.3x</Button>
              <Button size="small" variant={rate === 1.5 ? 'contained' : 'outlined'} onClick={() => changeRate(1.5)} sx={{ minWidth: 40, px: 1 }}>1.5x</Button>
            </>
          )}
          <Button size="small" variant="outlined" startIcon={<ShareIcon />} onClick={() => setShareOpen(true)}>Compartilhar</Button>
          <Button size="small" variant="outlined" startIcon={<PrintIcon />} onClick={printSummary}>Imprimir</Button>
        </Stack>
      </Box>

      <CardContent sx={{ p: 3 }}>
        {/* Resumo geral */}
        {structured.resumoGeral && (
          <Typography sx={{ fontSize: '1.08rem', lineHeight: 1.7, color: '#15233b' }}>{structured.resumoGeral}</Typography>
        )}

        {/* Comparativo */}
        {structured.comparativo && structured.comparativo.length > 0 && (
          <AccordionSection icon="📊" title="Comparativo (anterior × atual)" color="#1565c0" count={structured.comparativo.length} defaultExpanded>
            {isMobile ? (
              // Mobile: cards (não quebra labels como a tabela)
              <Stack spacing={1}>
                {structured.comparativo.map((c, i) => (
                  <Box key={i} sx={{ p: 1.25, borderRadius: 2, bgcolor: '#f6faff', border: '1px solid #e0e8f5' }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
                      <NameToggle name={c.name} entenda={c.entenda} />
                      <Variation anterior={c.anterior} atual={c.atual} leitura={c.leitura} />
                    </Stack>
                    <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ mt: 0.5 }} flexWrap="wrap">
                      <Typography variant="body2" color="text.secondary">{c.anterior || '—'}</Typography>
                      <Typography variant="body2" color="primary.main" sx={{ fontWeight: 800 }}>→</Typography>
                      <Typography sx={{ fontWeight: 800, color: '#0b5cab' }}>{c.atual || '—'}</Typography>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            ) : (
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
                        <TableCell sx={{ fontWeight: 600, maxWidth: 240 }}><NameToggle name={c.name} entenda={c.entenda} /></TableCell>
                        <TableCell align="center" sx={{ color: 'text.secondary' }}>{c.anterior || '—'}</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 800, fontSize: '1.1rem !important' }}>{c.atual || '—'}</TableCell>
                        <TableCell align="center"><Variation anterior={c.anterior} atual={c.atual} leitura={c.leitura} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            {structured.comparativo.some((c) => c.entenda) && (
              <Box sx={{ mt: 1 }}>
                {structured.comparativo.filter((c) => c.entenda).slice(0, 3).map((c, i) => (
                  <Typography key={i} variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>💡 <strong>{c.name}:</strong> {c.entenda}</Typography>
                ))}
              </Box>
            )}
          </AccordionSection>
        )}

        {/* Pontos de atenção */}
        {structured.pontosAtencao && structured.pontosAtencao.length > 0 && (
          <AccordionSection icon="🚩" title="Pontos que merecem atenção" color="#e65100" count={structured.pontosAtencao.length} defaultExpanded>
            {structured.pontosAtencao.map((p, i) => (
              <Box key={i} sx={{ mb: 1.5, '&:last-child': { mb: 0 } }}>
                <Typography sx={{ fontWeight: 700, color: '#15233b' }}>{i + 1}. {p.titulo}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.3 }}>{p.detalhe}</Typography>
              </Box>
            ))}
          </AccordionSection>
        )}

        {/* Coisas boas */}
        {structured.coisasBoas && structured.coisasBoas.length > 0 && (
          <AccordionSection icon="✅" title="Coisas boas" color="#2e7d32">
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {structured.coisasBoas.map((b, i) => <Chip key={i} sx={{ bgcolor: '#2e7d3215', color: '#2e7d32', fontWeight: 600 }} label={b} />)}
            </Stack>
          </AccordionSection>
        )}

        {/* Leitura final */}
        {structured.leituraFinal && (
          <Box sx={{ mt: 2, p: 2.5, borderRadius: 3, background: 'linear-gradient(135deg,#eef3fb,#dde9f7)', border: '1px solid #c4d7ee' }}>
            <Typography sx={{ fontWeight: 800, color: '#0b5cab', mb: 0.5, fontSize: '1.05rem' }}>📌 Leitura final</Typography>
            <Typography sx={{ lineHeight: 1.7 }}>{structured.leituraFinal}</Typography>
          </Box>
        )}

        {/* Perguntas */}
        {structured.perguntasParaOMedico && structured.perguntasParaOMedico.length > 0 && (
          <AccordionSection icon="🩺" title="Perguntas para levar ao médico" color="#7b1fa2" count={structured.perguntasParaOMedico.length}>
            {structured.perguntasParaOMedico.map((q, i) => (
              <Typography key={i} sx={{ py: 0.5, pl: 1, borderLeft: '3px solid #7b1fa233' }}>{i + 1}. {q}</Typography>
            ))}
          </AccordionSection>
        )}

        {/* 💊 Interações medicamento × exame */}
        {structured.interacoesMedicamentos && structured.interacoesMedicamentos.length > 0 && (
          <AccordionSection icon="💊" title="Interações medicamento × exame" color="#d32f2f">
            {structured.interacoesMedicamentos.map((m, i) => (
              <Box key={i} sx={{ mb: 1, p: 1.5, borderRadius: 2, bgcolor: '#fff5f5' }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>{m.medicamento} → {m.analito}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>{m.observacao}</Typography>
              </Box>
            ))}
          </AccordionSection>
        )}

        {/* 🥗 Sugestões de nutrição */}
        {structured.sugestoesNutricao && structured.sugestoesNutricao.length > 0 && (
          <AccordionSection icon="🥗" title="Sugestões de nutrição" color="#2e7d32">
            {structured.sugestoesNutricao.map((s, i) => (
              <Typography key={i} sx={{ py: 0.3 }}>• {s}</Typography>
            ))}
          </AccordionSection>
        )}

        {/* 👨‍👩‍👧 Comparação familiar */}
        {structured.comparacaoFamiliar && (
          <AccordionSection icon="👨‍👩‍👧" title="Comparação familiar" color="#7b1fa2">
            <Typography sx={{ lineHeight: 1.7 }}>{structured.comparacaoFamiliar}</Typography>
          </AccordionSection>
        )}

        {/* 🎯 Metas de saúde */}
        {structured.metasSaude && structured.metasSaude.length > 0 && (
          <AccordionSection icon="🎯" title="Metas de saúde" color="#0288d1" count={structured.metasSaude.length}>
            <Stack spacing={1}>
              {structured.metasSaude.map((m, i) => (
                <Box key={i} sx={{ p: 1.5, borderRadius: 2, bgcolor: '#f0f9ff', border: '1px solid #cfe8f5' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
                    <Typography sx={{ fontWeight: 700, color: '#01579b' }}>🎯 {m.analito}</Typography>
                    {m.prazo && <Chip size="small" label={m.prazo} sx={{ bgcolor: '#0288d115', color: '#0288d1', fontWeight: 700 }} />}
                  </Stack>
                  <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.5, wordBreak: 'break-word' }}>{m.meta}</Typography>
                </Box>
              ))}
            </Stack>
          </AccordionSection>
        )}

        <Divider sx={{ my: 2 }} />
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', textAlign: 'center' }}>
          {structured.disclaimer || 'Análise educativa. Leve ao seu médico para interpretação clínica.'}
        </Typography>
        <ShareDialog analysisId={analysis?.id} open={shareOpen} onClose={() => setShareOpen(false)} />
      </CardContent>
    </Card>
  );
};
