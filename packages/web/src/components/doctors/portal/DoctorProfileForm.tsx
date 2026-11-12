import { useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  Button,
  Card,
  CardContent,
  TextField,
  MenuItem,
  Alert,
  CircularProgress,
  Avatar,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import { API_URL, doctorPhotoUrl } from '../../../config';
import { PhoneField } from '../../PhoneField';
import { PhotoUpload } from '../../PhotoUpload';
import { MfaSetupCard } from '../../mfa/MfaSetupCard';
import { SPECIALTIES } from '../../../utils/medicalData';
import { tealText } from '../../../theme';
import { Badge } from '@/components/reui/badge';
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import { FieldLabelWithHint } from '@/components/reui/field-label';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';

/** Empty state compacto das views do portal. */
export const Empty = ({ label, icon = '📭' }: { label: string; icon?: string }) => (
  <Card
    sx={{
      borderRadius: '20px',
      border: '1px solid',
      borderColor: 'divider',
      boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
    }}
  >
    <CardContent>
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Box sx={{ fontSize: 44, mb: 1 }}>{icon}</Box>
        <Typography color="text.secondary">{label}</Typography>
      </Box>
    </CardContent>
  </Card>
);

// Consulta particular (23/10/26): máscara simples de centavos — o médico digita
// "15000" e vê "150,00". Sem biblioteca: strip não-dígitos → int → centavos.
const centsToBrl = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const brlToCents = (s: string) => {
  const d = String(s ?? '').replace(/\D/g, '');
  return d ? Number(d) : 0;
};

/** Formulário "Meu perfil" do médico (dados profissionais + perfil público + foto + MFA) com padrão ReUI profile-3. */
export const DoctorProfileForm = ({
  token,
  doctor,
  onBack,
  onSaved,
  onPhoto,
  photoVer,
  isPremium = true,
}: {
  token: string;
  doctor: any;
  onBack: () => void;
  onSaved: (d: any) => void;
  onPhoto: () => void;
  photoVer: number;
  isPremium?: boolean;
}) => {
  useReuiThemeSync();
  const [name, setName] = useState(doctor?.name ?? '');
  const [spec, setSpec] = useState(doctor?.specialty ?? '');
  const [email, setEmail] = useState(doctor?.email ?? '');
  // Perfil público (visto pelo paciente ao abrir o médico na lista dele)
  const [phone, setPhone] = useState(doctor?.phone ?? '');
  const [clinicName, setClinicName] = useState(doctor?.clinicName ?? '');
  const [clinicCity, setClinicCity] = useState(doctor?.clinicCity ?? '');
  const [bio, setBio] = useState(doctor?.bio ?? '');
  // Consulta particular: valor PADRÃO da teleconsulta (centavos ↔ "R$ X,XX" na máscara).
  const [price, setPrice] = useState(
    doctor?.consultPriceCents ? centsToBrl(Number(doctor.consultPriceCents)) : ''
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch(`${API_URL}/doctor/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name,
          specialty: spec,
          email,
          consultPriceCents: brlToCents(price) || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha ao salvar');
      // Perfil público (telefone/consultório/cidade/bio) — endpoint dedicado, visto pelo paciente.
      const r2 = await fetch(`${API_URL}/doctor/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone, clinicName, clinicCity, bio }),
      });
      const d2 = await r2.json();
      if (!r2.ok) throw new Error(d2.error || 'Falha ao salvar perfil público');
      onSaved({ ...d2.doctor, consultPriceCents: d?.doctor?.consultPriceCents });
      setMsg({ type: 'ok', text: 'Perfil atualizado!' });
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Button
            size="small"
            onClick={onBack}
            sx={{
              color: (t) => tealText(t.palette.mode),
              textTransform: 'none',
              fontWeight: 700,
              minWidth: 0,
            }}
          >
            ← Voltar
          </Button>
          <Typography sx={{ fontWeight: 800, color: 'text.primary' }}>
            Meu Perfil Profissional
          </Typography>
        </Stack>
        <Badge variant="primary-light" size="sm">
          CRM {doctor?.crm}
        </Badge>
      </Stack>

      {/* Card Identidade Visual + Foto */}
      <Card
        sx={{
          borderRadius: '20px',
          mb: 2.5,
          background:
            'radial-gradient(circle at 10% 20%, rgba(32,178,170,0.12) 0%, rgba(32,178,170,0.03) 100%)',
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: '0 8px 24px rgba(0,0,0,0.04)',
        }}
      >
        <CardContent sx={{ p: 2.5 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} alignItems={{ xs: 'flex-start', sm: 'center' }}>
            {isPremium ? (
              <PhotoUpload
                endpoint={`${API_URL}/doctor/me/photo`}
                authToken={token}
                fallback={doctor?.name?.charAt(0)}
                src={doctor?.photoUrl ? doctorPhotoUrl(doctor.id, photoVer) : undefined}
                onUploaded={onPhoto}
                size={84}
                hideLabel
              />
            ) : (
              <Box sx={{ position: 'relative', width: 84, height: 84, flexShrink: 0 }}>
                <Avatar
                  src={doctor?.photoUrl ? doctorPhotoUrl(doctor.id, photoVer) : undefined}
                  sx={{
                    width: 84,
                    height: 84,
                    bgcolor: 'rgba(32,178,170,.15)',
                    color: (t) => tealText(t.palette.mode),
                    fontSize: 32,
                    fontWeight: 800,
                    borderRadius: '20px',
                  }}
                >
                  {doctor?.name?.charAt(0) ?? '?'}
                </Avatar>
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: -4,
                    right: -4,
                    bgcolor: '#0f5f5a',
                    color: '#fff',
                    borderRadius: '999px',
                    px: 1,
                    py: 0.3,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.4,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.22)',
                    border: '2px solid',
                    borderColor: 'background.paper',
                  }}
                >
                  <LockIcon sx={{ fontSize: 12, color: '#5fc9c3' }} />
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: '#fff',
                      lineHeight: 1,
                      letterSpacing: '0.04em',
                    }}
                  >
                    PRO
                  </Typography>
                </Box>
              </Box>
            )}
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <div className="flex flex-wrap items-center gap-2">
                <Typography sx={{ fontWeight: 800, color: 'text.primary', fontSize: '1.15rem' }}>
                  {name || 'Médico'}
                </Typography>
                <Badge variant={isPremium ? 'success-light' : 'outline'} size="xs">
                  {isPremium ? 'Dr. Exame Pro' : 'Plano Gratuito'}
                </Badge>
              </div>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', fontWeight: 600, mt: 0.25 }}
              >
                CRM {doctor?.crm}
                {spec ? ` • ${spec}` : ''}
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>
                {isPremium
                  ? 'Toque na câmera para atualizar sua foto exibida aos pacientes.'
                  : 'Foto de perfil é exclusiva do Dr. Exame Pro.'}
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Box sx={{ mt: 2, mb: 2.5 }}>
        <MfaSetupCard apiBase={`${API_URL}/doctor`} authToken={token} />
      </Box>

      {/* ReUI profile-3: Credenciais + Perfil Público em Frame */}
      <Frame>
        <FrameHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <VerifiedUserOutlinedIcon sx={{ fontSize: 19, color: (t) => tealText(t.palette.mode) }} />
              <FrameTitle>Credenciais & Dados Profissionais</FrameTitle>
            </div>
            <Badge variant="primary-light" size="xs">
              Identidade Médica
            </Badge>
          </div>
          <FrameDescription>
            Mantenha seus dados profissionais e honorários de teleconsulta sempre atualizados.
          </FrameDescription>
        </FrameHeader>

        <FramePanel className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <FieldLabelWithHint
                label="Nome Completo"
                hint="Exibido no cabeçalho das teleconsultas, receitas e respostas aos pacientes."
              />
              <TextField
                value={name}
                onChange={(e) => setName(e.target.value)}
                size="small"
                fullWidth
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
              />
            </div>

            <div>
              <FieldLabelWithHint
                label="Especialidade Principal"
                hint="Ajuda pacientes a identificarem sua área de atuação na vitrine médica."
              />
              <TextField
                select
                value={spec}
                onChange={(e) => setSpec(e.target.value)}
                size="small"
                fullWidth
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
              >
                <MenuItem value="">
                  <em>Selecione…</em>
                </MenuItem>
                {SPECIALTIES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>
            </div>

            <div>
              <FieldLabelWithHint
                label="Registro CRM"
                hint="O CRM faz parte da sua identidade profissional verificada e não pode ser alterado diretamente."
                addon={
                  <Badge variant="success-light" size="xs">
                    Verificado
                  </Badge>
                }
              />
              <TextField
                value={doctor?.crm ?? ''}
                disabled
                size="small"
                fullWidth
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
              />
            </div>

            <div>
              <FieldLabelWithHint
                label="CPF"
                hint="Bloqueado após verificação de segurança. Correções somente via suporte auditado."
                addon={
                  <Badge variant="info-light" size="xs">
                    Auditado
                  </Badge>
                }
              />
              <TextField
                value={doctor?.cpfMasked ?? 'Não cadastrado'}
                disabled
                size="small"
                fullWidth
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
              />
            </div>

            <div>
              <FieldLabelWithHint
                label="E-mail Profissional"
                hint="Usado para login, alertas de exames compartilhados e recuperação de conta."
              />
              <TextField
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                size="small"
                fullWidth
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
              />
            </div>

            <div>
              <FieldLabelWithHint
                label="Valor da Consulta Particular (R$)"
                hint="Pré-preenchido ao agendar teleconsulta com cobrança PIX. Deixe vazio para consultas sem cobrança."
                addon={
                  <Badge variant="warning-light" size="xs">
                    PIX / Teleconsulta
                  </Badge>
                }
              />
              <TextField
                value={price}
                onChange={(e) => setPrice(centsToBrl(brlToCents(e.target.value)))}
                size="small"
                fullWidth
                inputProps={{ inputMode: 'numeric', placeholder: 'ex.: 150,00' }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
              />
            </div>
          </div>

          <div className="border-t border-border pt-5">
            <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <PublicOutlinedIcon sx={{ fontSize: 18, color: (t) => tealText(t.palette.mode) }} />
                <span className="text-foreground text-sm font-bold">
                  Perfil Público (visível aos seus pacientes)
                </span>
              </div>
              <Badge variant="outline" size="xs">
                Cartão de Visitas Digital
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <FieldLabelWithHint
                  label="Telefone / WhatsApp de Agendamento"
                  hint="Ativa o botão 'Agendar no WhatsApp' diretamente no seu cartão médico para o paciente."
                />
                <PhoneField
                  label=""
                  value={phone}
                  onChange={setPhone}
                  size="small"
                  fullWidth
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                />
              </div>

              <div>
                <FieldLabelWithHint
                  label="Consultório / Clínica"
                  hint="Nome do hospital, clínica ou consultório onde você realiza atendimentos."
                />
                <TextField
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  size="small"
                  fullWidth
                  placeholder="Ex.: Clínica Vida & Saúde"
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                />
              </div>

              <div className="md:col-span-2">
                <FieldLabelWithHint
                  label="Cidade - UF"
                  hint="Localização principal do seu atendimento presencial ou base de telemedicina."
                />
                <TextField
                  value={clinicCity}
                  onChange={(e) => setClinicCity(e.target.value)}
                  size="small"
                  fullWidth
                  placeholder="Ex.: São Paulo - SP"
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                />
              </div>

              <div className="md:col-span-2">
                <FieldLabelWithHint
                  label="Apresentação & Formação (Mini-Bio)"
                  hint="Resumo da sua trajetória, RQE, residência e foco clínico (máximo de 500 caracteres)."
                  addon={
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {bio.length}/500
                    </span>
                  }
                />
                <TextField
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  size="small"
                  fullWidth
                  multiline
                  minRows={3}
                  placeholder="Conte brevemente sua formação, áreas de interesse e abordagem clínica…"
                  inputProps={{ maxLength: 500 }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                />
              </div>
            </div>
          </div>

          {msg && (
            <Alert
              severity={msg.type === 'ok' ? 'success' : 'error'}
              sx={{ py: 0.5, borderRadius: '12px' }}
            >
              {msg.text}
            </Alert>
          )}
        </FramePanel>

        <FrameFooter className="sm:flex-row sm:items-center sm:justify-between">
          <span className="text-muted-foreground text-xs">
            As alterações refletem imediatamente no seu cartão público para pacientes.
          </span>
          <Button
            variant="contained"
            color="primary"
            onClick={save}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}
            sx={{
              borderRadius: '12px',
              textTransform: 'none',
              fontWeight: 800,
              px: 3.5,
              py: 1,
              width: { xs: '100%', sm: 'auto' },
              boxShadow: 'none',
            }}
          >
            {saving ? 'Salvando…' : 'Salvar perfil'}
          </Button>
        </FrameFooter>
      </Frame>
    </Box>
  );
};
