import type { Dataset, Entity } from "./types.ts";

export interface RenameEntry {
  from: string;
  to: string;
  version: string;
  kind: string;
}

export interface StabilityEntry {
  kind: string;
  name: string;
  version: string;
  prev: string;
  next: string;
}

export interface DiffResult {
  added: Entity[];
  removed: Entity[];
  renamed: RenameEntry[];
  stabilityChanges: StabilityEntry[];
  deprecated: Entity[];
}

/**
 * Computes the set of changes between two versions (exclusive `from`, inclusive `to`).
 * Returns null when `from` >= `to` or either version is unknown.
 */
export function computeDiff(data: Dataset, from: string, to: string): DiffResult | null {
  const V = data.versions;
  const fi = V.indexOf(from);
  const ti = V.indexOf(to);
  if (fi < 0 || ti < 0 || fi >= ti) return null;

  const floor = data.floor;
  const latest = V[V.length - 1] ?? "";

  function inRange(v: string): boolean {
    const i = V.indexOf(v);
    return i > fi && i <= ti;
  }

  const added = data.entities.filter((e) => {
    const addedIn = e.presence[0]?.from;
    return addedIn && addedIn !== floor && inRange(addedIn);
  });

  const removed = data.entities.filter((e) => {
    const lastSeen = e.presence.at(-1)?.to;
    if (!lastSeen || lastSeen === latest) return false;
    const li = V.indexOf(lastSeen);
    return li >= fi && li < ti;
  });

  const seenRename = new Set<string>();
  const renamed: RenameEntry[] = [];
  for (const e of data.entities) {
    for (const r of e.renames) {
      const key = `${r.from}>${r.to}@${r.version}`;
      if (seenRename.has(key) || !inRange(r.version)) continue;
      seenRename.add(key);
      renamed.push({ ...r, kind: e.kind });
    }
  }

  const stabilityChanges: StabilityEntry[] = [];
  for (const e of data.entities) {
    for (let i = 1; i < e.stabilityHistory.length; i++) {
      const c = e.stabilityHistory[i];
      if (!inRange(c.version)) continue;
      stabilityChanges.push({
        kind: e.kind,
        name: e.name,
        version: c.version,
        prev: e.stabilityHistory[i - 1]?.stability ?? "",
        next: c.stability,
      });
    }
  }

  const deprecated = data.entities.filter((e) => e.deprecatedSpans.some((s) => inRange(s.from)));

  return { added, removed, renamed, stabilityChanges, deprecated };
}
