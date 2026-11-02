import { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Stack,
  IconButton,
  SwipeableDrawer,
  Drawer,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Menu,
  MenuItem,
  Badge,
  TextareaAutosize,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import MicIcon from '@mui/icons-material/Mic';
import StopIcon from '@mui/icons-material/Stop';
import EditIcon from '@mui/icons-material/EditNote';
import HistoryIcon from '@mui/icons-material/History';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ChatBubbleIcon from '@mui/icons-material/ChatBubbleOutline';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import { useNavigate } from 'react-router-dom';
import { useNotify } from 'react-admin';
import { API_URL, apiHeaders } from '../config';
import { confirmDialog, promptDialog } from '../components/ConfirmDialog';
import { useSelectedPatient } from '../patient-context';
import { CREDIT_COSTS } from '../components/CreditBadge';
import { DrExame } from '../components/DrExame';
import { WhatIsThis } from '../components/WhatIsThis';
import ReactMarkdown from 'react-markdown';
import { keyframes } from '@mui/material';
import { tealText } from '../theme';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { notifyInsufficientCredits } from '../utils/credits-events';
import { Badge as ReuiBadge } from '@/components/reui/badge';
import { AssistantReplyActions, MessageHeader } from '@/components/reui/message';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';
import { Frame, FrameHeader, FramePanel, FrameFooter } from '@/components/reui/frame';
import { IconTile } from '@/components/reui/icon-tile';
import {
  Sparkles,
  AlertTriangle,
  TrendingUp,
  GitCompare,
  BookOpen,
  Microscope,
  Target,
  Stethoscope,
  HeartPulse,
  Utensils,
  CalendarCheck,
  Syringe,
  Bell,
  FileText,
  ArrowLeft,
  Plus,
  History,
  Trash2,
  X,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

const TEAL = '#178f89';

// 3 pontinhos pulsantes (estilo WhatsApp) — substitui o "escrevendo…" com spinner.
const dotPulse = keyframes`
  0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-3px); }
`;
// Pulso sutil do indicador de ditado por voz (o sx desliga com prefers-reduced-motion).
const voicePulse = keyframes`0%,100%{opacity:.45;transform:scale(.9)}50%{opacity:1;transform:scale(1.25)}`;
const TypingDots = () => (
  <Box sx={{ display: 'inline-flex', gap: 0.5, alignItems: 'center', py: 0.5 }} aria-label="digitando">
    {[0, 1, 2].map((i) => (
      <Box
        key={i}
        sx={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          bgcolor: 'text.secondary',
          animation: `${dotPulse} 1.2s ${i * 0.18}s infinite ease-in-out`,
        }}
      />
    ))}
  </Box>
);

type QuickCategory = 'visao' | 'entender' | 'consulta' | 'habitos';

const QUICK_CATEGORIES: { key: QuickCategory; label: string }[] = [
  { key: 'visao', label: 'Visão geral' },
  { key: 'entender', label: 'Entender laudo' },
  { key: 'consulta', label: 'Consulta médica' },
  { key: 'habitos', label: 'Hábitos & Prevenção' },
];

const QUICK_ACTIONS: {
  category: QuickCategory;
  icon: string;
  LucideIcon: any;
  colorClass: string;
  title: string;
  subtitle: string;
  prompt: string;
}[] = [
  // Visão geral
  { category: 'visao', icon: '📊', LucideIcon: FileText, colorClass: 'text-teal-600', title: 'Resumo dos meus exames', subtitle: 'Panorama completo e destaques', prompt: 'Faça um resumo geral dos meus exames mais recentes e destaque o que precisa de atenção.' },
  { category: 'visao', icon: '⚠️', LucideIcon: AlertTriangle, colorClass: 'text-amber-600', title: 'O que está alterado', subtitle: 'Marcadores fora da referência', prompt: 'Liste os valores que estão fora da faixa de referência nos meus exames e explique o que cada um significa.' },
  { category: 'visao', icon: '📈', LucideIcon: TrendingUp, colorClass: 'text-emerald-600', title: 'Minha evolução', subtitle: 'Tendências de melhora ou atenção', prompt: 'Mostre como meus principais exames evoluíram ao longo do tempo e diga se há tendência de melhora ou piora.' },
  { category: 'visao', icon: '🔄', LucideIcon: GitCompare, colorClass: 'text-sky-600', title: 'Comparar exames', subtitle: 'Diferenças entre os 2 últimos', prompt: 'Compare meus dois exames mais recentes do mesmo tipo e destaque o que mudou.' },
  // Entender
  { category: 'entender', icon: '📖', LucideIcon: BookOpen, colorClass: 'text-teal-600', title: 'Explicar termo médico', subtitle: 'Tradução simples e direta', prompt: 'Quero entender um termo médico do meu exame. Pode explicar de forma simples?' },
  { category: 'entender', icon: '🔬', LucideIcon: Microscope, colorClass: 'text-purple-600', title: 'O que significa meu resultado', subtitle: 'Função do marcador no corpo', prompt: 'Pegue um dos meus resultados, explique o que ele mede e diga se está dentro do esperado.' },
  { category: 'entender', icon: '🎯', LucideIcon: Target, colorClass: 'text-emerald-600', title: 'Minhas metas e referências', subtitle: 'Onde estou na faixa ideal', prompt: 'Quais são as faixas de referência saudáveis dos meus principais exames e onde estou em relação a elas?' },
  { category: 'entender', icon: '⚠️', LucideIcon: AlertTriangle, colorClass: 'text-rose-600', title: 'Prioridade clínica', subtitle: 'O que olhar primeiro sem alarme', prompt: 'Há algum resultado nos meus exames que precise de atenção médica? Seja honesto: diga o que merece prioridade e o que pode esperar a próxima consulta.' },
  // Consulta médica
  { category: 'consulta', icon: '🩺', LucideIcon: Stethoscope, colorClass: 'text-teal-600', title: 'Perguntas para o médico', subtitle: 'Roteiro para sua próxima consulta', prompt: 'Quais perguntas devo levar ao médico na próxima consulta com base nos meus resultados?' },
  { category: 'consulta', icon: '🧾', LucideIcon: FileText, colorClass: 'text-amber-700', title: 'Resumo para o médico', subtitle: 'Briefing estruturado para levar', prompt: 'Monte um resumo curto e organizado dos meus exames para eu levar na consulta médica.' },
  { category: 'consulta', icon: '📅', LucideIcon: CalendarCheck, colorClass: 'text-sky-600', title: 'Quando repetir os exames', subtitle: 'Sugestão de janela de retorno', prompt: 'Com base nos meus exames, quais devo repetir e em quanto tempo?' },
  { category: 'consulta', icon: '🫀', LucideIcon: HeartPulse, colorClass: 'text-rose-600', title: 'Meu perfil cardiometabólico', subtitle: 'Colesterol, glicemia e pressão', prompt: 'Avalie meu risco cardiovascular (colesterol, pressão, glicemia) com base nos meus exames e diga como reduzir.' },
  // Hábitos & Prevenção
  { category: 'habitos', icon: '💡', LucideIcon: Sparkles, colorClass: 'text-teal-600', title: 'Como melhorar meus índices', subtitle: 'Sono, treino e rotina prática', prompt: 'Quais ações práticas (hábitos, exercício, sono) posso tomar para melhorar meus resultados?' },
  { category: 'habitos', icon: '🥗', LucideIcon: Utensils, colorClass: 'text-emerald-600', title: 'Alimentação recomendada', subtitle: 'Ajustes nutricionais educativos', prompt: 'Com base nos meus exames, que mudanças na alimentação você recomenda?' },
  { category: 'habitos', icon: '💉', LucideIcon: Syringe, colorClass: 'text-purple-600', title: 'Vacinas em dia', subtitle: 'Checagem do calendário vacinal', prompt: 'Verifique meu histórico de vacinas e diga quais estão em atraso ou faltando conforme o calendário.' },
  { category: 'habitos', icon: '🗓️', LucideIcon: Bell, colorClass: 'text-amber-600', title: 'Lembretes pendentes', subtitle: 'Seus próximos compromissos', prompt: 'Quais lembretes e compromissos de saúde eu tenho pendentes agora?' },
];

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  ts?: string;
  sources?: { label: string; topic: string }[];
}
const fmtTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
interface Conv {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Msg[];
}

