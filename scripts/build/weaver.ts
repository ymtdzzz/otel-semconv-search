/**
 * Everything that knows the shape of weaver's resolved output.
 */
import type {
  Deprecation,
  DeprecationReason,
  EntityKind,
  SpanKind,
  Stability,
} from "../../src/lib/types.ts";

export type GroupType = "attribute_group" | "metric" | "event" | "span" | "entity";

/** A single group as it appears in weaver's resolved JSON. */
export interface ResolvedGroup {
  id?: string;
  type?: string;
  stability?: unknown;
  brief?: string;
  note?: string;
  deprecated?: unknown;
  metric_name?: string;
  instrument?: string;
  unit?: string;
  entity_associations?: unknown;
  span_kind?: string;
  name?: string; // event name (newer) / entity name
  prefix?: string; // older event identifier (e.g. "exception", "rpc.message")
  attributes?: Array<Record<string, unknown>>;
}

/** One entity as seen in a single version (current-definition fields, no history). */
export interface RawEntity {
  kind: EntityKind;
  name: string;
  type?: string;
  brief?: string;
  note?: string;
  examples?: unknown;
  stability: Stability;
  /** Whether stability was declared explicitly (for merge preference on events). */
  stabilityDeclared: boolean;
  deprecation?: Deprecation;
  instrument?: string;
  unit?: string;
  entityAssociations?: string[];
  spanKind?: SpanKind;
}

const GROUP_TYPES: readonly GroupType[] = ["attribute_group", "metric", "event", "span", "entity"];
const STABILITIES: readonly Stability[] = [
  "development",
  "stable",
  "release_candidate",
  "alpha",
  "beta",
];
const REASONS: readonly DeprecationReason[] = [
  "renamed",
  "obsoleted",
  "uncategorized",
  "unspecified",
];
const SPAN_KINDS: readonly SpanKind[] = ["client", "server", "internal", "producer", "consumer"];
const INSTRUMENTS = ["counter", "updowncounter", "histogram", "gauge"] as const;
const IGNORED_GROUP_TYPES = ["undefined"];

const KNOWN_GROUP_KEYS = new Set<string>([
  "annotations",
  "attributes",
  "body",
  "brief",
  "deprecated",
  "display_name",
  "entity_associations",
  "events",
  "id",
  "instrument",
  "lineage",
  "metric_name",
  "name",
  "note",
  "prefix",
  "span_kind",
  "stability",
  "type",
  "unit",
]);
const KNOWN_ATTRIBUTE_KEYS = new Set<string>([
  "annotations",
  "brief",
  "deprecated",
  "examples",
  "name",
  "note",
  "requirement_level",
  "role",
  "sampling_relevant",
  "stability",
  "tag",
  "type",
]);
const KNOWN_DEPRECATION_KEYS = new Set<string>(["reason", "note", "renamed_to"]);

/** Thrown when resolved data falls outside the vocabularies types.ts promises. */
export class WeaverShapeError extends Error {}

function fail(version: string, id: string, field: string, value: unknown): never {
  throw new WeaverShapeError(
    `unexpected ${field}=${JSON.stringify(value)} at ${version} :: ${id} — types.ts may need updating`,
  );
}

function checkKeys(
  obj: object,
  known: Set<string>,
  version: string,
  id: string,
  scope: string,
): void {
  for (const k of Object.keys(obj)) {
    if (!known.has(k)) {
      throw new WeaverShapeError(
        `unexpected ${scope} field "${k}" at ${version} :: ${id} — build-data may need updating`,
      );
    }
  }
}

export function checkGroupKeys(group: object, version: string, id: string): void {
  checkKeys(group, KNOWN_GROUP_KEYS, version, id, "group");
}

export function checkAttributeKeys(attr: object, version: string, id: string): void {
  checkKeys(attr, KNOWN_ATTRIBUTE_KEYS, version, id, "attribute");
}

function oneOf<T extends string>(
  known: readonly T[],
  value: unknown,
  version: string,
  id: string,
  field: string,
): T {
  if (typeof value === "string" && (known as readonly string[]).includes(value)) return value as T;
  return fail(version, id, field, value);
}

/** Missing/null stability normalizes to the OTel default; any other value is validated. */
export function normStability(raw: unknown, version: string, id: string): Stability {
  if (raw == null) return "development";
  return oneOf(STABILITIES, raw, version, id, "stability");
}

export function isIgnoredGroupType(raw: unknown): boolean {
  return typeof raw === "string" && IGNORED_GROUP_TYPES.includes(raw);
}

