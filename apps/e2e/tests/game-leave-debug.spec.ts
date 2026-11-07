import { expect } from "@playwright/test";
import { startGame } from "../support/api.ts";
import { test } from "../support/game.ts";

test("T18: resigning a hot-seat player leaves the other player on that device in the game", async ({
  browser,
}) => {
  const { alice, bob } = await startGame(browser, "Resign");
  await alice.page.getByRole("button", { name: "Menu", exact: true }).click();
  await alice.page.getByRole("button", { name: "Leave game", exact: true }).click();
  const confirm = alice.page.getByRole("region", { name: "Leave game?", exact: true });
  await expect(confirm.getByRole("radio")).toHaveCount(2);
  await expect(confirm.getByRole("radio", { name: alice.name, exact: true })).toBeVisible();
  await confirm.getByRole("radio", { name: "Cara", exact: true }).check();
  await confirm.getByRole("button", { name: "Resign", exact: true }).click();
  await expect(
    alice.page.getByRole("navigation", { name: "Game menu" }).getByRole("status"),
  ).toHaveText("Cara resigned.");
  await alice.page.getByRole("button", { name: "Menu", exact: true }).click();
  for (const device of [alice, bob]) {
    await expect(device.page.locator(".player-row").filter({ hasText: "Cara" })).toHaveAttribute(
      "data-eliminated",
      "true",
    );
    await expect(
      device.page.locator(".player-row").filter({ hasText: alice.name }),
    ).not.toHaveAttribute("data-eliminated", "true");
    await expect(device.page.getByRole("log", { name: "Game log" })).toContainText(
      "Cara resigned.",
    );
  }
  await bob.page.getByRole("button", { name: "Roll", exact: true }).click();
  await bob.page.getByRole("button", { name: /^Buy \$/ }).click();
  await bob.page.getByRole("button", { name: "Next turn", exact: true }).click();
  await expect(alice.page.getByRole("button", { name: "Roll", exact: true })).toBeVisible();
  await expect(bob.page.getByRole("region", { name: "Turn actions" })).toContainText(
    `Waiting for ${alice.name}`,
  );
});

test("T19: the debug panel changes cash on both devices and records a debug event", async ({
  browser,
}) => {
  const { alice, bob } = await startGame(browser, "Debug");
  await bob.page.getByRole("button", { name: "Debug", exact: true }).click();
  const debug = bob.page.getByRole("region", { name: "Debug", exact: true });
  await debug.getByLabel(bob.name, { exact: true }).fill("1234");
  await debug.getByRole("button", { name: `Set ${bob.name}'s cash`, exact: true }).click();
  await expect(debug.getByRole("status")).toHaveText(`${bob.name}'s cash is now $1234.`);
  await bob.page.getByRole("button", { name: "Debug", exact: true }).click();
  for (const device of [alice, bob]) {
    await expect(device.page.locator(".player-row").filter({ hasText: bob.name })).toContainText(
      "$1,234",
    );
    await expect(device.page.getByRole("log", { name: "Game log" })).toContainText(
      `${bob.name} (debug): ${bob.name}'s cash set to $1,234.`,
    );
  }
  await expect(bob.page.getByRole("button", { name: "Roll", exact: true })).toBeEnabled();
});
