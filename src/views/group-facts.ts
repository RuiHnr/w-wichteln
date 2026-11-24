import type { GroupView } from "../../shared/api";
import { formatBudget, formatDate } from "../messages";

/** The phase as the UI names it (GLOSSARY.md). */
export const phaseLabel = { open: "Anmeldung offen", drawn: "Ausgelost" } as const;

/** Budget and exchange date, plus any extra rows (already escaped). */
export function groupFacts(group: Pick<GroupView, "budgetCents" | "exchangeDate">, extraRows = ""): string {
  return `
    <dl class="facts">
      <div class="facts__item"><dt>Budget</dt><dd>${formatBudget(group.budgetCents)}</dd></div>
      <div class="facts__item"><dt>Datum der Bescherung</dt><dd>${formatDate(group.exchangeDate)}</dd></div>
      ${extraRows}
    </dl>`;
}
