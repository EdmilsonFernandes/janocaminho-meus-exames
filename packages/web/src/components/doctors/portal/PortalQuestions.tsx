import { useState } from 'react';
import {
  Avatar,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import MedicalServicesOutlinedIcon from '@mui/icons-material/MedicalServicesOutlined';
import { photoUrlFor } from '../../../config';
import { a11yClick } from './shared';
import { useReuiThemeSync } from '@/components/reui/useReuiThemeSync';
import {
  Frame,
  FrameHeader,
  FrameTitle,
  FrameDescription,
  FramePanel,
} from '@/components/reui/frame';
import { Badge as ReuiBadge } from '@/components/reui/badge';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import {
  Message,
  MessageHeader,
  Bubble,
  IconTile,
} from '@/components/reui/patterns';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  ReuiTextarea,
} from '@/components/reui/form-controls';
import {
  MessageQuestionIcon,
  FirstAidKitIcon,
} from '@/components/reui/icons';

/** Respostas prontas pro médico (chips de 1 clique) — frases de triagem clínica neutras. */
export const QUICK_REPLIES = [
  'Recebido! Vou analisar seus exames com atenção e já te respondo.',
  'Vamos conversar sobre isso na sua próxima consulta.',
  'Por favor, marque uma consulta para avaliarmos juntos.',
  'Preciso do exame completo/atual para concluir a análise.',
  'Seus resultados estão dentro da normalidade — mantenha o acompanhamento de rotina.',
  'Está tudo estável, sem alterações relevantes. Continue assim!',
];

/**
 * View PERGUNTAS (Inbox global do médico) — ReUI Ultimate.
 * Organização clínica com KPIs de triagem em Frame, filtros por status (Pendentes / Respondidas),
 * InputGroup de busca em tempo real, Message + Bubble e ReuiTextarea.
 */
