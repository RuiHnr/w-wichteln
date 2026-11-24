import type { Me } from "../../shared/api";
import { MIN_PARTICIPANTS_TO_DRAW } from "../../shared/draw";
import { escapeHtml } from "../html";
import { manageErrorMessages } from "../messages";

/**
 * The draw on the group page. Before it, organizers start it here and everyone else is told
 * to wait; after it, each participant sees whom they give to, and only that (ADR 0003).
 */
export function drawPanel(me: Me): string {
  if (me.group.phase === "drawn") return me.recipient ? recipientPanel(me.recipient.name) : "";
  return `
    <section class="panel stack" aria-labelledby="draw-heading">
      <h2 class="panel__title" id="draw-heading" tabindex="-1" data-focus="draw">Auslosung</h2>
      ${me.participant.isOrganizer ? startDraw(me) : `<p class="panel__text">Noch nicht ausgelost. Sobald ein Organisator auslost, siehst du hier, wen du beschenkst.</p>`}
      <p class="form__status" role="status" data-draw-status></p>
    </section>`;
}

function startDraw(me: Me): string {
  const missing = MIN_PARTICIPANTS_TO_DRAW - me.participants.length;
  if (missing > 0) {
    const more = missing === 1 ? "noch eine Person" : `noch ${missing} Personen`;
    return `<p class="panel__text">${manageErrorMessages.too_few} Lade ${more} ein.</p>`;
  }
  return `
      <p class="panel__text">Lose aus, sobald alle dabei sind. Danach kann niemand mehr beitreten. Jeder sieht nur, wen er selbst beschenkt, auch du.</p>
      <button class="btn btn--primary draw__start" type="button" data-draw data-focus="draw-start"
        data-confirm="Wirklich auslosen?" aria-label="Jetzt auslosen">Jetzt auslosen</button>`;
}

/**
 * The Reset for organizers of a drawn group. The button opens a dialog that says what a
 * reset does; only its confirm button resets.
 */
export function resetPanel(): string {
  return `
    <section class="panel stack" aria-labelledby="reset-heading">
      <h2 class="panel__title" id="reset-heading" tabindex="-1" data-focus="reset">Zurücksetzen</h2>
      <p class="panel__text">Hat jemand abgesagt oder fehlt noch wer? Setz die Auslosung zurück. Dann ist die Anmeldung wieder offen, du kannst Teilnehmer und Ausschlüsse ändern und neu auslosen.</p>
      <button class="btn btn--danger draw__start" type="button" data-reset-open data-focus="reset-open">Auslosung zurücksetzen</button>
      <dialog class="dialog stack" aria-labelledby="reset-dialog-title" aria-describedby="reset-dialog-text" data-reset-dialog>
        <h2 class="panel__title" id="reset-dialog-title">Auslosung zurücksetzen?</h2>
        <p class="panel__text" id="reset-dialog-text">Alle Zuteilungen werden gelöscht. Bei der nächsten Auslosung bekommt jeder einen neuen Beschenkten, auch wer seinen schon kennt.</p>
        <div class="dialog__actions">
          <button class="btn btn--secondary" type="button" data-reset-cancel autofocus>Abbrechen</button>
          <button class="btn btn--danger btn--danger-fill" type="button" data-reset-confirm>Zurücksetzen</button>
        </div>
      </dialog>
      <p class="form__status" role="status" data-reset-status></p>
    </section>`;
}

function recipientPanel(name: string): string {
  return `
    <section class="panel stack draw" aria-labelledby="draw-heading">
      <h2 class="draw__label" id="draw-heading" tabindex="-1" data-focus="draw">Du beschenkst</h2>
      <p class="draw__name">${escapeHtml(name)}</p>
      <p class="panel__text">Verrat es niemandem. Nur du siehst, wen du beschenkst.</p>
      <p class="form__status" role="status" data-draw-status></p>
    </section>`;
}
