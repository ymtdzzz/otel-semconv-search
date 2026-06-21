import { marked } from "marked";

marked.use({ gfm: true, breaks: false });

/** Render inline Markdown (links, code, emphasis) without wrapping <p>. */
export function renderInline(md: string | undefined): string {
  if (!md) return "";
  return marked.parseInline(md) as string;
}

/** Render block-level Markdown (paragraphs, lists, code blocks). */
export function renderBlock(md: string | undefined): string {
  if (!md) return "";
  return marked.parse(md) as string;
}

/** Strip Markdown to plain text, truncated for <meta> descriptions. */
export function toPlain(md: string | undefined, max = 160): string {
  if (!md) return "";
  const text = md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
