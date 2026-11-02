import { MIN_BID, RAISES } from "@monopoly/game-engine";
import { formatMoney } from "../../turn/format.ts";

/** The lowest bid the engine accepts: the opening bid, or the first raise over the best bid. */
export const minimumBid = (highBid: number): number =>
  highBid === 0 ? MIN_BID : highBid + (RAISES[0] ?? MIN_BID);

/** The bids a raise button can set: the best bid plus each raise. */
export const raiseTargets = (highBid: number): { raise: number; target: number }[] =>
  RAISES.map((raise) => ({ raise, target: highBid + raise }));

export type BidCheck = { ok: true; amount: number } | { ok: false; why: string };

/**
 * The same rule as the engine `Bid` handler: a whole number, no more than the cash, at least the
 * opening bid when nobody has bid, and exactly the best bid plus one raise after that.
 */
export function checkBid(text: string, highBid: number, cash: number): BidCheck {
  const clean = text.trim().replace(/^\$/, "").replaceAll(",", "");
  if (clean === "") return { ok: false, why: "Enter your bid in whole dollars." };
  if (!/^\d+$/.test(clean)) return { ok: false, why: "A bid is a whole number of dollars." };
  const amount = Number(clean);
  if (amount > cash) {
    return {
      ok: false,
      why: `You have ${formatMoney(cash)}. A bid cannot be more than your cash.`,
    };
  }
  if (highBid === 0) {
    return amount >= MIN_BID
      ? { ok: true, amount }
      : { ok: false, why: `The opening bid is at least ${formatMoney(MIN_BID)}.` };
  }
  if (RAISES.some((raise) => amount === highBid + raise)) return { ok: true, amount };
  const options = raiseTargets(highBid).map((item) => formatMoney(item.target));
  return { ok: false, why: `The next bid is ${list(options)}.` };
}

/** "$10, $50 or $100" */
const list = (items: readonly string[]): string =>
  `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;

export const raiseList = (): string => list(RAISES.map(formatMoney));
