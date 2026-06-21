import type { Dataset, Entity, EntityKind, Stability } from "./types.ts";

/** A single entity as indexed by the client search island. */
export interface SearchDoc {
  /** `${kind} ${name}` — stable unique id. */
  id: string;
  name: string;
  kind: EntityKind;
  namespace: string;
  stability?: Stability;
  deprecated: boolean;
  addedVersion: string;
  removed: boolean;
  lastSeen: string;
  brief: string;
}

const BRIEF_MAX = 160;

function shortenBrief(brief: string | undefined): string {
  if (!brief) return "";
  const flat = brief.replace(/\s+/g, " ").trim();
  return flat.length > BRIEF_MAX ? `${flat.slice(0, BRIEF_MAX - 1)}…` : flat;
}

/** Project one entity into a search doc. `latest` is the newest dataset version. */
export function toSearchDoc(e: Entity, latest: string): SearchDoc {
  return {
    id: `${e.kind} ${e.name}`,
    name: e.name,
    kind: e.kind,
    namespace: e.namespace,
    stability: e.stability,
    deprecated: e.deprecated,
    addedVersion: e.presence[0]?.from ?? "",
    removed: e.presence.at(-1)?.to !== latest,
    lastSeen: e.presence.at(-1)?.to ?? "",
    brief: shortenBrief(e.brief),
  };
}

/** Build all search docs from the dataset (latest version drives the removed flag). */
export function buildSearchDocs(dataset: Dataset): SearchDoc[] {
  const latest = dataset.versions.at(-1) ?? "";
  return dataset.entities.map((e) => toSearchDoc(e, latest));
}
