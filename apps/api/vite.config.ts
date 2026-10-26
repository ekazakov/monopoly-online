import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts"],
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
