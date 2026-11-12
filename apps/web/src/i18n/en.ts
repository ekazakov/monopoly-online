import type { Messages } from "./types.ts";

/**
 * English texts: the source catalogue. Every other language has the same keys (see `Catalogue`).
 * `{name}` is a parameter. A plural is an object of forms that `{count}` chooses from.
 */
export const en = {
  "menu.theme": "Theme",
  "menu.theme.hint": "Device follows your system setting",
  "menu.theme.system": "Device",
  "menu.theme.light": "Light",
  "menu.theme.dark": "Dark",
  "menu.language": "Language",
  "menu.language.hint": "Device follows your browser language",
  "menu.language.system": "Device",
  "count.properties": { one: "{count} property", other: "{count} properties" },
} satisfies Messages;
