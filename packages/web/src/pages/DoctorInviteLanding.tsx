import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, Button, TextField, Stack,
  Alert, CircularProgress, Chip, MenuItem, Select, FormControl, InputLabel,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import MedicalServicesRoundedIcon from '@mui/icons-material/MedicalServicesRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import { API_URL } from '../config';

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export const DoctorInviteLandingPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [inviteData, setInviteData] = useState<{ patientName: string; scopes: string[]; expiresAt: string } | null>(null);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);

  // Modo: novo cadastro ou médico já cadastrado
  const [mode, setMode] = useState<'register' | 'login'>('register');

  // Form State
  const [name, setName] = useState('');
  const [crm, setCrm] = useState('');
  const [crmUf, setCrmUf] = useState('SP');
  const [specialty, setSpecialty] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setErrorStatus('Token de convite não informado na URL.');
      setLoading(false);
      return;
    }

    const checkToken = async () => {
      setLoading(true);
      setErrorStatus(null);
      try {
        const res = await fetch(`${API_URL}/public/doctor-invite/${token}`);
        const data = await res.json();
        if (res.ok && data.valid) {
          setInviteData(data);
        } else {
          setErrorStatus(data.message || 'Este convite é inválido, expirou ou já foi utilizado.');
        }
      } catch {
        setErrorStatus('Falha de conexão ao verificar o convite. Tente novamente.');
      } finally {
        setLoading(false);
      }
    };

    void checkToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const endpoint = mode === 'register'
        ? `${API_URL}/public/doctor-invite/${token}/register`
        : `${API_URL}/public/doctor-invite/${token}/accept`;

      const body = mode === 'register'
        ? { name, crm, crmUf, specialty, email, password }
        : { email, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Erro ao processar convite.');
      }

      // Sucesso! Salva sessão médica e redireciona para o portal médico
      if (data.token) {
        localStorage.setItem('doctorToken', data.token);
        if (data.doctor) {
          localStorage.setItem('doctorData', JSON.stringify(data.doctor));
        }
        window.dispatchEvent(new Event('doctor-auth-changed'));
        navigate(data.patientId ? `/doctor?patientId=${data.patientId}` : '/doctor');
      }
    } catch (err: any) {
      setFormError(err.message || 'Erro ao vincular.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
        <CircularProgress size={36} sx={{ color: '#0f766e' }} />
      </Box>
    );
  }

  if (errorStatus || !inviteData) {
    return (
      <Box sx={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
        <Card variant="outlined" sx={{ maxWidth: 500, width: '100%', borderRadius: '24px', p: 3, textAlign: 'center' }}>
          <Box sx={{ fontSize: 48, mb: 1.5 }}>⚠️</Box>
          <Typography sx={{ fontWeight: 800, fontSize: 20, mb: 1, color: 'text.primary' }}>
            Convite Indisponível
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
            {errorStatus || 'Não foi possível validar este link.'}
          </Typography>
          <Button
            variant="contained"
            onClick={() => navigate('/doctor')}
            sx={{
              bgcolor: '#0f766e',
              borderRadius: '12px',
              fontWeight: 700,
              textTransform: 'none',
              px: 3,
              '&:hover': { bgcolor: '#0d9488' },
            }}
          >
            Acessar Portal do Médico
          </Button>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', py: { xs: 3, sm: 6 }, px: 2 }}>
      <Box sx={{ maxWidth: 560, mx: 'auto' }}>
        <Card
          variant="outlined"
          sx={{
            borderRadius: '24px',
            p: { xs: 2.5, sm: 4 },
            bgcolor: '#ffffff',
            boxShadow: '0 16px 36px -6px rgba(15, 23, 42, 0.08)',
            border: '1px solid #e2e8f0',
          }}
        >
          {/* Badge VIP de Paciente */}
          <Chip
            icon={<CheckCircleRoundedIcon sx={{ fontSize: '15px !important', color: '#065f46 !important' }} />}
            label="Convite VIP de Paciente Ativo"
            sx={{
              mb: 2,
              height: 28,
              fontSize: 12,
              fontWeight: 700,
              bgcolor: '#ecfdf5',
              color: '#065f46',
              border: '1px solid #a7f3d0',
            }}
          />

          <Typography sx={{ fontWeight: 800, fontSize: { xs: 20, sm: 24 }, color: '#0f172a', lineHeight: 1.25, mb: 1 }}>
            {inviteData.patientName} compartilhou o prontuário com você!
          </Typography>

          <Typography variant="body2" sx={{ color: '#64748b', lineHeight: 1.6, mb: 3 }}>
            Acesse exames laboratoriais digitalizados com OCR inteligente, comparativo direto de biomarcadores e evolução temporal completa em um clique.
          </Typography>

          {/* Toggle entre Cadastro Rápido e Login */}
          <Stack direction="row" spacing={1} sx={{ mb: 3, p: 0.5, bgcolor: '#f1f5f9', borderRadius: '12px' }}>
            <Button
              fullWidth
              size="small"
              onClick={() => { setMode('register'); setFormError(null); }}
              sx={{
                borderRadius: '8px',
                py: 1,
                fontSize: 13,
                fontWeight: 700,
                textTransform: 'none',
                bgcolor: mode === 'register' ? '#ffffff' : 'transparent',
                color: mode === 'register' ? '#0f766e' : '#64748b',
                boxShadow: mode === 'register' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                '&:hover': { bgcolor: mode === 'register' ? '#ffffff' : 'transparent' },
              }}
            >
              Novo cadastro (20 seg)
            </Button>
            <Button
              fullWidth
              size="small"
              onClick={() => { setMode('login'); setFormError(null); }}
              sx={{
                borderRadius: '8px',
                py: 1,
                fontSize: 13,
                fontWeight: 700,
                textTransform: 'none',
                bgcolor: mode === 'login' ? '#ffffff' : 'transparent',
                color: mode === 'login' ? '#0f766e' : '#64748b',
                boxShadow: mode === 'login' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                '&:hover': { bgcolor: mode === 'login' ? '#ffffff' : 'transparent' },
              }}
            >
              Já tenho conta
            </Button>
          </Stack>

          {formError && (
            <Alert severity="error" sx={{ mb: 2.5, borderRadius: '12px', fontSize: 13 }}>
              {formError}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              {mode === 'register' ? (
                <>
                  <TextField
                    label="Nome Completo do Médico"
                    placeholder="Dr(a). Seu Nome"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    fullWidth
                    size="small"
                  />

                  <Stack direction="row" spacing={1.5}>
                    <TextField
                      label="CRM (Apenas números)"
                      placeholder="Ex: 142890"
                      value={crm}
                      onChange={(e) => setCrm(e.target.value)}
                      required
                      fullWidth
                      size="small"
                    />
                    <FormControl size="small" sx={{ width: 110 }}>
                      <InputLabel>UF</InputLabel>
                      <Select value={crmUf} label="UF" onChange={(e) => setCrmUf(e.target.value)}>
                        {UFS.map((uf) => (
                          <MenuItem key={uf} value={uf}>{uf}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Stack>

                  <TextField
                    label="Especialidade Principal"
                    placeholder="Ex: Endocrinologia, Clínica Médica..."
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    fullWidth
                    size="small"
                  />

                  <TextField
                    label="E-mail Profissional"
                    placeholder="doutor@consultorio.com.br"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    fullWidth
                    size="small"
                  />

                  <TextField
                    label="Crie uma Senha Segura"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    fullWidth
                    size="small"
                  />
                </>
              ) : (
                <>
                  <TextField
                    label="E-mail Cadastrado"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    fullWidth
                    size="small"
                  />

                  <TextField
                    label="Senha"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    fullWidth
                    size="small"
                  />
                </>
              )}

              <Button
                type="submit"
                variant="contained"
                disabled={submitting}
                startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <LinkRoundedIcon />}
                sx={{
                  mt: 1,
                  py: 1.5,
                  borderRadius: '12px',
                  fontWeight: 800,
                  fontSize: 14.5,
                  textTransform: 'none',
                  background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
                  boxShadow: '0 4px 14px rgba(13, 148, 136, 0.35)',
                  '&:hover': { background: 'linear-gradient(135deg, #115e59 0%, #0f766e 100%)' },
                }}
              >
                {submitting ? 'Vinculando...' : `Ativar Vínculo & Abrir Prontuário do ${inviteData.patientName.split(' ')[0]}`}
              </Button>
            </Stack>
          </Box>

          <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: '#94a3b8', mt: 3 }}>
            🔒 Acesso criptografado e seguro em conformidade com as Resoluções do CFM e LGPD da Saúde.
          </Typography>
        </Card>
      </Box>
    </Box>
  );
};
