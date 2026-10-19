# Teleconsulta LiveKit F2 — Spec de UX/UI (19/10/26)

> Fonte: `docs/research/2026-10-19-livekit-fase2-plano.md` (aprovado). Mobile-first 390×844,
> depois desktop. Identidade inegociável: teal `#20b2aa`, cobre `#d4a574`, robô (`DrExame`),
> Poppins/Inter, cards 20px, clean/premium. Dark mode obrigatório (superfícies mudam, marca não).
> Sem env LiveKit no server → tela NEM abre: Reminders segue fluxo Meet atual (degradação da casa).

## Princípios
1. **1 ação primária por tela** (gradiente teal). Tudo mais é ghost/ícone.
2. Vídeo é o fundo, UI flutula por cima com vidro (`blur(18px) saturate(160%)`, padrão AppBar).
3. Paciente nunca se sente "num software": microcopy calorosa, zero jargão (nada de "room", "track").
4. Confiança clínica: CRM visível sempre que o médico aparece.

---

## 0. Componente raiz

Rota paciente: `/teleconsulta/:reminderId` (via card do Reminders.tsx — botão atual vira navegação,
mantém WhatsApp share). Portal médico: mesma rota com `role="doctor"`.
Um componente, 3 fases internas (state machine): `prejoin → in-call → ended`.

```
<TeleconsultaCall
  reminderId: string
  role: 'patient' | 'doctor'
  onExited?: () => void          // volta p/ Reminders / ficha do paciente
/>
```

---

## 1. Pré-join (paciente) — `<PreJoinCard>`

**Pula direto pro in-call se `consentAt` já existe** (chip "telemedicina autorizada" no header).

Layout 390 (scroll se precisar, ideal cabe sem scroll):

```
┌──────────────────────────────┐
│ Card 20px                    │
│ ┌──────────────────────────┐ │
│ │ PREVIEW CÂMERA 16:9      │ │  ← espelhado (efeito selfie), radius 16px
│ │ (placeholder robô 96px   │ │     placeholder: paper elevado + DrExame
│ │  se sem permissão)       │ │     + texto "Sorria, você está pronto ✨"
│ └──────────────────────────┘ │
│ Resumo (H6 Poppins):         │
│   🩺 Dra. Ana Souza (CRM)    │  ← reusar linha atual do Reminders L227
│   Teleconsulta de retorno    │  ← r.title
│   Hoje · 14:00               │  ← fmtDate atual, curto
│ [texto consentimento Art.15] │  ← 13px, text.secondary — MESMO TEXTO do
│                              │     dialog atual (Reminders L483, CFM 2.314/22)
│ ( ) Autorizar e entrar  ▶──  │  ← PRIMÁRIO: gradiente teal, pill, fullWidth,
└──────────────────────────────┘     height 48px, loading spinner ao tocar
```

**Estados da câmera** (chip 12px sobre o preview, canto sup. esq., vidro escuro):
| Estado | UI | Ação |
|---|---|---|
| Ok | nada (preview vivo) | — |
| Bloqueada/erro | placeholder robô + chip "Câmera bloqueada" | CTA secundário outlined teal "Permitir câmera" que chama `navigator.permissions`/re-request; texto 12px "Você também pode entrar só com áudio." |
| Sem dispositivo | placeholder + chip "Sem câmera" | nenhum CTA, entra normal (áudio) |

Preview NÃO bloqueia entrada (medo de câmera ≠ consulta perdida). Mic idem.

**Botão**: "Autorizar e entrar" → PUT `/reminders/:id/consent` → GET `/api/teleconsulta/:id/join`
→ in-call. Loading no botão (`disabled` + spinner 20px). Erro → Snackbar "Não deu pra entrar.
Tenta de novo em instantes." + botão volta habilitado.
Pós-consent: chip `VerifiedIcon` "telemedicina autorizada" aparece no header do in-call.

---

## 2. In-call — `<CallScreen>`

Fundo `#0c1818` (mais escuro que paper dark) nos dois modos — vídeo é o herói.

### Layout mobile (390)
- **Tile principal**: médico, full-bleed, `object-fit: cover`.
- **PiP paciente**: 96×132px (9:12.5... usar 96×128, ratio 3:4), radius 16px, borda 2px
  `rgba(255,255,255,.25)`, canto sup. dir., arrastável (snap 4 cantos), espelhado.
