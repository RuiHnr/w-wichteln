import type { Me, RecipientView } from "../../shared/api";
import { MAX_WISHLIST_LENGTH, validateWishlist } from "../../shared/wishlist";
import { saveWishlist } from "../api";
import { escapeHtml } from "../html";
import { NETWORK_ERROR, wishlistErrorMessages, wishlistLengthHint } from "../messages";
import type { Rerender } from "./manage-group";

/**
 * The Wishlist on the group page: everyone writes their own, in either phase, and after the
 * draw the giver reads their recipient's. Nobody else sees one; the API enforces that.
 */

/** The caller's own wishlist, as a form. */
export function wishlistPanel(me: Me): string {
  const hint = me.group.phase === "drawn"
    ? "Nur die Person, die dich beschenkt, sieht deinen Wunschzettel. Änderungen sieht sie, sobald sie die Seite neu lädt."
    : "Nach der Auslosung sieht ihn nur die Person, die dich beschenkt. Du kannst ihn jederzeit ändern.";
  return `
    <section class="panel stack" aria-labelledby="wishlist-heading">
      <h2 class="panel__title" id="wishlist-heading">Dein Wunschzettel</h2>
      <p class="panel__text">${hint}</p>
      <form class="form" novalidate data-wishlist>
        <div class="field">
          <label class="field__label" for="wishlist">Was wünschst du dir?</label>
          <textarea class="field__input field__textarea" id="wishlist" name="wishlist" rows="5"
            maxlength="${MAX_WISHLIST_LENGTH}" aria-describedby="wishlist-hint wishlist-error"
            placeholder="Zum Beispiel: ein gutes Buch, warme Socken, etwas Selbstgemachtes">${escapeHtml(me.wishlist)}</textarea>
          <p class="field__hint" id="wishlist-hint">${wishlistLengthHint(me.wishlist)}</p>
          <p class="field__error" id="wishlist-error"></p>
        </div>
        <button class="btn btn--primary form__submit" type="submit" data-focus="wishlist-save">Wunschzettel speichern</button>
        <p class="form__status" role="status" data-wishlist-status></p>
      </form>
    </section>`;
}

/** The recipient's wishlist, shown in the panel with the recipient's name. */
export function recipientWishlist(recipient: RecipientView): string {
  if (!recipient.wishlist) {
    return `<p class="panel__text">${escapeHtml(recipient.name)} hat noch keinen Wunschzettel geschrieben. Schau später noch mal vorbei.</p>`;
  }
  return `
      <div class="wishlist">
        <h3 class="wishlist__label">Wunschzettel</h3>
        <p class="wishlist__text">${escapeHtml(recipient.wishlist)}</p>
      </div>`;
}

/** Hooks up the form rendered by `wishlistPanel`; `rerender` shows the fresh view after saving. */
export function wireWishlist(
  main: HTMLElement,
  token: string,
  rerender: Rerender,
  onUnrecognised: () => void,
): void {
  const form = main.querySelector<HTMLFormElement>("[data-wishlist]");
  if (!form) return;
  const textarea = form.querySelector<HTMLTextAreaElement>("#wishlist")!;
  const hint = form.querySelector<HTMLElement>("#wishlist-hint")!;
  const error = form.querySelector<HTMLElement>("#wishlist-error")!;
  const status = form.querySelector<HTMLElement>("[data-wishlist-status]")!;
  let busy = false;

  const showError = (message: string) => {
    error.textContent = message;
    if (message) {
      textarea.setAttribute("aria-invalid", "true");
      textarea.focus();
    } else textarea.removeAttribute("aria-invalid");
  };

  textarea.addEventListener("input", () => (hint.textContent = wishlistLengthHint(textarea.value)));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const checked = validateWishlist(textarea.value);
    if (!checked.ok) return showError(wishlistErrorMessages[checked.error]);
    showError("");
    status.textContent = "";
    busy = true;
    try {
      const result = await saveWishlist(token, checked.value);
      if (result.ok) {
        const saved = checked.value ? "Dein Wunschzettel ist gespeichert." : "Dein Wunschzettel ist jetzt leer.";
        rerender(result.me, { status: saved, focus: "wishlist-save" });
      } else if ("error" in result) onUnrecognised();
      else showError(wishlistErrorMessages[result.errors.wishlist]);
    } catch {
      status.textContent = NETWORK_ERROR;
    } finally {
      busy = false;
    }
  });
}
