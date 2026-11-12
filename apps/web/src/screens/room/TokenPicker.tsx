import { TOKENS } from "@monopoly/shared";
import type { Game, Seat, Token } from "@monopoly/shared";
import type { CSSProperties } from "react";
import { useT } from "../../i18n/index.ts";
import { tokenLook } from "../../scene/colors.ts";
import { AvatarIcon } from "../game/rail/avatars.tsx";

interface Props {
  game: Game;
  userId: string;
  /** The seat whose token change is on its way, if any. */
  pendingSeatId: string | null;
  onPick: (seat: Seat, token: Token) => void;
}

/** The seats whose token this user can change: their own seat and the hot-seat seats they added. */
export const controlledSeats = (game: Game, userId: string): Seat[] =>
  game.seats.filter((seat) => seat.controllerUserId === userId);

/**
 * One picker for each seat that this device controls (boards LobbyHost and LobbyGuest, "Your
 * token"). A figure that another seat has is disabled and says who has it; the figure of the seat
 * is pressed. The server decides a race, so a refused pick leaves the old figure in place.
 */
export function TokenPicker({ game, userId, pendingSeatId, onPick }: Props) {
  const t = useT();
  const seats = controlledSeats(game, userId);
  if (seats.length === 0) return null;
  const several = seats.length > 1;
  return (
    <section className="room__panel" aria-labelledby="room-tokens">
      <h2 id="room-tokens" className="room__h2">
        {several ? t("room.tokens.several") : t("room.tokens.yours")}
      </h2>
      <p className="room__text">{t("room.tokens.text")}</p>
      {seats.map((seat) => {
        const label =
          seat.userId === userId
            ? t("room.tokens.yours")
            : t("room.tokens.of", { name: seat.name });
        return (
          <div
            key={seat.id}
            role="group"
            aria-label={label}
            aria-busy={pendingSeatId === seat.id || undefined}
            className="room__token-group"
          >
            {several && <h3 className="room__h3">{label}</h3>}
            <div className="room__tokens">
              {TOKENS.map((token) => {
                const look = tokenLook(token);
                const tokenName = t(`token.${token}.label`);
                const owner = game.seats.find((s) => s.token === token);
                const taken = owner !== undefined && owner.id !== seat.id;
                return (
                  <button
                    key={token}
                    type="button"
                    className="room__token"
                    style={{ "--token-color": look.cssColor } as CSSProperties}
                    aria-pressed={seat.token === token}
                    aria-label={
                      taken
                        ? t("room.tokens.taken", { token: tokenName, name: owner.name })
                        : tokenName
                    }
                    disabled={taken}
                    // A pick that is on its way blocks another one, but keeps the focus here.
                    onClick={() => pendingSeatId === null && onPick(seat, token)}
                  >
                    <AvatarIcon kind={look.avatar} size={30} />
                    <span className="room__token-name">
                      {taken ? owner.name : t(`token.${token}.short`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
