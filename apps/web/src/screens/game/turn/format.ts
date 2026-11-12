import { currentLanguage, formatMoney as formatMoneyIn } from "../../../i18n/index.ts";

/** Game money in the language that shows now: "$1,500", "−$200". */
export const formatMoney = (amount: number): string => formatMoneyIn(amount, currentLanguage());
