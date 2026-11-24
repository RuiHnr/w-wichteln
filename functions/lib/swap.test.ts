import { describe, expect, it } from "vitest";
import { checkSwap } from "./swap";

const side = (id: string, recipientId: string, completedSwaps = 0) => ({ id, recipientId, completedSwaps });

describe("checkSwap", () => {
  it("allows a swap that keeps everyone off themselves and breaks no exclusion", () => {
    // Lea→Max, Ina→Tom: after the swap Lea→Tom, Ina→Max.
    expect(checkSwap(side("lea", "max"), side("ina", "tom"), [], 1)).toEqual({ ok: true });
  });

  it("blocks a swap after which the caller would draw themselves", () => {
    // Ina gives to Lea, so Lea would get herself.
    expect(checkSwap(side("lea", "max"), side("ina", "lea"), [], 1)).toEqual({ ok: false, reason: "blocked" });
  });

  it("blocks a swap after which the partner would draw themselves", () => {
    expect(checkSwap(side("lea", "ina"), side("ina", "tom"), [], 1)).toEqual({ ok: false, reason: "blocked" });
  });

  it("blocks a swap that breaks an exclusion, in either order and for either side", () => {
    const lea = side("lea", "max");
    const ina = side("ina", "tom");
    expect(checkSwap(lea, ina, [["tom", "lea"]], 1)).toEqual({ ok: false, reason: "blocked" });
    expect(checkSwap(lea, ina, [["ina", "max"]], 1)).toEqual({ ok: false, reason: "blocked" });
    // An exclusion between the two givers themselves does not matter: they give to others.
    expect(checkSwap(lea, ina, [["lea", "ina"]], 1)).toEqual({ ok: true });
  });

  it("refuses a caller who has reached the swap limit", () => {
    expect(checkSwap(side("lea", "max", 1), side("ina", "tom"), [], 1)).toEqual({ ok: false, reason: "limit_reached" });
  });

  it("refuses when the partner has reached the swap limit", () => {
    expect(checkSwap(side("lea", "max"), side("ina", "tom", 1), [], 1)).toEqual({ ok: false, reason: "partner_limit_reached" });
  });

  it("counts against the limit, so a higher limit allows more swaps and zero allows none", () => {
    expect(checkSwap(side("lea", "max", 1), side("ina", "tom", 1), [], 2)).toEqual({ ok: true });
    expect(checkSwap(side("lea", "max"), side("ina", "tom"), [], 0)).toEqual({ ok: false, reason: "limit_reached" });
  });
});
