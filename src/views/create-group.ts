import type { CreateGroupResponse } from "../../shared/api";
import type { GroupField, GroupInputErrors, RawGroupInput } from "../../shared/group-input";
import { MAX_GROUP_NAME_LENGTH, MAX_PARTICIPANT_NAME_LENGTH, validateGroupInput } from "../../shared/group-input";
import { createGroup } from "../api";
import { showView } from "../html";
import { fieldErrorMessage } from "../messages";
import { localToday } from "../today";

const fields: GroupField[] = ["name", "budget", "exchangeDate", "organizerName"];

function markup(today: string): string {
  return `
    <section class="view">
      <header class="view__head">
        <h1 class="view__title" tabindex="-1">Gruppe anlegen</h1>
        <p class="view__lead">Du legst Budget und Datum fest. Danach schickst du den Einladungslink an deine Freunde.</p>
      </header>
      <form class="form panel" novalidate>
        <div class="field">
          <label class="field__label" for="name">Name der Gruppe</label>
          <input class="field__input" id="name" name="name" type="text" maxlength="${MAX_GROUP_NAME_LENGTH * 2}"
            autocomplete="off" aria-describedby="name-error" />
          <p class="field__error" id="name-error"></p>
        </div>
        <div class="field">
          <label class="field__label" for="budget">Budget pro Geschenk</label>
          <div class="field__affix">
            <input class="field__input" id="budget" name="budget" type="text" inputmode="decimal"
              autocomplete="off" aria-describedby="budget-error" />
            <span class="field__suffix" aria-hidden="true">€</span>
          </div>
          <p class="field__error" id="budget-error"></p>
        </div>
        <div class="field">
          <label class="field__label" for="exchangeDate">Datum der Bescherung</label>
          <input class="field__input" id="exchangeDate" name="exchangeDate" type="date" min="${today}"
            aria-describedby="exchangeDate-error" />
          <p class="field__error" id="exchangeDate-error"></p>
        </div>
        <div class="field">
          <label class="field__label" for="organizerName">Dein Name</label>
          <input class="field__input" id="organizerName" name="organizerName" type="text"
            maxlength="${MAX_PARTICIPANT_NAME_LENGTH * 2}" autocomplete="given-name"
            aria-describedby="organizerName-hint organizerName-error" />
          <p class="field__hint" id="organizerName-hint">So sehen dich die anderen in der Gruppe.</p>
          <p class="field__error" id="organizerName-error"></p>
        </div>
        <button class="btn btn--primary form__submit" type="submit">Gruppe anlegen</button>
        <p class="form__status" role="status" data-form-status></p>
      </form>
    </section>`;
}

/** Puts each error under its field, focuses the first and says how many there are. */
function showErrors(form: HTMLFormElement, status: HTMLElement, errors: GroupInputErrors): void {
  let first: HTMLInputElement | null = null;
  for (const field of fields) {
    const input = form.elements.namedItem(field) as HTMLInputElement;
    const slot = form.querySelector<HTMLElement>(`#${field}-error`)!;
    const error = errors[field];
    slot.textContent = error ? fieldErrorMessage(field, error) : "";
    if (error) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
    if (error && !first) first = input;
  }
  first?.focus();
  const count = Object.keys(errors).length;
  status.textContent = count === 0 ? "" : count === 1 ? "Bitte prüf ein Feld." : `Bitte prüf ${count} Felder.`;
}

function readInput(form: HTMLFormElement): RawGroupInput {
  const data = new FormData(form);
  return Object.fromEntries(fields.map((field) => [field, String(data.get(field) ?? "")])) as unknown as RawGroupInput;
}

/** Renders the create-group form; calls `onCreated` once the server has stored the group. */
export function renderCreateGroup(main: HTMLElement, onCreated: (created: CreateGroupResponse) => void): void {
  const today = localToday();
  showView(main, markup(today));
  const form = main.querySelector<HTMLFormElement>("form")!;
  const status = form.querySelector<HTMLElement>("[data-form-status]")!;
  let sending = false;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;

    const input = readInput(form);
    const checked = validateGroupInput(input, today);
    if (!checked.ok) return showErrors(form, status, checked.errors);
    showErrors(form, status, {});

    sending = true;
    const sendingNotice = setTimeout(() => (status.textContent = "Gruppe wird angelegt …"), 300);
    try {
      const result = await createGroup(input);
      if (!result.ok) return showErrors(form, status, result.errors);
      onCreated(result.created);
    } catch {
      status.textContent = "Die Gruppe konnte nicht angelegt werden. Prüf deine Verbindung und versuch es noch mal.";
    } finally {
      clearTimeout(sendingNotice);
      sending = false;
    }
  });
}
