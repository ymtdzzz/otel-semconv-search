// @ts-check
import preact from "@astrojs/preact";
import { defineConfig } from "astro/config";

// For GitHub Pages project sites, `site` and `base` are supplied via env at build
// time (see CI). Locally they default to undefined so dev/preview work without a
// base prefix.
const site = process.env.SITE;
const base = process.env.BASE_PATH;

export default defineConfig({
  ...(site ? { site } : {}),
  ...(base ? { base } : {}),
  integrations: [preact()],
});
