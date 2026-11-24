import type { CreateGroupResponse, Me, PictureError } from "../../shared/api";
import { PICTURE_TYPES } from "../../shared/picture";
import type { PictureActionResult } from "../api";
import { fetchMe, removeGroupPicture, removeOwnPicture, uploadGroupPicture, uploadOwnPicture } from "../api";
import { escapeHtml } from "../html";
import { NETWORK_ERROR, pictureErrorMessages } from "../messages";
import { initials, scaleDown } from "../picture";
import type { Rerender } from "./page-actions";

/**
 * Group Picture and Participant Picture on the page: the picture fields of the create and
 * join forms, the avatar next to a name, the Group Picture at the top, and the two panels to
 * change or remove them. The API decides who may; the group panel is only shown to organizers
 * and the profile panel only changes the caller's own.
 */

const ACCEPT = PICTURE_TYPES.join(",");

/** A Participant Picture, or the initials standing in for it. Decorative: the name sits right beside it. */
export function avatar(name: string, picture: string | undefined, size: "small" | "large" = "small"): string {
  const inner = picture
    ? `<img class="avatar__img" src="${escapeHtml(picture)}" alt="" width="96" height="96" loading="lazy" decoding="async" />`
    : `<span class="avatar__initials">${escapeHtml(initials(name))}</span>`;
  return `<span class="avatar avatar--${size}" aria-hidden="true">${inner}</span>`;
}

/** The Group Picture at the top of the group page; nothing without one. */
export function groupPicture(me: Me): string {
  if (!me.group.picture) return "";
  return `<img class="group-picture" src="${escapeHtml(me.group.picture)}" alt="Gruppenbild von ${escapeHtml(me.group.name)}" decoding="async" />`;
}

/** An optional picture field of the create and join forms. */
export function pictureField(id: string, label: string, hint: string): string {
  return `
        <div class="field">
          <label class="field__label" for="${id}">${label}</label>
          <input class="field__input field__file" id="${id}" name="${id}" type="file" accept="${ACCEPT}" aria-describedby="${id}-hint" />
          <p class="field__hint" id="${id}-hint">${hint}</p>
        </div>`;
}

/** The file chosen in a picture field, if any. */
export function chosenFile(form: HTMLFormElement, id: string): File | null {
  const input = form.elements.namedItem(id) as HTMLInputElement | null;
  return input?.files?.[0] ?? null;
}

/**
 * Uploads the pictures chosen while creating or joining, after the group or participant exists:
 * that never fails because of a picture. Resolves with the freshest view and whether any
 * picture did not make it, in which case the person adds it on the group page.
 */
export async function uploadChosenPictures(
  joined: CreateGroupResponse,
  chosen: { group?: File | null; own?: File | null },
): Promise<{ joined: CreateGroupResponse; failed: boolean }> {
  const { token, me } = joined;
  const tasks: Promise<PictureActionResult>[] = [];
  if (chosen.group) tasks.push(scaleDown(chosen.group).then((image) => uploadGroupPicture(token, me.group.id, image)));
  if (chosen.own) tasks.push(scaleDown(chosen.own).then((image) => uploadOwnPicture(token, me.group.id, me.participant.id, image)));
  if (tasks.length === 0) return { joined, failed: false };

  const results = await Promise.allSettled(tasks);
  const failed = results.some((r) => r.status === "rejected" || !r.value.ok);
  if (results.every((r) => r.status === "rejected" || !r.value.ok)) return { joined, failed };
  // Each answer shows only its own change; ask for the whole view once.
  const fresh = await fetchMe(token).catch(() => null);
  return { joined: { token, me: fresh ?? joined.me }, failed };
}

interface PanelText {
  id: string;
  title: string;
  text: string;
  preview: string;
  hasPicture: boolean;
}

function panel({ id, title, text, preview, hasPicture }: PanelText): string {
  return `
    <section class="panel stack" aria-labelledby="${id}-heading" data-picture-panel="${id}">
      <h2 class="panel__title" id="${id}-heading">${title}</h2>
      <p class="panel__text">${text}</p>
      <div class="picture-edit">
        ${preview}
        <div class="picture-edit__actions">
          <label class="btn btn--secondary btn--small picture-edit__choose">
            <span>${hasPicture ? "Anderes Bild wählen" : "Bild wählen"}</span>
            <input class="visually-hidden" type="file" accept="${ACCEPT}" data-picture-input data-focus="${id}" />
          </label>
          ${hasPicture ? `<button class="btn btn--secondary btn--small" type="button" data-picture-remove data-focus="${id}-remove">Bild entfernen</button>` : ""}
        </div>
      </div>
      <p class="form__status" role="status" data-picture-status></p>
    </section>`;
}

