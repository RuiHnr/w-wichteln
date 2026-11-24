import type { RecipientView } from "../../shared/api";
import { escapeHtml } from "../html";
import type { RevealState } from "../reveal";
import { recipientWishlist } from "./wishlist-panel";

/**
 * The gift reveal on the group page: a wrapped gift waits for a tap; it unties its bow,
 * lifts the lid, bursts confetti and ends on the recipient's name. Gift, name and the
 * hint or replay button share one fixed slot each, so nothing moves the page around.
 * Only transforms and opacity animate. Under reduced motion the name shows at once.
 */

const CONFETTI_PIECES = 36;
const CONFETTI_COLOURS = ["var(--p-accent)", "var(--p-accent-soft)", "var(--p-gift)", "var(--p-pine)", "var(--p-ink)"];
/** Longer than the whole CSS sequence: ends the reveal even if no animationend arrives. */
const FALLBACK_MS = 2400;

const giftArt = `
  <svg class="gift__art" viewBox="0 0 160 150" aria-hidden="true" focusable="false">
    <g class="gift__box">
      <rect x="22" y="64" width="116" height="80" rx="8" fill="var(--p-gift)" />
      <rect x="22" y="64" width="116" height="10" fill="var(--p-gift-shade)" />
      <rect x="72" y="64" width="16" height="80" fill="var(--p-accent)" />
    </g>
    <g class="gift__lid">
      <rect x="14" y="44" width="132" height="24" rx="6" fill="var(--p-gift)" />
      <rect x="72" y="44" width="16" height="24" fill="var(--p-accent)" />
    </g>
    <g class="gift__bow">
      <path d="M80 44 C 62 20, 40 26, 50 40 C 56 48, 70 46, 80 44 Z" fill="var(--p-accent)" />
      <path d="M80 44 C 98 20, 120 26, 110 40 C 104 48, 90 46, 80 44 Z" fill="var(--p-accent)" />
      <path d="M80 44 L 66 60 L 72 62 Z M80 44 L 94 60 L 88 62 Z" fill="var(--p-accent-soft)" />
      <circle cx="80" cy="44" r="7" fill="var(--p-accent-soft)" />
    </g>
  </svg>`;

/**
 * The draw panel once the group is drawn: the gift, or straight away the recipient's name.
 * The recipient's wishlist names them too, so it stays hidden until the name shows.
 */
export function giftRevealPanel(recipient: RecipientView, state: RevealState): string {
  return `
    <section class="panel stack draw reveal" data-reveal="${state}" aria-labelledby="draw-heading">
      <h2 class="draw__label" id="draw-heading" tabindex="-1" data-focus="draw">Du beschenkst</h2>
      <div class="reveal__stage">
        <button class="gift" type="button" data-gift aria-label="Geschenk auspacken">${giftArt}</button>
        <p class="draw__name reveal__name" tabindex="-1" data-reveal-name>${escapeHtml(recipient.name)}</p>
        <div class="confetti" aria-hidden="true" data-confetti></div>
      </div>
      <div class="reveal__foot">
        <p class="panel__text reveal__hint">Tipp auf das Geschenk, dann siehst du den Namen.</p>
        <button class="btn btn--secondary reveal__replay" type="button" data-replay>Nochmal auspacken</button>
      </div>
      <div class="reveal__wishlist">${recipientWishlist(recipient)}</div>
      <p class="panel__text">Verrat es niemandem. Nur du siehst, wen du beschenkst.</p>
      <p class="form__status" role="status" data-draw-status></p>
    </section>`;
}

/** Plays the reveal on tap, calls `onUnwrapped` once the name shows, and lets it be replayed. */
export function wireGiftReveal(root: HTMLElement, onUnwrapped: () => void): void {
  const panel = root.querySelector<HTMLElement>(".reveal");
  if (!panel) return;
  const gift = panel.querySelector<HTMLButtonElement>("[data-gift]")!;
  const name = panel.querySelector<HTMLElement>("[data-reveal-name]")!;
  const confetti = panel.querySelector<HTMLElement>("[data-confetti]")!;
  const replay = panel.querySelector<HTMLButtonElement>("[data-replay]")!;
  const setState = (state: RevealState | "opening") => (panel.dataset.reveal = state);

  const finish = () => {
    if (panel.dataset.reveal !== "opening") return;
    setState("shown");
    confetti.replaceChildren();
    name.focus();
    onUnwrapped();
  };

  gift.addEventListener("click", () => {
    if (panel.dataset.reveal !== "wrapped") return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setState("opening");
      return finish();
    }
    burstConfetti(confetti);
    setState("opening");
    setTimeout(finish, FALLBACK_MS);
  });
  name.addEventListener("animationend", (event) => {
    if (event.target === name) finish();
  });

  replay.addEventListener("click", () => {
    setState("wrapped");
    gift.focus();
  });
}

function burstConfetti(container: HTMLElement): void {
  const pieces = Array.from({ length: CONFETTI_PIECES }, (_, i) => {
    const piece = document.createElement("span");
    piece.className = "confetti__piece";
    // fan out upwards and to both sides, then fall
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const distance = 50 + Math.random() * 70;
    piece.style.setProperty("--dx", `${Math.round(Math.cos(angle) * distance * 1.7)}px`);
    piece.style.setProperty("--dy", `${Math.round(Math.sin(angle) * distance)}px`);
    piece.style.setProperty("--spin", `${Math.round((Math.random() - 0.5) * 720)}deg`);
    piece.style.setProperty("--delay", `${Math.round(Math.random() * 120)}ms`);
    piece.style.background = CONFETTI_COLOURS[i % CONFETTI_COLOURS.length];
    return piece;
  });
  container.replaceChildren(...pieces);
}
