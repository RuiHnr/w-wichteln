import { describe, expect, it } from "vitest";
import { validateGroupSettings } from "../shared/group-input";
import { budgetInputValue } from "./messages";

describe("budgetInputValue", () => {
  it("writes whole euros without decimals and cents with a German comma", () => {
    expect(budgetInputValue(2000)).toBe("20");
    expect(budgetInputValue(1250)).toBe("12,50");
    expect(budgetInputValue(1999)).toBe("19,99");
  });

  it("gives back what the settings form accepts unchanged", () => {
    for (const cents of [100, 1205, 1000000]) {
      expect(validateGroupSettings({ budget: budgetInputValue(cents), exchangeDate: "2099-01-01" }, "2026-01-01")).toMatchObject({
        value: { budgetCents: cents },
      });
    }
  });
});
