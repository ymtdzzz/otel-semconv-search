/**
 * build-data.ts — entry point: read resolved snapshots, build the enriched
 * Dataset, write it to $OUT. Pure transform logic lives in ./build/*; this file
 * is just IO. No git/weaver/network.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Dataset } from "../src/lib/types.ts";
import { buildEntities } from "./build/aggregate.ts";
import type { ResolvedGroup } from "./build/extract.ts";
import { cmpSemver } from "./build/semver.ts";

const RESOLVED_DIR = process.env.RESOLVED_DIR ?? join(process.cwd(), "data/resolved");
const OUT = process.env.OUT ?? join(process.cwd(), "src/data/semconv.json");

function readWeaverVersion(): string {
  try {
    const p = JSON.parse(readFileSync(join(RESOLVED_DIR, "provenance.json"), "utf8"));
    return typeof p.weaverVersion === "string" ? p.weaverVersion : "unknown";
  } catch {
    return "unknown";
  }
}

function main(): void {
  const versions = readdirSync(RESOLVED_DIR)
    .filter((f) => /^\d+\.\d+\.\d+\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""))
    .sort(cmpSemver);
  if (versions.length === 0)
    throw new Error(`no resolved snapshots in ${RESOLVED_DIR} (run \`pnpm resolve\`)`);

  const snapshots = versions.map((version) => {
    const doc = JSON.parse(readFileSync(join(RESOLVED_DIR, `${version}.json`), "utf8")) as {
      groups?: ResolvedGroup[];
    };
    return { version, groups: doc.groups ?? [] };
  });

  const entities = buildEntities(snapshots);
  const dataset: Dataset = {
    versions,
    floor: versions[0],
    weaverVersion: readWeaverVersion(),
    generatedAt: new Date().toISOString(),
    entities,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(dataset, null, 2));

  const counts = entities.reduce<Record<string, number>>((acc, e) => {
    acc[e.kind] = (acc[e.kind] ?? 0) + 1;
    return acc;
  }, {});
  const deprecated = entities.filter((e) => e.deprecated).length;
  console.error(
    `build-data: ${entities.length} entities -> ${OUT}\n` +
      `  ${Object.entries(counts)
        .map(([k, n]) => `${k}=${n}`)
        .join(" ")} deprecated=${deprecated}\n` +
      `  versions=${versions.length} (${versions[0]}..${versions.at(-1)}) weaver=${dataset.weaverVersion}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
