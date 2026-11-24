import type { Me } from "../../shared/api";
import { deleteGroup, fetchMe } from "../api";
import { escapeHtml } from "../html";
import { manageErrorMessages, NETWORK_ERROR } from "../messages";
import { closeOnBackdropClick, type Rerender } from "./page-actions";

/**
 * Group Deletion for organizers, in either phase. It cannot be undone, so the button opens
 * a dialog in which the organizer types the group's name; only then does its delete button
 * turn on. The API refuses everyone but organizers.
 */

/** Whether what was typed confirms deleting the group: its exact name, spaces around it aside. */
export function confirmsGroupName(typed: string, groupName: string): boolean {
  return typed.trim() === groupName;
}

export function deleteGroupPanel({ group }: Me): string {
  const name = escapeHtml(group.name);
  return `
    <section class="panel stack" aria-labelledby="delete-heading">
      <h2 class="panel__title" id="delete-heading" tabindex="-1" data-focus="delete-heading">Gruppe löschen</h2>
      <p class="panel__text">Die Gruppe verschwindet sofort mit allem, was dazugehört: Teilnehmer, Ausschlüsse, Zuteilungen, Wunschzettel und Tauschanfragen. Das lässt sich nicht rückgängig machen.</p>
      <button class="btn btn--danger delete__open" type="button" data-delete-open>Gruppe löschen</button>
      <dialog class="dialog stack" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-text" data-delete-dialog>
        <h2 class="panel__title" id="delete-dialog-title">Gruppe endgültig löschen?</h2>
        <p class="panel__text" id="delete-dialog-text">Danach führen der Einladungslink und alle persönlichen Links ins Leere, auch für die anderen Teilnehmer.</p>
        <form class="form" novalidate data-delete-form>
          <div class="field">
            <label class="field__label" for="delete-confirm">Gib zum Bestätigen den Namen der Gruppe ein: <span class="delete__name">${name}</span></label>
            <input class="field__input" id="delete-confirm" name="delete-confirm" type="text" autocomplete="off"
              autocapitalize="off" spellcheck="false" />
          </div>
          <p class="form__status" role="status" data-delete-status></p>
          <div class="dialog__actions">
            <button class="btn btn--secondary" type="button" data-delete-cancel>Abbrechen</button>
            <button class="btn btn--danger btn--danger-fill" type="submit" data-delete-confirm disabled>Gruppe löschen</button>
          </div>
        </form>
      </dialog>
    </section>`;
}

/**
 * Hooks up `deleteGroupPanel`. After the deletion `onDeleted` shows that the group is gone;
 * when the server refuses, the page shows the current state and says why.
 */
export function wireDeleteGroup(
  main: HTMLElement,
  me: Me,
  token: string,
  rerender: Rerender,
  onUnrecognised: () => void,
  onDeleted: () => void,
): void {
  const open = main.querySelector<HTMLButtonElement>("[data-delete-open]");
  if (!open) return;
  const dialog = main.querySelector<HTMLDialogElement>("[data-delete-dialog]")!;
  const form = dialog.querySelector<HTMLFormElement>("[data-delete-form]")!;
  const input = form.querySelector<HTMLInputElement>("#delete-confirm")!;
  const confirm = form.querySelector<HTMLButtonElement>("[data-delete-confirm]")!;
  const status = form.querySelector<HTMLElement>("[data-delete-status]")!;
  let busy = false;

  const update = () => (confirm.disabled = busy || !confirmsGroupName(input.value, me.group.name));

  open.addEventListener("click", () => {
    input.value = "";
    status.textContent = "";
    update();
    dialog.showModal();
  });
  input.addEventListener("input", update);
  dialog.querySelector("[data-delete-cancel]")!.addEventListener("click", () => dialog.close());
  // Cancelling, by button, Escape or backdrop, gives the focus back to the button that opened it.
  dialog.addEventListener("close", () => {
    if (main.contains(dialog)) open.focus();
  });
  dialog.addEventListener("cancel", (event) => {
    if (busy) event.preventDefault();
  });
  closeOnBackdropClick(dialog, () => !busy);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !confirmsGroupName(input.value, me.group.name)) return;
    busy = true;
    update();
    status.textContent = "Gruppe wird gelöscht …";
    try {
      const result = await deleteGroup(token, me.group.id);
      if (result.ok) return onDeleted();
      if (result.error === "unknown_token") return onUnrecognised();
      // Refused (no longer an organizer): show the current state and say why; offline, say it here.
      const fresh = await fetchMe(token).catch(() => undefined);
      if (fresh === null) return onUnrecognised();
      if (!fresh) {
        status.textContent = manageErrorMessages[result.error];
        return;
      }
      dialog.close();
      rerender(fresh, { status: manageErrorMessages[result.error], fallback: "delete-heading" });
    } catch {
      status.textContent = NETWORK_ERROR;
    } finally {
      busy = false;
      if (form.isConnected) update();
    }
  });
}
