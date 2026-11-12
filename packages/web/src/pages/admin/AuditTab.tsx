import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Stack,
  Chip,
  TextField,
  MenuItem,
  Button,
  Collapse,
  IconButton,
  InputAdornment,
  Tooltip,
  useTheme,
  alpha,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff';
import PersonIcon from '@mui/icons-material/Person';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import SecurityIcon from '@mui/icons-material/Security';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';

const H = () => ({ Authorization: `Bearer ${token()}` });

const KINDS = [
  { v: '', l: 'Todas as categorias' },
  { v: 'logins', l: 'Logins & Autenticação' },
  { v: 'access', l: 'Acessos a rotas' },
  { v: 'admin', l: 'Operações administrativas' },
];

const TAKE = 50;

/** Dicionário completo de tradução pt-BR para todas as ações do sistema */
const ACTION_LABEL: Record<string, string> = {
  LOGIN_SUCCESS: 'Login com sucesso',
  LOGIN_FAILED: 'Tentativa de login falhou',
  SIGNUP: 'Cadastro de paciente',
  REGISTER: 'Cadastro de conta',
  SIGNUP_BLOCKED: 'Cadastro bloqueado',
  BOT_BLOCKED: 'Automação / Bot bloqueado',
  LOGOUT: 'Encerramento de sessão',
  PASSWORD_RESET_REQUEST: 'Solicitação de nova senha',
  PASSWORD_RESET_SUCCESS: 'Senha redefinida',
  MFA_CHALLENGE: 'Desafio MFA solicitado',
  MFA_SUCCESS: 'MFA autenticado',
  MFA_FAILED: 'MFA incorreto',
  RESET_MFA: 'MFA resetado pelo admin',
  DATA_EXPORT: 'Exportação de dados (LGPD)',
  ACCOUNT_DELETED: 'Conta excluída',
  PII_VIEWED: 'Visualização de dados pessoais',
  LOOKUP_CPF: 'Busca por CPF',
  LOOKUP_PII_EMAIL: 'Busca por e-mail',
  REVEAL_CPF: 'Visualização de CPF',
  ADMIN_ACTION: 'Ação administrativa',
  ADMIN_CREDITS: 'Ajuste de créditos',
  CREDITS_GRANTED: 'Créditos concedidos',
  CREDITS_REVOKED: 'Créditos revogados',
  AWARD_REFERRAL_BONUS: 'Bônus por indicação',
  BLOCK_USER: 'Usuário bloqueado',
  UNBLOCK_USER: 'Usuário desbloqueado',
  DOCTOR_REGISTER: 'Médico registrado',
  DOCTOR_REGISTERED: 'Médico cadastrado pelo CRM',
  DOCTOR_LOGIN: 'Login médico realizado',
  CREATE_TICKET: 'Ticket de suporte aberto',
  REPLY_TICKET: 'Resposta ao ticket',
  UPDATE_TICKET: 'Ticket atualizado',
  EXAM_DELETED: 'Exame excluído',
  EXAM_REQUEST_CREATE: 'Pedido de exame emitido',
  EXAM_REQUEST_RESPOND: 'Resposta a pedido de exame',
  TELECONSULTA_JOIN: 'Entrou na teleconsulta',
  TELECONSULTA_START: 'Teleconsulta iniciada',
  TELECONSULTA_END: 'Teleconsulta encerrada',
  TELECONSULTA_LEAVE: 'Saiu da teleconsulta',
  TELECONSULTA_NUDGE: 'Lembrete de teleconsulta enviado',
  TELECONSULTA_FEEDBACK: 'Avaliação de consulta registrada',
  TELECONSULTA_RECORD_CONSENT: 'Consentimento de gravação aceito',
  TELECONSULTA_DOCTOR_NOTE: 'Anotação médica salva',
  TELECONSULTA_SUMMARY_GENERATE: 'Resumo IA gerado',
  TELECONSULTA_SUMMARY_DRAFT: 'Rascunho de prontuário salvo',
  TELECONSULTA_SUMMARY_APPROVE: 'Prontuário aprovado pelo médico',
  TELECONSULTA_PAYOUT_AUTO_TOGGLE: 'Repasse automático configurado',
  ADMIN_COMMISSION_RULE_CREATE: 'Regra de repasse criada',
  ADMIN_PAYOUT_APPROVE_REQUEST: 'Repasse solicitado',
  ADMIN_PAYOUT_APPROVE_RESULT: 'Repasse processado',
  UPDATE_AI_CONFIG: 'Configuração de IA atualizada',
  CREATE_AI_MODEL: 'Modelo de IA cadastrado',
  DELETE_AI_MODEL: 'Modelo de IA removido',
  REGENERATE_EXAM_KNOWLEDGE: 'Regeneração de conhecimento de exame',
  UPDATE_EXAM_KNOWLEDGE: 'Conhecimento de exame atualizado',
  DELETE_EXAM_KNOWLEDGE: 'Conhecimento de exame excluído',
  ACCESS: 'Acesso à API',
};