- **Side-by-side** (≥2 médicos? não nesta fase) — não.
- **Header** (flutuante, vidro): `DrExame size={28}` + "Dra. Ana Souza · CRM 123456-SP"
  (13px/700, branco) + cronômetro discreto `14:32` (12px, opacity .8, tabular-nums).
  `padding-top: env(safe-area-inset-top)` (edge-to-edge Android 15+).
- **Espera**: tile médico mostra avatar círculo 88px (inicial + nome + CRM) + "Aguardando
  a Dra. Ana…" + spinner teal. Pulso suave (keyframe `pulse` já existe no Reminders L28).

### Desktop (≥900)
Mesma tela centralizada `LAYOUT.narrow`-ish: header igual, PiP vira janela-inset
200×266px canto inf. dir. dos controles. Tile principal mantém cover, max-height 72vh,
radius 20px, sombra 8.

### Controles flutuantes (bottom bar, vidro, radius 20px, gap 12px, pb safe-area)
| Controle | Visual | Tam | Estado off |
|---|---|---|---|
| Mic | IconButton círculo vidro `rgba(255,255,255,.14)`, ícone branco 26px | **56px** | fundo `rgba(255,255,255,.92)`, ícone `#dc2626` + slash |
| Câmera | idem | 56px | idem |
| **Encerrar** | círculo **cobre** `#d4a574`, ícone `CallEnd` branco | 56px | — (primário visual, único colorido) |

Todos com `aria-label` e `aria-pressed`. Haptic `hapticLight()` no toque.

**Encerrar** → dialog leve (ConfirmDialog padrão): título "Encerrar consulta?",
texto "A chamada vai terminar pra você e pro médico.", confirmar "Encerrar" (cobre),
cancelar "Continuar". Paciente encerrar ≠ encerrar pro médico (só sai da sala).

### Indicadores de conexão (Snackbar top, vidro, 12.5px)
- Conectando: "Conectando…" + spinner.
- Reconectando: "Conexão instável — reconectando…" (ícone wifi_off).
- Participante entrou: "Dra. Ana entrou ✨" (auto-hide 2.5s) + hapticSuccess.

### Estados de presença
| Quem está | Tile principal | PiP/secondary |
|---|---|---|
| Só médico | médico (full) | paciente |
| Só paciente (médico saiu/ainda não) | avatar espera "Aguardando…" | paciente |
| Ambos | médico | paciente (pequeno) |
| Remoto câmera off | avatar círculo + nome | — |

---

## 3. Pós-chamada — `<PostCallCard>`

Card 20px centralizado, `maxWidth 420`:
- `DrExame size={72}` + check teal em círculo (ícone `CheckCircle`, `#5fc9c3`).
- H5 "Consulta encerrada" + duração "· 15 min" (14px, text.secondary) — duração do server.
- **Se médico**: `QuickNote` opcional — TextField multiline 3 rows, 12px hint "Nota rápida
  sobre a consulta (opcional)" + botão texto "Salvar nota". Salva no reminder (F3 amplia).
- Primário: **"Voltar aos lembretes"** (paciente) / **"Voltar à ficha"** (médico) — gradiente
  teal, pill. Único primário. `hapticSuccess()` ao aparecer.

---

## 4. Portal médico

Mesmo `TeleconsultaCall role="doctor"`:
- Entrada: botão `VideocamIcon` "Entrar na teleconsulta" junto ao "Agendar" na ficha
  (PatientSummary/DoctorPortal), pill outlined teal 40px alto — já existe padrão.
- **Sem consent** (paciente não autorizou): PreJoinCard simplificado — sem preview próprio?
  Não: médico também tem preview (mesmo componente). Consent NÃO é exigido do médico;
  mostra chip âmbar 12px "Paciente ainda não autorizou" e botão "Entrar e aguardar"
  (entra; se paciente sem consent, join do paciente continua barrado no server).
- Header troca o nome: "Paciente: João Silva" + **badge "Médico"** (chip pill 8px, cobre
  `rgba(212,165,116,.2)` + `secondary.dark`, 11px/800) ao lado do nome — papel claro.
- Pós-chamada com QuickNote (§3).

---

## 5. Tokens exatos

