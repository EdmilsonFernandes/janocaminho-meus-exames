# Runbook — Mover o Dr. Exame para um subdomínio (fix do bug de roteamento)

> **Problema (F0.1):** `https://janocaminho.com.br/minhasaude` (sem `#`) abre o app do
> **Já no Caminho** (delivery), não o Dr. Exame. Causa-raiz: **deadlock de Service Worker**.
>
> O servidor está correto (`curl` devolve o HTML certo do Dr. Exame). O SW do EdEspeto,
> registrado no escopo `/` (raiz), intercepta a navegação para `/minhasaude/` e entrega o
> shell do delivery **antes** do `index.html` do Dr. Exame carregar. O SW no-op do Dr. Exame
> (`packages/web/public/sw.js`, escopo `/minhasaude/`, registrado em `index.html`) só roda
> **depois** de carregar — mas o SW do EdEspeto impede esse carregamento. Deadlock.
>
> Não dá para quebrar o deadlock só pelo código do Dr. Exame sem mexer no EdEspeto (proibido).
>
> **Solução:** mover o Dr. Exame para `exames.janocaminho.com.br`. SW do EdEspeto (escopo `/`
> de `janocaminho.com.br`) **não alcança** outro subdomínio. Fim do deadlock.

Este runbook é **infra** (DNS + nginx no EC2) — não é código no repo. Execute na ordem.

---

## 1. DNS (no painel do seu provedor de domínio)
Crie um registro apontando o subdomínio para o mesmo IP da EC2:

| Tipo | Nome | Valor |
|---|---|---|
| `A` | `exames` | `<IP-DA-EC2>` (mesmo de `janocaminho.com.br`) |

Se já usa CNAME/ALIAS para a raiz, crie um `CNAME exames → janocaminho.com.br.` como alternativa.
Aguide a propagação (`dig exames.janocaminho.com.br` deve resolver o IP da EC2).

## 2. nginx no EC2 (server block do subdomínio)
O app do Dr. Exame já sobe no container `meus-exames-app` ouvindo em `127.0.0.1:4010`
(ver `docker-compose.prod.yml`). Crie um novo **server block** só para o subdomínio — ele
serve o build estático + faz proxy do `/api` para o mesmo container:

```nginx
server {
    listen 443 ssl http2;
    server_name exames.janocaminho.com.br;

    # SSL (gere com certbot após criar o bloco :80 — ver passo 3)
    ssl_certificate     /etc/letsencrypt/live/exames.janocaminho.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/exames.janocaminho.com.br/privkey.pem;

    # Tudo vai pro container do Dr. Exame (estático + /api/* + /api/files/*)
    location / {
        proxy_pass         http://127.0.0.1:4010;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;   # extração de IA pode demorar
    }

    client_max_body_size 12m;      # upload de PDF
}
```

> Não inclua `minhasaude` no `proxy_pass` — o container serve na raiz dele. O `/minhasaude`
> é só um path do nginx atual; no subdomínio próprio, a raiz já é o Dr. Exame.

## 3. SSL (certbot) para o subdomínio
```bash
sudo certbot --nginx -d exames.janocaminho.com.br \
  --redirect --agree-tos -m contato@janocaminho.com.br
```
O certbot cria o bloco `:80`, emite o cert e injeta o `:443`/redirect automaticamente.

## 4. Converter o `/minhasaude` antigo em redirect (não quebrar links/QR antigos)
No server block **da raiz** (`janocaminho.com.br`), troque o `location /minhasaude` que
serve o app por um 301 para o subdomínio:

```nginx
location /minhasaude {
    return 301 https://exames.janocaminho.com.br$request_uri;
}
```
Assim o QR e links antigos continuam funcionando (redirecionam). **Atenção:** o redirect é um
novo documento top-level no subdomínio — o SW do EdEspeto (outro subdomínio) não intercepta.

## 5. Recarregar nginx
```bash
sudo nginx -t && sudo nginx -s reload
```

## 6. Validar
```bash
# 1) HTML certo no subdomínio (deve trazer "Meus Exames"):
curl -s https://exames.janocaminho.com.br/ | grep -o '<title>[^<]*</title>'
# 2) API saudável:
curl -s https://exames.janocaminho.com.br/api/health | grep versionLabel
# 3) Redirect do path antigo:
curl -sI https://janocaminho.com.br/minhasaude | grep -i location
```
No **browser limpo** (ou anônimo, sem SW cache): abra `https://exames.janocaminho.com.br/` —
deve carregar o Dr. Exame, nunca mais o delivery. Em um browser que já visitou o delivery,
o SW do EdEspeto continua no `janocaminho.com.br` mas **não alcança** o subdomínio.

## 7. Atualizar app/APK (depois que o subdomínio estiver no ar)
- **Web (admin/landing):** já funciona no subdomínio sem mudança de código (mesmo container).
- **APK (Capacitor):** o app chama a API por URL **absoluta** (ver `VITE_API_URL`).
  Aponte para `https://exames.janocaminho.com.br/api`, faça `npm run sync` e gere novo AAB
  (bump `versionCode`). Sem isso, o APK continua batendo no `janocaminho.com.br/minhasaude/api`.
- **QR code:** o `qr-minhasaude.png` hoje codifica `https://janocaminho.com.br/minhasaude/`.
  Após o redirect funcionar, ele continua válido. Opcional: regerar o PNG codificando
  `https://exames.janocaminho.com.br/` para encurtar o salto.
- **Auth/cookies:** o app usa JWT no header `Authorization` (Bearer), não cookie de domínio.
  Mesmo assim, teste login + biometria no subdomínio para confirmar.

## 8. Rollback
Se algo quebrar: comente o `return 301` do passo 4 e restaure o `location /minhasaude` que
faz proxy direto ao `:4010` (estado anterior). O subdomínio pode ficar parado sem afetar o
path antigo.

---

## Por que isso resolve (resumo técnico)
- SW scope é por **origem + path**. O SW do EdEspeto em `janocaminho.com.br/` controla só
  `janocaminho.com.br/*`. `exames.janocaminho.com.br` é **outra origem** (host diferente) →
  o SW dele não roda lá.
- O Dr. Exame passa a ser a origem principal do próprio app, sem disputa de SW com o EdEspeto.
- O deadlock (SW errado impede o index certo de carregar) deixa de existir porque os dois
  apps nunca mais compartilham origem.
