/**
 * The Draw: one recipient for every participant, nobody drawing themselves and no
 * exclusion broken. Small cycles (A→B→A) are allowed. Pure, so it runs and is tested
 * without the database.
 */

/** A random number in [0, 1), like Math.random. */
export type Random = () => number;

/** Giver id → recipient id. */
export type Assignments = Map<string, string>;

/** How many fully random draws to try before building one step by step. */
const RANDOM_ATTEMPTS = 200;

function shuffled<T>(items: Iterable<T>, random: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Draws assignments for the participants, or returns null when no valid draw exists.
 *
 * It first tries plain random permutations, which picks uniformly among all valid draws.
 * When exclusions make those rare, it builds a draw giver by giver instead, in random
 * order, only keeping a choice if the rest can still be completed (a bipartite matching
 * check). That always finds a draw if one exists, in polynomial time.
 */
export function drawAssignments(
  participantIds: readonly string[],
  exclusions: readonly (readonly [string, string])[],
  random: Random = Math.random,
): Assignments | null {
  const excluded = new Set(exclusions.flatMap(([a, b]) => [`${a} ${b}`, `${b} ${a}`]));
  const allowed = (giver: string, recipient: string) => giver !== recipient && !excluded.has(`${giver} ${recipient}`);

  for (let attempt = 0; attempt < RANDOM_ATTEMPTS; attempt++) {
    const recipients = shuffled(participantIds, random);
    if (participantIds.every((giver, i) => allowed(giver, recipients[i]))) {
      return new Map(participantIds.map((giver, i) => [giver, recipients[i]]));
    }
  }

  const candidates = new Map(participantIds.map((giver) => [giver, participantIds.filter((r) => allowed(giver, r))]));
  const assignments: Assignments = new Map();
  const taken = new Set<string>();
  for (const giver of shuffled(participantIds, random)) {
    const choice = shuffled(candidates.get(giver)!, random).find((recipient) => {
      if (taken.has(recipient)) return false;
      assignments.set(giver, recipient);
      taken.add(recipient);
      if (canComplete(participantIds, candidates, assignments, taken)) return true;
      assignments.delete(giver);
      taken.delete(recipient);
      return false;
    });
    if (choice === undefined) return null;
  }
  return assignments;
}

/**
 * Whether every giver without a recipient yet can still get one of the recipients not
 * taken yet: a perfect bipartite matching, found with augmenting paths (Kuhn).
 */
function canComplete(
  participantIds: readonly string[],
  candidates: Map<string, string[]>,
  assignments: Assignments,
  taken: Set<string>,
): boolean {
  const givers = participantIds.filter((giver) => !assignments.has(giver));
  const giverOf = new Map<string, string>();

  const augment = (giver: string, seen: Set<string>): boolean => {
    for (const recipient of candidates.get(giver)!) {
      if (taken.has(recipient) || seen.has(recipient)) continue;
      seen.add(recipient);
      const current = giverOf.get(recipient);
      if (current === undefined || augment(current, seen)) {
        giverOf.set(recipient, giver);
        return true;
      }
    }
    return false;
  };

  return givers.every((giver) => augment(giver, new Set()));
}
