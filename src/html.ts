const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapes text for use inside HTML markup and attribute values. */
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => entities[char]);

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

/** A view that only says something: a heading, an optional line and an optional link. */
export function showMessage(main: HTMLElement, title: string, lead?: string, action?: { href: string; label: string }): void {
  showView(
    main,
    `<section class="view">
      <header class="view__head">
        <h1 class="view__title" tabindex="-1">${escapeHtml(title)}</h1>
        ${lead ? `<p class="view__lead">${escapeHtml(lead)}</p>` : ""}
      </header>
      ${action ? `<a class="btn btn--secondary" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>` : ""}
    </section>`,
  );
}
