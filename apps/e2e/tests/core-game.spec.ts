import { expect } from "@playwright/test";
import { bodyText, playUntil, startTable, test } from "../support/game.ts";

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

  // Trade: Bob gives a street and asks $25 from Cara, who plays on Alice's device. Cara accepts, and
  // Bob's hand shows one property less and $25 more.
  const bobHand = bob.page.getByRole("button", { name: new RegExp(`^${bob.name}'s properties, `) });
  // The hand label gives the number of properties. Bob's cash is in his row of the player rail.
  const bobRow = bob.page.locator(".player-row").filter({ hasText: bob.name });
  const readHand = async () => {
    const label = (await bobHand.getAttribute("aria-label")) ?? "";
    const count = Number(label.match(/(\d+) propert(?:y|ies)/)?.[1]);
    const cash = Number(
      ((await bobRow.innerText()).match(/\$([\d,]+)/)?.[1] ?? "").replace(/,/g, ""),
    );
    return { count, cash };
  };
  await playUntil(devices, () => bob.page.getByRole("button", { name: "Trade" }).isVisible());
  const before = await readHand();
  expect(before.count).toBeGreaterThanOrEqual(1);

  await bob.page.getByRole("button", { name: "Trade" }).click();
  await bob.page.getByRole("radio", { name: "Cara" }).check();
  await bob.page
    .getByRole("region", { name: `${bob.name} gives` })
    .getByRole("checkbox")
    .first()
    .check();
  await bob.page.getByLabel("Cash from Cara").fill("25");
  await bob.page.getByRole("button", { name: "Propose" }).click();

  // The offer may wait behind a hot-seat handoff on Alice's device.
  const accept = alice.page.getByRole("button", { name: "Accept" });
  const handoff = alice.page.getByRole("button", { name: /^I.m .+, start my turn$/ });
  await expect(accept.or(handoff)).toBeVisible();
  if (await handoff.isVisible()) await handoff.click();
  await accept.click();

  await expect.poll(readHand).toEqual({ count: before.count - 1, cash: before.cash + 25 });

  // The game goes on after the trade, and a turn ends with the next player.
  await playUntil(
    devices,
    async () => (await bodyText(alice.page)).match(/ended the turn/g)!.length >= 8,
  );
});
