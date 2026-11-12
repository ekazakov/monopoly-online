import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { contrastRatio } from "../../../scene/colors.ts";

const css = readFileSync(join(import.meta.dirname, "GameLog.css"), "utf8");
const tokens = readFileSync(join(import.meta.dirname, "../../../styles/tokens.css"), "utf8");

/** The `--log-*` colours: dark before the light theme rule, light inside it. */
function logColors(block: number): Record<string, string> {
  const blocks = css.split(/:root\[data-theme="light"\] \.game-log \{/);
  const text = block === 0 ? blocks[0]! : blocks[1]!.split("}")[0]!;
  return Object.fromEntries(
    [...text.matchAll(/--(log-[a-z-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1]!, m[2]!]),
  );
}

const logBar = [...tokens.matchAll(/--hf-panel-log:\s*(#[0-9a-f]{6})/g)].map((m) => m[1]!);

describe("game log colours", () => {
  test.each([
    ["dark", 0],
    ["light", 1],
  ] as const)("every tone and name reads on the %s log bar", (_, i) => {
    const colors = logColors(i);
    expect(Object.keys(colors)).toHaveLength(9);
    // the names stay in the result, so a failure says which colour is too pale
    const pale = Object.entries(colors).filter(([, hex]) => contrastRatio(hex, logBar[i]!) < 4.5);
    expect(pale).toEqual([]);
  });
});
