import { Box, Stack, Typography, Button, Card, CardContent, Avatar } from '@mui/material';
import GroupsIcon from '@mui/icons-material/Groups';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { AppCard } from '../../AppCard';
import { photoUrlFor } from '../../../config';
import { Receipt, CalendarBlank, ChatCircle, Stethoscope } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { a11yClick, focusRingSx, COPPER } from './shared';
import { statusDot } from './shared';

/** View PAINEL (overview) do portal médico — extraída do DoctorPortal (P3 passo C, move-only). */
export const PortalOverview = ({ patients, invites, doctorName, onOpenPatient, onSetView, onLoadAllQ, onNewInvite, onSetPatAlertOnly }: {
  patients: any[]; invites: any[]; doctorName?: string; onOpenPatient: (p: any, tab?: string) => void; onSetView: (v: string) => void; onLoadAllQ: () => void; onNewInvite: () => void; onSetPatAlertOnly: (v: boolean) => void;
}) => {
          // Alfabética (2026-08-19): pedido do dono — organização previsível pro médico; a
          // prioridade clínica segue visível na linha de status (🟠 moderadas · exame há X).
          const alerts = [...patients].filter((p) => p.hasAlerts).sort((a, b) => (a.patient?.fullName ?? '').localeCompare(b.patient?.fullName ?? '', 'pt-BR', { sensitivity: 'base' }));
          // Mais perguntas primeiro (quem mais espera encabeça); desempate alfabético.
          const openQP = [...patients].filter((p) => (p.openQuestions ?? 0) > 0)
            .sort((a, b) => ((b.openQuestions ?? 0) - (a.openQuestions ?? 0)) || (a.patient?.fullName ?? '').localeCompare(b.patient?.fullName ?? '', 'pt-BR', { sensitivity: 'base' }));
          const pendingInv = invites.filter((i) => i.status === 'pending');
          const PRIORITY_LABEL: Record<string, string> = { importante: 'Prioridade alta', moderada: 'Alterações moderadas', leve: 'Alterações leves' };
          const relDays = (d?: string | null) => { if (!d) return null; const n = Math.floor((Date.now() - new Date(d).getTime()) / 86400000); return n < 1 ? 'hoje' : n < 30 ? `há ${n} ${n === 1 ? 'dia' : 'dias'}` : n < 365 ? `há ${Math.floor(n / 30)} ${Math.floor(n / 30) === 1 ? 'mês' : 'meses'}` : `há ${Math.floor(n / 365)} ${Math.floor(n / 365) === 1 ? 'ano' : 'anos'}`; };
          // Renovação: exame antigo (>1 ano) ou nenhum exame compartilhado — deixa o médico pedir atualização.
          const stale = patients
            .filter((p) => !p.hasAlerts && ((p.examsCount ?? 0) === 0 || (p.lastExamAt && Date.now() - new Date(p.lastExamAt).getTime() > 365 * 86400000)))
            .sort((a, b) => new Date(a.lastExamAt ?? 0).getTime() - new Date(b.lastExamAt ?? 0).getTime());
          const firstName = (doctorName || 'Doutor(a)').replace(/^Dr[aº.]*\s+/i, '').split(' ')[0];
          const hour = new Date().getHours();
          const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
          const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
          const row = (p: any, statusLine: ReactNode, onClick: () => void) => {
            const who = [p.age != null ? `${p.age}a` : null, p.sex === 'female' ? 'F' : p.sex === 'male' ? 'M' : null].filter(Boolean).join(' · ');
            return (
            <AppCard kind="interactive" key={p.shareId} role="button" tabIndex={0} {...a11yClick(onClick)} sx={{ ...focusRingSx }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Avatar src={p.patient?.id ? photoUrlFor(p.patient.id) : undefined} sx={{ bgcolor: 'rgba(32,178,170,.08)', color: 'primary.dark', fontWeight: 800, width: 44, height: 44, flexShrink: 0 }}>{p.patient?.fullName?.charAt(0)}</Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 14, color: 'text.primary', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.patient?.fullName}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {who}
                    {statusLine ? <>{who ? ' · ' : ''}{statusLine}</> : null}
                  </Typography>
                </Box>
                <ChevronRightIcon sx={{ color: 'text.disabled', fontSize: 20, flexShrink: 0 }} />
              </CardContent>
            </AppCard>
            );
          };
          return (
            <Stack spacing={2}>
              {/* HERO: saudação + manchete clínica do dia */}
              <Box sx={(t) => ({ borderRadius: '16px', overflow: 'hidden', background: `linear-gradient(135deg, ${t.palette.primary.main}, ${t.palette.primary.dark})`, color: t.palette.primary.contrastText, p: { xs: 2, md: 2.5 }, boxShadow: '0 10px 28px rgba(15,95,90,.25)' })}>
                <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: { xs: 19, md: 22 }, lineHeight: 1.2 }}>{greet}, Dr. {firstName} 👋</Typography>
                <Typography sx={{ opacity: 0.92, fontSize: 14, mt: 0.75 }}>
                  {alerts.length > 0
                    ? `${alerts.length} ${alerts.length === 1 ? 'paciente com valores alterados' : 'pacientes com valores alterados'}${openQP.length ? ` · ${openQP.length} ${openQP.length === 1 ? 'pergunta em aberto' : 'perguntas em aberto'}` : ''}`
                    : openQP.length > 0
                      ? `${openQP.length} ${openQP.length === 1 ? 'pergunta aguardando resposta' : 'perguntas aguardando resposta'}`
                      : 'Tudo em ordem — nenhum alerta crítico no momento ✅'}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.75, display: 'block', mt: 0.5, textTransform: 'capitalize' }}>{today}</Typography>
              </Box>

              {/* TILES: números do consultório (cada um navega) */}
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
                {([
                  { label: 'Pacientes', value: patients.length, color: '#178f89', onClick: () => onSetView('patients'), icon: <GroupsIcon /> },
                  { label: 'Com alerta', value: alerts.length, color: '#ef4444', onClick: () => { onSetPatAlertOnly(true); onSetView('patients'); }, icon: <WarningAmberIcon /> },
                  { label: 'Perguntas abertas', value: patients.reduce((n, p) => n + (p.openQuestions ?? 0), 0), color: '#b45309', onClick: () => { onSetView('questions'); onLoadAllQ(); }, icon: <QuestionAnswerIcon /> },
                  { label: 'Convites pendentes', value: pendingInv.length, color: '#c2410c', onClick: () => onSetView('invites'), icon: <PersonAddAlt1Icon /> },
                ] as const).map((tile) => (
                  <AppCard kind="interactive" key={tile.label} role="button" tabIndex={0} {...a11yClick(tile.onClick)} sx={{ ...focusRingSx }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Box component="span" sx={{ display: 'inline-flex', color: tile.color, '& svg': { fontSize: 18 } }}>{tile.icon}</Box>
                        <Typography sx={{ fontWeight: 800, fontSize: 22, color: tile.color, lineHeight: 1.1 }}>{tile.value}</Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">{tile.label}</Typography>
                    </CardContent>
                  </AppCard>
                ))}
              </Box>

              {/* FILA DE ATENÇÃO: alfabética (decisão do dono), com o PORQUÊ e ação de 1 clique */}
              {alerts.length > 0 && (
                <Box>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 15, color: 'text.primary' }}><Stethoscope size={18} weight="duotone" color={COPPER.deep} />Precisam de atenção agora</Stack>
                    <Button size="small" onClick={() => onSetView('patients')} sx={{ textTransform: 'none', fontWeight: 700, color: 'primary.dark', borderRadius: '999px' }}>Ver todos</Button>
                  </Stack>
                  <Stack spacing={1.25}>
                    {alerts.slice(0, 4).map((p) => row(
                      p,
                      <>{statusDot(p.maxPriority === 'importante' ? '#ef4444' : p.maxPriority === 'moderada' ? '#f59e0b' : '#eab308')} {PRIORITY_LABEL[p.maxPriority] ?? 'Com alerta'}{p.openQuestions ? ` · ${p.openQuestions} em aberto` : ''}{p.lastExamAt ? ` · exame ${relDays(p.lastExamAt)}` : ''}</>,
                      () => onOpenPatient(p, 'alterados'),
                    ))}
                    {alerts.length > 4 && (
                      <Button size="small" variant="outlined" onClick={() => onSetView('patients')} sx={{ alignSelf: 'center', borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>
                        {`+${alerts.length - 4} outro${alerts.length - 4 > 1 ? 's' : ''} com alerta`}
                      </Button>
                    )}
                  </Stack>
                </Box>
              )}

              {/* PERGUNTAS EM ABERTO: resposta rápida */}
              {openQP.length > 0 && (
                <Box>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 15, color: 'text.primary' }}><ChatCircle size={18} weight="duotone" color={COPPER.deep} />Perguntas aguardando você</Stack>
                    <Button size="small" onClick={() => { onSetView('questions'); onLoadAllQ(); }} sx={{ textTransform: 'none', fontWeight: 700, color: 'primary.dark', borderRadius: '999px' }}>Inbox</Button>
                  </Stack>
                  <Stack spacing={1.25}>
                    {openQP.slice(0, 3).map((p) => row(p, `${p.openQuestions} em aberto`, () => onOpenPatient(p, 'questions')))}
                    {/* Escala c/ 50 pacientes: slice 3 + escape pro inbox (mesmo padrão do
                        bloco "Precisam de atenção" — antes a lista simplesmente engolia a tela). */}
                    {openQP.length > 3 && (
                      <Button size="small" variant="outlined" onClick={() => { onSetView('questions'); onLoadAllQ(); }} sx={{ alignSelf: 'center', borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>
                        {`+${openQP.length - 3} paciente${openQP.length - 3 > 1 ? 's' : ''} aguardando resposta`}
                      </Button>
                    )}
                  </Stack>
                </Box>
              )}

              {/* RENOVAÇÃO: exames velhos ou inexistentes — oportunidade de pedido novo */}
              {stale.length > 0 && (
                <Box>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 15, color: 'text.primary' }}><CalendarBlank size={18} weight="duotone" color={COPPER.deep} />Exames para renovar</Stack>
                    <Button size="small" onClick={() => onSetView('patients')} sx={{ textTransform: 'none', fontWeight: 700, color: 'primary.dark', borderRadius: '999px' }}>Ver todos</Button>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Sem exame novo há mais de 1 ano (ou nenhum compartilhado) — peça uma atualização na próxima consulta.</Typography>
                  <Stack spacing={1.25}>
                    {stale.slice(0, 3).map((p) => row(p, (p.examsCount ?? 0) === 0 ? 'sem exames compartilhados' : `último exame ${relDays(p.lastExamAt)}`, () => onOpenPatient(p)))}
                    {stale.length > 3 && (
                      <Button size="small" variant="outlined" onClick={() => onSetView('patients')} sx={{ alignSelf: 'center', borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>
                        {`+${stale.length - 3} para renovar`}
                      </Button>
                    )}
                  </Stack>
                </Box>
              )}

              {/* EMPTY: sem pacientes ainda → funil de convite */}
              {patients.length === 0 && (
                <AppCard><CardContent><Box sx={{ textAlign: 'center', py: 4 }}>
                  <Box sx={{ fontSize: 56, mb: 1.5, opacity: 0.4 }}>🩺</Box>
                  <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 17, mb: 0.5 }}>Seu painel começa com 1 paciente</Typography>
                  <Typography color="text.secondary" sx={{ mb: 2, maxWidth: 380, mx: 'auto' }}>Convide pelo WhatsApp — ele instala o app, sobe os exames e você acompanha tudo aqui, na hora que ele chegar.</Typography>
                  <Button variant="contained" startIcon={<PersonAddAlt1Icon />} onClick={() => onNewInvite()} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Convidar paciente</Button>
                </Box></CardContent></AppCard>
              )}
            </Stack>
          );
        
};
