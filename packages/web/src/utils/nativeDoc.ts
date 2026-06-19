import { Capacitor } from '@capacitor/core';

/**
 * Imprimir / salvar documento.
 * - **APK (nativo):** o WebView não tem diálogo de impressão → grava o HTML num arquivo
 *   temporário (Filesystem) e abre a **folha de compartilhamento** (Share). O usuário abre
 *   no navegador/PDF e imprime ou salva. Padrão natural de "exportar" no celular.
 * - **Web/PWA:** popup + window.print() (comportamento de sempre).
 */
export async function printDocument(title: string, html: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const slug = (title || 'documento').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const file = `${slug || 'documento'}-${Date.now()}.html`;
      const r = await Filesystem.writeFile({ path: file, data: html, directory: Directory.Cache, encoding: Encoding.UTF8 });
      await Share.share({ title, dialogTitle: title, files: [r.uri] }).catch(() => {});
      await Filesystem.deleteFile({ path: file, directory: Directory.Cache }).catch(() => {});
    } catch (e) {
      console.warn('[printDocument] falha no share nativo:', e);
    }
  } else {
    const w = window.open('', '_blank', 'width=820,height=940');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }
}

/**
 * Imprimir a página atual (para os botões que usavam window.print() direto).
 * No APK compartilha o conteúdo principal (main) como HTML.
 */
export async function printPage(title = 'Documento'): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const inner = document.querySelector('main')?.innerHTML || document.body.innerHTML;
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:'Segoe UI',Arial,sans-serif;padding:20px;line-height:1.55;color:#15233b}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #ddd;padding:6px 8px;text-align:left}h1,h2,h3{color:#0f172a}</style></head><body>${inner}</body></html>`;
    return printDocument(title, html);
  }
  window.print();
}
