import engineState from "../../game-engine/src/state.ts?raw";
import { describe, expect, test } from "vite-plus/test";
import {
  actorFor,
  applyAction,
  BOARD_SIZE as ENGINE_BOARD_SIZE,
  createGame,
  createRng,
  groupLevels,
  isProperty,
  JAIL_FINE,
  MAX_PLAYERS,
  MIN_BID,
  nextInt,
  ownedSquares,
  RAISES,
  SQUARES,
} from "@monopoly/game-engine";
import type {
  Action,
  GameErrorCode,
  GameEvent as EngineEvent,
  GameState,
  RngState,
} from "@monopoly/game-engine";
import {
  actionInputSchema,
  BOARD_SIZE,
  engineErrorCodes,
  gameEventSchema,
  MAX_SEATS,
  redactedGameStateSchema,
} from "./index.ts";
import type { ActionInput, EngineErrorCode, GameEvent, RedactedGameState } from "./index.ts";

// Type-level checks. A drift between an engine type and its schema fails `vp check`.
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

/** Strip `readonly` deeply: the engine types are readonly, `z.infer` output is not. */
type Mutable<T> = T extends readonly unknown[]
  ? number extends T["length"]
    ? Mutable<T[number]>[]
    : { -readonly [K in keyof T]: Mutable<T[K]> }
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type ActionsMatch = Expect<
  Equal<ActionInput, Mutable<DistributiveOmit<Action, "playerId">>>
>;
export type EventsMatch = Expect<Equal<GameEvent, Mutable<EngineEvent>>>;
export type StateMatches = Expect<
  Equal<RedactedGameState, Mutable<Omit<GameState, "rng" | "decks">>>
>;
export type ErrorCodesMatch = Expect<Equal<EngineErrorCode, GameErrorCode>>;

// The check itself must be able to fail.
type EngineInput = Mutable<DistributiveOmit<Action, "playerId">>;
type WithoutResign = Exclude<ActionInput, { type: "Resign" }>;
// @ts-expect-error a missing action is a drift
export type MissingActionIsCaught = Expect<Equal<WithoutResign, EngineInput>>;

const redact = ({ rng: _rng, decks: _decks, ...state }: GameState) => state;

