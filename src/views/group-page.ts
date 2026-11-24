import type { Me } from "../../shared/api";
import { escapeHtml, showView } from "../html";
import { inviteLink, personalLink } from "../links";
import { formatBudget, formatDate } from "../messages";

const phaseLabel = { open: "Anmeldung offen", drawn: "Ausgelost" } as const;

function linkRow(id: string, buttonLabel: string, copiedMessage: string, url: string): string {
  return `
    <div class="link-row">
      <input class="field__input link-row__url" id="${id}" type="text" readonly value="${escapeHtml(url)}"
        aria-labelledby="${id}-heading" />
      <button class="btn btn--secondary link-row__copy" type="button" data-copy="${id}"
        data-copied="${copiedMessage}" aria-label="${buttonLabel}">Kopieren</button>
    </div>`;
}

function markup(me: Me, token: string): string {
  const { group, participant } = me;
  const role = participant.isOrganizer ? "Organisator" : "Teilnehmer";
  return `
    <section class="view">
      <header class="view__head">
        <p class="view__eyebrow">${phaseLabel[group.phase]}</p>
        <h1 class="view__title" tabindex="-1">${escapeHtml(group.name)}</h1>
        <dl class="facts">
          <div class="facts__item"><dt>Budget</dt><dd>${formatBudget(group.budgetCents)}</dd></div>
          <div class="facts__item"><dt>Bescherung</dt><dd>${formatDate(group.exchangeDate)}</dd></div>
          <div class="facts__item"><dt>Du</dt><dd>${escapeHtml(participant.name)} · ${role}</dd></div>
        </dl>
      </header>

      <section class="panel stack" aria-labelledby="invite-link-heading">
        <h2 class="panel__title" id="invite-link-heading">Einladungslink</h2>
        <p class="panel__text">Schick diesen Link an alle, die mitwichteln sollen.</p>
        ${linkRow("invite-link", "Einladungslink kopieren", "Einladungslink kopiert.", inviteLink(group.inviteCode))}
      </section>

      <section class="panel stack" aria-labelledby="personal-link-heading">
        <h2 class="panel__title" id="personal-link-heading">Persönlicher Link</h2>
        <p class="panel__text">Mit diesem Link kommst du auf jedem Gerät zurück in die Gruppe.</p>
        ${linkRow("personal-link", "Persönlichen Link kopieren", "Persönlicher Link kopiert.", personalLink(token))}
        <p class="note">Behalte diesen Link für dich. Wer ihn hat, macht in deinem Namen mit und sieht später, wen du beschenkst.</p>
      </section>

      <p class="visually-hidden" role="status" data-copy-status></p>
    </section>`;
}

async function copyText(input: HTMLInputElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(input.value);
    return true;
  } catch {
    input.select();
    return document.execCommand("copy");
  }
}

export function renderGroupPage(main: HTMLElement, me: Me, token: string): void {
  showView(main, markup(me, token));
  const status = main.querySelector<HTMLElement>("[data-copy-status]")!;

  for (const button of main.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
    let reset: ReturnType<typeof setTimeout> | undefined;
    button.addEventListener("click", async () => {
      const input = main.querySelector<HTMLInputElement>(`#${button.dataset.copy}`)!;
      const copied = await copyText(input);
      clearTimeout(reset);
      button.textContent = copied ? "Kopiert" : "Kopieren";
      status.textContent = copied
        ? button.dataset.copied!
        : "Kopieren hat nicht geklappt. Markier den Link und kopier ihn selbst.";
      reset = setTimeout(() => (button.textContent = "Kopieren"), 2000);
    });
  }
}

/** Shown when this browser has no (valid) token for the group in the address bar. */
export function renderNotRecognised(main: HTMLElement): void {
  showView(
    main,
    `<section class="view">
      <header class="view__head">
        <h1 class="view__title" tabindex="-1">Du bist in dieser Gruppe nicht angemeldet</h1>
        <p class="view__lead">Öffne deinen persönlichen Link, dann erkennt dich dieses Gerät wieder.</p>
      </header>
      <a class="btn btn--secondary" href="/">Neue Gruppe anlegen</a>
    </section>`,
  );
}
