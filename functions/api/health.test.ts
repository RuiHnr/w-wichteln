import { describe, expect, it } from "vitest";
import { onRequestGet } from "./health";

describe("GET /api/health", () => {
  it("answers 200 with status ok as JSON", async () => {
    const response = await onRequestGet({} as Parameters<typeof onRequestGet>[0]);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
