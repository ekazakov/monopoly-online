import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vite-plus/test";
import { ApiError } from "../../../../api.ts";
import { TradeBuilder } from "./index.ts";
import { a, b, c, fx, renderWith } from "./tradeFixtures.tsx";
import type { Setup } from "./tradeFixtures.tsx";

// Ann (seat a, the owner's device) is on turn and owns Driftwood Lane (1), Kelp Court (3) and
// North Station (5). Bo owns Lantern Row (6).
const deeds: Setup["ownership"] = {
  "1": { ownerId: a.id, houses: 0, mortgaged: false },
  "3": { ownerId: a.id, houses: 0, mortgaged: false },
  "5": { ownerId: a.id, houses: 0, mortgaged: false },
  "6": { ownerId: b.id, houses: 0, mortgaged: false },
};

function renderBuilder(setup: Setup = {}, userId = fx.ownerId, over = {}) {
  const onClose = vi.fn<() => void>();
  const view = renderWith(
    { ownership: deeds, ...setup },
    <TradeBuilder userId={userId} onClose={onClose} />,
    over,
  );
  return { ...view, onClose };
}

const propose = () => screen.getByRole("button", { name: "Propose" });
const choose = (name: string) => userEvent.click(screen.getByRole("radio", { name }));
const column = (name: string) => within(screen.getByRole("region", { name: `${name} gives` }));
const cash = (name: string) => screen.getByLabelText(`Cash from ${name}`);

