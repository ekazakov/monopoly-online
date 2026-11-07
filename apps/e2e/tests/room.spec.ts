import { randomUUID } from "node:crypto";
import { errors, expect, type Request } from "@playwright/test";
import {
  addHotSeat,
  createGame,
  joinByLink,
  openDevice,
  startGame,
  test,
} from "../support/game.ts";

test("T06: six seats have six figures, token choices update live, and the host stays red", async ({
  browser,
}) => {
  const run = randomUUID().slice(0, 8);
  const alice = await openDevice(browser, `Alice${run}`);
  const bob = await openDevice(browser, `Bob${run}`);
  const roomUrl = await createGame(alice, `Tokens ${run}`);
  await joinByLink(bob, roomUrl);
  const aliceTokens = alice.page.getByRole("group", { name: "Your token", exact: true });
  const bobTokens = bob.page.getByRole("group", { name: "Your token", exact: true });
  for (const picker of [aliceTokens, bobTokens]) {
    await expect(picker.getByRole("button")).toHaveCount(6);
  }
  await expect(
    aliceTokens.getByRole("button", { name: "Scottish terrier", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await bobTokens.getByRole("button", { name: "Horse", exact: true }).click();
  await expect(bobTokens.getByRole("button", { name: "Horse", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    aliceTokens.getByRole("button", { name: `Horse, taken by ${bob.name}` }),
  ).toBeDisabled();
  await expect(aliceTokens.getByRole("button", { name: "Cat", exact: true })).toBeEnabled();

  for (const name of ["Cara", "Dan", "Eve", "Finn"]) await addHotSeat(alice, name);
  const figures = [
    `${alice.name}, Scottish terrier`,
    `${bob.name}, Horse`,
    "Cara, Cat",
    "Dan, Penguin",
    "Eve, Racing car",
    "Finn, Duck",
  ];
  for (const device of [alice, bob]) {
    const players = device.page.getByRole("region", { name: "Players", exact: true });
    await expect(players).toContainText("6 of 6 seats");
    await expect(players.getByRole("img")).toHaveCount(6);
    for (const figure of figures) {
      await expect(players.getByRole("img", { name: figure, exact: true })).toBeVisible();
    }
    await expect(
      players.getByRole("img", { name: `${alice.name}, Scottish terrier`, exact: true }),
    ).toHaveCSS("border-color", "rgb(217, 57, 47)");
  }

  await startGame(alice);
  await expect(bob.page).toHaveURL(`${roomUrl}/play`);
  for (const device of [alice, bob]) {
    await expect(
      device.page
        .locator(".player-row")
        .filter({ hasText: alice.name })
        .locator(".player-row__avatar"),
    ).toHaveCSS("border-color", "rgb(217, 57, 47)");
  }
});

test("T07: adding and removing a hot-seat seat controls whether the host can start", async ({
  browser,
}) => {
  const run = randomUUID().slice(0, 8);
  const alice = await openDevice(browser, `Alice${run}`);
  await createGame(alice, `Hot-seat ${run}`);
  const players = alice.page.getByRole("region", { name: "Players", exact: true });
  const start = alice.page.getByRole("button", { name: "Start game", exact: true });
  await expect(players).toContainText("1 of 6 seats");
  await expect(start).toBeDisabled();

  await addHotSeat(alice, "Cara");
  await expect(players).toContainText("2 of 6 seats");
  const cara = players.getByRole("listitem").filter({ hasText: "Cara" });
  await expect(cara).toContainText("Plays on this device");
  await expect(start).toBeEnabled();
  await cara.getByRole("button", { name: "Remove Cara", exact: true }).click();
  await expect(cara).toHaveCount(0);
  await expect(players).toContainText("1 of 6 seats");
  await expect(start).toBeDisabled();
  await expect(alice.page.getByText("Add at least one more player to start.")).toBeVisible();
});

test("T08: cancelling notifies the guest, stops game stream reconnects and invalidates the link", async ({
  browser,
}) => {
  const run = randomUUID().slice(0, 8);
  const alice = await openDevice(browser, `Alice${run}`);
  const bob = await openDevice(browser, `Bob${run}`);
  const roomUrl = await createGame(alice, `Cancel ${run}`);
  const gameId = new URL(roomUrl).pathname.split("/").at(-1)!;
  const isGameStream = (request: Request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/stream" &&
      url.searchParams.get("topics")?.split(",").includes(`game:${gameId}`) === true
    );
  };
  let connections = 0;
  bob.page.on("request", (request) => {
    if (isGameStream(request)) connections++;
  });
  await joinByLink(bob, roomUrl);
  await expect(bob.page.getByRole("button", { name: "Leave game", exact: true })).toBeVisible();
  await expect.poll(() => connections).toBeGreaterThan(0);
  const beforeCancel = connections;

  await alice.page.getByRole("button", { name: "Cancel game", exact: true }).click();
  await alice.page
    .getByRole("group", { name: "Cancel this game? Everyone leaves, and the link stops working." })
    .getByRole("button", { name: "Cancel game", exact: true })
    .click();
  await expect(
    bob.page.getByRole("heading", { name: "Game cancelled", exact: true }),
  ).toBeVisible();
  await expect(
    bob.page.getByText(`${alice.name} cancelled this game before it started.`),
  ).toBeVisible();
  await expect(alice.page.getByRole("heading", { name: "Lobby", exact: true })).toBeVisible();

  // Observe a full reconnect interval, including the browser's native EventSource retry. The
  // request counter also catches a request between the cancel and the notice becoming visible.
  await expect(bob.page.waitForRequest(isGameStream, { timeout: 3_500 })).rejects.toThrow(
    errors.TimeoutError,
  );
  expect(connections).toBe(beforeCancel);

  await bob.page.getByRole("link", { name: "Back to lobby", exact: true }).click();
  await expect(bob.page.getByRole("heading", { name: "Lobby", exact: true })).toBeVisible();
  await bob.page.getByLabel("Game link", { exact: true }).fill(roomUrl);
  await bob.page.getByRole("button", { name: "Open game", exact: true }).click();
  await expect(bob.page.getByRole("heading", { name: "Not found", exact: true })).toBeVisible();
  expect(connections).toBe(beforeCancel);
});

test("T09: a stranger cannot open a started game", async ({ browser }) => {
  const run = randomUUID().slice(0, 8);
  const alice = await openDevice(browser, `Alice${run}`);
  const bob = await openDevice(browser, `Bob${run}`);
  const stranger = await openDevice(browser, `Cora${run}`);
  const roomUrl = await createGame(alice, `Private ${run}`);
  await joinByLink(bob, roomUrl);
  await startGame(alice);
  await expect(bob.page).toHaveURL(`${roomUrl}/play`);

  for (const url of [roomUrl, `${roomUrl}/play`]) {
    await stranger.page.goto(url);
    await expect(
      stranger.page.getByRole("heading", { name: "Not your game", exact: true }),
    ).toBeVisible();
    await expect(stranger.page.getByText("You have no seat in this game.")).toBeVisible();
    await expect(stranger.page.getByRole("button", { name: "Join game", exact: true })).toHaveCount(
      0,
    );
    await expect(stranger.page.getByRole("button", { name: "Roll", exact: true })).toHaveCount(0);
  }
});
