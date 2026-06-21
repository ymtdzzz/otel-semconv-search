import { describe, expect, it } from "vitest";
import { cmpSemver, parseSemver } from "./semver.ts";

describe("parseSemver", () => {
  it("parses x.y.z", () => {
    expect(parseSemver("1.41.1")).toEqual([1, 41, 1]);
  });

  it("rejects non-semver", () => {
    expect(parseSemver("v1.2.3")).toBeNull();
    expect(parseSemver("1.2")).toBeNull();
  });
});

describe("cmpSemver", () => {
  it("orders by major, minor, then patch", () => {
    expect(cmpSemver("1.41.0", "1.41.1")).toBeLessThan(0);
    expect(cmpSemver("1.9.0", "1.10.0")).toBeLessThan(0); // not lexical
    expect(cmpSemver("2.0.0", "1.99.99")).toBeGreaterThan(0);
    expect(cmpSemver("1.26.0", "1.26.0")).toBe(0);
  });

  it("sorts a version list ascending", () => {
    expect(["1.41.1", "1.9.0", "1.41.0", "1.10.0"].sort(cmpSemver)).toEqual([
      "1.9.0",
      "1.10.0",
      "1.41.0",
      "1.41.1",
    ]);
  });
});
