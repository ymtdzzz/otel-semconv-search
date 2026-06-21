import type { AnyOrama } from "@orama/orama";
import { beforeAll, describe, expect, it } from "vitest";
import { createSearchDb, runSearch } from "./orama.ts";
import type { SearchDoc } from "./search.ts";

const doc = (over: Partial<SearchDoc>): SearchDoc => ({
  id: `${over.kind ?? "attribute"} ${over.name}`,
  name: "x",
  kind: "attribute",
  namespace: "db",
  stability: "stable",
  deprecated: false,
  addedVersion: "1.26.0",
  removed: false,
  lastSeen: "1.42.0",
  brief: "",
  ...over,
});

const DOCS: SearchDoc[] = [
  doc({ name: "db.query.text", namespace: "db", stability: "stable", brief: "the query text" }),
  doc({ name: "db.query.parameter", namespace: "db", deprecated: true, brief: "a param" }),
  doc({ name: "http.request.method", namespace: "http", brief: "method" }),
  doc({
    name: "system.cpu.time",
    kind: "metric",
    namespace: "system",
    removed: true,
    addedVersion: "1.31.0",
  }),
];

describe("orama search layer", () => {
  let db: AnyOrama;
  beforeAll(async () => {
    db = await createSearchDb(DOCS);
  });

  it("returns all docs for an empty term", async () => {
    expect((await runSearch(db)).total).toBe(4);
  });

  it("matches the term across name and brief", async () => {
    const r = await runSearch(db, { term: "query" });
    expect(r.docs.map((d) => d.name).sort()).toEqual(["db.query.parameter", "db.query.text"]);
  });

  it("filters by an enum facet with { in: [...] }", async () => {
    const r = await runSearch(db, { namespaces: ["db"] });
    expect(r.total).toBe(2);
  });

  it("filters by boolean (deprecated only)", async () => {
    const r = await runSearch(db, { deprecatedOnly: true });
    expect(r.docs.map((d) => d.name)).toEqual(["db.query.parameter"]);
  });

  it("filters by status (removed)", async () => {
    const r = await runSearch(db, { status: "removed" });
    expect(r.docs.map((d) => d.name)).toEqual(["system.cpu.time"]);
    expect((await runSearch(db, { status: "current" })).total).toBe(3);
  });

  it("returns facet counts reflecting current filters", async () => {
    const r = await runSearch(db, { namespaces: ["db"] });
    expect(r.facets.kind.attribute).toBe(2);
    expect(r.facets.namespace.db).toBe(2);
  });
});
