import { defineConfig } from "vitest/config";

export default defineConfig({
  // Component tests are .tsx and use preact's automatic JSX runtime.
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
  test: {
    include: ["{src,scripts}/**/*.test.{ts,tsx}"],
    // Default to node; DOM-dependent files opt into happy-dom via a
    // `// @vitest-environment happy-dom` docblock.
    environment: "node",
  },
});
