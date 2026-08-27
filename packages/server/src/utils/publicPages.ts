/**
 * Páginas públicas ESTÁTICAS (Termos + Privacidade) — servidas direto pelo Express,
 * sem hash-router, sem JS e sem auth. Motivo: Google Play rejeitou a URL
 * janocaminho.com.br/minhasaude/#/privacidade porque (a) a rota vivia dentro do
 * shell autenticado (sem login → tela de entrada) e (b) o crawler de política não
 * executa o JS do SPA de hash — via só o shell. Esta página resolve os dois:
 * conteúdo completo em HTML puro numa rota limpa (/privacidade, /termos).
 *
 * Conteúdo = Privacy.tsx (antes de enviar, retenção, LGPD) + Terms.tsx (termos
 * completos 1-9). "Gerenciar seus dados" vira instrução (os botões são do app).
 */

const BRAND_URL = '/minhasaude/app-icon.png';

const li = (t: string, color = '#178f89') =>
  `<tr><td style="padding:4px 10px 4px 0;white-space:nowrap;font-weight:800;color:${color}">✓</td><td style="padding:4px 0;font-size:14.5px;color:#2d3748;line-height:1.65">${t}</td></tr>`;

const section = (icon: string, title: string, rows: string, color = '#178f89') => `
  <tr><td style="padding:26px 32px 6px">
    <h2 style="font-size:18px;color:${color};margin:0 0 6px">${icon} ${title}</h2>
  </td></tr>
  <tr><td style="padding:0 32px 8px"><table cellpadding="0" cellspacing="0" width="100%">${rows}</table></td></tr>`;

const h3 = (t: string) => `<h3 style="font-size:15.5px;color:#0f3d3a;margin:22px 0 6px">${t}</h3>`;
const p = (t: string) => `<p style="font-size:14.5px;color:#2d3748;line-height:1.7;margin:0 0 10px">${t}</p>`;

