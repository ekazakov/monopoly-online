import { describe, expect, test } from "vite-plus/test";
import { applyAction, JAIL_FINE } from "./index.ts";
import type { GameState } from "./index.ts";
import {
  base,
  current,
  gameWhere,
  holding,
  isDouble,
  player,
  roll,
  setCurrent,
  types,
} from "./test-helpers.ts";
import type { Setup } from "./test-helpers.ts";

const inJail =
  (jailTurns = 0): Setup =>
  (state) => ({
    ...setCurrent({ inJail: true, position: 10, jailTurns })(state),
    turn: { ...state.turn, phase: "awaiting_jail_choice" },
  });

const ok = (state: GameState, action: Parameters<typeof applyAction>[1]) => {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error.message);
  return result;
};
const cash = (state: GameState) => player(state, current(state)).cash;
const me = (state: GameState) => player(state, current(state));
const act = (state: GameState, type: "PayJailFine" | "UseJailCard") =>
  applyAction(state, { type, playerId: current(state) });

/** A jailed player whose next roll matches `wanted`. */
const rolling = (
  wanted: (d: readonly [number, number]) => boolean,
  jailTurns = 0,
  ...rest: Setup[]
) => gameWhere(wanted, inJail(jailTurns), ...rest);

const nonDouble10 = (d: readonly [number, number]) => !isDouble(d) && d[0] + d[1] === 10;
const double10 = (d: readonly [number, number]) => isDouble(d) && d[0] === 5;

describe("paying the fine", () => {
  test("takes $50, frees the player, and lets them roll as normal", () => {
    const state = inJail()(base(1));
    const result = act(state, "PayJailFine");
    expect(result.ok && me(result.state)).toMatchObject({
      inJail: false,
      cash: cash(state) - JAIL_FINE,
    });
    expect(result.ok && result.state.turn.phase).toBe("awaiting_roll");
    expect(result.ok && types(result.events)).toEqual(["FinePaid", "LeftJail"]);
  });

  test("a freed player can roll normally", () => {
    const state = inJail()(base(1));
    const paid = act(state, "PayJailFine");
    expect(paid.ok && roll(paid.state).events[0]?.type).toBe("DiceRolled");
  });

  test("a double after paying gives another roll (Q10)", () => {
    const state = rolling(double10);
    const paid = ok(state, { type: "PayJailFine", playerId: current(state) });
    const { state: after } = roll(paid.state);
    expect(me(after)).toMatchObject({ inJail: false, position: 20 });
    expect(after.turn).toMatchObject({ phase: "awaiting_roll", doubles: 1 });
  });

  test("is rejected without enough cash (temporary)", () => {
    const state = setCurrent({ cash: 40 })(inJail()(base(1)));
    expect(act(state, "PayJailFine")).toMatchObject({
      ok: false,
      error: { code: "insufficient_funds" },
    });
  });
});

describe("using a jail card", () => {
  const withCard: Setup = (state) => ({
    ...setCurrent({ heldJailCards: ["chest"] })(state),
    decks: { ...state.decks, chest: state.decks.chest.filter((i) => i !== 15) },
  });

  test("frees the player and returns the card to the bottom of its deck", () => {
    const state = withCard(inJail()(base(1)));
    const result = act(state, "UseJailCard");
    expect(result.ok && me(result.state)).toMatchObject({ inJail: false, heldJailCards: [] });
    expect(result.ok && result.state.decks.chest).toHaveLength(16);
    expect(result.ok && result.state.decks.chest.at(-1)).toBe(15);
    expect(result.ok && result.state.turn.phase).toBe("awaiting_roll");
    expect(result.ok && cash(result.state)).toBe(cash(state));
  });

  test("a double after using the card gives another roll (Q10)", () => {
    const state = rolling(double10, 0, withCard);
    const used = ok(state, { type: "UseJailCard", playerId: current(state) });
    const { state: after } = roll(used.state);
    expect(me(after)).toMatchObject({ inJail: false, position: 20 });
    expect(after.turn).toMatchObject({ phase: "awaiting_roll", doubles: 1 });
  });

  test("is rejected without a card", () => {
    expect(act(inJail()(base(1)), "UseJailCard")).toMatchObject({
      ok: false,
      error: { code: "no_jail_card" },
    });
  });
});

describe("rolling for doubles", () => {
  test("a double frees the player, who moves and does not roll again", () => {
    const state = rolling(double10);
    const { state: after, events } = roll(state);
    expect(me(after)).toMatchObject({ inJail: false, position: 20, jailTurns: 0 });
    expect(cash(after)).toBe(cash(state));
    expect(after.turn).toMatchObject({
      currentPlayerId: current(state),
      phase: "awaiting_end_turn",
      doubles: 0,
    });
    expect(types(events)).toEqual(["DiceRolled", "LeftJail", "PlayerMoved"]);
  });

  test("a miss keeps the player in Jail and ends the turn", () => {
    const state = rolling(nonDouble10);
    const id = current(state);
    const { state: after, events } = roll(state);
    expect(player(after, id)).toMatchObject({ inJail: true, position: 10, jailTurns: 1 });
    expect(after.turn.currentPlayerId).not.toBe(id);
    expect(types(events)).toEqual(["DiceRolled", "TurnEnded"]);
  });

  test("the second miss still keeps the player in Jail", () => {
    const state = rolling(nonDouble10, 1);
    const { state: after } = roll(state);
    expect(player(after, current(state))).toMatchObject({ inJail: true, jailTurns: 2 });
  });

  test("the third miss forces the fine and moves the rolled number", () => {
    const state = rolling(nonDouble10, 2);
    const { state: after, events } = roll(state);
    expect(me(after)).toMatchObject({ inJail: false, position: 20, jailTurns: 0 });
    expect(cash(after)).toBe(cash(state) - JAIL_FINE);
    expect(after.turn.phase).toBe("awaiting_end_turn");
    expect(types(events)).toEqual(["DiceRolled", "FinePaid", "LeftJail", "PlayerMoved"]);
  });

  test("the forced fine becomes a debt when assets can cover it, and the move waits", () => {
    const state = rolling(nonDouble10, 2, setCurrent({ cash: 40 }), holding("current", { 5: {} }));
    const id = current(state);
    const { state: debt } = roll(state);
    expect(debt.turn.phase).toBe("awaiting_debt");
    expect(debt.debts[0]).toMatchObject({
      creditor: { type: "bank" },
      amount: JAIL_FINE,
      reason: "fine",
      then: "leave_jail_and_move",
    });
    expect(player(debt, id)).toMatchObject({ inJail: true, position: 10 });

    const raised = ok(debt, { type: "Mortgage", playerId: id, square: 5 }).state;
    const paid = ok(raised, { type: "PayDebt", playerId: id });
    expect(player(paid.state, id)).toMatchObject({ inJail: false, position: 20, cash: 90 });
    expect(paid.state.turn.phase).toBe("awaiting_end_turn");
    expect(types(paid.events)).toEqual(["DebtPaid", "LeftJail", "PlayerMoved"]);
  });

  test("a forced fine the player cannot raise is bankruptcy", () => {
    const state = rolling(nonDouble10, 2, setCurrent({ cash: 40 }));
    const { state: after } = roll(state);
    expect(player(after, current(state)).active).toBe(false);
  });
});
