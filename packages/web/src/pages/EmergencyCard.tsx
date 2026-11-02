import { useEffect, useState } from 'react';
import { Button, Skeleton, Stack } from '@mui/material';
import MedicationIcon from '@mui/icons-material/Medication';
import CallIcon from '@mui/icons-material/Call';
import PrintIcon from '@mui/icons-material/Print';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import HealthAndSafetyOutlinedIcon from '@mui/icons-material/HealthAndSafetyOutlined';
import SmartphoneOutlinedIcon from '@mui/icons-material/SmartphoneOutlined';
import { useNavigate } from 'react-router-dom';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { printPage } from '../utils/nativeDoc';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import {
  Frame,
  FramePanel,
  FrameHeader,
  FrameTitle,
  FrameDescription,
  FrameFooter,
} from '@/components/reui/frame';
import { Badge as ReuiBadge } from '@/components/reui/badge';
import { IconTile } from '@/components/reui/icon-tile';
import { Alert, AlertTitle, AlertDescription } from '@/components/reui/alert';
import { SettingRow } from '@/components/reui/setting-row';
import { SirenEmergencyIcon } from '@/components/reui/icons';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';

interface ActiveMed {
  id: string;
  name: string;
  dosage?: string | null;
  frequency?: string | null;
  active: boolean;
}

