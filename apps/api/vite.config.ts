import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    // `telemetry.ts` is a second entry: `node --import` loads it before `index.mjs`.
    entry: ["src/index.ts", "src/telemetry.ts"],
    format: ["esm"],
    platform: "node",
    dts: false,
    deps: {
      // Shared code is TypeScript source. Bundle it so dist does not import .ts files.
      alwaysBundle: ["@monopoly/shared"],
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
