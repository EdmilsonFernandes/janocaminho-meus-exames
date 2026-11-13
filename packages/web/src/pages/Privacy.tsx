import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  Alert,
  RadioGroup,
  FormControlLabel,
  Radio,
  DialogActions,
} from '@mui/material';
import { Title, useNotify } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import DownloadIcon from '@mui/icons-material/Download';
import FolderZipOutlinedIcon from '@mui/icons-material/FolderZipOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DeleteForeverOutlinedIcon from '@mui/icons-material/DeleteForeverOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import { API_URL, token } from '../config';
import { TermsPage } from './Terms';
import { Badge } from '@/components/reui/badge';
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import { IconTile } from '@/components/reui/icon-tile';
import { SettingRow } from '@/components/reui/setting-row';
import { ShieldRoundIcon } from '@/components/reui/icons';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';
import { tealText } from '../theme';

/** Página de Privacidade e Termos — e o lar REAL de "Gerenciar seus dados" (export/import/
 *  exclusão LGPD mudaram do Perfil pra cá na re-arquitetura 2026-08: função de dados, não
 *  de perfil. Nada desapareceu — o Perfil aponta pra cá). */
export const PrivacyPage = () => {
  useReuiThemeSync();
  const navigate = useNavigate();
  const notify = useNotify();
  const [termsOpen, setTermsOpen] = useState(false);
  const [zipLoading, setZipLoading] = useState(false);
  // Motivo da exclusão (18/10): antes a conta sumia sem deixar NADA — nem sinal de que
  // existiu. O motivo (1 clique, opcional) vai pro audit_logs e o dono passa a saber
  // POR QUE as pessoas vão embora ("coloca e exclui" deixa de ser fantasma).
  const [deleteReasonOpen, setDeleteReasonOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('nao-era-o-que-esperava');

  // PACOTE COMPLETO (.zip): dados + relatórios legíveis + PDFs originais — portabilidade LGPD.
  const exportAll = async () => {
    setZipLoading(true);
    try {
      const r = await fetch(`${API_URL}/data/export-all`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        notify(e.error || 'Falha ao gerar o pacote', { type: 'error' });
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meus-exames-completo-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      notify('Pacote completo baixado!', { type: 'success' });
    } finally {
      setZipLoading(false);
    }
  };

  const delAccount = () => setDeleteReasonOpen(true);
  const confirmDeleteAccount = async () => {
    setDeleteReasonOpen(false);
    const r = await fetch(`${API_URL}/auth/account`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token()}`,
      },
      body: JSON.stringify({ reason: deleteReason || 'unspecified' }),
    });
    if (r.ok) {
      localStorage.clear();
      navigate('/landing', { replace: true });
    } else notify('Falha ao excluir conta. Tente novamente.', { type: 'error' });
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 820, mx: 'auto' }}>
      <Title title="Privacidade" />

      {/* Cabeçalho com IconTile Duotone ReUI */}
      <div className="mb-5 flex items-start gap-3.5">
        <IconTile variant="soft" size="lg" className="text-primary">
          <ShieldRoundIcon className="size-6" />
        </IconTile>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-foreground m-0 font-['Poppins',sans-serif] text-xl font-extrabold tracking-tight sm:text-2xl">
              Privacidade e Controle de Dados
            </h1>
            <Badge variant="primary-light" size="sm">
              LGPD Art. 18
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 mb-0 text-xs sm:text-sm leading-relaxed">
            Gerencie a portabilidade dos seus exames, consulte os termos clínicos e exerça seus direitos de titular sem intermediários.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* BLOCO 1 (ReUI settings-2): Gerenciar seus dados e controles de privacidade */}
        <Frame className="w-full">
          <FrameHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <FrameTitle>Gerenciar seus dados & portabilidade</FrameTitle>
              <Badge variant="success-light" size="xs">
                Autoatendimento imediato
              </Badge>
            </div>
            <FrameDescription>
              Exporte todos os seus exames originais em pacote (.zip) ou encerre sua conta a qualquer momento.
            </FrameDescription>
          </FrameHeader>

          <FramePanel className="p-0">
            {/* Linha 1: Pacote Completo (.zip) */}
            <SettingRow
              icon={<FolderZipOutlinedIcon sx={{ fontSize: 20 }} />}
              iconVariant="soft"
              iconClassName="text-primary"
              title="Pacote Completo de Portabilidade (.zip)"
              badge="LGPD Art. 18, V"
              badgeVariant="primary-light"
              description="Inclui seus dados estruturados (.json), relatórios legíveis (.md) e todos os PDFs originais enviados."
              stackOnMobile
              action={
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<DownloadIcon />}
                  onClick={exportAll}
                  disabled={zipLoading}
                  sx={{
                    borderRadius: '10px',
                    textTransform: 'none',
                    fontWeight: 700,
                    minHeight: 38,
                    width: { xs: '100%', sm: 'auto' },
                  }}
                >
                  {zipLoading ? 'Gerando pacote…' : 'Baixar tudo (.zip)'}
                </Button>
              }
            />

            {/* Linha 2: Termos de Uso */}
            <SettingRow
              icon={<DescriptionOutlinedIcon sx={{ fontSize: 20 }} />}
              iconVariant="elevated"
              title="Termos de Uso e Apoio Educativo"
              badge="Vigente"
              badgeVariant="success-light"
              description={
                <>
                  O Meus Exames apoia a gestão de saúde pessoal. A análise por IA é{' '}
                  <strong>educativa</strong> e <strong>não substitui</strong> consulta, diagnóstico ou tratamento médico.
                </>
              }
              stackOnMobile
              action={
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setTermsOpen(true)}
                  sx={{
                    borderRadius: '10px',
                    textTransform: 'none',
                    fontWeight: 700,
                    minHeight: 36,
                    width: { xs: '100%', sm: 'auto' },
                  }}
                >
                  Ler termos completos →
                </Button>
              }
            />

            {/* Linha 4: Exclusão de Conta */}
            <SettingRow
              icon={<DeleteForeverOutlinedIcon sx={{ fontSize: 20 }} />}
              iconVariant="soft"
              iconClassName="text-destructive"
              title="Excluir minha conta e todos os dados"
              badge="Definitivo"
              badgeVariant="destructive-light"
              description="Remove permanentemente exames, análises, medições, remédios e fotos em até 24h. Esta ação não pode ser desfeita."
              stackOnMobile
              action={
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  onClick={delAccount}
                  sx={{
                    borderRadius: '10px',
                    textTransform: 'none',
                    fontWeight: 700,
                    minHeight: 36,
                    width: { xs: '100%', sm: 'auto' },
                  }}
                >
                  Excluir minha conta
                </Button>
              }
            />
          </FramePanel>

          <FrameFooter>
            <p className="text-muted-foreground m-0 text-xs">
              Dúvidas sobre privacidade ou solicitações ao encarregado de dados (DPO) podem ser enviadas diretamente pelo suporte do app.
            </p>
          </FrameFooter>
        </Frame>

        {/* BLOCO 2: Antes de enviar um exame + Compromissos LGPD */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Frame className="h-full">
            <FrameHeader>
              <div className="flex items-center gap-2">
                <FactCheckOutlinedIcon sx={{ fontSize: 18, color: '#0369a1' }} />
                <FrameTitle>Antes de enviar um exame</FrameTitle>
              </div>
              <FrameDescription>
                Transparência no processamento de PDFs, fotos e câmera
              </FrameDescription>
            </FrameHeader>
            <FramePanel className="flex flex-col gap-3">
              <Alert severity="info" sx={{ borderRadius: '10px', py: 0.5, fontSize: 12.5 }}>
                Ao enviar PDF, foto ou usar a câmera, o arquivo e os dados de saúde são enviados ao Meus Exames para extração e análise educativa com IA.
              </Alert>
              <Stack spacing={1.25}>
                {[
                  'A IA ajuda a organizar e explicar seus exames, mas não diagnostica, não prescreve e não substitui consulta médica.',
                  'O processamento pode usar operadores necessários, como Z.ai/GLM para IA, Firebase para notificações, Sentry para erros e Mercado Pago para pagamentos.',
                  'Você controla o compartilhamento com médicos; links usam PIN, expiram em 12 horas e podem ser revogados.',
                  'Você pode apagar exames, exportar seus dados ou excluir a conta aqui mesmo, em "Gerenciar seus dados".',
                ].map((t, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-sky-500/12 text-xs font-extrabold text-sky-700 dark:text-sky-300 tabular-nums">
                      {i + 1}
                    </span>
                    <span className="text-foreground text-[13px] leading-relaxed">{t}</span>
                  </div>
                ))}
              </Stack>
            </FramePanel>
          </Frame>

          <Frame className="h-full">
            <FrameHeader>
              <div className="flex items-center gap-2">
                <VerifiedUserOutlinedIcon sx={{ fontSize: 18, color: (t) => tealText(t.palette.mode) }} />
                <FrameTitle>Proteção de Dados (LGPD)</FrameTitle>
              </div>
              <FrameDescription>
                Segurança, criptografia e governança de acesso
              </FrameDescription>
            </FrameHeader>
            <FramePanel className="flex flex-col gap-3">
              <Stack spacing={1.25}>
                {[
                  'Seus dados de saúde são tratados em ambiente controlado, com autenticação, HTTPS em produção e acesso restrito.',
                  'Você controla quem acessa seus dados (compartilhamento com médicos é opcional e revogável).',
                  'Você pode exportar todos os seus dados a qualquer momento (acima, nesta tela).',
                  'Você pode excluir sua conta e todos os dados permanentemente (acima, nesta tela).',
                  'Não vendemos seus dados; compartilhamos apenas com operadores necessários para IA, notificações, pagamentos, suporte e infraestrutura.',
                ].map((t, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-extrabold text-primary tabular-nums">
                      {i + 1}
                    </span>
                    <span className="text-foreground text-[13px] leading-relaxed">{t}</span>
                  </div>
                ))}
              </Stack>
            </FramePanel>
          </Frame>
        </div>

        {/* BLOCO 3: Retenção de Dados — obrigatório Google Play */}
        <Frame>
          <FrameHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ScheduleOutlinedIcon sx={{ fontSize: 18, color: '#b45309' }} />
                <FrameTitle>Retenção de Dados (por quanto tempo guardamos)</FrameTitle>
              </div>
              <Badge variant="warning-light" size="xs">
                Conformidade Google Play & LGPD
              </Badge>
            </div>
            <FrameDescription>
              Ciclo de vida detalhado de cada categoria de dado armazenado na plataforma
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {[
                'Exames e resultados (PDFs, valores, análises IA): mantidos enquanto sua conta estiver ativa. Você pode excluir qualquer exame a qualquer momento.',
                'Dados de saúde do Health Connect (passos, calorias, distância): sincronizados sob sua permissão e armazenados como Medições. Excluídos junto com a conta ou individualmente em Medições.',
                'Composição corporal do Health Connect (peso, percentual de gordura, metabolismo basal e altura, medidos por relógio ou balança): lidos depois que você conecta na tela de Composição corporal (e atualizados ao abrir essa tela), usados apenas para mostrar a sua evolução e nunca para publicidade. Excluídos junto com a conta ou individualmente no histórico de Composição corporal.',
                'Radar Hormonal: o protocolo que você monta fica salvo só no seu aparelho. As aplicações que você registra (composto, quantidade e data) ficam na sua conta para o gráfico usar as datas reais; não são mostradas a médicos nem a terceiros e nunca são usadas para publicidade. Você pode apagar cada registro no histórico, e todos são excluídos junto com a conta.',
                'Remédios e interações: mantidos enquanto sua conta estiver ativa. Você pode excluir qualquer remédio a qualquer momento.',
                'Fotos de perfil: mantidas enquanto sua conta estiver ativa. Você pode substituir ou remover a qualquer momento.',
                'Logs de auditoria (acessos, ações de segurança): mantidos por até 90 dias para segurança e conformidade LGPD, depois excluídos automaticamente.',
                'Tokens de notificação (FCM): mantidos enquanto o app estiver instalado. Removidos quando você desinstala ou desativa notificações.',
                'Dados de pagamento (Mercado Pago): não armazenamos dados de cartão. Tokens de transação mantidos pelo provedor (Mercado Pago) conforme política deles.',
                'Ao excluir sua conta: TODOS os dados (exames, análises, remédios, fotos, medições, perguntas) são excluídos permanentemente em até 24 horas. Não há backup de restauração.',
                'Não retemos dados de usuários que excluíram a conta. Dados anônimos/agregados (sem identificação) podem ser mantidos para estatísticas de uso.',
              ].map((t, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/20 p-3"
                >
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-xs font-extrabold text-amber-700 dark:text-amber-300 tabular-nums">
                    {i + 1}
                  </span>
                  <span className="text-foreground text-xs sm:text-[13px] leading-relaxed">
                    {t}
                  </span>
                </div>
              ))}
            </div>
          </FramePanel>
        </Frame>
      </div>

      {/* Modal com os termos completos (não navega pra fora → voltar não quebra) */}
      <Dialog
        open={termsOpen}
        onClose={() => setTermsOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: '12px', maxHeight: '85vh' } }}
      >
        <DialogTitle
          sx={{
            fontWeight: 800,
            color: 'text.primary',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          📋 Termos de Uso
          <Button onClick={() => setTermsOpen(false)} sx={{ minWidth: 0, fontSize: 13 }}>
            ✕ Fechar
          </Button>
        </DialogTitle>
        <DialogContent sx={{ '& p, & li': { fontSize: 14, lineHeight: 1.6 } }}>
          <TermsPage />
        </DialogContent>
      </Dialog>

      {/* Exclusão com MOTIVO (18/10): aviso grave + 1 clique opcional de "por quê" */}
      <Dialog
        open={deleteReasonOpen}
        onClose={() => setDeleteReasonOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>Excluir minha conta</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 1.5, fontSize: 13.5 }}>
            Isso apaga <b>todos os seus dados</b> (exames, análises, perfil, fotos) definitivamente.{' '}
            <b>Não dá pra desfazer.</b>
          </Alert>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Se puder dizer o motivo, ajuda muito a melhorar o app:
          </Typography>
          <RadioGroup
            value={deleteReason}
            onChange={(e) =>
              setDeleteReason((e as React.ChangeEvent<HTMLInputElement>).target.value)
            }
          >
            {[
              ['nao-era-o-que-esperava', 'Não era o que eu esperava'],
              ['achei-caro', 'Achei caro'],
              ['nao-uso-mais', 'Paro de usar / não preciso mais'],
              ['privacidade', 'Preocupação com meus dados'],
              ['teste', 'Era só um teste'],
            ].map(([v, l]) => (
              <FormControlLabel
                key={v}
                value={v}
                control={<Radio size="small" />}
                label={<Typography variant="body2">{l}</Typography>}
              />
            ))}
          </RadioGroup>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, flexDirection: 'column', gap: 1 }}>
          <Button
            fullWidth
            variant="contained"
            color="error"
            onClick={() => void confirmDeleteAccount()}
            sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 800, minHeight: 44 }}
          >
            Excluir tudo definitivamente
          </Button>
          <Button
            fullWidth
            onClick={() => setDeleteReasonOpen(false)}
            sx={{ textTransform: 'none', fontWeight: 700, color: 'text.secondary' }}
          >
            Cancelar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