export function publicPrivacyHtml(): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="index,follow">
<title>Termos de Uso e Política de Privacidade — Meus Exames</title>
</head><body style="margin:0;padding:0;background:#eef7f6;font-family:'Segoe UI',Roboto,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef7f6;padding:20px 0"><tr><td align="center">
<table width="680" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 10px rgba(32,178,170,.12);max-width:96%">
  <tr><td style="background:linear-gradient(135deg,#20b2aa,#178f89);padding:26px 32px;text-align:center">
    <img src="${BRAND_URL}" width="58" height="58" alt="Meus Exames" style="border-radius:14px;display:block;margin:0 auto 8px">
    <h1 style="color:#fff;font-size:21px;margin:0;font-weight:800">Meus Exames — Dr. Exame</h1>
    <p style="color:rgba(255,255,255,.9);font-size:13px;margin:4px 0 0">Termos de Uso e Política de Privacidade · atualizado em 27/08/2026</p>
  </td></tr>

  ${section('🩺', 'O que é o Meus Exames',
    li('Um app de <strong>organização e educação em saúde</strong>: guarda, visualiza e explica seus exames em português simples.') +
    li('A análise é <strong>educativa — NÃO é diagnóstico</strong>, não prescreve e não substitui consulta médica. A decisão final é sempre do seu médico.'), '#0369a1')}

  ${section('🧾', 'Antes de enviar um exame',
    li('Ao enviar PDF, foto ou usar a câmera, o arquivo e os dados de saúde são enviados ao Meus Exames para extração e análise educativa com IA.') +
    li('O processamento pode usar operadores necessários: <strong>Z.ai/GLM</strong> (IA), <strong>Firebase</strong> (notificações), <strong>Sentry</strong> (erros) e <strong>Mercado Pago</strong> (pagamentos).') +
    li('Você controla o compartilhamento com médicos; links usam PIN, <strong>expiram em 12 horas</strong> e podem ser revogados.') +
    li('Você pode apagar exames, exportar seus dados ou excluir a conta no app, a qualquer momento.'), '#0369a1')}

  ${section('⏳', 'Retenção de Dados (por quanto tempo guardamos)',
    li('Exames e resultados (PDFs, valores, análises IA): mantidos enquanto sua conta estiver ativa. Você pode excluir qualquer exame a qualquer momento.') +
    li('Dados de saúde do Health Connect (passos, calorias, distância): sincronizados sob sua permissão; excluídos junto com a conta ou individualmente em Medições.') +
    li('Remédios e interações: mantidos enquanto sua conta estiver ativa; removíveis a qualquer momento.') +
    li('Fotos de perfil: mantidas enquanto a conta estiver ativa; substituíveis ou removíveis a qualquer momento.') +
    li('Logs de auditoria (acessos, ações de segurança): até <strong>90 dias</strong>, depois excluídos automaticamente.') +
    li('Tokens de notificação (FCM): mantidos enquanto o app estiver instalado; removidos ao desinstalar ou desativar notificações.') +
    li('Pagamentos (Mercado Pago): <strong>não armazenamos dados de cartão</strong>; tokens de transação ficam com o provedor, conforme a política dele.') +
    li('Ao excluir sua conta: <strong>todos os dados são excluídos permanentemente em até 24 horas</strong>. Não há backup de restauração.') +
    li('Não retemos dados de usuários que excluíram a conta. Dados anônimos/agregados (sem identificação) podem ser mantidos para estatísticas.', '#b45309'), '#b45309')}

  ${section('🔐', 'LGPD (Lei Geral de Proteção de Dados)',
    li('Dados de saúde tratados em ambiente controlado, com autenticação, HTTPS em produção e acesso restrito.') +
    li('Você controla quem acessa seus dados (compartilhamento com médicos é opcional e revogável).') +
    li('Você pode <strong>exportar todos os seus dados</strong> a qualquer momento (no app: Privacidade → Baixar tudo).') +
    li('Você pode <strong>excluir sua conta e todos os dados</strong> permanentemente (no app: Privacidade → Excluir conta; ou por e-mail, prazo máximo de 30 dias).') +
    li('<strong>Não vendemos seus dados.</strong> Compartilhamos apenas com operadores necessários (IA, notificações, pagamentos, suporte e infraestrutura).'))}

  <tr><td style="padding:26px 32px 0">
    <h2 style="font-size:18px;color:#178f89;margin:0 0 4px">📋 Termos de Uso (completo)</h2>
    ${h3('1. Natureza do serviço (educativa — NÃO é diagnóstico)')}
    ${p('O Meus Exames é um aplicativo de organização e educação em saúde. Ele ajuda a guardar, visualizar e acompanhar seus exames médicos e oferece explicações geradas por inteligência artificial em linguagem simples. <strong>O app NÃO diagnostica, NÃO prescreve, NÃO substitui consulta, laudo ou orientação de um profissional de saúde.</strong> As análises são educativas e a interpretação final de qualquer exame deve ser feita sempre por um médico.')}
    ${h3('2. Dados que coletamos (LGPD — Lei 13.709/2018)')}
    ${p('Tratamos dados pessoais e dados sensíveis de saúde conforme os recursos usados, com base no seu consentimento, execução do serviço, segurança da conta e cumprimento de obrigações legais: <strong>Conta</strong> (nome, e-mail, senha com hash, preferências, sessão, MFA, suporte); <strong>Exames</strong> (PDFs/imagens enviados, texto extraído, valores, referências, alertas, resumos e análises educativas); <strong>Perfil de saúde</strong> (sexo, altura, medicações, condições, medições, vacinas, despesas, lembretes, dependentes, foto opcional); <strong>Dispositivo, segurança e uso</strong> (IP, logs de acesso, versão, identificadores de sessão/dispositivo, tokens de notificação, diagnósticos de erro); <strong>Pagamentos</strong> (status de assinatura, créditos, transações e metadados do processador — não armazenamos dados completos de cartão); <strong>Dados anonimizados</strong> (melhoria da leitura de risco, apenas com sua opção ativa).')}
    ${p('<strong>Finalidade:</strong> organizar exames, extrair dados, gerar análises educativas, melhorar a experiência, prevenir abuso/fraude, enviar lembretes/notificações, prestar suporte, processar pagamentos e cumprir obrigações legais. <strong>Não vendemos seus dados.</strong>')}
    ${h3('3. Compartilhamento')}
    ${p('Apenas com operadores necessários, sob finalidade limitada: <strong>IA (Z.ai/GLM)</strong> — conteúdo de exames e contexto mínimo para extração/explicação educativa; não usamos seus exames para treinar modelos. <strong>Médico (opcional)</strong> — link acessível por 12 horas, protegido por PIN e revogável. <strong>Pagamentos (Mercado Pago)</strong> — cobranças, PIX, cartão, assinatura e reembolsos. <strong>Notificações (Firebase)</strong> — lembretes e avisos, com sua permissão. <strong>Diagnóstico de erros (Sentry)</strong> — falhas técnicas e estabilidade, sem finalidade publicitária. <strong>Infraestrutura</strong> — hospedagem, armazenamento, banco e e-mail.')}
    ${h3('4. Permissões do app')}
    ${p('<strong>Câmera, scanner e galeria:</strong> usados somente quando você escolhe fotografar/escanear/selecionar um exame. <strong>Notificações:</strong> lembretes e avisos; desativáveis nas configurações do aparelho. <strong>Identificação do dispositivo:</strong> segurança, prevenção de abuso e integridade da conta.')}
    ${h3('5. Armazenamento e segurança')}
    ${p('Ambiente controlado, acesso restrito e autenticação. Senhas com hash (bcrypt), CPF criptografado quando informado, HTTPS em produção. Nenhum sistema é 100% seguro — faça backups dos seus exames originais.')}
    ${h3('6. Exclusão de conta e dados (titular — LGPD)')}
    ${p('Você pode acessar, corrigir, portar ou excluir seus dados, total ou parcialmente, a qualquer momento. <strong>Pelo app:</strong> Privacidade → "Excluir conta" (apaga conta, exames, PDFs, análises, fotos e memória do assistente). <strong>Por e-mail:</strong> contato@janocaminho.com.br (prazo máximo de 30 dias). Exclusões parciais (exames, dependentes, memória da IA) podem ser feitas individualmente no app. Logs de segurança podem ser retidos por até 90 dias e depois apagados completamente.')}
    ${h3('7. Responsabilidade')}
    ${p('O app é fornecido "no estado em que se encontra". Não nos responsabilizamos por decisões tomadas com base nas análises educativas, nem por erros de leitura da IA. Sempre confirme valores e decisões com seu médico.')}
    ${h3('8. Crianças')}
    ${p('O app não é direcionado a menores de 18 anos sem supervisão de um responsável. Perfis de dependentes devem ser criados e geridos por um adulto responsável.')}
    ${h3('9. Alterações e contato')}
    ${p('Estes termos podem ser atualizados; mudanças relevantes serão comunicadas no app. Dúvidas ou solicitações (LGPD): <strong>contato@janocaminho.com.br</strong>.')}
  </td></tr>

  <tr><td style="background:#f2faf9;padding:20px 32px;border-top:1px solid #d8efed">
    <p style="color:#5a6b78;font-size:12.5px;margin:0;text-align:center;line-height:1.6">
      Meus Exames · janocaminho.com.br · CNPJ 44.771.427/0001-69 · contato@janocaminho.com.br<br>
      Análise educativa — não substitui consulta médica.
    </p>
  </td></tr>
</table></td></tr></table></body></html>`;
}
