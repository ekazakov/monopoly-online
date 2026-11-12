import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { setLanguagePreference } from "../i18n/index.ts";
import { setThemePreference } from "../styles/themePreference.ts";
import { PreferenceSwitches } from "./PreferenceSwitches.tsx";

afterEach(() => {
  setLanguagePreference("system");
  setThemePreference("system");
});

describe("PreferenceSwitches", () => {
  test("a language choice changes the text at once and is stored", async () => {
    setLanguagePreference("en");
    render(<PreferenceSwitches />);
    await userEvent.selectOptions(screen.getByLabelText("Language"), "ru");
    expect(screen.getByLabelText("Язык")).toHaveValue("ru");
    expect(document.documentElement.lang).toBe("ru");
    expect(window.localStorage.getItem("hf.lang")).toBe("ru");
  });

  test("a theme choice is stored, and Device removes it", async () => {
    setLanguagePreference("en");
    render(<PreferenceSwitches />);
    const theme = screen.getByLabelText("Theme");
    await userEvent.selectOptions(theme, "dark");
    expect(window.localStorage.getItem("hf.theme")).toBe("dark");
    await userEvent.selectOptions(theme, "system");
    expect(window.localStorage.getItem("hf.theme")).toBeNull();
  });
});
