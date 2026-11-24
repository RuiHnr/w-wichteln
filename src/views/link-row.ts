import { escapeHtml } from "../html";

/** A link to pass on: the address in a read-only field, a copy button and, where asked for, a share button. */

interface LinkRowOptions {
  /** Field id; the row is named by the element with id `${id}-heading`. */
  id: string;
  url: string;
  copyLabel: string;
  copiedMessage: string;
  /** Offer the phone's share sheet (shown only where the browser has one), titled like this. */
  shareTitle?: string;
  shareLabel?: string;
}

export function linkRow({ id, url, copyLabel, copiedMessage, shareTitle, shareLabel }: LinkRowOptions): string {
  const share = shareTitle
    ? `<button class="btn btn--secondary link-row__copy" type="button" data-share="${id}" data-share-title="${escapeHtml(shareTitle)}"
        aria-label="${escapeHtml(shareLabel ?? "Teilen")}" hidden>Teilen</button>`
    : "";
  return `
    <div class="link-row">
      <input class="field__input link-row__url" id="${id}" type="text" readonly value="${escapeHtml(url)}"
        aria-labelledby="${id}-heading" />
      <button class="btn btn--secondary link-row__copy" type="button" data-copy="${id}"
        data-copied="${escapeHtml(copiedMessage)}" aria-label="${escapeHtml(copyLabel)}">Kopieren</button>
      ${share}
    </div>`;
}

async function copyText(input: HTMLInputElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(input.value);
    return true;
  } catch {
    input.select();
    return document.execCommand("copy");
  }
}

/** Makes every link row inside `root` work; outcomes are announced in `status`. */
export function wireLinkRows(root: HTMLElement, status: HTMLElement): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
    let reset: ReturnType<typeof setTimeout> | undefined;
    button.addEventListener("click", async () => {
      const input = root.querySelector<HTMLInputElement>(`#${button.dataset.copy}`)!;
      const copied = await copyText(input);
      clearTimeout(reset);
      button.textContent = copied ? "Kopiert" : "Kopieren";
      status.textContent = copied
        ? button.dataset.copied!
        : "Kopieren hat nicht geklappt. Markier den Link und kopier ihn selbst.";
      reset = setTimeout(() => (button.textContent = "Kopieren"), 2000);
    });
  }

  if (typeof navigator.share !== "function") return;
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-share]")) {
    button.hidden = false;
    button.addEventListener("click", async () => {
      const input = root.querySelector<HTMLInputElement>(`#${button.dataset.share}`)!;
      try {
        await navigator.share({ title: button.dataset.shareTitle, url: input.value });
      } catch (error) {
        // closing the share sheet is not a failure
        if (error instanceof DOMException && error.name === "AbortError") return;
        status.textContent = "Teilen hat nicht geklappt. Kopier den Link stattdessen.";
      }
    });
  }
}