export const EmergencyCardPage = () => {
  useReuiThemeSync();
  const navigate = useNavigate();
  const [pid] = useSelectedPatient();
  const [patient, setPatient] = useState<any>(null);
  const [meds, setMeds] = useState<ActiveMed[]>([]);

  useEffect(() => {
    if (!pid) return;
    const h = { Authorization: `Bearer ${token()}` };
    fetch(`${API_URL}/patients/${pid}`, { headers: h })
      .then((r) => (r.ok ? r.json() : null))
      .then(setPatient)
      .catch(() => {});
    fetch(`${API_URL}/medications?patientId=${pid}`, { headers: h })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (Array.isArray(rows)) {
          setMeds(rows.filter((m: ActiveMed) => m.active !== false));
        }
      })
      .catch(() => {});
  }, [pid]);

  const age = patient?.dateOfBirth
    ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  const fmtDob = patient?.dateOfBirth
    ? new Date(`${String(patient.dateOfBirth).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')
    : null;

  return (
    <PageContainer width="narrow" sx={{ pb: { xs: 10, sm: 5 } }}>
      <PageHeader
        icon={<SirenEmergencyIcon className="size-6 text-red-600 dark:text-red-400" />}
        title="Ficha Médica de Emergência"
        subtitle="Resumo rápido para pronto-atendimento, socorristas e viagens — sincronizado automaticamente com seu perfil e medicamentos ativos."
      />

      <div className="dx-island space-y-4">
        {/* Dica do atalho nativo Android (long-press no ícone do app) */}
        <Alert variant="info" role="status">
          <SmartphoneOutlinedIcon sx={{ fontSize: 16 }} />
          <AlertTitle>Atalho rápido na tela inicial do celular</AlertTitle>
          <AlertDescription>
            No Android, segure o dedo por 1 segundo sobre o ícone do app <strong>Dr. Exame</strong> para abrir esta Ficha de Emergência direto da tela inicial.
          </AlertDescription>
        </Alert>

        {/* Discagem rápida de emergência (1 toque no mobile) */}
        <Frame>
          <FrameHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <FrameTitle>Acionamento Rápido (1 Toque)</FrameTitle>
                <FrameDescription>
                  Ligue imediatamente para serviços de socorro ou para o telefone registrado no perfil.
                </FrameDescription>
              </div>
              <ReuiBadge variant="destructive-light" size="xs">
                SOS 24h
              </ReuiBadge>
            </div>
          </FrameHeader>
          <FramePanel className="p-3.5 sm:p-4">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <a
                href="tel:192"
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm font-bold text-destructive no-underline transition-colors hover:bg-destructive/15"
              >
                <CallIcon sx={{ fontSize: 18 }} />
                SAMU 192
              </a>
              <a
                href="tel:193"
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm font-bold text-amber-800 dark:text-amber-300 no-underline transition-colors hover:bg-amber-500/15"
              >
                <CallIcon sx={{ fontSize: 18 }} />
                Bombeiros 193
              </a>
              {patient?.phone ? (
                <a
                  href={`tel:${String(patient.phone).replace(/\D/g, '')}`}
                  className="col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm font-bold text-primary no-underline transition-colors hover:bg-primary/15 sm:col-span-1"
                >
                  <CallIcon sx={{ fontSize: 18 }} />
                  Contato ({patient.phone})
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate('/perfil')}
                  className="col-span-2 flex min-h-12 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card px-3 py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground sm:col-span-1"
                >
                  + Cadastrar telefone no perfil
                </button>
              )}
            </div>
          </FramePanel>
        </Frame>

        {/* Passaporte Clínico / Carteirinha de Emergência */}
        <Frame>
          <FrameHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <IconTile variant="soft" size="default" className="text-destructive">
                  <SirenEmergencyIcon className="size-5" />
                </IconTile>
                <div>
                  <FrameTitle>CARTÃO DE EMERGÊNCIA</FrameTitle>
                  <FrameDescription>Identificação médica essencial · Dr. Exame</FrameDescription>
                </div>
              </div>
              <ReuiBadge variant="primary-light" size="sm">
                Passaporte Clínico
              </ReuiBadge>
            </div>
          </FrameHeader>

          <FramePanel className="p-0">
            {patient ? (
              <div className="divide-y divide-border/70">
                {/* Bloco 1: Identificação do Paciente */}
                <div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="m-0 text-lg font-extrabold tracking-tight text-foreground">
                        {patient.fullName}
                      </h2>
                      {age != null && (
                        <ReuiBadge variant="outline" size="sm" className="tabular-nums">
                          {age} anos
                        </ReuiBadge>
                      )}
                      {patient.sex && (
                        <ReuiBadge variant="outline" size="xs">
                          {patient.sex === 'M' ? 'Masculino' : patient.sex === 'F' ? 'Feminino' : patient.sex}
                        </ReuiBadge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
                      {fmtDob && <span>Nascimento: {fmtDob}</span>}
                      {patient.cpf && <span>CPF: {patient.cpf}</span>}
                      {patient.bloodType && (
                        <span className="inline-flex items-center gap-1 font-bold text-destructive">
                          <WaterDropIcon sx={{ fontSize: 14 }} /> Tipo sanguíneo: {patient.bloodType}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="rounded-xl border border-dashed border-destructive/35 bg-destructive/5 px-3 py-1.5 text-center">
                      <div className="text-lg font-black tracking-wider text-destructive tabular-nums">
                        {patient.fullName?.charAt(0)?.toUpperCase() || '?'}
                        {age ?? ''}
                      </div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        ID emergencial
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bloco 2: Condições Clínicas, Alergias & Histórico */}
                <SettingRow
                  icon={<HealthAndSafetyOutlinedIcon sx={{ fontSize: 18 }} />}
                  iconClassName="text-destructive"
                  title="Alergias, Condições Crônicas & Cirurgias"
                  badge={patient.clinicalProfile ? 'Preenchido' : 'Importante'}
                  badgeVariant={patient.clinicalProfile ? 'success-light' : 'warning-light'}
                  stackOnMobile
                  description={
                    patient.clinicalProfile ? (
                      <span className="block font-medium text-foreground break-words">{patient.clinicalProfile}</span>
                    ) : (
                      'Informe alergias a medicamentos, hipertensão, diabetes, asma ou cirurgias prévias no seu perfil.'
                    )
                  }
                  action={
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<EditOutlinedIcon fontSize="small" />}
                      onClick={() => navigate('/perfil')}
                      sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700, minHeight: 36, width: { xs: '100%', sm: 'auto' } }}
                    >
                      {patient.clinicalProfile ? 'Editar' : '+ Adicionar no perfil'}
                    </Button>
                  }
                />

                {/* Bloco 3: Medicamentos em Uso Contínuo (sincronizado de /medications) */}
                <SettingRow
                  icon={<MedicationIcon sx={{ fontSize: 18 }} />}
                  iconClassName="text-primary"
                  title="Medicações em Uso Contínuo"
                  badge={meds.length > 0 ? `${meds.length} ativo${meds.length > 1 ? 's' : ''}` : 'Sincronizado'}
                  badgeVariant={meds.length > 0 ? 'primary-light' : 'outline'}
                  stackOnMobile
                  description={
                    meds.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {meds.map((m) => (
                          <ReuiBadge
                            key={m.id}
                            variant="primary-light"
                            size="sm"
                            className="h-auto max-w-full py-1 px-2 text-left leading-snug whitespace-normal break-words"
                          >
                            {m.name}
                            {m.dosage ? ` · ${m.dosage}` : ''}
                            {m.frequency ? ` (${m.frequency})` : ''}
                          </ReuiBadge>
                        ))}
                      </div>
                    ) : (
                      'Nenhum medicamento de uso contínuo cadastrado na sua rotina.'
                    )
                  }
                  action={
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => navigate('/medicamentos')}
                      sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700, minHeight: 36, width: { xs: '100%', sm: 'auto' } }}
                    >
                      {meds.length > 0 ? 'Gerenciar' : '+ Adicionar remédios'}
                    </Button>
                  }
                />

                {/* Bloco 4: Contato de Emergência */}
                <SettingRow
                  icon={<CallIcon sx={{ fontSize: 18 }} />}
                  iconClassName="text-emerald-600 dark:text-emerald-400"
                  title="Telefone / Contato de Emergência"
                  badge={patient.phone ? 'Ativo' : 'Pendente'}
                  badgeVariant={patient.phone ? 'success-light' : 'warning-light'}
                  stackOnMobile
                  description={
                    patient.phone ? (
                      <span className="font-semibold text-foreground tabular-nums">{patient.phone}</span>
                    ) : (
                      'Adicione um telefone de contato no perfil para emergências.'
                    )
                  }
                  action={
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => navigate('/perfil')}
                      sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700, minHeight: 36, width: { xs: '100%', sm: 'auto' } }}
                    >
                      {patient.phone ? 'Alterar' : '+ Adicionar telefone'}
                    </Button>
                  }
                />
              </div>
            ) : (
              <Stack spacing={1.5} sx={{ p: 3 }}>
                <Skeleton variant="text" sx={{ fontSize: '1.25rem', width: '60%' }} />
                <Skeleton variant="text" sx={{ fontSize: '0.875rem', width: '40%' }} />
                <Skeleton variant="rectangular" height={64} sx={{ borderRadius: 2 }} />
                <Skeleton variant="rectangular" height={64} sx={{ borderRadius: 2 }} />
              </Stack>
            )}
          </FramePanel>

          <FrameFooter className="flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center">
            <span className="text-xs text-muted-foreground">
              Você pode imprimir ou salvar em PDF para levar na carteira em viagens.
            </span>
            <Button
              variant="contained"
              onClick={() => printPage('Cartão de Emergência')}
              startIcon={<PrintIcon />}
              sx={{
                borderRadius: '10px',
                py: 1,
                px: 2.5,
                fontWeight: 800,
                textTransform: 'none',
                bgcolor: '#dc2626',
                '&:hover': { bgcolor: '#b91c1c' },
              }}
            >
              Imprimir carteirinha
            </Button>
          </FrameFooter>
        </Frame>
      </div>
    </PageContainer>
  );
};
