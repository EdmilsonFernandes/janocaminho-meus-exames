---
name: performance-reviewer
description: Diagnoses and fixes UI performance issues: slow screens, large lists, heavy images, multiple API calls, bundle size, rendering, and memory. Use when task involves lentidão, performance, lista grande, imagens pesadas, bundle, renderização, or otimização.
---

# Skill: Performance Reviewer

Use esta skill quando a tarefa envolver tela lenta, lista grande, imagens pesadas, múltiplas chamadas, bundle, renderização, mobile ou web performance.

## Objetivo

Encontrar gargalos de performance e propor melhorias seguras sem quebrar comportamento.

## Sempre avaliar

- Chamadas duplicadas de API
- Re-renderizações desnecessárias
- Componentes pesados
- Listas sem paginação ou virtualização
- Imagens sem otimização
- Bundle grande
- Imports pesados
- Cálculos dentro do render
- Estados globais desnecessários
- Loading e skeleton
- Cache quando fizer sentido
- Debounce em busca/filtros
- Uso correto de memoização quando necessário

## Antes de alterar

Responder com:

1. Gargalos prováveis
2. Impacto para usuário
3. Arquivos envolvidos
4. Correções de baixo risco
5. Validação prevista

## Regras

- Não otimizar prematuramente sem evidência.
- Preferir correções simples primeiro.
- Não mudar contrato de API sem necessidade.
- Validar comportamento após otimização.
