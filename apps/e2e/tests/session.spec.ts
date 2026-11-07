import { expect } from "@playwright/test";
import {
  bodyText,
  finishFromMenu,
  playBobsFirstTurn,
  playUntil,
  reopenPage,
  saveFromMenu,
  startTable,
  test,
} from "../support/game.ts";

// F3. Finish, Save and Restore, away players, and the automatic save. The grace time before a
// player counts as away is short, because the API runs with `PRESENCE_GRACE_MS`.

test("save, restore and get the same dice as before the save", async ({ browser }) => {
  const table = await startTable(browser, "save");
  const { alice, bob } = table;
  await playBobsFirstTurn(table);
  await expect(alice.page.getByText(/rolled 5 and 6/)).toBeVisible();

  await saveFromMenu(alice);
  await expect(alice.page.getByText("Game saved", { exact: true })).toBeVisible();
  await expect(bob.page.getByText(`Game saved by ${alice.name}`)).toBeVisible();
  await alice.page.getByRole("button", { name: "OK" }).click();
  await bob.page.getByRole("button", { name: "OK" }).click();

  // The owner continues from the lobby, and the other player opens the saved game from My games.
  await alice.page.getByRole("button", { name: /^Continue/ }).click();
  await bob.page.getByRole("button", { name: "Open Table save" }).click();
  await expect(bob.page.getByText("Saved", { exact: true })).toBeVisible();
  await bob.page.getByRole("button", { name: "Claim my seats" }).click();
  await alice.page.getByRole("button", { name: "Start game" }).click();
  await alice.page.waitForURL(/\/play$/);
  await bob.page.waitForURL(/\/play$/);

  // The dice carry on from the saved state: Cara rolls what the seed gives her after Bob's roll.
  await playUntil([alice, bob], async () => /Cara rolled 4 and 6/.test(await bodyText(alice.page)));
});

test("finish a game with no winner", async ({ browser }) => {
  const table = await startTable(browser, "finish");
  const { alice, bob } = table;
  await finishFromMenu(alice);
  await expect(bob.page.getByText(`Game finished by ${alice.name}`)).toBeVisible();
  for (const device of [alice, bob]) {
    await expect(device.page.getByText(/No winner/)).toBeVisible();
    const standings = device.page.getByRole("table", { name: "Final standings" });
    await expect(standings.getByRole("row")).toHaveCount(4); // the header and three players
    for (const player of [alice.name, bob.name, "Cara"]) {
      await expect(standings.getByRole("row", { name: new RegExp(player) })).toBeVisible();
    }
    await expect(standings.getByText(/winner/i)).toHaveCount(0);
  }
  await alice.page.getByRole("button", { name: "OK" }).click();
  await expect(alice.page.getByRole("button", { name: "Create game" })).toBeVisible();
});

test("a player who closes the browser goes away, the game waits, and play goes on when they return", async ({
  browser,
}) => {
  const table = await startTable(browser, "away");
  const { alice, bob } = table;
  // Bob is first, so the game waits for him.
  await expect(bob.page.getByRole("button", { name: "Roll", exact: true })).toBeVisible();
  await bob.page.close();

  // First the stream is gone and the player may still come back: reconnecting. After the grace
  // time the player is away, and the game says that it waits.
  await expect(alice.page.locator('[data-presence="reconnecting"]')).toBeVisible();
  await expect(alice.page.getByText(`Waiting for ${bob.name} to return`)).toBeVisible();
  await expect(alice.page.locator('[data-presence="away"]')).toBeVisible();

  await reopenPage(bob, table.gameUrl);
  await expect(alice.page.getByText(`Waiting for ${bob.name} to return`)).toBeHidden();
  await expect(alice.page.locator('[data-presence="away"]')).toBeHidden();
  await expect(alice.page.locator('[data-presence="online"]')).toBeVisible();
  await playBobsFirstTurn(table);
  await playUntil([alice, bob], async () => /Cara rolled/.test(await bodyText(alice.page)));
});

test("a game that nobody is in saves itself, and the owner restores it", async ({ browser }) => {
  const table = await startTable(browser, "auto");
  const { alice, bob } = table;
  await playBobsFirstTurn(table);

  await alice.page.close();
  await bob.page.close();

  // After the grace time the server saves the game. The owner opens the lobby and finds it there.
  // The API runs with a grace time of 2.5 seconds.
  await new Promise((resolve) => setTimeout(resolve, 4000));
  await reopenPage(alice, "/");
  await expect(alice.page.getByRole("button", { name: /^Continue/ })).toBeVisible();
  // Continue claims the owner's seats, so only Start game is left.
  await alice.page.getByRole("button", { name: /^Continue/ }).click();
  await alice.page.getByRole("button", { name: "Start game" }).click();
  await alice.page.waitForURL(/\/play$/);
  // The state is the one before the save: Bob still owns the street he bought.
  await expect(alice.page.getByText("1 property", { exact: true })).toBeVisible();
  await expect(
    alice.page
      .getByText("Waiting for", { exact: false })
      .or(alice.page.getByRole("button", { name: /Roll|start my turn/ }))
      .first(),
  ).toBeVisible();
});
