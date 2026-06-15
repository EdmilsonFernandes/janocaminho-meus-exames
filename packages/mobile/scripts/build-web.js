// Compila o app web (packages/web) e copia o resultado para packages/mobile/www,
// que é o "webDir" que o Capacitor empacota dentro do app Android.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const src = path.join(repoRoot, 'packages', 'web', 'dist');
const dest = path.resolve(__dirname, '..', 'www');

console.log('[mobile] compilando packages/web ...');
const r = spawnSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', 'build', '--workspace', 'packages/web'],
  { cwd: repoRoot, stdio: 'inherit', shell: true },
);
if (r.status !== 0) {
  console.error('[mobile] build do web falhou');
  process.exit(r.status ?? 1);
}

console.log('[mobile] copiando dist -> www ...');
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log('[mobile] pronto: www/ atualizado a partir de packages/web/dist');
