import { act, cleanup, render, screen, within } from "@testing-library/react";
import type { RedactedGameState } from "@monopoly/shared";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { GameStoreProvider } from "../../../game/GameStoreProvider.tsx";
import {
  actionsMessage,
  presenceMessage,
  recordFixture,
  redact,
  roomMessage,
  snapshotMessage,
} from "../../../game/fixtures.ts";
import type { Fixture, Step } from "../../../game/fixtures.ts";
import { createGameStore } from "../../../game/store.ts";
import { CASH_FLASH_MS, formatMoney } from "./PlayerRow.tsx";
import { PlayerRail, PlayerRow } from "./index.ts";
import type { PlayerRowProps } from "./index.ts";

const fx = recordFixture(40);
const start = redact(fx.start);

function setup(userId: string, state: RedactedGameState | null = start, game = fx.game) {
  const store = createGameStore();
  act(() => store.applyStreamMessage(snapshotMessage(game, state)));
  render(
    <GameStoreProvider store={store}>
      <PlayerRail userId={userId} />
    </GameStoreProvider>,
  );
  return store;
}

/** The row of a player, found by the name text. */
const rowOf = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

const withPlayer = (
  state: RedactedGameState,
  id: string,
  fields: Partial<RedactedGameState["players"][number]>,
): RedactedGameState => ({
  ...state,
  players: state.players.map((p) => (p.id === id ? { ...p, ...fields } : p)),
});

const playerNamed = (name: string) => start.players.find((p) => p.name === name)!;

afterEach(() => {
  vi.useRealTimers();
});

