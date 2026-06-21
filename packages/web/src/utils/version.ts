import { Capacitor } from '@capacitor/core';
import { API_URL } from '../config';

/** Versão atual do app (espelha o versionName do Android build.gradle). Atualizar a cada release. */
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.4.4';

/** Compara versões semver ("1.3.8" vs "1.4.0"). -1 se a<b, 0 =, 1 se a>b. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => (v || '').split('.').map((n) => parseInt(n.replace(/\D/g, ''), 10) || 0);
  const pa = parse(a), pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/** Checa no backend se a versão instalada (APP_VERSION) está abaixo da mínima exigida.
 *  Retorna { required, latest, min } — required=true força a tela de atualização.
 *  Só vale no APP NATIVO (APK). Na WEB/PWA NUNCA força — a versão servida já é sempre a mais recente
 *  (deploy automático); web não tem "atualizar APK". */
export async function checkAppUpdate(): Promise<{ required: boolean; latest: string; min: string }> {
  if (!Capacitor.isNativePlatform()) return { required: false, latest: APP_VERSION, min: '0.0.0' };
  try {
    const r = await fetch(`${API_URL}/app/version`);
    if (!r.ok) return { required: false, latest: APP_VERSION, min: '0.0.0' };
    const d = await r.json();
    // Força quando a versão instalada < última disponível (sempre usa a mais nova).
    return { required: compareVersions(APP_VERSION, d.latest) < 0, latest: d.latest, min: d.minRequired };
  } catch {
    return { required: false, latest: APP_VERSION, min: '0.0.0' }; // offline/network: não bloqueia
  }
}
