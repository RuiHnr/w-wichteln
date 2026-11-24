import type { ManageError, Me, ParticipantView } from "../../shared/api";
import type { GroupSettingsErrors, GroupSettingsField } from "../../shared/group-input";
import { validateGroupSettings } from "../../shared/group-input";
import type { UpdateSettingsResult } from "../api";
import { fetchMe, removeParticipant, setOrganizer, updateSettings } from "../api";
import { escapeHtml } from "../html";
import { budgetInputValue, fieldErrorMessage, manageErrorMessages } from "../messages";
import { localToday } from "../today";

/**
 * The organizer's controls on the group page: budget and date, and per participant the
 * Organizer role and removal. Only rendered for organizers; the API enforces the same rules.
 */

/** What happened after an organizer action, and which control (by `data-focus`) keeps the focus. */
export interface AfterAction {
  status: string;
  focus?: string;
}

/** How the group page shows the caller's fresh view after an action. */
export type Rerender = (me: Me, after: AfterAction) => void;

const settingsFields: GroupSettingsField[] = ["budget", "exchangeDate"];

const NETWORK_ERROR = "Das hat nicht geklappt. Prüf deine Verbindung und versuch es noch mal.";

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
  async function refused(error: ManageError, status: HTMLElement, focus?: string): Promise<void> {
    if (error === "unknown_token") return onUnrecognised();
    const fresh = await fetchMe(token).catch(() => null);
    if (fresh) rerender(fresh, { status: manageErrorMessages[error], focus });
    else status.textContent = manageErrorMessages[error];
  }

  async function run(
    request: () => Promise<UpdateSettingsResult>,
    status: HTMLElement,
    success: (me: Me) => string,
    focus?: string,
    onFieldErrors?: (errors: GroupSettingsErrors) => void,
  ): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const result = await request();
      if (result.ok) rerender(result.me, { status: success(result.me), focus });
      else if ("errors" in result) onFieldErrors?.(result.errors);
      else await refused(result.error, status, focus);
    } catch {
      status.textContent = NETWORK_ERROR;
    } finally {
      busy = false;
    }
  }

  for (const button of main.querySelectorAll<HTMLButtonElement>("[data-action]")) {
    const action = button.dataset.action as Action;
    const target = me.participants.find((p) => p.id === button.dataset.id)!;
    const label = button.textContent!;
    let disarm: ReturnType<typeof setTimeout> | undefined;

    const reset = () => {
      clearTimeout(disarm);
      delete button.dataset.armed;
      button.textContent = label;
    };
    button.addEventListener("blur", reset);

    button.addEventListener("click", () => {
      if (button.dataset.confirm && !button.dataset.armed) {
        button.dataset.armed = "true";
        button.textContent = button.dataset.confirm;
        peopleStatus.textContent = `${button.getAttribute("aria-label")}? Zum Bestätigen noch einmal tippen.`;
        disarm = setTimeout(reset, 5000);
        return;
      }
      reset();
      const request =
        action === "remove"
          ? () => removeParticipant(token, me.group.id, target.id)
          : () => setOrganizer(token, me.group.id, target.id, action === "grant");
      // After a role change the row keeps a button for the opposite action; focus that one.
      const opposite = action === "grant" ? "revoke" : action === "revoke" ? "grant" : undefined;
      void run(request, peopleStatus, (fresh) => successMessage(action, target, fresh), opposite && `${opposite}-${target.id}`);
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
