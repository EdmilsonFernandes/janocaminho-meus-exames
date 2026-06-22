// Compila o app web (packages/web) e copia o resultado para packages/mobile/www,
// que é o "webDir" que o Capacitor empacota dentro do app Android.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const src = path.join(repoRoot, 'packages', 'web', 'dist');
const dest = path.resolve(__dirname, '..', 'www');

console.log('[mobile] compilando packages/web ...');
// Lê versionName do build.gradle → injeta como VITE_APP_VERSION (APP_VERSION sempre sincronizado com o APK)
const gradle = fs.readFileSync(path.join(repoRoot, 'packages/mobile/android/app/build.gradle'), 'utf8');
const appVersion = (gradle.match(/versionName\s+"([^"]+)"/) || [])[1] || '1.0.0';

// base RELATIVA ('./') — imune ao path-mangling do MSYS/Git-Bash ('/' vira '/Program Files/Git/'),
// que corrompia o <script src> do index.html e deixava o WebView do Capacitor em TELA BRANCA
// (o JS nunca carregava: 404 em https://localhost/Program Files/Git/assets/...). Base relativa
// funciona em qualquer origem (https://localhost do Capacitor) e o app só tem rotas de 1 nível.
const r = spawnSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', 'build', '--workspace', 'packages/web'],
  { cwd: repoRoot, stdio: 'inherit', shell: true, env: { ...process.env, MSYS_NO_PATHCONV: '1', MSYS2_ARG_CONV_EXCL: '*', VITE_BASE: './', VITE_PUSH_ENABLED: 'true', VITE_APP_VERSION: appVersion } },
);
if (r.status !== 0) {
  console.error('[mobile] build do web falhou');
  process.exit(r.status ?? 1);
}

console.log('[mobile] copiando dist -> www ...');
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log('[mobile] pronto: www/ atualizado a partir de packages/web/dist');
