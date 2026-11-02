import { screen, within } from "@testing-library/react";
import { describe, expect, test } from "vite-plus/test";
import { renderRoute } from "../testing/render.tsx";

const gameId = "7b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d11";

describe("GameScreen", () => {
  test("the play route renders the layout with a labelled placeholder in each slot", async () => {
    await renderRoute(`/games/${gameId}/play`);
    const main = await screen.findByRole("main", { name: "Game" });
    expect(within(main).getByRole("complementary", { name: "Players" })).toHaveTextContent(
      "Player rail",
    );
    expect(within(main).getByRole("region", { name: "Game log bar" })).toHaveTextContent(
      "Game log",
    );
    expect(within(main).getByRole("region", { name: "Board" })).toHaveTextContent("Board");
    expect(within(main).getByRole("region", { name: "Turn actions" })).toHaveTextContent(
      "Turn area",
    );
    expect(within(main).getByRole("region", { name: "Property hand" })).toHaveTextContent(
      "Property hand",
    );
    expect(within(main).getByRole("navigation", { name: "Game menu" })).toHaveTextContent("Menu");
  });

  test("shows the game id from the route", async () => {
    await renderRoute(`/games/${gameId}/play`);
    const centre = await screen.findByRole("region", { name: "Turn actions" });
    expect(within(centre).getByText(`Game ${gameId}`)).toBeInTheDocument();
  });
});
