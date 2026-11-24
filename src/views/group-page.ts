import type { Me } from "../../shared/api";
import { escapeHtml, showMessage, showView } from "../html";
import { inviteLink, personalLink } from "../links";
import type { RevealState } from "../reveal";
import { createRevealStore, initialRevealState, prefersReducedMotion } from "../reveal";
import { drawPanel, resetPanel } from "./draw-panel";
import { wireGiftReveal } from "./gift-reveal";
import { groupFacts, phaseLabel } from "./group-facts";
import type { AfterAction } from "./page-actions";
import { exclusionsPanel, participantActions, settingsPanel, swapLimitPanel, wireManage } from "./manage-group";
import { swapPanel, wireSwaps } from "./swap-panel";
import { wireWishlist, wishlistPanel } from "./wishlist-panel";

function participantList(me: Me): string {
  const items = me.participants
    .map((p) => {
      const you = p.id === me.participant.id ? ` <span class="people__tag">du</span>` : "";
      const organizer = p.isOrganizer ? ` <span class="people__tag">Organisator</span>` : "";
      const actions = me.participant.isOrganizer ? participantActions(me, p) : "";
      return `<li class="people__item"><span class="people__name">${escapeHtml(p.name)}${you}${organizer}</span>${actions}</li>`;
    })
    .join("");
  return `
    <section class="panel stack" aria-labelledby="participants-heading">
      <h2 class="panel__title" id="participants-heading" tabindex="-1">Teilnehmer <span class="panel__count">${me.participants.length}</span></h2>
      <ul class="people" role="list">${items}</ul>
      <p class="form__status" role="status" data-people-status></p>
    </section>`;
}

function linkRow(id: string, buttonLabel: string, copiedMessage: string, url: string): string {
  return `
    <div class="link-row">
      <input class="field__input link-row__url" id="${id}" type="text" readonly value="${escapeHtml(url)}"
        aria-labelledby="${id}-heading" />
      <button class="btn btn--secondary link-row__copy" type="button" data-copy="${id}"
        data-copied="${copiedMessage}" aria-label="${buttonLabel}">Kopieren</button>
    </div>`;
}

function markup(me: Me, token: string, reveal: RevealState, rerender: boolean): string {
  const { group, participant } = me;
  const role = participant.isOrganizer ? "Organisator" : "Teilnehmer";
  return `
    <section class="view"${rerender ? " data-still" : ""}>
      <header class="view__head">
        <p class="view__eyebrow">${phaseLabel[group.phase]}</p>
        <h1 class="view__title" tabindex="-1">${escapeHtml(group.name)}</h1>
        ${groupFacts(group, `<div class="facts__item"><dt>Du</dt><dd>${escapeHtml(participant.name)} · ${role}</dd></div>`)}
      </header>

      ${group.phase === "drawn" ? drawPanel(me, reveal) : ""}

      ${swapPanel(me)}

      ${wishlistPanel(me)}

      ${participantList(me)}

      ${group.phase === "open" ? drawPanel(me, reveal) : participant.isOrganizer ? resetPanel() : ""}

      ${participant.isOrganizer ? exclusionsPanel(me) : ""}

      ${participant.isOrganizer ? settingsPanel(me) : ""}

      ${participant.isOrganizer ? swapLimitPanel(me) : ""}

      ${group.phase === "open" ? `
      <section class="panel stack" aria-labelledby="invite-link-heading">
        <h2 class="panel__title" id="invite-link-heading">Einladungslink</h2>
        <p class="panel__text">Schick diesen Link an alle, die mitwichteln sollen.</p>
        ${linkRow("invite-link", "Einladungslink kopieren", "Einladungslink kopiert.", inviteLink(group.inviteCode))}
      </section>` : ""}

      <section class="panel stack" aria-labelledby="personal-link-heading">
        <h2 class="panel__title" id="personal-link-heading">Persönlicher Link</h2>
        <p class="panel__text">Mit diesem Link kommst du auf jedem Gerät zurück in die Gruppe.</p>
        ${linkRow("personal-link", "Persönlichen Link kopieren", "Persönlicher Link kopiert.", personalLink(token))}
        <p class="note">Behalte diesen Link für dich. Wer ihn hat, macht in deinem Namen mit und sieht später, wen du beschenkst.</p>
      </section>

      <p class="visually-hidden" role="status" data-copy-status></p>
    </section>`;
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

/**
 * Shows the group page. After an organizer action, `after` says what happened (announced
 * in the status line next to the control) and which control keeps the focus.
 */
export function renderGroupPage(main: HTMLElement, me: Me, token: string, after?: AfterAction): void {
  const reveals = createRevealStore(localStorage);
  const { group, recipient } = me;
  const reveal = initialRevealState({
    unwrappedBefore: recipient ? reveals.hasUnwrapped(group.id, recipient.id) : true,
    reducedMotion: prefersReducedMotion(),
  });
  // after an organizer action the page is re-rendered in place, so it does not enter again
  showView(main, markup(me, token, reveal, after !== undefined));
  if (after) restoreFocus(main, after);
  const rerender = (fresh: Me, next: AfterAction) => renderGroupPage(main, fresh, token, next);
  if (recipient) wireGiftReveal(main, () => reveals.rememberUnwrapped(group.id, recipient.id));
  wireWishlist(main, token, rerender, () => renderNotRecognised(main));
  wireSwaps(main, me, token, rerender, () => renderNotRecognised(main));
  if (me.participant.isOrganizer) wireManage(main, me, token, rerender, () => renderNotRecognised(main));
  const status = main.querySelector<HTMLElement>("[data-copy-status]")!;

  for (const button of main.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
    let reset: ReturnType<typeof setTimeout> | undefined;
    button.addEventListener("click", async () => {
      const input = main.querySelector<HTMLInputElement>(`#${button.dataset.copy}`)!;
      const copied = await copyText(input);
      clearTimeout(reset);
      button.textContent = copied ? "Kopiert" : "Kopieren";
      status.textContent = copied
        ? button.dataset.copied!
        : "Kopieren hat nicht geklappt. Markier den Link und kopier ihn selbst.";
      reset = setTimeout(() => (button.textContent = "Kopieren"), 2000);
    });
  }
}

/** Puts focus back near the control that was used and announces the outcome there. */
function restoreFocus(main: HTMLElement, after: AfterAction): void {
  const find = (focus?: string) => (focus ? main.querySelector<HTMLElement>(`[data-focus="${CSS.escape(focus)}"]`) : null);
  const control = find(after.focus) ?? find(after.fallback);
  (control ?? main.querySelector<HTMLElement>("#participants-heading"))!.focus();
  const status =
    control?.closest(".panel")?.querySelector<HTMLElement>("[role=status]") ?? main.querySelector<HTMLElement>("[data-people-status]")!;
  // A live region filled in the same frame it is inserted is often not read out.
  setTimeout(() => (status.textContent = after.status), 50);
}

/** Shown when this browser has no (valid) token for the group in the address bar. */
export function renderNotRecognised(main: HTMLElement): void {
  showMessage(
    main,
    "Du bist in dieser Gruppe nicht angemeldet",
    "Öffne deinen persönlichen Link, dann erkennt dich dieses Gerät wieder.",
    { href: "/", label: "Neue Gruppe anlegen" },
  );
}
