import { describe, expect, it } from "vitest";
import { expiryCutoff, isExpired } from "./expiry";

const at = (iso: string) => Date.parse(iso);

describe("expiry rule: a group is deleted once exchange date + 60 days is in the past", () => {
  it("keeps a group on the 60th day after its exchange date", () => {
    expect(isExpired("2026-01-01", at("2026-03-02T12:00:00Z"))).toBe(false); // day 60
  });

  it("deletes a group from the 61st day on", () => {
    expect(isExpired("2026-01-01", at("2026-03-03T00:00:00Z"))).toBe(true); // day 61
  });

  it("keeps groups with a date in the future or today", () => {
    expect(isExpired("2026-11-24", at("2026-11-24T10:00:00Z"))).toBe(false);
    expect(isExpired("2099-12-20", at("2026-11-24T10:00:00Z"))).toBe(false);
  });

  it("counts days in UTC, whatever the server's time zone", () => {
    expect(isExpired("2026-01-01", at("2026-03-02T23:59:59Z"))).toBe(false);
    expect(isExpired("2026-01-01", at("2026-03-03T00:00:00Z"))).toBe(true);
    // 23:30 in New York on 2 March is already 3 March in UTC
    expect(isExpired("2026-01-01", at("2026-03-02T23:30:00-05:00"))).toBe(true);
  });

  it("handles leap days", () => {
    expect(isExpired("2028-01-01", at("2028-03-01T00:00:00Z"))).toBe(false); // day 60 in a leap year
    expect(isExpired("2028-01-01", at("2028-03-02T00:00:00Z"))).toBe(true);
  });

  it("gives the cutoff for SQL: dates strictly before it are expired", () => {
    expect(expiryCutoff(at("2026-03-03T00:00:00Z"))).toBe("2026-01-02");
    expect(isExpired("2026-01-01", at("2026-03-03T00:00:00Z"))).toBe(true);
    expect(isExpired("2026-01-02", at("2026-03-03T00:00:00Z"))).toBe(false);
  });
});
