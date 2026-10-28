import { describe, expect, test } from "vite-plus/test";
import { applyAction, liquidationValue, outstanding } from "./index.ts";
import type { GameState } from "./index.ts";
import {
  current,
  gameWhere,
  holding,
  landing,
  ownerId,
  player,
  roll,
  setCurrent,
  topCard,
  types,
} from "./test-helpers.ts";
import type { Setup } from "./test-helpers.ts";

const cash = (state: GameState, id = current(state)) => player(state, id).cash;
const act = (state: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(state, action);
const ok = (result: ReturnType<typeof applyAction>) => {
  if (!result.ok) throw new Error(result.error.message);
  return result;
};
const as = (state: GameState) => current(state);

// Kelp Court (3) with 2 houses owned by the other player pays $60 rent.
const rentDebt = (...extra: Setup[]) =>
  landing(
    0,
    3,
    holding("other", { 1: {}, 3: { houses: 2 } }),
    setCurrent({ cash: 20 }),
    holding("current", { 6: {} }),
    ...extra,
  );

describe("liquidation value", () => {
  test("adds cash, mortgage values and half the build prices", () => {
    const state = landing(
      0,
      3,
      setCurrent({ cash: 100 }),
      holding("current", { 1: {}, 3: { houses: 2 }, 5: { mortgaged: true } }),
    );
    // 100 cash + 30 + 30 mortgage values + 2 houses * 25. The mortgaged station adds nothing.
    expect(liquidationValue(state, current(state))).toBe(210);
  });
});

describe("a debt that assets can cover", () => {
  test("rent the player cannot pay from cash becomes a debt", () => {
    const state = rentDebt();
    const { state: after, events } = roll(state);
    expect(after.turn.phase).toBe("awaiting_debt");
    expect(after.debts).toEqual([
      {
        debtorId: as(state),
        creditor: { type: "player", id: ownerId(state) },
        amount: 60,
        reason: "rent",
        then: "finish_roll",
      },
    ]);
    expect(cash(after)).toBe(20);
    expect(types(events)).toEqual(["DiceRolled", "PlayerMoved", "DebtIncurred"]);
    expect(outstanding(after, as(state))).toBe(60);
  });

  test("the player raises cash, pays, and the turn continues", () => {
    const debt = roll(rentDebt()).state;
    const id = as(debt);
    const mortgaged = ok(act(debt, { type: "Mortgage", playerId: id, square: 6 })).state;
    expect(cash(mortgaged)).toBe(70);
    const paid = ok(act(mortgaged, { type: "PayDebt", playerId: id }));
    expect(paid.state.debts).toEqual([]);
    expect(cash(paid.state)).toBe(10);
    expect(cash(paid.state, ownerId(debt))).toBe(cash(debt, ownerId(debt)) + 60);
    expect(paid.state.turn.phase).toBe("awaiting_end_turn");
    expect(types(paid.events)).toEqual(["DebtPaid"]);
  });

  test("paying without enough cash is rejected", () => {
    const debt = roll(rentDebt()).state;
    expect(act(debt, { type: "PayDebt", playerId: as(debt) })).toMatchObject({
      ok: false,
      error: { code: "insufficient_funds" },
    });
  });

  test("a player without a debt cannot pay one", () => {
    const state = landing(0, 3);
    expect(
      act(
        { ...state, turn: { ...state.turn, phase: "awaiting_debt" } },
        {
          type: "PayDebt",
          playerId: as(state),
        },
      ),
    ).toMatchObject({ ok: false, error: { code: "no_debt" } });
  });

  test("during a debt the player can only raise cash or pay", () => {
    const debt = roll(rentDebt()).state;
    const id = as(debt);
    const blocked = [
      { type: "RollDice", playerId: id },
      { type: "EndTurn", playerId: id },
      { type: "BuyProperty", playerId: id },
      { type: "Build", playerId: id, square: 1 },
      { type: "Unmortgage", playerId: id, square: 6 },
    ] as const;
    for (const action of blocked) {
      expect(act(debt, action)).toMatchObject({ ok: false, error: { code: "wrong_phase" } });
    }
  });

  test("selling a building also raises cash during a debt", () => {
    const state = landing(
      0,
      4,
      setCurrent({ cash: 100 }),
      holding("current", { 6: { houses: 0 }, 8: { houses: 1 }, 9: { houses: 1 } }),
    );
    const debt = roll(state).state; // Income Tax $200: 100 cash + 50 + 25 + 25 + 50 + 60 mortgage > 200
    expect(debt.turn.phase).toBe("awaiting_debt");
    const sold = ok(act(debt, { type: "SellBuilding", playerId: as(debt), square: 8 }));
    expect(cash(sold.state)).toBe(125);
  });

  test("a double that led to a debt gives another roll after payment", () => {
    const state = gameWhere(
      (d) => d[0] === 3 && d[1] === 3,
      setCurrent({ position: 0, cash: 5 }),
      holding("other", { 6: {} }),
      holding("current", { 9: {} }),
    );
    const debt = roll(state).state;
    expect(debt.turn.phase).toBe("awaiting_debt");
    const id = as(debt);
    const raised = ok(act(debt, { type: "Mortgage", playerId: id, square: 9 })).state;
    const paid = ok(act(raised, { type: "PayDebt", playerId: id })).state;
    expect(paid.turn).toMatchObject({ phase: "awaiting_roll", doubles: 1 });
  });

  test("tax becomes a debt to the bank", () => {
    const state = landing(
      0,
      4,
      setCurrent({ cash: 100 }),
      holding("current", { 5: {}, 15: {}, 25: {} }),
    );
    const { state: debt } = roll(state);
    expect(debt.debts[0]).toMatchObject({ creditor: { type: "bank" }, amount: 200, reason: "tax" });
    let next = debt;
    for (const square of [5, 15]) {
      next = ok(act(next, { type: "Mortgage", playerId: as(next), square })).state;
    }
    const paid = ok(act(next, { type: "PayDebt", playerId: as(next) }));
    expect(cash(paid.state)).toBe(100);
    expect(paid.state.turn.phase).toBe("awaiting_end_turn");
  });

  test("a debt the assets cannot cover is bankruptcy", () => {
    const state = landing(0, 4, setCurrent({ cash: 100 }), holding("current", { 1: {} }));
    const { state: after } = roll(state);
    expect(player(after, as(state)).active).toBe(false);
    expect(after.debts).toEqual([]);
  });
});

describe("cards that charge", () => {
  test("a card payment becomes a debt", () => {
    const state = landing(
      0,
      7,
      topCard("chance", 11),
      setCurrent({ cash: 10 }),
      holding("current", { 1: {} }),
    );
    const { state: debt } = roll(state);
    expect(debt.turn.phase).toBe("awaiting_debt");
    expect(debt.debts[0]).toMatchObject({ amount: 15, reason: "card" });
  });

  test("the pay-each-player card is one total, split into one debt per creditor", () => {
    const state = landing(
      0,
      7,
      topCard("chance", 13),
      setCurrent({ cash: 60 }),
      holding("current", { 5: {} }),
    );
    const id = as(state);
    const { state: debt } = roll(state);
    expect(debt.debts.map((d) => d.amount)).toEqual([50, 50]);
    const raised = ok(act(debt, { type: "Mortgage", playerId: id, square: 5 })).state;
    const first = ok(act(raised, { type: "PayDebt", playerId: id })).state;
    expect(first.turn.phase).toBe("awaiting_debt");
    const second = ok(act(first, { type: "PayDebt", playerId: id })).state;
    expect(second.turn.phase).toBe("awaiting_end_turn");
    expect(cash(second)).toBe(60);
    expect(second.players.filter((p) => p.id !== id).every((p) => p.cash === 1550)).toBe(true);
  });

  test("repair cards with buildings become a debt when cash is short", () => {
    const state = landing(
      0,
      7,
      topCard("chance", 12),
      setCurrent({ cash: 10 }),
      holding("current", { 1: { houses: 5 }, 3: { houses: 5 }, 5: {}, 15: {} }),
    );
    // 2 hotels * $100 = $200. Liquidation: 10 + 2 * 125 + ... covers it.
    expect(roll(state).state.debts[0]).toMatchObject({ amount: 200, reason: "card" });
  });
});
