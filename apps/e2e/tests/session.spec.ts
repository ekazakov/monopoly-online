import { expect } from "@playwright/test";
import { playRolls, readGame, readState, startGame } from "../support/api.ts";
import {
  bodyText,
  finishFromMenu,
  playBobsFirstTurn,
  playUntil,
  reopenPage,
  saveFromMenu,
  test,
} from "../support/game.ts";

// Session and resilience: real API setup, with UI actions and a short presence grace time.

test("T22: a mid-turn save discards the roll and purchase, then restore gives the same dice", async ({
  browser,
}) => {
  const table = await startGame(browser, "Mid-turn save");
  const { alice, bob } = table;
  await bob.page.getByRole("button", { name: "Roll", exact: true }).click();
  await bob.page.getByRole("button", { name: /^Buy \$/ }).click();
  await expect(bob.page.getByRole("button", { name: "Next turn", exact: true })).toBeVisible();
  await expect(bob.page.locator(".player-row").filter({ hasText: bob.name })).toContainText(
    "$1,360",
  );
  const beforeSave = await readState(table);

  await saveFromMenu(alice);
  await expect(alice.page.getByText("Game saved", { exact: true })).toBeVisible();
  await expect(bob.page.getByText(`Game saved by ${alice.name}`)).toBeVisible();
  await alice.page.getByRole("button", { name: "OK" }).click();
  await bob.page.getByRole("button", { name: "OK" }).click();

  // The owner continues from the lobby, and the other player opens the saved game from My games.
  await alice.page
    .getByRole("button", { name: `Continue ${table.game.name}`, exact: true })
    .click();
  await bob.page.getByRole("button", { name: `Open ${table.game.name}`, exact: true }).click();
  await expect(bob.page.getByText("Saved", { exact: true })).toBeVisible();
  await bob.page.getByRole("button", { name: "Claim my seats" }).click();
  await alice.page.getByRole("button", { name: "Start game" }).click();
  await alice.page.waitForURL(/\/play$/);
  await bob.page.waitForURL(/\/play$/);

  // The purchase and roll were in the discarded turn. The version still goes forward.
  const restored = await readState(table);
  expect(restored.version).toBeGreaterThan(beforeSave.version);
  expect(restored.ownership).toEqual({});
  for (const device of [alice, bob]) {
    const row = device.page.locator(".player-row").filter({ hasText: bob.name });
    await expect(row).toContainText("$1,500");
    await expect(row).toContainText("0 properties");
  }
  await playBobsFirstTurn(table);
  for (const device of [alice, bob]) {
    await expect(device.page.getByRole("log", { name: "Game log" })).toContainText(
      `${bob.name} rolled 5 and 6.`,
    );
  }
  // The next turn also keeps the next roll of the seed.
  await playUntil([alice, bob], async () => /Cara rolled 4 and 6/.test(await bodyText(alice.page)));
});

