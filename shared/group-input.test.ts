import { describe, expect, it } from "vitest";
import { validateGroupInput, validateParticipantName } from "./group-input";

const today = "2026-11-24";
const valid = { name: "WG Weihnachten", budget: "20", exchangeDate: "2026-12-20", organizerName: "Lea" };

describe("validateGroupInput", () => {
  it("accepts a complete group and returns the cleaned values", () => {
    expect(validateGroupInput(valid, today)).toEqual({
      ok: true,
      value: { name: "WG Weihnachten", budgetCents: 2000, exchangeDate: "2026-12-20", organizerName: "Lea" },
    });
  });

  it("trims names and rejects empty ones under their own field", () => {
    expect(validateGroupInput({ ...valid, name: "  ", organizerName: "" }, today)).toEqual({
      ok: false,
      errors: { name: "required", organizerName: "required" },
    });
    expect(validateGroupInput({ ...valid, name: "  WG  ", organizerName: " Lea " }, today)).toMatchObject({
      ok: true,
      value: { name: "WG", organizerName: "Lea" },
    });
  });

  it("requires a budget", () => {
    expect(validateGroupInput({ ...valid, budget: " " }, today)).toEqual({ ok: false, errors: { budget: "required" } });
  });

  it("reads budgets in euros with a German or English decimal separator", () => {
    expect(validateGroupInput({ ...valid, budget: "12,50" }, today)).toMatchObject({ value: { budgetCents: 1250 } });
    expect(validateGroupInput({ ...valid, budget: "12.5" }, today)).toMatchObject({ value: { budgetCents: 1250 } });
    expect(validateGroupInput({ ...valid, budget: "19,99 €" }, today)).toMatchObject({ value: { budgetCents: 1999 } });
  });

  it.each(["0", "-5", "abc", "1,234", "10001", "Infinity"])("rejects the budget %j as invalid", (budget) => {
    expect(validateGroupInput({ ...valid, budget }, today)).toEqual({ ok: false, errors: { budget: "invalid" } });
  });

  it("requires a gift-exchange date", () => {
    expect(validateGroupInput({ ...valid, exchangeDate: "" }, today)).toEqual({ ok: false, errors: { exchangeDate: "required" } });
  });

  it("accepts today but rejects a date in the past", () => {
    expect(validateGroupInput({ ...valid, exchangeDate: "2026-11-24" }, today).ok).toBe(true);
    expect(validateGroupInput({ ...valid, exchangeDate: "2026-11-23" }, today)).toEqual({ ok: false, errors: { exchangeDate: "past" } });
  });

  it.each(["24.12.2026", "2026-02-30", "2026-13-01", "soon"])("rejects the date %j as invalid", (exchangeDate) => {
    expect(validateGroupInput({ ...valid, exchangeDate }, today)).toEqual({ ok: false, errors: { exchangeDate: "invalid" } });
  });

  it("rejects a group name over 60 and a participant name over 40 characters", () => {
    expect(validateGroupInput({ ...valid, name: "x".repeat(60), organizerName: "y".repeat(40) }, today).ok).toBe(true);
    expect(validateGroupInput({ ...valid, name: "x".repeat(61), organizerName: "y".repeat(41) }, today)).toEqual({
      ok: false,
      errors: { name: "tooLong", organizerName: "tooLong" },
    });
  });

  it("treats missing or non-text fields as empty instead of throwing", () => {
    const everyFieldRequired = {
      ok: false,
      errors: { name: "required", budget: "required", exchangeDate: "required", organizerName: "required" },
    };
    expect(validateGroupInput(null, today)).toEqual(everyFieldRequired);
    expect(validateGroupInput({ name: 5, budget: [], exchangeDate: {}, organizerName: true }, today)).toEqual(everyFieldRequired);
  });
});

describe("validateParticipantName", () => {
  it("trims the name and accepts up to 40 characters", () => {
    expect(validateParticipantName("  Max ")).toEqual({ ok: true, value: "Max" });
    expect(validateParticipantName("y".repeat(40)).ok).toBe(true);
  });

  it("rejects an empty, missing or too long name", () => {
    expect(validateParticipantName(" ")).toEqual({ ok: false, error: "required" });
    expect(validateParticipantName(undefined)).toEqual({ ok: false, error: "required" });
    expect(validateParticipantName("y".repeat(41))).toEqual({ ok: false, error: "tooLong" });
  });
});
