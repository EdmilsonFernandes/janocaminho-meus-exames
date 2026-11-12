import { useEffect, useState, useRef } from 'react';
import {
  CircularProgress,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { useNotify } from 'react-admin';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import SupportAgentRoundedIcon from '@mui/icons-material/SupportAgentRounded';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';
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
import { MessageTextIcon } from '@/components/reui/icons';

const H = () => ({ Authorization: `Bearer ${token()}` });
const STATUS_META: Record<
  string,
  {
    label: string;
    variant: 'warning-light' | 'info-light' | 'success-light' | 'outline';
  }
> = {
  open: { label: 'Em andamento', variant: 'warning-light' },
  pending: { label: 'Aguardando usuário', variant: 'info-light' },
  closed: { label: 'Resolvido', variant: 'success-light' },
};
const FILTERS: { id: string; label: string }[] = [
  { id: 'open', label: 'Em andamento' },
  { id: 'pending', label: 'Aguardando' },
  { id: 'closed', label: 'Resolvidos' },
];

/** Respostas rápidas (macros Zendesk/Intercom em versão local): 1 clique insere o texto. */
const MACROS: { label: string; text: string }[] = [
  {
    label: '⚡ Pedir print da tela',
    text: 'Consegue nos mandar um print da tela (ou da mensagem de erro)? Com ele identificamos o problema na hora. 📎',
  },
  {
    label: '⚡ Exame conferido e liberado',
    text: 'Conferimos o documento: o exame é seu mesmo e já foi liberado na sua conta. Recarregue o app e confira — qualquer coisa, é só chamar! ✅',
  },
  {
    label: '⚡ Como enviar o exame',
    text: 'Pra enviar: toque em "Enviar exame" e escolha o PDF do laboratório (ou uma foto do laudo, bem nítida). PDF com vários exames de datas diferentes? A gente separa automaticamente.',
  },
  {
    label: '⚡ Créditos explicados',
    text: 'Enviar exames é grátis. Recursos de IA (relatório, resumo, chat) usam créditos — você ganha bônus ao começar e pode comprar mais via PIX quando quiser. O plano mensal (R$ 19,90) libera uso com cota mensal.',
  },
  {
    label: '⚡ Agradecimento + fechar',
    text: 'Que bom que deu certo! 🎉 Vou marcar o chamado como resolvido — se voltar a acontecer, responde aqui que a gente reabre. Saúde em dia!',
  },
];

const fmt = (d: string | null) =>
  d
    ? new Date(d).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

async function downloadAtt(url: string, name: string) {
  try {
    const r = await fetch(`${API_URL}/${url}`, { headers: H() });
    if (!r.ok) throw new Error();
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name || 'anexo';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch {
    /* ignora */
  }
}

export const SupportTab = () => {
  const notify = useNotify();
  const themeClass = useReuiThemeSync();
  const [data, setData] = useState<{
    tickets: any[];
    openCount: number;
    unreadByAdmin: number;
  } | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const r = await fetch(`${API_URL}/admin/tickets?status=${filter}`, {
        headers: H(),
      });
      if (r.ok) setData(await r.json());
      else setError(true);
    } catch {
      setError(true);
    }
    setLoading(false);
  };
  useEffect(() => {
    void load();
    /* eslint-disable-next-line */
  }, [filter]);

  const tickets = (data?.tickets ?? []).filter((t) => {
    if (!q.trim()) return true;
    const s =
      `${t.number} ${t.subject} ${t.category ?? ''} ${t.user?.name ?? ''} ${t.user?.email ?? ''}`.toLowerCase();
    return s.includes(q.trim().toLowerCase());
  });

  return (
    <div className={`reui-scope ${themeClass} space-y-4`}>
      <Frame>
        <FrameHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <IconTile tone="primary" size="md">
              <MessageTextIcon size={20} />
            </IconTile>
            <div>
              <FrameTitle className="flex items-center gap-2">
                Fila de suporte ao usuário
                {!!data?.unreadByAdmin && (
                  <ReuiBadge variant="destructive" size="xs">
                    {data.unreadByAdmin} não lido(s)
                  </ReuiBadge>
                )}
              </FrameTitle>
              <FrameDescription>
                Atendimento direto aos pacientes, conferência de documentos e dúvidas de plano
              </FrameDescription>
            </div>
          </div>

          <div className="w-full sm:w-72">
            <InputGroup>
              <InputGroupAddon>
                <SearchOutlinedIcon sx={{ fontSize: 16 }} />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Buscar nº, assunto, usuário…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </InputGroup>
          </div>
        </FrameHeader>

        <FramePanel className="space-y-3">
          {/* Filtros de status */}
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => {
              const active = filter === f.id;
              const count =
                f.id === filter ? (data?.tickets ?? []).length : null;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                    active
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5'
                  }`}
                >
                  <span>{f.label}</span>
                  {count != null && (
                    <span
                      className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-extrabold tabular-nums ${
                        active
                          ? 'bg-white/25 text-white'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {loading ? (
            <TabLoader />
          ) : error ? (
            <SectionError
              message="Não foi possível carregar os chamados."
              onRetry={() => void load()}
            />
          ) : tickets.length === 0 ? (
            <Empty className="border-0 p-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageTextIcon size={22} />
                </EmptyMedia>
                <EmptyTitle>Nenhum chamado neste filtro</EmptyTitle>
                <EmptyDescription>
                  Não há chamados correspondentes aos critérios selecionados.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
              {tickets.map((t) => {
                const st = STATUS_META[t.status] ?? STATUS_META.open;
                return (
                  <div
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelId(t.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelId(t.id);
                      }
                    }}
                    className={`flex flex-col gap-1.5 bg-card p-3.5 transition hover:bg-muted/30 cursor-pointer ${
                      t.unreadByAdmin
                        ? 'border-l-4 border-l-destructive bg-destructive/[0.02]'
                        : ''
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-extrabold text-primary tabular-nums">
                        #{t.number}
                      </span>
                      {t.unreadByAdmin && (
                        <ReuiBadge variant="destructive" size="xs">
                          Novo
                        </ReuiBadge>
                      )}
                      {t.category && (
                        <ReuiBadge variant="outline" size="xs">
                          {t.category}
                        </ReuiBadge>
                      )}
                      <span className="ml-auto">
                        <ReuiBadge variant={st.variant} size="xs">
                          {st.label}
                        </ReuiBadge>
                      </span>
                    </div>

                    <div className="text-sm font-bold text-foreground break-words">
                      {t.subject}
                    </div>

                    <div className="text-xs text-muted-foreground tabular-nums">
                      {t.user?.name ?? '—'} · {t.user?.email ?? ''} ·{' '}
                      {fmt(t.lastMessageAt)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </FramePanel>
      </Frame>

      {selId && (
        <Conversation
          ticketId={selId}
          onClose={() => {
            setSelId(null);
            void load();
          }}
          onNotify={notify}
        />
      )}
    </div>
  );
};

// ── Conversa (Dialog): thread ReUI Message + Bubble + Macros + Resposta ──
const Conversation = ({
  ticketId,
  onClose,
  onNotify,
}: {
  ticketId: string;
  onClose: () => void;
  onNotify: (m: string, o?: any) => void;
}) => {
  const themeClass = useReuiThemeSync();
  const [data, setData] = useState<any>(null);
  const [reply, setReply] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = () => {
    fetch(`${API_URL}/admin/tickets/${ticketId}`, { headers: H() })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  };
  useEffect(() => {
    void load();
    /* eslint-disable-next-line */
  }, [ticketId]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data?.messages?.length]);

  const send = async (silent = false) => {
    if (!reply.trim() && !files.length) return false;
    setSending(true);
    let ok = false;
    try {
      const fd = new FormData();
      fd.append('message', reply.trim() || '(anexo)');
      for (const f of files.slice(0, 5)) fd.append('files', f, f.name);
      const r = await fetch(
        `${API_URL}/admin/tickets/${ticketId}/messages`,
        { method: 'POST', headers: H(), body: fd }
      );
      if (r.ok) {
        ok = true;
        setReply('');
        setFiles([]);
        if (!silent)
          onNotify('Resposta enviada — usuário notificado.', {
            type: 'success',
          });
        void load();
      } else onNotify('Erro ao enviar.', { type: 'error' });
    } catch {
      onNotify('Falha de rede.', { type: 'error' });
    }
    setSending(false);
    return ok;
  };

  const resolve = async () => {
    const hadMessage = !!reply.trim() || files.length > 0;
    if (hadMessage) {
      const sent = await send(true);
      if (!sent) return;
    }
    const r = await fetch(`${API_URL}/admin/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...H() },
      body: JSON.stringify({ status: 'closed' }),
    });
    if (r.ok)
      onNotify(
        hadMessage
          ? 'Chamado resolvido com resposta final enviada.'
          : 'Chamado resolvido.',
        { type: 'success' }
      );
    void load();
  };

  if (!data)
    return (
      <Dialog open onClose={onClose} fullWidth>
        <DialogContent>
          <CircularProgress size={24} />
        </DialogContent>
      </Dialog>
    );
  const st = STATUS_META[data.status] ?? STATUS_META.open;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <div className={`reui-scope ${themeClass}`}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 5 }}>
          <span className="font-mono text-base font-extrabold text-primary tabular-nums">
            #{data.number}
          </span>
          <ReuiBadge variant={st.variant} size="sm">
            {st.label}
          </ReuiBadge>
          {data.category && (
            <ReuiBadge variant="outline" size="xs">
              {data.category}
            </ReuiBadge>
          )}
          <IconButton
            onClick={onClose}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          <div className="mb-3 rounded-xl border border-border bg-muted/30 p-3">
            <div className="text-sm font-extrabold text-foreground">
              {data.subject}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>
                👤 {data.user?.name ?? '—'} · {data.user?.email ?? ''}
              </span>
              {data.user?.planExpiresAt &&
                new Date(data.user.planExpiresAt) > new Date() && (
                  <ReuiBadge variant="warning-light" size="xs">
                    ⭐ Plano mensal ativo
                  </ReuiBadge>
                )}
              {typeof data.user?.credits === 'number' && (
                <ReuiBadge variant="primary-light" size="xs">
                  Créditos: {data.user.credits}
                </ReuiBadge>
              )}
              {data.user?.createdAt && (
                <ReuiBadge variant="outline" size="xs">
                  Cliente desde{' '}
                  {new Date(data.user.createdAt).toLocaleDateString('pt-BR', {
                    month: 'short',
                    year: 'numeric',
                  })}
                </ReuiBadge>
              )}
            </div>
          </div>

          {/* Thread de mensagens com ReUI Message + Bubble */}
          <div className="space-y-3 py-2">
            {(data.messages ?? []).map((m: any) => {
              const mine = m.authorRole === 'admin';
              const atts = m.attachments ?? [];
              return (
                <Message key={m.id}>
                  <IconTile
                    tone={mine ? 'primary' : 'muted'}
                    size="sm"
                    className="mt-0.5"
                  >
                    {mine ? (
                      <SupportAgentRoundedIcon sx={{ fontSize: 16 }} />
                    ) : (
                      <PersonRoundedIcon sx={{ fontSize: 16 }} />
                    )}
                  </IconTile>
                  <div className="min-w-0 flex-1">
                    <MessageHeader
                      author={
                        mine
                          ? 'Suporte Dr. Exame'
                          : data.user?.name || 'Usuário'
                      }
                      timestamp={fmt(m.createdAt)}
                      badge={
                        mine ? (
                          <ReuiBadge variant="primary-light" size="xs">
                            Equipe
                          </ReuiBadge>
                        ) : undefined
                      }
                    />
                    <Bubble variant={mine ? 'accent' : 'default'}>
                      <div>{m.body}</div>
                      {atts.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {atts.map((a: any, i: number) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => void downloadAtt(a.url, a.name)}
                              className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary hover:bg-primary/20 cursor-pointer"
                            >
                              📎 {a.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </Bubble>
                  </div>
                </Message>
              );
            })}
            <div ref={endRef} />
          </div>
        </DialogContent>

        <DialogActions
          sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1.25, p: 2 }}
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            hidden
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />

          {/* Macros rápidas em chips */}
          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Macros de resposta rápida (toque para inserir)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {MACROS.map((m) => (
                <button
                  key={m.label}
                  type="button"
                  onClick={() =>
                    setReply((prev) =>
                      prev.trim() ? `${prev.trim()}\n\n${m.text}` : m.text
                    )
                  }
                  className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-semibold text-foreground transition hover:border-primary/40 hover:bg-primary/10 cursor-pointer"
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <ReuiTextarea
            rows={3}
            placeholder="Responder… pedir mais informações, anexar print… (Ctrl+Enter para enviar)"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void send();
              }
            }}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground transition hover:bg-muted cursor-pointer"
              >
                <AttachFileIcon sx={{ fontSize: 15 }} />
                Anexar ({files.length}/5)
              </button>
              {files.map((f, i) => (
                <ReuiBadge key={i} variant="outline" size="xs">
                  {f.name}
                  <button
                    type="button"
                    onClick={() =>
                      setFiles(files.filter((_, j) => j !== i))
                    }
                    className="ml-1 font-extrabold hover:text-destructive cursor-pointer"
                  >
                    ×
                  </button>
                </ReuiBadge>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {data.status !== 'closed' && (
                <button
                  type="button"
                  onClick={() => void resolve()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-extrabold text-emerald-700 dark:text-emerald-400 transition hover:bg-emerald-500/20 cursor-pointer"
                >
                  <MarkEmailReadIcon sx={{ fontSize: 15 }} />
                  Resolver chamado
                </button>
              )}
              <button
                type="button"
                disabled={sending || (!reply.trim() && !files.length)}
                onClick={() => void send()}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-extrabold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                <SendIcon sx={{ fontSize: 14 }} />
                {sending ? 'Enviando…' : 'Responder'}
              </button>
            </div>
          </div>
        </DialogActions>
      </div>
    </Dialog>
  );
};
