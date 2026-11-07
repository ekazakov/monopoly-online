import { expect } from "@playwright/test";
import { debugEdit, startGame } from "../support/api.ts";
import { test } from "../support/game.ts";

test("T17: bankruptcy shows the same winner and standings on both devices after reload", async ({
  browser,
}) => {
  const table = await startGame(browser, "Bankruptcy", { hotSeat: false });
  const { alice, bob, seats } = table;
  await debugEdit(table, [
    { kind: "position", targetId: seats.bob.id, square: 29 },
    { kind: "cash", targetId: seats.bob.id, cash: 10 },
  ]);
  await bob.page.getByRole("button", { name: "Roll", exact: true }).click();

  for (const device of [alice, bob]) {
    for (const reload of [false, true]) {
      if (reload) await device.page.reload();
      await expect(
        device.page.getByRole("heading", { name: `${alice.name} wins`, exact: true }),
      ).toBeVisible();
      const standings = device.page.getByRole("table", { name: "Final standings" });
      await expect(standings.getByRole("row")).toHaveCount(3);
      const winner = standings.getByRole("row").filter({ hasText: alice.name });
      const bankrupt = standings.getByRole("row").filter({ hasText: bob.name });
      await expect(winner.getByRole("rowheader")).toHaveText("1");
      await expect(winner).toContainText("Winner");
      await expect(winner).toContainText("$1,500");
      await expect(bankrupt.getByRole("rowheader")).toHaveText("2");
      await expect(bankrupt).toContainText("Bankrupt");
      await expect(device.page.getByRole("button", { name: "Roll", exact: true })).toHaveCount(0);
    }
  }
});
