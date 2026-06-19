import { Box, Container, Typography, Link as MuiLink, Divider } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { DrExame } from '../components/DrExame';

const H = ({ children }: { children: React.ReactNode }) => <Typography variant="h6" sx={{ fontWeight: 800, mt: 3, mb: 1, color: '#178f89' }}>{children}</Typography>;
const P = ({ children }: { children: React.ReactNode }) => <Typography variant="body2" sx={{ mb: 1, lineHeight: 1.7 }}>{children}</Typography>;

/** Termos de Uso + Política de Privacidade (LGPD) — acessível sem login (Play Store / landing). */
export const TermsPage = () => {
  const navigate = useNavigate();
  return (
    <Box sx={{ background: '#eef7f6', minHeight: '100vh', py: { xs: 3, md: 5 } }}>
      <Container maxWidth="md" sx={{ background: '#fff', borderRadius: 4, p: { xs: 2.5, md: 4 }, boxShadow: 1 }}>
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <DrExame size={56} sx={{ borderRadius: '18%' }} />
          <Typography variant="h5" sx={{ fontWeight: 800, mt: 1 }}>Termos de Uso e Política de Privacidade</Typography>
          <Typography variant="caption" color="text.secondary">Meus Exames — atualizado em 17/06/2026</Typography>
        </Box>

        <H>1. Natureza do serviço (educativa — NÃO é diagnóstico)</H>
        <P>O <strong>Meus Exames</strong> é um aplicativo de <strong>organização e educação em saúde</strong>. Ele ajuda a guardar, visualizar e acompanhar seus exames médicos e oferece explicações geradas por inteligência artificial em linguagem simples.</P>
        <P><strong>O app NÃO diagnostica, NÃO prescreve, NÃO substitui consulta, laudo ou orientação de um profissional de saúde.</strong> As análises são educativas e a interpretação final de qualquer exame deve ser feita sempre por um médico. O uso é por sua conta e risco.</P>

        <H>2. Dados que coletamos (LGPD — Lei 13.709/2018)</H>
        <P>Para oferecer o serviço, tratamos os seguintes dados pessoais, com base no seu <strong>consentimento</strong> (art. 7º, I, LGPD):</P>
        <P>• <strong>Conta:</strong> nome, e-mail e senha (criptografada).<br />• <strong>Exames:</strong> os documentos (PDF/imagem) que você envia e os valores extraídos.<br />• <strong>Perfil clínico:</strong> informações que você optionally informa (medicações, condições) para contextualizar a IA.<br />• <strong>Foto de perfil</strong> (opcional).</P>
        <P><strong>Finalidade:</strong> exclusivamente para organizar seus exames, gerar as análises educativas e melhorar sua experiência. <strong>Não vendemos seus dados.</strong></P>

        <H>3. Compartilhamento</H>
        <P>• <strong>IA (Z.ai/GLM):</strong> o conteúdo dos exames é enviado a um provedor de IA APENAS para gerar a análise educativa (extração de texto/explicação). Não é usado para treinar modelos.<br />• <strong>Médico (opcional):</strong> quando você gera um link de compartilhamento, o resumo fica acessível por tempo limitado (12h) e protegido por senha (PIN).<br />• <strong>Pagamentos (Mercado Pago):</strong> processados pelo MP; não armazenamos dados de cartão.</P>

        <H>4. Armazenamento e segurança</H>
        <P>Seus dados ficam em servidor próprio (Brasil/EUA-EC2), com acesso restrito e autenticação. Dados sensíveis de saúde são tratados com cuidado; senhas são armazenadas com hash (bcrypt). Mesmo assim, nenhum sistema é 100% seguro — faça backups dos seus exames originais.</P>

        <H>5. Exclusão de conta e dados (titular dos dados — LGPD)</H>
        <P>Você pode, a qualquer momento: <strong>acessar, corrigir, portar ou excluir</strong> seus dados do <strong>Meus Exames</strong>, total ou parcialmente.</P>
        <P><strong>Como solicitar a exclusão da conta e dos dados:</strong></P>
        <P>1. <strong>Pelo app:</strong> acesse <strong>Perfil → “Excluir conta”</strong>. Apaga definitivamente a conta (nome e e-mail), os exames (PDFs e imagens), os valores extraídos, as análises da IA, as fotos e a memória do assistente Dr. Exame.<br />2. <strong>Por e-mail:</strong> envie um pedido para <strong>contato@janocaminho.com.br</strong> informando o nome e o e-mail da conta. O prazo máximo de atendimento é de 30 dias (LGPD).</P>
        <P><strong>Excluir apenas parte dos dados (sem excluir a conta):</strong> dentro do app você pode apagar exames, dependentes ou a memória da IA individualmente, a qualquer momento.</P>
        <P><strong>O que pode ser mantido temporariamente:</strong> logs de segurança/auditoria e registros necessários para cumprimento legal podem ser retidos por até <strong>90 dias</strong> após a exclusão, sendo então completamente apagados.</P>

        <H>6. Responsabilidade</H>
        <P>O app é fornecido “no estado em que se encontra”. Não nos responsabilizamos por decisões tomadas com base nas análises educativas, nem por eventuais erros de leitura da IA. <strong>Sempre confirme valores e decisões com seu médico.</strong> O recurso anti-fraude (conferir o nome do documento) é um auxílio, não uma garantia.</P>

        <H>7. Crianças</H>
        <P>O app não é direcionado a menores de 18 anos sem supervisão de um responsável. Perfis de dependentes devem ser criados e geridos por um adulto responsável.</P>

        <H>8. Alterações e contato</H>
        <P>Estes termos podem ser atualizados; mudanças relevantes serão comunicadas no app. Dúvidas ou solicitações (LGPD): <strong>contato@janocaminho.com.br</strong>.</P>

        <Divider sx={{ my: 3 }} />
        <Box sx={{ textAlign: 'center' }}>
          <MuiLink onClick={() => navigate('/landing')} sx={{ cursor: 'pointer', fontWeight: 700 }}>← Voltar ao início</MuiLink>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 2 }}>
          Meus Exames · Análise educativa — não substitui avaliação médica.
        </Typography>
      </Container>
    </Box>
  );
};
