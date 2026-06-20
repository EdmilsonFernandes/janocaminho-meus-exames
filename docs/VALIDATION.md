# Tutorial de Validação — Meus Exames (como testar TUDO)

> Pra você (Edmilson) confirmar que tudo funciona antes de publicar.

## Preparação
- **APK atual:** `drexame-v1.4.10.apk` (instale no celular).
- **Site/PWA:** `janocaminho.com.br/minhasaude/`
- **Testes backend:** `npm test --workspace packages/server` (85/85 verdes).

## 1. Cadastro + Verificação de E-mail
1. Abra o app → "Criar conta".
2. Preencha nome, e-mail (use um e-mail REAL pra receber o código), senha.
3. Deve aparecer a tela **"digite o código de ativação"** com 6 quadradinhos.
4. Abra o e-mail → veja o código GRANDE (caixa teal).
5. **Toque e segure** o código no e-mail → Copiar.
6. Volte no app → **cole** no campo → os 6 quadradinhos preenchem.
7. Toque "Ativar conta" → entra no app. ✅
- ❌ **Sem o código:** a conta NÃO funciona (login bloqueado: "Verifique seu e-mail").

## 2. Login (e-mail/senha + token)
1. **E-mail + senha:** entra normal.
2. **Entrar com token:** toca → recebe código no e-mail → cola nos 6 quadradinhos → entra.
3. **Esqueci a senha:** recebe link no e-mail → redefine → login com nova senha.

## 3. Exames
1. **Enviar exame:** toque "Enviar exame" → selecione PDF/foto → envia.
2. **Editar valor:** toque num valor (✏️) → corrija → Enter → persiste.
3. **Lista agrupada por ano** → expansível (setinha destacada).
4. **Lab/médico** aparece abaixo do título no card.
5. **PDF do exame:** clique em "pág. X" → abre o PDF (no APK: Share → abre no visualizador).

## 4. Relatório Consolidado
1. Menu → "Relatório completo" → "Gerar".
2. **Tela premium de carregamento** (radial teal + robô + msgs rotativas).
3. **"Atualizar"** → mesma animação.
4. **"🔊 Ouvir"** (Dr. Exame fala) → ouve o resumo.
5. Compartilhar (só ícone) / Imprimir (só ícone) → na mesma linha (não expande).

## 5. Evolução (Painel de Controle)
1. Menu → "Evolução".
2. **Chips de filtro** (2×2 mobile): Todos / Fora da faixa / Em mudança / Estável.
3. **Busca fixa** → digite "TSH" → filtra.
4. Cards **recolhidos** → toque pra expandir o gráfico.

## 6. Painel (Dashboard)
1. **"Olá, [nome]"** (sem avatar — ele tá no menu superior).
2. **Score + dica IA** lado a lado (esquerda/direita).
3. **Créditos** como card premium verde.
4. Botão **"＋ Enviar exame"** no topo.

## 7. Push (Notificações)
1. Abra o app → **permite notificações** (1ª vez).
2. **Perfil → 🔔 Token** → copie o token.
3. **Firebase Console** → Messaging → Send test message → cole o token → envia.
4. **Recebe a notificação** no celular. ✅
5. **Scheduler automático:** se você tem um valor alterado, recebe entre **8-11h** (cooldown 3 dias).
6. **Central:** sino 🔔 no topo → página de notificações.

## 8. Portal do Médico
1. **Paciente:** Menu → "Meus Médicos" → "Compartilhar" → preencha nome + CRM + especialidade → selecione scopes (Exames, Evolução, etc.) → "Compartilhar dados".
2. **Médico recebe e-mail** ("X compartilhou com você").
3. **Médico acessa:** `janocaminho.com.br/minhasaude/#/doctor` → cadastra/login.
4. **Vê paciente** na lista → clica → vê os exames (SÓ os autorizados).
5. **Revogar:** paciente volta em "Meus Médicos" → 🗑 → médico perde acesso (some da lista dele).

## 9. Force-Update
1. No EC2: `APP_LATEST_VERSION=X.Y.Z` (maior que o APK) no `.env.prod` + restart.
2. Abre o app → **tela "Atualização necessária"** → botão abre o site.

## 10. Planos + Cobrança
1. Menu → "Planos e Créditos".
2. **Extrato** com ícones + filtros (Todos/Chat/Relatórios/Compras).
3. **No Android:** compra via PIX (assumido — Play rejeita).
4. **Painel admin** (`/admin`): configura UPLOAD_RULES + CREDIT_COSTS em runtime.

## 11. Fora do App (Web/PWA)
- **QR Code:** na landing page (`/#/landing`).
- **Login:** mesmo fluxo (6 quadradinhos + verificação de e-mail).
- **Portal do Médico:** `/#/doctor`.

## Testes Automatizados (pré-deploy)
```bash
npm test --workspace packages/server   # 85/85 devem passar
npm run typecheck --workspace packages/web   # sem erros
```
