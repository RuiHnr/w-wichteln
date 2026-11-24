import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/figtree";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";
import type { CreateGroupResponse } from "../shared/api";
import { fetchInvite, fetchMe, groupStillExists } from "./api";
import { showMessage } from "./html";
import { createIdentityStore } from "./identity";
import { groupPath } from "./links";
import { startSnowfall } from "./snowfall";
import { renderCreateGroup } from "./views/create-group";
import { renderGroupGone, renderGroupPage, renderNotRecognised } from "./views/group-page";
import { renderJoinClosed, renderJoinGroup } from "./views/join-group";

const canvas = document.querySelector<HTMLCanvasElement>(".snowfall");
if (canvas) startSnowfall(canvas);

const main = document.querySelector<HTMLElement>("#main")!;
const identity = createIdentityStore(localStorage);

/** No usable token for this group: say so, unless the group itself is gone (deleted by an organizer, or 60 days after its date). */
async function showNotRecognised(groupId: string): Promise<void> {
  if ((await groupStillExists(groupId)) === false) return renderGroupGone(main);
  renderNotRecognised(main);
}

async function showGroup(groupId: string): Promise<void> {
  const token = identity.tokenFor(groupId);
  if (!token) return showNotRecognised(groupId);

  showLoading("Gruppe wird geladen …");
  try {
    const me = await fetchMe(token);
    if (!me || me.group.id !== groupId) {
      identity.forget(groupId);
      return showNotRecognised(groupId);
    }
    renderGroupPage(main, me, token);
  } catch {
    showOffline();
  }
}

/** A calm wait: the line says what is loading, three fairy lights twinkle in turn while it does. */
function showLoading(text: string): void {
  // a pressed button (the retry) is about to vanish: park the focus on <main> so the next view still moves it to its heading
  const focusWasInside = main.contains(document.activeElement);
  main.innerHTML = `<section class="view loading" role="status">
    <p class="loading__text">${text}</p>
    <span class="loading__lights" aria-hidden="true"><i></i><i></i><i></i></span>
  </section>`;
  if (focusWasInside) main.focus();
}

/** The server cannot be reached: say so and offer the retry right there, instead of only asking for a reload. */
function showOffline(): void {
  showMessage(main, "Die Gruppe lässt sich gerade nicht laden", "Prüf deine Verbindung und versuch es noch mal.");
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "btn btn--primary";
  retry.textContent = "Erneut versuchen";
  retry.addEventListener("click", route);
  main.querySelector(".view")?.append(retry);
}

/** Remembers the participant on this device and shows their group page under its own address. */
function enterGroup({ token, me }: CreateGroupResponse, navigate: "push" | "replace"): void {
  identity.remember(me.group.id, token);
  history[navigate === "push" ? "pushState" : "replaceState"](null, "", groupPath(me.group.id));
  renderGroupPage(main, me, token);
}

/** The Invite Link: someone already in the group goes straight to it; anyone else may join while it is open. */
async function showJoin(inviteCode: string): Promise<void> {
  showLoading("Einladung wird geladen …");
  try {
    const invite = await fetchInvite(inviteCode);
    if (!invite) {
      // A deleted group's invite code is unknown just like a mistyped one; the page covers both.
      return renderGroupGone(main);
    }
    const token = identity.tokenFor(invite.group.id);
    const me = token ? await fetchMe(token) : null;
    if (token && me?.group.id === invite.group.id) return enterGroup({ token, me }, "replace");
    if (token) identity.forget(invite.group.id);

    if (invite.group.phase !== "open") return renderJoinClosed(main);
    renderJoinGroup(main, inviteCode, invite, (joined) => enterGroup(joined, "push"));
  } catch {
    showOffline();
  }
}

/**
 * The Personal Link restores identity on this device (ADR 0002). Once the token is stored
 * or rejected it leaves the address bar, so it does not linger in the history or on screen.
 * When the server cannot be reached it stays, so a reload can try again.
 */
async function showPersonal(token: string): Promise<void> {
  showLoading("Du wirst erkannt …");
  try {
    const me = await fetchMe(token);
    if (!me) {
      history.replaceState(null, "", "/");
      // This device may know the token's group: if that group is gone, say so instead.
      const groupId = identity.groupWith(token);
      if (groupId) identity.forget(groupId);
      if (groupId && (await groupStillExists(groupId)) === false) return renderGroupGone(main);
      return showMessage(main, "Dieser persönliche Link gilt nicht", "Prüf, ob du ihn vollständig kopiert hast. Vielleicht gibt es die Gruppe auch nicht mehr: Organisatoren können sie löschen, und 60 Tage nach der Bescherung wird sie automatisch gelöscht.", {
        href: "/",
        label: "Neue Gruppe anlegen",
      });
    }
    enterGroup({ token, me }, "replace");
  } catch {
    showOffline();
  }
}

function route(): void {
  const path = location.pathname;
  const segment = (prefix: string) => new RegExp(`^/${prefix}/([^/]+)/?$`).exec(path)?.[1];
  const group = segment("g");
  const invite = segment("join");
  const personal = segment("p");

  if (path === "/") {
    renderCreateGroup(main, (created) => enterGroup(created, "push"));
  } else if (group) {
    void showGroup(decodeURIComponent(group));
  } else if (invite) {
    void showJoin(decodeURIComponent(invite));
  } else if (personal) {
    void showPersonal(decodeURIComponent(personal));
  } else {
    showMessage(main, "Diese Seite gibt es nicht", undefined, { href: "/", label: "Zur Startseite" });
  }
}

addEventListener("popstate", route);
route();
