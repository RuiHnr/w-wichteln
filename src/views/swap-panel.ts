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

/** "Noch 1 von 2 Tauschen übrig." */
const limitLine = ({ completed, limit }: SwapsView) =>
  `Noch ${Math.max(limit - completed, 0)} von ${limit} ${limit === 1 ? "Tausch" : "Tauschen"} übrig.`;

/**
 * With the Swap Limit at 0 there is nothing to ask for, so the panel is not shown, unless a request
 * stayed open from before: then its sender and receiver still see it, and why it cannot be accepted.
 */
export function swapPanel(me: Me): string {
  const swaps = me.swaps;
  if (!swaps || (swaps.limit === 0 && !swaps.outgoing && !swaps.incoming.length)) return "";
  return `
    <section class="panel stack swap" aria-labelledby="swap-heading">
      <h2 class="panel__title" id="swap-heading" tabindex="-1" data-focus="swaps">Tausch</h2>
      ${swapBody(me, swaps)}
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
      <p class="panel__text swap__limit">${limitLine(swaps)}</p>
      ${incoming(swaps, atLimit)}
      ${swaps.outgoing ? outgoing(swaps.outgoing, atLimit) : atLimit ? "" : requestForm(me, swaps.incoming.length > 0)}`;
}

/** Over the limit the caller cannot accept: the request stays, and only declining is offered. */
function incoming({ incoming }: SwapsView, atLimit: boolean): string {
  if (!incoming.length) return "";
  const items = incoming
    .map(({ id, sender }) => {
      const name = escapeHtml(sender.name);
      return `
        <li class="swap__request">
          <p class="swap__line"><strong>${name}</strong> möchte mit dir tauschen.</p>
          <p class="panel__text">Dann beschenkst du, wen ${name} bisher beschenkt, und ${name} beschenkt deine Person.</p>
          ${atLimit ? `<p class="panel__text">Annehmen geht erst, wenn dein Tausch-Limit wieder höher ist. Die Anfrage bleibt bis dahin offen.</p>` : ""}
          <div class="swap__actions">
            ${
              atLimit
                ? ""
                : `<button class="btn btn--primary btn--small" type="button" data-swap-accept="${escapeHtml(id)}"
              data-focus="swap-accept-${escapeHtml(id)}" data-confirm="Wirklich tauschen?"
              aria-label="Tausch mit ${name} annehmen">Annehmen</button>`
            }
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

/** Over the limit the request stays open but cannot be accepted until the limit is raised. */
function outgoing({ id, receiver }: NonNullable<SwapsView["outgoing"]>, atLimit: boolean): string {
  const name = escapeHtml(receiver.name);
  const text = atLimit
    ? `Sie bleibt offen, kann aber erst angenommen werden, wenn dein Tausch-Limit wieder höher ist. Du kannst sie auch zurückziehen.`
    : `${name} sieht sie beim nächsten Besuch und nimmt sie an oder lehnt sie ab.`;
  return `
      <div class="swap__request swap__request--outgoing">
        <p class="swap__line">Deine Tauschanfrage an <strong>${name}</strong> ${atLimit ? "ist offen" : "wartet auf Antwort"}.</p>
        <p class="panel__text">${text}</p>
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

/** Accepting an open request the limit now blocks: it stays open, so say so. */
const acceptRefusals: Partial<Record<SwapError, string>> = {
  limit_reached: "Du hast dein Tausch-Limit erreicht. Die Anfrage bleibt offen, bis das Limit sie wieder zulässt.",
  partner_limit_reached: "Diese Person hat ihr Tausch-Limit erreicht. Die Anfrage bleibt offen, bis das Limit sie wieder zulässt.",
};

/** Hooks up the controls rendered by `swapPanel`; `rerender` shows the fresh view after an action. */
export function wireSwaps(main: HTMLElement, me: Me, token: string, rerender: Rerender, onUnrecognised: () => void): void {
  const panel = main.querySelector<HTMLElement>(".swap");
  if (!panel || !me.swaps) return;
  const status = panel.querySelector<HTMLElement>("[data-swap-status]")!;
  const nameOf = (id: string) => me.participants.find((p) => p.id === id)?.name ?? "";
  let busy = false;

  /** Runs an action; on success shows `success` near `focus`, on refusal the current state and why, near the same control. */
  async function run(
    request: () => Promise<SwapActionResult>,
    success: string,
    focus: string,
    refusedFocus = focus,
    messages: Partial<Record<SwapError, string>> = {},
  ): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const result = await request();
      if (result.ok) rerender(result.me, { status: success, focus, fallback: "swaps" });
      else await refused(result.error, refusedFocus, messages[result.error]);
    } catch {
      status.textContent = NETWORK_ERROR;
    } finally {
      busy = false;
    }
  }

  async function refused(error: SwapError, focus: string, message = swapErrorMessages[error]): Promise<void> {
    if (error === "unknown_token") return onUnrecognised();
    const fresh = await fetchMe(token).catch(() => null);
    if (fresh) rerender(fresh, { status: message, focus, fallback: "swaps" });
    else status.textContent = message;
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
    const accept = panel.querySelector<HTMLButtonElement>(`[data-swap-accept="${CSS.escape(request.id)}"]`);
    const decline = panel.querySelector<HTMLButtonElement>(`[data-swap-decline="${CSS.escape(request.id)}"]`)!;
    // Over the limit there is no accept button. After a swap the gift panel holds the new recipient, wrapped again: focus goes to its heading.
    if (accept) {
      onConfirmedClick(accept, status, () => {
        void run(() => acceptSwapRequest(token, request.id), "Getauscht. Öffne dein neues Geschenk.", "draw", `swap-accept-${request.id}`, acceptRefusals);
      });
    }
    decline.addEventListener("click", () => {
      void run(() => declineSwapRequest(token, request.id), `Tauschanfrage von ${request.sender.name} abgelehnt.`, "swaps");
    });
  }
}
