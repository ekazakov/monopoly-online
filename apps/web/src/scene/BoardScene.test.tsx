import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { BoardScene } from "./BoardScene.tsx";

// jsdom has no WebGL, so the canvas itself cannot be drawn here. This only checks that the
// component mounts without a context and falls back to an empty box instead of throwing.
describe("BoardScene without WebGL", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("renders a labelled fallback for the empty board", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    render(<BoardScene state={null} />);
    expect(screen.getByRole("img", { name: /3D board is not available/i })).toBeInTheDocument();
  });

  test("accepts the full props API", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    render(
      <BoardScene
        state={null}
        players={[{ id: "a", name: "Ines", token: "cat" }]}
        highlightSquare={7}
        onSquareClick={() => {}}
        reducedMotion
      />,
    );
    expect(screen.getByTestId("board-unavailable")).toBeInTheDocument();
  });
});
