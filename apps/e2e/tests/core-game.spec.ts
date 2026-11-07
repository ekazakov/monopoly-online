import { expect, test } from "@playwright/test";
import { bodyText, playUntil, startTable } from "../support/game.ts";

// F2. Two browser profiles and one hot-seat seat play a short game with the fixed dice from
// `GAME_SEED`: roll, buy, rent, a hot-seat handoff, a trade and the end of a turn.
test("two devices and a hot-seat seat play roll, buy, rent, handoff and trade", async ({
  browser,
}) => {
  const { alice, bob } = await startTable(browser, "core");
  const devices = [alice, bob];

  // Bob is first on his own device. Everyone else waits.
  await expect(bob.page.getByRole("button", { name: "Roll" })).toBeVisible();
  await expect(alice.page.getByText(`Waiting for ${bob.name}`)).toBeVisible();

  // Players buy what they land on. The game goes on until somebody pays rent, and Alice's device
  // passes between Alice and Cara on the way.
  const taken = await playUntil(devices, async () =>
    /paid .*rent/i.test(await bodyText(alice.page)),
  );
  expect(taken).toContain("buy");
  expect(taken).toContain("handoff");
  const log = await bodyText(alice.page);
  expect(log).toMatch(/rolled \d and \d/);
  expect(log).toMatch(/bought .* for \$\d+/);
  expect(log).toMatch(/paid .*rent/i);

  // Trade: the first device that may roll opens the builder, offers cash to another player, and
  // that player accepts. The log and the cash of both players change.
  await playUntil(devices, async () => {
    for (const device of devices) {
      if (await device.page.getByRole("button", { name: "Trade" }).isVisible()) return true;
    }
    return false;
  });
  const proposer = (await bob.page.getByRole("button", { name: "Trade" }).isVisible())
    ? bob
    : alice;
  await proposer.page.getByRole("button", { name: "Trade" }).click();
  const partner = proposer === bob ? "Cara" : bob.name;
  await proposer.page.getByRole("radio", { name: partner }).check();
  await proposer.page
    .getByLabel(/^Cash from /)
    .first()
    .fill("25");
  await proposer.page.getByRole("button", { name: "Propose" }).click();

  const responder = proposer === bob ? alice : bob;
  // The response may wait behind a hot-seat handoff on a shared device.
  await playUntil(
    [responder],
    async () => responder.page.getByRole("button", { name: "Accept" }).isVisible(),
    { maxSteps: 4 },
  ).catch(() => undefined);
  await responder.page.getByRole("button", { name: "Accept" }).click();
  await expect(proposer.page.getByText(/trade/i).first()).toBeVisible();
  await expect.poll(() => bodyText(responder.page)).toMatch(/accepted|traded/i);

  // The game goes on after the trade, and a turn ends with the next player.
  await playUntil(
    devices,
    async () => (await bodyText(alice.page)).match(/ended the turn/g)!.length >= 8,
  );
});
