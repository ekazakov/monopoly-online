import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vite-plus/test";
import { GameLayout, type GameLayoutProps } from "./GameLayout.tsx";
import { GAME_REGIONS, GAME_REGION_LABELS, GAME_TAB_ORDER, type GameRegion } from "./regions.ts";

const landmarkRole: Record<GameRegion, string> = {
  rail: "complementary",
  log: "region",
  board: "region",
  centre: "region",
  hand: "region",
  menu: "navigation",
};

function slotContent(): GameLayoutProps {
  return Object.fromEntries(
    GAME_REGIONS.map((region) => [region, <button key={region}>{`${region} button`}</button>]),
  );
}

describe("GameLayout", () => {
  test("renders a main landmark with a heading", () => {
    render(<GameLayout />);
    expect(screen.getByRole("main", { name: "Game" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Game" })).toBeInTheDocument();
  });

  test.each(GAME_REGIONS)("the %s region has its landmark and label", (region) => {
    render(<GameLayout />);
    const landmark = screen.getByRole(landmarkRole[region], { name: GAME_REGION_LABELS[region] });
    expect(landmark).toHaveAttribute("data-region", region);
  });

  test("each slot content appears in its own region only", () => {
    render(<GameLayout {...slotContent()} />);
    for (const region of GAME_REGIONS) {
      const landmark = screen.getByRole(landmarkRole[region], {
        name: GAME_REGION_LABELS[region],
      });
      expect(within(landmark).getByRole("button")).toHaveTextContent(`${region} button`);
    }
  });

  test("a slot left out renders an empty region", () => {
    render(<GameLayout centre={<p>Only centre</p>} />);
    expect(screen.getByRole("region", { name: "Turn actions" })).toHaveTextContent("Only centre");
    expect(screen.getByRole("complementary", { name: "Players" })).toBeEmptyDOMElement();
  });

  test("the DOM order is the keyboard order", async () => {
    const user = userEvent.setup();
    render(<GameLayout {...slotContent()} />);
    const focusOrder: string[] = [];
    for (let i = 0; i < GAME_REGIONS.length; i++) {
      await user.tab();
      focusOrder.push(document.activeElement?.textContent ?? "");
    }
    const expected = GAME_TAB_ORDER.map((region) => `${region} button`);
    expect(focusOrder).toEqual(expected);
    expect(GAME_TAB_ORDER).toEqual(["board", "log", "menu", "rail", "centre", "hand"]);
  });

  test("the tab order lists every region once", () => {
    expect([...GAME_TAB_ORDER].sort()).toEqual([...GAME_REGIONS].sort());
  });
});
