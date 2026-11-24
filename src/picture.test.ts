import { describe, expect, it } from "vitest";
import { fitWithin, initials } from "./picture";

describe("scaling a picture down before upload", () => {
  it("shrinks the longer side to the limit and keeps the proportions", () => {
    expect(fitWithin(4000, 3000, 1000)).toEqual({ width: 1000, height: 750 });
    expect(fitWithin(3000, 4000, 1000)).toEqual({ width: 750, height: 1000 });
  });

  it("never enlarges a small picture", () => {
    expect(fitWithin(300, 200, 1000)).toEqual({ width: 300, height: 200 });
  });

  it("never collapses a very thin picture to nothing", () => {
    expect(fitWithin(10000, 1, 1000)).toEqual({ width: 1000, height: 1 });
  });
});

describe("initials standing in for a missing Participant Picture", () => {
  it("takes the first letters of the first and last word", () => {
    expect(initials("Lea")).toBe("L");
    expect(initials("lea müller")).toBe("LM");
    expect(initials("  Anna Maria  Schmidt ")).toBe("AS");
    expect(initials("Ärmel")).toBe("Ä");
  });

  it("copes with emoji and an empty name", () => {
    expect(initials("🎅 Tom")).toBe("🎅T");
    expect(initials("")).toBe("");
  });
});
