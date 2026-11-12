import { useId } from "react";
import {
  LANGUAGES,
  LANGUAGE_NAMES,
  setLanguagePreference,
  useLanguagePreference,
  useT,
} from "../i18n/index.ts";
import type { LanguagePreference } from "../i18n/index.ts";
import { setThemePreference, useThemePreference } from "../styles/themePreference.ts";
import type { ThemePreference } from "../styles/themePreference.ts";
import "./PreferenceSwitches.css";

const THEMES = ["system", "light", "dark"] as const satisfies readonly ThemePreference[];
const LANGUAGE_CHOICES = ["system", ...LANGUAGES] as const satisfies readonly LanguagePreference[];

/**
 * The language and the theme of this device, for the screens that have no game Menu: sign-in,
 * the lobby and the room. The Menu of the game has the same choices. Both change at once and stay after a
 * reload (see `hf.lang` and `hf.theme`).
 */
export function PreferenceSwitches() {
  const t = useT();
  const theme = useThemePreference();
  const language = useLanguagePreference();
  const themeId = useId();
  const languageId = useId();

  return (
    <div className="prefs">
      <label className="prefs__field" htmlFor={languageId}>
        <span className="prefs__label">{t("menu.language")}</span>
        <select
          id={languageId}
          className="prefs__select"
          value={language}
          onChange={(event) => setLanguagePreference(event.target.value as LanguagePreference)}
        >
          {LANGUAGE_CHOICES.map((value) => (
            <option key={value} value={value} lang={value === "system" ? undefined : value}>
              {value === "system" ? t("menu.language.system") : LANGUAGE_NAMES[value]}
            </option>
          ))}
        </select>
      </label>
      <label className="prefs__field" htmlFor={themeId}>
        <span className="prefs__label">{t("menu.theme")}</span>
        <select
          id={themeId}
          className="prefs__select"
          value={theme}
          onChange={(event) => setThemePreference(event.target.value as ThemePreference)}
        >
          {THEMES.map((value) => (
            <option key={value} value={value}>
              {t(`menu.theme.${value}`)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
