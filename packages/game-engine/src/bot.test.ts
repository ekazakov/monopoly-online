import { describe, expect, test } from "vite-plus/test";
import {
  actorFor,
  applyAction,
  CHANCE_CARDS,
  CHEST_CARDS,
  createGame,
  createRng,
  groupLevels,
  groupSquares,
  isProperty,
  JAIL_FINE,
  MIN_BID,
  nextInt,
  ownedSquares,
  RAISES,
  SQUARES,
} from "./index.ts";
import type { Action, GameState, RngState } from "./index.ts";

const DECKS = { chance: CHANCE_CARDS, chest: CHEST_CARDS } as const;

function assertInvariants(state: GameState) {
  const active = state.players.filter((p) => p.active);

  for (const p of state.players) {
    expect(p.cash).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(p.position) && p.position >= 0 && p.position < SQUARES.length).toBe(
      true,
    );
    expect(p.inJail ? p.position === 10 : true).toBe(true);
    expect(p.jailTurns).toBeGreaterThanOrEqual(0);
    expect(p.jailTurns).toBeLessThan(3);
    if (!p.active) {
      // An eliminated player has nothing left.
      expect(p.cash).toBe(0);
      expect(p.heldJailCards).toEqual([]);
      expect(ownedSquares(state, p.id)).toEqual([]);
    }
  }

  for (const [square, entry] of Object.entries(state.ownership)) {
    const info = SQUARES[Number(square)];
    expect(info !== undefined && isProperty(info)).toBe(true);
    expect(active.some((p) => p.id === entry.ownerId)).toBe(true);
    expect(Number.isInteger(entry.houses) && entry.houses >= 0 && entry.houses <= 5).toBe(true);
    if (info?.kind !== "street") {
      expect(entry.houses).toBe(0);
      continue;
    }
    const group = groupSquares(info.group);
    const owners = group.map((sq) => state.ownership[String(sq)]?.ownerId);
    const whole = owners.every((id) => id === entry.ownerId);
    if (entry.houses > 0) {
      // Buildings need the whole group, with no mortgage in it.
      expect(whole).toBe(true);
      expect(group.some((sq) => state.ownership[String(sq)]?.mortgaged)).toBe(false);
    }
    if (whole) {
      // Buildings are even: no two streets of a group differ by more than one level.
      const levels = groupLevels(state, info.group);
      expect(Math.max(...levels) - Math.min(...levels)).toBeLessThanOrEqual(1);
    }
  }

  for (const name of ["chance", "chest"] as const) {
    const list = state.decks[name];
    const held = state.players.flatMap((p) => p.heldJailCards).filter((d) => d === name).length;
    const jailIndex = DECKS[name].findIndex((c) => c.effect.type === "jail_free");
    expect(new Set(list).size).toBe(list.length);
    expect(list.length + held).toBe(DECKS[name].length);
    expect(held).toBeLessThanOrEqual(1);
    expect(list.includes(jailIndex)).toBe(held === 0);
  }

  for (const debt of state.debts) {
    expect(debt.amount).toBeGreaterThan(0);
    expect(active.some((p) => p.id === debt.debtorId)).toBe(true);
    if (debt.creditor.type === "player") {
      const creditorId = debt.creditor.id;
      expect(active.some((p) => p.id === creditorId)).toBe(true);
    }
  }
  if (state.turn.phase === "awaiting_debt") {
    expect(state.debts.some((d) => d.debtorId === state.turn.currentPlayerId)).toBe(true);
  }

  expect(state.turn.phase === "awaiting_bid").toBe(state.auction !== null);
  if (state.auction) {
    const { auction } = state;
    expect(auction.bidderOrder).toContain(auction.actorId);
    expect(auction.passed).not.toContain(auction.actorId);
    expect(state.ownership[String(auction.square)]).toBeUndefined();
    if (auction.highBidderId !== null) {
      expect(auction.passed).not.toContain(auction.highBidderId);
      const bidder = state.players.find((p) => p.id === auction.highBidderId);
      expect(bidder?.cash ?? 0).toBeGreaterThanOrEqual(auction.highBid);
    }
  }

  expect(state.turn.phase === "awaiting_trade_response").toBe(state.trade !== null);
  if (state.trade) {
    const { trade } = state;
    expect(active.some((p) => p.id === trade.fromId)).toBe(true);
    expect(active.some((p) => p.id === trade.toId)).toBe(true);
  }

  if (state.turn.phase === "game_over") {
    // Exactly one player is left, and the turn shows the winner.
    expect(active).toHaveLength(1);
    expect(state.turn.currentPlayerId).toBe(active[0]?.id);
  } else {
    expect(active.length).toBeGreaterThanOrEqual(2);
    // While the bank sells a bankrupt player's deeds, the turn still belongs to that player.
    const selling = state.auction?.then === "next_in_queue";
    const current = state.players.find((p) => p.id === state.turn.currentPlayerId);
    expect(current?.active || selling).toBe(true);
  }
}

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

  const partners = state.players.filter((p) => p.active && p.id !== playerId);
  const partner = random.pick(partners);
  if (partner) {
    const theirs = ownedSquares(state, partner.id);
    const money = (1 + random.int(6)) * 50;
    const myDeed = random.pick(mine);
    const theirDeed = random.pick(theirs);
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

/** Pick an action for the player who must act. */
function choose(state: GameState, start: RngState): Choice {
  const random = randomSource(start);
  const playerId = actorFor(state);
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error("no actor");
  const done = (action: Action, optional = false): Choice => ({
    action,
    optional,
    rng: random.state,
  });

  switch (state.turn.phase) {
    case "awaiting_debt":
      return done(debtAction(state, playerId));

    case "awaiting_bid": {
      const auction = state.auction;
      const info = auction ? SQUARES[auction.square] : undefined;
      if (!auction || !info || !isProperty(info)) throw new Error("no auction");
      // Bid up to a random share of the price.
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
  state: GameState;
  actions: number;
  /** Optional actions the rules turned down. */
  rejected: number;
  eventTypes: Set<string>;
}

function playGame(seed: number, maxActions: number): Run {
  let state = createGame({
    seed,
    players: [
      { id: "a", name: "Ann" },
      { id: "b", name: "Bo" },
      { id: "c", name: "Cy" },
      { id: "d", name: "Di" },
    ],
  });
  let rng = createRng(seed + 1000);
  const eventTypes = new Set<string>();
  let actions = 0;
  let rejected = 0;

  while (actions < maxActions && state.turn.phase !== "game_over") {
    const choice = choose(state, rng);
    rng = choice.rng;
    const result = applyAction(state, choice.action);
    if (!result.ok) {
      if (!choice.optional) {
        throw new Error(
          `Seed ${seed}: ${choice.action.type} rejected: ${result.error.code} ${result.error.message}`,
        );
      }
      rejected++;
      continue;
    }
    expect(result.state.version).toBe(state.version + 1);
    result.events.forEach((e) => eventTypes.add(e.type));
    state = result.state;
    actions++;
    assertInvariants(state);
  }
  return { state, actions, rejected, eventTypes };
}

describe("random bot games", () => {
  const seeds = Array.from({ length: 16 }, (_, i) => i);
  const runs = seeds.map((seed) => playGame(seed, 20000));

  test("invariants hold in every state of every game", () => {
    expect(runs.every((r) => r.actions > 0)).toBe(true);
  });

  test("the bot reaches every rule", () => {
    const seen = new Set(runs.flatMap((r) => [...r.eventTypes]));
    const expected = [
      "DiceRolled",
      "PlayerMoved",
      "PassedGo",
      "PropertyBought",
      "RentPaid",
      "TaxPaid",
      "CardDrawn",
      "CashChanged",
      "SentToJail",
      "LeftJail",
      "FinePaid",
      "TurnEnded",
      "BuildingBuilt",
      "BuildingSold",
      "PropertyMortgaged",
      "PropertyUnmortgaged",
      "DebtIncurred",
      "DebtPaid",
      "BankruptcyDeclared",
      "AssetsTransferred",
      "PlayerEliminated",
      "AuctionStarted",
      "BidPlaced",
      "BidPassed",
      "AuctionEnded",
      "TradeProposed",
      "TradeAccepted",
      "TradeRejected",
      "TradeCancelled",
      "GameEnded",
    ];
    expect(expected.filter((type) => !seen.has(type))).toEqual([]);
  });

  test("most games end with exactly one winner", () => {
    const ended = runs.filter((r) => r.state.turn.phase === "game_over");
    expect(ended.length).toBeGreaterThanOrEqual(runs.length * 0.75);
    for (const run of ended) {
      const winners = run.state.players.filter((p) => p.active);
      expect(winners).toHaveLength(1);
      expect(run.state.turn.currentPlayerId).toBe(winners[0]?.id);
    }
  });

  test("games run for many turns", () => {
    const total = runs.reduce((sum, r) => sum + r.actions, 0);
    expect(total).toBeGreaterThan(10000);
  });

  test("the same seed gives the same game", () => {
    const again = playGame(7, 20000);
    const first = runs[7];
    expect(again.actions).toBe(first?.actions);
    expect(again.state).toEqual(first?.state);
  });

  test("final states are plain JSON", () => {
    for (const run of runs) {
      expect(JSON.parse(JSON.stringify(run.state))).toEqual(run.state);
    }
  });
});
