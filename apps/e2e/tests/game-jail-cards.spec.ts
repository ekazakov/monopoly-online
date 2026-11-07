import { expect } from "@playwright/test";
import { debugEdit, playRolls, readState, sendAction, startGame } from "../support/api.ts";
import { test } from "../support/game.ts";

test("T12: Go to Jail holds the player until their next turn, when they pay the fine", async ({
  browser,
}) => {
  const table = await startGame(browser, "Jail");
  const { alice, bob, seats } = table;
  await debugEdit(table, [{ kind: "position", targetId: seats.bob.id, square: 19 }]);
  await bob.page.getByRole("button", { name: "Roll", exact: true }).click();
  for (const device of [alice, bob]) {
    await expect(device.page.getByRole("log", { name: "Game log" })).toContainText(
      `${bob.name} was sent to jail.`,
    );
  }
  // Cara visits Jail, then Alice buys Lantern Row. These are real turns, with no state injection.
  await sendAction(table, { type: "RollDice" });
  await sendAction(table, { type: "EndTurn" });
  await sendAction(table, { type: "RollDice" });
  await sendAction(table, { type: "BuyProperty" });
  await sendAction(table, { type: "EndTurn" });
  await expect(bob.page.getByRole("button", { name: "Pay $50", exact: true })).toBeVisible();
  await bob.page.getByRole("button", { name: "Pay $50", exact: true }).click();
  await expect(bob.page.getByRole("button", { name: "Roll", exact: true })).toBeVisible();
  for (const device of [alice, bob]) {
    const row = device.page.locator(".player-row").filter({ hasText: bob.name });
    await expect(row).toContainText("$1,450");
    await expect(row).not.toContainText("In jail");
    await expect(device.page.getByRole("log", { name: "Game log" })).toContainText(
      `${bob.name} paid the $50 jail fine.`,
    );
  }
});

for (const card of [
  { deck: "Chance", label: "Chance card", square: 11, title: "Loan matures", cash: "$1,650" },
  { deck: "Chest", label: "Community Chest card", square: 6, title: "Tax refund", cash: "$1,520" },
]) {
  test(`T13: a ${card.deck} card and its cash change reach both devices`, async ({ browser }) => {
    const table = await startGame(browser, `${card.deck} card`);
    const { alice, bob, seats } = table;
    await debugEdit(table, [{ kind: "position", targetId: seats.bob.id, square: card.square }]);
    await bob.page.getByRole("button", { name: "Roll", exact: true }).click();
    for (const device of [alice, bob]) {
      await expect(device.page.getByRole("group", { name: card.label, exact: true })).toContainText(
        card.title,
      );
      await expect(device.page.locator(".player-row").filter({ hasText: bob.name })).toContainText(
        card.cash,
      );
      await expect(device.page.getByRole("log", { name: "Game log" })).toContainText(
        `drew a ${card.deck} card: ${card.title}.`,
      );
    }
    await alice.page.getByRole("button", { name: "OK", exact: true }).click();
    await expect(alice.page.getByRole("group", { name: card.label, exact: true })).toHaveCount(0);
    await expect(bob.page.getByRole("group", { name: card.label, exact: true })).toBeVisible();
    await bob.page.getByRole("button", { name: "OK", exact: true }).click();
    await expect(bob.page.getByRole("button", { name: "Next turn", exact: true })).toBeVisible();
  });
}

test("T14: the seventh seeded roll is doubles and the same player can roll again", async ({
  browser,
}) => {
  const table = await startGame(browser, "Doubles");
  const { alice, bob, seats } = table;
  expect(await playRolls(table, 6)).toEqual([
    [5, 6],
    [4, 6],
    [5, 1],
    [2, 3],
    [3, 1],
    [1, 5],
  ]);
  await bob.page.getByRole("button", { name: "Roll", exact: true }).click();
  for (const device of [alice, bob]) {
    await expect(device.page.getByRole("log", { name: "Game log" })).toContainText(
      `${bob.name} rolled 3 and 3 (doubles).`,
    );
    await expect(
      device.page.getByRole("group", { name: "Chance card", exact: true }),
    ).toBeVisible();
    await device.page.getByRole("button", { name: "OK", exact: true }).click();
  }
  await expect(bob.page.getByRole("button", { name: "Roll again", exact: true })).toBeEnabled();
  await expect(alice.page.getByRole("region", { name: "Turn actions" })).toContainText(
    `Waiting for ${bob.name}`,
  );
  const state = await readState(table);
  expect(state.turn).toMatchObject({
    currentPlayerId: seats.bob.id,
    phase: "awaiting_roll",
    doubles: 1,
    dice: [3, 3],
  });
});
