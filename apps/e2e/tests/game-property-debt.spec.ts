import { expect } from "@playwright/test";
import { debugEdit, startGame } from "../support/api.ts";
import { test } from "../support/game.ts";

test("T15: building and mortgaging through the hand update the deed, cash and both logs", async ({
  browser,
}) => {
  const table = await startGame(browser, "Property actions");
  const { alice, bob, seats } = table;
  await debugEdit(
    table,
    [1, 3, 39].map((square) => ({
      kind: "deed",
      square,
      ownerId: seats.bob.id,
      houses: 0,
      mortgaged: false,
    })),
  );
  await bob.page
    .getByRole("button", { name: new RegExp(`^${bob.name}'s properties, 3 properties`) })
    .click();
  await bob.page
    .getByRole("group", { name: "Driftwood Lane actions" })
    .getByRole("button", { name: /^Build \$50$/ })
    .click();
  await expect(
    bob.page.getByRole("group", { name: /^Driftwood Lane, \$60, 1 house,/ }),
  ).toBeVisible();
  await bob.page
    .getByRole("group", { name: "Grand Pier actions" })
    .getByRole("button", { name: /^Mortgage \+\$200$/ })
    .click();
  await expect(
    bob.page.getByRole("group", { name: /^Grand Pier, \$400, mortgaged,/ }),
  ).toBeVisible();
  for (const device of [alice, bob]) {
    await expect(device.page.locator(".player-row").filter({ hasText: bob.name })).toContainText(
      "$1,650",
    );
    const log = device.page.getByRole("log", { name: "Game log" });
    await expect(log).toContainText(`${bob.name} built a house on Driftwood Lane for $50.`);
    await expect(log).toContainText(`${bob.name} mortgaged Grand Pier for $200.`);
  }
});

test("T16: a player raises cash with a mortgage, pays the debt and continues the game", async ({
  browser,
}) => {
  const table = await startGame(browser, "Debt");
  const { alice, bob, seats } = table;
  await debugEdit(table, [
    { kind: "position", targetId: seats.bob.id, square: 27 },
    { kind: "cash", targetId: seats.bob.id, cash: 10 },
    { kind: "deed", square: 39, ownerId: seats.bob.id, houses: 0, mortgaged: false },
  ]);
  await bob.page.getByRole("button", { name: "Roll", exact: true }).click();
  const turn = bob.page.getByRole("region", { name: "Turn actions", exact: true });
  await expect(turn).toContainText("Still short by $90");
  await expect(turn.getByRole("button", { name: "Pay $100", exact: true })).toBeDisabled();
  await expect(alice.page.getByRole("region", { name: "Turn actions" })).toContainText(
    `Waiting for ${bob.name} to settle a debt`,
  );
  await turn.getByRole("button", { name: "Mortgage Grand Pier for $200", exact: true }).click();
  await expect(turn).toContainText("Your cash covers it");
  await turn.getByRole("button", { name: "Pay $100", exact: true }).click();
  await expect(bob.page.getByRole("button", { name: "Next turn", exact: true })).toBeVisible();
  for (const device of [alice, bob]) {
    await expect(device.page.locator(".player-row").filter({ hasText: bob.name })).toContainText(
      "$110",
    );
    await expect(device.page.getByRole("log", { name: "Game log" })).toContainText(
      `${bob.name} paid a $100 debt to the bank.`,
    );
  }
  await expect(
    bob.page.getByRole("group", { name: /^Grand Pier, \$400, mortgaged,/ }),
  ).toBeVisible();
  await bob.page.getByRole("button", { name: "Next turn", exact: true }).click();
  await expect(bob.page.getByRole("log", { name: "Game log" })).toContainText(
    `${bob.name} ended the turn. Cara is next.`,
  );
});
