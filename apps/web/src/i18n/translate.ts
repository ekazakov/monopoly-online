import { useCallback } from "react";
import { en } from "./en.ts";
import { useLanguage } from "./languagePreference.ts";
import type { Language } from "./languagePreference.ts";
import { ru } from "./ru.ts";
import type { Message } from "./types.ts";

export type MessageKey = keyof typeof en;

/** Whether `key` is a key of the catalogue. */
export function hasMessage(key: string): key is MessageKey {
  return key in en;
}
export type Params = Record<string, string | number>;

const CATALOGUES: Record<Language, Record<MessageKey, Message>> = { en, ru };

/** The BCP 47 locale for number and plural rules of each language. */
const LOCALES: Record<Language, string> = { en: "en-US", ru: "ru-RU" };

/** Each language's name in that language, for the language choice. It is never translated. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", ru: "Русский" };

const pluralRules = new Map<Language, Intl.PluralRules>();
const numberFormats = new Map<Language, Intl.NumberFormat>();

function rulesOf(language: Language): Intl.PluralRules {
  let rules = pluralRules.get(language);
  if (!rules) pluralRules.set(language, (rules = new Intl.PluralRules(LOCALES[language])));
  return rules;
}

function numbersOf(language: Language): Intl.NumberFormat {
  let format = numberFormats.get(language);
  if (!format) numberFormats.set(language, (format = new Intl.NumberFormat(LOCALES[language])));
  return format;
}

/** A whole number with the digit groups of `language`: 1,500 or 1 500. */
export function formatNumber(value: number, language: Language): string {
  return numbersOf(language).format(value);
}

/** An amount of game money. The sign is a true minus, and the $ comes first in both languages. */
export function formatMoney(amount: number, language: Language): string {
  return `${amount < 0 ? "−" : ""}$${formatNumber(Math.abs(amount), language)}`;
}

/**
 * The text of `key` in `language`, with `{name}` parameters filled in. A plural takes the form
 * that `params.count` needs, and `{count}` shows with the digit groups of the language.
 */
export function translate(language: Language, key: MessageKey, params: Params = {}): string {
  const message = CATALOGUES[language][key];
  let text: string;
  if (typeof message === "string") {
    text = message;
  } else {
    const count = Number(params.count ?? 0);
    // a catalogue has only the forms its language needs; `other` is always there
    const forms: Partial<Record<Intl.LDMLPluralRule, string>> = message;
    text = forms[rulesOf(language).select(count)] ?? message.other;
  }
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    if (value === undefined) return whole;
    return typeof value === "number" ? formatNumber(value, language) : value;
  });
}

export type Translate = (key: MessageKey, params?: Params) => string;

/** "A or B", "A, B or C": the options of a list in the language of `t`. */
export function joinOr(items: readonly string[], t: Translate): string {
  if (items.length <= 1) return items[0] ?? "";
  return t("list.or", { head: items.slice(0, -1).join(", "), last: items.at(-1)! });
}

/** "A", "A and B", "A, B and C": the names of a list in the language of `t`. */
export function joinNames(names: readonly string[], t: Translate): string {
  if (names.length <= 1) return names[0] ?? "";
  return t("list.and", { head: names.slice(0, -1).join(", "), last: names.at(-1)! });
}

/** `translate` in the language that shows now. The component draws again when it changes. */
export function useT(): Translate {
  const language = useLanguage();
  return useCallback((key, params) => translate(language, key, params), [language]);
}
