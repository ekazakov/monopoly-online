import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: ["design/**", "plan/**", ".claude/**", ".history/**", "artifacts/**"],
  },
  lint: {
    ignorePatterns: ["design/**", ".history/**", "artifacts/**", "**/dist/**"],
    plugins: ["typescript"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        files: ["apps/web/**"],
        plugins: ["react"],
      },
      {
        files: ["apps/api/**"],
        env: { node: true },
      },
      {
        files: ["**/*.test.ts", "**/*.test.tsx"],
        plugins: ["vitest"],
      },
    ],
  },
  run: {
    cache: true,
  },
});
