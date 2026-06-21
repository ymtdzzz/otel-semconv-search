/**
 * Shared data model for otel-semconv-search.
 * Produced by `scripts/build-data.ts`, consumed by the Astro site.
 */

/** Entity stability (Weaver >= 0.23 vocabulary). */
export type Stability = "development" | "stable" | "release_candidate" | "alpha" | "beta";

export type EntityKind = "attribute" | "metric" | "event" | "span" | "entity";

/** Span kind (OTel canonical set). */
export type SpanKind = "client" | "server" | "internal" | "producer" | "consumer";

export type DeprecationReason = "renamed" | "obsoleted" | "uncategorized" | "unspecified";

export interface Deprecation {
  reason: DeprecationReason;
  /** Markdown. */
  note?: string;
  /** Set when `reason` is `renamed`. */
  renamedTo?: string;
}

export interface StabilityChange {
  version: string;
  stability: Stability;
}

export interface RenameEdge {
  from: string;
  to: string;
  version: string;
}

/** A contiguous, inclusive span of versions. Used for presence and deprecation history. */
export interface VersionRange {
  from: string;
  to: string;
}

export interface Entity {
  kind: EntityKind;
  /** Canonical identifier, e.g. "db.query.text". */
  name: string;
  /** Root namespace segment, e.g. "db". */
  namespace: string;

  // Definition (value from the latest version it exists in).
  /** Value type, for attributes. */
  type?: string;
  brief?: string;
  /** Markdown. */
  note?: string;
  examples?: unknown;
  stability?: Stability;

  // Metric-only.
  instrument?: string;
  unit?: string;
  entityAssociations?: string[];

  // Span-only.
  spanKind?: SpanKind;

  // Deprecation (independent axis from stability).
  /** Currently deprecated, as of the latest version it exists in. */
  deprecated: boolean;
  /** Latest deprecation detail. */
  deprecation?: Deprecation;
  /** Version spans it was deprecated in, oldest first. Empty if never deprecated; a gap means it was un-deprecated then deprecated again. */
  deprecatedSpans: VersionRange[];

  // Version history.
  /** Version spans it existed in, oldest first. A gap means it was removed then re-added. */
  presence: VersionRange[];
  stabilityHistory: StabilityChange[];
  renames: RenameEdge[];
}

/** The dataset written to `src/data/semconv.json`. */
export interface Dataset {
  /** Ascending. */
  versions: string[];
  floor: string;
  /** Weaver image tag. */
  weaverVersion: string;
  /** ISO 8601. */
  generatedAt: string;
  entities: Entity[];
}
