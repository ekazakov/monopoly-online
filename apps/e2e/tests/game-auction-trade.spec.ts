import { expect } from "@playwright/test";
import { playRolls, startGame } from "../support/api.ts";
import { test } from "../support/game.ts";

test("T10: bids cross devices and the winner pays for the auctioned deed", async ({ browser }) => {
  const table = await startGame(browser, "Auction", { hotSeat: false });
  const { alice, bob } = table;
  await playRolls(table, 3);
  // With two seats, Alice's second roll is 1,2 from Jail to the unowned Rope Walk.
  await alice.page.getByRole("button", { name: "Roll", exact: true }).click();
  await alice.page.getByRole("button", { name: "Auction", exact: true }).click();
  for (const device of [alice, bob]) {
    await expect(device.page.getByRole("region", { name: "Turn actions" })).toContainText(
      "Auction: Rope Walk",
    );
  }
  await alice.page.getByRole("button", { name: "Bid $10", exact: true }).click();
  // The bidder has the auction in a dialog. The other device follows it in the board centre.
  await expect(bob.page.getByRole("dialog", { name: "Auction" })).toContainText(`by ${alice.name}`);
  await expect(alice.page.getByRole("region", { name: "Turn actions" })).toContainText(
    "Auction: Rope Walk",
  );
  await bob.page.getByRole("button", { name: "Bid $20", exact: true }).click();
  await expect(alice.page.getByRole("dialog", { name: "Auction" })).toContainText(`by ${bob.name}`);
  await alice.page.getByRole("button", { name: "Bid $30", exact: true }).click();
  await bob.page.getByRole("button", { name: "Pass", exact: true }).click();

  for (const device of [alice, bob]) {
    await expect(device.page.getByRole("log", { name: "Game log" })).toContainText(
      `${alice.name} won Rope Walk at auction for $30.`,
    );
    const winner = device.page.locator(".player-row").filter({ hasText: alice.name });
    await expect(winner).toContainText("$1,470");
    await expect(winner).toContainText("1 property");
  }
  await alice.page
    .getByRole("button", { name: new RegExp(`^${alice.name}'s properties,`) })
    .click();
  await expect(alice.page.getByRole("button", { name: /^Rope Walk, \$140,/ })).toBeVisible();
});

test("T11: a trade on one device shows the offer to the recipient at once, with no pass step", async ({
  browser,
}) => {
  const table = await startGame(browser, "Hot-seat trade");
  const { alice, bob } = table;
  await playRolls(table, 5);
  await alice.page.getByRole("button", { name: "Trade", exact: true }).click();
  await alice.page.getByRole("radio", { name: "Cara", exact: true }).check();
  await alice.page
    .getByRole("region", { name: `${alice.name} gives`, exact: true })
    .getByRole("checkbox", { name: /^Lantern Row/ })
    .check();
  await alice.page.getByLabel("Cash from Cara", { exact: true }).fill("25");
  await alice.page.getByRole("button", { name: "Propose", exact: true }).click();

  // Spec 5.3: no pass-the-device step. The recipient is a seat of this device, so the offer and the
  // hand show at once, and no dialog asks to pass the device.
  await expect(alice.page.getByRole("dialog", { name: /Pass to/ })).toHaveCount(0);
  await expect(
    alice.page.getByRole("heading", { name: `Trade offer from ${alice.name}`, exact: true }),
  ).toBeVisible();
  await alice.page.getByRole("button", { name: "Accept", exact: true }).click();

  for (const device of [alice, bob]) {
    await expect(device.page.getByRole("log", { name: "Game log" })).toContainText(
      `Cara accepted the trade from ${alice.name}.`,
    );
    const owner = device.page.locator(".player-row").filter({ hasText: alice.name });
    const cara = device.page.locator(".player-row").filter({ hasText: "Cara" });
    await expect(owner).toContainText("$1,425");
    await expect(owner).toContainText("0 properties");
    await expect(cara).toContainText("$1,315");
    await expect(cara).toContainText("2 properties");
  }
});