const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const isoNow = () => new Date().toISOString();
const storageKey = (pid: string) => `dr-chat-${pid}`;
const loadConvs = (pid: string): Conv[] => {
  try {
    return JSON.parse(localStorage.getItem(storageKey(pid)) || '[]');
  } catch {
    return [];
  }
};
const saveConvs = (pid: string, convs: Conv[]) => {
  try {
    localStorage.setItem(storageKey(pid), JSON.stringify(convs));
  } catch {}
};

const bucket = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (sameDay) return 'Hoje';
  if (days < 7) return 'Últimos 7 dias';
  if (days < 30) return 'Últimos 30 dias';
  return 'Mais antigas';
};
const BUCKETS = ['Hoje', 'Últimos 7 dias', 'Últimos 30 dias', 'Mais antigas'];

export const ChatPage = () => {
  useReuiThemeSync();
  const [pid] = useSelectedPatient();
  const notify = useNotify();
  const navigate = useNavigate();
  const [convs, setConvs] = useState<Conv[]>([]);
  const [curId, setCurId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Abort da resposta em andamento (auditoria: provider travado = dots infinitos + input morto).
  const abortRef = useRef<AbortController | null>(null);
  // iOS Safari: teclado NÃO redimensiona o layout (só o visual viewport)
  const kbInset = useKeyboardInset();

  // FEATURE F — ditado por voz pt-BR
  const voice = useVoiceInput(setInput);

  const [patientName, setPatientName] = useState('');

  useEffect(() => {
    document.body.classList.add('on-chat');
    return () => {
      document.body.classList.remove('on-chat');
    };
  }, []);

  useEffect(() => {
    if (kbInset > 0 && scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [kbInset]);

  useEffect(() => {
    if (!pid) {
      setPatientName('');
      return;
    }
    setConvs(loadConvs(pid));
    setCurId(null);
    fetch(`${API_URL}/patients`, { headers: apiHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((ps: any[]) => setPatientName(ps.find((x) => x.id === pid)?.fullName ?? ''))
      .catch(() => setPatientName(''));
    fetch(`${API_URL}/chat?patientId=${pid}`, { headers: apiHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then(
        (
          turns: {
            userMessage?: string;
            contentMd?: string;
            structured?: { sources?: { label: string; topic: string }[] } | null;
          }[]
        ) => {
          if (!Array.isArray(turns) || !turns.length) return;
          const msgs: Msg[] = turns.flatMap((t) => [
            ...(t.userMessage ? [{ role: 'user' as const, text: t.userMessage }] : []),
            ...(t.contentMd
              ? [
                  {
                    role: 'assistant' as const,
                    text: t.contentMd,
                    sources: t.structured?.sources ?? [],
                  },
                ]
              : []),
          ]);
          if (!msgs.length) return;
          setConvs((prev) => {
            const knownFirst = new Set(prev.map((c) => (c.messages ?? [])[0]?.text));
            if (knownFirst.has(msgs[0].text)) return prev;
            return [
              ...prev,
              {
                id: `server-${pid}`,
                title: 'Conversa anterior (outros dispositivos)',
                createdAt: isoNow(),
                updatedAt: isoNow(),
                messages: msgs,
              },
            ];
          });
        }
      )
      .catch(() => {});
  }, [pid]);

  const firstName = patientName.trim().split(/\s+/)[0];
  const cur = convs.find((c) => c.id === curId) ?? null;
  const messages = cur?.messages ?? [];

  const nearBottomRef = useRef(true);
  const onScrollMessages = () => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  useEffect(() => {
    if (!nearBottomRef.current) return;
    const id = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' });
    });
    return () => cancelAnimationFrame(id);
  }, [messages, busy]);

  const startNew = () => {
    setCurId(null);
    setInput('');
    setHistOpen(false);
  };

  const send = async (overrideText?: string) => {
    const message = (overrideText ?? input).trim();
    if (!message || busy || !pid) return;
    setInput('');
    setBusy(true);
    nearBottomRef.current = true;

    let cid = curId;
    let work: Conv[] = convs;
    if (!cid || !work.some((c) => c.id === cid)) {
      cid = newId();
      work = [
        {
          id: cid,
          title: message.slice(0, 48),
          createdAt: isoNow(),
          updatedAt: isoNow(),
          messages: [],
        },
        ...work.filter((c) => c.id !== cid),
      ];
    }
    const now = isoNow();
    const baseMsgs: Msg[] = [
      ...work.find((c) => c.id === cid)!.messages,
      { role: 'user', text: message, ts: now },
      { role: 'assistant', text: '', ts: now },
    ];
    work = work.map((c) =>
      c.id === cid
        ? {
            ...c,
            updatedAt: isoNow(),
            title: c.messages.length === 0 ? message.slice(0, 48) : c.title,
            messages: baseMsgs,
          }
        : c
    );
    setConvs(work);
    setCurId(cid);
    const assistantIdx = baseMsgs.length - 1;

    const rollback = () => {
      work = work
        .map((c) => (c.id === cid ? { ...c, messages: c.messages.slice(0, -2) } : c))
        .filter((c) => c.messages.length > 0 || c.id !== cid);
      setConvs(work);
      if (pid) saveConvs(pid, work);
      setCurId((v) => (v === cid ? null : v));
    };
    const persist = () => {
      if (pid) saveConvs(pid, work);
    };

    try {
      const ac = new AbortController();
      abortRef.current = ac;
      let gotDelta = false;
      const watchdog = setTimeout(() => {
        if (!gotDelta) ac.abort();
      }, 45_000);
      const r = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: apiHeaders(true),
        body: JSON.stringify({ message, patientId: pid }),
        signal: ac.signal,
      });
      if (r.status === 402) {
        const e = await r.json().catch(() => ({}));
        notifyInsufficientCredits({ message: e.message, cost: CREDIT_COSTS.chat });
        rollback();
        return;
      }
      if (!r.ok || !r.body) throw new Error('falha no chat');
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const p of parts) {
          const line = p.startsWith('data: ') ? p.slice(6) : p;
          try {
            const evt = JSON.parse(line);
            if (evt.type === 'error') {
              clearTimeout(watchdog);
              rollback();
              notify(evt.message || 'A IA não respondeu agora. Tente novamente.', {
                type: 'warning',
              });
              setBusy(false);
              window.dispatchEvent(new Event('creditsChanged'));
              return;
            }
            if (evt.delta) {
              gotDelta = true;
              work = work.map((c) =>
                c.id === cid
                  ? {
                      ...c,
                      messages: c.messages.map((m, i) =>
                        i === assistantIdx ? { ...m, text: (m.text ?? '') + evt.delta } : m
                      ),
                    }
                  : c
              );
              setConvs(work);
            }
            if (evt.type === 'sources' && Array.isArray(evt.sources)) {
              work = work.map((c) =>
                c.id === cid
                  ? {
                      ...c,
                      messages: c.messages.map((m, i) =>
                        i === assistantIdx ? { ...m, sources: evt.sources } : m
                      ),
                    }
                  : c
              );
              setConvs(work);
            }
          } catch {
            /* pacote parcial */
          }
        }
      }
      clearTimeout(watchdog);
      persist();
    } catch {
      rollback();
      notify('A IA não respondeu agora. Seu crédito foi devolvido — tente de novo.', {
        type: 'error',
      });
    } finally {
      abortRef.current = null;
      setBusy(false);
      window.dispatchEvent(new Event('creditsChanged'));
    }
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  const renameConv = (id: string, title: string) => {
    const next = convs.map((c) => (c.id === id ? { ...c, title } : c));
    setConvs(next);
    if (pid) saveConvs(pid, next);
  };
  const deleteConv = (id: string) => {
    const next = convs.filter((c) => c.id !== id);
    setConvs(next);
    if (pid) saveConvs(pid, next);
    if (curId === id) setCurId(next[0]?.id ?? null);
  };
  const clearAllConvs = async () => {
    if (
      await confirmDialog({
        title: 'Limpar todo o histórico',
        message: 'Tem certeza que deseja apagar todas as conversas salvas deste perfil? Esta ação não pode ser desfeita.',
        confirmLabel: 'Limpar histórico',
      })
    ) {
      setConvs([]);
      setCurId(null);
      if (pid) saveConvs(pid, []);
      setHistOpen(false);
      notify('Histórico de conversas limpo com sucesso.', { type: 'info' });
    }
  };
  const [starterCat, setStarterCat] = useState<QuickCategory>('visao');

  return (
    <Box
      style={
        kbInset
          ? { height: `calc(100dvh - 116px - env(safe-area-inset-bottom) - ${kbInset}px)` }
          : undefined
      }
      sx={{
        width: '100%',
        maxWidth: 820,
        mx: 'auto',
        display: 'flex',
        flexDirection: 'column',
        height: { xs: 'calc(100dvh - 116px - env(safe-area-inset-bottom))', sm: 'calc(100dvh - 84px)' },
        mb: { xs: 'calc(-1 * (var(--me-bottom-nav-h, 76px) + 14px))', sm: -28 },
        p: { xs: 1, md: 2 },
        pb: { xs: 'calc(var(--me-bottom-nav-h, 76px) + 6px)', md: 2 },
      }}
    >
      {/* BARRA EXECUTIVA COPILOT (ReUI Frame) — sem repetir o logo do robô já presente no AppBar e na BottomNav */}
      <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl border border-border/80 bg-card/90 px-3 py-2 shadow-xs backdrop-blur-md">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Voltar ao início"
            title="Voltar ao início"
            className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background text-foreground transition-colors hover:bg-muted cursor-pointer"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-heading text-xs sm:text-sm font-extrabold text-foreground truncate">
                  Assistente Clínico IA
                </span>
                <ReuiBadge variant="primary-light" size="xs" className="hidden sm:inline-flex">
                  Copilot
                </ReuiBadge>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                {firstName ? `Contexto ativo: exames de ${firstName}` : 'Contexto ativo: seus exames laboratoriais'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={startNew}
              className="inline-flex items-center gap-1 rounded-xl border border-teal-500/30 bg-teal-500/10 px-2.5 py-1.5 text-xs font-bold text-teal-700 dark:text-teal-300 transition-colors hover:bg-teal-500/15 cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>Nova</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setHistOpen(true)}
            aria-label={`Histórico de conversas (${convs.length})`}
            title="Histórico de conversas"
            className="relative inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-background px-2.5 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-muted cursor-pointer"
          >
            <History className="size-3.5 text-teal-600 dark:text-teal-400" />
            <span className="hidden xs:inline">Histórico</span>
            {convs.length > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-600 px-1 text-[10px] font-extrabold text-white">
                {convs.length > 9 ? '9+' : convs.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* mensagens — role=log/aria-live: leitor de tela anuncia as novas mensagens da IA */}
      <Box
        ref={scrollRef}
        onScroll={onScrollMessages}
        role="log"
        aria-live="polite"
        aria-label="Mensagens da conversa"
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          p: { xs: 0.5, sm: 1 },
          background: 'transparent',
          borderRadius: '12px',
        }}
      >
        {messages.length === 0 && (
          <div className="flex flex-col justify-center py-2 sm:py-4 space-y-3">
            {/* Hero Copilot sem repetir o ícone do robô (usa selo clínico + tipografia fintech/saúde) */}
            <Frame variant="default">
              <FramePanel className="p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-border/60">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 px-2.5 py-0.5 text-[11px] font-bold text-teal-700 dark:text-teal-300">
                      <Sparkles className="size-3" />
                      <span>Inteligência Clínica Personalizada</span>
                    </div>
                    <h1 className="font-heading text-lg sm:text-xl font-extrabold tracking-tight text-foreground">
                      {firstName ? `O que vamos analisar hoje, ${firstName}?` : 'O que vamos analisar hoje?'}
                    </h1>
                    <p className="text-xs text-muted-foreground">
                      Escolha uma análise guiada abaixo ou digite sua dúvida sobre qualquer marcador, sintoma ou histórico.
                    </p>
                  </div>
                </div>

                {/* Abas de categoria estilo ReUI Bento */}
                <div className="flex items-center gap-1.5 overflow-x-auto pt-3 pb-2 no-scrollbar">
                  {QUICK_CATEGORIES.map((cat) => {
                    const active = starterCat === cat.key;
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => setStarterCat(cat.key)}
                        className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                          active
                            ? 'bg-teal-600 text-white shadow-xs'
                            : 'border border-border/70 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>

                {/* Grid Bento 2x2 de prompts clínicos com IconTile */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {QUICK_ACTIONS.filter((a) => a.category === starterCat).map((a) => {
                    const IconComp = a.LucideIcon;
                    return (
                      <button
                        key={a.title}
                        type="button"
                        onClick={() => send(a.prompt)}
                        className="group flex items-center gap-3 rounded-xl border border-border/80 bg-background p-3 text-left transition-all hover:border-teal-500/50 hover:bg-teal-500/[0.04] hover:shadow-xs cursor-pointer"
                      >
                        <IconTile size="default" variant="soft" className={a.colorClass}>
                          <IconComp className="size-4" />
                        </IconTile>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-bold text-foreground group-hover:text-teal-700 dark:group-hover:text-teal-300 truncate">
                            {a.title}
                          </div>
                          <div className="text-[11.5px] text-muted-foreground truncate">
                            {a.subtitle}
                          </div>
                        </div>
                        <ChevronRight className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-teal-600 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </FramePanel>
              <FrameFooter className="px-4 py-2 flex items-center justify-between flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="size-3.5 text-teal-600" />
                  Respostas baseadas nos seus laudos · Caráter educativo, não substitui consulta médica
                </span>
                <span className="font-semibold text-foreground/80">
                  {CREDIT_COSTS.chat} crédito{CREDIT_COSTS.chat !== 1 ? 's' : ''} / pergunta
                </span>
              </FrameFooter>
            </Frame>
          </div>
        )}

        <Stack spacing={2} sx={{ py: 0.5 }}>
          {messages.map((m, i) => {
            const isUser = m.role === 'user';
            const isLastAssistant = m.role === 'assistant' && i === messages.length - 1 && busy && !m.text;
            const isStreamingThis = m.role === 'assistant' && i === messages.length - 1 && busy && !!m.text;
            const prevSameRole = i > 0 && messages[i - 1]?.role === m.role;
            return (
              <Box
                key={i}
                sx={{
                  display: 'flex',
                  gap: 1,
                  alignItems: 'flex-start',
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  className={
                    'flex min-w-0 flex-col gap-1 ' +
                    (isUser
                      ? 'max-w-[86%] items-end sm:max-w-[76%]'
                      : 'w-full max-w-[96%] items-start sm:max-w-[88%]')
                  }
                >
                  {!prevSameRole && (
                    <MessageHeader className={isUser ? 'justify-end' : undefined}>
                      {!isUser && (
                        <span className="inline-flex size-5 items-center justify-center rounded-md bg-teal-500/15 text-teal-600 dark:text-teal-400">
                          <Sparkles className="size-3" />
                        </span>
                      )}
                      <span className="text-foreground font-bold text-xs">
                        {isUser ? 'Você' : 'Dr. Exame IA'}
                      </span>
                      {!isUser && (
                        <ReuiBadge variant="primary-light" size="xs">
                          Análise Educativa
                        </ReuiBadge>
                      )}
                      {m.ts && (
                        <>
                          <span
                            aria-hidden="true"
                            className="bg-muted-foreground/40 size-1 shrink-0 rounded-full"
                          />
                          <span className="tabular-nums text-[11px]">{fmtTime(m.ts)}</span>
                        </>
                      )}
                    </MessageHeader>
                  )}

                  {isUser ? (
                    <Paper
                      elevation={0}
                      sx={{
                        px: 2,
                        py: 1.25,
                        borderRadius: '18px 18px 4px 18px',
                        background: 'linear-gradient(135deg, #178f89 0%, #0f766e 100%)',
                        color: '#fff',
                        wordBreak: 'break-word',
                        boxShadow: '0 2px 10px rgba(23,143,137,.20)',
                        fontSize: 14.5,
                        lineHeight: 1.5,
                      }}
                    >
                      <Box sx={{ whiteSpace: 'pre-wrap' }}>{m.text}</Box>
                    </Paper>
                  ) : (
                    <Frame variant="default" className="w-full">
                      <FramePanel className="p-3.5 sm:p-4">
                        <Box
                          sx={{
                            wordBreak: 'break-word',
                            color: 'text.primary',
                            fontSize: 14.5,
                            lineHeight: 1.65,
                            '& p': { margin: '0.35em 0', fontSize: 14.5, lineHeight: 1.65 },
                            '& p:first-of-type': { marginTop: 0 },
                            '& p:last-of-type': { marginBottom: 0 },
                            '& h1, & h2, & h3, & h4': {
                              fontSize: '0.92rem',
                              fontWeight: 800,
                              fontFamily: 'Poppins, sans-serif',
                              margin: '0.75em 0 0.3em',
                              color: TEAL,
                              letterSpacing: '-0.01em',
                            },
                            '& ul, & ol': {
                              margin: '0.4em 0',
                              paddingLeft: '1.25em',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.35em',
                            },
                            '& li': {
                              padding: '0.35em 0.6em',
                              borderRadius: '8px',
                              bgcolor: (t) =>
                                t.palette.mode === 'dark'
                                  ? 'rgba(255,255,255,0.03)'
                                  : 'rgba(15,118,110,0.035)',
                              borderLeft: `3px solid ${TEAL}`,
                              listStyleType: 'none',
                              marginLeft: '-1.1em',
                            },
                            '& strong': {
                              fontWeight: 800,
                              color: 'text.primary',
                            },
                            '& code': {
                              bgcolor: 'rgba(32,178,170,.12)',
                              color: TEAL,
                              px: 0.6,
                              py: 0.15,
                              borderRadius: '6px',
                              fontSize: '0.88em',
                              fontWeight: 700,
                              fontFamily: 'monospace',
                            },
                          }}
                        >
                          {m.text ? (
                            <ReactMarkdown>{m.text}</ReactMarkdown>
                          ) : isLastAssistant ? (
                            <TypingDots />
                          ) : null}
                        </Box>

                        {!!m.sources?.length && (
                          <Box
                            sx={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 0.5,
                              alignItems: 'center',
                              mt: 1.5,
                              pt: 1,
                              borderTop: '1px dashed',
                              borderColor: 'divider',
                            }}
                          >
                            <Typography
                              component="span"
                              sx={{ fontSize: 11.5, fontWeight: 700, color: (t) => tealText(t.palette.mode) }}
                            >
                              📚 Diretrizes de referência:
                            </Typography>
                            <WhatIsThis topic="diretrizes" />
                            {m.sources.map((s, si) => (
                              <ReuiBadge key={`${s.label}-${si}`} variant="primary-light" size="xs">
                                {s.label}
                              </ReuiBadge>
                            ))}
                          </Box>
                        )}
                      </FramePanel>
                      {!!m.text && !isLastAssistant && !isStreamingThis && (
                        <FrameFooter className="px-3 py-1.5 flex items-center justify-between flex-wrap gap-2">
                          <AssistantReplyActions
                            content={m.text}
                            onAskDoctor={(txt) =>
                              navigate(`/perguntas?ask=${encodeURIComponent(txt.slice(0, 600))}`)
                            }
                          />
                        </FrameFooter>
                      )}
                    </Frame>
                  )}
                </div>
              </Box>
            );
          })}
        </Stack>
      </Box>

      {/* INPUT com botão "+" (bottom sheet de ações) e DITADO POR VOZ */}
      <Box
        component="form"
        onSubmit={(e: any) => {
          e.preventDefault();
          voice.stop();
          send();
        }}
        sx={{
          display: 'flex',
          gap: 0.75,
          alignItems: 'flex-end',
          mt: 1,
          p: 0.5,
          pl: 1,
          borderRadius: '999px',
          border: '1px solid',
          borderColor: voice.isRecording ? 'error.main' : 'divider',
          bgcolor: 'background.paper',
          boxShadow: '0 2px 12px rgba(32,178,170,.08)',
        }}
      >
        <IconButton
          onClick={() => setSheetOpen(true)}
          aria-label="Ações rápidas"
          title="Ações rápidas"
          sx={{ color: TEAL, p: { xs: 1.25, sm: 1 }, '&:hover': { bgcolor: 'rgba(32,178,170,.08)' } }}
        >
          <AddIcon />
        </IconButton>
        {voice.isRecording && (
          <Box
            aria-hidden
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: 'error.main',
              flexShrink: 0,
              animation: `${voicePulse} 1.2s ease-in-out infinite`,
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }}
          />
        )}
        <TextareaAutosize
          value={input}
          disabled={busy || voice.isRecording}
          aria-label="Pergunta sobre seus exames"
          placeholder={voice.isRecording ? 'Ouvindo você…' : 'Pergunte sobre seus exames…'}
          minRows={1}
          maxRows={5}
          onChange={(e: any) => setInput(e.target.value)}
          onKeyDown={(e: any) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              voice.stop();
              send();
            }
          }}
          style={{
            flex: 1,
            minWidth: 0,
            width: '100%',
            resize: 'none',
            padding: '10px 4px',
            fontSize: 16,
            lineHeight: 1.5,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: 'inherit',
            color: 'inherit',
          }}
        />
        {voice.isVoiceAvailable && (
          <IconButton
            onClick={() => voice.toggle(input)}
            aria-label={voice.isRecording ? 'Parar ditado' : 'Ditar pergunta'}
            title={voice.isRecording ? 'Parar ditado' : 'Ditar pergunta'}
            sx={{
              p: { xs: 1.25, sm: 1 },
              color: voice.isRecording ? 'error.main' : TEAL,
              ...(voice.isRecording
                ? { bgcolor: 'rgba(211,47,47,.10)', '&:hover': { bgcolor: 'rgba(211,47,47,.18)' } }
                : { '&:hover': { bgcolor: 'rgba(32,178,170,.08)' } }),
            }}
          >
            {voice.isRecording ? <StopIcon /> : <MicIcon />}
          </IconButton>
        )}
        <Button
          type={busy ? 'button' : 'submit'}
          variant="contained"
          disabled={!busy && !input.trim()}
          onClick={busy ? stop : undefined}
          aria-label={busy ? 'Parar resposta' : 'Enviar'}
          sx={{
            minWidth: 0,
            borderRadius: '999px',
            px: 1.5,
            py: 1,
            bgcolor: TEAL,
            '&:hover': { bgcolor: '#0f766e' },
          }}
        >
          {busy ? <StopCircleIcon titleAccess="Parar resposta" /> : <SendIcon />}
        </Button>
      </Box>

      {/* BOTTOM SHEET — ações rápidas (swipe-down p/ fechar) */}
      <SwipeableDrawer
        anchor="bottom"
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onOpen={() => setSheetOpen(true)}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            p: 2,
            pb: 3,
            maxWidth: 520,
            mx: 'auto',
          },
        }}
      >
        <Box sx={{ width: 36, height: 4, bgcolor: 'action.selected', borderRadius: '999px', mx: 'auto', mb: 2 }} />
        <Typography sx={{ fontWeight: 800, mb: 0.5, color: 'text.primary', fontFamily: 'Poppins, sans-serif' }}>
          Como posso te ajudar? 🤖
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Toque numa opção pra começar.
        </Typography>
        <Box sx={{ maxHeight: '68vh', overflowY: 'auto' }}>
          <Stack spacing={0.75}>
            {QUICK_ACTIONS.map((a) => (
              <Paper
                key={a.title}
                elevation={0}
                component="button"
                type="button"
                onClick={() => {
                  setSheetOpen(false);
                  send(a.prompt);
                }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  p: 1.1,
                  px: 1.5,
                  borderRadius: '12px',
                  border: '1px solid',
                  borderColor: 'divider',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  color: 'inherit',
                  width: '100%',
                  textAlign: 'left',
                  '&:focus-visible': { boxShadow: `0 0 0 3px ${TEAL}55` },
                  '&:hover': { bgcolor: 'action.hover', borderColor: TEAL },
                }}
              >
                <Box
                  sx={{
                    fontSize: 20,
                    width: 34,
                    height: 34,
                    borderRadius: '8px',
                    bgcolor: 'rgba(32,178,170,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {a.icon}
                </Box>
                <Typography sx={{ flex: 1, fontWeight: 700, color: 'text.primary', fontSize: 15 }}>
                  {a.title}
                </Typography>
                <Typography sx={{ color: TEAL, fontWeight: 800 }}>›</Typography>
              </Paper>
            ))}
          </Stack>
        </Box>
      </SwipeableDrawer>

      {/* HISTÓRICO — gaveta ReUI com botão Voltar/Fechar claro, Nova conversa e Limpar histórico */}
      <Drawer
        anchor="right"
        open={histOpen}
        onClose={() => setHistOpen(false)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 380 }, display: 'flex', flexDirection: 'column', bgcolor: 'background.default' } }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border/80 bg-card px-4 py-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setHistOpen(false)}
              aria-label="Voltar para o chat"
              title="Voltar para o chat"
              className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-background text-foreground transition-colors hover:bg-muted cursor-pointer"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div className="min-w-0">
              <div className="font-heading text-sm font-extrabold text-foreground">
                Histórico de Conversas
              </div>
              <div className="text-[11px] text-muted-foreground">
                {convs.length === 0 ? 'Nenhuma conversa salva' : `${convs.length} ${convs.length === 1 ? 'conversa salva' : 'conversas salvas'}`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={startNew}
              className="inline-flex items-center gap-1 rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-teal-700 cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>Nova</span>
            </button>
            <button
              type="button"
              onClick={() => setHistOpen(false)}
              aria-label="Fechar histórico"
              className="flex size-8 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer sm:hidden"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <Box sx={{ overflowY: 'auto', flex: 1, p: 1.5 }}>
          {convs.length === 0 && (
            <div className="my-6">
              <Frame variant="ghost">
                <FramePanel className="p-6 text-center space-y-2">
                  <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600">
                    <History className="size-5" />
                  </div>
                  <div className="font-heading text-sm font-bold text-foreground">
                    Nenhuma conversa ainda
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Suas análises e dúvidas com o Assistente Clínico ficarão salvas aqui para consulta rápida.
                  </p>
                </FramePanel>
              </Frame>
            </div>
          )}
          {BUCKETS.map((bk) => {
            const items = convs.filter((c) => bucket(c.updatedAt) === bk);
            if (!items.length) return null;
            return (
              <Box key={bk} sx={{ mb: 1.5 }}>
                <Typography
                  sx={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    px: 1,
                    pb: 0.75,
                  }}
                >
                  {bk}
                </Typography>
                <Stack spacing={0.75}>
                  {items.map((c) => (
                    <HistoryRow
                      key={c.id}
                      conv={c}
                      active={c.id === curId}
                      onOpen={() => {
                        setCurId(c.id);
                        setHistOpen(false);
                      }}
                      onRename={(t) => renameConv(c.id, t)}
                      onDelete={() => deleteConv(c.id)}
                    />
                  ))}
                </Stack>
              </Box>
            );
          })}
        </Box>

        {convs.length > 0 && (
          <div className="border-t border-border/80 bg-card p-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setHistOpen(false)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted cursor-pointer"
            >
              <ArrowLeft className="size-3.5" />
              <span>Voltar ao chat</span>
            </button>
            <button
              type="button"
              onClick={clearAllConvs}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-500/15 cursor-pointer"
            >
              <Trash2 className="size-3.5" />
              <span>Limpar histórico</span>
            </button>
          </div>
        )}
      </Drawer>
    </Box>
  );
};

const HistoryRow = ({
  conv,
  active,
  onOpen,
  onRename,
  onDelete,
}: {
  conv: Conv;
  active: boolean;
  onOpen: () => void;
  onRename: (t: string) => void;
  onDelete: () => void;
}) => {
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  return (
    <ListItemButton
      selected={active}
      onClick={onOpen}
      sx={{
        py: 1.1,
        px: 1.5,
        borderRadius: '12px',
        border: '1px solid',
        borderColor: active ? 'rgba(32,178,170,.45)' : 'divider',
        bgcolor: active ? 'rgba(32,178,170,.08)' : 'background.paper',
        '&.Mui-selected': { bgcolor: 'rgba(32,178,170,.10)' },
        '&.Mui-selected:hover': { bgcolor: 'rgba(32,178,170,.14)' },
      }}
    >
      <ListItemIcon sx={{ minWidth: 34 }}>
        <ChatBubbleIcon sx={{ color: active ? TEAL : 'text.secondary', fontSize: 18 }} />
      </ListItemIcon>
      <ListItemText
        primary={conv.title || 'Sem título'}
        primaryTypographyProps={{
          fontSize: 14,
          fontWeight: active ? 700 : 500,
          color: 'text.primary',
          noWrap: true,
        }}
        secondary={new Date(conv.updatedAt).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })}
        secondaryTypographyProps={{ fontSize: 12 }}
      />
      <IconButton
        size="small"
        edge="end"
        onClick={(e) => {
          e.stopPropagation();
          setMenu(e.currentTarget);
        }}
      >
        <MoreVertIcon fontSize="small" sx={{ color: 'text.secondary' }} />
      </IconButton>
      <Menu
        anchorEl={menu}
        open={!!menu}
        onClose={() => setMenu(null)}
        slotProps={{ paper: { sx: { borderRadius: '12px' } } }}
      >
        <MenuItem
          onClick={async () => {
            setMenu(null);
            const t = await promptDialog({
              title: 'Renomear conversa',
              label: 'Título',
              defaultValue: conv.title,
              confirmLabel: 'Salvar',
            });
            if (t != null) onRename(t.trim() || conv.title);
          }}
        >
          ✏️ Renomear
        </MenuItem>
        <MenuItem
          onClick={async () => {
            setMenu(null);
            if (
              await confirmDialog({
                title: 'Excluir conversa',
                message: 'Excluir esta conversa?',
                confirmLabel: 'Excluir',
              })
            )
              onDelete();
          }}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Excluir
        </MenuItem>
      </Menu>
    </ListItemButton>
  );
};
