import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vite-plus/test";
import { Waiting, waitingText } from "./ActionBar.tsx";

describe("waitingText", () => {
  test.each([
    [null, "Waiting for Ravi", null],
    ["online" as const, "Waiting for Ravi", null],
    [
      "reconnecting" as const,
      "Ravi is reconnecting…",
      "The game continues when the connection returns.",
    ],
    ["away" as const, "Waiting for Ravi to return", "The game continues when Ravi returns."],
  ])("for %s", (presence, title, sub) => {
    expect(waitingText("Ravi", presence)).toEqual({ title, sub });
  });

  test("with no name it waits for the game", () => {
    expect(waitingText("", "away")).toEqual({ title: "Waiting for the game", sub: null });
  });
});

describe("Waiting", () => {
  test("the Menu line is for the owner and for a player who is away only", () => {
    const { rerender } = render(
      <Waiting turn={{ actorName: "Ravi", actorPresence: "away", isOwner: true }} />,
    );
    expect(screen.getByText("You can also save or finish the game in the Menu.")).toBeVisible();

    rerender(
      <Waiting turn={{ actorName: "Ravi", actorPresence: "reconnecting", isOwner: true }} />,
    );
    expect(screen.queryByText(/save or finish/)).not.toBeInTheDocument();

    rerender(<Waiting turn={{ actorName: "Ravi", actorPresence: "away", isOwner: false }} />);
    expect(screen.queryByText(/save or finish/)).not.toBeInTheDocument();
  });
});
