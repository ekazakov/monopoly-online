import { act, render, screen, within } from "@testing-library/react";
import type { GameEvent } from "@monopoly/shared";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { GameStoreProvider } from "../../../game/GameStoreProvider.tsx";
import { actionsMessage, recordFixture, redact, snapshotMessage } from "../../../game/fixtures.ts";
import type { Step } from "../../../game/fixtures.ts";
import { createGameStore } from "../../../game/store.ts";
import { TOAST_MS, TurnToast } from "./index.ts";

const fx = recordFixture(1);
const { a, b } = fx.seats;
const start = redact(fx.start);

const turnEnded = (playerId: string, nextPlayerId: string): GameEvent =>
  ({ type: "TurnEnded", playerId, nextPlayerId }) as GameEvent;

/** An accepted action with the given events at `version`. Only `state` and `events` are read. */
function step(version: number, events: GameEvent[]): Step {
  return { state: { ...start, version }, events } as unknown as Step;
}

function setup(userId = fx.ownerId) {
  const store = createGameStore();
  act(() => store.applyStreamMessage(snapshotMessage(fx.game, start)));
  render(
    <GameStoreProvider store={store}>
      <div className="game-layout">
        <div className="game-layout__regions">
          <div className="game-layout__top">
            <button type="button">Menu</button>
          </div>
          <div className="game-layout__centre">
            <button type="button">Roll</button>
          </div>
          <div className="game-layout__hand">
            <button type="button">Hand</button>
          </div>
        </div>
        <TurnToast userId={userId} />
      </div>
    </GameStoreProvider>,
  );
  const apply = (version: number, events: GameEvent[]) =>
    act(() => store.applyStreamMessage(actionsMessage(fx.game, step(version, events))));
  return { store, apply };
}

const notice = () => screen.queryByText(/ 's turn\.|'s turn\./);

describe("TurnToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("the live region is always there, and empty while no turn has changed", () => {
    setup();
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();
  });

  test("a turn change shows the name of the next player on every device", () => {
    const { apply } = setup(fx.guestId);
    apply(1, [turnEnded(a.id, b.id)]);
    expect(screen.getByRole("status")).toHaveTextContent(`It's ${b.name}'s turn.`);
  });

  test("the notice shows the name and the sentence, with no button", () => {
    const { apply } = setup();
    apply(1, [turnEnded(a.id, b.id)]);
    expect(screen.getByRole("status")).toHaveTextContent(b.name);
    expect(within(screen.getByRole("status")).queryByRole("button")).toBeNull();
  });

  test("the notice closes by itself after its run", () => {
    const { apply } = setup();
    apply(1, [turnEnded(a.id, b.id)]);
    act(() => {
      vi.advanceTimersByTime(TOAST_MS - 1);
    });
    expect(notice()).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(notice()).toBeNull();
  });

  test("the action controls are disabled while the notice shows, and the top bar stays usable", () => {
    const { apply } = setup();
    const centre = () => document.querySelector(".game-layout__centre");
    const hand = () => document.querySelector(".game-layout__hand");
    const top = () => document.querySelector(".game-layout__top");
    expect(centre()).not.toHaveAttribute("inert");
    apply(1, [turnEnded(a.id, b.id)]);
    expect(centre()).toHaveAttribute("inert");
    expect(hand()).toHaveAttribute("inert");
    expect(top()).not.toHaveAttribute("inert");
    act(() => {
      vi.advanceTimersByTime(TOAST_MS);
    });
    expect(centre()).not.toHaveAttribute("inert");
    expect(hand()).not.toHaveAttribute("inert");
  });

  test("a notice of a later turn shows again after an earlier one was closed", () => {
    const { apply } = setup();
    apply(1, [turnEnded(a.id, b.id)]);
    act(() => {
      vi.advanceTimersByTime(TOAST_MS);
    });
    apply(2, [turnEnded(b.id, a.id)]);
    expect(screen.getByRole("status")).toHaveTextContent(`It's ${a.name}'s turn.`);
  });

  test("a reload shows no notice, because the snapshot has no events", () => {
    const store = createGameStore();
    render(
      <GameStoreProvider store={store}>
        <TurnToast userId={fx.ownerId} />
      </GameStoreProvider>,
    );
    act(() => store.applyStreamMessage(snapshotMessage(fx.game, { ...start, version: 9 })));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  test("an action with no turn change shows no notice", () => {
    const { apply } = setup();
    apply(1, [{ type: "DiceRolled", playerId: a.id, dice: [2, 3] } as GameEvent]);
    expect(notice()).toBeNull();
  });
});