| Token | Valor |
|---|---|
| primary.main / dark / light | `#20b2aa` / `#178f89` / `#5fc9c3` |
| tealText (AA em texto) | light `#0f766e` · dark `#5fc9c3` |
| cobre | `#d4a574` / `#b88a54` / `#e0bc97` |
| dangerText | light `#dc2626` · dark `#f87171` |
| Fundo in-call | `#0c1818` (fixo, 2 modos) |
| Superfícies | light paper `#ffffff` bg `#FAFBFC` · dark paper `#1a2424` bg `#0f1818` |
| Texto sobre vídeo/vidro escuro | `#ffffff` com opacity .8–1 (AA garantido sobre `rgba(0,0,0,.45)` mín.) |
| Vidro flutuante | `rgba(15,24,24,.68)` + `blur(18px) saturate(160%)` |
| Radius | preview/tiles 16px · cards 20px · chips 8px · botões pill 999px · controles círculo |
| Tipografia | Títulos Poppins 700/800 (H6 1.1rem) · corpo Inter 14 · chips 11–12 · cronômetro 12 `font-variant-numeric: tabular-nums` |
| Spacing | gutter 16px (xs) · card padding 20px · gap controles 12px · header h 56px |
| Gradiente primário | `linear-gradient(135deg,#20b2aa,#178f89)` shadow `0 4px 12px rgba(32,178,170,.30)` |
| Focus ring | `2px solid #178f89` (light) / `#5fc9c3` (dark), offset 3 |
| Ícones | `@mui/icons-material` v7 26px controles · 16px chips |

## 6. Microcopy (PT-BR, curta e calorosa)

| Onde | Texto |
|---|---|
| Título pré-join | "Sua consulta vai começar" |
| Preview placeholder | "Sorria, você está pronto ✨" |
| Câmera bloqueada | "Câmera bloqueada" + "Permitir câmera" + "Você também pode entrar só com áudio." |
| Consent (idêntico ao atual) | "Autorizo o atendimento por telemedicina e a transmissão de imagens e dados nesta consulta, conforme a Resolução CFM 2.314/2022. Sei que posso negar ou revogar este consentimento a qualquer momento, e que ele fica registrado com data e hora." |
| CTA | "Autorizar e entrar" (já consentido: "Entrar na consulta") |
| Espera | "Aguardando a Dra. Ana…" |
| Entrou | "Dra. Ana entrou ✨" |
| Reconexão | "Conexão instável — reconectando…" |
| Encerrar dialog | "Encerrar consulta?" / "A chamada vai terminar pra você e pro médico." / "Encerrar" · "Continuar" |
| Pós | "Consulta encerrada · 15 min" / "Voltar aos lembretes" |
| Erro join | "Não deu pra entrar. Tenta de novo em instantes." |

## 7. Anti-checklist (QA deve bater)

- [ ] Contraste AA: texto sobre vídeo sempre sobre vidro `rgba(0,0,0,.45)+`; tealText p/ teal em papel.
- [ ] Targets: controles 56px, botões 48px, chips informativos podem ser <44 (não interativos).
- [ ] 1 primário por tela (pré-join: Autorizar · in-call: Encerrar cobre · pós: Voltar).
- [ ] Dark mode: pré-join/pós em superfícies do tema; in-call fixo escuro; marca idêntica.
- [ ] Robô presente (header in-call + pré-join placeholder + pós-check).
- [ ] safe-area top/bottom (edge-to-edge); `useRefresh()`/navegação — nunca `reload()`.
- [ ] Rota `/teleconsulta/:id` respeita bottom-nav? NÃO — tela imersiva SEM bottom-nav e SEM
      menu (fullscreen Dialog/rota dedicada), back gesture = dialog de encerrar (não sai direto).
- [ ] Teclado "Aa grande" (18px raiz): preview e controles em px, textos em rem — nada quebra.
- [ ] Textos sem jargão: nunca "room/sala", "token", "track" — sempre "consulta/chamada".

## 8. Componentes sugeridos (sem implementar)

```
TeleconsultaCall    { reminderId, role, onExited }              // state machine + fetch join
PreJoinCard         { summary, cameraState, onConsent, loading } // §1
CallScreen          { role, doctorName, crm, patientName, tracks } // §2
VideoTile           { track, mirrored?, avatarFallback, label }   // cover, avatar espera
CallHeader          { title, subtitle, elapsedSec, roleBadge, consented }
CallControls        { micOn, camOn, onToggleMic, onToggleCam, onEnd }
EndCallDialog       { open, role, onConfirm, onCancel }           // usa ConfirmDialog
PostCallCard        { role, durationMin, onExit, onSaveNote? }    // §3 + QuickNote
```

Página imersiva: nova rota no App.tsx (`lazy()`, padrão Code splitting), fora do AppLayout.
