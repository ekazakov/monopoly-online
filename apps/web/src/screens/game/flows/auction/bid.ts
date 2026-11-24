import { MIN_BID, MIN_RAISE } from "@monopoly/game-engine";
import type { Translate } from "../../../../i18n/index.ts";
import { formatMoney } from "../../turn/format.ts";

/** The lowest bid the engine accepts: the opening bid, or the best bid plus the minimum raise. */
export const minimumBid = (highBid: number): number =>
  highBid === 0 ? MIN_BID : highBid + MIN_RAISE;

/**
 * The draft after a quick raise. The quick button adds to the amount in the input. An empty or
 * non-number draft adds to the minimum bid instead. `ok` is false when the result is above the cash.
 */
export function quickAdd(
  draft: string,
  raise: number,
  highBid: number,
  cash: number,
): { amount: number; ok: boolean } {
  const clean = draft.trim();
  const current = clean === "" ? Number.NaN : Number(clean);
  const base = Number.isFinite(current) ? current : minimumBid(highBid);
  const amount = base + raise;
  return { amount, ok: amount <= cash };
}

export type BidCheck = { ok: true; amount: number } | { ok: false; why: string };

/**
 * The same rule as the engine `Bid` handler: a whole number, no more than the cash, at least the
 * opening bid when nobody has bid, and at least the best bid plus the minimum raise after that.
 */
export function checkBid(text: string, highBid: number, cash: number, t: Translate): BidCheck {
  const clean = text.trim().replace(/^\$/, "").replaceAll(",", "");
  if (clean === "") return { ok: false, why: t("bid.empty") };
  if (!/^\d+$/.test(clean)) return { ok: false, why: t("bid.whole") };
  const amount = Number(clean);
  if (amount > cash) {
    return {
      ok: false,
      why: t("bid.tooMuch", { cash: formatMoney(cash) }),
    };
  }
  if (highBid === 0) {
    return amount >= MIN_BID
      ? { ok: true, amount }
      : { ok: false, why: t("bid.opening", { min: formatMoney(MIN_BID) }) };
  }
  if (amount >= minimumBid(highBid)) return { ok: true, amount };
  return { ok: false, why: t("bid.next", { min: formatMoney(minimumBid(highBid)) }) };
}
