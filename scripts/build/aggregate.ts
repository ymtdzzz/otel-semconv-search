/**
 * Aggregate per-version snapshots into the enriched, version-aware entity list.
 */
import type {
  Entity,
  EntityKind,
  RenameEdge,
  StabilityChange,
  VersionRange,
} from "../../src/lib/types.ts";
import { extractEntities, type ResolvedGroup } from "./extract.ts";

/** Compress a sorted list of version indices into contiguous, inclusive spans. */
function toRanges(indices: number[], versions: string[]): VersionRange[] {
  const out: VersionRange[] = [];
  let start = indices[0];
  let prev = indices[0];
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === prev + 1) {
      prev = indices[i];
      continue;
    }
    out.push({ from: versions[start], to: versions[prev] });
    start = prev = indices[i];
  }
  out.push({ from: versions[start], to: versions[prev] });
  return out;
}

/** Build the enriched entity list from per-version snapshots (ascending). */
export function buildEntities(snapshots: { version: string; groups: ResolvedGroup[] }[]): Entity[] {
  const versions = snapshots.map((s) => s.version);
  const acc = new Map<string, Entity>();
  // Version indices each entity appeared at (ascending) -> presence spans at the end.
  const seenAt = new Map<string, number[]>();
  // Version indices each entity was deprecated at -> deprecated spans at the end.
  const deprecatedAt = new Map<string, number[]>();
  // First version at which `from` declared a `renamed_to` of `to`. Keyed (and
  // attached) by entity kind so a rename never leaks across same-named entities
  // of a different kind.
  const renameSeen = new Map<string, { kind: EntityKind; edge: RenameEdge }>();

  snapshots.forEach(({ version, groups }, vIdx) => {
    for (const [k, raw] of extractEntities(groups, version)) {
      let e = acc.get(k);
      if (!e) {
        e = {
          kind: raw.kind,
          name: raw.name,
          namespace: raw.name.split(".")[0],
          deprecated: false,
          deprecatedSpans: [],
          presence: [],
          stabilityHistory: [],
          renames: [],
        };
        acc.set(k, e);
      }

      // current definition = latest version's value
      e.type = raw.type;
      e.brief = raw.brief;
      e.note = raw.note;
      e.examples = raw.examples;
      e.stability = raw.stability;
      e.instrument = raw.instrument;
      e.unit = raw.unit;
      e.entityAssociations = raw.entityAssociations;
      e.spanKind = raw.spanKind;

      e.deprecated = raw.deprecation !== undefined;
      e.deprecation = raw.deprecation;

      const last = e.stabilityHistory.at(-1);
      if (!last || last.stability !== raw.stability) {
        e.stabilityHistory.push({
          version,
          stability: raw.stability,
        } satisfies StabilityChange);
      }

      const idxs = seenAt.get(k) ?? [];
      idxs.push(vIdx);
      seenAt.set(k, idxs);

      if (raw.deprecation !== undefined) {
        const dep = deprecatedAt.get(k) ?? [];
        dep.push(vIdx);
        deprecatedAt.set(k, dep);
      }

      if (raw.deprecation?.renamedTo) {
        const edgeKey = `${raw.kind} ${raw.name} -> ${raw.deprecation.renamedTo}`;
        if (!renameSeen.has(edgeKey)) {
          renameSeen.set(edgeKey, {
            kind: raw.kind,
            edge: { from: raw.name, to: raw.deprecation.renamedTo, version },
          });
        }
      }
    }
  });

  // presence spans (a gap between spans means the entity was removed then re-added)
  for (const [k, idxs] of seenAt) {
    const e = acc.get(k);
    if (e) e.presence = toRanges(idxs, versions);
  }

  // deprecated spans (a gap means it was un-deprecated then deprecated again)
  for (const [k, idxs] of deprecatedAt) {
    const e = acc.get(k);
    if (e) e.deprecatedSpans = toRanges(idxs, versions);
  }

  // attach each rename edge to both endpoints of the same kind (so either page
  // can show the link), via the kind-scoped acc key.
  for (const { kind, edge } of renameSeen.values()) {
    for (const name of [edge.from, edge.to]) {
      acc.get(`${kind} ${name}`)?.renames.push(edge);
    }
  }

  return [...acc.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind),
  );
}
