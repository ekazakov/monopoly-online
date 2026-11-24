import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RedactedGameState } from "@monopoly/shared";
import { describe, expect, test, vi } from "vite-plus/test";
import { ApiError } from "../../../../api.ts";
import { GameActionsContext } from "../../../../game/actions.ts";
import type { GameActions } from "../../../../game/actions.ts";
import { recordFixture, redact, snapshotMessage } from "../../../../game/fixtures.ts";
import { GameStoreProvider } from "../../../../game/GameStoreProvider.tsx";
import { createGameStore } from "../../../../game/store.ts";
import { ErrorNotice } from "../../turn/ErrorNotice.tsx";
import { useTurn } from "../../turn/useTurn.ts";
import { AuctionView } from "./index.ts";

const fx = recordFixture(3);
const { a, b, c } = fx.seats;
type Who = "a" | "b" | "c";

interface Setup {
  /** The bidder who must act. */
  actor?: Who;
  highBid?: number;
  highBidder?: Who | null;
  passed?: Who[];
  /** The last bid of each bidder, in dollars. */
  bids?: Partial<Record<Who, number>>;
  cash?: Partial<Record<Who, number>>;
  /** Replaces the whole `auction` of the state. */
  auction?: RedactedGameState["auction"];
}

function stateFor({
  actor = "a",
  highBid = 0,
  highBidder = null,
  passed = [],
  bids,
  ...rest
}: Setup) {
  const base = redact(fx.start);
  const lastBids = bids
    ? Object.fromEntries(
        Object.entries(bids).map(([who, amount]) => [fx.seats[who as Who].id, amount]),
      )
    : highBidder
      ? { [fx.seats[highBidder].id]: highBid }
      : {};
  const auction: RedactedGameState["auction"] =
    "auction" in rest
      ? (rest.auction ?? null)
      : {
          square: 1,
          bidderOrder: [a.id, b.id, c.id],
          passed: passed.map((who) => fx.seats[who].id),
          highBid,
          highBidderId: highBidder ? fx.seats[highBidder].id : null,
          bids: lastBids,
          actorId: fx.seats[actor].id,
          then: "finish_roll",
          queue: [],
          returnPhase: "awaiting_buy_decision",
        };
  return {
    ...base,
    version: 100,
    players: base.players.map((p) => {
      const who = (["a", "b", "c"] as const).find((key) => fx.seats[key].id === p.id);
      return who && rest.cash?.[who] !== undefined ? { ...p, cash: rest.cash[who] } : p;
    }),
    turn: {
      currentPlayerId: a.id,
      phase: "awaiting_bid" as const,
      doubles: 0,
      dice: null,
    },
    auction,
  };
}

function fakeActions(over: Partial<GameActions> = {}) {
  const send = vi.fn<GameActions["send"]>(() => Promise.resolve());
  return { send, actions: { send, pending: false, error: null, ...over } satisfies GameActions };
}

function Harness({ userId }: { userId: string }) {
  const turn = useTurn(userId);
  return (
    <div>
      <AuctionView turn={turn} />
      <ErrorNotice />
    </div>
  );
}

function renderAuction(setup: Setup = {}, userId = fx.ownerId, over: Partial<GameActions> = {}) {
  const store = createGameStore();
  store.applyStreamMessage(snapshotMessage(fx.game, redact(fx.start)));
  store.applyStateResponse({ version: 100, state: stateFor(setup) });
  const fake = fakeActions(over);
  const tree = (actions: GameActions) => (
    <GameStoreProvider store={store}>
      <GameActionsContext value={actions}>
        <Harness userId={userId} />
      </GameActionsContext>
    </GameStoreProvider>
  );
  const view = render(tree(fake.actions));
  return {
    ...view,
    ...fake,
    store,
    update: (next: Partial<GameActions>) => view.rerender(tree({ ...fake.actions, ...next })),
  };
}

const table = () => screen.getByRole("table", { name: "Bidders" });
const bidInput = () => screen.getByRole("spinbutton", { name: /bid$/i });
const bidButton = () => screen.getByRole("button", { name: /^Make a bid/ });
const passButton = () => screen.getByRole("button", { name: "Pass" });
const rowOf = (name: string) =>
  within(table())
    .getAllByRole("row")
    .find((row) => row.textContent?.startsWith(name));

describe("AuctionView: shell", () => {
  test("renders one root element", () => {
    const { container } = renderAuction();
    expect(container.firstElementChild?.children).toHaveLength(2);
    expect(container.querySelectorAll(".auction")).toHaveLength(1);
  });

  test("shows the deed and the title of the auctioned property", () => {
    renderAuction();
    expect(screen.getByText("Auction: Driftwood Lane")).toBeInTheDocument();
    expect(screen.getByText("Title deed")).toBeInTheDocument();
  });

  test("shows a waiting view when the state has no auction", () => {
    renderAuction({ auction: null });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText(/Waiting for/)).toBeInTheDocument();
  });
});

