import { escapeHtml, showView } from "../html";
import { personalLink } from "../links";
import { linkRow, wireLinkRows } from "./link-row";

function markup(groupName: string, token: string, note: string): string {
  return `
    <section class="view">
      <header class="view__head">
        <p class="view__eyebrow">${escapeHtml(groupName)}</p>
        <h1 class="view__title" tabindex="-1">Speichere jetzt deinen persönlichen Link</h1>
        <p class="view__lead">Er ist dein einziger Weg zurück in die Gruppe.</p>
        ${note ? `<p class="note" role="status">${escapeHtml(note)}</p>` : ""}
      </header>
      <form class="form panel" novalidate>
        <div class="stack">
          <h2 class="panel__title" id="save-link-heading">Dein persönlicher Link</h2>
          ${linkRow({
            id: "save-link",
            url: personalLink(token),
            copyLabel: "Persönlichen Link kopieren",
            copiedMessage: "Persönlicher Link kopiert.",
            shareTitle: `Mein Link für ${groupName}`,
            shareLabel: "Persönlichen Link teilen",
          })}
          <p class="panel__text" id="save-link-why">
            Ohne diesen Link kommst du von einem anderen Gerät oder nach dem Löschen deiner Browserdaten
            nicht mehr in die Gruppe. Leg ihn in deine Notizen oder schick ihn dir selbst.
          </p>
          <p class="note">Behalte diesen Link für dich. Wer ihn hat, macht in deinem Namen mit und sieht später, wen du beschenkst.</p>
        </div>
        <div class="field">
          <label class="check">
            <input class="check__input" type="checkbox" name="saved" aria-describedby="save-link-why saved-error" />
            <span>Ich habe den Link gespeichert</span>
          </label>
          <p class="field__error" id="saved-error"></p>
        </div>
        <button class="btn btn--primary form__submit" type="submit">Weiter zur Gruppe</button>
      </form>
      <p class="visually-hidden" role="status" data-copy-status></p>
    </section>`;
}

/**
 * The step right after creating or joining a group: the Personal Link is the only way back
 * (ADR 0002), so the group page opens only once the participant says they saved it.
 */
export function renderSaveLink(main: HTMLElement, groupName: string, token: string, onSaved: () => void, note = ""): void {
  showView(main, markup(groupName, token, note));
  const form = main.querySelector<HTMLFormElement>("form")!;
  const saved = form.querySelector<HTMLInputElement>("[name=saved]")!;
  const error = form.querySelector<HTMLElement>("#saved-error")!;
  wireLinkRows(main, main.querySelector<HTMLElement>("[data-copy-status]")!);

  saved.addEventListener("change", () => {
    if (!saved.checked) return;
    error.textContent = "";
    saved.removeAttribute("aria-invalid");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    // Enter in the link field submits the form too; only the button means "continue"
    if (event.submitter?.getAttribute("type") !== "submit") return;
    if (saved.checked) return onSaved();
    error.textContent = "Speicher zuerst deinen Link und setz dann den Haken.";
    saved.setAttribute("aria-invalid", "true");
    saved.focus();
  });
}

/** The notice at the top of the group page, until the participant dismisses it on this device. */
export function linkNotice(): string {
  return `
    <section class="panel stack link-notice" aria-labelledby="link-notice-heading" data-link-notice>
      <h2 class="panel__title" id="link-notice-heading">Hast du deinen persönlichen Link gespeichert?</h2>
      <p class="panel__text">Ohne ihn kommst du von einem anderen Gerät oder nach dem Löschen deiner Browserdaten nicht mehr in die Gruppe.</p>
      <div class="link-notice__actions">
        <button class="btn btn--primary btn--small" type="button" data-link-notice-show>Zum Link</button>
        <button class="btn btn--secondary btn--small" type="button" data-link-notice-dismiss>Ist gespeichert, ausblenden</button>
      </div>
    </section>`;
}

/** "Zum Link" jumps to the Personal Link section; dismissing removes the notice and calls `onDismiss`. */
export function wireLinkNotice(main: HTMLElement, onDismiss: () => void): void {
  const notice = main.querySelector<HTMLElement>("[data-link-notice]");
  if (!notice) return;

  notice.querySelector("[data-link-notice-show]")!.addEventListener("click", () => {
    const link = main.querySelector<HTMLInputElement>("#personal-link");
    link?.focus();
    link?.select();
  });

  notice.querySelector("[data-link-notice-dismiss]")!.addEventListener("click", () => {
    notice.remove();
    // the pressed button is gone: keep the focus at the top of the page instead of losing it
    main.querySelector<HTMLElement>("h1")?.focus();
    onDismiss();
  });
}
