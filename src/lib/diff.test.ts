import { describe, expect, it } from "vitest";
import { computeDiff } from "./diff.ts";
import type { Dataset, Entity } from "./types.ts";

const VERSIONS = ["1.26.0", "1.27.0", "1.28.0", "1.29.0", "1.30.0"];
const FLOOR = "1.26.0";
const LATEST = "1.30.0";

function entity(over: Partial<Entity>): Entity {
  return {
    kind: "attribute",
    name: "x",
    namespace: "x",
    deprecated: false,
    deprecatedSpans: [],
    presence: [{ from: FLOOR, to: LATEST }],
    stabilityHistory: [],
    renames: [],
    ...over,
  };
}

function dataset(entities: Entity[]): Dataset {
  return {
    versions: VERSIONS,
    floor: FLOOR,
    weaverVersion: "0.23.0",
    generatedAt: "2026-01-01T00:00:00Z",
    entities,
  };
}

describe("computeDiff — invalid range", () => {
  const data = dataset([]);

  it("returns null when from === to", () => {
    expect(computeDiff(data, "1.28.0", "1.28.0")).toBeNull();
  });

  it("returns null when from > to", () => {
    expect(computeDiff(data, "1.29.0", "1.27.0")).toBeNull();
  });

  it("returns null for unknown version", () => {
    expect(computeDiff(data, "0.0.0", "1.30.0")).toBeNull();
  });
});

describe("computeDiff — added", () => {
  it("includes entity whose first presence starts in range", () => {
    const data = dataset([
      entity({ name: "new.attr", presence: [{ from: "1.28.0", to: LATEST }] }),
    ]);
    const result = computeDiff(data, "1.27.0", "1.29.0");
    expect(result?.added.map((e) => e.name)).toEqual(["new.attr"]);
  });

  it("excludes entity added at floor (predates tracking window)", () => {
    const data = dataset([entity({ name: "old.attr", presence: [{ from: FLOOR, to: LATEST }] })]);
    const result = computeDiff(data, "1.26.0", "1.30.0");
    expect(result?.added).toHaveLength(0);
  });

  it("excludes entity added before range", () => {
    const data = dataset([
      entity({ name: "early.attr", presence: [{ from: "1.27.0", to: LATEST }] }),
    ]);
    const result = computeDiff(data, "1.28.0", "1.30.0");
    expect(result?.added).toHaveLength(0);
  });

  it("excludes entity added exactly at from (exclusive lower bound)", () => {
    const data = dataset([
      entity({ name: "boundary.attr", presence: [{ from: "1.27.0", to: LATEST }] }),
    ]);
    const result = computeDiff(data, "1.27.0", "1.29.0");
    expect(result?.added).toHaveLength(0);
  });

  it("includes entity added exactly at to (inclusive upper bound)", () => {
    const data = dataset([entity({ name: "to.attr", presence: [{ from: "1.29.0", to: LATEST }] })]);
    const result = computeDiff(data, "1.27.0", "1.29.0");
    expect(result?.added.map((e) => e.name)).toEqual(["to.attr"]);
  });
});

describe("computeDiff — removed", () => {
  it("includes entity whose last presence ends in range", () => {
    const data = dataset([
      entity({ name: "gone.attr", presence: [{ from: FLOOR, to: "1.27.0" }] }),
    ]);
    const result = computeDiff(data, "1.26.0", "1.29.0");
    expect(result?.removed.map((e) => e.name)).toEqual(["gone.attr"]);
  });

  it("excludes still-current entity", () => {
    const data = dataset([entity({ name: "live.attr", presence: [{ from: FLOOR, to: LATEST }] })]);
    const result = computeDiff(data, "1.26.0", "1.30.0");
    expect(result?.removed).toHaveLength(0);
  });

  it("excludes entity removed before range starts", () => {
    const data = dataset([entity({ name: "old.gone", presence: [{ from: FLOOR, to: "1.26.0" }] })]);
    const result = computeDiff(data, "1.27.0", "1.30.0");
    expect(result?.removed).toHaveLength(0);
  });

  it("excludes entity removed exactly at to (li < ti boundary)", () => {
    const data = dataset([
      entity({ name: "gone.at.to", presence: [{ from: FLOOR, to: "1.29.0" }] }),
    ]);
    // to = "1.29.0", so ti = 3. li for "1.29.0" = 3. li < ti is false → excluded.
    const result = computeDiff(data, "1.27.0", "1.29.0");
    expect(result?.removed).toHaveLength(0);
  });
});

