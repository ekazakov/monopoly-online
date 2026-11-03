import type { ActionOf } from "./actions.ts";
import { BOARD_SIZE, isProperty, SQUARES } from "./board.ts";
import { updatePlayer } from "./helpers.ts";
import { removeEntry, setEntry } from "./ownership.ts";
import { fail } from "./state.ts";
import type { DebugChange, GameEvent, GameState, Result } from "./state.ts";

/**
 * The player on turn edits the state from the debug panel. One action holds a batch of changes.
 * They apply in order, and the batch is all or nothing: the first bad change refuses the action.
 * Only the shape of a change is checked: uneven building and buildings without the full group
 * are allowed. A token move is a teleport: no landing, no Start salary, and no `PlayerMoved`, so
 * the client does not animate it. Each change gives one `StateEdited` event.
 */
export function handleDebugEdit(state: GameState, action: ActionOf<"DebugEdit">): Result {
  if (action.changes.length === 0) return fail("invalid_edit", "Send at least one change");
  let next = state;
  const events: GameEvent[] = [];
  for (const change of action.changes) {
    const edited = applyChange(next, change);
    if (!edited.ok) return edited;
    next = edited.state;
    events.push({ type: "StateEdited", playerId: action.playerId, change });
  }
  return { ok: true, state: next, events };
}

function applyChange(state: GameState, change: DebugChange): Result {
  switch (change.kind) {
    case "cash": {
      const invalid = checkTarget(state, change.targetId);
      if (invalid) return invalid;
      if (!Number.isInteger(change.cash) || change.cash < 0) {
        return fail("invalid_edit", "Cash must be a whole number, 0 or more");
      }
      return done(updatePlayer(state, change.targetId, { cash: change.cash }));
    }
    case "deed":
      return editDeed(state, change);
    case "position": {
      const invalid = checkTarget(state, change.targetId);
      if (invalid) return invalid;
      if (!Number.isInteger(change.square) || change.square < 0 || change.square >= BOARD_SIZE) {
        return fail("invalid_edit", `No square at ${change.square}`);
      }
      // A jailed player who is moved leaves Jail. On their own turn they then roll as usual.
      const moved = updatePlayer(state, change.targetId, {
        position: change.square,
        inJail: false,
        jailTurns: 0,
      });
      const freedOnTurn =
        state.turn.phase === "awaiting_jail_choice" &&
        state.turn.currentPlayerId === change.targetId;
      return done(
        freedOnTurn ? { ...moved, turn: { ...moved.turn, phase: "awaiting_roll" } } : moved,
      );
    }
  }
}

function editDeed(state: GameState, change: Extract<DebugChange, { kind: "deed" }>): Result {
  const square = SQUARES[change.square];
  if (!square || !isProperty(square)) {
    return fail("not_a_property", `Square ${change.square} is not a property`);
  }
  if (change.ownerId === null) return done(removeEntry(state, change.square));
  const invalid = checkTarget(state, change.ownerId);
  if (invalid) return invalid;
  if (!Number.isInteger(change.houses) || change.houses < 0 || change.houses > 5) {
    return fail("max_buildings", "Buildings must be 0 to 4 houses, or 5 for a hotel");
  }
  if (change.houses > 0 && square.kind !== "street") {
    return fail("not_a_street", "Only streets have buildings");
  }
  if (change.houses > 0 && change.mortgaged) {
    return fail("has_buildings", "A mortgaged deed cannot have buildings");
  }
  return done(
    setEntry(state, change.square, {
      ownerId: change.ownerId,
      houses: change.houses,
      mortgaged: change.mortgaged,
    }),
  );
}

function checkTarget(state: GameState, playerId: string): Result | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return fail("unknown_player", `Unknown player: ${playerId}`);
  if (!player.active) return fail("player_inactive", "Eliminated players cannot be edited");
  return null;
}

const done = (state: GameState): Result => ({ ok: true, state, events: [] });
