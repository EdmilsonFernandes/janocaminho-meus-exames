import { useState } from 'react';
import { Box, Card, Typography, Button, Stack, Divider, Dialog, DialogTitle, DialogContent, Alert } from '@mui/material';
import { Title, useNotify, useRefresh } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import { API_URL, token, apiHeaders } from '../config';
import { confirmDialog } from '../components/ConfirmDialog';
import { TermsPage } from './Terms';

/** Página de Privacidade e Termos — e o lar REAL de "Gerenciar seus dados" (export/import/
 *  exclusão LGPD mudaram do Perfil pra cá na re-arquitetura 2026-08: função de dados, não
 *  de perfil. Nada desapareceu — o Perfil aponta pra cá). */
export const PrivacyPage = () => {
  const navigate = useNavigate();
  const notify = useNotify();
  const refresh = useRefresh();
  const [termsOpen, setTermsOpen] = useState(false);
  const [zipLoading, setZipLoading] = useState(false);

  const exportData = async () => {
    const r = await fetch(`${API_URL}/data/export`, { headers: { Authorization: `Bearer ${token()}` } });
    if (!r.ok) { notify('Falha ao exportar', { type: 'error' }); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'meus-exames-backup.json'; a.click();
    URL.revokeObjectURL(url);
    notify('Backup exportado!', { type: 'success' });
  };
  // PACOTE COMPLETO (.zip): dados + relatórios legíveis + PDFs originais — portabilidade LGPD.
  const exportAll = async () => {
    setZipLoading(true);
    try {
      const r = await fetch(`${API_URL}/data/export-all`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) { const e = await r.json().catch(() => ({})); notify(e.error || 'Falha ao gerar o pacote', { type: 'error' }); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `meus-exames-completo-${new Date().toISOString().slice(0, 10)}.zip`; a.click();
      URL.revokeObjectURL(url);
      notify('Pacote completo baixado!', { type: 'success' });
    } finally { setZipLoading(false); }
  };
  const importData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (!(await confirmDialog({ title: 'Importar dados', message: 'Importar cria NOVOS perfis/exames (não sobrescreve os atuais).', confirmLabel: 'Importar', tone: 'primary' }))) { e.target.value = ''; return; }
    try {
      const r = await fetch(`${API_URL}/data/import`, { method: 'POST', headers: apiHeaders(true), body: await f.text() });
      const d = await r.json();
      if (r.ok) {
        notify(`Importado! ${d.counts?.patients || 0} perfil(is), ${d.counts?.exams || 0} exame(s).`, { type: 'success' });
        window.dispatchEvent(new Event('selPatientChanged'));
        refresh();
      }
      else notify(d.error || 'Falha ao importar', { type: 'error' });
    } catch { notify('Arquivo inválido', { type: 'error' }); }
    e.target.value = '';
  };
  const delAccount = async () => {
    if (!(await confirmDialog({ title: 'Excluir minha conta', message: 'ATENÇÃO: isso apaga TODOS os seus dados (exames, análises, perfil, fotos) definitivamente. NÃO dá pra desfazer.', confirmLabel: 'Excluir conta' }))) return;
    const r = await fetch(`${API_URL}/auth/account`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) { localStorage.clear(); navigate('/landing', { replace: true }); }
    else notify('Falha ao excluir conta. Tente novamente.', { type: 'error' });
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 780, mx: 'auto' }}>
      <Title title="Privacidade" />
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>🛡️ Privacidade e Termos</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Como seus dados são tratados e seus direitos (LGPD).</Typography>

      <Card sx={{ mb: 2, borderRadius: '12px', background: 'background.default', border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary', mb: 1 }}>📋 Termos de Uso</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 14, lineHeight: 1.6, mb: 1.5 }}>
            O Meus Exames é um app de apoio à gestão de saúde pessoal. A análise gerada pela IA é <strong>educativa</strong> e <strong>não substitui</strong> consulta, diagnóstico ou tratamento médico. Em urgências, procure um serviço de saúde.
          </Typography>
          <Button variant="outlined" size="small" onClick={() => setTermsOpen(true)} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, borderColor: '#20b2aa', color: '#178f89' }}>
            Ler termos completos →
          </Button>
        </Box>
      </Card>

      <Card sx={{ mb: 2, borderRadius: '12px', border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary', mb: 1 }}>🧾 Antes de enviar um exame</Typography>
          <Alert severity="info" sx={{ mb: 1.5, borderRadius: '12px' }}>
            Ao enviar PDF, foto ou usar a câmera, o arquivo e os dados de saúde são enviados ao Meus Exames para extração e análise educativa com IA.
          </Alert>
          <Stack spacing={1.25}>
            {[
              'A IA ajuda a organizar e explicar seus exames, mas não diagnostica, não prescreve e não substitui consulta médica.',
              'O processamento pode usar operadores necessários, como Z.ai/GLM para IA, Firebase para notificações, Sentry para erros e Mercado Pago para pagamentos.',
              'Você controla o compartilhamento com médicos; links usam PIN, expiram em 12 horas e podem ser revogados.',
              'Você pode apagar exames, exportar seus dados ou excluir a conta aqui mesmo, em "Gerenciar seus dados".',
            ].map((t, i) => (
              <Stack key={i} direction="row" spacing={1.5} alignItems="flex-start">
                <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: 'rgba(51,104,134,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#0369a1', flexShrink: 0, mt: 0.2 }}>{i + 1}</Box>
                <Typography variant="body2" sx={{ color: 'text.primary', fontSize: 14, lineHeight: 1.5 }}>{t}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      </Card>

      <Card sx={{ mb: 2, borderRadius: '12px' }}>
        <Box sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary', mb: 1 }}>🔐 LGPD (Lei Geral de Proteção de Dados)</Typography>
          <Stack spacing={1.5}>
            {[
              'Seus dados de saúde são tratados em ambiente controlado, com autenticação, HTTPS em produção e acesso restrito.',
              'Você controla quem acessa seus dados (compartilhamento com médicos é opcional e revogável).',
              'Você pode exportar todos os seus dados a qualquer momento (abaixo, nesta tela).',
              'Você pode excluir sua conta e todos os dados permanentemente (abaixo, nesta tela).',
              'Não vendemos seus dados; compartilhamos apenas com operadores necessários para IA, notificações, pagamentos, suporte e infraestrutura.',
            ].map((t, i) => (
              <Stack key={i} direction="row" spacing={1.5} alignItems="flex-start">
                <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: 'rgba(32,178,170,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#178f89', flexShrink: 0, mt: 0.2 }}>{i + 1}</Box>
                <Typography variant="body2" sx={{ color: 'text.primary', fontSize: 14, lineHeight: 1.5 }}>{t}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      </Card>

      {/* GERENCIAR SEUS DADOS — lar real (mudou do Perfil p/ cá): export, import, exclusão. */}
      <Card sx={{ borderRadius: '12px', borderColor: 'error.main' }}>
        <Box sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, color: '#ef4444', mb: 0.5 }}>⚙️ Gerenciar seus dados</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13, mb: 1.5 }}>Seus direitos de portabilidade e exclusão (LGPD art. 18) — na hora, sem intermediário.</Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button variant="outlined" color="error" onClick={delAccount}>Excluir minha conta</Button>
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={exportData}>Exportar dados (.json)</Button>
            <Button variant="outlined" component="label" startIcon={<UploadIcon />}>Importar dados
              <input type="file" hidden accept="application/json" onChange={importData} />
            </Button>
          </Stack>
          {/* Baixe TUDO em 1 clique (LGPD art. 18, II): zip com dados.json + relatórios .md + PDFs. */}
          <Button variant="contained" startIcon={<DownloadIcon />} onClick={exportAll} disabled={zipLoading} sx={{ mt: 1.5, borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>
            {zipLoading ? 'Gerando pacote…' : 'Baixar tudo (.zip)'}
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>O pacote .zip traz dados, relatórios legíveis e os PDFs originais. A exclusão apaga definitivamente exames, análises e dados — não dá pra desfazer.</Typography>
        </Box>
      </Card>

      {/* Modal com os termos completos (não navega pra fora → voltar não quebra) */}
      <Dialog open={termsOpen} onClose={() => setTermsOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '12px', maxHeight: '85vh' } }}>
        <DialogTitle sx={{ fontWeight: 800, color: 'text.primary', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          📋 Termos de Uso
          <Button onClick={() => setTermsOpen(false)} sx={{ minWidth: 0, fontSize: 13 }}>✕ Fechar</Button>
        </DialogTitle>
        <DialogContent sx={{ '& p, & li': { fontSize: 14, lineHeight: 1.6 } }}>
          <TermsPage />
        </DialogContent>
      </Dialog>
    </Box>
  );
};
