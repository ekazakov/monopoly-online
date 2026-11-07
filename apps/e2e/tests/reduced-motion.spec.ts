import { expect } from "@playwright/test";
import { startTable, test } from "../support/game.ts";

// The default setup of the scripts: reduced motion, and the no-WebGL board.
test("a roll on the no-WebGL board goes straight to the next action", async ({ browser }) => {
  const { bob } = await startTable(browser, "still");
  await expect(bob.page.locator("html")).toHaveAttribute("data-motion", "reduce");
  await expect(bob.page.locator("canvas")).toHaveCount(0);
  await bob.page.getByRole("button", { name: "Roll", exact: true }).click();
  await expect(bob.page.getByRole("button", { name: /^Buy \$/ })).toBeVisible();
  await expect(bob.page.getByText("Moving…")).toBeHidden();
});
