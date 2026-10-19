# Spike Android — LiveKit (@livekit/client) no WebView Capacitor 7 (19/10/26)

> Veredito do DEV mobile sobre o "ponto de risco #1" do plano F2
> (`docs/research/2026-10-19-livekit-fase2-plano.md`). Spike documental + snippets prontos;
> teste em device real é o passo final do checklist abaixo.

## TL;DR

- **Caminho A (JS no WebView): VIÁVEL, sem blocker.** O Capacitor 7.6.6 (versão exata
  instalada no projeto) **já implementa** o handler `onPermissionRequest` que concede
  câmera/mic ao `getUserMedia` — incluindo o dialog de runtime permission do Android.
  Falta apenas **declarar 2 permissões no AndroidManifest**. Nenhum plugin, nenhum patch,
  nenhuma mudança no `capacitor.config.ts`.
- **Caminho B (plugin nativo wrap do livekit-android): 2-4 semanas e frágil.** O renderer
  de vídeo do SDK nativo é view Android (`SurfaceView`) que NÃO vive dentro do WebView —
  exigiria overlay nativo sincronizado por coordenadas (quebra com teclado/rotação/
  edge-to-edge), matando o requisito "UI 100% nossa em web".
- **Recomendação: Caminho A HOJE.** Critério do plano ("vídeo+áudio estável em device
  real") é atingível no dia 1 com o checklist da seção 5. B fica como plano de contigência
  só se o device real reprovar — e mesmo nesse caso a alternativa honesta seria rever o
  requisito de UI, não o caminho.

## 1. Estado atual do app (lido do repo)

### AndroidManifest (`packages/mobile/android/app/src/main/AndroidManifest.xml`)

| Permissão | Estado | Uso atual |
|---|---|---|
| `CAMERA` | **presente** (L136) | foto de exame (`uses-feature camera` já `required=false`) |
| `RECORD_AUDIO` | **AUSENTE** | — |
| `MODIFY_AUDIO_SETTINGS` | **AUSENTE** | — |
| `INTERNET` / `ACCESS_NETWORK_STATE` | presente | — |
| `BLUETOOTH_CONNECT` | ausente | (opcional p/ fone BT, ver riscos) |

> Nota: issues antigas citam `RECORD_VIDEO` — **não é permissão Android** (é nome de
> recurso WebKit). Não adicionar.

### Capacitor config + MainActivity

- `capacitor.config.ts`: `androidScheme: 'https'` já setado → origem `https://localhost` =
  **secure context** (obrigatório p/ `getUserMedia`). **Nada a mudar.** `allowMixedContent`
  não é necessário (LiveKit Cloud é `wss://`/`https://`).
- `MainActivity extends BridgeActivity` → WebView usa o `BridgeWebChromeClient` **padrão**
  do Capacitor (nada sobrescrito no projeto — conferido; só `addJavascriptInterface` p/
  DxBiometrics/DxHealth, que não interfere).
- Versões: `@capacitor/android` **7.6.6**; minSdk 24 / target 36; Android System WebView
  evergreen via Play (exceto Android 7 — ver riscos).

## 2. A descoberta-chave: Capacitor 7 JÁ concede mídia ao getUserMedia

Fonte: `BridgeWebChromeClient.java` do tag **7.6.6** do capacitor (idêntico no 7.0.0 e no
main) — código verbatim:

```java
@Override
public void onPermissionRequest(final PermissionRequest request) {
    List<String> permissionList = new ArrayList<>();
    if (Arrays.asList(request.getResources()).contains("android.webkit.resource.VIDEO_CAPTURE")) {
        permissionList.add(Manifest.permission.CAMERA);
    }
    if (Arrays.asList(request.getResources()).contains("android.webkit.resource.AUDIO_CAPTURE")) {
        permissionList.add(Manifest.permission.MODIFY_AUDIO_SETTINGS);
        permissionList.add(Manifest.permission.RECORD_AUDIO);
    }
    if (!permissionList.isEmpty()) {
        String[] permissions = permissionList.toArray(new String[0]);
        permissionListener = (isGranted) -> {
            if (isGranted) {
                request.grant(request.getResources());
            } else {
                request.deny();
            }
        };
        permissionLauncher.launch(permissions);   // dialog de RUNTIME permission do Android
    } else {
        request.grant(request.getResources());
    }
}
```

Fluxo resultante quando o `@livekit/client` chama `getUserMedia({video,audio})`:

```
JS: getUserMedia → WebView: PermissionRequest (VIDEO_CAPTURE|AUDIO_CAPTURE)
  → Capacitor: lança dialog do sistema (CAMERA + RECORD_AUDIO + MODIFY_AUDIO_SETTINGS)
  → usuário aceita → request.grant() → stream flui pro SDK
```

Único pré-requisito: as permissões **declaradas no manifest** (o launcher do sistema só
pede o que está declarado). É exatamente o que falta (2 linhas).

## 3. Caminho A — o que falta exatamente

| Item | O quê | Esforço |
|---|---|---|
| Manifest | 2 linhas (`RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`) — snippet A | 5 min |
| capacitor.config.ts | NADA (`androidScheme` já ok) | 0 |
| Plugin/patch nativo | **NENHUM obrigatório** | 0 |
| Web | `npm i @livekit/client` (packages/web) + import `lazy()` na rota (padrão do repo p/ páginas pesadas) | trivial |
| Guard | `isBrowserSupported()` do SDK antes de oferecer LiveKit; false → fallback F1 (Meet/Custom Tab, já em prod) = degradação da casa | ~10 LOC |
| Play Console | Microfone entra na lista de permissões do app; câmera já existe (foto). Sem formulário de permissão sensível extra | burocrático |
| Spike device real | snippet B + APK debug | ~1h |
| Opcional (se áudio capengar) | mini-bridge speakerfone/keep-screen-on no padrão DxBiometrics — snippet C | ~30 LOC Java |

LOC total do caminho A (fora a tela de produto, que é igual nos dois caminhos):
**~40-60 LOC de spike/guard + 2 linhas de manifest**. A tela completa (pré-join/in-call/
pós, dias 3-4 do plano) é trabalho de UI web normal, 300-500 LOC, sem risco Android.

### Snippet A — AndroidManifest (colar junto ao bloco `<!-- Permissions -->`, L132+)

```xml
    <!-- Telemedicina (LiveKit no WebView, F2): o BridgeWebChromeClient do Capacitor 7
         pede estas permissões em RUNTIME quando o getUserMedia do WebView as solicita —
         mas só consegue pedir o que está DECLARADO aqui. Sem RECORD_AUDIO o áudio da
         teleconsulta morre com NotAllowedError; sem MODIFY_AUDIO_SETTINGS o roteamento
         de áudio (speaker/earpiece) não responde. CAMERA já existe (foto de exame). -->
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

### Snippet B — página de spike (rota escondida, web)

```tsx
// packages/web/src/pages/SpikeVideo.tsx — ROTA TEMPORÁRIA DE SPIKE (remover antes do merge)
import { useEffect, useRef, useState } from 'react';
import { Box, Button } from '@mui/material';

export default function SpikeVideo() {
  const vidRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState('idle');
  const [err, setErr] = useState('');

  useEffect(() => {
    import('@livekit/client').then(({ isBrowserSupported }) => {
      setStatus(isBrowserSupported() ? 'sdk: suportado' : 'sdk: NÃO suportado (fallback Meet)');
    });
  }, []);

  const testCamMic = async () => {
    try {
      setStatus('pedindo permissões...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (vidRef.current) {
        vidRef.current.srcObject = stream;
        await vidRef.current.play();
      }
      const tracks = stream.getTracks().map(t => `${t.kind}:${t.label}`).join(' | ');
      setStatus(`OK — ${tracks}`);
    } catch (e) {
      setErr(String(e));
      setStatus('FALHOU');
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Button variant="contained" onClick={testCamMic}>Testar câmera + mic</Button>
      <p>{status}</p>
      {err && <p style={{ color: 'red' }}>{err}</p>}
      <video ref={vidRef} playsInline muted autoPlay style={{ width: '100%', maxWidth: 420, background: '#000' }} />
    </Box>
  );
}
```

Checklist device real: preview local (câmera frontal + indicador de mic nos dois tracks)
→ depois conectar `Room.connect(url, token)` com token do LiveKit Cloud sandbox
(playground.quickstart) entre 2 aparelhos → 10 min de chamada. Se os dois passarem,
critério do plano atendido.

### Snippet C — bridge opcional speakerfone + keep-screen-on (só se o teste apontar)

Padrão já usado no projeto (`DxBiometrics`/`DxHealth` em `MainActivity.java`):

```java
    // --- Telemedicina (F2): áudio/latência do WebView — injetado como window.DxCall ---
    private class CallBridge {
        @JavascriptInterface
        public void setSpeakerphone(boolean on) {
            runOnUiThread(() -> {
                android.media.AudioManager am = (android.media.AudioManager) getSystemService(Context.AUDIO_SERVICE);
                am.setMode(on ? android.media.AudioManager.MODE_IN_COMMUNICATION
                              : android.media.AudioManager.MODE_NORMAL);
                am.setSpeakerphoneOn(on);
            });
        }
        @JavascriptInterface
        public void setKeepScreenOn(boolean on) {
            runOnUiThread(() -> { if (bridge != null && bridge.getWebView() != null)
                bridge.getWebView().setKeepScreenOn(on); });
        }
    }
    // no onCreate(), após injectBiometricBridge():
    bridge.getWebView().addJavascriptInterface(new CallBridge(), "DxCall");
```

Chamar no JS da in-call: `window.DxCall?.setKeepScreenOn?.(true)` ao entrar,
`false` ao sair. (Preferir testar primeiro sem isso: WebView AEC + routing padrão
atende na maioria dos casos; `navigator.wakeLock` também existe no WebView 84+.)

## 4. Caminho B — plugin nativo (livekit-android) e por que NÃO

- SDK: `io.livekit:livekit-android` via **Maven Central** (não JitPack), estável.
- **Blocker de arquitetura**: os tiles de vídeo do SDK nativo são `VideoSurface`
  (SurfaceView/TextureView) — views Android que não renderizam dentro do WebView.
  Para manter UI web seria preciso: (a) overlay nativo posicionado por coordenadas
  vindas do JS — frágil com teclado, rotação, edge-to-edge (que o app já trata à mão),
  scroll e gesture-nav; ou (b) transportar frames como bitmaps pro canvas — inviável
  (CPU/bateria). Ou seja, **B quebra o requisito "UI 100% design system Dr. Exame"**.
- Esforço: plugin Capacitor Kotlin (registro, eventos, ciclo de vida, foreground
  service p/ chamada em background, release/maven local) = **2-4 semanas** + manutenção
  contínua de versão de SDK nativo. vs A: **~1-2 dias**.
- Não existe plugin Capacitor-LiveKit mantido pela comunidade (busca GitHub: nenhum
  repositório de plugin; só apps completos usando o caminho A com WebView).
- Decisão: B só se o device real reprovar A de forma irrecuperável (ex.: codec/hw encode
  quebrado em chipset específico) — e aí o caminho honesto é repensar requisito de UI,
  não embrulhar SurfaceView.

## 5. Checklist do dia 1 (spike em device real)

1. Colar Snippet A no manifest.
2. `npm i @livekit/client` no `packages/web`; criar rota `#/spike-video` com Snippet B
   (fora do menu; remover antes do merge).
3. `cd packages/mobile && npm run sync && cd android && ./gradlew assembleDebug`.
4. Instalar APK debug; testar preview (passo 1 do snippet B).
5. Criar sala no LiveKit Cloud (free tier) via playground; conectar 2 devices com tokens.
6. Critério GO/NO-GO: **10 min de chamada 1:1 estável** (vídeo dos dois lados, áudio
   sem corte, sem crash) em device mid-range real.
7. Se áudio rotear errado/fone BT falhar → Snippet C antes de considerar NO-GO.

## 6. Riscos residuais do caminho A (todos com mitigação)

| Risco | Evidência | Mitigação |
|---|---|---|
| Fone Bluetooth pode não ser usado como saída (áudio sai no speaker) | livekit/client-sdk-js#1507 — afeta Chrome Android **e** Capacitor; fechado not-planned (limitação do WebRTC no Android, não do Capacitor); SDK nativo tem os mesmos bugs (client-sdk-android#650/#649) | UX: sugerir fio/speaker; se crítico, rotear via Snippet C. Não é blocker p/ lançamento |
| Android 7 (minSdk 24): WebView congelado ~Chromium 88 (sem update desde 2021) | Base de users Android 7 é pequena; WebRTC existe no 88 | `isBrowserSupported()` → false = fallback F1 Meet/Custom Tab (já em prod). Degradação da casa |
| Tela apaga durante chamada → WebView pausa → chamada cai | Comportamento padrão do WebView | `navigator.wakeLock` (WebView 84+) na in-call; garantia total via Snippet C `setKeepScreenOn` |
| Speaker vs earpiece | WebView usa AudioManager modo normal | Testar no device; Snippet C `setSpeakerphone(true)` se necessário |
| Encode de vídeo no WebView | VP8/H264 por hardware na maioria dos chipsets | Chamada 1:1 é leve; `adaptiveStream` do LiveKit cobre rede fraca |
| iOS (quando entrar): WKWebView getUserMedia ok 14.3+ | — | Info.plist: `NSCameraUsageDescription` + `NSMicrophoneUsageDescription`; mesmo SDK JS |
| Memória em sessões longas (elementos `<video>` detached) | livekit/client-sdk-js#1432 | Destruir tracks + remover elementos ao sair; tela já faz unmount da rota |

## 7. Fontes

- Código do Capacitor 7.6.6 (tag exato do projeto):
  [BridgeWebChromeClient.java](https://github.com/ionic-team/capacitor/blob/7.6.6/android/capacitor/src/main/java/com/getcapacitor/BridgeWebChromeClient.java)
  — handler `onPermissionRequest` com runtime permissions (verificado também no 7.0.0 e main).
- [livekit/client-sdk-js#1034](https://github.com/livekit/client-sdk-js/issues/1034) —
  "Everything works fine on Chrome browser and **native Android WebView**" (problema só no fork X5).
- [livekit/client-sdk-js#1507](https://github.com/livekit/client-sdk-js/issues/1507) —
  Bluetooth Android: afeta Chrome e Capacitor; limitação de plataforma, fechado not-planned.
- [livekit/client-sdk-js README](https://github.com/livekit/client-sdk-js) — suporte
  Chrome/Android; `isBrowserSupported()` p/ capability check; sem restrição a WebView.
- [ionic-team/capacitor#6967](https://github.com/ionic-team/capacitor/issues/6967) —
  erro mic getUserMedia (2023, Cap 5): fechado needs-repro/not-planned; causa típica =
  manifest sem RECORD_AUDIO/MODIFY_AUDIO_SETTINGS — exatamente o que o Snippet A corrige.
- Busca por plugin Capacitor-LiveKit mantido: **nenhum** (GitHub, out/26).
- [100ms: WebRTC in WebView](https://www.100ms.live/blog/webrtc-webview) — background de
  permissões/secure context em WebView (corrobora requisitos).

---
**Veredito final: CAMINHO A. Sem blocker. Manifest de 2 linhas + guard `isBrowserSupported()`
+ fallback Meet existente. Caminho B reservado a repensar de raiz (overlay nativo quebra o
requisito de UI) — não é "plano B", é outro produto.**
