// Service Worker NO-OP do Meus Exames (escopo /minhasaude/).
// PROPÓSITO: tomar posse do escopo /minhasaude/ → o SW do EdEspeto (escopo /)
// NÃO consegue mais interceptar /minhasaude/ → acaba a cross-contaminação
// (iPhone Safari, Chrome, etc — o SW errado parava de servir conteúdo do outro app).
//
// Este SW é totalmente "vazio": não cacheia, não modifica, só passa tudo pra rede.
// Se um dia quiser PWA real (offline), troca este arquivo por um SW de verdade.
self.addEventListener('install', (event) => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(clients.claim()); });
self.addEventListener('fetch', (event) => { event.respondWith(fetch(event.request)); });
