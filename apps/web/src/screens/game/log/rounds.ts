import type { GameEvent } from "@monopoly/shared";

/**
 * The round of each event in the log, numbered from 0. It follows the API rule in
 * `apps/api/src/game/result.ts`: a round is `floor(TurnEnded events before the event / seats)`,
 * where the seats are the players at game start. Resigned players do not change that count.
 *
 * `droppedTurnEnds` counts the `TurnEnded` events cut from the start of the log, so the numbers
 * stay right after the log is capped. `startSeats` must be at least 1.
 */
export function roundsOf(
  events: readonly { event: GameEvent }[],
  droppedTurnEnds: number,
  startSeats: number,
): number[] {
  let turnsEnded = droppedTurnEnds;
  return events.map(({ event }) => {
    const round = Math.floor(turnsEnded / startSeats);
    if (event.type === "TurnEnded") turnsEnded++;
    return round;
  });
}
