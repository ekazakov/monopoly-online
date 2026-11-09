import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    // `telemetry.ts` is a second entry: `node --import` loads it before `index.mjs`.
    entry: ["src/index.ts", "src/telemetry.ts"],
    format: ["esm"],
    platform: "node",
    dts: false,
    deps: {
      // The workspace packages are TypeScript source. Bundle them so dist does not import .ts
      // files: Node does not strip types in `node_modules`, where `pnpm deploy` puts them.
      alwaysBundle: ["@monopoly/shared", "@monopoly/game-engine"],
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
