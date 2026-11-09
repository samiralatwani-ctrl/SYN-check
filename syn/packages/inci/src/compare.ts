import { canonical } from './synonyms';

export interface Comparison {
  sameSet: boolean;
  sameOrder: boolean;
  added: string[];             // on the pack, not in the reference
  removed: string[];           // in the reference, not on the pack
  moved: string[];             // present in both but at a different position
  activeChanged: boolean;      // an active/declared substance was added or removed
  nonActiveDiffCount: number;  // added + removed, excluding actives
}

/**
 * Compares a read list with a reference list (same market edition). "May contain" shade ingredients are
 * compared as a set by the caller, never by position.
 */
export function compareLists(read: string[], reference: string[], actives: ReadonlySet<string> = new Set(),
  synonyms?: ReadonlyMap<string, string>): Comparison {
  const r = read.map((x) => canonical(x, synonyms));
  const ref = reference.map((x) => canonical(x, synonyms));
  const act = new Set([...actives].map((x) => canonical(x, synonyms)));
  const rs = new Set(r), refs = new Set(ref);
  const added = [...rs].filter((x) => !refs.has(x));
  const removed = [...refs].filter((x) => !rs.has(x));
  const common = r.filter((x) => refs.has(x));
  const refCommon = ref.filter((x) => rs.has(x));
  const moved = common.filter((x, i) => refCommon[i] !== x);
  const activeChanged = [...added, ...removed].some((x) => act.has(x));
  return {
    sameSet: added.length === 0 && removed.length === 0,
    sameOrder: moved.length === 0,
    added, removed, moved, activeChanged,
    nonActiveDiffCount: [...added, ...removed].filter((x) => !act.has(x)).length,
  };
}
