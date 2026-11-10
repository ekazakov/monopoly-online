import {
  test as base,
  errors,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

/** One browser profile with its own cookie jar, so it is one player on one device. */
export interface Device {
  context: BrowserContext;
  page: Page;
  name: string;
}

const opened: BrowserContext[] = [];

/** `pnpm e2e:video` sets `E2E_VIDEO`. The `video` option of the config skips our own contexts. */
function recordingOptions(name: string) {
  if (!process.env.E2E_VIDEO) return {};
  const size = { width: 1440, height: 960 };
  return { recordVideo: { dir: test.info().outputPath(name), size } };
}

/** Every test closes its devices, because a video is complete only when its context closes. */
export const test = base.extend<{ closeDevices: void }>({
  closeDevices: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured first argument.
    async ({}, use) => {
      await use();
      await Promise.all(opened.splice(0).map((context) => context.close()));
    },
    { auto: true },
  ],
});

/** Register a device for cleanup and video recording, without signing in. */
export async function createDevice(browser: Browser, name: string): Promise<Device> {
  const context = await browser.newContext(recordingOptions(name));
  opened.push(context);
  const page = await context.newPage();
  return { context, page, name };
}

export async function openDevice(browser: Browser, name: string): Promise<Device> {
  const device = await createDevice(browser, name);
  const { page } = device;
  await page.goto("/");
  await page.getByPlaceholder("Your name").fill(name);
  // Wait for the live lobby subscription as well as the form. A test must not pass only because
  // the first REST load happened after another device created a game or sent an invite.
  const lobbyStream = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/stream" &&
      url.searchParams.get("topics")?.split(",").includes("lobby") === true &&
      response.ok()
    );
  });
  await page
    .getByRole("button", { name: /^(continue|enter|sign in|join|start|play)/i })
    .first()
    .click();
  await expect(page.getByRole("button", { name: "Create game" })).toBeVisible();
  await lobbyStream;
  return device;
}

/**
 * Close the page and open a new one in the same profile. The tab and its event stream are gone, and
 * the session cookie stays, so it is the same player coming back.
 */
export async function reopenPage(device: Device, url: string) {
  device.page = await device.context.newPage();
  await device.page.goto(url);
}

export async function createGame(host: Device, title: string): Promise<string> {
  const { page } = host;
  await page.getByLabel("Game name").fill(title);
  await page.getByRole("button", { name: "Create game" }).click();
  await page.waitForURL(/\/games\/[^/]+$/);
  return page.url();
}

export async function joinByLink(guest: Device, roomUrl: string) {
  const { page } = guest;
  await page.getByLabel("Game link").fill(roomUrl);
  await page
    .getByRole("button", { name: /^(join|open)/i })
    .first()
    .click();
  await page.waitForURL(/\/games\/[^/]+$/);
}

export async function addHotSeat(host: Device, name: string) {
  await host.page.getByLabel("Name", { exact: true }).fill(name);
  await host.page.getByRole("button", { name: "Add seat" }).click();
  await expect(host.page.getByText(`${name} joined`)).toBeVisible();
}

export async function startGame(host: Device) {
  await host.page.getByRole("button", { name: "Start game" }).click();
  await host.page.waitForURL(/\/play$/);
}

export interface Table {
  alice: Device;
  bob: Device;
  roomUrl: string;
  gameUrl: string;
}

/** Alice hosts and plays Cara on the same device. Bob joins by link. The game is started. `tag` makes the user names unique. */
export async function startTable(browser: Browser, tag: string): Promise<Table> {
  // User names are unique in a database. One database serves a whole run, and `playwright test --ui`
  // runs a test again on the same database, so a name has the test tag and a random part.
  const run = Math.random().toString(36).slice(2, 6);
  const alice = await openDevice(browser, `Alice${tag}${run}`);
  const bob = await openDevice(browser, `Bob${tag}${run}`);
  const roomUrl = await createGame(alice, `Table ${tag}`);
  await joinByLink(bob, roomUrl);
  await addHotSeat(alice, "Cara");
  await expect(alice.page.getByText("3 players ready.")).toBeVisible();
  await startGame(alice);
  await bob.page.waitForURL(/\/play$/);
  return { alice, bob, roomUrl, gameUrl: `${roomUrl}/play` };
}

/** What a device can do now, in the order that the loop tries it. */
const ACTIONS: Array<[string, RegExp]> = [
  ["roll", /^Roll( again)?$/i],
  ["buy", /^Buy \$/],
  ["next", /^Next turn$/i],
];

/**
 * Do one step for the first device that has a turn action: roll, buy a property, or end the turn. Returns the step name, or null when no device can act yet (the token is
 * still moving, or the game waits for someone).
 */
export async function step(devices: Device[]): Promise<string | null> {
  for (const device of devices) {
    for (const [name, pattern] of ACTIONS) {
      const button = device.page.getByRole("button", { name: pattern });
      if (await button.isVisible()) {
        // The button is disabled while the last action is on its way, and then it can go away. Such
        // a click would wait for a button that does not come back, so the loop looks again.
        try {
          await button.click({ timeout: 1_000 });
          return name;
        } catch (error) {
          if (error instanceof errors.TimeoutError) return null;
          throw error;
        }
      }
    }
  }
  return null;
}

/** Take steps until `done` is true. Fails with the steps taken when it takes too long. */
export async function playUntil(
  devices: Device[],
  done: () => Promise<boolean>,
  { maxSteps = 80, timeoutMs = 45_000 } = {},
): Promise<string[]> {
  const taken: string[] = [];
  const deadline = Date.now() + timeoutMs;
  while (!(await done())) {
    if (taken.length >= maxSteps || Date.now() > deadline) {
      throw new Error(`The game did not reach the goal. Steps: ${taken.join(", ")}`);
    }
    const name = await step(devices);
    if (name) taken.push(name);
    else await devices[0]!.page.waitForTimeout(150);
  }
  return taken;
}

export async function bodyText(page: Page): Promise<string> {
  return page.locator("body").innerText();
}

/** Bob rolls, buys and ends his turn. With the fixed dice he rolls 5 and 6 and lands on Anchor Street. */
export async function playBobsFirstTurn(table: Table) {
  const { page } = table.bob;
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  await page.getByRole("button", { name: /^Buy \$/ }).click();
  await page.getByRole("button", { name: "Next turn" }).click();
  await expect(table.alice.page.getByText(/ended the turn\. Cara is next\./)).toBeVisible();
}

/** The owner saves from the Menu. Both devices then show the notice. */
export async function saveFromMenu(owner: Device) {
  await owner.page.getByRole("button", { name: "Menu", exact: true }).click();
  await owner.page.getByRole("button", { name: "Save and exit" }).click();
  await owner.page.getByRole("button", { name: "Save and exit" }).last().click();
}

export async function finishFromMenu(owner: Device) {
  await owner.page.getByRole("button", { name: "Menu", exact: true }).click();
  await owner.page.getByRole("button", { name: "Finish game" }).first().click();
  await owner.page.getByRole("button", { name: "Finish game" }).last().click();
}
