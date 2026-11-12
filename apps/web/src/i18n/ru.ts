import type { en } from "./en.ts";
import type { Catalogue, RussianPlural } from "./types.ts";

/** Russian texts. The keys are the keys of `en`. Plurals need the one, few and many forms. */
export const ru: Catalogue<typeof en, RussianPlural> = {
  "menu.theme": "Тема",
  "menu.theme.hint": "«Авто» следует настройке устройства",
  "menu.theme.system": "Авто",
  "menu.theme.light": "Светлая",
  "menu.theme.dark": "Тёмная",
  "menu.language": "Язык",
  "menu.language.hint": "«Авто» следует языку браузера",
  "menu.language.system": "Авто",
  "count.properties": {
    one: "{count} участок",
    few: "{count} участка",
    many: "{count} участков",
    other: "{count} участка",
  },
};
