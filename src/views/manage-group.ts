import type { ExclusionView, ManageError, Me, ParticipantView } from "../../shared/api";
import type { GroupSettingsErrors, GroupSettingsField } from "../../shared/group-input";
import { MAX_SWAP_LIMIT, validateGroupSettings } from "../../shared/group-input";
import type { OrganizerActionResult } from "../api";
import { addExclusion, drawGroup, fetchMe, removeExclusion, removeParticipant, resetGroup, setOrganizer, updateSettings, updateSwapLimit } from "../api";
import { escapeHtml } from "../html";
import { budgetInputValue, exclusionErrorMessages, fieldErrorMessage, manageErrorMessages, NETWORK_ERROR } from "../messages";
import { localToday } from "../today";
import type { Rerender } from "./page-actions";
import { onConfirmedClick } from "./page-actions";

/**
 * The organizer's controls on the group page: the draw and its reset, budget and date, per participant
 * the Organizer role and removal, and the exclusions. Only wired up for organizers; the API
 * enforces the same rules.
 */

const settingsFields: GroupSettingsField[] = ["budget", "exchangeDate"];

/** The panel to change budget and date. */
export function settingsPanel({ group }: Me): string {
  return `
    <section class="panel stack" aria-labelledby="settings-heading">
      <h2 class="panel__title" id="settings-heading">Gruppe verwalten</h2>
      <p class="panel__text">Budget und Datum kannst du jederzeit ändern, auch nach der Auslosung.</p>
      <form class="form" novalidate data-settings>
        <div class="field">
          <label class="field__label" for="budget">Budget pro Geschenk</label>
          <div class="field__affix">
            <input class="field__input" id="budget" name="budget" type="text" inputmode="decimal"
              autocomplete="off" value="${budgetInputValue(group.budgetCents)}" aria-describedby="budget-error" />
            <span class="field__suffix" aria-hidden="true">€</span>
          </div>
          <p class="field__error" id="budget-error"></p>
        </div>
        <div class="field">
          <label class="field__label" for="exchangeDate">Datum der Bescherung</label>
          <input class="field__input" id="exchangeDate" name="exchangeDate" type="date" min="${localToday()}"
            value="${group.exchangeDate}" aria-describedby="exchangeDate-error" />
          <p class="field__error" id="exchangeDate-error"></p>
        </div>
        <button class="btn btn--primary form__submit" type="submit" data-focus="settings">Änderungen speichern</button>
        <p class="form__status" role="status" data-settings-status></p>
      </form>
    </section>`;
}

/** The panel to set the Tausch-Limit, 0 to 5; each choice is saved as soon as it is made. */
export function swapLimitPanel({ group }: Me): string {
  const options = Array.from({ length: MAX_SWAP_LIMIT + 1 }, (_, n) => {
    const checked = n === group.swapLimit;
    return `<label class="segment"><input class="segment__input" type="radio" name="swapLimit" value="${n}"${checked ? ` checked data-focus="swap-limit"` : ""} /><span class="segment__label">${n}</span></label>`;
  }).join("");
  return `
    <section class="panel stack" aria-labelledby="swap-limit-heading">
      <h2 class="panel__title" id="swap-limit-heading" tabindex="-1" data-focus="swap-limit-heading">Tausch-Limit</h2>
      <p class="panel__text">So viele Tausche darf jede Person höchstens machen. Bei 0 ist Tauschen ausgeschaltet. Was schon getauscht ist, bleibt bestehen.</p>
      <fieldset class="segments" data-swap-limit aria-labelledby="swap-limit-heading">
        ${options}
      </fieldset>
      <p class="form__status" role="status" data-swap-limit-status></p>
    </section>`;
}

/** Both names of an exclusion, in the order the group lists its participants. */
export function exclusionNames(me: Me, exclusion: Pick<ExclusionView, "participantIds">): [string, string] {
  const [first, second] = me.participants.filter((p) => exclusion.participantIds.includes(p.id));
  return [first?.name ?? "?", second?.name ?? "?"];
}

