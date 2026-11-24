import type { Me, SwapError, SwapsView } from "../../shared/api";
import type { SwapActionResult } from "../api";
import { acceptSwapRequest, declineSwapRequest, fetchMe, sendSwapRequest, withdrawSwapRequest } from "../api";
import { escapeHtml } from "../html";
import { NETWORK_ERROR, swapErrorMessages } from "../messages";
import type { Rerender } from "./page-actions";
import { onConfirmedClick } from "./page-actions";

/**
 * The Swap on the group page, once it is drawn: a giver asks another giver by name, the other
 * accepts or declines on their next visit. Neither sees the other's recipient; after a swap
 * each sees only their own new one, as a fresh wrapped gift. The API enforces every rule.
 */

/** "0 von 1 genutzt" */
const limitLine = ({ completed, limit }: SwapsView) => `Tausch-Limit: ${Math.min(completed, limit)} von ${limit} genutzt.`;

export function swapPanel(me: Me): string {
  const swaps = me.swaps;
  if (!swaps) return "";
  return `
    <section class="panel stack swap" aria-labelledby="swap-heading">
      <h2 class="panel__title" id="swap-heading" tabindex="-1" data-focus="swaps">Tausch</h2>
      ${swaps.limit === 0 ? `<p class="panel__text">In dieser Gruppe ist Tauschen ausgeschaltet.</p>` : swapBody(me, swaps)}
      <p class="form__status" role="status" data-swap-status></p>
    </section>`;
}

function swapBody(me: Me, swaps: SwapsView): string {
  const atLimit = swaps.completed >= swaps.limit;
  const intro = atLimit
    ? `<p class="panel__text">Du hast dein Tausch-Limit erreicht. Wen du beschenkst, steht jetzt fest.</p>`
    : `<p class="panel__text">Du möchtest lieber jemand anderen beschenken? Frag eine andere Person, ob sie mit dir tauscht. Keiner von euch sieht vorher, wen der andere beschenkt.</p>`;
  return `
      ${intro}
      ${atLimit ? "" : `<p class="panel__text swap__limit">${limitLine(swaps)}</p>`}
      ${incoming(swaps)}
      ${atLimit ? "" : swaps.outgoing ? outgoing(swaps.outgoing) : requestForm(me, swaps.incoming.length > 0)}`;
}

function incoming({ incoming }: SwapsView): string {
  if (!incoming.length) return "";
  const items = incoming
    .map(({ id, sender }) => {
      const name = escapeHtml(sender.name);
      return `
        <li class="swap__request">
          <p class="swap__line"><strong>${name}</strong> möchte mit dir tauschen.</p>
          <p class="panel__text">Dann beschenkst du, wen ${name} bisher beschenkt, und ${name} beschenkt deine Person.</p>
          <div class="swap__actions">
            <button class="btn btn--primary btn--small" type="button" data-swap-accept="${escapeHtml(id)}"
              data-focus="swap-accept-${escapeHtml(id)}" data-confirm="Wirklich tauschen?"
              aria-label="Tausch mit ${name} annehmen">Annehmen</button>
            <button class="btn btn--secondary btn--small" type="button" data-swap-decline="${escapeHtml(id)}"
              data-focus="swap-decline-${escapeHtml(id)}" aria-label="Tauschanfrage von ${name} ablehnen">Ablehnen</button>
          </div>
        </li>`;
    })
    .join("");
  return `
      <div class="stack swap__incoming">
        <h3 class="swap__heading">${incoming.length === 1 ? "Tauschanfrage an dich" : `Tauschanfragen an dich <span class="panel__count">${incoming.length}</span>`}</h3>
        <ul class="swap__requests" role="list">${items}</ul>
      </div>`;
}

function outgoing({ id, receiver }: NonNullable<SwapsView["outgoing"]>): string {
  const name = escapeHtml(receiver.name);
  return `
      <div class="swap__request swap__request--outgoing">
        <p class="swap__line">Deine Tauschanfrage an <strong>${name}</strong> wartet auf Antwort.</p>
        <p class="panel__text">${name} sieht sie beim nächsten Besuch und nimmt sie an oder lehnt sie ab.</p>
        <div class="swap__actions">
          <button class="btn btn--secondary btn--small" type="button" data-swap-withdraw="${escapeHtml(id)}"
            data-focus="swap-withdraw" aria-label="Tauschanfrage an ${name} zurückziehen">Zurückziehen</button>
        </div>
      </div>`;
}

