import type { InviteResponse, JoinGroupResponse } from "../../shared/api";
import { MAX_PARTICIPANT_NAME_LENGTH, validateParticipantName } from "../../shared/group-input";
import { joinGroup } from "../api";
import { escapeHtml, showMessage, showView } from "../html";
import { joinNameErrorMessage, NETWORK_ERROR } from "../messages";
import { groupFacts, phaseLabel } from "./group-facts";
import { chosenFile, pictureField, uploadChosenPictures } from "./picture-panel";

function markup({ group }: InviteResponse): string {
  return `
    <section class="view">
      <header class="view__head">
        <p class="view__eyebrow">${phaseLabel[group.phase]}</p>
        <h1 class="view__title" tabindex="-1">${escapeHtml(group.name)}</h1>
        <p class="view__lead">Du bist zum Wichteln eingeladen. Gib deinen Namen ein, dann bist du dabei.</p>
        ${groupFacts(group)}
      </header>
      <form class="form panel" novalidate>
        <div class="field">
          <label class="field__label" for="name">Dein Name</label>
          <input class="field__input" id="name" name="name" type="text"
            maxlength="${MAX_PARTICIPANT_NAME_LENGTH * 2}" autocomplete="given-name"
            aria-describedby="name-hint name-error" />
          <p class="field__hint" id="name-hint">So sehen dich die anderen in der Gruppe.</p>
          <p class="field__error" id="name-error"></p>
        </div>
        ${pictureField("ownPicture", "Dein Profilbild (optional)", "Ohne Bild stehen deine Initialen da. Du kannst es später ändern.")}
        <button class="btn btn--primary form__submit" type="submit">Gruppe beitreten</button>
        <p class="form__status" role="status" data-form-status></p>
      </form>
    </section>`;
}

/** Shown when the group behind an Invite Link no longer takes new participants. */
export function renderJoinClosed(main: HTMLElement): void {
  showMessage(
    main,
    "Die Anmeldung ist geschlossen",
    "In dieser Gruppe wurde schon ausgelost. Wenn du dabei bist, öffne deinen persönlichen Link.",
  );
}

/**
 * Renders the join form; calls `onJoined` once the server has added the participant and the
 * chosen picture had its try (`pictureFailed`: it did not make it; they can add it on the group page).
 */
export function renderJoinGroup(
  main: HTMLElement,
  inviteCode: string,
  invite: InviteResponse,
  onJoined: (joined: JoinGroupResponse, pictureFailed: boolean) => void,
): void {
  showView(main, markup(invite));
  const form = main.querySelector<HTMLFormElement>("form")!;
  const input = form.querySelector<HTMLInputElement>("#name")!;
  const error = form.querySelector<HTMLElement>("#name-error")!;
  const status = form.querySelector<HTMLElement>("[data-form-status]")!;
  let sending = false;

  const showError = (message: string) => {
    error.textContent = message;
    if (message) {
      input.setAttribute("aria-invalid", "true");
      input.focus();
    } else input.removeAttribute("aria-invalid");
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;

    const name = validateParticipantName(input.value);
    if (!name.ok) return showError(joinNameErrorMessage(name.error));
    showError("");

    sending = true;
    const sendingNotice = setTimeout(() => (status.textContent = "Du wirst angemeldet …"), 300);
    try {
      const result = await joinGroup(inviteCode, name.value);
      if (result.ok) {
        const own = chosenFile(form, "ownPicture");
        if (own) status.textContent = "Bild wird hochgeladen …";
        const { joined, failed } = await uploadChosenPictures(result.joined, { own });
        onJoined(joined, failed);
      }
      else if ("nameError" in result) showError(joinNameErrorMessage(result.nameError));
      else renderJoinClosed(main);
    } catch {
      status.textContent = NETWORK_ERROR;
    } finally {
      clearTimeout(sendingNotice);
      sending = false;
    }
  });
}
