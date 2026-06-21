// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import type { SearchDoc } from "../lib/search.ts";
import Search from "./Search.tsx";

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
  doc({ name: "db.query.parameter", namespace: "db", deprecated: true, brief: "a query param" }),
  doc({
    name: "system.cpu.time",
    kind: "metric",
    namespace: "system",
    removed: true,
    lastSeen: "1.34.0",
    addedVersion: "1.31.0",
    brief: "cpu time",
  }),
  doc({ name: "http.client.request.duration", kind: "span", namespace: "http", brief: "latency" }),
];

afterEach(cleanup);

/** Find the filter toggle button regardless of its text siblings. */
const filterBtn = () => screen.getByRole("button", { name: /filters/i });

/** Wait for the async Orama index build + first search to render the summary. */
const summary = () => screen.findByText(/showing/i);

describe("Search island", () => {
  it("builds the index and lists all docs initially", async () => {
    render(<Search docs={DOCS} />);
    expect((await summary()).textContent).toContain("showing 4 of 4");
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });

  it("filters by free-text term (debounced)", async () => {
    render(<Search docs={DOCS} />);
    await summary();
    fireEvent.input(screen.getByPlaceholderText(/search semantic conventions/i), {
      target: { value: "query" },
    });
    await waitFor(() =>
      expect(screen.getByText(/showing/i).textContent).toContain("showing 2 of 2"),
    );
    expect(screen.getByText("db.query.text")).toBeTruthy();
    expect(screen.queryByText("system.cpu.time")).toBeNull();
  });

  it("filters by a kind facet checkbox", async () => {
    render(<Search docs={DOCS} />);
    await summary();
    fireEvent.click(screen.getByRole("checkbox", { name: /^metric/ }));
    await waitFor(() =>
      expect(screen.getByText(/showing/i).textContent).toContain("showing 1 of 1"),
    );
    expect(screen.getByText("system.cpu.time")).toBeTruthy();
  });

  it("filters to deprecated only", async () => {
    render(<Search docs={DOCS} />);
    await summary();
    fireEvent.click(screen.getByRole("checkbox", { name: /deprecated only/i }));
    await waitFor(() =>
      expect(screen.getByText(/showing/i).textContent).toContain("showing 1 of 1"),
    );
    expect(screen.getByText("db.query.parameter")).toBeTruthy();
  });

  it("renders forward-compatible detail links", async () => {
    render(<Search docs={DOCS} />);
    await summary();
    const link = screen.getByRole("link", { name: /db\.query\.text/ });
    expect(link.getAttribute("href")).toBe("/attribute/db.query.text/");
  });

  it("marks a removed entity with a strikethrough name and a badge", async () => {
    render(<Search docs={DOCS} />);
    await summary();
    const name = screen.getByText("system.cpu.time");
    expect(name.className).toContain("removed");
    expect(screen.getByText(/removed after 1\.34\.0/)).toBeTruthy();
  });

  it("narrows the namespace option list via the filter input", async () => {
    render(<Search docs={DOCS} />);
    await summary();
    const nsFieldset = screen.getByText("Namespace").closest("fieldset") as HTMLElement;
    // 3 distinct namespaces present before filtering (db, system, http).
    expect(within(nsFieldset).getAllByRole("checkbox")).toHaveLength(3);
    fireEvent.input(within(nsFieldset).getByPlaceholderText(/filter namespaces/i), {
      target: { value: "sys" },
    });
    await waitFor(() => expect(within(nsFieldset).getAllByRole("checkbox")).toHaveLength(1));
    expect(within(nsFieldset).getByText("system")).toBeTruthy();
  });
});

describe("Search — filter toggle", () => {
  it("renders a Filters button", async () => {
    render(<Search docs={DOCS} />);
    await summary();
    expect(filterBtn()).toBeTruthy();
  });

  it("starts collapsed: aria-expanded is false and aside has no facets-open class", async () => {
    render(<Search docs={DOCS} />);
    await summary();
    expect(filterBtn().getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("complementary").classList.contains("facets-open")).toBe(false);
  });

  it("expands on first click: aria-expanded becomes true and facets-open is added", async () => {
    render(<Search docs={DOCS} />);
    await summary();
    fireEvent.click(filterBtn());
    expect(filterBtn().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("complementary").classList.contains("facets-open")).toBe(true);
  });

  it("collapses on second click", async () => {
    render(<Search docs={DOCS} />);
    await summary();
    fireEvent.click(filterBtn());
    fireEvent.click(filterBtn());
    expect(filterBtn().getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("complementary").classList.contains("facets-open")).toBe(false);
  });

  it("shows a count badge when one kind filter is active", async () => {
    render(<Search docs={DOCS} />);
    await summary();
    fireEvent.click(screen.getByRole("checkbox", { name: /^metric/ }));
    await waitFor(() => {
      const badge = filterBtn().querySelector(".filter-badge");
      expect(badge).toBeTruthy();
      expect(badge?.textContent).toBe("1");
    });
  });

  it("increments the badge for multiple active filters", async () => {
    render(<Search docs={DOCS} />);
    await summary();
    fireEvent.click(screen.getByRole("checkbox", { name: /^metric/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^deprecated only/i }));
    await waitFor(() => {
      const badge = filterBtn().querySelector(".filter-badge");
      expect(badge?.textContent).toBe("2");
    });
  });

  it("hides the badge when no filters are active", async () => {
    render(<Search docs={DOCS} />);
    await summary();
    expect(filterBtn().querySelector(".filter-badge")).toBeNull();
  });
});
