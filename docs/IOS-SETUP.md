# iOS — abrir o Meus Exames no Mac (primeira vez)

> Scaffold gerado em 20/08/2026 (`cap add ios`). O projeto Xcode vive em
> `packages/mobile/ios/` — irmão do `android/`, mesmo app web (`www/`).
> **Android não mudou em nada** (guards iOS são no-op lá).

## O que já está pronto

- Projeto Xcode completo (`ios/App/App.xcworkspace`), bundle `com.janocaminho.drexame`.
- Ícones + splash (robô oficial, fundo `#eef7f6`) via `@capacitor/assets`.
- `Info.plist`: textos de permissão (câmera/foto/Face ID — sem eles a Apple reprova),
  orientação **portrait** (igual ao Android).
- Guards no web: scanner ML Kit só Android (iOS usa "PDF ou foto"), push desligado no
  iOS até a fase APNs/FCM, Play in-app update só Android.

## No Mac (ordem)

1. `git pull && npm install` (na raiz) e `cd packages/mobile && npm run sync`
   (builda o web e copia o `www` pro Android E iOS).
2. Abrir **`packages/mobile/ios/App/App.xcworkspace`** (o `.xcworkspace`, não o `.xcodeproj`).
3. Xcode → Settings → Accounts → adicionar seu Apple ID.
4. Selecionar o target **App** → aba *Signing & Capabilities* → marcar
   *Automatically manage signing* → escolher seu **Team** (aparece com a Apple ID grátis;
   para TestFlight/App Store, precisa da conta paga US$99/ano).
5. Plugue o iPhone (cabo) → selecionar o aparelho no topo → **▶ Run**.
   - Primeira vez: ajustar no iPhone *Ajustes → Geral → VPN e gerenciamento* → confiar em você.
   - **Apple ID grátis:** o app instalado expira em **7 dias** (reinstala pelo Xcode); serve pra avaliar.
6. Quando quiser subir pra **TestFlight**: Product → **Archive** → *Distribute App* →
   *App Store Connect* (exige conta paga + app criado em https://appstoreconnect.apple.com).

## Versionamento iOS

- Versão fica no Xcode (target App → *General* → *Version* / *Build*), NÃO no `build.gradle`.
- Manter `Version` = `versionName` do Android (ex.: 2.7.93) e `Build` = número crescente
  (pode começar em 1; a Apple não exige igualar o versionCode).

## Pendências conhecidas (fase 2+)

| Item | Estado | Caminho |
|---|---|---|
| Login Google no iOS | Precisa `VITE_GOOGLE_IOS_CLIENT_ID` (+ `GoogleService-Info.plist` no Xcode + URL scheme) | Console Firebase → add app iOS |
| Push no iOS | Desligado de propósito (token APNs ≠ FCM) | Firebase iOS SDK no Xcode (FCM token) ou envio APNs no server |
| Biometria Face ID | Degrada sozinho (botão não aparece) | Bridge Swift (LocalAuthentication + Keychain), padrão `DxBiometrics` |
| Card de atividade | Degrada sozinho (Health Connect não existe no iOS) | HealthKit (bridge Swift) |
| Escanear documento | Botão oculto; usa "PDF ou foto" | Plugin iOS de scanner de documento (pago) ou VisionKit |
| TTS (áudio) | Comunidade v6 — testar no device; se falhar, guardar por plataforma | `utils/nativeDoc.ts` |

## Review Apple (quando publicar)

- App de **saúde**: preencher *Privacy Nutrition Labels* (dados de saúde, fotos, ID).
- Conta demo (a mesma do Play review) em *App Review Information*.
- Disclaimer "conteúdo educativo, não substitui o médico" visível — já existe no app.
- Sem política de 12 testers: conta pessoal publica direto (review ~24-72h).
