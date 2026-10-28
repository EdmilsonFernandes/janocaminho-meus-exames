/**
 * Texto ÚNICO do consentimento de telemedicina (Res. CFM 2.314/2022 + Res. CFM
 * 2.454/2026). Fonte única p/ tela /teleconsulta/:id e fila imediata "Falar
 * agora" (spec docs/design/2026-10-27-fila-imediata-spec.md §5) — o mesmo texto
 * é auditável (consentAt persistido no match).
 * ⚠️ NÃO alterar o texto sem revisão clínica/jurídica.
 */
export const CONSENT_TEXT =
  'Autorizo o atendimento por telemedicina e a transmissão de imagens e dados nesta consulta, conforme a Resolução CFM 2.314/2022. Sei que posso negar ou revogar este consentimento a qualquer momento, e que ele fica registrado com data e hora. Sei também que a plataforma usa inteligência artificial como apoio à organização dos meus exames e do registro da consulta, sob responsabilidade do médico que me atende (Res. CFM 2.454/2026) — a decisão e a comunicação são sempre do médico.';
