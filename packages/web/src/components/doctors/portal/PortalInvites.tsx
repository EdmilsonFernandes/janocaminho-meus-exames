import { Box, Stack, Typography, Button, Card, CardContent, Avatar, Chip } from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import { AppCard } from '../../AppCard';

export interface InviteItem { id: string; patientName?: string; phone?: string; email?: string; status: string; token: string; createdAt?: string; acceptedAt?: string }

/** View CONVITES do portal — extraída do monólito DoctorPortal (P3 passo B, move-only). */
export const PortalInvites = ({ invites, doctorName, onNewInvite, onCancel, linkFor, onSnackbar, onPrefill }: {
  invites: InviteItem[]; doctorName?: string; onNewInvite: (prefill?: Partial<InviteItem>) => void; onCancel: (id: string) => void; linkFor: (token: string) => string; onSnackbar: (msg: string, sev: 'success' | 'error') => void; onPrefill: (p: { name?: string; phone?: string; email?: string }) => void;
}) => {
          const pending = invites.filter((i) => i.status === 'pending');
          const accepted = invites.filter((i) => i.status === 'accepted');
          const expired = invites.filter((i) => i.status === 'expired');
          const relDate = (d?: string) => (d ? new Date(d).toLocaleDateString('pt-BR') : '');
          return (
            <>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 2 }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>Convites</Typography>
                  <Typography variant="caption" color="text.secondary">Convide pacientes — eles instalam o app e o compartilhamento já fica ativo.</Typography>
                </Box>
                <Button variant="contained" startIcon={<PersonAddAlt1Icon />} onClick={() => onNewInvite()} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, bgcolor: 'primary.main', boxShadow: 'none', '&:hover': { bgcolor: 'primary.dark' } }}>Convidar</Button>
              </Stack>
              <Stack direction="row" spacing={1.5} sx={{ mb: 2.5 }} useFlexGap flexWrap="wrap">
                {[['Pendentes', pending.length, '#c2410c'], ['Aceitos', accepted.length, '#047857'], ['Expirados', expired.length, '#94a3b8']].map(([l, n, c]) => (
                  <Box key={l as string} sx={{ flex: 1, minWidth: 100, p: 1.5, borderRadius: '12px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 22, color: c as string, lineHeight: 1.1 }}>{n as number}</Typography>
                    <Typography variant="caption" color="text.secondary">{l as string}</Typography>
                  </Box>
                ))}
              </Stack>

              {pending.length > 0 && (<Box sx={{ mb: 3 }}>
                <Typography sx={{ fontWeight: 800, mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}><InboxOutlinedIcon fontSize="small" sx={{ color: 'primary.main' }} />Aguardando aceite ({pending.length})</Typography>
                <Stack spacing={1.5}>
                  {pending.map((it) => {
                    const waBase = it.phone ? `https://wa.me/${it.phone.startsWith('55') ? '' : '55'}${it.phone}` : '';
                    const waMsg = waBase ? `${waBase}?text=${encodeURIComponent(`Olá! Aqui é ${doctorName || 'seu médico'}. Cadastre-se no app Meus Exames pra eu acompanhar seus exames: ${linkFor(it.token)}`)}` : '';
                    return (
                      <AppCard key={it.id}><CardContent>
                        <Stack direction="row" alignItems="center" spacing={1.5}>
                          <Avatar sx={{ bgcolor: 'rgba(234,88,12,.12)', color: '#c2410c', fontWeight: 800, width: 44, height: 44 }}>{it.patientName?.charAt(0)}</Avatar>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 800 }}>{it.patientName}</Typography>
                            <Typography variant="caption" color="text.secondary">{[it.phone, it.email, `enviado ${relDate(it.createdAt)}`].filter(Boolean).join(' · ')}</Typography>
                          </Box>
                          <Chip size="small" label="pendente" sx={{ height: 20, bgcolor: 'rgba(234,88,12,.12)', color: '#c2410c', fontWeight: 700 }} />
                        </Stack>
                        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} useFlexGap flexWrap="wrap">
                          <Button size="small" variant="contained" startIcon={<WhatsAppIcon />} disabled={!waMsg} onClick={() => waMsg && window.open(waMsg, '_blank')} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, bgcolor: '#25D366', color: '#fff', boxShadow: 'none', '&:hover': { bgcolor: '#047857' } }}>WhatsApp</Button>
                          <Button size="small" variant="outlined" onClick={() => { try { navigator.clipboard?.writeText(linkFor(it.token)); } catch {} onSnackbar('Link copiado!', 'success'); }} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Copiar link</Button>
                          <Button size="small" onClick={() => onCancel(it.id)} sx={{ borderRadius: '999px', textTransform: 'none', color: 'error.main', fontWeight: 700 }}>Cancelar</Button>
                        </Stack>
                      </CardContent></AppCard>
                    );
                  })}
                </Stack>
              </Box>)}

              {accepted.length > 0 && (<Box sx={{ mb: 3 }}>
                <Typography sx={{ fontWeight: 800, mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}><CheckCircleOutlinedIcon fontSize="small" sx={{ color: 'success.main' }} />Aceitos ({accepted.length})</Typography>
                <Stack spacing={1}>
                  {accepted.map((it) => (
                    <AppCard key={it.id}><CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25 }}>
                      <Avatar sx={{ bgcolor: 'rgba(22,163,74,.12)', color: '#047857', fontWeight: 800, width: 44, height: 44 }}>{it.patientName?.charAt(0)}</Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800 }}>{it.patientName}</Typography>
                        <Typography variant="caption" color="text.secondary">Conta criada em {relDate(it.acceptedAt)} · já nos seus pacientes</Typography>
                      </Box>
                      <Chip size="small" label="ativo" sx={{ height: 20, bgcolor: 'rgba(22,163,74,.12)', color: '#047857', fontWeight: 700 }} />
                    </CardContent></AppCard>
                  ))}
                </Stack>
              </Box>)}

              {expired.length > 0 && (<Box>
                <Typography sx={{ fontWeight: 800, mb: 1, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.75 }}><ScheduleOutlinedIcon fontSize="small" />Expirados / cancelados ({expired.length})</Typography>
                <Stack spacing={1}>
                  {expired.map((it) => (
                    <AppCard key={it.id} sx={{ opacity: 0.75 }}><CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25 }}>
                      <Avatar sx={{ bgcolor: 'action.hover', color: 'text.secondary', fontWeight: 800, width: 44, height: 44 }}>{it.patientName?.charAt(0)}</Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontWeight: 700 }}>{it.patientName}</Typography></Box>
                      <Button size="small" variant="outlined" startIcon={<PersonAddAlt1Icon />} onClick={() => onPrefill({ name: it.patientName, phone: it.phone || '', email: it.email || '' })} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, borderColor: 'primary.main', color: 'primary.dark' }}>Reenviar</Button>
                    </CardContent></AppCard>
                  ))}
                </Stack>
              </Box>)}

              {invites.length === 0 && (
                <AppCard><CardContent><Box sx={{ textAlign: 'center', py: 5 }}>
                  <Box sx={{ fontSize: 56, mb: 1.5, opacity: 0.4 }}>📨</Box>
                  <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 17, mb: 0.5 }}>Nenhum convite ainda</Typography>
                  <Typography color="text.secondary">Toque em “Convidar” pra enviar o app a um paciente — ele instala e vocês já ficam conectados.</Typography>
                </Box></CardContent></AppCard>
              )}
            </>
          );
        
};
