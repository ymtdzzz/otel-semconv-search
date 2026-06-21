import { describe, expect, it } from "vitest";
import { buildEntities } from "./aggregate.ts";
import type { ResolvedGroup } from "./extract.ts";

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

describe("cross-version aggregation", () => {
  // db.statement is deprecated from the floor but only declares renamed_to later.
  const snapshots = [
    {
      version: "1.26.0",
      groups: [
        registry(
          attr("db.statement", {
            stability: "development",
            deprecated: { reason: "unspecified", note: "Replaced by `db.query.text`." },
          }),
          attr("db.query.text", { stability: "development" }),
        ),
      ],
    },
    {
      version: "1.27.0",
      groups: [
        registry(
          attr("db.statement", {
            stability: "development",
            deprecated: { reason: "renamed", renamed_to: "db.query.text", note: "Replaced." },
          }),
          attr("db.query.text", { stability: "stable" }),
        ),
      ],
    },
  ];
  const byName = new Map(buildEntities(snapshots).map((e) => [e.name, e]));

  it("records the deprecated span across the versions it was deprecated", () => {
    expect(byName.get("db.statement")?.deprecatedSpans).toEqual([{ from: "1.26.0", to: "1.27.0" }]);
  });

  it("dates the rename edge at the first version carrying renamed_to", () => {
    expect(byName.get("db.statement")?.renames).toEqual([
      { from: "db.statement", to: "db.query.text", version: "1.27.0" },
    ]);
  });

  it("attaches the rename edge to the target too (backward link)", () => {
    expect(byName.get("db.query.text")?.renames).toEqual([
      { from: "db.statement", to: "db.query.text", version: "1.27.0" },
    ]);
  });

  it("compresses stability history to transition points", () => {
    expect(byName.get("db.query.text")?.stabilityHistory).toEqual([
      { version: "1.26.0", stability: "development" },
      { version: "1.27.0", stability: "stable" },
    ]);
  });

  it("records a single contiguous presence span", () => {
    expect(byName.get("db.query.text")?.presence).toEqual([{ from: "1.26.0", to: "1.27.0" }]);
  });
});

describe("presence spans capture disappear/reappear gaps", () => {
  const present = (version: string) => ({
    version,
    groups: [registry(attr("a.b", { stability: "development" }))],
  });
  const absent = (version: string) => ({ version, groups: [registry()] });
  // present 1.0.0–1.1.0, gone in 1.2.0, back in 1.3.0
  const entity = buildEntities([
    present("1.0.0"),
    present("1.1.0"),
    absent("1.2.0"),
    present("1.3.0"),
  ])[0];

  it("splits presence into two spans around the missing version", () => {
    expect(entity.presence).toEqual([
      { from: "1.0.0", to: "1.1.0" },
      { from: "1.3.0", to: "1.3.0" },
    ]);
  });
});

describe("deprecation spans capture reversals", () => {
  const dep = (version: string, deprecated: boolean) => ({
    version,
    groups: [
      registry(
        attr("a.b", {
          stability: "development",
          ...(deprecated ? { deprecated: { reason: "unspecified" } } : {}),
        }),
      ),
    ],
  });
  // deprecated 1.1.0–1.2.0, revived 1.3.0, deprecated again 1.4.0
  const e = new Map(
    buildEntities([
      dep("1.0.0", false),
      dep("1.1.0", true),
      dep("1.2.0", true),
      dep("1.3.0", false),
      dep("1.4.0", true),
    ]).map((x) => [x.name, x]),
  ).get("a.b");

  it("splits deprecated spans around the revived version", () => {
    expect(e?.deprecatedSpans).toEqual([
      { from: "1.1.0", to: "1.2.0" },
      { from: "1.4.0", to: "1.4.0" },
    ]);
  });

  it("reports the current (latest) deprecation state", () => {
    expect(e?.deprecated).toBe(true);
  });

  it("leaves deprecatedSpans empty for an entity never deprecated", () => {
    const never = buildEntities([dep("1.0.0", false), dep("1.1.0", false)])[0];
    expect(never.deprecatedSpans).toEqual([]);
    expect(never.deprecated).toBe(false);
  });
});

describe("rename edges are scoped by kind", () => {
  // An attribute and an entity share the name "container.runtime"; the attribute
  // rename must not leak onto the entity.
  const snapshots = [
    {
      version: "1.0.0",
      groups: [
        registry(
          attr("container.runtime", {
            stability: "development",
            deprecated: { reason: "renamed", renamed_to: "container.runtime.name" },
          }),
          attr("container.runtime.name", { stability: "development" }),
        ),
        {
          id: "entity.container.runtime",
          type: "entity",
          name: "container.runtime",
          stability: "development",
        } as ResolvedGroup,
      ],
    },
  ];
  const byKey = new Map(buildEntities(snapshots).map((e) => [`${e.kind} ${e.name}`, e]));

  it("attaches the edge to the renamed attribute and its target", () => {
    expect(byKey.get("attribute container.runtime")?.renames).toHaveLength(1);
    expect(byKey.get("attribute container.runtime.name")?.renames).toHaveLength(1);
  });

  it("does not attach it to a same-named entity of a different kind", () => {
    expect(byKey.get("entity container.runtime")?.renames).toEqual([]);
  });
});
