import { describe, expect, it } from "vitest";
import { validateGroupSettings } from "../shared/group-input";
import { MAX_WISHLIST_LENGTH, validateWishlist } from "../shared/wishlist";
import { budgetInputValue, linkRenewalNote, wishlistLengthHint } from "./messages";

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
  it("counts down from the maximum like the field's maxlength, spaces included", () => {
    expect(wishlistLengthHint("")).toBe("Noch 1000 Zeichen frei.");
    expect(wishlistLengthHint("  Tee  ")).toBe("Noch 993 Zeichen frei.");
    expect(wishlistLengthHint("a".repeat(999))).toBe("Noch 1 Zeichen frei.");
  });

  it("reaches zero exactly where the server starts refusing", () => {
    const longest = "🎁".repeat(MAX_WISHLIST_LENGTH / 2);
    expect(wishlistLengthHint(longest)).toBe("Noch 0 Zeichen frei.");
    expect(validateWishlist(longest).ok).toBe(true);
    expect(validateWishlist(`${longest}a`)).toEqual({ ok: false, error: "tooLong" });
    expect(validateWishlist(`  ${longest}\n`).ok).toBe(true);
  });
});

describe("linkRenewalNote", () => {
  it("says who renewed the link and on which day, in the viewer's time zone", () => {
    expect(linkRenewalNote({ by: "Lena", byId: "lena", at: "2026-11-24T09:30:00.000Z" }, "max", "Europe/Berlin")).toBe("Neuer Link von Lena am 24.11.");
    expect(linkRenewalNote({ by: "Lena", byId: "lena", at: "2026-11-24T23:30:00.000Z" }, "max", "Europe/Berlin")).toBe("Neuer Link von Lena am 25.11.");
  });

  it("says \"dir\" to the organizer who renewed it", () => {
    expect(linkRenewalNote({ by: "Lena", byId: "lena", at: "2026-03-05T12:00:00.000Z" }, "lena", "UTC")).toBe("Neuer Link von dir am 05.03.");
  });

  it("does not say \"dir\" to someone who only took the renewer's name after they left", () => {
    expect(linkRenewalNote({ by: "Lena", byId: "old-lena", at: "2026-03-05T12:00:00.000Z" }, "new-lena", "UTC")).toBe("Neuer Link von Lena am 05.03.");
  });
});