/** The panel listing the exclusions, with the form to add one while the group is open. */
export function exclusionsPanel(me: Me): string {
  const exclusions = me.exclusions ?? [];
  const open = me.group.phase === "open";
  const items = exclusions
    .map((exclusion) => {
      const [a, b] = exclusionNames(me, exclusion).map(escapeHtml);
      const remove = open
        ? `<div class="people__actions"><button class="btn btn--danger btn--small" type="button" data-exclusion="${escapeHtml(exclusion.id)}"
            aria-label="Ausschluss zwischen ${a} und ${b} aufheben">Aufheben</button></div>`
        : "";
      return `<li class="people__item"><span class="people__name">${a} <span class="exclusion__sep" aria-hidden="true">↔</span><span class="visually-hidden">und</span> ${b}</span>${remove}</li>`;
    })
    .join("");
  const list = exclusions.length
    ? `<ul class="people" role="list">${items}</ul>`
    : `<p class="panel__text">Noch keine Ausschlüsse.</p>`;

  let footer: string;
  if (!open) footer = `<p class="panel__text">Nach der Auslosung lassen sich Ausschlüsse nicht mehr ändern. Setz die Auslosung zurück, um sie anzupassen.</p>`;
  else if (me.participants.length < 2) footer = `<p class="panel__text">Sobald zwei Teilnehmer dabei sind, kannst du hier Ausschlüsse festlegen.</p>`;
  else footer = exclusionForm(me);

  return `
    <section class="panel stack" aria-labelledby="exclusions-heading">
      <h2 class="panel__title" id="exclusions-heading" tabindex="-1" data-focus="exclusions">Ausschlüsse <span class="panel__count">${exclusions.length}</span></h2>
      <p class="panel__text">Zwei Teilnehmer mit Ausschluss beschenken sich nicht gegenseitig, zum Beispiel ein Paar. Nur Organisatoren sehen diese Liste.</p>
      ${list}
      ${footer}
      <p class="form__status" role="status" data-exclusions-status></p>
    </section>`;
}

function exclusionForm(me: Me): string {
  const select = (id: string, label: string, selected: number) => `
        <div class="field">
          <label class="field__label" for="${id}">${label}</label>
          <select class="field__input field__select" id="${id}" name="${id}" aria-describedby="exclusion-error">
            ${me.participants
              .map((p, i) => `<option value="${escapeHtml(p.id)}"${i === selected ? " selected" : ""}>${escapeHtml(p.name)}</option>`)
              .join("")}
          </select>
        </div>`;
  return `
      <form class="form" novalidate data-exclusion-form>
        <div class="exclusion__pair">
          ${select("exclusion-a", "Erster Teilnehmer", 0)}
          ${select("exclusion-b", "Zweiter Teilnehmer", 1)}
        </div>
        <p class="field__error" id="exclusion-error"></p>
        <button class="btn btn--secondary form__submit" type="submit" data-focus="exclusion-add">Ausschluss hinzufügen</button>
      </form>`;
}

/** The buttons an organizer gets on one row of the participant list. */
export function participantActions(me: Me, p: ParticipantView): string {
  const isSelf = p.id === me.participant.id;
  const organizers = me.participants.filter((other) => other.isOrganizer).length;
  const name = escapeHtml(p.name);
  const buttons: string[] = [];

  if (!p.isOrganizer) {
    buttons.push(actionButton("grant", p, "Zum Organisator machen", `${name} zum Organisator machen`));
  } else if (organizers > 1) {
    buttons.push(
      isSelf
        ? actionButton("revoke", p, "Rolle abgeben", "Deine Organisator-Rolle abgeben", "Wirklich abgeben?")
        : actionButton("revoke", p, "Rolle entziehen", `${name} die Organisator-Rolle entziehen`),
    );
  }
  if (me.group.phase === "open" && !isSelf) {
    buttons.push(actionButton("remove", p, "Entfernen", `${name} aus der Gruppe entfernen`, "Wirklich entfernen?"));
  }
  return buttons.length ? `<div class="people__actions">${buttons.join("")}</div>` : "";
}

type Action = "grant" | "revoke" | "remove";

/** With `confirm`, the first press arms the button and only the second one acts. */
function actionButton(action: Action, p: ParticipantView, label: string, ariaLabel: string, confirm?: string): string {
  const variant = action === "remove" ? "btn--danger" : "btn--secondary";
  return `<button class="btn ${variant} btn--small" type="button" data-action="${action}" data-id="${escapeHtml(p.id)}"
    data-focus="${action}-${escapeHtml(p.id)}" aria-label="${ariaLabel}"${confirm ? ` data-confirm="${confirm}"` : ""}>${label}</button>`;
}