describe("computeDiff — renamed", () => {
  it("includes rename edge whose version is in range", () => {
    const data = dataset([
      entity({
        name: "new.name",
        renames: [{ from: "old.name", to: "new.name", version: "1.28.0" }],
      }),
      entity({
        name: "old.name",
        renames: [{ from: "old.name", to: "new.name", version: "1.28.0" }],
      }),
    ]);
    const result = computeDiff(data, "1.27.0", "1.29.0");
    expect(result?.renamed).toHaveLength(1);
    expect(result?.renamed[0]).toMatchObject({ from: "old.name", to: "new.name" });
  });

  it("deduplicates the same edge appearing on both source and target entities", () => {
    const rename = { from: "a", to: "b", version: "1.28.0" };
    const data = dataset([
      entity({ name: "a", renames: [rename] }),
      entity({ name: "b", renames: [rename] }),
    ]);
    const result = computeDiff(data, "1.27.0", "1.30.0");
    expect(result?.renamed).toHaveLength(1);
  });

  it("excludes rename edge outside range", () => {
    const data = dataset([
      entity({
        name: "new.name",
        renames: [{ from: "old.name", to: "new.name", version: "1.26.0" }],
      }),
    ]);
    const result = computeDiff(data, "1.27.0", "1.30.0");
    expect(result?.renamed).toHaveLength(0);
  });
});

describe("computeDiff — stability changes", () => {
  it("includes stability transition in range", () => {
    const data = dataset([
      entity({
        name: "graduating.attr",
        stabilityHistory: [
          { version: "1.26.0", stability: "development" },
          { version: "1.28.0", stability: "stable" },
        ],
      }),
    ]);
    const result = computeDiff(data, "1.27.0", "1.29.0");
    expect(result?.stabilityChanges).toHaveLength(1);
    expect(result?.stabilityChanges[0]).toMatchObject({
      name: "graduating.attr",
      prev: "development",
      next: "stable",
      version: "1.28.0",
    });
  });

  it("skips the initial stability record (no previous to compare)", () => {
    const data = dataset([
      entity({
        name: "attr",
        stabilityHistory: [{ version: "1.26.0", stability: "stable" }],
      }),
    ]);
    const result = computeDiff(data, "1.26.0", "1.30.0");
    expect(result?.stabilityChanges).toHaveLength(0);
  });

  it("excludes stability transition outside range", () => {
    const data = dataset([
      entity({
        name: "attr",
        stabilityHistory: [
          { version: "1.26.0", stability: "development" },
          { version: "1.27.0", stability: "stable" },
        ],
      }),
    ]);
    const result = computeDiff(data, "1.28.0", "1.30.0");
    expect(result?.stabilityChanges).toHaveLength(0);
  });
});

describe("computeDiff — deprecated", () => {
  it("includes entity that became deprecated in range", () => {
    const data = dataset([
      entity({
        name: "dep.attr",
        deprecated: true,
        deprecatedSpans: [{ from: "1.28.0", to: LATEST }],
      }),
    ]);
    const result = computeDiff(data, "1.27.0", "1.29.0");
    expect(result?.deprecated.map((e) => e.name)).toEqual(["dep.attr"]);
  });

  it("excludes entity deprecated before range", () => {
    const data = dataset([
      entity({
        name: "old.dep",
        deprecated: true,
        deprecatedSpans: [{ from: "1.26.0", to: LATEST }],
      }),
    ]);
    const result = computeDiff(data, "1.27.0", "1.30.0");
    expect(result?.deprecated).toHaveLength(0);
  });

  it("includes re-deprecated entity when a later deprecatedSpan starts in range", () => {
    const data = dataset([
      entity({
        name: "flappy.attr",
        deprecated: true,
        deprecatedSpans: [
          { from: "1.26.0", to: "1.27.0" },
          { from: "1.29.0", to: LATEST },
        ],
      }),
    ]);
    const result = computeDiff(data, "1.28.0", "1.30.0");
    expect(result?.deprecated.map((e) => e.name)).toEqual(["flappy.attr"]);
  });

  it("excludes never-deprecated entity", () => {
    const data = dataset([entity({ name: "clean.attr", deprecatedSpans: [] })]);
    const result = computeDiff(data, "1.26.0", "1.30.0");
    expect(result?.deprecated).toHaveLength(0);
  });
});
