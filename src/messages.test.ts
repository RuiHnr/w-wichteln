import { describe, expect, it } from "vitest";
import { validateGroupSettings } from "../shared/group-input";
import { MAX_WISHLIST_LENGTH, validateWishlist } from "../shared/wishlist";
import { budgetInputValue, wishlistLengthHint } from "./messages";

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

describe("wishlistLengthHint", () => {
  it("counts down from the maximum, ignoring surrounding spaces as the server does", () => {
    expect(wishlistLengthHint("")).toBe("Noch 1000 Zeichen frei.");
    expect(wishlistLengthHint("  Tee  ")).toBe("Noch 997 Zeichen frei.");
    expect(wishlistLengthHint("a".repeat(999))).toBe("Noch 1 Zeichen frei.");
  });

  it("reaches zero exactly where the server starts refusing", () => {
    const longest = "🎁".repeat(MAX_WISHLIST_LENGTH / 2);
    expect(wishlistLengthHint(longest)).toBe("Noch 0 Zeichen frei.");
    expect(validateWishlist(longest).ok).toBe(true);
    expect(validateWishlist(`${longest}a`)).toEqual({ ok: false, error: "tooLong" });
  });
});
