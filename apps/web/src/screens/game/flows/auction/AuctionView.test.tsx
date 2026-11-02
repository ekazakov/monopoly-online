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
  cash?: Partial<Record<Who, number>>;
  /** Replaces the whole `auction` of the state. */
  auction?: RedactedGameState["auction"];
}

function stateFor({ actor = "a", highBid = 0, highBidder = null, passed = [], ...rest }: Setup) {
  const base = redact(fx.start);
  const auction: RedactedGameState["auction"] =
    "auction" in rest
      ? (rest.auction ?? null)
      : {
          square: 1,
          bidderOrder: [a.id, b.id, c.id],
          passed: passed.map((who) => fx.seats[who].id),
          highBid,
          highBidderId: highBidder ? fx.seats[highBidder].id : null,
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

const bidInput = () => screen.getByRole("textbox", { name: /bid$/i });
const bidButton = () => screen.getByRole("button", { name: /^Bid/ });
const rowOf = (name: string) =>
  within(screen.getByRole("list", { name: "Bidders" }))
    .getAllByRole("listitem")
    .find((item) => item.textContent?.startsWith(name));

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
  test("shows the form with the opening bid ready and focuses the input", () => {
    renderAuction();
    expect(bidInput()).toHaveValue("10");
    expect(bidInput()).toHaveAttribute("inputmode", "numeric");
    expect(bidInput()).toHaveFocus();
    expect(screen.getByText("No bids")).toBeInTheDocument();
    expect(screen.getByText("Opening bid from $10")).toBeInTheDocument();
    expect(screen.getByText("Ann, you have $1,500")).toBeInTheDocument();
    expect(bidButton()).toHaveTextContent("Bid $10");
    expect(bidButton()).toBeEnabled();
    expect(screen.getByRole("button", { name: "Pass" })).toBeEnabled();
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

  test("quick buttons set the bid to the best bid plus the raise", async () => {
    const { send } = renderAuction({ highBid: 60, highBidder: "b" });
    expect(bidInput()).toHaveValue("70");
    await userEvent.click(screen.getByRole("button", { name: /^\+\$50/ }));
    expect(bidInput()).toHaveValue("110");
    await userEvent.click(screen.getByRole("button", { name: /^\+\$100/ }));
    expect(bidInput()).toHaveValue("160");
    await userEvent.click(bidButton());
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: "Bid", amount: 160 }, { seatId: a.id });
  });

  test("quick buttons of an opening bid set $10, $50 and $100", async () => {
    renderAuction();
    const group = screen.getByRole("group", { name: "Quick bids" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["$10", "$50", "$100"]);
    await userEvent.click(within(group).getByRole("button", { name: /^\$50/ }));
    expect(bidInput()).toHaveValue("50");
  });

  test("pass sends PassBid as the seat of the bidder", async () => {
    const { send } = renderAuction();
    await userEvent.click(screen.getByRole("button", { name: "Pass" }));
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: "PassBid" }, { seatId: a.id });
  });

  test("moves the focus to the input when the turn to bid comes to this device", () => {
    const { store } = renderAuction({ actor: "b" });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    act(() =>
      store.applyStateResponse({
        version: 101,
        state: { ...stateFor({ actor: "a" }), version: 101 },
      }),
    );
    expect(bidInput()).toHaveFocus();
  });
});

describe("AuctionView: high bid and bidders", () => {
  test("shows the high bid and who holds it", () => {
    const { container } = renderAuction({ highBid: 80, highBidder: "b", actor: "c" }, fx.guestId);
    expect(container.querySelector(".auction__amount")).toHaveTextContent("$80");
    expect(screen.getByText("by Bo")).toBeInTheDocument();
  });

  test("lists every bidder with the leader, who passed and whose turn it is", () => {
    renderAuction({ highBid: 60, highBidder: "b", passed: ["c"], actor: "a" });
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(rowOf("Ann")).toHaveTextContent("To bid");
    expect(rowOf("Ann")).toHaveTextContent("this device");
    expect(rowOf("Ann")).toHaveAttribute("aria-current", "step");
    expect(rowOf("Bo")).toHaveTextContent("Leading");
    expect(rowOf("Bo")).not.toHaveTextContent("this device");
    expect(rowOf("Cy")).toHaveTextContent("Passed");
  });

  test("shows a bidder who has not acted yet as In", () => {
    renderAuction({ actor: "a" });
    expect(rowOf("Bo")).toHaveTextContent("In");
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

  test("allows only the best bid plus $10, $50 or $100 after a bid", async () => {
    renderAuction({ highBid: 60, highBidder: "b" });
    await userEvent.clear(bidInput());
    await userEvent.type(bidInput(), "75");
    expect(bidButton()).toBeDisabled();
    expect(screen.getByText("The next bid is $70, $110 or $160.")).toBeInTheDocument();
    expect(screen.getByText("Raise the best bid by $10, $50 or $100.")).toBeInTheDocument();
    await userEvent.clear(bidInput());
    await userEvent.type(bidInput(), "110");
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

  test("rejects text that is not a whole number", async () => {
    renderAuction();
    await userEvent.clear(bidInput());
    await userEvent.type(bidInput(), "12.5");
    expect(bidButton()).toBeDisabled();
    expect(screen.getByText("A bid is a whole number of dollars.")).toBeInTheDocument();
    await userEvent.clear(bidInput());
    expect(bidButton()).toBeDisabled();
    expect(screen.getByText("Enter your bid in whole dollars.")).toBeInTheDocument();
  });

  test("Pass stays enabled when the bid is invalid", async () => {
    renderAuction();
    await userEvent.clear(bidInput());
    expect(screen.getByRole("button", { name: "Pass" })).toBeEnabled();
  });
});

describe("AuctionView: other devices", () => {
  test("shows who we wait for, with no form and no buttons", () => {
    renderAuction({ actor: "b" }, fx.ownerId);
    expect(screen.getByText("Waiting for Bo")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(rowOf("Bo")).toHaveTextContent("To bid");
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
    expect(screen.getByRole("textbox", { name: "Cy's bid" })).toHaveValue("30");
    expect(rowOf("Cy")).toHaveTextContent("this device");
    await userEvent.click(bidButton());
    expect(send).toHaveBeenLastCalledWith({ type: "Bid", amount: 30 }, { seatId: c.id });
    await userEvent.click(screen.getByRole("button", { name: "Pass" }));
    expect(send).toHaveBeenLastCalledWith({ type: "PassBid" }, { seatId: c.id });
  });

  test("the cash limit is the cash of the hot-seat bidder", async () => {
    renderAuction({ actor: "c", cash: { a: 1500, c: 40 } });
    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "50");
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
    const error = new ApiError(409, "invalid_bid", "Raise the best bid ($60) by $10, $50 or $100");
    const { update } = renderAuction({ highBid: 60, highBidder: "b" });
    await userEvent.clear(bidInput());
    await userEvent.type(bidInput(), "110");
    update({ error });
    const notice = screen.getByText("Raise the best bid ($60) by $10, $50 or $100");
    expect(notice.closest("[aria-live='polite']")).not.toBeNull();
    expect(bidInput()).toHaveValue("110");
    expect(bidButton()).toBeEnabled();
  });
});
