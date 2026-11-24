import type { Me, ParticipantView } from "../../shared/api";
import { fetchMe, renewLink } from "../api";
import { copyText } from "../clipboard";
import { escapeHtml } from "../html";
import { personalLink } from "../links";
import { manageErrorMessages, NETWORK_ERROR } from "../messages";
import type { Rerender } from "./page-actions";

/**
 * Link Renewal (ADR 0004): an organizer creates a new Personal Link for a participant, in either
 * phase. A dialog first says that the old link stops working; the new one is shown once, with
 * copy and share, since only its hash is stored. Renewing your own link moves this device to it.
 */

const RENEW_SELF_NETWORK_ERROR =
  "Keine Verbindung. Falls dein neuer Link trotzdem erstellt wurde, gilt dein alter nicht mehr. Bitte dann eine andere Person mit Organisator-Rolle um einen neuen.";

/** The button on one participant's row, for organizers. */
export function renewLinkButton(me: Me, p: ParticipantView): string {
  const isSelf = p.id === me.participant.id;
  const ariaLabel = isSelf ? "Neuen persönlichen Link für dich erstellen" : `Neuen persönlichen Link für ${escapeHtml(p.name)} erstellen`;
  return `<button class="btn btn--secondary btn--small" type="button" data-renew-link="${escapeHtml(p.id)}"
    data-focus="renew-${escapeHtml(p.id)}" aria-label="${ariaLabel}">Neuen persönlichen Link erstellen</button>`;
}

function confirmDialog(me: Me, p: ParticipantView): string {
  const isSelf = p.id === me.participant.id;
  const name = escapeHtml(p.name);
  const title = isSelf ? "Neuen persönlichen Link für dich erstellen?" : `Neuen persönlichen Link für ${name} erstellen?`;
  const text = isSelf
    ? "Dein alter Link funktioniert danach nicht mehr, auf keinem Gerät. Dieses Gerät nutzt ab jetzt den neuen. Alle in der Gruppe sehen, dass du einen neuen Link erstellt hast."
    : `Der alte Link von ${name} funktioniert danach nicht mehr, auf keinem Gerät. ${name} bleibt mit Zuteilung, Wunschzettel und Tauschanfragen in der Gruppe. Alle in der Gruppe sehen, dass du einen neuen Link für ${name} erstellt hast.`;
  return `
    <dialog class="dialog stack" aria-labelledby="renew-title" aria-describedby="renew-text" data-renew-dialog>
      <h2 class="panel__title" id="renew-title">${title}</h2>
      <p class="panel__text" id="renew-text">${text}</p>
      <div class="dialog__actions">
        <button class="btn btn--secondary" type="button" data-renew-cancel autofocus>Abbrechen</button>
        <button class="btn btn--danger btn--danger-fill" type="button" data-renew-confirm>Neuen Link erstellen</button>
      </div>
    </dialog>`;
}

function renewedDialog(p: ParticipantView, isSelf: boolean, url: string, canShare: boolean): string {
  const name = escapeHtml(p.name);
  const title = isSelf ? "Dein neuer persönlicher Link" : `Neuer persönlicher Link für ${name}`;
  const text = isSelf
    ? "Speicher ihn gut, er wird nur jetzt angezeigt. Dein alter Link gilt nicht mehr."
    : `Schick ihn ${name}. Er wird nur jetzt angezeigt, der alte Link gilt nicht mehr.`;
  const note = isSelf
    ? "Behalte diesen Link für dich. Wer ihn hat, macht in deinem Namen mit."
    : `Öffne ihn nicht selbst: Wer ihn öffnet, ist auf dem Gerät als ${name} angemeldet und sieht, wen ${name} beschenkt.`;
  const share = canShare ? `<button class="btn btn--secondary link-row__copy" type="button" data-renewed-share>Teilen</button>` : "";
  return `
    <dialog class="dialog dialog--calm stack" aria-labelledby="renewed-title" aria-describedby="renewed-text" data-renewed-dialog>
      <h2 class="panel__title" id="renewed-title">${title}</h2>
      <p class="panel__text" id="renewed-text">${text}</p>
      <div class="link-row">
        <input class="field__input link-row__url" id="renewed-link" type="text" readonly value="${escapeHtml(url)}" aria-labelledby="renewed-title" />
        <button class="btn btn--secondary link-row__copy" type="button" data-renewed-copy>Kopieren</button>
        ${share}
      </div>
      <p class="note">${note}</p>
      <p class="form__status" role="status" data-renewed-status></p>
      <div class="dialog__actions">
        <button class="btn btn--primary" type="button" data-renewed-done>Fertig</button>
      </div>
    </dialog>`;
}

