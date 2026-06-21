import type { ComponentChildren } from "preact";
import { useMemo, useState } from "preact/hooks";
import dataset from "../data/semconv.json";
import { computeDiff } from "../lib/diff.ts";
import type { Dataset } from "../lib/types.ts";

const data = dataset as unknown as Dataset;
const BASE = import.meta.env.BASE_URL;
const BASE_SLASH = BASE.endsWith("/") ? BASE : `${BASE}/`;
const V = data.versions;
const latest = V[V.length - 1] ?? "";

const entitySet = new Set(data.entities.map((e) => `${e.kind}:${e.name}`));

const KIND_LABEL: Record<string, string> = {
  attribute: "Attribute",
  metric: "Metric",
  event: "Event",
  span: "Span",
  entity: "Entity",
};

function entityHref(kind: string, name: string) {
  return `${BASE_SLASH}${kind}/${name}/`;
}

function EntityLink({ kind, name }: { kind: string; name: string }) {
  if (entitySet.has(`${kind}:${name}`)) {
    return (
      <a href={entityHref(kind, name)}>
        <code>{name}</code>
      </a>
    );
  }
  return <code>{name}</code>;
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ComponentChildren;
}) {
  return (
    <section class="diff-section">
      <h2>
        {title} <span class="diff-count">({count})</span>
      </h2>
      {count === 0 ? <p class="diff-none">None in this range.</p> : <ul>{children}</ul>}
    </section>
  );
}

export default function Diff() {
  const [from, setFrom] = useState(V[Math.max(0, V.length - 2)] ?? "");
  const [to, setTo] = useState(latest);

  const result = useMemo(() => computeDiff(data, from, to), [from, to]);

  return (
    <div>
      <div class="diff-controls">
        <label>
          From{" "}
          <select value={from} onChange={(e) => setFrom((e.target as HTMLSelectElement).value)}>
            {V.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <span class="diff-arrow">→</span>
        <label>
          To{" "}
          <select value={to} onChange={(e) => setTo((e.target as HTMLSelectElement).value)}>
            {V.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!result ? (
        <p class="diff-hint">Pick a "from" version earlier than the "to" version.</p>
      ) : (
        <div class="diff-sections">
          <Section title="Added" count={result.added.length}>
            {result.added.map((e) => (
              <li key={`${e.kind}:${e.name}`}>
                <EntityLink kind={e.kind} name={e.name} />
                <span class="diff-meta">
                  {KIND_LABEL[e.kind]} · {e.presence[0]?.from}
                </span>
              </li>
            ))}
          </Section>

          <Section title="Removed" count={result.removed.length}>
            {result.removed.map((e) => (
              <li key={`${e.kind}:${e.name}`}>
                <EntityLink kind={e.kind} name={e.name} />
                <span class="diff-meta">
                  {KIND_LABEL[e.kind]} · last seen {e.presence.at(-1)?.to}
                </span>
              </li>
            ))}
          </Section>

          <Section title="Renamed" count={result.renamed.length}>
            {result.renamed.map((r, i) => (
              <li key={i}>
                <EntityLink kind={r.kind} name={r.from} />
                <span class="diff-arrow">→</span>
                <EntityLink kind={r.kind} name={r.to} />
                <span class="diff-meta">{r.version}</span>
              </li>
            ))}
          </Section>

          <Section title="Stability changed" count={result.stabilityChanges.length}>
            {result.stabilityChanges.map((s, i) => (
              <li key={i}>
                <EntityLink kind={s.kind} name={s.name} />
                <span class="diff-meta">
                  {s.prev} → {s.next} · {s.version}
                </span>
              </li>
            ))}
          </Section>

          <Section title="Deprecated" count={result.deprecated.length}>
            {result.deprecated.map((e) => (
              <li key={`${e.kind}:${e.name}`}>
                <EntityLink kind={e.kind} name={e.name} />
                <span class="diff-meta">{KIND_LABEL[e.kind]}</span>
              </li>
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}
