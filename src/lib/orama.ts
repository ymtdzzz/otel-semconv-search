import { type AnyOrama, create, insertMultiple, search } from "@orama/orama";
import type { SearchDoc } from "./search.ts";

const SCHEMA = {
  name: "string",
  brief: "string",
  kind: "enum",
  namespace: "enum",
  stability: "enum",
  addedVersion: "enum",
  deprecated: "boolean",
  removed: "boolean",
} as const;

/** Facets exposed in the UI (each maps a value -> match count). */
export type FacetKey = "kind" | "namespace" | "stability" | "addedVersion";
const FACET_KEYS: FacetKey[] = ["kind", "namespace", "stability", "addedVersion"];

export interface SearchQuery {
  term: string;
  kinds: string[];
  namespaces: string[];
  stabilities: string[];
  addedVersions: string[];
  status: "all" | "current" | "removed";
  deprecatedOnly: boolean;
  limit?: number;
}

export interface SearchResult {
  total: number;
  docs: SearchDoc[];
  facets: Record<FacetKey, Record<string, number>>;
}

const EMPTY_QUERY: SearchQuery = {
  term: "",
  kinds: [],
  namespaces: [],
  stabilities: [],
  addedVersions: [],
  status: "all",
  deprecatedOnly: false,
};

/** Build an in-memory Orama index from the trimmed search docs. */
export async function createSearchDb(docs: SearchDoc[]): Promise<AnyOrama> {
  const db = create({ schema: SCHEMA });
  await insertMultiple(
    db,
    docs.map((d) => ({ ...d, stability: d.stability ?? "development" })),
  );
  return db;
}

function buildWhere(q: SearchQuery): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (q.kinds.length) where.kind = { in: q.kinds };
  if (q.namespaces.length) where.namespace = { in: q.namespaces };
  if (q.stabilities.length) where.stability = { in: q.stabilities };
  if (q.addedVersions.length) where.addedVersion = { in: q.addedVersions };
  if (q.status === "current") where.removed = false;
  else if (q.status === "removed") where.removed = true;
  if (q.deprecatedOnly) where.deprecated = true;
  return where;
}

export async function runSearch(
  db: AnyOrama,
  query: Partial<SearchQuery> = {},
): Promise<SearchResult> {
  const q = { ...EMPTY_QUERY, ...query };
  // biome-ignore lint/suspicious/noExplicitAny: Orama's faceted result type is broad.
  const res: any = await search(db, {
    term: q.term,
    properties: ["name", "brief"],
    where: buildWhere(q),
    facets: {
      kind: {},
      namespace: { limit: 500 },
      stability: {},
      addedVersion: { limit: 50 },
    },
    limit: q.limit ?? 200,
  });

  const facets = Object.fromEntries(
    FACET_KEYS.map((k) => [k, res.facets?.[k]?.values ?? {}]),
  ) as Record<FacetKey, Record<string, number>>;

  return {
    total: res.count,
    docs: res.hits.map((h: { document: SearchDoc }) => h.document),
    facets,
  };
}
