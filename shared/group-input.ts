/**
 * Rules for the input that creates a Group. Shared by the form (instant
 * feedback) and the API (the authority), so both always agree.
 */

export interface GroupInput {
  name: string;
  budgetCents: number;
  /** Gift-exchange date as YYYY-MM-DD. */
  exchangeDate: string;
  organizerName: string;
}

export type GroupField = keyof RawGroupInput;

export type GroupInputError = "required" | "tooLong" | "invalid" | "past";

export type GroupInputErrors = Partial<Record<GroupField, GroupInputError>>;

/** What the form sends: everything as typed by the visitor. */
export interface RawGroupInput {
  name: string;
  budget: string;
  exchangeDate: string;
  organizerName: string;
}

export const MAX_GROUP_NAME_LENGTH = 60;
export const MAX_PARTICIPANT_NAME_LENGTH = 40;
export const MAX_BUDGET_EUROS = 10_000;

/** "20", "12,50", "12.5" or "19,99 €" → cents; at most two decimals. */
function parseBudgetCents(raw: string): number | GroupInputError {
  const amount = raw.replace("€", "").trim();
  if (!amount) return "required";
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(amount);
  if (!match) return "invalid";
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (cents <= 0 || cents > MAX_BUDGET_EUROS * 100) return "invalid";
  return cents;
}

export type ParticipantNameError = "required" | "tooLong";

export type ParticipantNameResult = { ok: true; value: string } | { ok: false; error: ParticipantNameError };

/** The name someone joins a group under: trimmed, not empty, at most 40 characters. */
export function validateParticipantName(raw: unknown): ParticipantNameResult {
  const name = typeof raw === "string" ? raw.trim() : "";
  const error = checkName(name, MAX_PARTICIPANT_NAME_LENGTH);
  return error ? { ok: false, error } : { ok: true, value: name };
}

export type GroupInputResult = { ok: true; value: GroupInput } | { ok: false; errors: GroupInputErrors };

/** Trimmed text of a field; anything that is not a string counts as empty. */
function fieldText(source: unknown, field: GroupField): string {
  const value = typeof source === "object" && source !== null ? (source as Record<string, unknown>)[field] : undefined;
  return typeof value === "string" ? value.trim() : "";
}

function checkName(name: string, maxLength: number): "required" | "tooLong" | undefined {
  if (!name) return "required";
  if ([...name].length > maxLength) return "tooLong";
  return undefined;
}

/** A real calendar date as YYYY-MM-DD, not before `today`. */
function checkExchangeDate(raw: string, today: string): GroupInputError | undefined {
  if (!raw) return "required";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "invalid";
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) return "invalid";
  if (raw < today) return "past";
  return undefined;
}

/**
 * @param today the current date as YYYY-MM-DD; the exchange date may not lie before it.
 */
export function validateGroupInput(raw: unknown, today: string): GroupInputResult {
  const errors: GroupInputErrors = {};

  const name = fieldText(raw, "name");
  const nameError = checkName(name, MAX_GROUP_NAME_LENGTH);
  if (nameError) errors.name = nameError;

  const budget = parseBudgetCents(fieldText(raw, "budget"));
  if (typeof budget === "string") errors.budget = budget;

  const exchangeDate = fieldText(raw, "exchangeDate");
  const dateError = checkExchangeDate(exchangeDate, today);
  if (dateError) errors.exchangeDate = dateError;

  const organizerName = fieldText(raw, "organizerName");
  const organizerNameError = checkName(organizerName, MAX_PARTICIPANT_NAME_LENGTH);
  if (organizerNameError) errors.organizerName = organizerNameError;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      budgetCents: budget as number,
      exchangeDate,
      organizerName,
    },
  };
}
