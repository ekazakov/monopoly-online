import { SQUARES } from "@monopoly/game-engine";
import type { GameEvent, GameState } from "@monopoly/game-engine";
import type { GameResult, Standing } from "@monopoly/shared";

export interface ResultSeat {
  id: string;
  controllerUserId: string;
}

export interface ResultInput {
  gameId: string;
  /** The final state of the game. */
  state: GameState;
  /** Every event of the game, in order. */
  events: readonly GameEvent[];
  seats: readonly ResultSeat[];
}

/**
 * Net worth of a player: cash, plus the price of every owned property (half when mortgaged),
 * plus the build cost of every house and hotel (a hotel counts as five houses).
 */
export function netWorthOf(state: GameState, playerId: string) {
  const player = state.players.find((p) => p.id === playerId);
  let netWorth = player?.cash ?? 0;
  let properties = 0;
  for (const [square, entry] of Object.entries(state.ownership)) {
    if (entry.ownerId !== playerId) continue;
    const info = SQUARES[Number(square)];
    if (info?.kind !== "street" && info?.kind !== "station" && info?.kind !== "utility") continue;
    properties++;
    netWorth += entry.mortgaged ? info.price / 2 : info.price;
    if (info.kind === "street") netWorth += entry.houses * info.buildPrice;
  }
  return { cash: player?.cash ?? 0, properties, netWorth };
}

/**
 * The result of a finished game, or null when the events hold no `GameEnded` (the engine only
 * ends a game with a winner, so this means the log is not a finished game).
 *
 * A round is `1 + floor(TurnEnded events so far / seats at game start)`: the engine has no
 * round counter. `rounds` is the round at the end of the game and `outRound` the round in which
 * a player was eliminated. A player who sent `PlayerResigned` is `resigned`; any other
 * eliminated player is `bankrupt`. Rank 1 is the winner; the others rank by elimination order,
 * so the last one out is 2 and the first one out is last.
 */
export function buildGameResult(input: ResultInput): GameResult | null {
  const { gameId, state, events, seats } = input;
  const count = state.players.length;
  const roundAt = (turnsEnded: number) => 1 + Math.floor(turnsEnded / count);

  let turnsEnded = 0;
  let winnerId: string | null = null;
  const resigned = new Set<string>();
  const out: { id: string; round: number }[] = [];
  for (const event of events) {
    if (event.type === "TurnEnded") turnsEnded++;
    else if (event.type === "PlayerResigned") resigned.add(event.playerId);
    else if (event.type === "PlayerEliminated") {
      out.push({ id: event.playerId, round: roundAt(turnsEnded) });
    } else if (event.type === "GameEnded") winnerId = event.winnerId;
  }
  const winner = state.players.find((p) => p.id === winnerId);
  if (!winner) return null;

  const controllerOf = (id: string) => {
    const seat = seats.find((s) => s.id === id);
    if (!seat) throw new Error(`Game ${gameId} has no seat ${id}`);
    return seat.controllerUserId;
  };
  const standings: Standing[] = [
    {
      rank: 1,
      seatId: winner.id,
      name: winner.name,
      controllerUserId: controllerOf(winner.id),
      status: "winner",
      outRound: null,
      ...netWorthOf(state, winner.id),
    },
  ];
  // The first player out gets the last rank.
  [...out].reverse().forEach(({ id, round }, index) => {
    const player = state.players.find((p) => p.id === id);
    if (!player || id === winner.id) return;
    standings.push({
      rank: index + 2,
      seatId: id,
      name: player.name,
      controllerUserId: controllerOf(id),
      status: resigned.has(id) ? "resigned" : "bankrupt",
      outRound: round,
      cash: 0,
      properties: 0,
      netWorth: 0,
    });
  });
  if (standings.length !== count) {
    throw new Error(`Game ${gameId} ended with ${standings.length} of ${count} players ranked`);
  }
  return {
    gameId,
    rounds: roundAt(turnsEnded),
    winner: { seatId: winner.id, name: winner.name },
    finishedBy: null,
    standings,
  };
}