export const PortalQuestions = ({
  allQ,
  allQLoading,
  patients,
  qText,
  setQText,
  qSending,
  replyOpen,
  setReplyOpen,
  onAnswer,
  onRefresh,
  onGoToPatient,
}: {
  allQ: any[];
  allQLoading: boolean;
  patients: any[];
  qText: Record<string, string>;
  setQText: (fn: (t: Record<string, string>) => Record<string, string>) => void;
  qSending: string | null;
  replyOpen: string | null;
  setReplyOpen: (id: string | null) => void;
  onAnswer: (id: string) => void;
  onRefresh: () => void;
  onGoToPatient: (patientId: string) => void;
}) => {
  const themeClass = useReuiThemeSync();
  const [tabFilter, setTabFilter] = useState<'pending' | 'answered' | 'all'>('pending');
  const [search, setSearch] = useState('');

  const openQ = allQ.filter((q: any) => q.status !== 'answered');
  const answeredQ = allQ.filter((q: any) => q.status === 'answered');

  const relDate = (d?: string) => {
    if (!d) return '';
    const days = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 86400000));
    return days === 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`;
  };

  // Filtragem combinada por aba e texto de busca
  const filteredQ = allQ.filter((q: any) => {
    const isAnswered = q.status === 'answered';
    if (tabFilter === 'pending' && isAnswered) return false;
    if (tabFilter === 'answered' && !isAnswered) return false;

    if (search.trim()) {
      const term = search.toLowerCase();
      const patientName = String(q.patient?.fullName ?? '').toLowerCase();
      const subject = String(q.subject ?? '').toLowerCase();
      const msgText = (q.messages ?? [])
        .map((m: any) => String(m.body ?? '').toLowerCase())
        .join(' ');
      if (
        !patientName.includes(term) &&
        !subject.includes(term) &&
        !msgText.includes(term)
      ) {
        return false;
      }
    }
    return true;
  });

  // Render do Card individual de cada dúvida (ReUI FramePanel + Message + Bubble)
  const renderQuestionCard = (q: any) => {
    const answered = q.status === 'answered';
    const patientMsg = (q.messages ?? []).find(
      (m: any) => m.authorRole === 'patient'
    )?.body;
    const questionBody =
      patientMsg || q.subject || 'Dúvida clínica enviada pelo paciente';
    const lastDoctor = (q.messages ?? [])
      .filter((m: any) => m.authorRole === 'doctor')
      .slice(-1)[0];
    const qp = patients.find((pp: any) => pp.patient?.id === q.patientId);
    const isOpen = replyOpen === q.id;
    const createdFormatted = `${relDate(q.createdAt)} · ${new Date(
      q.createdAt
    ).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })}`;

    return (
      <div
        key={q.id}
        className={`rounded-2xl border bg-card p-4 transition-all ${
          answered
            ? 'border-emerald-500/25'
            : 'border-amber-500/35 ring-1 ring-amber-500/15'
        }`}
      >
        {/* Topo do Card: Informações do Paciente + Status da Questão */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <div
            role="button"
            tabIndex={0}
            {...a11yClick(() => onGoToPatient(q.patientId))}
            title="Abrir prontuário e exames do paciente"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1 transition hover:bg-primary/5 cursor-pointer"
          >
            <Avatar
              src={q.patient?.id ? photoUrlFor(q.patient.id) : undefined}
              sx={{
                bgcolor: '#178f89',
                fontWeight: 800,
                width: 38,
                height: 38,
                flexShrink: 0,
              }}
            >
              {q.patient?.fullName?.charAt(0) || 'P'}
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-sm font-extrabold text-foreground">
                <span className="truncate">
                  {q.patient?.fullName || 'Paciente'}
                </span>
                <OpenInNewIcon sx={{ fontSize: 13 }} className="text-muted-foreground" />
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {createdFormatted}
                {qp?.age != null
                  ? ` · ${qp.age}a${
                      qp.sex === 'female' ? ' · F' : qp.sex === 'male' ? ' · M' : ''
                    }`
                  : ''}
              </div>
            </div>
          </div>

          <div className="shrink-0">
            {answered ? (
              <ReuiBadge variant="success-light" size="sm">
                <CheckCircleOutlinedIcon sx={{ fontSize: 13 }} />
                Respondida
              </ReuiBadge>
            ) : (
              <button
                type="button"
                onClick={() => setReplyOpen(isOpen ? null : q.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-extrabold transition cursor-pointer ${
                  isOpen
                    ? 'border border-primary/40 bg-primary/10 text-primary'
                    : 'bg-primary text-primary-foreground shadow-sm hover:opacity-95'
                }`}
              >
                {isOpen ? 'Fechar' : 'Responder'}
              </button>
            )}
          </div>
        </div>

        {/* Conversa estruturada com ReUI Message + Bubble */}
        <div className="space-y-2.5">
          <Message>
            <IconTile
              tone={answered ? 'primary' : 'warning'}
              size="sm"
              className="mt-0.5"
            >
              <MessageQuestionIcon size={16} />
            </IconTile>
            <div className="min-w-0 flex-1">
              <MessageHeader
                author="Pergunta do paciente"
                timestamp={createdFormatted}
                badge={
                  !answered ? (
                    <ReuiBadge variant="warning-light" size="xs">
                      Aguardando conduta
                    </ReuiBadge>
                  ) : undefined
                }
              />
              <Bubble variant="default">{questionBody}</Bubble>
            </div>
          </Message>

          {/* Questão Respondida: Confirmação & Resposta do Médico */}
          {answered && lastDoctor && (
            <Message>
              <IconTile tone="success" size="sm" className="mt-0.5">
                <FirstAidKitIcon size={16} />
              </IconTile>
              <div className="min-w-0 flex-1">
                <MessageHeader
                  author="Sua orientação médica enviada"
                  timestamp={new Date(lastDoctor.createdAt).toLocaleDateString(
                    'pt-BR',
                    {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    }
                  )}
                  badge={
                    <ReuiBadge variant="success-light" size="xs">
                      <DoneAllRoundedIcon sx={{ fontSize: 11 }} />
                      Entregue
                    </ReuiBadge>
                  }
                />
                <Bubble variant="accent">{String(lastDoctor.body)}</Bubble>
              </div>
            </Message>
          )}
        </div>

        {/* Área de Resposta INLINE */}
        {isOpen && !answered && (
          <div className="mt-3.5 rounded-xl border border-primary/25 bg-primary/[0.04] p-3.5 space-y-3">
            <div>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">
                ⚡ Respostas rápidas recomendadas
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REPLIES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setQText((prev) => ({ ...prev, [q.id]: t }))}
                    className="rounded-full border border-primary/30 bg-card px-2.5 py-1 text-left text-xs font-semibold text-foreground transition hover:border-primary hover:bg-primary/10 cursor-pointer"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <ReuiTextarea
              rows={3}
              placeholder="Escreva sua conduta ou orientação clínica para o paciente..."
              value={qText[q.id] ?? ''}
              onChange={(e) =>
                setQText((t) => ({ ...t, [q.id]: e.target.value }))
              }
              className="bg-card"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setQText((t) => ({ ...t, [q.id]: '' }));
                  setReplyOpen(null);
                }}
                className="rounded-full px-3.5 py-1.5 text-xs font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={qSending === q.id || !qText[q.id]?.trim()}
                onClick={() => onAnswer(q.id)}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-extrabold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {qSending === q.id ? (
                  <CircularProgress size={13} color="inherit" />
                ) : (
                  <MedicalServicesOutlinedIcon sx={{ fontSize: 15 }} />
                )}
                {qSending === q.id ? 'Enviando conduta…' : 'Enviar conduta médica'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Agrupamento dos itens filtrados por paciente
  const groupedPatients = (() => {
    const map = new Map<
      string,
      {
        patient: any;
        qs: any[];
        last: number;
        pendingCount: number;
        answeredCount: number;
      }
    >();
    for (const q of filteredQ) {
      const pid = q.patientId || '_unknown';
      const g = map.get(pid) ?? {
        patient: q.patient,
        qs: [],
        last: 0,
        pendingCount: 0,
        answeredCount: 0,
      };
      g.qs.push(q);
      g.last = Math.max(g.last, new Date(q.createdAt).getTime());
      if (q.status === 'answered') g.answeredCount++;
      else g.pendingCount++;
      map.set(pid, g);
    }
    return [...map.values()].sort((a, b) => b.last - a.last);
  })();

  return (
    <div className={`reui-scope ${themeClass} space-y-4`}>
      {/* Top Header & Métricas de Triagem em ReUI Frame */}
      <Frame>
        <FrameHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <IconTile tone="primary" size="md">
              <MessageQuestionIcon size={20} />
            </IconTile>
            <div>
              <FrameTitle>Perguntas dos Pacientes</FrameTitle>
              <FrameDescription>
                Triagem clínica e respostas às dúvidas dos seus pacientes em acompanhamento
              </FrameDescription>
            </div>
          </div>
          <Tooltip title="Atualizar perguntas">
            <button
              type="button"
              onClick={onRefresh}
              disabled={allQLoading}
              className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-card text-primary transition hover:bg-muted disabled:opacity-50 cursor-pointer"
            >
              <RefreshIcon sx={{ fontSize: 18 }} />
            </button>
          </Tooltip>
        </FrameHeader>

        {/* KPI Rail interativo — fix 05/11 (dono: "números um embaixo do outro, temos
            que ganhar espaço no mobile"): SEMPRE 3 colunas (era 1 coluna até 640px).
            No aparelho: número grande + label curta empilhados no MESMO card vertical
            compacto — 3 toques-alvo lado a lado em vez de 3 blocos rolando. */}
        <FramePanel className="grid grid-cols-3 divide-x divide-border p-0">
          <button
            type="button"
            onClick={() => setTabFilter('pending')}
            className={`flex flex-col items-center justify-center gap-1 p-2.5 text-center transition cursor-pointer sm:flex-row sm:gap-3 sm:p-4 sm:text-left ${
              tabFilter === 'pending' ? 'bg-amber-500/10' : 'hover:bg-muted/40'
            }`}
          >
            <IconTile tone="warning" size="sm">
              <ScheduleOutlinedIcon sx={{ fontSize: 16 }} />
            </IconTile>
            <div>
              <div className="font-heading text-xl font-extrabold leading-none text-foreground tabular-nums">
                {openQ.length}
              </div>
              <div className="mt-0.5 text-[11px] font-semibold leading-tight text-muted-foreground sm:text-xs">
                Aguardando
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTabFilter('answered')}
            className={`flex flex-col items-center justify-center gap-1 p-2.5 text-center transition cursor-pointer sm:flex-row sm:gap-3 sm:p-4 sm:text-left ${
              tabFilter === 'answered'
                ? 'bg-emerald-500/10'
                : 'hover:bg-muted/40'
            }`}
          >
            <IconTile tone="success" size="sm">
              <CheckCircleOutlinedIcon sx={{ fontSize: 16 }} />
            </IconTile>
            <div>
              <div className="font-heading text-xl font-extrabold leading-none text-foreground tabular-nums">
                {answeredQ.length}
              </div>
              <div className="mt-0.5 text-[11px] font-semibold leading-tight text-muted-foreground sm:text-xs">
                Respondidas
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTabFilter('all')}
            className={`flex flex-col items-center justify-center gap-1 p-2.5 text-center transition cursor-pointer sm:flex-row sm:gap-3 sm:p-4 sm:text-left ${
              tabFilter === 'all' ? 'bg-primary/10' : 'hover:bg-muted/40'
            }`}
          >
            <IconTile tone="primary" size="sm">
              <MessageQuestionIcon size={16} />
            </IconTile>
            <div>
              <div className="font-heading text-xl font-extrabold leading-none text-foreground tabular-nums">
                {allQ.length}
              </div>
              <div className="mt-0.5 text-[11px] font-semibold leading-tight text-muted-foreground sm:text-xs">
                Todas
              </div>
            </div>
          </button>
        </FramePanel>
      </Frame>

      {/* Barra de Filtros e Busca Rápida (ReUI InputGroup) */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: 'pending' as const, label: 'Pendentes', count: openQ.length },
            {
              key: 'answered' as const,
              label: 'Respondidas',
              count: answeredQ.length,
            },
            { key: 'all' as const, label: 'Todas', count: allQ.length },
          ].map((tab) => {
            const active = tabFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setTabFilter(tab.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                  active
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-extrabold tabular-nums ${
                    active
                      ? 'bg-white/25 text-white'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="w-full sm:w-72">
          <InputGroup>
            <InputGroupAddon>
              <SearchOutlinedIcon sx={{ fontSize: 16 }} />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Buscar paciente ou dúvida..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
        </div>
      </div>

      {/* Loading state */}
      {allQLoading && (
        <div className="flex justify-center py-10">
          <CircularProgress size={26} />
        </div>
      )}

      {/* Empty State */}
      {!allQLoading && filteredQ.length === 0 && (
        <Frame>
          <FramePanel className="p-6">
            <Empty className="border-0 p-4 md:p-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageQuestionIcon size={22} />
                </EmptyMedia>
                <EmptyTitle>
                  {search
                    ? 'Nenhuma dúvida encontrada'
                    : tabFilter === 'pending'
                    ? 'Todas as dúvidas estão respondidas!'
                    : 'Nenhuma pergunta nesta categoria'}
                </EmptyTitle>
                <EmptyDescription>
                  {search
                    ? 'Tente buscar por outro termo ou nome de paciente.'
                    : 'Quando os pacientes enviarem perguntas, elas aparecerão organizadas aqui.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </FramePanel>
        </Frame>
      )}

      {/* Lista de Pacientes & Perguntas */}
      {!allQLoading && groupedPatients.length > 0 && (
        <div className="space-y-3">
          {groupedPatients.map((g) => {
            const hasPending = g.pendingCount > 0;
            return (
              <Accordion
                key={g.patient?.id ?? Math.random()}
                defaultExpanded
                elevation={0}
                sx={{
                  '&:before': { display: 'none' },
                  border: '1px solid',
                  borderColor: hasPending
                    ? (t) =>
                        t.palette.mode === 'dark'
                          ? 'rgba(245,158,11,0.3)'
                          : 'rgba(245,158,11,0.35)'
                    : 'divider',
                  borderRadius: '16px !important',
                  overflow: 'hidden',
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{
                    minHeight: '56px !important',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    '& .MuiAccordionSummary-content': { my: 0.75 },
                  }}
                >
                  <div className="flex w-full items-center gap-3 pr-2">
                    <Avatar
                      src={
                        g.patient?.id ? photoUrlFor(g.patient.id) : undefined
                      }
                      sx={{
                        width: 40,
                        height: 40,
                        bgcolor: '#178f89',
                        fontSize: 15,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {(g.patient?.fullName || 'P').charAt(0)}
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-extrabold text-foreground">
                        {g.patient?.fullName || 'Paciente'}
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {g.qs.length} pergunta(s) · última{' '}
                        {new Date(g.last).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                        })}
                      </div>
                    </div>

                    <div className="shrink-0">
                      {hasPending ? (
                        <ReuiBadge variant="warning-light" size="sm">
                          {g.pendingCount} pendente(s)
                        </ReuiBadge>
                      ) : (
                        <ReuiBadge variant="success-light" size="sm">
                          ✓ Todas respondidas
                        </ReuiBadge>
                      )}
                    </div>
                  </div>
                </AccordionSummary>

                <AccordionDetails sx={{ p: { xs: 1.5, sm: 2 } }}>
                  <div className="space-y-2.5">
                    {g.qs.map(renderQuestionCard)}
                  </div>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </div>
      )}
    </div>
  );
};