describe("PlayerRail", () => {
  test("lists the seats in seat order inside each device group", () => {
    setup(fx.ownerId);
    const names = (group: string) =>
      within(screen.getByRole("region", { name: group }))
        .getAllByRole("listitem")
        .map((li) => li.querySelector(".player-row__name-text")?.textContent);
    expect(names("This device")).toEqual(["Ann", "Cy"]);
    expect(names("Other devices")).toEqual(["Bo"]);
  });

  test("shows the cash of every player", () => {
    setup(fx.ownerId);
    for (const p of start.players) {
      expect(within(rowOf(p.name)).getByText(formatMoney(p.cash))).toBeInTheDocument();
    }
  });

  test("marks the player on turn with aria-current, a tag and no other row", () => {
    setup(fx.ownerId);
    const current = start.players.find((p) => p.id === start.turn.currentPlayerId)!;
    const rows = screen.getAllByRole("listitem");
    expect(rows.filter((r) => r.getAttribute("aria-current") === "true")).toEqual([
      rowOf(current.name),
    ]);
    expect(within(rowOf(current.name)).getByText("Turn")).toBeInTheDocument();
    expect(screen.getAllByText("Turn")).toHaveLength(1);
  });

  test("moves the turn marker when the turn moves", () => {
    const store = setup(fx.ownerId);
    const next = fx.steps.find((s) => s.state.turn.currentPlayerId !== start.turn.currentPlayerId)!;
    act(() => store.applyStreamMessage(snapshotMessage(fx.game, next.state)));
    const current = next.state.players.find((p) => p.id === next.state.turn.currentPlayerId)!;
    expect(rowOf(current.name)).toHaveAttribute("aria-current", "true");
    expect(screen.getAllByText("Turn")).toHaveLength(1);
  });

  test("shows the jail marker and the jail cards", () => {
    const [a, b] = [playerNamed("Ann"), playerNamed("Bo")];
    const state = withPlayer(withPlayer(start, a!.id, { inJail: true }), b!.id, {
      heldJailCards: ["chance", "chest"],
    });
    setup(fx.ownerId, state);
    expect(within(rowOf(a!.name)).getByText("In jail")).toBeInTheDocument();
    expect(within(rowOf(b!.name)).queryByText("In jail")).toBeNull();
    expect(within(rowOf(b!.name)).getByText("2 jail cards")).toBeInTheDocument();
  });

  test("dims an eliminated player and says so in text", () => {
    const b = playerNamed("Bo");
    setup(fx.ownerId, withPlayer(start, b!.id, { active: false, cash: 0, inJail: true }));
    const row = rowOf(b!.name);
    expect(row).toHaveAttribute("data-eliminated", "true");
    expect(within(row).getByText("Bankrupt")).toBeInTheDocument();
    expect(within(row).queryByText("In jail")).toBeNull();
    expect(row).not.toHaveAttribute("aria-current");
  });

  test("does not mark an eliminated player as on turn", () => {
    const current = start.players.find((p) => p.id === start.turn.currentPlayerId)!;
    setup(fx.ownerId, withPlayer(start, current.id, { active: false }));
    expect(screen.queryByText("Turn")).toBeNull();
  });

  test("shows the debt of a player", () => {
    const a = playerNamed("Ann");
    const state: RedactedGameState = {
      ...start,
      debts: [
        {
          debtorId: a!.id,
          creditor: { type: "bank" },
          amount: 250,
          reason: "tax",
          then: "finish_roll",
        },
      ],
    };
    setup(fx.ownerId, state);
    expect(within(rowOf(a!.name)).getByText("Owes $250")).toBeInTheDocument();
  });

  test("labels the own seat and the hot-seat seat, and groups the others", () => {
    setup(fx.ownerId);
    const own = within(rowOf("Ann"));
    expect(own.getByText("You")).toBeInTheDocument();
    expect(own.queryByText("This device")).toBeNull();
    expect(within(rowOf("Cy")).getByText("This device")).toBeInTheDocument();
    expect(within(rowOf("Cy")).queryByText("You")).toBeNull();
    const other = within(rowOf("Bo"));
    expect(other.queryByText("You")).toBeNull();
    expect(other.queryByText("This device")).toBeNull();

    const here = screen.getByRole("region", { name: "This device" });
    const there = screen.getByRole("region", { name: "Other devices" });
    expect(within(here).getAllByRole("listitem")).toHaveLength(2);
    expect(within(there).getAllByRole("listitem")).toHaveLength(1);
  });

  test("labels the seats from the point of view of the guest", () => {
    setup(fx.guestId);
    expect(within(rowOf("Bo")).getByText("You")).toBeInTheDocument();
    expect(within(rowOf("Ann")).queryByText("You")).toBeNull();
    expect(within(rowOf("Cy")).queryByText("This device")).toBeNull();
    expect(screen.getByRole("region", { name: "This device" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Other devices" })).getAllByRole("listitem"),
    ).toHaveLength(2);
  });

  test("shows one group and no heading when all seats are on this device", () => {
    const solo = {
      ...fx.game,
      seats: fx.game.seats.map((s) => ({
        ...s,
        kind: "hotseat" as const,
        userId: null,
        controllerUserId: fx.ownerId,
      })),
    };
    setup(fx.ownerId, start, solo);
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(screen.queryByRole("heading")).toBeNull();
  });

  test("counts the properties of each player", () => {
    const [a, b] = [playerNamed("Ann"), playerNamed("Bo")];
    const state: RedactedGameState = {
      ...start,
      ownership: {
        "1": { ownerId: a!.id, houses: 0, mortgaged: false },
        "3": { ownerId: a!.id, houses: 0, mortgaged: true },
        "5": { ownerId: b!.id, houses: 0, mortgaged: false },
      },
    };
    setup(fx.ownerId, state);
    expect(within(rowOf(a!.name)).getByText("2 properties")).toBeInTheDocument();
    expect(within(rowOf(b!.name)).getByText("1 property")).toBeInTheDocument();
    expect(within(rowOf("Cy")).getByText("0 properties")).toBeInTheDocument();
  });

  test("counts the properties after real moves", () => {
    const step = [...fx.steps].reverse().find((s) => Object.keys(s.state.ownership).length > 0)!;
    setup(fx.ownerId, step.state);
    for (const p of step.state.players) {
      const n = Object.values(step.state.ownership).filter((d) => d.ownerId === p.id).length;
      expect(within(rowOf(p.name)).getByText(new RegExp(`^${n} propert`))).toBeInTheDocument();
    }
  });

  test("renders an empty rail before the game loads", () => {
    const store = createGameStore();
    render(
      <GameStoreProvider store={store}>
        <PlayerRail userId={fx.ownerId} />
      </GameStoreProvider>,
    );
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  test("renders one root element", () => {
    const store = createGameStore();
    act(() => store.applyStreamMessage(snapshotMessage(fx.game, start)));
    const { container } = render(
      <GameStoreProvider store={store}>
        <PlayerRail userId={fx.ownerId} />
      </GameStoreProvider>,
    );
    expect(container.children).toHaveLength(1);
  });

  describe("cash updates", () => {
    // The first step where a player's cash differs from the step before.
    function cashStep(): { before: Fixture["steps"][number]["state"]; step: Step; id: string } {
      let before = start;
      for (const step of fx.steps) {
        const changed = step.state.players.find(
          (p, i) => p.cash !== before.players[i]!.cash && p.active,
        );
        if (changed) return { before, step, id: changed.id };
        before = step.state;
      }
      throw new Error("no cash change in the fixture");
    }

    test("shows the new cash after a game.actions message and marks the change", () => {
      vi.useFakeTimers();
      const { before, step, id } = cashStep();
      const store = setup(fx.ownerId, before);
      const name = step.state.players.find((p) => p.id === id)!.name;
      const oldCash = before.players.find((p) => p.id === id)!.cash;
      const newCash = step.state.players.find((p) => p.id === id)!.cash;
      // The store applies messages one version at a time: bring it to the version before the step.
      const index = fx.steps.indexOf(step);
      for (const prior of fx.steps.slice(0, index)) {
        act(() => store.applyStreamMessage(actionsMessage(fx.game, prior)));
      }
      expect(within(rowOf(name)).getByText(formatMoney(oldCash))).toBeInTheDocument();

      act(() => store.applyStreamMessage(actionsMessage(fx.game, step)));
      const row = within(rowOf(name));
      expect(row.getByText(formatMoney(newCash))).toBeInTheDocument();
      const sign = newCash > oldCash ? "+" : "−";
      expect(
        row.getByText(`${sign}${formatMoney(Math.abs(newCash - oldCash))}`),
      ).toBeInTheDocument();
      expect(rowOf(name).querySelector("[data-change]")).toHaveAttribute(
        "data-change",
        newCash > oldCash ? "up" : "down",
      );

      act(() => {
        vi.advanceTimersByTime(CASH_FLASH_MS + 1);
      });
      expect(rowOf(name).querySelector("[data-change]")).toBeNull();
      expect(row.getByText(formatMoney(newCash))).toBeInTheDocument();
    });

    test("does not mark anything on the first render", () => {
      setup(fx.ownerId);
      expect(document.querySelector("[data-change]")).toBeNull();
    });
  });

  test("the host at seat order 1 with the dog token is red, not blue", () => {
    // Regression: the server numbers seats from 1 and the look tables started at 0, so the
    // host showed the second colour.
    setup(fx.ownerId);
    expect(fx.game.seats[0]).toMatchObject({ order: 1, token: "dog" });
    // The rail groups the seats by device, so find a row by the name on it.
    const colorOf = (name: string) =>
      screen
        .getAllByRole("listitem")
        .find((row) => within(row).queryByText(name))!
        .style.getPropertyValue("--player-color");
    expect(colorOf("Ann")).toBe("var(--hf-pawn-red)");
    expect(colorOf("Bo")).toBe("var(--hf-pawn-blue)");
    expect(colorOf("Cy")).toBe("var(--hf-pawn-green)");
  });

  test("keeps the rail when the room changes", () => {
    const store = setup(fx.ownerId);
    act(() => store.applyStreamMessage(roomMessage({ ...fx.game, version: 0 })));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});

describe("PlayerRow", () => {
  const base: PlayerRowProps = {
    name: "Mira",
    token: "cat",
    cash: 1500,
    device: "other",
    active: false,
    inJail: false,
    jailCards: 0,
    eliminated: false,
    properties: 0,
    debt: null,
  };
  const renderRow = (props: Partial<PlayerRowProps> = {}) =>
    render(
      <ul>
        <PlayerRow {...base} {...props} />
      </ul>,
    );

  test("renders from props alone", () => {
    renderRow();
    const row = screen.getByRole("listitem");
    expect(within(row).getByText("Mira")).toBeInTheDocument();
    expect(within(row).getByText("$1,500")).toBeInTheDocument();
    expect(within(row).getByText("0 properties")).toBeInTheDocument();
    expect(row).not.toHaveAttribute("aria-current");
  });

  test("takes the pawn colour from the token", () => {
    renderRow({ token: "penguin" });
    expect(screen.getByRole("listitem").style.getPropertyValue("--player-color")).toBe(
      "var(--hf-pawn-green)",
    );
  });

  test("the duck is teal and the horse is purple, with a fallback value", () => {
    renderRow({ token: "duck" });
    expect(screen.getByRole("listitem").style.getPropertyValue("--player-color")).toContain(
      "--hf-pawn-teal",
    );
    cleanup();
    renderRow({ token: "horse" });
    expect(screen.getByRole("listitem").style.getPropertyValue("--player-color")).toContain(
      "--hf-pawn-purple",
    );
  });

  test("shows the debt and the jail state only for a player still in the game", () => {
    renderRow({ inJail: true, jailCards: 1, debt: 100, eliminated: true });
    expect(screen.queryByText("In jail")).toBeNull();
    expect(screen.queryByText("1 jail card")).toBeNull();
    expect(screen.queryByText("Owes $100")).toBeNull();
  });

  test("shows a change of cash by props", () => {
    const { rerender } = renderRow();
    rerender(
      <ul>
        <PlayerRow {...base} cash={1300} />
      </ul>,
    );
    expect(screen.getByText("−$200")).toBeInTheDocument();
  });
});

describe("PlayerRail: presence of the players on other devices", () => {
  const bo = playerNamed("Bo");
  const ann = playerNamed("Ann");
  const cy = playerNamed("Cy");
  const presenceOf = (name: string) =>
    rowOf(name).querySelector<HTMLElement>(".player-row__presence");

  test("shows no dot until the server says, and none for a seat of this device", () => {
    setup(fx.ownerId);
    expect(presenceOf("Bo")).toBeNull();
    expect(document.querySelector(".player-row__dot")).toBeNull();
  });

  test.each([
    ["online", "Online"],
    ["reconnecting", "Reconnecting…"],
    ["away", "Away"],
  ] as const)("a remote seat that is %s shows the dot and the word %s", (status, word) => {
    const store = setup(fx.ownerId);
    act(() => store.applyStreamMessage(presenceMessage(fx.game, { [bo.id]: status })));
    const presence = presenceOf("Bo")!;
    expect(presence).toHaveTextContent(word);
    expect(presence).toHaveAttribute("data-presence", status);
    expect(presence.querySelector(".player-row__dot")).toHaveAttribute("aria-hidden", "true");
  });

  test("a seat of this device shows none, even when the server sends one", () => {
    const store = setup(fx.ownerId);
    act(() =>
      store.applyStreamMessage(
        presenceMessage(fx.game, { [ann.id]: "online", [cy.id]: "away", [bo.id]: "online" }),
      ),
    );
    expect(presenceOf("Ann")).toBeNull();
    expect(presenceOf("Cy")).toBeNull();
    expect(presenceOf("Bo")).toHaveTextContent("Online");
  });

  test("follows the live changes of the player", () => {
    const store = setup(fx.ownerId);
    act(() => store.applyStreamMessage(presenceMessage(fx.game, { [bo.id]: "online" })));
    expect(presenceOf("Bo")).toHaveTextContent("Online");
    act(() => store.applyStreamMessage(presenceMessage(fx.game, { [bo.id]: "reconnecting" })));
    expect(presenceOf("Bo")).toHaveTextContent("Reconnecting…");
    act(() => store.applyStreamMessage(presenceMessage(fx.game, { [bo.id]: "away" })));
    expect(presenceOf("Bo")).toHaveTextContent("Away");
  });

  test("the guest's device sees the owner's seats as remote", () => {
    const store = setup(fx.guestId);
    act(() =>
      store.applyStreamMessage(
        presenceMessage(fx.game, { [ann.id]: "online", [cy.id]: "online", [bo.id]: "away" }),
      ),
    );
    expect(presenceOf("Ann")).toHaveTextContent("Online");
    expect(presenceOf("Cy")).toHaveTextContent("Online");
    expect(presenceOf("Bo")).toBeNull();
  });

  test("a player who is out has none", () => {
    const store = setup(fx.ownerId, withPlayer(start, bo.id, { active: false }));
    act(() => store.applyStreamMessage(presenceMessage(fx.game, { [bo.id]: "away" })));
    expect(presenceOf("Bo")).toBeNull();
  });
});

describe("PlayerRow: presence", () => {
  const row: PlayerRowProps = {
    name: "Ravi",
    token: "horse",
    cash: 1200,
    device: "other",
    active: false,
    inJail: false,
    jailCards: 0,
    eliminated: false,
    properties: 0,
    debt: null,
  };
  const renderRow = (props: Partial<PlayerRowProps>) => {
    render(
      <ul>
        <PlayerRow {...row} {...props} />
      </ul>,
    );
    return screen.getByRole("listitem");
  };

  test("is part of the meta line of a remote seat", () => {
    const li = renderRow({ presence: "away" });
    expect(li.querySelector(".player-row__meta")).toHaveTextContent("Away");
  });

  test("is ignored for a seat of this device", () => {
    const li = renderRow({ device: "device", presence: "away" });
    expect(li).not.toHaveTextContent("Away");
    expect(li).toHaveTextContent("This device");
  });

  test("is left out when it is not given", () => {
    const li = renderRow({});
    expect(li.querySelector(".player-row__presence")).toBeNull();
  });
});
