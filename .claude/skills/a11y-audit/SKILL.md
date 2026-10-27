---
name: a11y-audit
description: Auditoria WCAG 2.2 de acessibilidade — contraste, teclado, leitor de tela, touch targets, foco. Disparo: "a11y", "acessibilidade", "auditar acessibilidade", "WCAG".
---

# Acessibilidade WCAG 2.2 — Dr. Exame

## Contexto do produto
- Público: 40+ anos, leigo em saúde, ansioso com exames
- Plataformas: Web (react-admin + MUI 7), APK (Capacitor WebView)
- Identidade: teal #20b2aa sobre bg #eef7f6 (light) / #0f1818 (dark)

## O que auditar (em ordem de impacto)

### 1. Contraste de cor (WCAG 1.4.3 — AA)
- Texto corpo ≥ 4.5:1 · Texto grande (18pt+) ≥ 3:1
- Verificar TODAS as combinações: teal sobre bg, texto secondary, chips, botões
- MUI theme.ts: conferir palette.text.primary/secondary/disabled
- Atenção especial: chips pequenos (12px) que usam cores claras

### 2. Touch targets (WCAG 2.5.8)
- Mínimo 44×44px (regra da casa)
- Verificar: icon buttons, chips clicáveis, links em texto
- MUI IconButton default é 40px — verificar se tem padding extra

### 3. Navegação por teclado (WCAG 2.1.1)
- Tab order lógico (header → conteúdo → ações)
- Focus VISÍVEL em todos os interativos (focus-visible ring)
- Sem keyboard traps (especialmente em dialogs e bottom sheets)
- Skip links para conteúdo principal

### 4. Leitor de tela (WCAG 4.1.2)
- aria-label em TODOS os icon-only buttons
- role="status" para toasts/notificações
- alt descritivo em imagens (não "imagem")
- Form inputs com label associado (não só placeholder)
- Headings hierárquicos (h1 → h2 → h3, sem pular)

### 5. Formulários (WCAG 3.3.1-3.3.3)
- Labels visíveis (não só placeholder)
- Erros descritivos com sugestão de correção
- required indicado visualmente E programaticamente
- autocomplete correto (name, email, tel)

### 6. Motion (WCAG 2.3.3)
- prefers-reduced-motion: reduce DESLIGA todas as animações
- Sem piscar > 3× por segundo
- Parallax/scroll-linked com guard

## Como executar

```
1. Ler o arquivo da tela
2. Para cada categoria acima, listar VIOLAÇÕES com file:line
3. Classificar: Critical / Major / Minor
4. Sugerir fix específico (não genérico)
5. Output em tabela markdown
```

## Ferramenta complementar
Rodar via Playwright: `axe-core` scan da página renderizada.
