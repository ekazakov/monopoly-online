import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { ApiError } from "../../../../api.ts";
import { centrePhases, TurnArea } from "../../turn/index.ts";
import { TradeResponseView } from "./index.ts";
import { a, b, c, fx, renderWith } from "./tradeFixtures.tsx";
import type { Setup } from "./tradeFixtures.tsx";

// The orchestrator registers the view. The tests register it the same way and render the real
// turn area, so the error notice of the turn area is part of what they check.
beforeAll(() => {
  centrePhases.awaiting_trade_response = TradeResponseView;
});
afterAll(() => {
  delete centrePhases.awaiting_trade_response;
});

const deeds: Setup["ownership"] = {
  "1": { ownerId: a.id, houses: 0, mortgaged: false },
  "5": { ownerId: a.id, houses: 0, mortgaged: true },
  "6": { ownerId: b.id, houses: 0, mortgaged: false },
  "8": { ownerId: c.id, houses: 0, mortgaged: false },
};

function offer(toId: string): Setup {
  return {
    phase: "awaiting_trade_response",
    ownership: deeds,
    trade: {
      fromId: a.id,
      toId,
      give: { cash: 50, squares: [1, 5], jailCards: [] },
      get: { cash: 0, squares: toId === b.id ? [6] : [8], jailCards: ["chance"] },
      returnPhase: "awaiting_roll",
    },
  };
}

function renderResponse(setup: Setup, userId: string, over = {}) {
  return renderWith(setup, <TurnArea userId={userId} />, over);
}

const buttonNames = () => screen.queryAllByRole("button").map((button) => button.textContent);
const side = (name: string) => within(screen.getByRole("region", { name: `${name} gives` }));

describe("TradeResponseView", () => {
  test("renders one root element in the turn area", () => {
    const { container } = renderResponse(offer(b.id), fx.guestId);
    expect(container.children).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Trade offer" })).toBeInTheDocument();
  });

  test("the receiver sees both sides and answers with Accept or Decline", async () => {
    const { send } = renderResponse(offer(b.id), fx.guestId);
    expect(screen.getByRole("heading", { name: "Trade offer from Ann" })).toBeInTheDocument();
    expect(side("Ann").getByText(/Driftwood Lane/)).toBeInTheDocument();
    expect(side("Ann").getByText(/North Station/)).toHaveTextContent("mortgaged");
    expect(side("Ann").getByText("$50")).toBeInTheDocument();
    expect(side("Bo").getByText(/Lantern Row/)).toBeInTheDocument();
    expect(side("Bo").getByText("Get Out of Jail Free (Chance)")).toBeInTheDocument();
    expect(buttonNames()).toEqual(["Decline", "Accept"]);

    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(send).toHaveBeenLastCalledWith({ type: "AcceptTrade" }, { seatId: b.id });
    await userEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(send).toHaveBeenLastCalledWith({ type: "RejectTrade" }, { seatId: b.id });
  });

  test("an empty side reads Nothing", () => {
    renderResponse(
      {
        ...offer(b.id),
        trade: {
          fromId: a.id,
          toId: b.id,
          give: { cash: 10, squares: [], jailCards: [] },
          get: { cash: 0, squares: [], jailCards: [] },
          returnPhase: "awaiting_roll",
        },
      },
      fx.guestId,
    );
    expect(side("Bo").getByText("Nothing")).toBeInTheDocument();
  });

  test("the proposer waits for the partner and may withdraw the offer", async () => {
    const { send } = renderResponse(offer(b.id), fx.ownerId);
    expect(screen.getByRole("heading", { name: "Ann offers a trade to Bo" })).toBeInTheDocument();
    expect(screen.getByText("Waiting for Bo")).toBeInTheDocument();
    expect(buttonNames()).toEqual(["Withdraw offer"]);

    await userEvent.click(screen.getByRole("button", { name: "Withdraw offer" }));
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: "CancelTrade" }, { seatId: a.id });
  });

  test("another device only waits", () => {
    // Cy is a hot-seat seat of the owner, so the guest is not in this trade.
    renderResponse(offer(c.id), fx.guestId);
    expect(screen.getByText("Ann offers a trade to Cy")).toBeInTheDocument();
    expect(screen.getByText("Waiting for Cy")).toBeInTheDocument();
    expect(buttonNames()).toEqual([]);
  });

  test("a hot-seat device with both seats answers as the partner seat and may withdraw", async () => {
    const { send } = renderResponse(offer(c.id), fx.ownerId);
    expect(screen.getByRole("heading", { name: "Trade offer from Ann" })).toBeInTheDocument();
    expect(buttonNames()).toEqual(["Withdraw offer", "Decline", "Accept"]);

    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(send).toHaveBeenLastCalledWith({ type: "AcceptTrade" }, { seatId: c.id });
    await userEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(send).toHaveBeenLastCalledWith({ type: "RejectTrade" }, { seatId: c.id });
    await userEvent.click(screen.getByRole("button", { name: "Withdraw offer" }));
    expect(send).toHaveBeenLastCalledWith({ type: "CancelTrade" }, { seatId: a.id });
  });

  test("disables every button while an action is on its way", async () => {
    const { send } = renderResponse(offer(c.id), fx.ownerId, { pending: true });
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Trade offer" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  test("announces a rejected answer in the live region and keeps the buttons", () => {
    const view = renderResponse(offer(b.id), fx.guestId);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();

    view.update({ error: new ApiError(422, "invalid_trade", "The proposer does not have $50") });
    expect(region).toHaveTextContent("The proposer does not have $50");
    expect(buttonNames()).toContain("Accept");
  });

  test("falls back to a waiting line when the state holds no trade", () => {
    renderResponse({ phase: "awaiting_trade_response" }, fx.guestId);
    expect(screen.getByRole("heading", { name: "Trade offer" })).toBeInTheDocument();
    expect(buttonNames()).toEqual([]);
  });
});