const actionLabel = (a: string | null | undefined): string => {
  if (!a) return '—';
  if (ACTION_LABEL[a]) return ACTION_LABEL[a];
  if (a.startsWith('LOGIN_SUCCESS')) return 'Login com sucesso';
  if (a.startsWith('LOGIN_FAILED')) return 'Falha no login';
  const clean = a.replace(/_/g, ' ').toLowerCase();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

export const AuditTab = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState(false);
  const [kind, setKind] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [skip, setSkip] = useState(0);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [showAllActions, setShowAllActions] = useState(false);

  // Ordenação das ações por frequência para atalhos rápidos ReUI
  const sortedActions = useMemo(() => {
    return [...(d?.byAction || [])].sort((a: any, b: any) => b._count - a._count);
  }, [d?.byAction]);

  const topActions = useMemo(() => sortedActions.slice(0, 5), [sortedActions]);

  // Agrupamento semântico ReUI do catálogo completo de ações
  const categorizedActions = useMemo(() => {
    if (!d?.byAction) return { auth: [], tele: [], admin: [] };
    const auth: any[] = [];
    const tele: any[] = [];
    const admin: any[] = [];

    for (const a of d.byAction) {
      const act = a.action || '';
      if (
        act.includes('LOGIN') ||
        act.includes('MFA') ||
        act.includes('PASSWORD') ||
        act.includes('BOT') ||
        act.includes('BLOCK') ||
        act.includes('SIGNUP') ||
        act.includes('REGISTER') ||
        act.includes('LOGOUT')
      ) {
        auth.push(a);
      } else if (
        act.includes('TELECONSULTA') ||
        act.includes('CONSENT') ||
        act.includes('TICKET') ||
        act.includes('FEEDBACK')
      ) {
        tele.push(a);
      } else {
        admin.push(a);
      }
    }
    return {
      auth: auth.sort((a, b) => b._count - a._count),
      tele: tele.sort((a, b) => b._count - a._count),
      admin: admin.sort((a, b) => b._count - a._count),
    };
  }, [d?.byAction]);

  const load = useCallback(() => {
    setErr(false);
    const p = new URLSearchParams();
    if (kind) p.set('kind', kind);
    if (selectedAction) p.set('action', selectedAction);
    if (searchTerm.trim()) p.set('userId', searchTerm.trim());
    if (from) p.set('from', new Date(from + 'T00:00:00').toISOString());
    if (to) p.set('to', new Date(to + 'T23:59:59').toISOString());
    p.set('take', String(TAKE));
    p.set('skip', String(skip));

    fetch(`${API_URL}/admin/audit?${p.toString()}`, { headers: H() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setD)
      .catch(() => setErr(true));
  }, [kind, selectedAction, searchTerm, from, to, skip]);

  useEffect(() => {
    load();
  }, [load]);

  const hasActiveFilters = !!(kind || selectedAction || searchTerm || from || to);

  const clearFilters = () => {
    setKind('');
    setSelectedAction('');
    setSearchTerm('');
    setFrom('');
    setTo('');
    setSkip(0);
  };

  const color = (a: string): 'success' | 'warning' | 'error' | 'info' | 'default' => {
    if (a.startsWith('LOGIN_SUCCESS') || a.includes('UNBLOCK') || a.includes('APPROVE') || a.includes('SUCCESS')) return 'success';
    if (a.startsWith('LOGIN_FAILED') || a === 'EXAM_DELETED' || a.includes('RESET') || a.includes('REVOKED')) return 'warning';
    if (a.includes('BLOCK') || a.includes('DELETED') || a.includes('FAILED')) return 'error';
    if (a === 'ACCESS' || a.includes('TELECONSULTA') || a.includes('SUMMARY') || a.includes('TICKET')) return 'info';
    return 'default';
  };

  const accessInfo = (l: any): string | null => {
    if (!l.after) return null;
    try {
      const a = typeof l.after === 'string' ? JSON.parse(l.after) : l.after;
      if (a && a.method && a.path) return `${a.method} ${a.path} · ${a.status ?? 200} · ${a.ms ?? '?'}ms`;
    } catch {}
    return null;
  };

  const examInfo = (l: any): string | null => {
    if (l.action !== 'EXAM_DELETED' || !l.before) return null;
    try {
      const b = typeof l.before === 'string' ? JSON.parse(l.before) : l.before;
      if (!b?.title) return null;
      const parts = [`Exame: ${b.title}`];
      if (b.performedAt) parts.push(`realizado ${new Date(b.performedAt).toLocaleDateString('pt-BR')}`);
      if (b.extractedAt) parts.push(`extraído ${new Date(b.extractedAt).toLocaleDateString('pt-BR')}`);
      return parts.join(' · ');
    } catch {}
    return null;
  };

  /** Motivos legíveis de login/bot (dono 26/10: "tudo genérico coloca detalhes"). */
  const LOGIN_REASONS: Record<string, string> = {
    invalid_password: 'senha incorreta',
    user_not_found: 'e-mail não cadastrado',
    doctor_not_found: 'CRM/e-mail não cadastrado',
    invite_pending: 'cadastro incompleto (convite pendente)',
    account_blocked: 'conta bloqueada pela administração',
    email_unverified: 'e-mail não verificado',
    velocity: 'velocidade suspeita (≥3 contas em 24h pelo mesmo navegador)',
    email_pattern: 'padrão de e-mail típico de automação',
  };

  /** Detalhe do LOGIN_FAILED/BOT_BLOCKED: QUEM tentou entrar, POR QUE falhou e com
   *  qual navegador — antes o evento só dizia "Tentativa de login falhou · USER". */
  const loginInfo = (l: any): string | null => {
    if (l.action !== 'LOGIN_FAILED' && l.action !== 'LOGIN_BLOCKED' && l.action !== 'BOT_BLOCKED') return null;
    try {
      const a = typeof l.after === 'string' ? JSON.parse(l.after) : l.after;
      if (!a) return null;
      const who = a.email || a.login || a.crm || '(sem identificador)';
      const parts: string[] = [`tentou entrar como: ${who}`];
      if (a.reason) parts.push(`motivo: ${LOGIN_REASONS[a.reason] ?? a.reason}`);
      if (a.detail) parts.push(`detalhe: ${a.detail}`);
      if (a.via && a.via !== 'password') parts.push(`via: ${a.via}`);
      if (a.ua) parts.push(`navegador: ${a.ua}`);
      return parts.join(' · ');
    } catch {}
    return null;
  };

  const actorIcon = (type: string) => {
    switch (type) {
      case 'ADMIN':
        return <AdminPanelSettingsIcon sx={{ fontSize: 16, color: '#f59e0b' }} />;
      case 'DOCTOR':
        return <MedicalServicesIcon sx={{ fontSize: 16, color: '#3b82f6' }} />;
      case 'USER':
        return <PersonIcon sx={{ fontSize: 16, color: '#10b981' }} />;
      default:
        return <SecurityIcon sx={{ fontSize: 16, color: 'text.secondary' }} />;
    }
  };

  const actorTypeLabel = (type: string) => {
    switch (type) {
      case 'ADMIN':
        return 'Administrador';
      case 'DOCTOR':
        return 'Médico';
      case 'USER':
        return 'Paciente';
      case 'SYSTEM':
        return 'Sistema';
      default:
        return type || 'Usuário';
    }
  };

  /** Linha de um evento auditado */
  const logRow = (l: any) => {
    const info = loginInfo(l) ?? accessInfo(l) ?? examInfo(l);
    return (
      <Box sx={{ py: 0.75 }}>
        <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
          <Chip
            size="small"
            color={color(l.action)}
            label={actionLabel(l.action)}
            sx={{ fontWeight: 700, fontSize: 12 }}
          />
          <Typography variant="body2" sx={{ flex: 1, minWidth: 160, fontSize: 13 }}>
            <strong>{d.actors?.[l.actorId]?.name ?? l.actorType}</strong>
            {d.actors?.[l.actorId]?.email
              ? ` · ${d.actors[l.actorId].email}`
              : l.targetType && l.targetType !== 'USER' && l.targetType !== 'DOCTOR'
              ? ` → ${l.targetType}`
              : ''}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 12 }}>
            {new Date(l.createdAt).toLocaleString('pt-BR')}
            {l.ip ? ` · IP: ${l.ip}` : ''}
          </Typography>
        </Stack>
        {info && (
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mt: 0.5,
              fontFamily: 'monospace',
              fontSize: 12,
              color: 'text.secondary',
              bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              px: 1,
              py: 0.25,
              borderRadius: '4px',
            }}
          >
            {info}
          </Typography>
        )}
      </Box>
    );
  };

  /**
   * Agrupamento inteligente consecutivo por ator:
   * Sumariza e separa por ação para não poluir a tela.
   */
  const groups = useMemo(() => {
    if (!d?.auditLogs) return [];
    const list: {
      key: string;
      actorId: string;
      actorType: string;
      actorLabel: string;
      actorEmail?: string;
      logs: any[];
      actionCounts: Record<string, number>;
    }[] = [];

    for (const l of d.auditLogs) {
      const key = `${l.actorType}:${l.actorId ?? 'anon'}`;
      const last = list[list.length - 1];

      if (last && last.key === key) {
        last.logs.push(l);
        last.actionCounts[l.action] = (last.actionCounts[l.action] || 0) + 1;
      } else {
        const actor = d.actors?.[l.actorId];
        list.push({
          key,
          actorId: l.actorId,
          actorType: l.actorType,
          actorLabel: actor?.name ?? actorTypeLabel(l.actorType),
          actorEmail: actor?.email,
          logs: [l],
          actionCounts: { [l.action]: 1 },
        });
      }
    }
    return list;
  }, [d?.auditLogs, d?.actors]);

  const spanLabel = (logs: any[]): string => {
    if (logs.length <= 1) return '';
    const span = Math.max(0, new Date(logs[0].createdAt).getTime() - new Date(logs[logs.length - 1].createdAt).getTime());
    if (span < 60_000) return 'mesmo minuto';
    if (span < 3_600_000) return `${Math.max(1, Math.round(span / 60_000))} min`;
    if (span < 86_400_000) return `${Math.max(1, Math.round(span / 3_600_000))} h`;
    return `${Math.max(1, Math.round(span / 86_400_000))} dias`;
  };

  const toggleGroup = (gk: string) => setOpenGroups((s) => ({ ...s, [gk]: !s[gk] }));

  if (!d && !err) return <TabLoader />;
  if (err) return <SectionError message="Não foi possível carregar o log de auditoria." onRetry={load} />;

  const hasPrev = skip > 0;
  const hasNext = (d.auditLogs?.length ?? 0) >= TAKE;

  return (
    <Box sx={{ width: '100%', maxWidth: '100%' }}>
      {/* CABEÇALHO */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, fontSize: { xs: 17, sm: 19 }, display: 'flex', alignItems: 'center', gap: 1 }}>
            🛡️ Auditoria & Logs de Segurança
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Rastreabilidade LGPD: {d.count} evento(s) registrado(s)
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          {selectedAction && (
            <Chip
              size="small"
              color={color(selectedAction)}
              label={`Ação: ${actionLabel(selectedAction)}`}
              onDelete={() => setSelectedAction('')}
              deleteIcon={<CloseIcon sx={{ fontSize: 14 }} />}
              sx={{ fontWeight: 700, borderRadius: '999px', fontSize: 12 }}
            />
          )}
          {hasActiveFilters && (
            <Button
              size="small"
              variant="outlined"
              color="secondary"
              onClick={clearFilters}
              startIcon={<FilterAltOffIcon sx={{ fontSize: 15 }} />}
              sx={{ textTransform: 'none', borderRadius: '8px', fontWeight: 700, fontSize: 12 }}
            >
              Limpar filtros
            </Button>
          )}
        </Stack>
      </Stack>

      {/* FILTROS INTERATIVOS — ReUI Smart Filter Bar */}
      <Card
        variant="outlined"
        sx={{
          borderRadius: '16px',
          mb: 2.5,
          p: 2,
          bgcolor: isDark ? alpha(theme.palette.background.paper, 0.7) : '#ffffff',
          boxShadow: isDark ? '0 4px 14px rgba(0,0,0,0.25)' : '0 1px 3px rgba(0,0,0,0.03)',
          border: '1px solid',
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems="stretch">
          <TextField
            size="small"
            placeholder="Buscar por usuário, e-mail ou ID..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setSkip(0);
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                </InputAdornment>
              ),
            }}
            sx={{ flex: 1.5, minWidth: { xs: '100%', sm: 200 } }}
          />

          <TextField
            select
            size="small"
            label="Categoria"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setSkip(0);
            }}
            sx={{ minWidth: { xs: '100%', sm: 160 } }}
          >
            {KINDS.map((k) => (
              <MenuItem key={k.v} value={k.v}>
                {k.l}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            size="small"
            label="Ação específica"
            value={selectedAction}
            onChange={(e) => {
              setSelectedAction(e.target.value);
              setSkip(0);
            }}
            sx={{ minWidth: { xs: '100%', sm: 200 } }}
          >
            <MenuItem value="">Todas as ações</MenuItem>
            {sortedActions.map((a: any) => (
              <MenuItem key={a.action} value={a.action}>
                {actionLabel(a.action)} ({a._count})
              </MenuItem>
            ))}
          </TextField>

          <Stack direction="row" spacing={1} sx={{ flex: 1 }}>
            <TextField
              size="small"
              type="date"
              label="De"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setSkip(0);
              }}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              type="date"
              label="Até"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setSkip(0);
              }}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
          </Stack>

          <Button
            variant="contained"
            size="small"
            onClick={() => {
              setSkip(0);
              load();
            }}
            sx={{
              fontWeight: 800,
              textTransform: 'none',
              borderRadius: '10px',
              px: 3,
              minHeight: 40,
              bgcolor: '#0d9488',
              '&:hover': { bgcolor: '#0f766e' },
            }}
          >
            Filtrar
          </Button>
        </Stack>

        {/* ATALHOS RÁPIDOS REUI — Substitui a nuvem de 40 chips por navegação limpa */}
        {sortedActions.length > 0 && (
          <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
              <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 12, mr: 0.5 }}>
                  Atalhos rápidos:
                </Typography>
                {topActions.map((a: any) => {
                  const isSelected = selectedAction === a.action;
                  return (
                    <Chip
                      key={a.action}
                      size="small"
                      variant={isSelected ? 'filled' : 'outlined'}
                      color={color(a.action)}
                      onClick={() => {
                        setSelectedAction(isSelected ? '' : a.action);
                        setSkip(0);
                      }}
                      label={`${actionLabel(a.action)} (${a._count})`}
                      sx={{
                        cursor: 'pointer',
                        fontWeight: isSelected ? 800 : 600,
                        fontSize: 12,
                        borderRadius: '999px',
                        transition: 'all .15s ease',
                        boxShadow: isSelected ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
                      }}
                    />
                  );
                })}
              </Stack>

              <Button
                size="small"
                onClick={() => setShowAllActions((v) => !v)}
                endIcon={showAllActions ? <KeyboardArrowUpIcon sx={{ fontSize: 16 }} /> : <KeyboardArrowDownIcon sx={{ fontSize: 16 }} />}
                sx={{
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: 12,
                  color: '#0d9488',
                  p: '2px 8px',
                  borderRadius: '8px',
                  '&:hover': { bgcolor: 'rgba(13, 148, 136, 0.08)' },
                }}
              >
                {showAllActions ? 'Recolher catálogo' : `Ver todas as ações (${sortedActions.length})`}
              </Button>
            </Stack>

            {/* GAVETA CATEGORIZADA REUI COM TODAS AS AÇÕES */}
            <Collapse in={showAllActions} timeout={250} unmountOnExit>
              <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px dashed', borderColor: 'divider' }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1.5 }}>
                  Catálogo categorizado de eventos auditados (clique para aplicar filtro):
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
                  
                  {/* Coluna 1: Autenticação & Acesso */}
                  <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', border: '1px solid', borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0' }}>
                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 0.5, mb: 1, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 12 }}>
                      🔐 Autenticação & Acessos ({categorizedActions.auth.length})
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.65 }}>
                      {categorizedActions.auth.map((a: any) => {
                        const isSelected = selectedAction === a.action;
                        return (
                          <Chip
                            key={a.action}
                            size="small"
                            variant={isSelected ? 'filled' : 'outlined'}
                            color={color(a.action)}
                            onClick={() => {
                              setSelectedAction(isSelected ? '' : a.action);
                              setSkip(0);
                            }}
                            label={`${actionLabel(a.action)} (${a._count})`}
                            sx={{
                              cursor: 'pointer',
                              fontWeight: isSelected ? 800 : 500,
                              fontSize: 12,
                              height: 24,
                              bgcolor: isSelected ? undefined : (isDark ? 'rgba(255,255,255,0.04)' : '#ffffff'),
                            }}
                          />
                        );
                      })}
                    </Box>
                  </Box>

                  {/* Coluna 2: Teleconsulta & Atendimento */}
                  <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', border: '1px solid', borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0' }}>
                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 0.5, mb: 1, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 12 }}>
                      🩺 Telemedicina & Consultas ({categorizedActions.tele.length})
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.65 }}>
                      {categorizedActions.tele.map((a: any) => {
                        const isSelected = selectedAction === a.action;
                        return (
                          <Chip
                            key={a.action}
                            size="small"
                            variant={isSelected ? 'filled' : 'outlined'}
                            color={color(a.action)}
                            onClick={() => {
                              setSelectedAction(isSelected ? '' : a.action);
                              setSkip(0);
                            }}
                            label={`${actionLabel(a.action)} (${a._count})`}
                            sx={{
                              cursor: 'pointer',
                              fontWeight: isSelected ? 800 : 500,
                              fontSize: 12,
                              height: 24,
                              bgcolor: isSelected ? undefined : (isDark ? 'rgba(255,255,255,0.04)' : '#ffffff'),
                            }}
                          />
                        );
                      })}
                    </Box>
                  </Box>

                  {/* Coluna 3: Gestão & Sistema */}
                  <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', border: '1px solid', borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0' }}>
                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 0.5, mb: 1, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 12 }}>
                      ⚙️ Gestão & Sistema ({categorizedActions.admin.length})
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.65 }}>
                      {categorizedActions.admin.map((a: any) => {
                        const isSelected = selectedAction === a.action;
                        return (
                          <Chip
                            key={a.action}
                            size="small"
                            variant={isSelected ? 'filled' : 'outlined'}
                            color={color(a.action)}
                            onClick={() => {
                              setSelectedAction(isSelected ? '' : a.action);
                              setSkip(0);
                            }}
                            label={`${actionLabel(a.action)} (${a._count})`}
                            sx={{
                              cursor: 'pointer',
                              fontWeight: isSelected ? 800 : 500,
                              fontSize: 12,
                              height: 24,
                              bgcolor: isSelected ? undefined : (isDark ? 'rgba(255,255,255,0.04)' : '#ffffff'),
                            }}
                          />
                        );
                      })}
                    </Box>
                  </Box>

                </Box>
              </Box>
            </Collapse>
          </Box>
        )}
      </Card>

      {/* LISTA AGRUPADA POR ATOR COM SEPARAÇÃO DE AÇÕES */}
      <Stack spacing={1.25}>
        {groups.map((g, gi) => {
          const gk = `${gi}:${g.key}`;
          const open = !!openGroups[gk];
          const first = g.logs[0];
          const actionKeys = Object.keys(g.actionCounts);

          if (g.logs.length === 1) {
            return (
              <Card
                key={first.id}
                variant="outlined"
                sx={{
                  borderRadius: '12px',
                  transition: 'background-color .2s',
                  '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' },
                }}
              >
                <CardContent sx={{ py: 1.25, px: 2, '&:last-child': { pb: 1.25 } }}>
                  <Stack direction="row" alignItems="center" gap={1}>
                    {actorIcon(g.actorType)}
                    <Box sx={{ flex: 1, minWidth: 0 }}>{logRow(first)}</Box>
                  </Stack>
                </CardContent>
              </Card>
            );
          }

          // Ator com múltiplas ações consecutivas: Sumarizado e separado por ação
          return (
            <Card
              key={gk}
              variant="outlined"
              sx={{
                borderRadius: '12px',
                borderColor: open ? 'primary.main' : 'divider',
                boxShadow: open ? (isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 4px 16px rgba(0,0,0,0.06)') : 'none',
                transition: 'all .2s ease',
              }}
            >
              <CardContent
                sx={{ py: 1.5, px: 2, cursor: 'pointer', '&:last-child': { pb: open ? 1 : 1.5 } }}
                onClick={() => toggleGroup(gk)}
              >
                <Stack direction="row" alignItems="flex-start" gap={1.25}>
                  <Box sx={{ mt: 0.5, flexShrink: 0 }}>{actorIcon(g.actorType)}</Box>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {/* Linha do ator e total */}
                    <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={0.5}>
                      <Typography variant="body2" sx={{ fontWeight: 800, fontSize: 14 }}>
                        {g.actorLabel}
                        {g.actorEmail ? (
                          <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 0.75 }}>
                            ({g.actorEmail})
                          </Typography>
                        ) : null}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                        {new Date(first.createdAt).toLocaleString('pt-BR')}
                        {g.logs.length > 1 && spanLabel(g.logs) ? ` · duração: ${spanLabel(g.logs)}` : ''}
                      </Typography>
                    </Stack>

                    {/* SUMÁRIO SEPARADO POR AÇÃO (solicitado pelo usuário) */}
                    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
                      <Chip
                        size="small"
                        label={`${g.logs.length} ${g.logs.length === 1 ? 'ação' : 'ações no total'}`}
                        sx={{ fontWeight: 800, fontSize: 12, height: 22 }}
                      />
                      {actionKeys.map((act) => (
                        <Chip
                          key={act}
                          size="small"
                          variant="outlined"
                          color={color(act)}
                          label={`${actionLabel(act)}: ${g.actionCounts[act]}`}
                          sx={{ fontWeight: 700, fontSize: 12, height: 22 }}
                        />
                      ))}
                    </Stack>
                  </Box>

                  <Tooltip title={open ? 'Recolher detalhes' : 'Expandir histórico'}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGroup(gk);
                      }}
                      sx={{ p: 0.5, alignSelf: 'center' }}
                    >
                      <ExpandMoreIcon
                        sx={{
                          transform: open ? 'rotate(180deg)' : 'none',
                          transition: 'transform .2s ease',
                        }}
                      />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </CardContent>

              {/* DETALHE EXPANDIDO DAS AÇÕES CONSECUTIVAS */}
              <Collapse in={open} timeout="auto" unmountOnExit>
                <Box
                  sx={{
                    px: { xs: 2, sm: 2.5 },
                    pb: 2,
                    pt: 1,
                    borderTop: '1px dashed',
                    borderColor: 'divider',
                    bgcolor: isDark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.015)',
                  }}
                >
                  <Typography variant="caption" sx={{ display: 'block', mb: 1, fontWeight: 700, color: 'text.secondary' }}>
                    Cronologia detalhada dos eventos:
                  </Typography>
                  <Stack spacing={1}>
                    {g.logs.map((l: any) => (
                      <Box
                        key={l.id}
                        sx={{
                          pl: 1.5,
                          borderLeft: '3px solid',
                          // c capturado 1× — duas chamadas de color() quebravam o
                          // narrowing do TS ('default' não indexa Palette) no CI.
                          borderColor: (t) => {
                            const c = color(l.action);
                            return c === 'default' ? t.palette.divider : t.palette[c].main;
                          },
                        }}
                      >
                        {logRow(l)}
                      </Box>
                    ))}
                  </Stack>
                </Box>
              </Collapse>
            </Card>
          );
        })}

        {groups.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 5, bgcolor: 'background.paper', borderRadius: '12px', border: '1px dashed', borderColor: 'divider' }}>
            <Typography variant="body1" sx={{ fontWeight: 700, color: 'text.secondary' }}>
              Nenhum evento localizado com os filtros selecionados.
            </Typography>
            {hasActiveFilters && (
              <Button size="small" variant="text" onClick={clearFilters} sx={{ mt: 1, textTransform: 'none', fontWeight: 700 }}>
                Limpar todos os filtros
              </Button>
            )}
          </Box>
        )}
      </Stack>

      {/* PAGINAÇÃO */}
      {d.count > 0 && (
        <Stack direction="row" spacing={2} justifyContent="center" alignItems="center" sx={{ mt: 3, mb: 1 }}>
          <Button
            size="small"
            variant="outlined"
            disabled={!hasPrev}
            onClick={() => setSkip(Math.max(0, skip - TAKE))}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700 }}
          >
            ← Anterior
          </Button>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
            {skip + 1}–{Math.min(skip + TAKE, d.count)} de {d.count}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            disabled={!hasNext}
            onClick={() => setSkip(skip + TAKE)}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700 }}
          >
            Próximo →
          </Button>
        </Stack>
      )}
    </Box>
  );
};
