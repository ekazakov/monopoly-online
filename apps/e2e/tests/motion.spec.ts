import { expect, test } from "@playwright/test";
import { startTable } from "../support/game.ts";

// The other scripts run with reduced motion and with no WebGL, so this one covers the animated path
// and the real 3D board. A browser option must be at the top of a file: it needs its own worker.
test.use({
  contextOptions: { reducedMotion: "no-preference" },
  launchOptions: { args: [] },
});

test("a roll on the 3D board shows the moving token, then the next action", async ({ browser }) => {
  const { alice, bob } = await startTable(browser, "anim");
  await expect(bob.page.locator("html")).toHaveAttribute("data-motion", "full");
  await expect(bob.page.locator("canvas")).toBeVisible();
  await bob.page.getByRole("button", { name: "Roll", exact: true }).click();
  await expect(alice.page.getByText("Moving…")).toBeVisible();
  await expect(bob.page.getByRole("button", { name: /^Buy \$/ })).toBeVisible();
});