export function parseGroupType(raw: unknown, version: string, id: string): GroupType {
  return oneOf(GROUP_TYPES, raw, version, id, "group.type");
}

export function parseInstrument(raw: unknown, version: string, id: string): string | undefined {
  return raw == null ? undefined : oneOf(INSTRUMENTS, raw, version, id, "instrument");
}

export function parseSpanKind(raw: unknown, version: string, id: string): SpanKind | undefined {
  return raw == null ? undefined : oneOf(SPAN_KINDS, raw, version, id, "span_kind");
}

export function parseDeprecation(
  o: { deprecated?: unknown },
  version: string,
  id: string,
): Deprecation | undefined {
  const d = o.deprecated;
  if (d == null) return undefined;
  if (typeof d !== "object") fail(version, id, "deprecated", d); // legacy string/bool — unexpected in range
  const dd = d as Record<string, unknown>;
  checkKeys(dd, KNOWN_DEPRECATION_KEYS, version, id, "deprecated");
  return {
    reason: oneOf(REASONS, dd.reason, version, id, "deprecated.reason"),
    note: typeof dd.note === "string" ? dd.note : undefined,
    renamedTo: typeof dd.renamed_to === "string" ? dd.renamed_to : undefined,
  };
}

/** Attribute value type: a plain string, or an enum object `{ members: [...] }` → "enum". */
export function parseAttrType(raw: unknown, version: string, id: string): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).members))
    return "enum";
  return fail(version, id, "type", raw);
}

export function parseEntityAssociations(
  raw: unknown,
  version: string,
  id: string,
): string[] | undefined {
  if (raw == null) return undefined;
  if (Array.isArray(raw) && raw.every((x) => typeof x === "string")) return raw as string[];
  return fail(version, id, "entity_associations", raw); // v0.24 one_of/all_of objects land here
}

/** Fields shared by every signal group (metric/span/event/entity). */
function commonGroupFields(g: ResolvedGroup, version: string, id: string) {
  return {
    brief: g.brief,
    note: g.note,
    stability: normStability(g.stability, version, id),
    stabilityDeclared: g.stability != null,
    deprecation: parseDeprecation(g, version, id),
  };
}

/** Validate one registry/group attribute into a RawEntity. Null when it has no usable name. */
export function parseAttribute(a: Record<string, unknown>, version: string): RawEntity | null {
  const name = a.name;
  if (typeof name !== "string") return null;
  checkAttributeKeys(a, version, name);
  return {
    kind: "attribute",
    name,
    type: parseAttrType(a.type, version, name),
    brief: typeof a.brief === "string" ? a.brief : undefined,
    note: typeof a.note === "string" ? a.note : undefined,
    examples: a.examples,
    stability: normStability(a.stability, version, name),
    stabilityDeclared: a.stability != null,
    deprecation: parseDeprecation(a, version, name),
  };
}

/**
 * Validate a group's keys and resolve its signal kind. Returns null when the
 * group declares no signal (the tolerated `type: "undefined"` quirk); throws on
 * an unknown type.
 */
export function classifyGroup(g: ResolvedGroup, version: string): GroupType | null {
  const id = String(g.id ?? "");
  checkGroupKeys(g, version, id);
  if (isIgnoredGroupType(g.type)) return null;
  return parseGroupType(g.type, version, id);
}

export function parseMetric(g: ResolvedGroup, version: string, name: string): RawEntity {
  const id = String(g.id ?? "");
  return {
    kind: "metric",
    name,
    ...commonGroupFields(g, version, id),
    instrument: parseInstrument(g.instrument, version, id),
    unit: typeof g.unit === "string" ? g.unit : undefined,
    entityAssociations: parseEntityAssociations(g.entity_associations, version, id),
  };
}

export function parseSpan(g: ResolvedGroup, version: string, name: string): RawEntity {
  const id = String(g.id ?? "");
  return {
    kind: "span",
    name,
    ...commonGroupFields(g, version, id),
    spanKind: parseSpanKind(g.span_kind, version, id),
  };
}

export function parseEntity(g: ResolvedGroup, version: string, name: string): RawEntity {
  const id = String(g.id ?? "");
  return { kind: "entity", name, ...commonGroupFields(g, version, id) };
}

export function parseEvent(g: ResolvedGroup, version: string, name: string): RawEntity {
  const id = String(g.id ?? "");
  return { kind: "event", name, ...commonGroupFields(g, version, id) };
}
