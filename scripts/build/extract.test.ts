import { describe, expect, it } from "vitest";
import { extractEntities, type ResolvedGroup } from "./extract.ts";
import { WeaverShapeError } from "./weaver.ts";

const attr = (name: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  name,
  type: "string",
  ...extra,
});
const registry = (...attributes: Record<string, unknown>[]): ResolvedGroup => ({
  id: "registry.test",
  type: "attribute_group",
  attributes,
});

describe("kind-specific extraction", () => {
  const groups: ResolvedGroup[] = [
    { id: "span.foo.client", type: "span", span_kind: "client", stability: "development" },
    {
      id: "metric.x",
      type: "metric",
      metric_name: "x.count",
      instrument: "counter",
      unit: "{x}",
      stability: "stable",
      entity_associations: ["host"],
    },
    { id: "entity.host", type: "entity", name: "host", stability: "development" },
    { id: "event.foo", type: "event", name: "foo", stability: "development" },
  ];
  const m = extractEntities(groups, "1.26.0");

  it("derives a span name from its id (name is null) and keeps span_kind", () => {
    expect(m.get("span foo.client")).toMatchObject({ name: "foo.client", spanKind: "client" });
  });

  it("keeps metric instrument/unit/entityAssociations", () => {
    expect(m.get("metric x.count")).toMatchObject({
      instrument: "counter",
      unit: "{x}",
      entityAssociations: ["host"],
    });
  });

  it("extracts entity and event signals", () => {
    expect(m.get("entity host")?.kind).toBe("entity");
    expect(m.get("event foo")?.kind).toBe("event");
  });
});

describe("attribute canonicalization", () => {
  it("prefers the registry definition over a non-registry group's copy", () => {
    const groups: ResolvedGroup[] = [
      {
        id: "metric.x",
        type: "metric",
        metric_name: "x",
        attributes: [attr("a.b", { brief: "local" })],
      },
      registry(attr("a.b", { brief: "canonical" })),
    ];
    expect(extractEntities(groups, "1.26.0").get("attribute a.b")?.brief).toBe("canonical");
  });

  it("normalizes missing stability to development", () => {
    expect(extractEntities([registry(attr("a.b"))], "1.26.0").get("attribute a.b")?.stability).toBe(
      "development",
    );
  });
});

describe("tolerated historical quirk", () => {
  it("tolerates a `type: undefined` group (registry supplies its attributes, no throw)", () => {
    const m = extractEntities(
      [
        registry(attr("a.b", { stability: "development" })),
        {
          id: "trace.x",
          type: "undefined",
          attributes: [attr("a.b", { stability: "development" })],
        },
      ],
      "1.26.0",
    );
    expect(m.has("attribute a.b")).toBe(true);
  });
});

describe("registry completeness assertion", () => {
  it("throws when a non-registry group references an attribute absent from the registry", () => {
    expect(() =>
      extractEntities(
        [{ id: "metric.x", type: "metric", metric_name: "x", attributes: [attr("only.here")] }],
        "1.26.0",
      ),
    ).toThrow(WeaverShapeError);
  });
});
