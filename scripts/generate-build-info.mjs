// Gera metadados de build (versão + commit git + branch + timestamp) e escreve em:
//   packages/server/src/generated/buildInfo.ts  (compilado dentro da imagem → server expõe em /api/health)
//   packages/web/src/generated/buildInfo.ts     (bundle do vite → "Sobre o app")
//   packages/web/public/build-info.json         (servido como estático p/ checagens externas)
//
// Precedência de fontes: variáveis de ambiente (CI/Docker) > git local > defaults.
// No Docker/CI o .git pode estar ausente → passamos BUILD_GIT_* como ARG (publish-ghcr.yml).
// Em dev local o git resolve sozinho. Inspirado no EdEspeto (generate-build-info.mjs).
//
// Uso:  node scripts/generate-build-info.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

/** Roda um comando e devolve stdout (trim), ou '' se falhar (ex.: .git ausente no Docker). */
const sh = (cmd) => { try { return execSync(cmd, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).toString().trim(); } catch { return ''; } };

/** Lê versionName + versionCode do build.gradle Android (fonte única de verdade da versão do app). */
function readGradle() {
  try {
    const g = fs.readFileSync(path.join(root, 'packages/mobile/android/app/build.gradle'), 'utf8');
    const versionName = (g.match(/versionName\s+"([^"]+)"/) || [])[1] || '';
    const versionCode = (g.match(/versionCode\s+(\d+)/) || [])[1] || '';
    return { versionName, versionCode };
  } catch { return { versionName: '', versionCode: '' }; }
}

const gradle = readGradle();
const pkgVersion = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, 'packages/web/package.json'), 'utf8')).version || ''; } catch { return ''; } })();

const commit = process.env.BUILD_GIT_SHA || process.env.GITHUB_SHA || sh('git rev-parse HEAD') || 'unknown';
const shortHash = process.env.BUILD_GIT_SHORT_SHA || (commit !== 'unknown' ? commit.slice(0, 7) : 'unknown');
const branch = process.env.BUILD_GIT_BRANCH || process.env.GITHUB_REF_NAME || sh('git rev-parse --abbrev-ref HEAD') || 'unknown';
const version = process.env.BUILD_VERSION || gradle.versionName || pkgVersion || '0.0.0';
const versionCode = process.env.BUILD_VERSION_CODE || gradle.versionCode || '';
const builtAt = process.env.BUILD_TIME_ISO || new Date().toISOString();
// source: de onde vieram os metadados (ajuda a saber se o carimbo é confiável).
const source = (process.env.GITHUB_SHA || process.env.BUILD_GIT_SHA) ? 'ci' : (commit !== 'unknown' ? 'local' : 'dev');
const versionLabel = `v${version}${versionCode ? `.${versionCode}` : ''} (${shortHash})`;

const info = {
  appName: 'Meus Exames',
  version,
  versionCode,
  commit,
  shortHash,
  branch,
  builtAt,
  source,
  versionLabel,
};

const HEADER = `// ARQUIVO GERADO por scripts/generate-build-info.mjs — NÃO editar manualmente.
// Regenerado a cada build (dev/build/Docker). Override via env BUILD_GIT_* no CI.`;

const TS = `${HEADER}
export interface BuildInfo {
  appName: string;
  version: string;
  versionCode: string;
  commit: string;
  shortHash: string;
  branch: string;
  builtAt: string;
  source: 'ci' | 'local' | 'dev';
  versionLabel: string;
}

export const APP_BUILD_INFO: BuildInfo = ${JSON.stringify(info, null, 2)};
`;

const targets = [
  path.join(root, 'packages/server/src/generated/buildInfo.ts'),
  path.join(root, 'packages/web/src/generated/buildInfo.ts'),
];
for (const f of targets) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, TS, 'utf8');
}
// JSON público (estático) p/ checagens externas / mobile / "qual versão está no ar?".
const jsonPath = path.join(root, 'packages/web/public/build-info.json');
fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
fs.writeFileSync(jsonPath, JSON.stringify(info, null, 2) + '\n', 'utf8');

console.log(`[build-info] ${info.versionLabel} · branch ${info.branch} · ${info.source} · ${info.builtAt}`);
