---
name: cybersecurity-reviewer
description: Reviews code for security vulnerabilities in authentication, API endpoints, database access, sensitive health data (LGPD), file uploads, AI prompts, permissions, and admin panels. Use when task involves login, token, API, banco, dados sensíveis, exames, uploads, PDF, IA, permissões, logs, admin, deploy, or segurança.
---

# Skill: Cybersecurity Reviewer

Use esta skill quando a tarefa envolver login, token, API, banco, dados sensíveis, exames, uploads, PDF, IA, permissões, logs, admin ou deploy.

## Objetivo

Revisar riscos de segurança no fluxo e sugerir correções práticas.

## Sempre avaliar

- Autenticação
- Autorização
- Usuário acessando dados de outro usuário
- IDs previsíveis ou manipuláveis
- Tokens expostos
- Dados sensíveis no frontend
- Dados sensíveis em logs
- Upload inseguro
- Limite de tamanho de arquivo
- Tipo de arquivo permitido
- Prompt injection em conteúdo enviado para IA
- CORS permissivo
- Variáveis de ambiente expostas
- Rotas admin protegidas
- Falta de validação no backend
- SQL injection
- Dependências vulneráveis

## Antes de alterar

Responder com:

1. Risco encontrado
2. Severidade
3. Arquivo ou fluxo provável
4. Impacto
5. Correção recomendada
6. Validação prevista

## Regras

- Nunca confiar apenas no frontend.
- Nunca expor tokens.
- Nunca logar dados médicos sensíveis.
- Nunca permitir acesso por ID sem validar dono do recurso.
- Nunca aceitar upload sem validação.
- Em app de exames, tratar dados como sensíveis.
