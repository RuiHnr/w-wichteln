import type { ExclusionInputError, JoinNameError, LinkRenewalView, ManageError, PictureError, SwapError } from "../shared/api";
import { MIN_PARTICIPANTS_TO_DRAW } from "../shared/draw";
import type { GroupField, GroupInputError } from "../shared/group-input";
import { MAX_BUDGET_EUROS, MAX_GROUP_NAME_LENGTH, MAX_PARTICIPANT_NAME_LENGTH } from "../shared/group-input";
import type { WishlistError } from "../shared/wishlist";
import { MAX_WISHLIST_LENGTH } from "../shared/wishlist";

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

/** What to tell someone whose name cannot be used to join, in German. */
export function joinNameErrorMessage(error: JoinNameError): string {
  if (error === "taken") return "Diesen Namen gibt es in der Gruppe schon. Häng zum Beispiel deinen Nachnamen an.";
  return fieldErrorMessages.organizerName[error]!;
}

export function fieldErrorMessage(field: GroupField, error: GroupInputError): string {
  return fieldErrorMessages[field][error] ?? "Prüf deine Eingabe.";
}

/** What to tell an organizer whose action the server refused, in German. */
export const manageErrorMessages: Record<ManageError, string> = {
  unknown_token: "Dieses Gerät ist in der Gruppe nicht mehr angemeldet.",
  not_organizer: "Du bist kein Organisator mehr. Die Seite zeigt jetzt den aktuellen Stand.",
  unknown_participant: "Diese Person ist nicht mehr in der Gruppe.",
  unknown_exclusion: "Diesen Ausschluss gibt es nicht mehr.",
  drawn: "Die Gruppe ist schon ausgelost. Setz die Auslosung zurück, um das zu ändern.",
  not_drawn: "Die Gruppe ist schon zurückgesetzt. Die Anmeldung ist wieder offen.",
  last_organizer: "Die Gruppe braucht immer mindestens einen Organisator.",
  self: "Dich selbst kannst du nicht entfernen.",
  too_few: `Für die Auslosung braucht ihr mindestens ${MIN_PARTICIPANTS_TO_DRAW} Teilnehmer.`,
  impossible:
    "Mit diesen Ausschlüssen kann nicht jeder jemanden beschenken. Heb einen Ausschluss auf oder lade mehr Leute ein, dann klappt die Auslosung.",
  changed: "Die Gruppe hat sich gerade geändert. Versuch es noch mal.",
};

/** What to tell a giver whose Swap Request action the server refused, in German. */
export const swapErrorMessages: Record<SwapError, string> = {
  unknown_token: "Dieses Gerät ist in der Gruppe nicht mehr angemeldet.",
  not_drawn: "Die Auslosung wurde zurückgesetzt. Tauschen geht erst nach der nächsten Auslosung.",
  unknown_participant: "Diese Person ist nicht mehr in der Gruppe.",
  unknown_swap_request: "Diese Tauschanfrage gibt es nicht mehr. Die Seite zeigt jetzt den aktuellen Stand.",
  self: "Mit dir selbst kannst du nicht tauschen.",
  outgoing_open: "Du hast schon eine offene Tauschanfrage. Zieh sie zurück, um eine neue zu senden.",
  limit_reached: "Du hast dein Tausch-Limit erreicht.",
  partner_limit_reached: "Diese Person hat ihr Tausch-Limit schon erreicht.",
  blocked: "Dieser Tausch ist nicht möglich.",
  changed: "Die Gruppe hat sich gerade geändert. Versuch es noch mal.",
};

/** What to tell an organizer whose exclusion form has the wrong input, in German. */
export const exclusionErrorMessages: Record<ExclusionInputError, string> = {
  same: "Wähl zwei verschiedene Teilnehmer.",
  invalid: "Wähl zwei Teilnehmer aus der Liste.",
};

/** What to tell someone when the server cannot be reached or fails, in German. */
export const NETWORK_ERROR = "Das hat nicht geklappt. Prüf deine Verbindung und versuch es noch mal.";

/** What to tell someone whose wishlist cannot be saved, in German. */
export const wishlistErrorMessages: Record<WishlistError, string> = {
  tooLong: `Dein Wunschzettel darf höchstens ${MAX_WISHLIST_LENGTH} Zeichen lang sein. Kürz ihn ein wenig.`,
  invalid: "Dein Wunschzettel ließ sich nicht lesen. Lade die Seite neu und versuch es noch mal.",
};

/**
 * How many characters are left in the wishlist field, counted as its maxlength counts them.
 * The server trims first, so it never refuses what the field let through.
 */
export function wishlistLengthHint(text: string): string {
  const left = Math.max(0, MAX_WISHLIST_LENGTH - text.length);
  return left === 1 ? "Noch 1 Zeichen frei." : `Noch ${left} Zeichen frei.`;
}

/** What to tell someone whose picture upload or removal the server refused, or whose browser could not read the file, in German. */
export const pictureErrorMessages: Record<PictureError, string> = {
  unknown_token: "Dieses Gerät ist in der Gruppe nicht mehr angemeldet.",
  not_organizer: "Du bist kein Organisator mehr. Die Seite zeigt jetzt den aktuellen Stand.",
  not_self: "Ein Profilbild kann nur die Person selbst ändern.",
  too_large: "Das Bild ist zu groß. Wähl ein kleineres Bild, höchstens 1 MB.",
  wrong_format: "Dieses Bild lässt sich nicht verwenden. Wähl ein JPEG-, PNG- oder WebP-Bild.",
  unavailable: "Bilder sind gerade nicht verfügbar. Versuch es später noch mal.",
};

/** Shown when creating or joining worked but a chosen picture did not upload. */
export const PICTURE_LATER_NOTE = "Dein Bild konnte nicht hochgeladen werden. Du kannst es auf der Gruppenseite nachholen.";

/** 2000 → "20", 1250 → "12,50": the budget as the settings form shows it for editing. */
export function budgetInputValue(cents: number): string {
  const euros = Math.floor(cents / 100);
  return cents % 100 === 0 ? String(euros) : `${euros},${String(cents % 100).padStart(2, "0")}`;
}

/** 2000 → "20 €", 1250 → "12,50 €" */
export function formatBudget(cents: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/**
 * The trace of a Link Renewal in the participant list (ADR 0004): "Neuer Link von Lena am 24.11.",
 * or "von dir" for the organizer who renewed it. The day is the viewer's, in `timeZone`.
 */
export function linkRenewalNote(renewal: LinkRenewalView, viewerId: string, timeZone?: string): string {
  // Formats as "24.11.", trailing dot included.
  const day = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone }).format(new Date(renewal.at));
  return `Neuer Link von ${renewal.byId === viewerId ? "dir" : renewal.by} am ${day}`;
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