describe("TradeBuilder: shell and partner", () => {
  test("renders one root element and lists the other active seats as partners", () => {
    const { container } = renderBuilder();
    expect(container.children).toHaveLength(1);
    const partners = screen.getAllByRole("radio").map((radio) => radio.parentElement?.textContent);
    expect(partners).toEqual(["Bo", "Cy"]);
  });

  test("skips an eliminated seat and picks the only partner left", () => {
    renderBuilder({ players: { c: { active: false } } });
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "Bo" })).toBeChecked();
    expect(screen.getByRole("heading", { name: "Bo gives" })).toBeInTheDocument();
  });

  test("closes with Cancel", async () => {
    const { onClose, send } = renderBuilder();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
  });

  test("says so when this device may not propose now", async () => {
    // Bo is on another device and Ann is on turn.
    const { onClose } = renderBuilder({}, fx.guestId);
    expect(screen.getByText("You cannot propose a trade now.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Propose" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("refuses outside the phases that allow a proposal", () => {
    renderBuilder({ phase: "awaiting_buy_decision" });
    expect(screen.getByText("You cannot propose a trade now.")).toBeInTheDocument();
  });

  test("works in a debt phase", () => {
    renderBuilder({ phase: "awaiting_debt" });
    expect(screen.getByRole("button", { name: "Propose" })).toBeInTheDocument();
  });
});

describe("TradeBuilder: validation", () => {
  test("asks for a partner first", () => {
    renderBuilder();
    expect(propose()).toBeDisabled();
    expect(propose()).toHaveAccessibleDescription("Choose a player to trade with");
  });

  test("blocks an empty trade", async () => {
    renderBuilder();
    await choose("Bo");
    expect(propose()).toBeDisabled();
    expect(propose()).toHaveAccessibleDescription(
      "Add cash, a property or a jail card to the trade",
    );
    expect(screen.getByText("Ann gives nothing · gets nothing")).toBeInTheDocument();
  });

  test("accepts a one-sided gift", async () => {
    renderBuilder();
    await choose("Bo");
    await userEvent.type(cash("Ann"), "10");
    expect(propose()).toBeEnabled();
  });

  test.each(["abc", "-5", "1.5", "1e3"])("rejects %s as cash", async (text) => {
    renderBuilder();
    await choose("Bo");
    await userEvent.type(cash("Ann"), text);
    expect(propose()).toBeDisabled();
    expect(cash("Ann")).toBeInvalid();
    expect(cash("Ann")).toHaveAccessibleDescription("Enter a whole number of dollars, 0 or more");
  });

  test("limits the cash of each side to the cash of its owner", async () => {
    renderBuilder({ players: { a: { cash: 200 }, b: { cash: 100 } } });
    await choose("Bo");

    await userEvent.type(cash("Ann"), "200");
    expect(propose()).toBeEnabled();
    await userEvent.type(cash("Ann"), "1");
    expect(cash("Ann")).toHaveAccessibleDescription("Ann has only $200");
    expect(propose()).toBeDisabled();

    await userEvent.clear(cash("Ann"));
    await userEvent.type(cash("Bo"), "101");
    expect(cash("Bo")).toHaveAccessibleDescription("Bo has only $100");
    expect(propose()).toBeDisabled();
    await userEvent.clear(cash("Bo"));
    await userEvent.type(cash("Bo"), "100");
    expect(propose()).toBeEnabled();
  });

  test("locks every property of a colour group that has buildings and says why", () => {
    renderBuilder({
      ownership: { ...deeds, "3": { ownerId: a.id, houses: 1, mortgaged: false } },
    });
    const driftwood = screen.getByRole("checkbox", { name: /Driftwood Lane/ });
    const kelp = screen.getByRole("checkbox", { name: /Kelp Court/ });
    expect(driftwood).toBeDisabled();
    expect(kelp).toBeDisabled();
    expect(driftwood).toHaveAccessibleDescription("Sell the buildings of this colour group first");
    expect(screen.getByRole("checkbox", { name: /North Station/ })).toBeEnabled();
    expect(screen.getByText(/Kelp Court/)).toHaveTextContent("1h");
  });

  test("locks a group when the buildings belong to the other owner of the group", () => {
    renderBuilder({
      ownership: { ...deeds, "3": { ownerId: b.id, houses: 2, mortgaged: false } },
    });
    expect(screen.getByRole("checkbox", { name: /Driftwood Lane/ })).toBeDisabled();
  });

  test("allows a mortgaged property and marks it", async () => {
    renderBuilder({
      ownership: { ...deeds, "5": { ownerId: a.id, houses: 0, mortgaged: true } },
    });
    await choose("Bo");
    const station = screen.getByRole("checkbox", { name: /North Station/ });
    expect(station).toBeEnabled();
    expect(column("Ann").getByText(/North Station/)).toHaveTextContent("mortgaged");
    await userEvent.click(station);
    expect(propose()).toBeEnabled();
  });

  test("shows only the properties and jail cards each owner holds", async () => {
    renderBuilder({ players: { b: { heldJailCards: ["chest"] } } });
    await choose("Bo");
    expect(column("Ann").getAllByRole("checkbox")).toHaveLength(3);
    expect(column("Bo").getAllByRole("checkbox")).toHaveLength(2);
    expect(
      column("Bo").getByRole("checkbox", { name: "Get Out of Jail Free (Chest)" }),
    ).toBeInTheDocument();
  });

  test("clears the choices of the partner side when the partner changes", async () => {
    renderBuilder({ players: { b: { cash: 500 } } });
    await choose("Bo");
    await userEvent.type(cash("Bo"), "50");
    await choose("Cy");
    expect(cash("Cy")).toHaveValue("");
  });
});

describe("TradeBuilder: ProposeTrade", () => {
  test("sends the exact engine payload as the seat on turn, then closes", async () => {
    const { send, onClose } = renderBuilder({
      players: { a: { heldJailCards: ["chance"] }, b: { heldJailCards: ["chest", "chance"] } },
    });
    await choose("Bo");
    await userEvent.click(column("Ann").getByRole("checkbox", { name: /North Station/ }));
    await userEvent.click(column("Ann").getByRole("checkbox", { name: /Driftwood Lane/ }));
    await userEvent.type(cash("Ann"), "50");
    await userEvent.click(column("Bo").getByRole("checkbox", { name: /Lantern Row/ }));
    await userEvent.click(
      column("Bo").getAllByRole("checkbox", { name: /Get Out of Jail Free/ })[1] as HTMLElement,
    );
    await userEvent.type(cash("Bo"), "20");

    expect(
      screen.getByText("Ann gives 2 properties + $50 · gets 1 property + $20 + 1 jail card"),
    ).toBeInTheDocument();
    await userEvent.click(propose());

    expect(send).toHaveBeenCalledExactlyOnceWith(
      {
        type: "ProposeTrade",
        toPlayerId: b.id,
        give: { cash: 50, squares: [1, 5], jailCards: [] },
        get: { cash: 20, squares: [6], jailCards: ["chance"] },
      },
      { seatId: a.id },
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("proposes as a hot-seat seat that is on turn, to a seat of the same device", async () => {
    const { send } = renderBuilder({ current: "c" });
    await choose("Ann");
    await userEvent.type(cash("Cy"), "5");
    await userEvent.click(propose());
    expect(send).toHaveBeenCalledExactlyOnceWith(
      {
        type: "ProposeTrade",
        toPlayerId: a.id,
        give: { cash: 5, squares: [], jailCards: [] },
        get: { cash: 0, squares: [], jailCards: [] },
      },
      { seatId: c.id },
    );
  });

  test("disables Propose while an action is on its way", async () => {
    const { send } = renderBuilder({ players: { c: { active: false } } }, fx.ownerId, {
      pending: true,
    });
    await userEvent.type(cash("Ann"), "5");
    expect(propose()).toBeDisabled();
    await userEvent.click(propose());
    expect(send).not.toHaveBeenCalled();
  });

  test("stays open when the server rejects the proposal", async () => {
    const error = new ApiError(422, "invalid_trade", "The partner does not have $20");
    const { send, onClose } = renderBuilder({ players: { c: { active: false } } });
    send.mockRejectedValueOnce(error);
    await userEvent.type(cash("Ann"), "5");
    await userEvent.click(propose());
    expect(onClose).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledOnce();
  });

  test("keeps a live region for the error of the actions context", () => {
    const error = new ApiError(422, "invalid_trade", "The partner does not have $20");
    const view = renderBuilder({ players: { c: { active: false } } });
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();
    view.update({ error });
    expect(region).toHaveTextContent("The partner does not have $20");
  });
});