test("T23: finish a game with no winner", async ({ browser }) => {
  const table = await startGame(browser, "Finish");
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

test("T24: an away player waits, the owner can save or finish, and play resumes on return", async ({
  browser,
}) => {
  const table = await startGame(browser, "Away");
  const { alice, bob } = table;
  // Bob is first, so the game waits for him.
  await expect(bob.page.getByRole("button", { name: "Roll", exact: true })).toBeVisible();
  await bob.page.close();

  // First the stream is gone and the player may still come back: reconnecting. After the grace
  // time the player is away, and the game says that it waits.
  await expect(alice.page.locator('[data-presence="reconnecting"]')).toBeVisible();
  await expect(alice.page.getByText(`Waiting for ${bob.name} to return`)).toBeVisible();
  await expect(alice.page.locator('[data-presence="away"]')).toBeVisible();
  await alice.page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(
    alice.page.getByRole("button", { name: "Save and exit", exact: true }),
  ).toBeVisible();
  await expect(alice.page.getByRole("button", { name: "Finish game", exact: true })).toBeVisible();
  await alice.page.getByRole("button", { name: "Menu", exact: true }).click();

  await reopenPage(bob, table.gameUrl);
  await expect(alice.page.getByText(`Waiting for ${bob.name} to return`)).toBeHidden();
  await expect(alice.page.locator('[data-presence="away"]')).toBeHidden();
  await expect(alice.page.locator('[data-presence="online"]')).toBeVisible();
  await playBobsFirstTurn(table);
  await playUntil([alice, bob], async () => /Cara rolled/.test(await bodyText(alice.page)));
});

test("T25: automatic save restores the purchased deed and the next seeded roll", async ({
  browser,
}) => {
  const table = await startGame(browser, "Automatic save");
  const { alice, bob } = table;
  await playBobsFirstTurn(table);

  await alice.page.close();
  await bob.page.close();

  // Poll through the signed-in context while both pages are closed. No fixed sleep is needed.
  await expect.poll(async () => (await readGame(table)).status).toBe("saved");
  await reopenPage(alice, "/");
  const resume = alice.page.getByRole("button", {
    name: `Continue ${table.game.name}`,
    exact: true,
  });
  await expect(resume).toBeVisible();
  // Continue claims the owner's seats, so only Start game is left.
  await resume.click();
  await alice.page.getByRole("button", { name: "Start game" }).click();
  await alice.page.waitForURL(/\/play$/);
  // The state is the one before the save: Bob still owns the street he bought.
  await expect(alice.page.getByText("1 property", { exact: true })).toBeVisible();
  await alice.page.getByRole("button", { name: "Roll", exact: true }).click();
  await expect(alice.page.getByRole("log", { name: "Game log" })).toContainText(
    "Cara rolled 4 and 6.",
  );
});

test("T23: finishing during an auction rolls back the unfinished turn on both devices", async ({
  browser,
}) => {
  const table = await startGame(browser, "Finish auction");
  const { alice, bob } = table;
  await bob.page.getByRole("button", { name: "Roll", exact: true }).click();
  await bob.page.getByRole("button", { name: "Auction", exact: true }).click();
  for (const device of [alice, bob]) {
    await expect(device.page.getByRole("region", { name: "Turn actions" })).toContainText(
      "Auction: Anchor Street",
    );
  }
  await finishFromMenu(alice);
  for (const device of [alice, bob]) {
    await expect(device.page.getByText(/^No winner\./)).toBeVisible();
    const standings = device.page.getByRole("table", { name: "Final standings" });
    await expect(standings.getByRole("row")).toHaveCount(4);
    await expect(standings.getByRole("row").filter({ hasText: bob.name })).toContainText("$1,500");
    await expect(device.page.getByRole("list", { name: "Bidders" })).toHaveCount(0);
    await device.page.reload();
    await expect(device.page.getByText(`Game finished by ${alice.name}`)).toBeVisible();
    await expect(standings.getByRole("row")).toHaveCount(4);
  }
  const state = await readState(table);
  expect(state.auction).toBeNull();
  expect(state.ownership).toEqual({});
});

test("T23: the owner finishes a saved game from its lobby row", async ({ browser }) => {
  const table = await startGame(browser, "Finish saved");
  const { alice, bob } = table;
  await playBobsFirstTurn(table);
  await saveFromMenu(alice);
  for (const device of [alice, bob]) {
    await device.page.getByRole("button", { name: "OK", exact: true }).click();
  }
  const row = alice.page
    .getByRole("list", { name: "Saved games", exact: true })
    .getByRole("listitem")
    .filter({ hasText: table.game.name });
  await row.getByRole("button", { name: `Finish ${table.game.name}`, exact: true }).click();
  await row.getByRole("button", { name: "Finish game", exact: true }).click();
  await expect(row).toHaveCount(0);
  for (const device of [alice, bob]) {
    await device.page.goto(table.gameUrl);
    await expect(device.page.getByText(`Game finished by ${alice.name}`)).toBeVisible();
    await expect(device.page.getByText(/^No winner\./)).toBeVisible();
    const standings = device.page.getByRole("table", { name: "Final standings" });
    await expect(standings.getByRole("row")).toHaveCount(4);
    await expect(standings.getByRole("row").filter({ hasText: bob.name })).toContainText("$1,360");
  }
  expect((await readGame(table)).status).toBe("finished");
});

test("T20: reload in mid-turn keeps cash, the deed and phase, and the next action still works", async ({
  browser,
}) => {
  const table = await startGame(browser, "Reload");
  const { alice, bob } = table;
  await bob.page.getByRole("button", { name: "Roll", exact: true }).click();
  await bob.page.getByRole("button", { name: /^Buy \$/ }).click();
  await expect(bob.page.getByRole("button", { name: "Next turn", exact: true })).toBeVisible();
  const beforeReload = await readState(table);
  await bob.page.reload();
  await expect(bob.page.getByRole("button", { name: "Next turn", exact: true })).toBeEnabled();
  expect(await readState(table)).toEqual(beforeReload);
  const row = bob.page.locator(".player-row").filter({ hasText: bob.name });
  await expect(row).toContainText("$1,360");
  await expect(row).toContainText("1 property");
  await bob.page
    .getByRole("button", { name: new RegExp(`^${bob.name}'s properties, 1 property,`) })
    .click();
  await expect(bob.page.getByRole("button", { name: /^Anchor Street, \$140,/ })).toBeVisible();
  await bob.page.getByRole("button", { name: "Next turn", exact: true }).click();
  for (const device of [alice, bob]) {
    await expect(device.page.getByRole("log", { name: "Game log" })).toContainText(
      `${bob.name} ended the turn. Cara is next.`,
    );
  }
  await expect(alice.page.getByRole("button", { name: "Roll", exact: true })).toBeEnabled();
});

test("T21: a disconnected stream resumes missed actions and catches up without a reload", async ({
  browser,
}) => {
  const table = await startGame(browser, "Missed actions");
  const { alice, bob } = table;
  await playRolls(table, 1);
  const beforeDisconnect = await readState(table);
  const bobOnAlice = alice.page.locator(".player-row").filter({ hasText: bob.name });
  await expect(bobOnAlice.locator('[data-presence="online"]')).toBeVisible();
  await expect(bob.page.getByRole("log", { name: "Game log" })).toContainText(
    `${bob.name} ended the turn. Cara is next.`,
  );

  // Chromium's setOffline does not close an existing EventSource. Stop the real browser
  // request and block its retries instead, keeping the page and store for the resume.
  const streamPattern = "**/api/stream?**";
  await bob.page.route(streamPattern, (route) => route.abort("internetdisconnected"));
  await bob.page.evaluate(() => window.stop());
  await expect(bobOnAlice.locator('[data-presence="away"]')).toBeVisible();

  await alice.page.getByRole("button", { name: "Roll", exact: true }).click();
  await alice.page.getByRole("button", { name: "Next turn", exact: true }).click();
  await alice.page
    .getByRole("button", { name: `I’m ${alice.name}, start my turn`, exact: true })
    .click();
  await alice.page.getByRole("button", { name: "Roll", exact: true }).click();
  await alice.page.getByRole("button", { name: /^Buy \$/ }).click();
  await alice.page.getByRole("button", { name: "Next turn", exact: true }).click();
  const missedPurchase = `${alice.name} bought Lantern Row for $100.`;
  await expect(alice.page.getByRole("log", { name: "Game log" })).toContainText(missedPurchase);
  const staleOwner = bob.page.locator(".player-row").filter({ hasText: alice.name });
  await expect(staleOwner).toContainText("$1,500");
  await expect(staleOwner).toContainText("0 properties");
  await expect(bob.page.getByRole("log", { name: "Game log" })).not.toContainText(missedPurchase);

  const resumed = bob.page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/stream" && response.ok();
  });
  await bob.page.unroute(streamPattern);
  const response = await resumed;
  expect(new URL(response.url()).searchParams.get("lastEventId")).toBe(
    String(beforeDisconnect.version),
  );
  await expect(bobOnAlice.locator('[data-presence="online"]')).toBeVisible();
  const log = bob.page.getByRole("log", { name: "Game log" });
  for (const line of ["Cara rolled 4 and 6.", `${alice.name} rolled 5 and 1.`, missedPurchase]) {
    await expect(log.getByText(line, { exact: true })).toHaveCount(1);
  }
  await expect(staleOwner).toContainText("$1,400");
  await expect(staleOwner).toContainText("1 property");
  await expect(bob.page.getByRole("button", { name: "Roll", exact: true })).toBeEnabled();
});

