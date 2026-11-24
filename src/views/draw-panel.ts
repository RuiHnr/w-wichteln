import type { Me } from "../../shared/api";
import { MIN_PARTICIPANTS_TO_DRAW } from "../../shared/draw";
import { escapeHtml } from "../html";

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
    return `<p class="panel__text">Für die Auslosung braucht ihr mindestens ${MIN_PARTICIPANTS_TO_DRAW} Teilnehmer. Lade ${more} ein.</p>`;
  }
  return `
      <p class="panel__text">Lose aus, sobald alle dabei sind. Danach kann niemand mehr beitreten. Jeder sieht nur, wen er selbst beschenkt, auch du.</p>
      <button class="btn btn--primary draw__start" type="button" data-draw data-focus="draw-start"
        data-confirm="Wirklich auslosen?" aria-label="Jetzt auslosen">Jetzt auslosen</button>`;
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