/** With requests to the caller above it, the form gets its own heading so it does not read as part of them. */
function requestForm(me: Me, belowIncoming: boolean): string {
  const others = me.participants.filter((p) => p.id !== me.participant.id);
  return `
      ${belowIncoming ? `<h3 class="swap__heading">Selbst anfragen</h3>` : ""}
      <form class="form" novalidate data-swap-form>
        <div class="field">
          <label class="field__label" for="swap-receiver">Mit wem möchtest du tauschen?</label>
          <select class="field__input field__select" id="swap-receiver" name="receiverId" aria-describedby="swap-receiver-error">
            <option value="" selected disabled>Person wählen</option>
            ${others.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join("")}
          </select>
          <p class="field__error" id="swap-receiver-error"></p>
        </div>
        <button class="btn btn--secondary form__submit" type="submit" data-focus="swap-send">Tauschanfrage senden</button>
      </form>`;
}

/** Hooks up the controls rendered by `swapPanel`; `rerender` shows the fresh view after an action. */
export function wireSwaps(main: HTMLElement, me: Me, token: string, rerender: Rerender, onUnrecognised: () => void): void {
  const panel = main.querySelector<HTMLElement>(".swap");
  if (!panel || !me.swaps) return;
  const status = panel.querySelector<HTMLElement>("[data-swap-status]")!;
  const nameOf = (id: string) => me.participants.find((p) => p.id === id)?.name ?? "";
  let busy = false;

  /** Runs an action; on success shows `success` near `focus`, on refusal the current state and why, near the same control. */
  async function run(request: () => Promise<SwapActionResult>, success: string, focus: string, refusedFocus = focus): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const result = await request();
      if (result.ok) rerender(result.me, { status: success, focus, fallback: "swaps" });
      else await refused(result.error, refusedFocus);
    } catch {
      status.textContent = NETWORK_ERROR;
    } finally {
      busy = false;
    }
  }

  async function refused(error: SwapError, focus: string): Promise<void> {
    if (error === "unknown_token") return onUnrecognised();
    const fresh = await fetchMe(token).catch(() => null);
    if (fresh) rerender(fresh, { status: swapErrorMessages[error], focus, fallback: "swaps" });
    else status.textContent = swapErrorMessages[error];
  }

  const form = panel.querySelector<HTMLFormElement>("[data-swap-form]");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const receiverId = String(new FormData(form).get("receiverId") ?? "");
    const select = form.querySelector<HTMLSelectElement>("#swap-receiver")!;
    const error = form.querySelector<HTMLElement>("#swap-receiver-error")!;
    if (!receiverId) {
      error.textContent = "Wähl aus, mit wem du tauschen möchtest.";
      select.setAttribute("aria-invalid", "true");
      return select.focus();
    }
    error.textContent = "";
    select.removeAttribute("aria-invalid");
    void run(() => sendSwapRequest(token, receiverId), `Tauschanfrage an ${nameOf(receiverId)} gesendet.`, "swap-withdraw", "swap-send");
  });

  for (const button of panel.querySelectorAll<HTMLButtonElement>("[data-swap-withdraw]")) {
    button.addEventListener("click", () => {
      void run(() => withdrawSwapRequest(token, button.dataset.swapWithdraw!), "Tauschanfrage zurückgezogen.", "swap-send", "swap-withdraw");
    });
  }

  for (const request of me.swaps.incoming) {
    const accept = panel.querySelector<HTMLButtonElement>(`[data-swap-accept="${CSS.escape(request.id)}"]`)!;
    const decline = panel.querySelector<HTMLButtonElement>(`[data-swap-decline="${CSS.escape(request.id)}"]`)!;
    // After the swap the gift panel holds the new recipient, wrapped again: focus goes to its heading.
    onConfirmedClick(accept, status, () => {
      void run(() => acceptSwapRequest(token, request.id), "Getauscht. Öffne dein neues Geschenk.", "draw", `swap-accept-${request.id}`);
    });
    decline.addEventListener("click", () => {
      void run(() => declineSwapRequest(token, request.id), `Tauschanfrage von ${request.sender.name} abgelehnt.`, "swaps");
    });
  }
}
