import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { createGame, joinByLink, openDevice, test } from "../support/game.ts";

test("M4: the host removes a player, the player sees the notice and joins again with the link", async ({
  browser,
}) => {
  const run = randomUUID().slice(0, 8);
  const alice = await openDevice(browser, `Alice${run}`);
  const bob = await openDevice(browser, `Bob${run}`);
  const roomUrl = await createGame(alice, `Remove ${run}`);
  await joinByLink(bob, roomUrl);

  const alicePlayers = alice.page.getByRole("region", { name: "Players", exact: true });
  await expect(alicePlayers).toContainText("2 of 6 seats");
  await expect(alicePlayers).toContainText(bob.name);

  // Keep closes the confirm step and removes nobody.
  await alicePlayers.getByRole("button", { name: `Remove ${bob.name}`, exact: true }).click();
  const confirm = alicePlayers.getByRole("group", { name: new RegExp(`Remove ${bob.name}`) });
  await expect(confirm).toContainText(`${bob.name} can join again with the game link.`);
  await confirm.getByRole("button", { name: "Keep", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(alicePlayers).toContainText("2 of 6 seats");

  // Remove: the host's list drops Bob, and Bob's room becomes the notice.
  await alicePlayers.getByRole("button", { name: `Remove ${bob.name}`, exact: true }).click();
  await confirm.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(alicePlayers).toContainText("1 of 6 seats");
  // The status line still says "left", so look at the seat list, not the whole region.
  const bobSeat = alicePlayers.getByRole("listitem").filter({ hasText: bob.name });
  await expect(bobSeat).toHaveCount(0);
  await expect(bob.page.getByRole("heading", { name: `${alice.name} removed you` })).toBeVisible();

  // The notice leads to the lobby.
  await bob.page.getByRole("link", { name: "Back to lobby" }).click();
  await expect(bob.page).toHaveURL(/\/$/);

  // Nobody is banned: the same link works again.
  await joinByLink(bob, roomUrl);
  await bob.page.getByRole("button", { name: "Join game", exact: true }).click();
  await expect(bob.page.getByRole("region", { name: "Players", exact: true })).toContainText(
    "2 of 6 seats",
  );
  await expect(bobSeat).toHaveCount(1);
  await expect(alicePlayers).toContainText("2 of 6 seats");
});
