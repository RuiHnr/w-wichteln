const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapes text for use inside HTML markup and attribute values. */
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => entities[char]);

/** The local date as YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Puts a freshly rendered view in place. When the visitor was already using the page
 * (say, pressed a button that is now gone), focus moves to the new heading; on first
 * load it stays put so Tab still reaches the skip link first.
 */
export function showView(main: HTMLElement, markup: string): void {
  const wasInteracting = document.activeElement !== null && document.activeElement !== document.body;
  main.innerHTML = markup;
  if (wasInteracting) main.querySelector<HTMLElement>("h1")?.focus();
}
