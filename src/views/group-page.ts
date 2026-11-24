import type { Me } from "../../shared/api";
import { groupStillExists } from "../api";
import { escapeHtml, showMessage, showView } from "../html";
import { createIdentityStore } from "../identity";
import { createLinkNoticeStore } from "../link-notice";
import { inviteLink, personalLink } from "../links";
import type { RevealState } from "../reveal";
import { createRevealStore, initialRevealState, prefersReducedMotion } from "../reveal";
import { deleteGroupPanel, wireDeleteGroup } from "./delete-group";
import { drawPanel, resetPanel } from "./draw-panel";
import { wireGiftReveal } from "./gift-reveal";
import { groupFacts, phaseLabel } from "./group-facts";
import type { AfterAction } from "./page-actions";
import { linkRow, wireLinkRows } from "./link-row";
import { exclusionsPanel, participantActions, settingsPanel, swapLimitPanel, wireManage } from "./manage-group";
import { linkNotice, wireLinkNotice } from "./save-link";
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

function markup(me: Me, token: string, reveal: RevealState, rerender: boolean, showLinkNotice: boolean): string {
  const { group, participant } = me;
  const role = participant.isOrganizer ? "Organisator" : "Teilnehmer";
  return `
    <section class="view"${rerender ? " data-still" : ""}>
      <header class="view__head">
        <p class="view__eyebrow">${phaseLabel[group.phase]}</p>
        <h1 class="view__title" tabindex="-1">${escapeHtml(group.name)}</h1>
        ${groupFacts(group, `<div class="facts__item"><dt>Du</dt><dd>${escapeHtml(participant.name)} · ${role}</dd></div>`)}
      </header>

      ${showLinkNotice ? linkNotice() : ""}

      ${group.phase === "drawn" ? drawPanel(me, reveal) : ""}

      ${swapPanel(me)}

      ${wishlistPanel(me)}

      ${participantList(me)}

      ${group.phase === "open" ? drawPanel(me, reveal) : participant.isOrganizer ? resetPanel() : ""}

      ${participant.isOrganizer ? exclusionsPanel(me) : ""}

      ${participant.isOrganizer ? settingsPanel(me) : ""}

      ${participant.isOrganizer ? swapLimitPanel(me) : ""}

      ${participant.isOrganizer ? deleteGroupPanel(me) : ""}

      ${group.phase === "open" ? `
      <section class="panel stack" aria-labelledby="invite-link-heading">
        <h2 class="panel__title" id="invite-link-heading">Einladungslink</h2>
        <p class="panel__text">Schick diesen Link an alle, die mitwichteln sollen.</p>
        ${linkRow({
          id: "invite-link",
          url: inviteLink(group.inviteCode),
          copyLabel: "Einladungslink kopieren",
          copiedMessage: "Einladungslink kopiert.",
        })}
      </section>` : ""}

      <section class="panel stack" aria-labelledby="personal-link-heading">
        <h2 class="panel__title" id="personal-link-heading">Persönlicher Link</h2>
        <p class="panel__text">Nur mit diesem Link kommst du zurück in die Gruppe: auf einem anderen Gerät oder wenn deine Browserdaten gelöscht sind. Speicher ihn dir gut.</p>
        ${linkRow({
          id: "personal-link",
          url: personalLink(token),
          copyLabel: "Persönlichen Link kopieren",
          copiedMessage: "Persönlicher Link kopiert.",
          shareTitle: `Mein Link für ${group.name}`,
          shareLabel: "Persönlichen Link teilen",
        })}
        <p class="note">Behalte diesen Link für dich. Wer ihn hat, macht in deinem Namen mit und sieht später, wen du beschenkst.</p>
      </section>

      <p class="visually-hidden" role="status" data-copy-status></p>
    </section>`;
}

/**
 * Shows the group page. After an organizer action, `after` says what happened (announced
 * in the status line next to the control) and which control keeps the focus.
 */
export function renderGroupPage(main: HTMLElement, me: Me, token: string, after?: AfterAction): void {
  const reveals = createRevealStore(localStorage);
  const linkNotices = createLinkNoticeStore(localStorage);
  const { group, recipient } = me;
  const reveal = initialRevealState({
    unwrappedBefore: recipient ? reveals.hasUnwrapped(group.id, recipient.id) : true,
    reducedMotion: prefersReducedMotion(),
  });
  // after an organizer action the page is re-rendered in place, so it does not enter again
  showView(main, markup(me, token, reveal, after !== undefined, !linkNotices.isDismissed(group.id)));
  if (after) restoreFocus(main, after);
  const rerender = (fresh: Me, next: AfterAction) => renderGroupPage(main, fresh, token, next);
  if (recipient) wireGiftReveal(main, () => reveals.rememberUnwrapped(group.id, recipient.id));
  const unrecognised = () => void showTokenStopped(main, group.id);
  wireWishlist(main, token, rerender, unrecognised);
  wireSwaps(main, me, token, rerender, unrecognised);
  if (me.participant.isOrganizer) {
    wireManage(main, me, token, rerender, unrecognised);
    // The deleting organizer lands where every link of the group now leads.
    const onDeleted = () => {
      createIdentityStore(localStorage).forget(group.id);
      renderGroupGone(main);
    };
    wireDeleteGroup(main, me, token, rerender, unrecognised, onDeleted);
  }
  wireLinkRows(main, main.querySelector<HTMLElement>("[data-copy-status]")!);
  wireLinkNotice(main, () => linkNotices.dismiss(group.id));
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

/**
 * The token stopped working while the page was open: forget it, then say the group is gone
 * when it was deleted meanwhile, or else that this device is no longer recognised.
 */
async function showTokenStopped(main: HTMLElement, groupId: string): Promise<void> {
  createIdentityStore(localStorage).forget(groupId);
  if ((await groupStillExists(groupId)) === false) return renderGroupGone(main);
  renderNotRecognised(main);
}

/** Shown for a link to a group that was deleted (by an organizer, or 60 days after its date) or never existed. */
export function renderGroupGone(main: HTMLElement): void {
  showMessage(
    main,
    "Diese Gruppe gibt es nicht mehr",
    "Ein Organisator hat sie gelöscht, oder sie ist 60 Tage nach der Bescherung abgelaufen, mit allem, was dazugehört. Falls du die Gruppe noch brauchst, prüf, ob der Link vollständig ist.",
    { href: "/", label: "Neue Gruppe anlegen" },
  );
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