/** Everyone changes or removes their own Participant Picture, in either phase. */
export function ownPicturePanel(me: Me): string {
  const { participant } = me;
  return panel({
    id: "own-picture",
    title: "Dein Profilbild",
    text: "Alle in der Gruppe sehen es. Ohne Bild stehen deine Initialen da. Nur du kannst es ändern oder entfernen.",
    preview: avatar(participant.name, participant.picture, "large"),
    hasPicture: Boolean(participant.picture),
  });
}

/** Organizers change or remove the Group Picture, in either phase. */
export function groupPicturePanel(me: Me): string {
  const { group } = me;
  return panel({
    id: "group-picture",
    title: "Gruppenbild",
    text: "Es erscheint oben auf der Gruppenseite. Jeder Organisator kann es ändern oder entfernen.",
    preview: group.picture
      ? `<img class="group-picture group-picture--preview" src="${escapeHtml(group.picture)}" alt="" loading="lazy" />`
      : `<span class="group-picture group-picture--empty" aria-hidden="true"></span>`,
    hasPicture: Boolean(group.picture),
  });
}

/** Hooks up the panels rendered above, whichever of them the page has. */
export function wirePictures(main: HTMLElement, me: Me, token: string, rerender: Rerender, onUnrecognised: () => void): void {
  const groupId = me.group.id;
  const handlers = {
    "own-picture": {
      upload: (image: Blob) => uploadOwnPicture(token, groupId, me.participant.id, image),
      remove: () => removeOwnPicture(token, groupId, me.participant.id),
      saved: "Dein Profilbild ist gespeichert.",
      removed: "Dein Profilbild ist entfernt.",
    },
    "group-picture": {
      upload: (image: Blob) => uploadGroupPicture(token, groupId, image),
      remove: () => removeGroupPicture(token, groupId),
      saved: "Das Gruppenbild ist gespeichert.",
      removed: "Das Gruppenbild ist entfernt.",
    },
  } as const;

  for (const section of main.querySelectorAll<HTMLElement>("[data-picture-panel]")) {
    const handler = handlers[section.dataset.picturePanel as keyof typeof handlers];
    const status = section.querySelector<HTMLElement>("[data-picture-status]")!;
    const input = section.querySelector<HTMLInputElement>("[data-picture-input]")!;
    const removeButton = section.querySelector<HTMLButtonElement>("[data-picture-remove]");
    const controls = [input, removeButton].filter((c): c is HTMLInputElement | HTMLButtonElement => c !== null);
    const id = section.dataset.picturePanel!;
    let busy = false;

    /** Runs one change, then shows the fresh view; says what went wrong otherwise. */
    const run = async (act: () => Promise<PictureActionResult>, done: string, focus: string) => {
      if (busy) return;
      busy = true;
      controls.forEach((c) => (c.disabled = true));
      status.textContent = "Einen Moment …";
      try {
        const result = await act();
        if (result.ok) return rerender(result.me, { status: done, focus, fallback: id });
        if (result.error === "unknown_token") return onUnrecognised();
        status.textContent = pictureErrorMessages[result.error as PictureError];
      } catch (error) {
        status.textContent = error instanceof BrowserCannotRead ? pictureErrorMessages.wrong_format : NETWORK_ERROR;
      }
      busy = false;
      controls.forEach((c) => (c.disabled = false));
    };

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      void run(
        async () => {
          const image = await scaleDown(file).catch(() => {
            throw new BrowserCannotRead();
          });
          return handler.upload(image);
        },
        handler.saved,
        id,
      );
      input.value = "";
    });
    removeButton?.addEventListener("click", () => void run(handler.remove, handler.removed, id));
  }
}

/** The chosen file is not an image this browser can decode (HEIC, a renamed text file, ...). */
class BrowserCannotRead extends Error {}

export type { PictureError };
