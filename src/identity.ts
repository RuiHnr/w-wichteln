/**
 * Remembers who this browser is in each group: the participant's random token,
 * kept in localStorage (ADR 0002). One token per group, keyed by group id.
 */

const KEY = "w-wichteln:tokens";

export interface IdentityStore {
  tokenFor(groupId: string): string | null;
  remember(groupId: string, token: string): void;
  forget(groupId: string): void;
}

type Tokens = Record<string, string>;

export function createIdentityStore(storage: Pick<Storage, "getItem" | "setItem">): IdentityStore {
  const read = (): Tokens => {
    try {
      const parsed: unknown = JSON.parse(storage.getItem(KEY) ?? "{}");
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Tokens) : {};
    } catch {
      return {};
    }
  };
  const write = (tokens: Tokens) => storage.setItem(KEY, JSON.stringify(tokens));

  return {
    tokenFor: (groupId) => {
      const token = read()[groupId];
      return typeof token === "string" ? token : null;
    },
    remember: (groupId, token) => write({ ...read(), [groupId]: token }),
    forget: (groupId) => {
      const { [groupId]: _forgotten, ...rest } = read();
      write(rest);
    },
  };
}