/** A dialog added for one use: shown at once, removed again when it closes. */
function openDialog(main: HTMLElement, markup: string): HTMLDialogElement {
  main.insertAdjacentHTML("beforeend", markup);
  const dialog = main.lastElementChild as HTMLDialogElement;
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
  return dialog;
}

/** Hooks up the buttons rendered by `renewLinkButton`. */
export function wireLinkRenewal(main: HTMLElement, me: Me, token: string, rerender: Rerender, onUnrecognised: () => void): void {
  const status = main.querySelector<HTMLElement>("[data-people-status]")!;
  let busy = false;

  for (const button of main.querySelectorAll<HTMLButtonElement>("[data-renew-link]")) {
    const target = me.participants.find((p) => p.id === button.dataset.renewLink)!;
    button.addEventListener("click", () => {
      const dialog = openDialog(main, confirmDialog(me, target));
      dialog.querySelector("[data-renew-cancel]")!.addEventListener("click", () => dialog.close());
      dialog.querySelector("[data-renew-confirm]")!.addEventListener("click", () => {
        dialog.close();
        void renew(target);
      });
    });
  }

  async function renew(target: ParticipantView): Promise<void> {
    if (busy) return;
    busy = true;
    const focus = `renew-${target.id}`;
    const isSelf = target.id === me.participant.id;
    try {
      const result = await renewLink(token, me.group.id, target.id);
      if (!result.ok) {
        if (result.error === "unknown_token") return onUnrecognised();
        const fresh = await fetchMe(token).catch(() => null);
        if (fresh) rerender(fresh, { status: manageErrorMessages[result.error], focus });
        else status.textContent = manageErrorMessages[result.error];
        return;
      }
      const { token: renewedToken, me: fresh } = result.renewed;
      const done = isSelf ? "Du hast einen neuen persönlichen Link." : `${target.name} hat einen neuen persönlichen Link.`;
      // The old token is dead on the server now, so the new link is shown whatever happens to the page.
      try {
        rerender(fresh, { status: done, focus }, isSelf ? renewedToken : token);
      } finally {
        showRenewed(target, isSelf, personalLink(renewedToken));
      }
    } catch {
      // The renewal may have gone through with only the answer lost; then the old link no longer works.
      status.textContent = isSelf ? RENEW_SELF_NETWORK_ERROR : NETWORK_ERROR;
    } finally {
      busy = false;
    }
  }

  /** The new link, once. Closing returns the focus to the renew button of the fresh page. */
  function showRenewed(target: ParticipantView, isSelf: boolean, url: string): void {
    const shareData = { title: "Persönlicher Link", url };
    const canShare = typeof navigator.share === "function" && (navigator.canShare?.(shareData) ?? true);
    const dialog = openDialog(main, renewedDialog(target, isSelf, url, canShare));
    const dialogStatus = dialog.querySelector<HTMLElement>("[data-renewed-status]")!;
    const input = dialog.querySelector<HTMLInputElement>("#renewed-link")!;
    dialog.addEventListener("close", () => main.querySelector<HTMLElement>(`[data-focus="${CSS.escape(`renew-${target.id}`)}"]`)?.focus());
    dialog.querySelector("[data-renewed-done]")!.addEventListener("click", () => dialog.close());
    // The link is shown only once: Escape must not throw it away, only "Fertig" closes.
    dialog.addEventListener("cancel", (event) => event.preventDefault());

    const copy = dialog.querySelector<HTMLButtonElement>("[data-renewed-copy]")!;
    copy.addEventListener("click", async () => {
      const copied = await copyText(input);
      copy.textContent = copied ? "Kopiert" : "Kopieren";
      dialogStatus.textContent = copied ? "Persönlicher Link kopiert." : "Kopieren hat nicht geklappt. Markier den Link und kopier ihn selbst.";
    });
    dialog.querySelector("[data-renewed-share]")?.addEventListener("click", () => {
      // Cancelling the share sheet rejects; nothing to say then.
      navigator.share(shareData).catch(() => undefined);
    });
  }
}
