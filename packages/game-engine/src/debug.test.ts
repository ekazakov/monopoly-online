import { describe, expect, test } from "vite-plus/test";
import { applyAction, JAIL_SQUARE } from "./index.ts";
import type { DebugChange, GameState, Phase } from "./index.ts";
import { base, current, holding, ownerId, player, setCurrent, types } from "./test-helpers.ts";
import type { Setup } from "./test-helpers.ts";

const game = (...setups: Setup[]): GameState => setups.reduce((s, f) => f(s), base(1));
const editAll = (state: GameState, changes: DebugChange[], playerId = current(state)) =>
  applyAction(state, { type: "DebugEdit", playerId, changes });
const edit = (state: GameState, change: DebugChange, playerId = current(state)) =>
  editAll(state, [change], playerId);
const code = (result: ReturnType<typeof edit>) => (result.ok ? "ok" : result.error.code);
const after = (result: ReturnType<typeof edit>) => {
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
};
const inPhase =
  (phase: Phase): Setup =>
  (state) => ({ ...state, turn: { ...state.turn, phase } });
const deed = (square: number, ownerId: string | null, houses = 0, mortgaged = false) =>
  ({ kind: "deed", square, ownerId, houses, mortgaged }) as const;

describe("DebugEdit", () => {
  test("sets the cash of any player and records one StateEdited event", () => {
    const state = game();
    const other = ownerId(state);
    const result = edit(state, { kind: "cash", targetId: other, cash: 7 });
    expect(player(after(result), other).cash).toBe(7);
    expect(result.ok && types(result.events)).toEqual(["StateEdited"]);
    expect(after(result).version).toBe(state.version + 1);
  });

  test("gives a deed with buildings to a player, also without the full group", () => {
    const state = game();
    const other = ownerId(state);
    const next = after(edit(state, deed(1, other, 3)));
    expect(next.ownership["1"]).toEqual({ ownerId: other, houses: 3, mortgaged: false });
  });

  test("moves a deed between players and returns it to the bank", () => {
    const state = game(holding("current", { 39: { houses: 5 } }));
    const other = ownerId(state);
    const moved = after(edit(state, deed(39, other, 5)));
    expect(moved.ownership["39"]?.ownerId).toBe(other);
    expect(after(edit(moved, deed(39, null))).ownership["39"]).toBeUndefined();
  });

  test("moves a token with no landing and no Start salary", () => {
    const state = game(setCurrent({ position: 30 }));
    const id = current(state);
    const result = edit(state, { kind: "position", targetId: id, square: 5 });
    expect(player(after(result), id)).toMatchObject({ position: 5, cash: player(state, id).cash });
    expect(after(result).turn.phase).toBe(state.turn.phase);
    expect(result.ok && types(result.events)).toEqual(["StateEdited"]);
  });

  test("a jailed player on turn who is moved leaves Jail and may roll", () => {
    const state = game(
      setCurrent({ position: JAIL_SQUARE, inJail: true, jailTurns: 2 }),
      inPhase("awaiting_jail_choice"),
    );
    const next = after(edit(state, { kind: "position", targetId: current(state), square: 0 }));
    expect(player(next, current(state))).toMatchObject({ inJail: false, jailTurns: 0 });
    expect(next.turn.phase).toBe("awaiting_roll");
  });

  test("refuses bad targets and values", () => {
    const state = game();
    const id = current(state);
    const gone: Setup = (s) => ({
      ...s,
      players: s.players.map((p) => (p.id === ownerId(s) ? { ...p, active: false } : p)),
    });
    expect(code(edit(state, { kind: "cash", targetId: "zz", cash: 1 }))).toBe("unknown_player");
    expect(code(edit(game(gone), { kind: "cash", targetId: ownerId(state), cash: 1 }))).toBe(
      "player_inactive",
    );
    expect(code(edit(state, { kind: "cash", targetId: id, cash: -1 }))).toBe("invalid_edit");
    expect(code(edit(state, { kind: "position", targetId: id, square: 40 }))).toBe("invalid_edit");
    expect(code(edit(state, deed(2, id)))).toBe("not_a_property");
    expect(code(edit(state, deed(5, id, 1)))).toBe("not_a_street");
    expect(code(edit(state, deed(1, id, 6)))).toBe("max_buildings");
    expect(code(edit(state, deed(1, id, 1, true)))).toBe("has_buildings");
  });

  test("a batch applies every change in order and gives one event for each", () => {
    const state = game();
    const other = ownerId(state);
    const result = editAll(state, [
      deed(1, other, 2),
      deed(3, other, 4),
      deed(5, other),
      { kind: "cash", targetId: other, cash: 9 },
      deed(1, null),
    ]);
    const next = after(result);
    expect(next.ownership["1"]).toBeUndefined();
    expect(next.ownership["3"]).toEqual({ ownerId: other, houses: 4, mortgaged: false });
    expect(next.ownership["5"]).toEqual({ ownerId: other, houses: 0, mortgaged: false });
    expect(player(next, other).cash).toBe(9);
    expect(result.ok && types(result.events)).toEqual(Array(5).fill("StateEdited"));
    expect(next.version).toBe(state.version + 1);
  });

  test("a batch is all or nothing", () => {
    const state = game();
    const other = ownerId(state);
    const result = editAll(state, [deed(1, other, 2), deed(5, other, 1)]);
    expect(code(result)).toBe("not_a_street");
    // The refused action leaves the state as it was: the caller keeps `state`.
    expect(state.ownership["1"]).toBeUndefined();
  });

  test("an empty batch is refused", () => {
    expect(code(editAll(game(), []))).toBe("invalid_edit");
  });

  test("only the player on turn may edit, and not during an offer, auction or trade", () => {
    const state = game();
    const change = { kind: "cash", targetId: current(state), cash: 1 } as const;
    expect(code(edit(state, change, ownerId(state)))).toBe("not_your_turn");
    for (const phase of ["awaiting_buy_decision", "game_over"] as const) {
      expect(code(edit(game(inPhase(phase)), change))).toBe("wrong_phase");
    }
    for (const phase of ["awaiting_end_turn", "awaiting_debt"] as const) {
      expect(code(edit(game(inPhase(phase)), change))).toBe("ok");
    }
  });
});

