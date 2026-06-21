import { describe, expect, it } from "vitest";
import {
  checkAttributeKeys,
  checkGroupKeys,
  isIgnoredGroupType,
  normStability,
  parseAttrType,
  parseDeprecation,
  parseEntityAssociations,
  parseGroupType,
  parseInstrument,
  parseSpanKind,
  WeaverShapeError,
} from "./weaver.ts";

const V = "1.26.0";
const ID = "test.id";

describe("normStability", () => {
  it("defaults missing/null to development", () => {
    expect(normStability(null, V, ID)).toBe("development");
    expect(normStability(undefined, V, ID)).toBe("development");
  });

  it("passes known values through", () => {
    expect(normStability("beta", V, ID)).toBe("beta");
  });

  it("throws on an unknown value", () => {
    expect(() => normStability("experimental", V, ID)).toThrow(WeaverShapeError);
  });
});

describe("group type", () => {
  it("flags the historical `undefined` quirk as ignored", () => {
    expect(isIgnoredGroupType("undefined")).toBe(true);
    expect(isIgnoredGroupType("metric")).toBe(false);
  });

  it("validates known types and throws on new ones", () => {
    expect(parseGroupType("span", V, ID)).toBe("span");
    expect(() => parseGroupType("profile", V, ID)).toThrow(WeaverShapeError);
  });
});

describe("optional enums", () => {
  it("parseInstrument: null -> undefined, known passes, unknown throws", () => {
    expect(parseInstrument(null, V, ID)).toBeUndefined();
    expect(parseInstrument("counter", V, ID)).toBe("counter");
    expect(() => parseInstrument("summary", V, ID)).toThrow(WeaverShapeError);
  });

  it("parseSpanKind: null -> undefined, known passes, unknown throws", () => {
    expect(parseSpanKind(null, V, ID)).toBeUndefined();
    expect(parseSpanKind("client", V, ID)).toBe("client");
    expect(() => parseSpanKind("mystery", V, ID)).toThrow(WeaverShapeError);
  });
});

describe("parseDeprecation", () => {
  it("returns undefined when absent", () => {
    expect(parseDeprecation({}, V, ID)).toBeUndefined();
  });

  it("maps reason/note/renamed_to", () => {
    expect(
      parseDeprecation({ deprecated: { reason: "renamed", renamed_to: "x.y", note: "n" } }, V, ID),
    ).toEqual({ reason: "renamed", renamedTo: "x.y", note: "n" });
  });

  it("throws on an unknown reason", () => {
    expect(() => parseDeprecation({ deprecated: { reason: "moved" } }, V, ID)).toThrow(
      WeaverShapeError,
    );
  });

  it("throws on a legacy non-object deprecated", () => {
    expect(() => parseDeprecation({ deprecated: "use x instead" }, V, ID)).toThrow(
      WeaverShapeError,
    );
  });
});

describe("parseAttrType", () => {
  it("passes string types through", () => {
    expect(parseAttrType("string", V, ID)).toBe("string");
    expect(parseAttrType("template[string]", V, ID)).toBe("template[string]");
  });

  it("collapses an enum object to 'enum'", () => {
    expect(parseAttrType({ members: [{ id: "a", value: "A" }] }, V, ID)).toBe("enum");
  });

  it("returns undefined when absent and throws on an unknown object shape", () => {
    expect(parseAttrType(null, V, ID)).toBeUndefined();
    expect(() => parseAttrType({ weird: true }, V, ID)).toThrow(WeaverShapeError);
  });
});

describe("parseEntityAssociations", () => {
  it("accepts a string list", () => {
    expect(parseEntityAssociations(["host", "service"], V, ID)).toEqual(["host", "service"]);
  });

  it("returns undefined when absent", () => {
    expect(parseEntityAssociations(null, V, ID)).toBeUndefined();
  });

  it("throws on the v0.24 one_of/all_of object shape", () => {
    expect(() => parseEntityAssociations({ one_of: ["host"] }, V, ID)).toThrow(WeaverShapeError);
  });
});

describe("unknown-field detection", () => {
  it("accepts groups/attributes with only known fields", () => {
    expect(() =>
      checkGroupKeys({ id: "x", type: "metric", metric_name: "m" }, V, ID),
    ).not.toThrow();
    expect(() =>
      checkAttributeKeys({ name: "a.b", type: "string", stability: "stable" }, V, ID),
    ).not.toThrow();
  });

  it("throws on a new top-level group field (e.g. a future v2 signal field)", () => {
    expect(() =>
      checkGroupKeys({ id: "x", type: "metric", requirement_level: "recommended" }, V, ID),
    ).toThrow(WeaverShapeError);
  });

  it("throws on a new top-level attribute field", () => {
    expect(() => checkAttributeKeys({ name: "a.b", new_field: 1 }, V, ID)).toThrow(
      WeaverShapeError,
    );
  });

  it("throws on a new key inside the deprecated object", () => {
    expect(() =>
      parseDeprecation({ deprecated: { reason: "renamed", successor: "x" } }, V, ID),
    ).toThrow(WeaverShapeError);
  });
});
