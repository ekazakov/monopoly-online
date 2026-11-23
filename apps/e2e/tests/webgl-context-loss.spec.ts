import { expect, type Page } from "@playwright/test";
import { startTable, test } from "../support/game.ts";

// Repro for BUG-21. Like motion.spec.ts, this runs with the real 3D board: reduced motion is off and
// no browser flag disables WebGL. The test forces a WebGL context loss and restore on the board canvas,
// then checks that the board is drawn again and the tokens keep their color.
test.use({
  contextOptions: { reducedMotion: "no-preference" },
  launchOptions: { args: [] },
});

interface BoardSample {
  total: number;
  /** Pixels with some brightness: the board and the tokens are drawn. */
  drawn: number;
  /** Pixels with clear color (max channel minus min channel above 40): colored board and tokens. */
  colorful: number;
}

/** Read the board canvas as a PNG, then count pixels in a 2D canvas (the WebGL buffer is not read directly). */
async function sampleBoard(page: Page): Promise<BoardSample> {
  const png = await page.locator("canvas").screenshot();
  return page.evaluate(async (base64: string) => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64}`;
    await img.decode();
    const work = document.createElement("canvas");
    work.width = img.width;
    work.height = img.height;
    const ctx = work.getContext("2d");
    if (!ctx) throw new Error("no 2D context");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, work.width, work.height).data;
    let total = 0;
    let drawn = 0;
    let colorful = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      total += 1;
      if (max > 30) drawn += 1;
      if (max - min > 40) colorful += 1;
    }
    return { total, drawn, colorful };
  }, png.toString("base64"));
}

test("the board and the tokens draw again after a WebGL context loss", async ({ browser }) => {
  const { bob } = await startTable(browser, "ctxloss");
  const { page } = bob;
  await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
  await expect(page.locator("canvas")).toBeVisible();

  let before: BoardSample = { total: 0, drawn: 0, colorful: 0 };
  await expect
    .poll(async () => {
      before = await sampleBoard(page);
      return before.colorful;
    })
    .toBeGreaterThan(0);

  // Force the loss and the restore on the same context that three.js uses.
  const events = await page.evaluate(async () => {
    const canvas = document.querySelector("canvas");
    if (!canvas) throw new Error("no board canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) throw new Error("no WebGL context on the board canvas");
    const ext = gl.getExtension("WEBGL_lose_context");
    if (!ext) throw new Error("WEBGL_lose_context is not available");
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const log: string[] = [];
    canvas.addEventListener("webglcontextlost", () => log.push("lost"));
    const restored = new Promise<void>((resolve) =>
      canvas.addEventListener(
        "webglcontextrestored",
        () => {
          log.push("restored");
          resolve();
        },
        { once: true },
      ),
    );
    ext.loseContext();
    await sleep(500);
    ext.restoreContext();
    await Promise.race([restored, sleep(5000)]);
    // Give the app time to render a frame after the restore, if it does.
    await sleep(1500);
    return log;
  });
  expect(events, "the context was lost and restored").toEqual(["lost", "restored"]);

  const after = await sampleBoard(page);

  const context = `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`;
  expect(after.drawn, `board is drawn after restore (${context})`).toBeGreaterThan(
    before.drawn * 0.5,
  );
  expect(after.colorful, `tokens keep their color after restore (${context})`).toBeGreaterThan(
    before.colorful * 0.5,
  );
});
