/**
 * ShareHealthCard — botão "compartilhar minha saúde" que gera um card visual + texto pra
 * WhatsApp/Status/redes. LOOP VIRAL: cada compartilhamento = marketing orgânico.
 *
 * Funciona em 2 modos:
 * 1. navigator.share (mobile nativo — abre sheet de compartilhamento do SO)
 * 2. wa.me fallback (abre WhatsApp diretamente com texto pré-formatado)
 *
 * O texto é ACOLHEDOR (não revela valores específicos — privaidedade): foca no engajamento
 * ("cuidando da minha saúde") e no link do app.
 */
import { useState } from 'react';
import { Box, Button, Snackbar, Alert } from '@mui/material';
import ShareIcon from '@mui/icons-material/Share';

const APP_URL = 'https://janocaminho.com.br/minhasaude';
const APP_HASHTAGS = '#MeusExames #DrExame #SaúdeInteligente';

const MESSAGES = [
  'Cuidando da minha saúde com o Dr. Exame 🤖❤️ — IA que lê meus exames e explica em português simples! Experimente:',
  'Minha idade biológica surpreendeu! 🧬 Descobri muito sobre minha saúde com o Meus Exames. Vale testar:',
  'Sabia que dá pra entender seus exames com IA? 📊 Eu uso o Dr. Exame — recomendo! Teste grátis:',
  'Score de saúde em dia ✅ + plano de ação da IA pra melhorar ainda mais. Tudo no Meus Exames:',
];

export const ShareHealthButton = ({ score, biologicalAge }: { score?: number | null; biologicalAge?: number | null }) => {
  const [shared, setShared] = useState(false);

  const buildMessage = () => {
    let msg = MESSAGES[new Date().getDate() % MESSAGES.length];
    if (score != null) msg = `Meu score de saúde: ${score}/100 ✅ — cuidando com IA no Dr. Exame! 🤖 Experimente:`;
    if (biologicalAge != null) msg = `🧬 Minha idade biológica: ${biologicalAge}a! Descobri com o Meus Exames — você também pode:`;
    return `${msg}\n\n${APP_URL}\n\n${APP_HASHTAGS}`;
  };

  const share = async () => {
    const text = buildMessage();
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Meus Exames — Dr. Exame IA', text, url: APP_URL });
        setShared(true);
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        setShared(true);
      }
    } catch { /* cancelado */ }
  };

  return (
    <>
      <Button
        size="small"
        startIcon={<ShareIcon />}
        onClick={share}
        sx={{
          borderRadius: 99, textTransform: 'none', fontWeight: 700, py: 1, px: 2.5,
          bgcolor: '#25D366', color: '#fff', '&:hover': { bgcolor: '#1da851' },
          boxShadow: '0 2px 8px rgba(37,211,102,.25)',
        }}
      >
        📤 Compartilhar
      </Button>
      <Snackbar open={shared} autoHideDuration={3000} onClose={() => setShared(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" sx={{ borderRadius: 99 }}>Obrigado por compartilhar! 🎉</Alert>
      </Snackbar>
    </>
  );
};
