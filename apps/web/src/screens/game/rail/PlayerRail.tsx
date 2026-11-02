import { useGame } from "../../../game/index.ts";
import { PlayerRow } from "./PlayerRow.tsx";
import type { PlayerRowProps, SeatDevice } from "./PlayerRow.tsx";
import "./PlayerRail.css";

interface RailEntry {
  key: string;
  row: PlayerRowProps;
}

const GROUPS: { device: "local" | "other"; label: string }[] = [
  { device: "local", label: "This device" },
  { device: "other", label: "Other devices" },
];

// The rail of the game screen (spec 4.3 and 5.3): one row per seat in seat order, grouped by
// device. The group headings show only when both groups exist, since one group needs no label.
export function PlayerRail({ userId }: { userId: string }) {
  const { game, state, mySeats, currentPlayer } = useGame(userId);
  if (!game || !state) return <div className="player-rail" />;

  const mine = new Set(mySeats.map((seat) => seat.id));
  const entries: (RailEntry & { local: boolean })[] = [];
  for (const seat of [...game.seats].sort((a, b) => a.order - b.order)) {
    const player = state.players.find((p) => p.id === seat.id);
    if (!player) continue;
    const local = mine.has(seat.id);
    const device: SeatDevice = !local
      ? "other"
      : seat.kind === "user" && seat.userId === userId
        ? "you"
        : "device";
    const owed = state.debts
      .filter((debt) => debt.debtorId === player.id)
      .reduce((sum, debt) => sum + debt.amount, 0);
    entries.push({
      key: seat.id,
      local,
      row: {
        name: player.name,
        colorIndex: seat.order,
        cash: player.cash,
        device,
        active: currentPlayer?.id === player.id,
        inJail: player.inJail,
        jailCards: player.heldJailCards.length,
        eliminated: !player.active,
        properties: Object.values(state.ownership).filter((deed) => deed.ownerId === player.id)
          .length,
        debt: owed > 0 ? owed : null,
      },
    });
  }

  const groups = GROUPS.map((group) => ({
    ...group,
    entries: entries.filter((entry) => entry.local === (group.device === "local")),
  })).filter((group) => group.entries.length > 0);

  return (
    <div className="player-rail">
      {groups.map((group) => (
        <section key={group.device} className="player-rail__group" aria-label={group.label}>
          {groups.length > 1 && (
            <h2 className="player-rail__heading" aria-hidden="true">
              {group.label}
            </h2>
          )}
          <ul className="player-rail__list">
            {group.entries.map((entry) => (
              <PlayerRow key={entry.key} {...entry.row} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
