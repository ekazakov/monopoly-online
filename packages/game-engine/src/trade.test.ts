import { describe, expect, test } from "vite-plus/test";
import { actorFor, applyAction } from "./index.ts";
import type { Action, ActionOf, GameState, TradeOffer } from "./index.ts";
import {
  base,
  current,
  holding,
  landing,
  ownerId,
  player,
  roll,
  setCurrent,
  types,
} from "./test-helpers.ts";
import type { Setup } from "./test-helpers.ts";

const nothing: TradeOffer = { cash: 0, squares: [], jailCards: [] };
const offer = (o: Partial<TradeOffer>): TradeOffer => ({ ...nothing, ...o });

const game = (...setups: Setup[]): GameState => setups.reduce((s, f) => f(s), base(1));
const ok = (state: GameState, action: Action) => {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error.message);
  return result;
};
const code = (state: GameState, action: Action) => {
  const result = applyAction(state, action);
  return result.ok ? "ok" : result.error.code;
};
const propose = (
  state: GameState,
  give: Partial<TradeOffer>,
  get: Partial<TradeOffer>,
): ActionOf<"ProposeTrade"> => ({
  type: "ProposeTrade",
  playerId: current(state),
  toPlayerId: ownerId(state),
  give: offer(give),
  get: offer(get),
});
const cash = (state: GameState, id: string) => player(state, id).cash;

// The player on turn owns Driftwood Lane (1). The other player owns North Station (5).
const swap = () => game(holding("current", { 1: {} }), holding("other", { 5: {} }));

describe("proposing a trade", () => {
  test("opens a proposal and waits for the partner", () => {
    const state = swap();
    const { state: open, events } = ok(
      state,
      propose(state, { cash: 100, squares: [1] }, { squares: [5] }),
    );
    expect(open.turn.phase).toBe("awaiting_trade_response");
    expect(open.trade).toMatchObject({
      fromId: current(state),
      toId: ownerId(state),
      returnPhase: "awaiting_roll",
    });
    expect(actorFor(open)).toBe(ownerId(state));
    expect(types(events)).toEqual(["TradeProposed"]);
  });

  test("is allowed before the roll, after the landing, in Jail and during a debt, but not in a buy decision", () => {
    const at =
      (phase: GameState["turn"]["phase"]): Setup =>
      (s) => ({
        ...s,
        turn: { ...s.turn, phase },
      });
    for (const phase of [
      "awaiting_roll",
      "awaiting_end_turn",
      "awaiting_jail_choice",
      "awaiting_debt",
    ] as const) {
      const state = game(at(phase));
      expect(code(state, propose(state, { cash: 10 }, {}))).toBe("ok");
    }
    const state = game(at("awaiting_buy_decision"));
    expect(code(state, propose(state, { cash: 10 }, {}))).toBe("wrong_phase");
  });

  test("rejects trades that are not allowed", () => {
    const state = swap();
    const id = current(state);
    const bad: [string, Action][] = [
      ["empty", propose(state, {}, {})],
      ["deed the proposer does not own", propose(state, { squares: [3] }, {})],
      ["deed the partner does not own", propose(state, {}, { squares: [1] })],
      ["not a property", propose(state, { squares: [0] }, {})],
      ["same square twice", propose(state, { squares: [1, 1] }, {})],
      ["more cash than the proposer has", propose(state, { cash: 99999 }, {})],
      ["more cash than the partner has", propose(state, {}, { cash: 99999 })],
      ["fractional cash", propose(state, { cash: 10.5 }, {})],
      ["negative cash", propose(state, { cash: -5 }, { cash: 10 })],
      ["a jail card nobody holds", propose(state, { jailCards: ["chance"] }, {})],
      ["trading with yourself", { ...propose(state, { cash: 10 }, {}), toPlayerId: id }],
      ["an unknown partner", { ...propose(state, { cash: 10 }, {}), toPlayerId: "zz" }],
    ];
    for (const [name, action] of bad) {
      expect([name, code(state, action)]).toEqual([name, "invalid_trade"]);
    }
  });

  test("a deed cannot be traded while its colour group has buildings", () => {
    const state = game(holding("current", { 1: { houses: 1 }, 3: {} }));
    expect(code(state, propose(state, { squares: [3] }, {}))).toBe("invalid_trade");
    expect(code(state, propose(state, { squares: [1] }, {}))).toBe("invalid_trade");
  });

  test("a partner who was eliminated cannot be a party", () => {
    const state = game((s) => ({
      ...s,
      players: s.players.map((p) => (p.id === ownerId(s) ? { ...p, active: false } : p)),
    }));
    expect(code(state, propose(state, { cash: 10 }, {}))).toBe("invalid_trade");
  });
});

