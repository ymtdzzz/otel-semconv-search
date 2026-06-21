import { describe, expect, it } from "vitest";
import { buildSearchDocs, toSearchDoc } from "./search.ts";
import type { Dataset, Entity } from "./types.ts";

const entity = (over: Partial<Entity> = {}): Entity => ({
  kind: "attribute",
  name: "db.query.text",
  namespace: "db",
  deprecated: false,
  deprecatedSpans: [],
  presence: [{ from: "1.26.0", to: "1.42.0" }],
  stabilityHistory: [],
  renames: [],
  stability: "stable",
  brief: "The database query being executed.",
  ...over,
});

const LATEST = "1.42.0";

describe("toSearchDoc", () => {
  it("derives id and addedVersion from the first presence span", () => {
    const d = toSearchDoc(entity({ presence: [{ from: "1.30.0", to: "1.42.0" }] }), LATEST);
    expect(d.id).toBe("attribute db.query.text");
    expect(d.addedVersion).toBe("1.30.0");
  });

  it("marks removed when the last presence span does not reach latest", () => {
    expect(
      toSearchDoc(entity({ presence: [{ from: "1.26.0", to: "1.40.0" }] }), LATEST).removed,
    ).toBe(true);
  });

  it("treats an entity present in latest as not removed", () => {
    expect(toSearchDoc(entity(), LATEST).removed).toBe(false);
  });

  it("uses the last span across a gap to decide removed and lastSeen", () => {
    // present, gone, back at latest -> not removed
    const back = entity({
      presence: [
        { from: "1.26.0", to: "1.36.0" },
        { from: "1.40.0", to: "1.42.0" },
      ],
    });
    expect(toSearchDoc(back, LATEST).removed).toBe(false);
    expect(toSearchDoc(back, LATEST).lastSeen).toBe("1.42.0");
  });

  it("reports lastSeen as the end of the last span for a removed entity", () => {
    const d = toSearchDoc(entity({ presence: [{ from: "1.26.0", to: "1.40.0" }] }), LATEST);
    expect(d).toMatchObject({ removed: true, lastSeen: "1.40.0" });
  });

  it("flattens and truncates the brief to a single line", () => {
    const long = `${"x".repeat(200)}\n\nmore`;
    const d = toSearchDoc(entity({ brief: "multi\nline   brief" }), LATEST);
    expect(d.brief).toBe("multi line brief");
    expect(toSearchDoc(entity({ brief: long }), LATEST).brief).toMatch(/…$/);
    expect(toSearchDoc(entity({ brief: long }), LATEST).brief.length).toBe(160);
  });

  it("carries kind/namespace/stability/deprecated through", () => {
    const d = toSearchDoc(
      entity({ kind: "metric", namespace: "system", stability: "development", deprecated: true }),
      LATEST,
    );
    expect(d).toMatchObject({
      kind: "metric",
      namespace: "system",
      stability: "development",
      deprecated: true,
    });
  });
});

describe("buildSearchDocs", () => {
  it("uses the latest dataset version to compute removed", () => {
    const dataset: Dataset = {
      versions: ["1.26.0", "1.42.0"],
      floor: "1.26.0",
      weaverVersion: "weaver 0.23.0",
      generatedAt: "2026-01-01T00:00:00Z",
      entities: [
        entity({ name: "a", presence: [{ from: "1.26.0", to: "1.42.0" }] }),
        entity({ name: "b", presence: [{ from: "1.26.0", to: "1.26.0" }] }),
      ],
    };
    const docs = buildSearchDocs(dataset);
    expect(docs.find((d) => d.name === "a")?.removed).toBe(false);
    expect(docs.find((d) => d.name === "b")?.removed).toBe(true);
  });
});
