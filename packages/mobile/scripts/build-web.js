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

const r = spawnSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', 'build', '--workspace', 'packages/web'],
  // APK roda na raiz (sem o sub-caminho /minhasaude/) → força VITE_BASE=/,
  // independente do .env (protege contra regressão se o .env mudar).
  { cwd: repoRoot, stdio: 'inherit', shell: true, env: { ...process.env, VITE_BASE: '/', VITE_PUSH_ENABLED: 'true', VITE_APP_VERSION: appVersion } },
);
if (r.status !== 0) {
  console.error('[mobile] build do web falhou');
  process.exit(r.status ?? 1);
}

console.log('[mobile] copiando dist -> www ...');
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log('[mobile] pronto: www/ atualizado a partir de packages/web/dist');
