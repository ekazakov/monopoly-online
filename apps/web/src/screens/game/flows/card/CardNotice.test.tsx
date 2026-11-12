import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DeckName, GameEvent } from "@monopoly/shared";
import { describe, expect, test, vi } from "vite-plus/test";
import { GameActionsContext } from "../../../../game/actions.ts";
import type { GameActions } from "../../../../game/actions.ts";
import {
  actionsMessage,
  recordFixture,
  redact,
  snapshotMessage,
} from "../../../../game/fixtures.ts";
import type { Step } from "../../../../game/fixtures.ts";
import { GameStoreProvider } from "../../../../game/GameStoreProvider.tsx";
import { createGameStore } from "../../../../game/store.ts";
import { CardNotice, effectText, useCardNotice } from "./index.ts";
import { tEn } from "../../../../testing/tEn.ts";

const fx = recordFixture(1);
const { a, b } = fx.seats;
const start = redact(fx.start);

const drawn = (playerId: string, deck: DeckName, cardIndex: number): GameEvent => ({
  type: "CardDrawn",
  playerId,
  deck,
  cardIndex,
});

/** An accepted action with the given events at `version`. Only `state` and `events` are read. */
function step(version: number, events: GameEvent[]): Step {
  return { state: { ...start, version }, events } as unknown as Step;
}

/** The parent of the dialog in the game screen: it owns the hook and shows the dialog. */
function CardHost({ userId }: { userId: string }) {
  const notice = useCardNotice(userId);
  return notice ? <CardNotice notice={notice} /> : null;
}

function setup(userId = fx.ownerId) {
  const store = createGameStore();
  act(() => store.applyStreamMessage(snapshotMessage(fx.game, start)));
  const send = vi.fn<GameActions["send"]>(() => Promise.resolve());
  const actions: GameActions = { send, pending: false, error: null };
  const tree = (
    <GameStoreProvider store={store}>
      <GameActionsContext value={actions}>
        <CardHost userId={userId} />
      </GameActionsContext>
    </GameStoreProvider>
  );
  const view = render(tree);
  const apply = (version: number, events: GameEvent[]) =>
    act(() => store.applyStreamMessage(actionsMessage(fx.game, step(version, events))));
  return { ...view, store, send, apply, remount: () => view.rerender(tree) };
}

