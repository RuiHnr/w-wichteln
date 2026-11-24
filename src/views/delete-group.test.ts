import { describe, expect, it } from "vitest";
import { confirmsGroupName } from "./delete-group";

describe("confirming a Group Deletion by typing the group's name", () => {
  it("accepts exactly the group's name, ignoring spaces around it", () => {
    expect(confirmsGroupName("WG Weihnachten", "WG Weihnachten")).toBe(true);
    expect(confirmsGroupName("  WG Weihnachten ", "WG Weihnachten")).toBe(true);
  });

  it("refuses anything else: empty, part of it, another case", () => {
    expect(confirmsGroupName("", "WG Weihnachten")).toBe(false);
    expect(confirmsGroupName("WG", "WG Weihnachten")).toBe(false);
    expect(confirmsGroupName("wg weihnachten", "WG Weihnachten")).toBe(false);
    expect(confirmsGroupName("WG  Weihnachten", "WG Weihnachten")).toBe(false);
  });
});
