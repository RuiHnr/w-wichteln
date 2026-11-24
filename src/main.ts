import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/figtree";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";
import { fetchMe } from "./api";
import { showView } from "./html";
import { createIdentityStore } from "./identity";
import { groupPath } from "./links";
import { startSnowfall } from "./snowfall";
import { renderCreateGroup } from "./views/create-group";
import { renderGroupPage, renderNotRecognised } from "./views/group-page";

const canvas = document.querySelector<HTMLCanvasElement>(".snowfall");
if (canvas) startSnowfall(canvas);

const main = document.querySelector<HTMLElement>("#main")!;
const identity = createIdentityStore(localStorage);

async function showGroup(groupId: string): Promise<void> {
  const token = identity.tokenFor(groupId);
  if (!token) return renderNotRecognised(main);

  main.innerHTML = `<p class="view__lead" role="status">Gruppe wird geladen …</p>`;
  try {
    const me = await fetchMe(token);
    if (!me || me.group.id !== groupId) {
      identity.forget(groupId);
      return renderNotRecognised(main);
    }
    renderGroupPage(main, me, token);
  } catch {
    showView(
      main,
      `<section class="view"><header class="view__head">
        <h1 class="view__title" tabindex="-1">Die Gruppe lässt sich gerade nicht laden</h1>
        <p class="view__lead">Prüf deine Verbindung und lad die Seite neu.</p>
      </header></section>`,
    );
  }
}

function route(): void {
  const path = location.pathname;
  const group = /^\/g\/([^/]+)\/?$/.exec(path);

  if (path === "/") {
    renderCreateGroup(main, ({ token, me }) => {
      identity.remember(me.group.id, token);
      history.pushState(null, "", groupPath(me.group.id));
      renderGroupPage(main, me, token);
    });
  } else if (group) {
    void showGroup(decodeURIComponent(group[1]));
  } else {
    showView(
      main,
      `<section class="view"><header class="view__head">
        <h1 class="view__title" tabindex="-1">Diese Seite gibt es nicht</h1>
      </header><a class="btn btn--secondary" href="/">Zur Startseite</a></section>`,
    );
  }
}

addEventListener("popstate", route);
route();
