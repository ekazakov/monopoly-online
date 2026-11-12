import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  addHotSeat,
  createDevice,
  createGame,
  openDevice,
  startGame,
  test,
} from "../support/game.ts";

// Device preferences (milestone 5, section E): theme, language and motion are kept in
// `localStorage`. The language choice has its own test in `language.spec.ts`.

async function openMenu(page: Page) {
  await page.getByRole("button", { name: "Menu", exact: true }).click();
}

async function startOwnGame(page: Page, host: Parameters<typeof createGame>[0], tag: string) {
  await createGame(host, `Prefs ${tag}`);
  await addHotSeat(host, "Cara");
  await startGame(host);
  await expect(page.getByRole("button", { name: "Roll", exact: true })).toBeVisible();
}

test("P1: a theme choice survives a page reload, and the system choice follows the device", async ({
  browser,
}) => {
  const run = Math.random().toString(36).slice(2, 6);
  const host = await openDevice(browser, `Theme${run}`);
  const { page } = host;
  await startOwnGame(page, host, run);
  const html = page.locator("html");

  await openMenu(page);
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");

  await openMenu(page);
  await expect(page.getByRole("button", { name: "Dark", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");

  // "Device" drops the stored choice, so the colour scheme of the device wins again.
  await page.emulateMedia({ colorScheme: "dark" });
  await openMenu(page);
  await page.getByRole("button", { name: "Device", exact: true }).first().click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
});

test("P2: the no motion choice beats the device setting and survives a page reload", async ({
  browser,
}) => {
  const run = Math.random().toString(36).slice(2, 6);
  const host = await openDevice(browser, `Motion${run}`);
  const { page } = host;
  await startOwnGame(page, host, run);
  const html = page.locator("html");
  // The suite sets reduced motion on the device.
  await expect(html).toHaveAttribute("data-motion", "reduce");

  await openMenu(page);
  const motion = page.getByRole("switch", { name: "Reduce motion" });
  await expect(motion).toHaveAttribute("aria-checked", "true");
  await motion.click();
  await expect(html).toHaveAttribute("data-motion", "full");
  await page.reload();
  await expect(html).toHaveAttribute("data-motion", "full");

  await openMenu(page);
  await page.getByRole("switch", { name: "Reduce motion" }).click();
  await expect(html).toHaveAttribute("data-motion", "reduce");
  await page.reload();
  await expect(html).toHaveAttribute("data-motion", "reduce");
});

test("P3: blocked storage does not break the app, and a choice holds until the page reloads", async ({
  browser,
}) => {
  const run = Math.random().toString(36).slice(2, 6);
  const host = await createDevice(browser, `Blocked${run}`);
  const { page } = host;
  // A strict privacy setting: reading `localStorage` throws a SecurityError. The app code guards
  // every read. A page error is not checked here: the dev-only TanStack devtools read it unguarded.
  await host.context.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
  });
  await page.goto("/");
  await page.getByPlaceholder("Your name").fill(host.name);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("button", { name: "Create game" })).toBeVisible();
  await startOwnGame(page, host, run);

  await openMenu(page);
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Русский" }).click();
  await expect(page.getByRole("button", { name: "Бросить", exact: true })).toBeVisible();

  // Nothing was stored, so a reload starts from the defaults and the app still works.
  await page.reload();
  await expect(page.getByRole("button", { name: "Roll", exact: true })).toBeVisible();
});

test("P4: the sign-in and lobby screens have the language and theme switches", async ({
  browser,
}) => {
  const run = Math.random().toString(36).slice(2, 6);
  const host = await createDevice(browser, `Switch${run}`);
  const { page } = host;
  await page.goto("/");
  await page.getByLabel("Language").selectOption("ru");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.getByRole("heading", { name: "Выберите имя для игры" })).toBeVisible();
  await page.getByLabel("Тема").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByPlaceholder("Ваше имя").fill(host.name);
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.getByRole("button", { name: "Создать игру" })).toBeVisible();
  await page.getByLabel("Язык").selectOption("en");
  await expect(page.getByRole("button", { name: "Create game" })).toBeVisible();
  await page.getByLabel("Theme").selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
