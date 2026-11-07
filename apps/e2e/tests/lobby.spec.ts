import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { addHotSeat, createGame, openDevice, startGame, test } from "../support/game.ts";

const openGameRow = (page: Page, title: string) =>
  page
    .getByRole("list", { name: "Open games", exact: true })
    .getByRole("listitem")
    .filter({ has: page.getByText(title, { exact: true }) });

test("T02: sign-in survives reload, refuses a taken name, and returns to a game link", async ({
  browser,
  page,
}) => {
  const run = randomUUID().slice(0, 8);
  const alice = await openDevice(browser, `Alice${run}`);
  await alice.page.reload();
  await expect(alice.page.getByRole("heading", { name: "Lobby", exact: true })).toBeVisible();
  await expect(alice.page.getByText(`Signed in as ${alice.name}`)).toBeVisible();

  // This page has its own cookies. It cannot take the name of the signed-in player.
  await page.goto("/");
  await page.getByPlaceholder("Your name").fill(alice.name);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("That name is taken. Try another one.")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);

  const title = `Sign-in ${run}`;
  const roomUrl = await createGame(alice, title);
  await page.goto(roomUrl);
  await expect(page).toHaveURL(/\/sign-in\?/);
  expect(new URL(page.url()).searchParams.get("redirect")).toBe(new URL(roomUrl).pathname);
  await page.getByPlaceholder("Your name").fill(`Bob${run}`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(roomUrl);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Join game", exact: true }).click();
  await expect(alice.page.getByRole("region", { name: "Players", exact: true })).toContainText(
    `Bob${run}`,
  );
  await expect(page.getByRole("button", { name: "Leave game", exact: true })).toBeVisible();
});

test("T03: open games show creation, seat changes and start live on both devices", async ({
  browser,
}) => {
  const run = randomUUID().slice(0, 8);
  const alice = await openDevice(browser, `Alice${run}`);
  const bob = await openDevice(browser, `Bob${run}`);
  // Each device keeps a lobby tab open while its other tab enters the room.
  const aliceLobby = await alice.context.newPage();
  const bobLobby = await bob.context.newPage();
  for (const lobby of [aliceLobby, bobLobby]) {
    const stream = lobby.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/stream" && response.ok();
    });
    await lobby.goto("/");
    await stream;
  }

  const title = `Live ${run}`;
  const roomUrl = await createGame(alice, title);
  for (const lobby of [aliceLobby, bobLobby]) {
    await expect(openGameRow(lobby, title).getByLabel("1 of 6 seats")).toBeVisible();
  }
  await bob.page.getByRole("button", { name: `Join ${title}`, exact: true }).click();
  await expect(bob.page).toHaveURL(roomUrl);
  for (const device of [alice, bob]) {
    await expect(device.page.getByRole("region", { name: "Players", exact: true })).toContainText(
      "2 of 6 seats",
    );
  }
  for (const lobby of [aliceLobby, bobLobby]) {
    await expect(openGameRow(lobby, title).getByLabel("2 of 6 seats")).toBeVisible();
  }

  await startGame(alice);
  await expect(bob.page).toHaveURL(`${roomUrl}/play`);
  for (const lobby of [aliceLobby, bobLobby]) {
    await expect(openGameRow(lobby, title)).toHaveCount(0);
  }
});

test("T04: invites arrive live, decline updates the host, and acceptance takes a seat", async ({
  browser,
}) => {
  const run = randomUUID().slice(0, 8);
  const alice = await openDevice(browser, `Alice${run}`);
  const bob = await openDevice(browser, `Bob${run}`);
  const title = `Invite ${run}`;
  const roomUrl = await createGame(alice, title);
  const players = alice.page.getByRole("region", { name: "Players", exact: true });
  const invitation = players.getByRole("listitem").filter({ hasText: bob.name });
  const inbox = bob.page.getByRole("list", { name: "Invites", exact: true });
  const invite = inbox.getByRole("listitem").filter({ hasText: title });

  await alice.page.getByLabel("Player name", { exact: true }).fill(bob.name);
  await alice.page.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(invite).toContainText(`${alice.name} invited you`);
  await expect(invitation).toContainText("Invited · waiting to accept");
  await invite.getByRole("button", { name: `Decline the invite to ${title}` }).click();
  await expect(invite).toHaveCount(0);
  await expect(invitation).toHaveCount(0);
  await expect(players).toContainText("1 of 6 seats");

  await alice.page.getByLabel("Player name", { exact: true }).fill(bob.name);
  await alice.page.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(invite).toBeVisible();
  await invite.getByRole("button", { name: `Accept the invite to ${title}` }).click();
  await expect(bob.page).toHaveURL(roomUrl);
  await expect(invitation).toContainText("Joined");
  await expect(invitation).not.toContainText("Invited");
  for (const device of [alice, bob]) {
    await expect(device.page.getByRole("region", { name: "Players", exact: true })).toContainText(
      "2 of 6 seats",
    );
  }
  await expect(bob.page.getByRole("button", { name: "Leave game", exact: true })).toBeVisible();
});

test("T05: starting a game removes its pending invite from the live inbox", async ({ browser }) => {
  const run = randomUUID().slice(0, 8);
  const alice = await openDevice(browser, `Alice${run}`);
  const bob = await openDevice(browser, `Bob${run}`);
  const title = `Expire ${run}`;
  await createGame(alice, title);
  await addHotSeat(alice, "Cara");
  await alice.page.getByLabel("Player name", { exact: true }).fill(bob.name);
  await alice.page.getByRole("button", { name: "Invite", exact: true }).click();
  const invite = bob.page
    .getByRole("list", { name: "Invites", exact: true })
    .getByRole("listitem")
    .filter({ hasText: title });
  await expect(invite).toBeVisible();

  await startGame(alice);
  await expect(invite).toHaveCount(0);
  await expect(bob.page.getByRole("heading", { name: "Lobby", exact: true })).toBeVisible();
});