describe("constants", () => {
  test("the shared limits equal the engine limits", () => {
    expect(MAX_SEATS).toBe(MAX_PLAYERS);
    expect(BOARD_SIZE).toBe(ENGINE_BOARD_SIZE);
    expect(BOARD_SIZE).toBe(SQUARES.length);
  });

  test("engineErrorCodes lists every engine GameErrorCode", () => {
    const union = /export type GameErrorCode =([^;]*);/.exec(engineState)?.[1] ?? "";
    const codes = [...union.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(0);
    expect([...engineErrorCodes].sort()).toEqual(codes.sort());
  });
});

describe("a new game", () => {
  test("redactedGameStateSchema parses the createGame state without rng and decks", () => {
    for (let count = 2; count <= MAX_PLAYERS; count++) {
      const players = Array.from({ length: count }, (_, i) => ({
        id: `p${i + 1}`,
        name: `Player ${i + 1}`,
      }));
      const state = createGame({ seed: count, players });
      expect(redactedGameStateSchema.parse(redact(state))).toEqual(redact(state));
    }
  });

  test("the full state is refused: rng and decks must be removed", () => {
    const state = createGame({
      seed: 1,
      players: [
        { id: "a", name: "Ann" },
        { id: "b", name: "Bo" },
      ],
    });
    expect(redactedGameStateSchema.safeParse(state).success).toBe(false);
  });
});

/** The bot's own random numbers, so it does not touch the game's RNG. */
function randomSource(start: RngState) {
  let rng = start;
  return {
    int(max: number) {
      const roll = nextInt(rng, max);
      rng = roll.rng;
      return roll.value;
    },
    pick<T>(list: readonly T[]): T | undefined {
      if (list.length === 0) return undefined;
      const roll = nextInt(rng, list.length);
      rng = roll.rng;
      return list[roll.value];
    },
    get state() {
      return rng;
    },
  };
}
type Random = ReturnType<typeof randomSource>;

interface Choice {
  action: Action;
  /** An optional action may be rejected. The bot then chooses again. */
  optional: boolean;
  rng: RngState;
}

/** Raise cash for a debt: sell a building, else mortgage a property, else pay. */
function debtAction(state: GameState, playerId: string): Action {
  const debt = state.debts.find((d) => d.debtorId === playerId);
  const player = state.players.find((p) => p.id === playerId);
  if (!debt || !player) throw new Error("no debt");
  if (player.cash >= debt.amount) return { type: "PayDebt", playerId };

  const owned = ownedSquares(state, playerId);
  const sellable = owned.find((square) => {
    const info = SQUARES[square];
    const entry = state.ownership[String(square)];
    return (
      info?.kind === "street" &&
      (entry?.houses ?? 0) > 0 &&
      entry?.houses === Math.max(...groupLevels(state, info.group))
    );
  });
  if (sellable !== undefined) return { type: "SellBuilding", playerId, square: sellable };
  const mortgageable = owned.find((square) => !state.ownership[String(square)]?.mortgaged);
  if (mortgageable !== undefined) return { type: "Mortgage", playerId, square: mortgageable };
  throw new Error(`${playerId} cannot raise cash for the debt`);
}

/** A random optional action for a management window: build, mortgage, or propose a trade. */
function manageAction(state: GameState, playerId: string, random: Random): Action | undefined {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return undefined;
  const mine = ownedSquares(state, playerId);
  const candidates: Action[] = [];

  for (const square of mine) {
    const entry = state.ownership[String(square)];
    if (SQUARES[square]?.kind === "street") candidates.push({ type: "Build", playerId, square });
    if (entry && entry.houses > 0) candidates.push({ type: "SellBuilding", playerId, square });
    if (entry?.mortgaged && player.cash > 400) {
      candidates.push({ type: "Unmortgage", playerId, square });
    }
    if (entry && !entry.mortgaged && player.cash < 400) {
      candidates.push({ type: "Mortgage", playerId, square });
    }
  }

  const partner = random.pick(state.players.filter((p) => p.active && p.id !== playerId));
  if (partner) {
    const money = (1 + random.int(6)) * 50;
    const myDeed = random.pick(mine);
    const theirDeed = random.pick(ownedSquares(state, partner.id));
    const trade = (give: object, get: object): Action => ({
      type: "ProposeTrade",
      playerId,
      toPlayerId: partner.id,
      give: { cash: 0, squares: [], jailCards: [], ...give },
      get: { cash: 0, squares: [], jailCards: [], ...get },
    });
    if (myDeed !== undefined) candidates.push(trade({ squares: [myDeed] }, { cash: money }));
    if (theirDeed !== undefined) candidates.push(trade({ cash: money }, { squares: [theirDeed] }));
    if (myDeed !== undefined && theirDeed !== undefined) {
      candidates.push(trade({ squares: [myDeed] }, { squares: [theirDeed] }));
    }
  }
  return random.pick(candidates);
}

/** Pick an action for the player who must act. `resignOdds` is 1 in N per action. */
function choose(state: GameState, start: RngState, resignOdds: number): Choice {
  const random = randomSource(start);
  const playerId = actorFor(state);
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error("no actor");
  const done = (action: Action, optional = false): Choice => ({
    action,
    optional,
    rng: random.state,
  });

  if (random.int(resignOdds) === 0) {
    const quitter = random.pick(state.players.filter((p) => p.active));
    if (quitter) return done({ type: "Resign", playerId: quitter.id }, true);
  }

  switch (state.turn.phase) {
    case "awaiting_debt":
      return done(debtAction(state, playerId));

    case "awaiting_bid": {
      const auction = state.auction;
      const info = auction ? SQUARES[auction.square] : undefined;
      if (!auction || !info || !isProperty(info)) throw new Error("no auction");
      const limit = Math.floor((info.price * (50 + random.int(100))) / 100);
      const amount =
        auction.highBid === 0
          ? MIN_BID * (1 + random.int(5))
          : auction.highBid + (RAISES[random.int(RAISES.length)] ?? 10);
      const bid = amount <= Math.min(player.cash, limit);
      return done(bid ? { type: "Bid", playerId, amount } : { type: "PassBid", playerId });
    }

    case "awaiting_trade_response": {
      const trade = state.trade;
      if (!trade) throw new Error("no trade");
      if (random.int(10) === 0) return done({ type: "CancelTrade", playerId: trade.fromId });
      const type = random.int(2) === 0 ? "AcceptTrade" : "RejectTrade";
      return done({ type, playerId });
    }

    case "awaiting_buy_decision": {
      const info = SQUARES[player.position];
      const price = info && isProperty(info) ? info.price : Infinity;
      const buy = player.cash >= price && random.int(100) < 75;
      return done({ type: buy ? "BuyProperty" : "DeclineProperty", playerId });
    }

    case "game_over":
      throw new Error("The game is over");

    default: {
      if (random.int(100) < 30) {
        const manage = manageAction(state, playerId, random);
        if (manage) return done(manage, true);
      }
      if (state.turn.phase === "awaiting_end_turn") return done({ type: "EndTurn", playerId });
      if (state.turn.phase === "awaiting_jail_choice") {
        const pick = random.int(100);
        if (player.heldJailCards.length > 0 && pick < 50) {
          return done({ type: "UseJailCard", playerId });
        }
        if (player.cash >= JAIL_FINE && pick < 30) return done({ type: "PayJailFine", playerId });
      }
      return done({ type: "RollDice", playerId });
    }
  }
}

interface Run {
  actions: number;
  eventTypes: Set<string>;
  actionTypes: Set<string>;
}

const withoutPlayer = ({ playerId: _playerId, ...input }: Action) => input;

/** Play a seeded game. Every state, event and action goes through the schemas. */
function playGame(seed: number, maxActions: number, resignOdds: number): Run {
  const players = ["a", "b", "c", "d"].map((id) => ({ id, name: `Player ${id}` }));
  let state = createGame({ seed, players });
  expect(redactedGameStateSchema.parse(redact(state))).toEqual(redact(state));
  let rng = createRng(seed + 1000);
  const run: Run = { actions: 0, eventTypes: new Set(), actionTypes: new Set() };

  while (run.actions < maxActions && state.turn.phase !== "game_over") {
    const choice = choose(state, rng, resignOdds);
    rng = choice.rng;
    const result = applyAction(state, choice.action);
    if (!result.ok) {
      if (!choice.optional) throw new Error(`Seed ${seed}: ${choice.action.type} was rejected`);
      continue;
    }
    expect(actionInputSchema.parse(withoutPlayer(choice.action))).toEqual(
      withoutPlayer(choice.action),
    );
    for (const event of result.events) {
      expect(gameEventSchema.parse(event)).toEqual(event);
      run.eventTypes.add(event.type);
    }
    state = result.state;
    expect(redactedGameStateSchema.parse(redact(state))).toEqual(redact(state));
    run.actionTypes.add(choice.action.type);
    run.actions++;
  }
  return run;
}

describe("scripted seeded games", () => {
  // Quick resigns end games early, which covers GameEnded. Rare resigns let games run into
  // bankruptcy, auctions and trades.
  const runs = [
    ...Array.from({ length: 4 }, (_, i) => playGame(i, 6000, 3000)),
    ...Array.from({ length: 4 }, (_, i) => playGame(i + 100, 6000, 150)),
  ];
  const eventTypes = new Set(runs.flatMap((r) => [...r.eventTypes]));
  const actionTypes = new Set(runs.flatMap((r) => [...r.actionTypes]));

  test("the games run for many actions", () => {
    expect(runs.reduce((sum, r) => sum + r.actions, 0)).toBeGreaterThan(2000);
  });

  test("the games produce every event type of the schema", () => {
    const wanted = gameEventSchema.options.map((option) => option.shape.type.value);
    expect(wanted).toHaveLength(31);
    expect(wanted.filter((type) => !eventTypes.has(type))).toEqual([]);
    expect([...eventTypes].filter((type) => !(wanted as string[]).includes(type))).toEqual([]);
  });

  test("the games use every action type of the schema", () => {
    const wanted = actionInputSchema.options.map((option) => option.shape.type.value);
    expect(wanted).toHaveLength(18);
    expect(wanted.filter((type) => !actionTypes.has(type))).toEqual([]);
  });
});
