# Design System — Meus Exames (Dr. Exame)

> **Identidade é inegociável.** Estas regras valem para qualquer tela, nova ou existente.

## Identidade de marca
- **Projeto:** Dr. Exame — assistente de saúde com IA.
- **Cor principal:** verde/teal **`#20b2aa`** (dark `#178f89`, light `#5fc9c3`). **NUNCA alterar** — é a assinatura visual.
- **Cor secundária:** cobre **`#d4a574`** (acentos premium).
- **Robô mascote** (Dr. Exame): faz parte da identidade. **Nunca remover.** Ícone oficial = `web/public/app-icon.png` (robô+escudo). Componente `DrExame.tsx` cobre os usos. **Não** usar `brand.png` (robô inventado) nem `favicon.svg` (errado).
- **Estrelinha ✨ (IA):** símbolo universal de inteligência artificial no app. **Nunca remover.** Deve ser **visível** sobre o badge teal (ícone branco `#fff`, nunca mesma cor do fundo). Ver `FloatingChat.tsx`.

## Filosofia de UI/UX
- **Clean e premium.** Pouco texto, muito espaço em branco.
- **Cards grandes**, arredondados, com respiro. Bordas suaves.
- **Responsivo sempre** — mobile primeiro (regras `xs`), desktop (`sm`+) não pode quebrar.
- **Sem competição visual:** uma ação primária por tela; ações secundárias discretas.
- Robô + estrelinha = vibe "assistente inteligente, amigável, clínico".

## Tokens reais (`packages/web/src/theme.ts`)
- **Modos:** `lightTheme` e `darkTheme` (`buildTheme('light'|'dark')`). Toggle no AppBar (persistido em `localStorage` via `useStore('theme')`). Superfícies mudam; **cores de marca (teal/cobre, gradientes) idênticas nos dois modos**.
- **Light:** bg `#eef7f6` / paper `#ffffff` / text `#2d3748`.
- **Dark:** bg `#0f1818` / paper `#1a2424` / text `#e8eef0`.
- **Tipografia:** Poppins (títulos, `FONT_HEAD`) + Inter (corpo, `FONT_BODY`). `fontSize` base 14.
- **Shape:** `borderRadius` 14 (base); cards 16; chips 8; botões 12.
- **Sombras:** tom teal (light) / profundas escuras (dark).
- **Componentes:** MuiCard (radius 16, borda sutil), MuiButton (gradiente teal `linear-gradient(135deg,#20b2aa,#178f89)`), MuiAppBar (sticky, blur, translúcido), MuiListItemButton (radius 12, hover teal 7%).

## Stack de UI (NÃO MUDAR)
- **react-admin 5.14** (bundla o próprio MUI) + **@mui/material ^7** (não 9 — duplica cópia e quebra tipos/runtime).
- Ícones: `@mui/icons-material` v7 (instalado, usar livremente).
- **Offline-first:** `fetch-cache.ts` cacheia GET `/api/*`.

## Gotchas de UI (ver `.ai/SKILL.md` → Gotchas)
- `navigate(0)`/`reload()` **crasha o APK** → usar `useRefresh()` do react-admin.
- **APK tela branca** = `VITE_BASE` manglado pelo MSYS → sempre `'./'` (relativa).
- React #310 = hook depois de early-return → todos os hooks antes de qualquer `return`.
- **Push não chega** = `channel_id` custom inexistente → remover (Android 8+ descarta).
