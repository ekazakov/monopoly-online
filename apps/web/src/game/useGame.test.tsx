import { act, render, renderHook, screen } from "@testing-library/react";
import { actorFor } from "@monopoly/game-engine";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vite-plus/test";
import { GameStoreProvider } from "./GameStoreProvider.tsx";
import { actionsMessage, recordFixture, redact, roomMessage, snapshotMessage } from "./fixtures.ts";
import { createGameStore } from "./store.ts";
import {
  useGame,
  useGameSelector,
  useGameSnapshot,
  useGameStore,
  useHotSeatHandoff,
  useMayAct,
} from "./useGame.ts";

const fx = recordFixture(12);
const start = snapshotMessage(fx.game, redact(fx.start));

function setup() {
  const store = createGameStore();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <GameStoreProvider store={store}>{children}</GameStoreProvider>
  );
  return { store, wrapper };
}

describe("GameStoreProvider", () => {
  test("makes its own store when none is given", () => {
    function Probe() {
      useGameStore();
      return <p>{useGameSnapshot().status}</p>;
    }
    render(
      <GameStoreProvider>
        <Probe />
      </GameStoreProvider>,
    );
    expect(screen.getByText("idle")).toBeInTheDocument();
  });

  test("the hooks throw outside a provider", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useGameStore())).toThrow("GameStoreProvider");
    error.mockRestore();
  });
});

describe("useGame", () => {
  test("follows the store and derives the view for the user", () => {
    const { store, wrapper } = setup();
    const { result } = renderHook(() => useGame(fx.ownerId), { wrapper });
    expect(result.current).toMatchObject({
      status: "idle",
      game: null,
      mySeats: [],
      isMyTurn: false,
    });

    act(() => store.applyStreamMessage(start));
    const actor = actorFor(fx.start);
    const mine = fx.game.seats.filter((s) => s.controllerUserId === fx.ownerId).map((s) => s.id);
    expect(result.current.status).toBe("ready");
    expect(result.current.mySeats.map((s) => s.id)).toEqual(mine);
    expect(result.current.actingSeat?.id).toBe(actor);
    expect(result.current.isMyTurn).toBe(mine.includes(actor));
    expect(result.current.phase).toBe("awaiting_roll");

    const step = fx.steps[0];
    if (!step) throw new Error("no step");
    act(() => store.applyStreamMessage(actionsMessage(fx.game, step)));
    expect(result.current.version).toBe(1);
    expect(result.current.lastActionEvents).toEqual(step.events);
    expect(result.current.events.length).toBe(step.events.length);
  });

  test("keeps the seats array while the room does not change", () => {
    const { store, wrapper } = setup();
    const { result } = renderHook(() => useGame(fx.ownerId), { wrapper });
    act(() => store.applyStreamMessage(start));
    const seats = result.current.mySeats;
    const step = fx.steps[0];
    if (!step) throw new Error("no step");
    act(() => store.applyStreamMessage(actionsMessage(fx.game, step)));
    expect(result.current.mySeats).toBe(seats);
  });

  test("reads the connection set from outside", () => {
    const { store, wrapper } = setup();
    const { result } = renderHook(() => useGame(null), { wrapper });
    act(() => store.setConnection("reconnecting"));
    expect(result.current.connection).toBe("reconnecting");
  });

  test("flags a gap", () => {
    const { store, wrapper } = setup();
    const { result } = renderHook(() => useGame(null), { wrapper });
    const step = fx.steps[3];
    if (!step) throw new Error("no step");
    act(() => {
      store.applyStreamMessage(start);
      store.applyStreamMessage(actionsMessage(fx.game, step));
    });
    expect(result.current.gapDetected).toBe(true);
    expect(result.current.version).toBe(4);
  });
});

describe("useGameSelector", () => {
  test("accepts a selector that builds a new array each time", () => {
    const { store, wrapper } = setup();
    let renders = 0;
    const { result } = renderHook(
      () => {
        renders++;
        return useGameSelector(
          (s) => s.events.map((e) => e.version),
          (a, b) => a.join() === b.join(),
        );
      },
      { wrapper },
    );
    expect(result.current).toEqual([]);
    const before = renders;
    act(() => store.setConnection("open"));
    expect(result.current).toEqual([]);
    expect(renders - before).toBeLessThanOrEqual(1);
  });

  test("a selector with no equality function works when it returns a new array", () => {
    const { store, wrapper } = setup();
    const { result } = renderHook(() => useGameSelector((s) => [s.version]), { wrapper });
    act(() => store.applyStreamMessage(start));
    expect(result.current).toEqual([0]);
  });
});

describe("useMayAct", () => {
  test("is true for the controller of the acting seat", () => {
    const { store, wrapper } = setup();
    const actor = fx.game.seats.find((s) => s.id === actorFor(fx.start));
    if (!actor) throw new Error("no actor");
    const other = actor.controllerUserId === fx.ownerId ? fx.guestId : fx.ownerId;
    const { result } = renderHook(
      () => ({ yes: useMayAct(actor.controllerUserId), no: useMayAct(other, "RollDice") }),
      { wrapper },
    );
    expect(result.current).toEqual({ yes: false, no: false });
    act(() => store.applyStreamMessage(start));
    expect(result.current).toEqual({ yes: true, no: false });
  });
});

describe("useHotSeatHandoff", () => {
  test("asks for a handoff when the turn moves to another seat of this device", () => {
    const { store, wrapper } = setup();
    const { result } = renderHook(() => useHotSeatHandoff(fx.ownerId), { wrapper });
    const mine = new Set(
      fx.game.seats.filter((s) => s.controllerUserId === fx.ownerId).map((s) => s.id),
    );

    act(() => store.applyStreamMessage(start));
    expect(result.current.pending).toBeNull();

    let previous = actorFor(fx.start);
    const handoffs: { expected: string; pending: string | undefined; after: string | undefined }[] =
      [];
    const remote: (string | undefined)[] = [];
    for (const step of fx.steps) {
      act(() => store.applyStreamMessage(actionsMessage(fx.game, step)));
      const next = actorFor(step.full);
      if (next !== previous && mine.has(previous) && mine.has(next)) {
        const pending = result.current.pending?.id;
        act(() => result.current.confirm());
        handoffs.push({ expected: next, pending, after: result.current.pending?.id });
      } else if (next !== previous) {
        remote.push(result.current.pending?.id);
      }
      previous = next;
    }
    // The seeded game must exercise both cases.
    expect(handoffs.length).toBeGreaterThan(0);
    expect(remote.length).toBeGreaterThan(0);
    expect(handoffs.every((h) => h.pending === h.expected && h.after === undefined)).toBe(true);
    expect(remote.every((id) => id === undefined)).toBe(true);
  });

  test("a room change does not start a handoff", () => {
    const { store, wrapper } = setup();
    const { result } = renderHook(() => useHotSeatHandoff(fx.ownerId), { wrapper });
    act(() => store.applyStreamMessage(start));
    act(() => store.applyStreamMessage(roomMessage({ ...fx.game, name: "Renamed" })));
    expect(result.current.pending).toBeNull();
  });
});
