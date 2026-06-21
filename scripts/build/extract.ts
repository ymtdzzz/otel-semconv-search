/**
 * Extract the entities present in a single resolved snapshot.
 */
import type { EntityKind } from "../../src/lib/types.ts";
import {
  classifyGroup,
  type GroupType,
  parseAttribute,
  parseEntity,
  parseEvent,
  parseMetric,
  parseSpan,
  type RawEntity,
  type ResolvedGroup,
  WeaverShapeError,
} from "./weaver.ts";

export type { RawEntity, ResolvedGroup } from "./weaver.ts";

const stripPrefix = (id: string, prefix: string) =>
  id.startsWith(prefix) ? id.slice(prefix.length) : id;

function assertHandled(type: never, version: string, id: string): never {
  throw new WeaverShapeError(
    `unhandled group.type ${JSON.stringify(type)} at ${version} :: ${id} — extract.ts dispatch needs a new case`,
  );
}

/** Extract the entity set present in one resolved snapshot, keyed by `${kind} ${name}`. */
export function extractEntities(groups: ResolvedGroup[], version: string): Map<string, RawEntity> {
  const out = new Map<string, RawEntity>();
  const key = (k: EntityKind, n: string) => `${k} ${n}`;

  for (const g of groups) {
    if (!String(g.id ?? "").startsWith("registry.")) continue;
    for (const a of g.attributes ?? []) {
      const r = parseAttribute(a, version);
      if (r) out.set(key("attribute", r.name), r);
    }
  }

  for (const g of groups) {
    const id = String(g.id ?? "");
    const type = classifyGroup(g, version);
    for (const a of g.attributes ?? []) {
      const r = parseAttribute(a, version);
      if (r && !out.has(key("attribute", r.name)))
        throw new WeaverShapeError(
          `attribute "${r.name}" appears outside registry.* at ${version} :: ${id} — semconv's registry model may have changed`,
        );
    }
    if (!type) continue;

    const t: GroupType = type;
    switch (t) {
      case "attribute_group":
        break; // carries only attributes (handled above); declares no signal
      case "metric":
        if (typeof g.metric_name === "string")
          out.set(key("metric", g.metric_name), parseMetric(g, version, g.metric_name));
        break;
      case "span": {
        // Spans carry no `name`; the group id (minus the "span." prefix) is the identifier.
        const name = stripPrefix(id, "span.");
        out.set(key("span", name), parseSpan(g, version, name));
        break;
      }
      case "entity": {
        const name = typeof g.name === "string" ? g.name : stripPrefix(id, "entity.");
        out.set(key("entity", name), parseEntity(g, version, name));
        break;
      }
      case "event": {
        // Identify by name, falling back to prefix (older "exception"/"rpc.message") then id.
        // Several groups can map to one event; prefer the variant that declares stability.
        const name = g.name ?? g.prefix ?? id;
        if (typeof name === "string") {
          const k = key("event", name);
          const prev = out.get(k);
          const declared = g.stability != null;
          if (!prev || (!prev.stabilityDeclared && declared)) {
            out.set(k, parseEvent(g, version, name));
          }
        }
        break;
      }
      default:
        assertHandled(t, version, id);
    }
  }

  return out;
}
