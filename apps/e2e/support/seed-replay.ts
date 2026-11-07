import {
  applyAction,
  createGame,
  type Action,
  type GameState,
} from "../../../packages/game-engine/src/index.ts";

export const SEED_PLAYERS = ["Alice", "Bob", "Cara", "Dan", "Eve", "Finn"];

export function seedGame(seed: number, players: number): GameState {
  return createGame({
    seed,
    players: SEED_PLAYERS.slice(0, players).map((name) => ({ id: name, name })),
  });
}

export function checkedAction(state: GameState, action: Action) {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${action.type}: ${result.error.code}: ${result.error.message}`);
  return result;
}

/** Pure engine replay for the seed guard and finder. Uses the browser plan's buy policy. */
export function replaySeed(seed: number, players: number, count: number) {
  let state = seedGame(seed, players);
  const turnOrder = state.players.map((player) => player.name);
  const rolls: Array<{
    player: string;
    dice: readonly [number, number];
    square: number;
    phase: string;
  }> = [];
  for (let steps = 0; rolls.length < count && steps < count * 40; steps++) {
    const playerId = state.turn.currentPlayerId;
    let action: Action;
    switch (state.turn.phase) {
      case "awaiting_roll":
        action = { type: "RollDice", playerId };
        break;
      case "awaiting_buy_decision":
        action = { type: "BuyProperty", playerId };
        break;
      case "awaiting_end_turn":
        action = { type: "EndTurn", playerId };
        break;
      case "awaiting_jail_choice":
        action = { type: "PayJailFine", playerId };
        break;
      case "awaiting_bid":
        if (!state.auction) throw new Error("No auction in awaiting_bid");
        action = { type: "PassBid", playerId: state.auction.actorId };
        break;
      default:
        throw new Error(`Buy policy stopped in ${state.turn.phase} after ${rolls.length} rolls`);
    }
    const result = checkedAction(state, action);
    state = result.state;
    const roll = result.events.find((event) => event.type === "DiceRolled");
    if (roll?.type === "DiceRolled") {
      const player = state.players.find((candidate) => candidate.id === playerId);
      if (!player) throw new Error(`Missing player ${playerId}`);
      rolls.push({
        player: player.name,
        dice: roll.dice,
        square: player.position,
        phase: state.turn.phase,
      });
    }
  }
  if (rolls.length !== count) throw new Error(`Could only play ${rolls.length} of ${count} rolls`);
  return { turnOrder, rolls, state };
}
