import { defineConfig } from "vite-plus";
import type { OxfmtConfig } from "vite-plus/fmt";
import type { OxlintConfig } from "vite-plus/lint";

// The format and lint configurations are in .oxfmtrc.json and .oxlintrc.json,
// so the Oxc IDE plugins can read them with plain oxfmt and oxlint.
import fmtConfig from "./.oxfmtrc.json" with { type: "json" };
import lintConfig from "./.oxlintrc.json" with { type: "json" };

// JSON imports widen string literals, so assert the configuration types.
const fmt = fmtConfig as OxfmtConfig;
const lint = lintConfig as OxlintConfig;

export default defineConfig({
  fmt,
  lint,
  run: {
    cache: true,
  },
});
