/** Reads a JSON object kept under `key`; anything missing or damaged reads as empty. */
export function readStoredRecord(storage: Pick<Storage, "getItem">, key: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? "{}");
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}
