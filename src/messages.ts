import type { GroupField, GroupInputError } from "../shared/group-input";
import { MAX_BUDGET_EUROS, MAX_GROUP_NAME_LENGTH, MAX_PARTICIPANT_NAME_LENGTH } from "../shared/group-input";

const euros = new Intl.NumberFormat("de-DE").format(MAX_BUDGET_EUROS);

/** What to tell the visitor, per field and error, in German. */
export const fieldErrorMessages: Record<GroupField, Partial<Record<GroupInputError, string>>> = {
  name: {
    required: "Gib der Gruppe einen Namen.",
    tooLong: `Der Name der Gruppe darf höchstens ${MAX_GROUP_NAME_LENGTH} Zeichen lang sein.`,
  },
  budget: {
    required: "Gib ein Budget in Euro an, zum Beispiel 20.",
    invalid: `Gib einen Betrag bis ${euros} € an, zum Beispiel 20 oder 12,50.`,
  },
  exchangeDate: {
    required: "Wähl das Datum der Bescherung.",
    invalid: "Wähl ein gültiges Datum.",
    past: "Dieses Datum ist schon vorbei. Wähl heute oder einen späteren Tag.",
  },
  organizerName: {
    required: "Gib deinen Namen ein.",
    tooLong: `Dein Name darf höchstens ${MAX_PARTICIPANT_NAME_LENGTH} Zeichen lang sein.`,
  },
};

export function fieldErrorMessage(field: GroupField, error: GroupInputError): string {
  return fieldErrorMessages[field][error] ?? "Prüf deine Eingabe.";
}

/** 2000 → "20 €", 1250 → "12,50 €" */
export function formatBudget(cents: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** "2026-12-20" → "Sonntag, 20. Dezember 2026" */
export function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}