describe("AuctionView: bidder turn", () => {
  test("shows the opening bid in the input and focuses it", () => {
    renderAuction();
    expect(bidInput()).toHaveValue(10);
    expect(bidInput()).toHaveAttribute("type", "number");
    expect(bidInput()).toHaveAttribute("inputmode", "numeric");
    expect(bidInput()).toHaveAttribute("min", "10");
    expect(bidInput()).toHaveAttribute("max", "1500");
    expect(bidInput()).toHaveFocus();
    expect(screen.getByText("No bids")).toBeInTheDocument();
    expect(screen.getByText("Opening bid from $10")).toBeInTheDocument();
    expect(screen.getByText("Ann, you have $1,500")).toBeInTheDocument();
    expect(bidButton()).toHaveTextContent("Make a bid");
    expect(bidButton()).toHaveAccessibleName("Make a bid of $10");
    expect(bidButton()).toBeEnabled();
    expect(passButton()).toBeEnabled();
  });

  test("sends the bid as the seat of the bidder", async () => {
    const { send } = renderAuction();
    await userEvent.clear(bidInput());
    await userEvent.type(bidInput(), "75");
    await userEvent.click(bidButton());
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: "Bid", amount: 75 }, { seatId: a.id });
  });

  test("Enter in the input submits the bid", async () => {
    const { send } = renderAuction();
    await userEvent.clear(bidInput());
    await userEvent.type(bidInput(), "120{Enter}");
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: "Bid", amount: 120 }, { seatId: a.id });
  });

  test("Enter does not send an invalid bid", async () => {
    const { send } = renderAuction();
    await userEvent.clear(bidInput());
    await userEvent.type(bidInput(), "5{Enter}");
    expect(send).not.toHaveBeenCalled();
  });

  test("quick buttons add to the amount in the input", async () => {
    const { send } = renderAuction({ highBid: 60, highBidder: "b" });
    expect(bidInput()).toHaveValue(70);
    await userEvent.click(screen.getByRole("button", { name: /^\+\$50,/ }));
    expect(bidInput()).toHaveValue(120);
    await userEvent.click(screen.getByRole("button", { name: /^\+\$10,/ }));
    expect(bidInput()).toHaveValue(130);
    await userEvent.click(bidButton());
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: "Bid", amount: 130 }, { seatId: a.id });
  });

  test("a quick button adds to the minimum bid when the input is empty", async () => {
    renderAuction();
    await userEvent.clear(bidInput());
    await userEvent.click(screen.getByRole("button", { name: /^\+\$50,/ }));
    expect(bidInput()).toHaveValue(60);
  });

  test("quick buttons read +$10, +$50 and +$100 with the total in their name", () => {
    renderAuction();
    const row = rowOf("Ann");
    expect(row).toBeDefined();
    expect(
      within(row!)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["+$10", "+$50", "+$100", "Make a bid"]);
    expect(screen.getByRole("button", { name: "+$10, bid $20 in total" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+$100, bid $110 in total" })).toBeInTheDocument();
  });

  test("pass sends PassBid as the seat of the bidder", async () => {
    const { send } = renderAuction();
    await userEvent.click(passButton());
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: "PassBid" }, { seatId: a.id });
  });

  test("Pass sits outside the table, at the bottom of the dialog", () => {
    renderAuction();
    expect(table().contains(passButton())).toBe(false);
    expect(
      screen.getByText("A pass is final: you cannot bid again in this auction."),
    ).toBeVisible();
  });

  test("moves the focus to the input when the turn to bid comes to this device", () => {
    const { store } = renderAuction({ actor: "b" });
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    act(() =>
      store.applyStateResponse({
        version: 101,
        state: { ...stateFor({ actor: "a" }), version: 101 },
      }),
    );
    expect(bidInput()).toHaveFocus();
  });
});