describe("answering a trade", () => {
  const open = () => {
    const state = swap();
    const proposed = ok(state, propose(state, { cash: 100, squares: [1] }, { squares: [5] })).state;
    return { state, proposed };
  };

  test("accepting swaps the cash and the deeds, and returns to the earlier phase", () => {
    const { state, proposed } = open();
    const a = current(state);
    const b = ownerId(state);
    const done = ok(proposed, { type: "AcceptTrade", playerId: b });
    expect(done.state.ownership["1"]?.ownerId).toBe(b);
    expect(done.state.ownership["5"]?.ownerId).toBe(a);
    expect(cash(done.state, a)).toBe(cash(state, a) - 100);
    expect(cash(done.state, b)).toBe(cash(state, b) + 100);
    expect(done.state.trade).toBeNull();
    expect(done.state.turn).toMatchObject({ currentPlayerId: a, phase: "awaiting_roll" });
    expect(types(done.events)).toEqual(["TradeAccepted"]);
  });

  test("a mortgaged deed keeps its mortgage and costs no interest", () => {
    const state = game(holding("current", { 1: { mortgaged: true } }));
    const proposed = ok(state, propose(state, {}, { cash: 50 })).state;
    const asked = ok(state, { ...propose(state, { squares: [1] }, { cash: 50 }) }).state;
    expect(proposed.trade).not.toBeNull();
    const done = ok(asked, { type: "AcceptTrade", playerId: ownerId(state) }).state;
    expect(done.ownership["1"]).toEqual({ ownerId: ownerId(state), houses: 0, mortgaged: true });
    expect(cash(done, current(state))).toBe(cash(state, current(state)) + 50);
  });

  test("jail cards change hands", () => {
    const state = game(setCurrent({ heldJailCards: ["chance"] }));
    const proposed = ok(state, propose(state, { jailCards: ["chance"] }, { cash: 30 })).state;
    const done = ok(proposed, { type: "AcceptTrade", playerId: ownerId(state) }).state;
    expect(player(done, ownerId(state)).heldJailCards).toEqual(["chance"]);
    expect(player(done, current(state)).heldJailCards).toEqual([]);
  });

  test("rejecting and cancelling change nothing", () => {
    const { proposed } = open();
    const rejected = ok(proposed, { type: "RejectTrade", playerId: ownerId(proposed) });
    expect(rejected.state.trade).toBeNull();
    expect(rejected.state.turn.phase).toBe("awaiting_roll");
    expect(rejected.state.ownership).toEqual(proposed.ownership);
    expect(types(rejected.events)).toEqual(["TradeRejected"]);

    const cancelled = ok(proposed, { type: "CancelTrade", playerId: current(proposed) });
    expect(cancelled.state.trade).toBeNull();
    expect(cancelled.state.turn.phase).toBe("awaiting_roll");
    expect(types(cancelled.events)).toEqual(["TradeCancelled"]);
  });

  test("only the partner answers, and only the proposer cancels", () => {
    const { proposed } = open();
    const a = current(proposed);
    const b = ownerId(proposed);
    expect(code(proposed, { type: "AcceptTrade", playerId: a })).toBe("not_your_turn");
    expect(code(proposed, { type: "RejectTrade", playerId: a })).toBe("not_your_turn");
    expect(code(proposed, { type: "CancelTrade", playerId: b })).toBe("not_your_turn");
    const third = proposed.players.find((p) => p.id !== a && p.id !== b)?.id ?? "";
    expect(code(proposed, { type: "AcceptTrade", playerId: third })).toBe("not_your_turn");
  });

  test("nothing else is allowed while a trade is open", () => {
    const { proposed } = open();
    expect(code(proposed, { type: "RollDice", playerId: current(proposed) })).toBe("not_your_turn");
    expect(code(proposed, { type: "Mortgage", playerId: ownerId(proposed), square: 5 })).toBe(
      "wrong_phase",
    );
  });

  test("the trade is checked again when it is accepted", () => {
    const { proposed } = open();
    // The proposer lost the cash after proposing (for example through a card).
    const poor: GameState = {
      ...proposed,
      players: proposed.players.map((p) => (p.id === current(proposed) ? { ...p, cash: 10 } : p)),
    };
    expect(code(poor, { type: "AcceptTrade", playerId: ownerId(proposed) })).toBe("invalid_trade");
  });
});

describe("trading during a debt", () => {
  // Rent of $60 on Kelp Court. The debtor has $20 and Lantern Row (mortgage value $50).
  const debt = () =>
    roll(
      landing(
        0,
        3,
        holding("other", { 1: {}, 3: { houses: 2 } }),
        setCurrent({ cash: 20 }),
        holding("current", { 6: {} }),
      ),
    ).state;

  test("selling a deed raises the cash to pay the debt", () => {
    const state = debt();
    const a = current(state);
    expect(state.turn.phase).toBe("awaiting_debt");
    const proposed = ok(state, {
      type: "ProposeTrade",
      playerId: a,
      toPlayerId: ownerId(state),
      give: offer({ squares: [6] }),
      get: offer({ cash: 200 }),
    }).state;
    const accepted = ok(proposed, { type: "AcceptTrade", playerId: ownerId(state) }).state;
    expect(accepted.turn.phase).toBe("awaiting_debt");
    const paid = ok(accepted, { type: "PayDebt", playerId: a }).state;
    expect(paid.debts).toEqual([]);
    expect(paid.turn.phase).toBe("awaiting_end_turn");
  });

  test("a trade that leaves the debtor unable to pay ends in bankruptcy", () => {
    const state = debt();
    const a = current(state);
    const proposed = ok(state, {
      type: "ProposeTrade",
      playerId: a,
      toPlayerId: ownerId(state),
      give: offer({ squares: [6] }),
      get: offer({ cash: 10 }),
    }).state;
    const accepted = ok(proposed, { type: "AcceptTrade", playerId: ownerId(state) });
    expect(player(accepted.state, a).active).toBe(false);
    expect(accepted.state.trade).toBeNull();
    expect(accepted.state.debts).toEqual([]);
    expect(accepted.state.turn.currentPlayerId).not.toBe(a);
    expect(types(accepted.events)).toContain("BankruptcyDeclared");
  });
});