test("T26: visiting the lobby makes the player away, and Resume returns them online", async ({
  browser,
}) => {
  const table = await startGame(browser, "Lobby while playing");
  const { alice, bob } = table;
  const before = await readState(table);
  const row = alice.page.locator(".player-row").filter({ hasText: bob.name });
  await expect(row.locator('[data-presence="online"]')).toBeVisible();
  await bob.page.goto("/");
  await expect(bob.page.getByRole("heading", { name: "Lobby", exact: true })).toBeVisible();
  await expect(row.locator('[data-presence="reconnecting"]')).toBeVisible();
  await expect(row.locator('[data-presence="away"]')).toBeVisible();
  await expect(
    alice.page.getByText(`Waiting for ${bob.name} to return`, { exact: true }),
  ).toBeVisible();
  expect((await readGame(table)).status).toBe("active");
  await bob.page.getByRole("button", { name: `Resume ${table.game.name}`, exact: true }).click();
  await expect(bob.page).toHaveURL(table.gameUrl);
  await expect(row.locator('[data-presence="online"]')).toBeVisible();
  await expect(
    alice.page.getByText(`Waiting for ${bob.name} to return`, { exact: true }),
  ).toBeHidden();
  await expect(bob.page.getByRole("button", { name: "Roll", exact: true })).toBeEnabled();
  expect(await readState(table)).toEqual(before);
});