describe("AuctionView: bidders table", () => {
  test("has column headers for name, last bid, bid, quick raise and action", () => {
    renderAuction();
    expect(
      within(table())
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Name", "Last bid", "Bid", "Quick raise", "Action"]);
  });

  test("shows the last bid of each bidder, or an en dash", () => {
    renderAuction({ highBid: 60, highBidder: "b", bids: { b: 60 } });
    expect(rowOf("Bo")).toHaveTextContent("$60");
    expect(rowOf("Ann")).toHaveTextContent("–");
    expect(rowOf("Cy")).toHaveTextContent("–");
  });

  test("shows the high bid and who holds it", () => {
    const { container } = renderAuction({ highBid: 80, highBidder: "b", actor: "c" }, fx.guestId);
    expect(container.querySelector(".auction__amount")).toHaveTextContent("$80");
    expect(screen.getByText("by Bo")).toBeInTheDocument();
  });

  test("lists the bidders who have not passed, with the acting row marked", () => {
    const { container } = renderAuction({
      highBid: 60,
      highBidder: "b",
      passed: ["c"],
      actor: "a",
    });
    expect(within(table()).getAllByRole("row")).toHaveLength(3);
    expect(rowOf("Ann")).toHaveAttribute("aria-current", "step");
    expect(rowOf("Bo")).not.toHaveAttribute("aria-current");
    expect(container.querySelector(".auction__state")).toBeNull();
  });

  test("a bidder who has passed has no row", () => {
    renderAuction({ highBid: 60, highBidder: "b", passed: ["c"], actor: "a" });
    expect(rowOf("Cy")).toBeUndefined();
    expect(screen.queryByText("Cy")).not.toBeInTheDocument();
  });

  test("the leader's last bid has a visually hidden Leading text for screen readers", () => {
    renderAuction({ highBid: 60, highBidder: "b", bids: { b: 60 }, actor: "a" });
    const lastBid = rowOf("Bo")!.querySelector(".auction__last")!;
    expect(within(lastBid as HTMLElement).getByText("Leading")).toHaveClass("auction__sr");
    expect(rowOf("Ann")!.querySelector(".auction__last")).not.toHaveTextContent("Leading");
  });

  test("marks the acting row when nobody has bid yet", () => {
    renderAuction({ actor: "a" });
    expect(rowOf("Bo")).not.toHaveAttribute("aria-current");
    expect(rowOf("Ann")).toHaveAttribute("aria-current", "step");
    expect(screen.queryByText("Leading")).not.toBeInTheDocument();
  });

  test("only the acting row has the bid controls", () => {
    renderAuction({ highBid: 60, highBidder: "b", actor: "a" });
    const ann = rowOf("Ann")!;
    expect(within(ann).getByRole("spinbutton")).toBeInTheDocument();
    expect(within(ann).getByRole("button", { name: /^Make a bid/ })).toBeInTheDocument();
    expect(within(ann).getAllByRole("button")).toHaveLength(4);
    expect(within(rowOf("Bo")!).queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(within(rowOf("Bo")!).queryAllByRole("button")).toHaveLength(0);
    expect(within(rowOf("Cy")!).queryAllByRole("button")).toHaveLength(0);
  });
});

describe("AuctionView: bid limits", () => {
  test("disables Bid and explains an opening bid below $10", async () => {
    const { send } = renderAuction();
    await userEvent.clear(bidInput());
    await userEvent.type(bidInput(), "9");
    expect(bidButton()).toBeDisabled();
    const why = screen.getByText("The opening bid is at least $10.");
    expect(bidButton()).toHaveAccessibleDescription("The opening bid is at least $10.");
    expect(bidInput()).toHaveAttribute("aria-invalid", "true");
    expect(why).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });

  test("allows any bid of at least the best bid plus $10 after a bid", async () => {
    renderAuction({ highBid: 60, highBidder: "b" });
    await userEvent.clear(bidInput());
    await userEvent.type(bidInput(), "65");
    expect(bidButton()).toBeDisabled();
    expect(screen.getByText("The next bid is at least $70.")).toBeInTheDocument();
    expect(screen.getByText("Raise the best bid by at least $10.")).toBeInTheDocument();
    await userEvent.clear(bidInput());
    await userEvent.type(bidInput(), "75");
    expect(bidButton()).toBeEnabled();
  });

  test("disables a bid above the cash and says why", async () => {
    renderAuction({ cash: { a: 100 } });
    await userEvent.clear(bidInput());
    await userEvent.type(bidInput(), "101");
    expect(bidButton()).toBeDisabled();
    expect(screen.getByText("You have $100. A bid cannot be more than your cash.")).toBeVisible();
    await userEvent.clear(bidInput());
    await userEvent.type(bidInput(), "100");
    expect(bidButton()).toBeEnabled();
  });

  test("disables the quick buttons that cost more than the cash", () => {
    renderAuction({ highBid: 60, highBidder: "b", cash: { a: 120 } });
    expect(screen.getByRole("button", { name: /^\+\$10,/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^\+\$50,/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^\+\$100,/ })).toBeDisabled();
  });

  test("the bid field ignores the keys that would type a non-digit", async () => {
    renderAuction();
    await userEvent.clear(bidInput());
    await userEvent.type(bidInput(), ".,eE+-");
    expect(bidInput()).toHaveValue(null);
    await userEvent.type(bidInput(), "12.5");
    expect(bidInput()).toHaveValue(125);
  });

  test("a pasted decimal number keeps only its digits", async () => {
    renderAuction();
    await userEvent.clear(bidInput());
    await userEvent.click(bidInput());
    await userEvent.paste("4.5");
    expect(bidInput()).toHaveValue(45);
    expect(bidButton()).toBeEnabled();
  });

  test("a paste replaces the filled-in minimum bid and does not add to it", async () => {
    renderAuction();
    const input = bidInput();
    if (!(input instanceof HTMLInputElement)) throw new Error("The bid field is not an input");
    expect(input.valueAsNumber).toBeGreaterThan(0);
    await userEvent.click(bidInput());
    await userEvent.paste("20");
    expect(bidInput()).toHaveValue(20);
  });

  test("a paste with no digits leaves the bid as it was", async () => {
    renderAuction();
    const input = bidInput();
    if (!(input instanceof HTMLInputElement)) throw new Error("The bid field is not an input");
    const before = input.valueAsNumber;
    await userEvent.click(bidInput());
    await userEvent.paste("abc.,-");
    expect(bidInput()).toHaveValue(before);
  });

  test("an empty bid field stays empty and says so", async () => {
    renderAuction();
    await userEvent.clear(bidInput());
    expect(bidInput()).toHaveValue(null);
    expect(bidButton()).toBeDisabled();
    expect(screen.getByText("Enter your bid in whole dollars.")).toBeInTheDocument();
  });

  test("Pass stays enabled when the bid is invalid", async () => {
    renderAuction();
    await userEvent.clear(bidInput());
    expect(passButton()).toBeEnabled();
  });
});

describe("AuctionView: other devices", () => {
  test("shows who we wait for, with the table and no controls", () => {
    renderAuction({ actor: "b" }, fx.ownerId);
    expect(screen.getByText("Waiting for Bo")).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(rowOf("Bo")).toHaveAttribute("aria-current", "step");
  });

  test("the guest sees the form when it is the guest's turn", async () => {
    const { send } = renderAuction({ actor: "b" }, fx.guestId);
    expect(screen.getByText("Bo, you have $1,500")).toBeInTheDocument();
    await userEvent.click(bidButton());
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: "Bid", amount: 10 }, { seatId: b.id });
  });

  test("the owner waits while the guest has to bid, and the guest waits for the owner", () => {
    renderAuction({ actor: "a" }, fx.guestId);
    expect(screen.getByText("Waiting for Ann")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("AuctionView: hot-seat", () => {
  test("a hot-seat bidder bids and passes as the hot-seat seat", async () => {
    const { send } = renderAuction({ actor: "c", highBid: 20, highBidder: "a" }, fx.ownerId);
    expect(screen.getByText("Cy, you have $1,500")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Cy's bid" })).toHaveValue(30);
    expect(rowOf("Cy")).toContainElement(screen.getByRole("spinbutton", { name: "Cy's bid" }));
    expect(screen.getAllByRole("spinbutton")).toHaveLength(1);
    await userEvent.click(bidButton());
    expect(send).toHaveBeenLastCalledWith({ type: "Bid", amount: 30 }, { seatId: c.id });
    await userEvent.click(passButton());
    expect(send).toHaveBeenLastCalledWith({ type: "PassBid" }, { seatId: c.id });
  });

  test("the cash limit is the cash of the hot-seat bidder", async () => {
    renderAuction({ actor: "c", cash: { a: 1500, c: 40 } });
    await userEvent.clear(bidInput());
    await userEvent.type(bidInput(), "50");
    expect(bidButton()).toBeDisabled();
    expect(screen.getByText("You have $40. A bid cannot be more than your cash.")).toBeVisible();
  });
});

describe("AuctionView: pending and error", () => {
  test("disables every button and announces the send while an action is pending", () => {
    const { container } = renderAuction({}, fx.ownerId, { pending: true });
    expect(screen.getAllByRole("button").every((button) => button.hasAttribute("disabled"))).toBe(
      true,
    );
    expect(screen.getAllByRole("status").map((region) => region.textContent)).toContain("Sending…");
    expect(container.querySelector(".auction")).toHaveAttribute("aria-busy", "true");
  });

  test("the pending line has a live region that is empty when nothing is sent", () => {
    renderAuction();
    const live = screen.getAllByRole("status");
    expect(live.every((region) => region.getAttribute("aria-live") === "polite")).toBe(true);
    expect(live.map((region) => region.textContent)).toEqual(["", ""]);
  });

  test("shows a rejected bid in the polite live region and keeps the typed amount", async () => {
    const error = new ApiError(
      409,
      "invalid_bid",
      "The next bid is at least $70, the best bid plus $10",
    );
    const { update } = renderAuction({ highBid: 60, highBidder: "b" });
    await userEvent.clear(bidInput());
    await userEvent.type(bidInput(), "110");
    update({ error });
    const notice = screen.getByText("The next bid is at least $70, the best bid plus $10");
    expect(notice.closest("[aria-live='polite']")).not.toBeNull();
    expect(bidInput()).toHaveValue(110);
    expect(bidButton()).toBeEnabled();
  });
});
