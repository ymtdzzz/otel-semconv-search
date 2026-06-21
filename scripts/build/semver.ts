/** Minimal semver helpers for ordering resolved-snapshot versions (e.g. "1.41.1"). */

export function parseSemver(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Ascending comparator; non-semver strings fall back to lexical order. */
export function cmpSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return a.localeCompare(b);
  return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
}