describe("CardNotice", () => {
  test("shows nothing before a card is drawn, and a dialog with the drawer when it shows", () => {
    const { container, apply } = setup();
    expect(container).toBeEmptyDOMElement();
    apply(1, [drawn(a.id, "chance", 8)]);
    expect(screen.getByRole("dialog", { name: "Ann drew a card" })).toBeInTheDocument();
  });

  test("Esc closes the card like OK, and the dialog has no Close button", async () => {
    const { apply, send } = setup();
    apply(1, [drawn(a.id, "chance", 8)]);
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    // A browser gives the first control the focus when the dialog opens; jsdom does not.
    screen.getByRole("button", { name: "OK" }).focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });

  test("shows a Chance card with its title, text and who drew it", () => {
    const { apply } = setup();
    apply(1, [drawn(a.id, "chance", 8)]);
    const card = screen.getByRole("group", { name: "Chance card" });
    expect(card).toHaveTextContent("Chance");
    expect(card).toHaveTextContent("Dividend");
    expect(card).toHaveTextContent("Collect $50.");
    expect(screen.getByRole("dialog", { name: "Ann drew a card" })).toBeInTheDocument();
  });

  test("shows a Community Chest card for a draw by a player on another device", () => {
    const { apply } = setup();
    apply(1, [drawn(b.id, "chest", 1)]);
    const card = screen.getByRole("group", { name: "Community Chest card" });
    expect(card).toHaveTextContent("Bank error");
    expect(card).toHaveTextContent("Collect $200.");
    expect(screen.getByRole("dialog", { name: "Bo drew a card" })).toBeInTheDocument();
    expect(card.closest("[data-deck]")).toHaveAttribute("data-deck", "chest");
  });

  test("OK closes the card on this device and sends nothing", async () => {
    const { apply, send } = setup();
    apply(1, [drawn(a.id, "chance", 11)]);
    await userEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });

  test("a closed card stays closed when the same version arrives again", async () => {
    const { apply, store } = setup();
    apply(1, [drawn(a.id, "chance", 11)]);
    await userEvent.click(screen.getByRole("button", { name: "OK" }));
    act(() => store.applyStreamMessage(snapshotMessage(fx.game, { ...start, version: 1 })));
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  test("a draw that is already in the store when the component mounts is not shown", () => {
    const store = createGameStore();
    store.applyStreamMessage(snapshotMessage(fx.game, start));
    store.applyStreamMessage(actionsMessage(fx.game, step(1, [drawn(a.id, "chance", 8)])));
    expect(store.getState().lastActionEvents).toHaveLength(1);
    render(
      <GameStoreProvider store={store}>
        <CardHost userId={fx.ownerId} />
      </GameStoreProvider>,
    );
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  test("a reload shows no card: the snapshot has no events", () => {
    const store = createGameStore();
    render(
      <GameStoreProvider store={store}>
        <CardHost userId={fx.ownerId} />
      </GameStoreProvider>,
    );
    act(() => store.applyStreamMessage(snapshotMessage(fx.game, { ...start, version: 9 })));
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  test("a reconnect snapshot at a newer version does not bring a card back", async () => {
    const { apply, store } = setup();
    apply(1, [drawn(a.id, "chance", 8)]);
    expect(screen.getByRole("group")).toBeInTheDocument();
    act(() => store.applyStreamMessage(snapshotMessage(fx.game, { ...start, version: 4 })));
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  test("the card goes away when a newer action without a draw arrives", () => {
    const { apply } = setup();
    apply(1, [drawn(a.id, "chance", 8)]);
    apply(2, [{ type: "TurnEnded", playerId: a.id, nextPlayerId: b.id } as GameEvent]);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  test("a new draw shows a new card after the old one was closed", async () => {
    const { apply } = setup();
    apply(1, [drawn(a.id, "chance", 8)]);
    await userEvent.click(screen.getByRole("button", { name: "OK" }));
    apply(2, [drawn(b.id, "chest", 3)]);
    expect(screen.getByRole("group", { name: "Community Chest card" })).toHaveTextContent(
      "Cargo sale",
    );
  });

  test("two draws in one action show one after the other", async () => {
    const { apply } = setup();
    apply(1, [drawn(a.id, "chance", 10), drawn(a.id, "chest", 2)]);
    expect(screen.getByRole("group", { name: "Chance card" })).toHaveTextContent("Back three");
    await userEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.getByRole("group", { name: "Community Chest card" })).toHaveTextContent(
      "Doctor's bill",
    );
    await userEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  test("shows an unknown card index without the text", () => {
    const { apply } = setup();
    apply(1, [drawn(a.id, "chance", 99)]);
    expect(screen.getByRole("group", { name: "Chance card" })).toHaveTextContent("A card");
  });
});

describe("useCardNotice", () => {
  function Probe({ userId }: { userId: string }) {
    const notice = useCardNotice(userId);
    return <p data-testid="probe">{notice ? `${notice.title}|${String(notice.mine)}` : "none"}</p>;
  }

  test("tells whether the drawing player is a seat of this device", () => {
    const store = createGameStore();
    act(() => store.applyStreamMessage(snapshotMessage(fx.game, start)));
    const tree = (userId: string) => (
      <GameStoreProvider store={store}>
        <Probe userId={userId} />
      </GameStoreProvider>
    );
    const owner = render(tree(fx.ownerId));
    const guest = render(tree(fx.guestId));
    act(() =>
      store.applyStreamMessage(actionsMessage(fx.game, step(1, [drawn(a.id, "chance", 8)]))),
    );
    expect(within(owner.container).getByTestId("probe")).toHaveTextContent("Dividend|true");
    expect(within(guest.container).getByTestId("probe")).toHaveTextContent("Dividend|false");
  });
});

describe("effectText", () => {
  test("describes every kind of card effect", () => {
    expect(effectText({ type: "move_to", square: 0 }, tEn)).toBe("Advance to Start. Collect $200.");
    expect(effectText({ type: "move_to", square: 21 }, tEn)).toMatch(/if you pass Start\.$/);
    expect(effectText({ type: "move_to", square: 39 }, tEn)).not.toMatch(/pass Start/);
    expect(effectText({ type: "move_nearest", target: "station" }, tEn)).toMatch(/double/);
    expect(effectText({ type: "move_nearest", target: "utility" }, tEn)).toMatch(/10 × the total/);
    expect(effectText({ type: "move_back", steps: 3 }, tEn)).toBe("Move back 3 squares.");
    expect(effectText({ type: "collect", amount: 150 }, tEn)).toBe("Collect $150.");
    expect(effectText({ type: "pay", amount: 15 }, tEn)).toBe("Pay the bank $15.");
    expect(effectText({ type: "pay_each_player", amount: 50 }, tEn)).toBe(
      "Pay each other player $50.",
    );
    expect(effectText({ type: "collect_from_each_player", amount: 10 }, tEn)).toBe(
      "Collect $10 from every other player.",
    );
    expect(effectText({ type: "repairs", perHouse: 25, perHotel: 100 }, tEn)).toBe(
      "Pay $25 per house and $100 per hotel you own.",
    );
    expect(effectText({ type: "go_to_jail" }, tEn)).toMatch(/^Go directly to Jail/);
    expect(effectText({ type: "jail_free" }, tEn)).toMatch(/^Keep it/);
  });
});