function successMessage(action: Action, p: ParticipantView, me: Me): string {
  const isSelf = p.id === me.participant.id;
  if (action === "remove") return `${p.name} ist nicht mehr in der Gruppe.`;
  if (action === "grant") return `${p.name} ist jetzt Organisator.`;
  return isSelf ? "Du bist kein Organisator mehr." : `${p.name} ist kein Organisator mehr.`;
}

/** Hooks up the organizer controls rendered by `settingsPanel` and `participantActions`. */
export function wireManage(
  main: HTMLElement,
  me: Me,
  token: string,
  rerender: Rerender,
  onUnrecognised: () => void,
): void {
  const peopleStatus = main.querySelector<HTMLElement>("[data-people-status]")!;
  const form = main.querySelector<HTMLFormElement>("[data-settings]");
  let busy = false;

  /** A refused action: show the current state, then say why. */
  async function refused(error: ManageError, status: HTMLElement, focus?: string, fallback?: string): Promise<void> {
    if (error === "unknown_token") return onUnrecognised();
    const fresh = await fetchMe(token).catch(() => null);
    if (fresh) rerender(fresh, { status: manageErrorMessages[error], focus, fallback });
    else status.textContent = manageErrorMessages[error];
  }

  async function run<FieldErrors>(
    request: () => Promise<OrganizerActionResult | { ok: false; errors: FieldErrors }>,
    status: HTMLElement,
    success: (me: Me) => string,
    focus?: string,
    onFieldErrors?: (errors: FieldErrors) => void,
    fallback?: string,
  ): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const result = await request();
      if (result.ok) rerender(result.me, { status: success(result.me), focus, fallback });
      else if ("errors" in result) onFieldErrors?.(result.errors);
      else await refused(result.error, status, focus, fallback);
    } catch {
      status.textContent = NETWORK_ERROR;
    } finally {
      busy = false;
    }
  }

  for (const button of main.querySelectorAll<HTMLButtonElement>("[data-action]")) {
    const action = button.dataset.action as Action;
    const target = me.participants.find((p) => p.id === button.dataset.id)!;

    onConfirmedClick(button, peopleStatus, () => {
      const request =
        action === "remove"
          ? () => removeParticipant(token, me.group.id, target.id)
          : () => setOrganizer(token, me.group.id, target.id, action === "grant");
      // After a role change the row keeps a button for the opposite action; focus that one.
      const opposite = action === "grant" ? "revoke" : action === "revoke" ? "grant" : undefined;
      void run(request, peopleStatus, (fresh) => successMessage(action, target, fresh), opposite && `${opposite}-${target.id}`);
    });
  }

  const drawButton = main.querySelector<HTMLButtonElement>("[data-draw]");
  if (drawButton) {
    const drawStatus = main.querySelector<HTMLElement>("[data-draw-status]")!;
    // After the draw the button is gone and its panel shows the recipient; focus goes to that panel's heading.
    const success = () => "Ausgelost. Die Anmeldung ist jetzt geschlossen.";
    onConfirmedClick(drawButton, drawStatus, () => {
      void run(() => drawGroup(token, me.group.id), drawStatus, success, "draw-start", undefined, "draw");
    });
  }

  wireReset();
  wireExclusions();
  wireSwapLimit();

  function wireSwapLimit(): void {
    const fieldset = main.querySelector<HTMLFieldSetElement>("[data-swap-limit]");
    if (!fieldset) return;
    const status = main.querySelector<HTMLElement>("[data-swap-limit-status]")!;
    fieldset.addEventListener("change", (event) => {
      const limit = Number((event.target as HTMLInputElement).value);
      const success = () => (limit === 0 ? "Tauschen ist ausgeschaltet." : `Tausch-Limit auf ${limit} gesetzt.`);
      // One save at a time: while it runs the choices are off, and a failed save shows the stored limit again.
      fieldset.disabled = true;
      void run(() => updateSwapLimit(token, me.group.id, limit), status, success, "swap-limit", undefined, "swap-limit-heading").finally(() => {
        fieldset.disabled = false;
        const stored = fieldset.querySelector<HTMLInputElement>(`input[value="${me.group.swapLimit}"]`);
        if (stored && fieldset.isConnected) stored.checked = true;
      });
    });
  }

  function wireReset(): void {
    const open = main.querySelector<HTMLButtonElement>("[data-reset-open]");
    if (!open) return;
    const dialog = main.querySelector<HTMLDialogElement>("[data-reset-dialog]")!;
    const status = main.querySelector<HTMLElement>("[data-reset-status]")!;
    open.addEventListener("click", () => dialog.showModal());
    dialog.querySelector("[data-reset-cancel]")!.addEventListener("click", () => dialog.close());
    // A click on the backdrop cancels too. It lands on the dialog itself, as does one on its padding, so check where.
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
      if (!inside) dialog.close();
    });
    dialog.querySelector("[data-reset-confirm]")!.addEventListener("click", () => {
      dialog.close();
      // The group is open again: focus goes to the start button of the draw, or its heading when too few are left.
      void run(
        () => resetGroup(token, me.group.id),
        status,
        () => "Zurückgesetzt. Die Anmeldung ist wieder offen.",
        "draw-start",
        undefined,
        "draw",
      );
    });
  }

  function wireExclusions(): void {
    const status = main.querySelector<HTMLElement>("[data-exclusions-status]")!;
    // Focus stays on the add button; without the form (say, the group was drawn meanwhile) it goes to the heading.
    const [focus, fallback] = ["exclusion-add", "exclusions"];

    for (const button of main.querySelectorAll<HTMLButtonElement>("[data-exclusion]")) {
      const exclusion = me.exclusions!.find((e) => e.id === button.dataset.exclusion)!;
      const [a, b] = exclusionNames(me, exclusion);
      button.addEventListener("click", () => {
        void run(
          () => removeExclusion(token, me.group.id, exclusion.id),
          status,
          () => `${a} und ${b} können sich jetzt wieder gegenseitig beschenken.`,
          focus,
          undefined,
          fallback,
        );
      });
    }

    const exclusionForm = main.querySelector<HTMLFormElement>("[data-exclusion-form]");
    if (!exclusionForm) return;
    const error = exclusionForm.querySelector<HTMLElement>("#exclusion-error")!;
    const second = exclusionForm.elements.namedItem("exclusion-b") as HTMLSelectElement;
    const showError = (message: string) => {
      error.textContent = message;
      if (message) second.setAttribute("aria-invalid", "true");
      else second.removeAttribute("aria-invalid");
      if (message) second.focus();
    };

    exclusionForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(exclusionForm);
      const ids: [string, string] = [String(data.get("exclusion-a")), String(data.get("exclusion-b"))];
      if (ids[0] === ids[1]) return showError(exclusionErrorMessages.same);
      showError("");
      // Adding a pair that exists already changes nothing on the server, so it reads as success here too.
      const [a, b] = exclusionNames(me, { participantIds: ids });
      void run(
        () => addExclusion(token, me.group.id, ids),
        status,
        () => `${a} und ${b} beschenken sich nicht gegenseitig.`,
        focus,
        (errors) => showError(exclusionErrorMessages[errors.participantIds]),
        fallback,
      );
    });
  }

  if (!form) return;
  const settingsStatus = form.querySelector<HTMLElement>("[data-settings-status]")!;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const input = { budget: String(data.get("budget") ?? ""), exchangeDate: String(data.get("exchangeDate") ?? "") };
    const checked = validateGroupSettings(input, localToday(), me.group.exchangeDate);
    showSettingsErrors(form, checked.ok ? {} : checked.errors);
    if (!checked.ok) return;

    void run(
      () => updateSettings(token, me.group.id, input),
      settingsStatus,
      () => "Budget und Datum sind gespeichert.",
      "settings",
      (errors) => showSettingsErrors(form, errors),
    );
  });
}

function showSettingsErrors(form: HTMLFormElement, errors: GroupSettingsErrors): void {
  let first: HTMLInputElement | null = null;
  for (const field of settingsFields) {
    const input = form.elements.namedItem(field) as HTMLInputElement;
    const error = errors[field];
    form.querySelector<HTMLElement>(`#${field}-error`)!.textContent = error ? fieldErrorMessage(field, error) : "";
    if (error) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
    if (error && !first) first = input;
  }
  first?.focus();
}
