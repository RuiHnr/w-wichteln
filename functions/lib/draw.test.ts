import { describe, expect, it } from "vitest";
import { drawAssignments } from "./draw";

describe("drawAssignments", () => {
  it("gives every participant exactly one recipient, never themselves", () => {
    const ids = ["a", "b", "c", "d", "e"];
    for (let run = 0; run < 50; run++) {
      const assignments = drawAssignments(ids, [])!;
      expect([...assignments.keys()].sort()).toEqual(ids);
      expect([...assignments.values()].sort()).toEqual(ids);
      for (const [giver, recipient] of assignments) expect(recipient).not.toBe(giver);
    }
  });

  it("never assigns between two participants with an exclusion, in either direction", () => {
    const ids = ["a", "b", "c", "d"];
    // Only a→c→b→d→a and its reverse avoid both a↔b and c↔d.
    const exclusions: [string, string][] = [["a", "b"], ["c", "d"]];
    for (let run = 0; run < 50; run++) {
      const assignments = drawAssignments(ids, exclusions)!;
      for (const [x, y] of exclusions) {
        expect(assignments.get(x)).not.toBe(y);
        expect(assignments.get(y)).not.toBe(x);
      }
    }
  });

  it("returns null when no valid draw exists", () => {
    // Fewer than two participants: nobody else to draw.
    expect(drawAssignments(["a"], [])).toBeNull();
    // a is excluded from everyone else.
    expect(drawAssignments(["a", "b", "c"], [["a", "b"], ["a", "c"]])).toBeNull();
    // b, c and d may only give to a, so not all of them can.
    const star: [string, string][] = [["b", "c"], ["b", "d"], ["c", "d"]];
    expect(drawAssignments(["a", "b", "c", "d"], star)).toBeNull();
  });

  it("finds the only valid draw in a large, tightly excluded group", () => {
    // 40 participants; each may only give to the next one or the one after (mod 40).
    const ids = Array.from({ length: 40 }, (_, i) => `p${String(i).padStart(2, "0")}`);
    const exclusions: [string, string][] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const gap = (j - i) % ids.length;
        if (![1, 2, ids.length - 1, ids.length - 2].includes(gap)) exclusions.push([ids[i], ids[j]]);
      }
    }
    const assignments = drawAssignments(ids, exclusions)!;
    expect(assignments).not.toBeNull();
    expect(new Set(assignments.values()).size).toBe(ids.length);
    for (const [giver, recipient] of assignments) {
      const gap = (ids.indexOf(recipient) - ids.indexOf(giver) + ids.length) % ids.length;
      expect([1, 2, ids.length - 1, ids.length - 2]).toContain(gap);
    }
  });

  it("spreads draws evenly over every valid outcome", () => {
    // Four participants without exclusions have 9 valid draws.
    const counts = new Map<string, number>();
    for (let run = 0; run < 9000; run++) {
      const key = [...drawAssignments(["a", "b", "c", "d"], [])!].map(([g, r]) => g + r).sort().join(" ");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(9);
    for (const count of counts.values()) expect(count).toBeGreaterThan(700);
    for (const count of counts.values()) expect(count).toBeLessThan(1300);
  });

  it("also spreads draws when exclusions leave few options", () => {
    // a↔b and c↔d excluded: only a→c→b→d→a and a→d→b→c→a remain.
    const counts = new Map<string, number>();
    for (let run = 0; run < 2000; run++) {
      const key = drawAssignments(["a", "b", "c", "d"], [["a", "b"], ["c", "d"]])!.get("a")!;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual(["c", "d"]);
    for (const count of counts.values()) expect(count).toBeGreaterThan(800);
  });

  it("still varies the draw when random tries almost never hit a valid one", () => {
    // 12 in a ring, each excluded from all but their two neighbours. Only 4 of the 12! draws
    // are valid: the ring in either direction, or neighbours paired off in one of two ways.
    const ids = Array.from({ length: 12 }, (_, i) => `p${String(i).padStart(2, "0")}`);
    const exclusions: [string, string][] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) if (j - i !== 1 && j - i !== ids.length - 1) exclusions.push([ids[i], ids[j]]);
    }
    const outcomes = new Set<string>();
    for (let run = 0; run < 200; run++) {
      const assignments = drawAssignments(ids, exclusions)!;
      outcomes.add(ids.map((id) => assignments.get(id)).join(" "));
    }
    expect(outcomes.size).toBe(4);
  });
});
