import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/figtree";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";
import type { CreateGroupResponse } from "../shared/api";
import { fetchInvite, fetchMe } from "./api";
import { showMessage } from "./html";
import { createIdentityStore } from "./identity";
import { groupPath } from "./links";
import { startSnowfall } from "./snowfall";
import { renderCreateGroup } from "./views/create-group";
import { renderGroupPage, renderNotRecognised } from "./views/group-page";
import { renderJoinClosed, renderJoinGroup } from "./views/join-group";

const canvas = document.querySelector<HTMLCanvasElement>(".snowfall");
if (canvas) startSnowfall(canvas);

const main = document.querySelector<HTMLElement>("#main")!;
const identity = createIdentityStore(localStorage);

async function showGroup(groupId: string): Promise<void> {
  const token = identity.tokenFor(groupId);
  if (!token) return renderNotRecognised(main);

  showLoading("Gruppe wird geladen …");
  try {
    const me = await fetchMe(token);
    if (!me || me.group.id !== groupId) {
      identity.forget(groupId);
      return renderNotRecognised(main);
    }
    renderGroupPage(main, me, token);
  } catch {
    showOffline();
  }
}

const showLoading = (text: string) => (main.innerHTML = `<p class="view__lead" role="status">${text}</p>`);
const showOffline = () =>
  showMessage(main, "Die Gruppe lässt sich gerade nicht laden", "Prüf deine Verbindung und lad die Seite neu.");

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
      return showMessage(main, "Diesen Einladungslink gibt es nicht", "Frag nach dem richtigen Link.", {
        href: "/",
        label: "Neue Gruppe anlegen",
      });
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
 * The Personal Link restores identity on this device (ADR 0002). The token leaves the
 * address bar at once, so it does not linger in the history or on screen.
 */
async function showPersonal(token: string): Promise<void> {
  history.replaceState(null, "", "/");
  showLoading("Du wirst erkannt …");
  try {
    const me = await fetchMe(token);
    if (!me) {
      return showMessage(main, "Dieser persönliche Link gilt nicht", "Prüf, ob du ihn vollständig kopiert hast.", {
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
