import { expect } from "@playwright/test";
import { addHotSeat, createGame, openDevice, startGame, test } from "../support/game.ts";

// The suite runs in English. These two tests cover the Russian text: a Russian device language,
// and a choice in the Menu that beats the device language.

test("L1: a Russian device language shows Russian text from sign-in to the game", async ({
  browser,
}) => {
  const run = Math.random().toString(36).slice(2, 6);
  const context = await browser.newContext({ locale: "ru-RU", reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await expect(page.getByRole("heading", { name: "Выберите имя для игры" })).toBeVisible();
    await page.getByPlaceholder("Ваше имя").fill(`Иван${run}`);
    await page.getByRole("button", { name: "Продолжить" }).click();
    await expect(page.getByRole("button", { name: "Создать игру" })).toBeVisible();

    await page.getByLabel("Название игры").fill("Стол");
    await page.getByRole("button", { name: "Создать игру" }).click();
    await page.waitForURL(/\/games\/[^/]+$/);
    await expect(page.getByText("Комната игры")).toBeVisible();
    await page.getByLabel("Имя", { exact: true }).fill("Катя");
    await page.getByRole("button", { name: "Добавить место" }).click();
    await expect(page.getByText("Игрок Катя вошёл в игру")).toBeVisible();
    await page.getByRole("button", { name: "Начать игру" }).click();
    await page.waitForURL(/\/play$/);

    await expect(page.getByRole("log", { name: "Журнал игры" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Бросить", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Меню", exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("L2: the language choice in the Menu beats the device language and survives a reload", async ({
  browser,
}) => {
  const run = Math.random().toString(36).slice(2, 6);
  const host = await openDevice(browser, `Lang${run}`);
  await createGame(host, `Language ${run}`);
  await addHotSeat(host, "Cara");
  await startGame(host);
  const { page } = host;
  await expect(page.getByRole("button", { name: "Roll", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Русский" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.getByRole("button", { name: "Меню", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Бросить", exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Бросить", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Меню", exact: true }).click();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { name: "Roll", exact: true })).toBeVisible();
});
