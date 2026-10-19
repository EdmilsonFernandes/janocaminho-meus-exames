# Fase 2 Telemedicina — LiveKit embutido no app (plano, 19/10/26)

> Decisão do dono (19/10/26): LiveKit venceu Jitsi SDK (UI 100% nossa, APK ~5-10MB vs 30-60MB,
> SDK oficial Kotlin, free tier 5.000 min-participante/mês ≈ 83 consultas de 30min).
> Fase 1 (Meet automático + Custom Tab) está em prod e CONTINUA como fallback.

## Objetivo
Teleconsulta com vídeo **dentro do app** (paciente e médico), tela 100% design system Dr. Exame
(teal/cobre/robô), consentimento Art. 15 CFM 2.314/22 reaproveitado.

## Arquitetura
```
Agendamento (já existe) ─ createMeet(vivo) OU createLiveKitRoom(novo, default)
        │  Reminder ganha: provider ('meet'|'livekit'), roomName
        ▼
/teleconsulta/:id (rota nova)
   paciente: pré-join → consent PUT /:id/consent (já existe) → GET /api/teleconsulta/:id/join
   join: valida owner/share + consentAt → server-sdk gera access token
         (identity=patient|doctor, room=teleconsulta-<reminderId>, TTL=+2h)
        ▼
@livekit/client conecta → tela custom (VideoTrack tiles, botões Mute/Câmera/Encerrar NOSSOS)
```

- **LiveKit Cloud** pra começar (free tier; `LIVEKIT_URL` + `LIVEKIT_API_KEY/SECRET` no env —
  degradação da casa: sem env → não oferece LiveKit, vale Meet/manual).
- **Pós-chamada**: grava duração no reminder + `audit('TELECONSULTA_ENDED')` (await! família
  void-audit extinta 19/10) — base da "documentação pro convênio" (gravação em si = F3).

## Telas (mobile-first 390 + desktop)
1. **Pré-join**: preview de câmera, texto Art.15 + botão "Autorizar e entrar" (fluxo já validado
   no QA do lote Teams), chip "telemedicina autorizada".
2. **In-call**: tiles redondos grandes (estilo WhatsApp/Meet premium), controles flutuantes teal,
   header robô + nome do médico/paciente, botão encerrar cobre.
3. **Pós**: "Consulta encerrada · Xmin" + feedback.

## APK (ponto de risco #1 — spike no dia 1)
- Tentativa A: `@livekit/client` (JS) direto no WebView — precisa permissões câmera/mic no
  AndroidManifest + handler `onPermissionRequest` (verificar Capacitor 7; se faltar, mini plugin).
- Plano B (se A capengar): plugin Capacitor fino wrap do `livekit-android` (SDK oficial).
- Critério de decisão: video+áudio estáveis num device real até o fim do dia 1.

## Esforço (~5-7 dias)
| Dia | O quê |
|---|---|
| 1 | Conta LiveKit Cloud + env + spike APK (A vs B) |
| 2 | Server: join tokens, provider/roomName no schema (migration aditiva), endpoint |
| 3-4 | Tela paciente (pré-join + in-call + pós) |
| 5 | Portal médico entra na mesma sala (mesma tela, papel doutor) |
| 6 | QA Playwright + device real + AAB (CI gera sozinho no bump) |
| 7 | Folga p/ imprevisto (permissões, fallback) |

## Não-fazer nesta fase (mantém escopo)
Gravação de vídeo (F3, Jibri/LiveKit Egress + jurídico Art.17), self-host BR (quando >83
consultas/mês ou LGPD apertar), cobrança por teleconsulta (regra de crédito segue como hoje).
