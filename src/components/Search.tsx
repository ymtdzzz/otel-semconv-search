import type { AnyOrama } from "@orama/orama";
import { useEffect, useMemo, useState } from "preact/hooks";
import { createSearchDb, type FacetKey, runSearch, type SearchResult } from "../lib/orama.ts";
import type { SearchDoc } from "../lib/search.ts";

interface Props {
  docs: SearchDoc[];
}

type Status = "all" | "current" | "removed";

const LIMIT = 200;
const BASE = import.meta.env.BASE_URL;

const KIND_ORDER = ["attribute", "metric", "span", "event", "entity"];
const STABILITY_ORDER = ["stable", "release_candidate", "beta", "alpha", "development"];

function detailHref(doc: SearchDoc): string {
  return `${BASE}${doc.kind}/${doc.name}/`;
}

function options(docs: SearchDoc[], field: keyof SearchDoc, order?: string[]): string[] {
  const present = new Set<string>();
  for (const d of docs) {
    const v = d[field];
    if (typeof v === "string" && v) present.add(v);
  }
  if (!order) return [...present].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const ranked = order.filter((v) => present.has(v));
  const rest = [...present].filter((v) => !order.includes(v)).sort();
  return [...ranked, ...rest];
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function Search({ docs }: Props) {
  const [db, setDb] = useState<AnyOrama | null>(null);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [kinds, setKinds] = useState<string[]>([]);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [stabilities, setStabilities] = useState<string[]>([]);
  const [addedVersions, setAddedVersions] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>("all");
  const [deprecatedOnly, setDeprecatedOnly] = useState(false);
  const [nsFilter, setNsFilter] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);

  // Static option lists (full domain, stable order); counts come from results.
  const kindOpts = useMemo(() => options(docs, "kind", KIND_ORDER), [docs]);
  const stabilityOpts = useMemo(() => options(docs, "stability", STABILITY_ORDER), [docs]);
  const addedOpts = useMemo(
    () => options(docs, "addedVersion").reverse(), // newest first
    [docs],
  );
  const nsOpts = useMemo(() => options(docs, "namespace"), [docs]);

  useEffect(() => {
    let alive = true;
    createSearchDb(docs).then((d) => {
      if (alive) setDb(d);
    });
    return () => {
      alive = false;
    };
  }, [docs]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 150);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    if (!db) return;
    let alive = true;
    runSearch(db, {
      term: debounced,
      kinds,
      namespaces,
      stabilities,
      addedVersions,
      status,
      deprecatedOnly,
      limit: LIMIT,
    }).then((r) => {
      if (alive) setResult(r);
    });
    return () => {
      alive = false;
    };
  }, [db, debounced, kinds, namespaces, stabilities, addedVersions, status, deprecatedOnly]);

  const facets = result?.facets;
  const count = (key: FacetKey, value: string) => facets?.[key]?.[value] ?? 0;
  const visibleNs = nsFilter
    ? nsOpts.filter((n) => n.toLowerCase().includes(nsFilter.toLowerCase()))
    : nsOpts;

  const checkboxGroup = (
    title: string,
    facetKey: FacetKey,
    opts: string[],
    selected: string[],
    setSelected: (v: string[]) => void,
  ) => (
    <fieldset class="facet">
      <legend>{title}</legend>
      {opts.map((v) => (
        <label key={v} class="opt">
          <input
            type="checkbox"
            checked={selected.includes(v)}
            onChange={() => setSelected(toggle(selected, v))}
          />
          <span class="opt-label">{v}</span>
          <span class="opt-count">{count(facetKey, v)}</span>
        </label>
      ))}
    </fieldset>
  );

  return (
    <div class="search">
      <input
        class="q"
        type="search"
        placeholder="Search semantic conventions (e.g. db.query, http.request)…"
        value={term}
        onInput={(e) => setTerm((e.target as HTMLInputElement).value)}
      />

      <div class="layout">
        <aside class="facets">
          {checkboxGroup("Kind", "kind", kindOpts, kinds, setKinds)}
          {checkboxGroup("Stability", "stability", stabilityOpts, stabilities, setStabilities)}

          <fieldset class="facet">
            <legend>Status</legend>
            {(["all", "current", "removed"] as Status[]).map((s) => (
              <label key={s} class="opt">
                <input
                  type="radio"
                  name="status"
                  checked={status === s}
                  onChange={() => setStatus(s)}
                />
                <span class="opt-label">{s}</span>
              </label>
            ))}
            <label class="opt">
              <input
                type="checkbox"
                checked={deprecatedOnly}
                onChange={() => setDeprecatedOnly(!deprecatedOnly)}
              />
              <span class="opt-label">deprecated only</span>
            </label>
          </fieldset>

          {checkboxGroup("Added in", "addedVersion", addedOpts, addedVersions, setAddedVersions)}

          <fieldset class="facet">
            <legend>Namespace</legend>
            <input
              class="ns-filter"
              type="search"
              placeholder="filter namespaces…"
              value={nsFilter}
              onInput={(e) => setNsFilter((e.target as HTMLInputElement).value)}
            />
            <div class="ns-list">
              {visibleNs.map((v) => (
                <label key={v} class="opt">
                  <input
                    type="checkbox"
                    checked={namespaces.includes(v)}
                    onChange={() => setNamespaces(toggle(namespaces, v))}
                  />
                  <span class="opt-label">{v}</span>
                  <span class="opt-count">{count("namespace", v)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </aside>

        <section class="results">
          {result ? (
            <>
              <p class="summary">
                showing {result.docs.length} of {result.total}
                {result.total > result.docs.length ? ` (first ${LIMIT})` : ""}
              </p>
              <ul class="rows">
                {result.docs.map((d) => (
                  <li key={d.id}>
                    <a class="row" href={detailHref(d)}>
                      <span class="row-head">
                        <span class={`badge kind kind-${d.kind}`}>{d.kind}</span>
                        <span class={`name${d.removed ? " removed" : ""}`}>{d.name}</span>
                        {d.stability ? (
                          <span class={`badge stab stab-${d.stability}`}>{d.stability}</span>
                        ) : null}
                        {d.deprecated ? <span class="badge dep">deprecated</span> : null}
                        {d.removed ? (
                          <span class="badge rm">removed after {d.lastSeen}</span>
                        ) : (
                          <span class="since">since {d.addedVersion}</span>
                        )}
                      </span>
                      {d.brief ? <p class="brief">{d.brief}</p> : null}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p class="summary">building index…</p>
          )}
        </section>
      </div>
    </div>
  );
}
