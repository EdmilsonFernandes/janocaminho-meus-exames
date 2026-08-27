// Service Worker NO-OP do Meus Exames (escopo /minhasaude/).
// PROPÓSITO: tomar posse do escopo /minhasaude/ → o SW do EdEspeto (escopo /)
// NÃO consegue mais interceptar /minhasaude/ → acaba a cross-contaminação
// (iPhone Safari, Chrome, etc — o SW errado parava de servir conteúdo do outro app).
//
// Este SW é totalmente "vazio": não cacheia, não modifica, só passa tudo pra rede.
// Se um dia quiser PWA real (offline), troca este arquivo por um SW de verdade.
//
// ⚠️ POSTs NÃO são interceptados (bug Android 2026-08-27): o Chrome mobile falha
// silenciosamente ao re-fetch de POST com FormData/multipart de dentro do SW.
// O request morre ANTES de chegar no nginx — o "erro de conexão" do decifre PDF.
// POSTs passam direto pra rede (sem respondWith), GETs continuam no pass-through.
self.addEventListener('install', (event) => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(clients.claim()); });
self.addEventListener('fetch', (event) => {
  // POST/PUT/DELETE: NÃO interceptar — deixa o browser fazer o request direto.
  // O re-fetch de POST com FormData dentro do SW corrompe o body no Chrome Android.
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request));
});
