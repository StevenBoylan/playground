/** The smallest group of people that may be reported on. Enforced in the services, not in the UI. */
export const MIN_COHORT = 5;

export const SMALL_GROUP_NOTICE = "Groups with fewer than five people are combined into “Other” so nobody can be singled out";

export interface MergeResult<T> {
  rows: T[];
  /** How many groups were folded into the combined row. Zero means nothing was hidden. */
  merged: number;
}

export const OTHER_KEY = "other";
export const OTHER_LABEL = "Other (small groups)";

/**
 * Disclosure control for breakdowns. A group below the threshold is never shown on its own. It is combined with
 * the next-smallest group(s) until the combined row is large enough, and shown as "Other".
 *
 * Merging, rather than hiding one row, matters: if only one small group were left out while the total was
 * published, anyone could subtract the visible groups from the total and recover the hidden one. After merging,
 * no single published figure describes fewer than the threshold of people, and the total is unchanged.
 *
 * If everything together is still below the threshold, nothing can be reported and no rows are returned.
 */
export function mergeSmallGroups<T extends { key: string; label: string }>(
  rows: T[],
  size: (row: T) => number,
  combine: (a: T, b: T) => T,
  min: number = MIN_COHORT,
): MergeResult<T> {
  if (rows.every((r) => size(r) >= min)) return { rows, merged: 0 };

  const byGrowingSize = [...rows].sort((a, b) => size(a) - size(b));
  const total = byGrowingSize.reduce((a, r) => a + size(r), 0);
  if (total < min) return { rows: [], merged: rows.length };

  // Every small group goes into the combined row; if that is still too small, the next-smallest groups join it.
  // Groups are in ascending order, so the small ones come first.
  let combined = byGrowingSize[0];
  let used = 1;
  while (used < byGrowingSize.length && (size(byGrowingSize[used]) < min || size(combined) < min)) {
    combined = combine(combined, byGrowingSize[used]);
    used += 1;
  }

  const other = { ...combined, key: OTHER_KEY, label: OTHER_LABEL };
  const keep = byGrowingSize.slice(used);
  // Keep the caller's original ordering for the groups that remain.
  const order = new Map(rows.map((r, i) => [r.key, i]));
  keep.sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
  return { rows: [...keep, other], merged: used };
}
