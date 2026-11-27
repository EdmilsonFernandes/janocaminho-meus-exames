/**
 * Copia um texto para a área de transferência. NUNCA rejeita: devolve `true` se copiou, `false` se não.
 *
 * Por quê: `navigator.clipboard.writeText` é uma Promise que REJEITA com
 * "NotAllowedError: Write permission denied." em navegador embutido, aba sem foco, iframe sem a
 * permissão `clipboard-write` ou contexto não seguro. Quatro lugares do app chamavam sem `await` nem
 * `catch` — a rejeição virava erro não tratado no Sentry (1 mês, 5 usuários, 26/11/26) e a pessoa via
 * "copiado" sem ter copiado nada.
 *
 * Quando o caminho moderno falha, tenta o caminho antigo (`execCommand('copy')`), que funciona nesses
 * contextos. Quem chama decide o que fazer com o `false` (em geral, mostrar o texto para copiar à mão).
 */
export async function copyText(text: string): Promise<boolean> {
  if (text == null) return false;
  const value = String(text);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // sem permissão ou sem foco: cai no caminho de baixo
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
