import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { mySeats, useGameSelector } from "../../../game/index.ts";
import type { Token } from "@monopoly/shared";
import { tokenLook } from "../../../scene/colors.ts";
import { describeEvent, playerName } from "./describe.ts";
import { LogIcon } from "./LogIcon.tsx";
import "./GameLog.css";

// Token colours for player names on the log bar (4.5:1 or better). The values are `--log-name-*`
// in GameLog.css, lifted on the dark bar and darker on the light one.
const NAME_COLORS: Record<Token, string> = {
  dog: "var(--log-name-dog)",
  cat: "var(--log-name-cat)",
  penguin: "var(--log-name-penguin)",
  car: "var(--log-name-car)",
  horse: "var(--log-name-horse)",
  duck: "var(--log-name-duck)",
};

// How far from the end still counts as "at the end", for fractional scroll positions.
const END_SLACK = 8;

export interface GameLogProps {
  userId: string;
}

// The game log (spec 4.1 and 5.1). The latest line shows when it is closed; the whole scrollback
// shows when it is open. The panel is absolute, so an open log drops over the board and the layout
// row keeps its height. Lines are in time order in the DOM, so a screen reader reads new ones last.
export function GameLog({ userId }: GameLogProps) {
  const game = useGameSelector((s) => s.game);
  const events = useGameSelector((s) => s.events);
  const dropped = useGameSelector((s) => s.droppedEvents);

  const [open, setOpen] = useState(false);
  const [atEnd, setAtEnd] = useState(true);
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // Whether new lines keep the list at its end. Scrolling up turns it off, reaching the end on.
  const following = useRef(true);
  // Lines that were there when the state first loaded do not flash, also when the log mounts before
  // the snapshot arrives: a line is new only when its version is later than the first state version.
  const stateVersion = useGameSelector((s) => s.state?.version ?? null);
  const [baseVersion, setBaseVersion] = useState<number | null>(stateVersion);
  if (baseVersion === null && stateVersion !== null) setBaseVersion(stateVersion);

  const seats = game?.seats;
  const ctx = useMemo(() => ({ seats: seats ?? [] }), [seats]);
  const lines = useMemo(() => {
    return events.map(({ event, version }, i) => ({
      key: dropped + i,
      fresh: baseVersion !== null && version > baseVersion,
      line: describeEvent(event, ctx),
    }));
  }, [events, dropped, ctx, baseVersion]);
  const tokenOf = useMemo(() => new Map(seats?.map((s) => [s.id, s.token])), [seats]);
  const mine = useMemo(() => new Set(mySeats(game, userId).map((s) => s.id)), [game, userId]);

  const scrollToEnd = () => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  };

  useLayoutEffect(() => {
    if (following.current) scrollToEnd();
  }, [lines.length]);

  // Opening or closing starts at the latest line, which is all the closed log shows.
  useLayoutEffect(() => {
    following.current = true;
    scrollToEnd();
  }, [open]);

  const setOpenAt = (value: boolean) => {
    setAtEnd(true);
    setOpen(value);
  };

  const onScroll = () => {
    const list = listRef.current;
    if (!list) return;
    const end = list.scrollHeight - list.scrollTop - list.clientHeight <= END_SLACK;
    following.current = end;
    setAtEnd(end);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !open) return;
    event.stopPropagation();
    setOpenAt(false);
    toggleRef.current?.focus();
  };

  const jumpToLatest = () => {
    following.current = true;
    setAtEnd(true);
    scrollToEnd();
    listRef.current?.focus();
  };

  const colorOf = (playerId: string) => {
    const token = tokenOf.get(playerId);
    return token === undefined ? undefined : NAME_COLORS[token];
  };

  return (
    <div className="game-log" data-open={open} onKeyDown={onKeyDown}>
      <div className="game-log__panel">
        <div className="game-log__row">
          <div
            ref={listRef}
            id={listId}
            className="game-log__list"
            role="log"
            aria-label="Game log"
            aria-live="polite"
            aria-relevant="additions"
            tabIndex={open ? 0 : -1}
            onScroll={onScroll}
          >
            {dropped > 0 && (
              <p className="game-log__line game-log__note">Earlier entries are not shown.</p>
            )}
            {lines.length === 0 && <p className="game-log__line game-log__note">No events yet.</p>}
            {lines.map(({ key, line, fresh }) => (
              <p
                key={key}
                className="game-log__line"
                data-tone={line.tone}
                data-fresh={fresh}
                data-mine={line.playerId !== null && mine.has(line.playerId)}
              >
                <span
                  className="game-log__dot"
                  aria-hidden="true"
                  style={
                    line.playerId !== null && tokenOf.has(line.playerId)
                      ? { background: tokenLook(tokenOf.get(line.playerId)!).cssColor }
                      : undefined
                  }
                />
                {line.icon && <LogIcon name={line.icon} />}
                <span className="game-log__text">
                  {line.parts.map((part, i) =>
                    typeof part === "string" ? (
                      part
                    ) : (
                      <b
                        key={i}
                        className="game-log__name"
                        style={{ color: colorOf(part.playerId) }}
                      >
                        {playerName(ctx, part.playerId)}
                      </b>
                    ),
                  )}
                </span>
              </p>
            ))}
          </div>
          <button
            ref={toggleRef}
            type="button"
            className="game-log__toggle"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={open ? "Collapse game log" : "Expand game log"}
            onClick={() => setOpenAt(!open)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M5 8l5 5 5-5" />
            </svg>
          </button>
        </div>
        {open && !atEnd && (
          <button type="button" className="game-log__jump" onClick={jumpToLatest}>
            Jump to latest
          </button>
        )}
      </div>
    </div>
  );
}
