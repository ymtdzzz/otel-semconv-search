import { describe, expect, it } from "vitest";
import { renderBlock, renderInline, toPlain } from "./md.ts";

describe("renderInline", () => {
  it("returns empty string for undefined", () => {
    expect(renderInline(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(renderInline("")).toBe("");
  });

  it("renders inline code", () => {
    expect(renderInline("use `db.query.text`")).toBe("use <code>db.query.text</code>");
  });

  it("renders links", () => {
    expect(renderInline("[spec](https://example.com)")).toBe(
      '<a href="https://example.com">spec</a>',
    );
  });

  it("renders emphasis", () => {
    expect(renderInline("_italic_")).toBe("<em>italic</em>");
  });

  it("does not wrap in <p>", () => {
    expect(renderInline("plain text")).not.toMatch(/<p>/);
  });
});

describe("renderBlock", () => {
  it("returns empty string for undefined", () => {
    expect(renderBlock(undefined)).toBe("");
  });

  it("wraps plain text in <p>", () => {
    expect(renderBlock("hello").trim()).toBe("<p>hello</p>");
  });

  it("renders fenced code blocks", () => {
    const md = "```\ncode here\n```";
    const html = renderBlock(md);
    expect(html).toContain("<pre>");
    expect(html).toContain("code here");
  });

  it("renders bullet lists", () => {
    const html = renderBlock("- item one\n- item two");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>item one</li>");
    expect(html).toContain("<li>item two</li>");
  });
});

describe("toPlain", () => {
  it("returns empty string for undefined", () => {
    expect(toPlain(undefined)).toBe("");
  });

  it("strips link syntax, keeping label text", () => {
    expect(toPlain("[foo](https://example.com)")).toBe("foo");
  });

  it("strips backticks", () => {
    expect(toPlain("use `db.query.text`")).toBe("use db.query.text");
  });

  it("strips emphasis markers", () => {
    expect(toPlain("*bold* and _italic_")).toBe("bold and italic");
  });

  it("strips heading markers", () => {
    expect(toPlain("# Title")).toBe("Title");
  });

  it("collapses whitespace", () => {
    expect(toPlain("foo\n\nbar")).toBe("foo bar");
  });

  it("truncates to max length with ellipsis", () => {
    const long = "a".repeat(200);
    const result = toPlain(long, 160);
    expect(result.length).toBe(160);
    expect(result.endsWith("…")).toBe(true);
  });

  it("does not truncate when within limit", () => {
    const short = "hello world";
    expect(toPlain(short, 160)).toBe("hello world");
  });

  it("uses custom max length", () => {
    const result = toPlain("abcde", 3);
    expect(result.length).toBe(3);
    expect(result.endsWith("…")).toBe(true);
  });
});
