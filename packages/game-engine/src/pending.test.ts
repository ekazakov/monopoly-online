import { describe, expect, test } from "vite-plus/test";
import { applyAction } from "./index.ts";
import type { Action, GameState, Player } from "./index.ts";
import { current, landing, player, roll, topCard, types } from "./test-helpers.ts";
import type { Setup } from "./test-helpers.ts";

const nextId = (s: GameState) => {
  const index = s.players.findIndex((p) => p.id === current(s));
  return s.players[(index + 1) % s.players.length]?.id ?? "";
};
const patchNext =
  (patch: Partial<Player>): Setup =>
  (s) => ({ ...s, players: s.players.map((p) => (p.id === nextId(s) ? { ...p, ...patch } : p)) });
const deedsToNext =
  (...squares: number[]): Setup =>
  (s) => ({
    ...s,
    ownership: {
      ...s.ownership,
      ...Object.fromEntries(
        squares.map((q) => [String(q), { ownerId: nextId(s), houses: 0, mortgaged: false }]),
      ),
    },
  });

const ok = (state: GameState, action: Action) => {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error.message);
  return result;
};
const cash = (state: GameState, id: string) => player(state, id).cash;

// The Festival Chest card (index 6): every other player owes the drawer $10.
// The next player in turn order is short of cash but owns a station.
const festival = (...extra: Setup[]) =>
  landing(10, 7, topCard("chest", 6), patchNext({ cash: 5 }), deedsToNext(5), ...extra);

describe("pending debts (off-turn)", () => {
  test("a player who cannot pay now but has assets owes a pending debt", () => {
    const state = festival();
    const drawer = current(state);
    const debtor = nextId(state);
    const { state: after, events } = roll(state);
    expect(after.debts).toEqual([
      {
        debtorId: debtor,
        creditor: { type: "player", id: drawer },
        amount: 10,
        reason: "card",
        then: "due_at_turn_start",
      },
    ]);
    // The turn is not interrupted, and the other player paid at once.
    expect(after.turn).toMatchObject({ currentPlayerId: drawer, phase: "awaiting_end_turn" });
    expect(cash(after, drawer)).toBe(cash(state, drawer) + 10);
    expect(cash(after, debtor)).toBe(5);
    expect(types(events)).toContain("DebtIncurred");
  });

  test("the debt falls due at the start of the debtor's turn", () => {
    const state = festival();
    const drawer = current(state);
    const debtor = nextId(state);
    const rolled = roll(state).state;
    const due = ok(rolled, { type: "EndTurn", playerId: drawer });
    expect(due.state.turn).toMatchObject({ currentPlayerId: debtor, phase: "awaiting_debt" });

    const raised = ok(due.state, { type: "Mortgage", playerId: debtor, square: 5 }).state;
    const paid = ok(raised, { type: "PayDebt", playerId: debtor });
    expect(paid.state.debts).toEqual([]);
    expect(paid.state.turn.phase).toBe("awaiting_roll");
    expect(cash(paid.state, drawer)).toBe(cash(rolled, drawer) + 10);
  });

  test("a debtor whose cash now covers the debt pays at once", () => {
    const state = festival();
    const drawer = current(state);
    const debtor = nextId(state);
    const rolled = roll(state).state;
    const richer: GameState = {
      ...rolled,
      players: rolled.players.map((p) => (p.id === debtor ? { ...p, cash: 100 } : p)),
    };
    const due = ok(richer, { type: "EndTurn", playerId: drawer });
    expect(due.state.debts).toEqual([]);
    expect(due.state.turn).toMatchObject({ currentPlayerId: debtor, phase: "awaiting_roll" });
    expect(cash(due.state, debtor)).toBe(90);
    expect(types(due.events)).toEqual(["TurnEnded", "DebtPaid"]);
  });

  test("the bankruptcy test runs again when the debt falls due", () => {
    const state = festival();
    const drawer = current(state);
    const debtor = nextId(state);
    const rolled = roll(state).state;
    const { ["5"]: _lost, ...rest } = rolled.ownership;
    const poorer: GameState = { ...rolled, ownership: rest };
    const due = ok(poorer, { type: "EndTurn", playerId: drawer });
    expect(player(due.state, debtor)).toMatchObject({ active: false, cash: 0 });
    expect(cash(due.state, drawer)).toBe(cash(poorer, drawer) + 5);
    expect(due.state.debts).toEqual([]);
    // The eliminated debtor's turn is skipped.
    expect(due.state.turn.currentPlayerId).not.toBe(debtor);
    expect(due.state.turn.currentPlayerId).not.toBe(drawer);
    expect(due.state.turn.phase).toBe("awaiting_roll");
  });

  test("a jailed debtor resumes in the jail phase after paying", () => {
    const state = festival(patchNext({ inJail: true, position: 10 }));
    const drawer = current(state);
    const debtor = nextId(state);
    const rolled = roll(state).state;
    const due = ok(rolled, { type: "EndTurn", playerId: drawer }).state;
    expect(due.turn).toMatchObject({ currentPlayerId: debtor, phase: "awaiting_debt" });
    const raised = ok(due, { type: "Mortgage", playerId: debtor, square: 5 }).state;
    const paid = ok(raised, { type: "PayDebt", playerId: debtor }).state;
    expect(paid.turn.phase).toBe("awaiting_jail_choice");
  });

  test("a player with no way to pay is bankrupt at once, and the turn does not move", () => {
    const state = landing(10, 7, topCard("chest", 6), patchNext({ cash: 5 }));
    const drawer = current(state);
    const debtor = nextId(state);
    const { state: after, events } = roll(state);
    expect(player(after, debtor)).toMatchObject({ active: false, cash: 0 });
    expect(cash(after, drawer)).toBe(cash(state, drawer) + 5 + 10);
    expect(after.turn).toMatchObject({ currentPlayerId: drawer, phase: "awaiting_end_turn" });
    expect(types(events)).not.toContain("TurnEnded");
  });
});
