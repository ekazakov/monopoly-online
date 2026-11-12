import { translate } from "../i18n/index.ts";
import type { Translate } from "../i18n/index.ts";

/** `t` for English, for the tests of code that takes a `Translate` function. */
export const tEn: Translate = (key, params) => translate("en", key, params);