describe("DebugEdit: next dice and top card", () => {
  const roll = (state: GameState) =>
    applyAction(state, { type: "RollDice", playerId: current(state) });

  test("the next roll uses the set dice once, and the random state does not advance", () => {
    const state = after(edit(game(), { kind: "next_dice", dice: [3, 4] }));
    expect(state.nextDice).toEqual([3, 4]);
    const from = player(state, current(state)).position;
    const rolled = roll(state);
    expect(rolled.ok && rolled.events[0]).toEqual({
      type: "DiceRolled",
      playerId: current(state),
      dice: [3, 4],
    });
    // The first move is the dice total. A card square can move the token again after it.
    expect(rolled.ok && rolled.events.find((e) => e.type === "PlayerMoved")).toMatchObject({
      from,
      to: (from + 7) % 40,
    });
    const next = after(rolled);
    expect(next.nextDice).toBeNull();
    expect(next.rng).toEqual(state.rng);
  });

  test("a state with no nextDice field rolls from the random state", () => {
    const { nextDice: _, ...state } = game();
    const rolled = after(roll(state));
    expect(rolled.rng).not.toEqual(state.rng);
  });

  test("refuses a die out of 1 to 6", () => {
    expect(code(edit(game(), { kind: "next_dice", dice: [0, 4] }))).toBe("invalid_edit");
    expect(code(edit(game(), { kind: "next_dice", dice: [3, 7] }))).toBe("invalid_edit");
    expect(code(edit(game(), { kind: "next_dice", dice: [2.5, 1] }))).toBe("invalid_edit");
  });

  test("puts a card on top of its deck, and the next draw is that card", () => {
    const state = game();
    const card = state.decks.chance.at(-1)!;
    const edited = after(
      editAll(state, [
        { kind: "top_card", deck: "chance", cardIndex: card },
        { kind: "position", targetId: current(state), square: 4 },
        { kind: "next_dice", dice: [1, 2] },
      ]),
    );
    expect(edited.decks.chance[0]).toBe(card);
    expect(edited.decks.chance).toHaveLength(state.decks.chance.length);
    const rolled = roll(edited);
    expect(rolled.ok && rolled.events.find((e) => e.type === "CardDrawn")).toMatchObject({
      deck: "chance",
      cardIndex: card,
    });
  });

  test("refuses a card that is not in the deck", () => {
    const state = game();
    const missing = { ...state, decks: { ...state.decks, chest: state.decks.chest.slice(1) } };
    const held = state.decks.chest[0]!;
    expect(code(edit(missing, { kind: "top_card", deck: "chest", cardIndex: held }))).toBe(
      "invalid_edit",
    );
  });
});
