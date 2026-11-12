import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import {
  currentLanguage,
  detectLanguage,
  formatMoney,
  readLanguagePreference,
  setLanguagePreference,
  startLanguagePreference,
  translate,
  useT,
} from "./index.ts";
import { CHANCE_CARDS, CHEST_CARDS, SQUARES } from "@monopoly/game-engine";
import { TOKENS } from "@monopoly/shared";
import { en } from "./en.ts";
import { cardTitle, squareName } from "./gameNames.ts";
import { errorMessage } from "./errors.ts";
import { ru } from "./ru.ts";

function deviceLanguages(tags: string[]) {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(tags);
}

afterEach(() => {
  setLanguagePreference("system");
  vi.restoreAllMocks();
});

describe("language detection", () => {
  test("any Russian tag gives Russian, all else English", () => {
    expect(detectLanguage(["ru-RU"])).toBe("ru");
    expect(detectLanguage(["de-DE", "ru"])).toBe("ru");
    expect(detectLanguage(["RU-ua"])).toBe("ru");
    expect(detectLanguage(["en-GB", "uk-UA"])).toBe("en");
    expect(detectLanguage(["rup"])).toBe("en");
    expect(detectLanguage([])).toBe("en");
  });

  test("follows the device until the user chooses, and keeps the choice", () => {
    deviceLanguages(["ru-RU"]);
    expect(currentLanguage()).toBe("ru");
    setLanguagePreference("en");
    expect(currentLanguage()).toBe("en");
    expect(window.localStorage.getItem("hf.lang")).toBe("en");
    setLanguagePreference("system");
    expect(window.localStorage.getItem("hf.lang")).toBeNull();
    expect(readLanguagePreference()).toBe("system");
  });

  test("sets lang on the root element", () => {
    deviceLanguages(["en-US"]);
    startLanguagePreference()();
    expect(document.documentElement.lang).toBe("en");
    setLanguagePreference("ru");
    expect(document.documentElement.lang).toBe("ru");
  });
});

describe("translate", () => {
  test("the catalogues have the same keys", () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
  });

  test("every square, card and token of the game has a text", () => {
    SQUARES.forEach((square, index) => {
      expect(translate("en", `square.${index}` as never)).toBe(square.name);
      expect(squareName(index, (key, params) => translate("en", key, params))).toBe(square.name);
    });
    for (const card of [...CHANCE_CARDS, ...CHEST_CARDS]) {
      expect(cardTitle(card.title, (key, params) => translate("ru", key, params))).not.toBe("");
      expect(cardTitle(card.title, (key, params) => translate("en", key, params))).toBe(card.title);
    }
    for (const token of TOKENS) {
      expect(en).toHaveProperty(`token.${token}.label`);
      expect(en).toHaveProperty(`token.${token}.short`);
    }
  });

  test("an error shows its catalogue text, else its message, else its code", () => {
    const t = (key: Parameters<typeof translate>[1]) => translate("en", key);
    expect(errorMessage({ code: "game_full", message: "server text" }, t)).toBe(
      "This game is full.",
    );
    expect(errorMessage({ code: "invalid_bid", message: "Raise by $10" }, t)).toBe("Raise by $10");
    expect(
      errorMessage(Object.assign(new Error("offline"), { status: 0, code: "internal_error" }), t),
    ).toBe("offline");
    expect(errorMessage(new TypeError("Failed to fetch"), t)).toBe("Failed to fetch");
    expect(errorMessage({ code: "mystery" }, t)).toBe("mystery");
    expect(errorMessage(undefined, t)).toBe("Something went wrong. Try again.");
  });

  test("Russian plurals take the one, few and many forms", () => {
    const forms = [1, 2, 5, 11, 21, 22, 25, 101].map((count) =>
      translate("ru", "count.properties", { count }),
    );
    expect(forms).toEqual([
      "1 участок",
      "2 участка",
      "5 участков",
      "11 участков",
      "21 участок",
      "22 участка",
      "25 участков",
      "101 участок",
    ]);
    expect(translate("en", "count.properties", { count: 1 })).toBe("1 property");
    expect(translate("en", "count.properties", { count: 3 })).toBe("3 properties");
  });

  test("formats money with the digit groups of the language", () => {
    expect(formatMoney(1500, "en")).toBe("$1,500");
    // Russian groups digits with a narrow no-break space
    expect(formatMoney(-1500, "ru")).toBe("−$1 500");
  });

  test("a component shows the new language at once", () => {
    function Title() {
      const t = useT();
      return <h1>{t("menu.theme")}</h1>;
    }
    setLanguagePreference("en");
    render(<Title />);
    expect(screen.getByRole("heading")).toHaveTextContent("Theme");
    act(() => setLanguagePreference("ru"));
    expect(screen.getByRole("heading")).toHaveTextContent("Тема");
  });
});
