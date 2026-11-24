import { describe, expect, it } from "vitest";
import { confirmsGroupName } from "./delete-group";

describe("confirming a Group Deletion by typing the group's name", () => {
  it("accepts exactly the group's name, ignoring spaces around it and how an umlaut is encoded", () => {
    expect(confirmsGroupName("WG Weihnachten", "WG Weihnachten")).toBe(true);
    expect(confirmsGroupName("  WG Weihnachten ", "WG Weihnachten")).toBe(true);
    // The same ü, once composed and once as u plus a combining diaeresis.
    expect(confirmsGroupName("Familie Mu\u0308ller", "Familie M\u00fcller")).toBe(true);
  });

  it("refuses anything else: empty, part of it, another case", () => {
    expect(confirmsGroupName("", "WG Weihnachten")).toBe(false);
    expect(confirmsGroupName("WG", "WG Weihnachten")).toBe(false);
    expect(confirmsGroupName("wg weihnachten", "WG Weihnachten")).toBe(false);
    expect(confirmsGroupName("WG  Weihnachten", "WG Weihnachten")).toBe(false);
  });
});
