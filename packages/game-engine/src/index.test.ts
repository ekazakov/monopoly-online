import { describe, expect, test } from "vite-plus/test";
import { BOARD_SIZE } from "./index.ts";

describe("game-engine", () => {
  test("exports the board size", () => {
    expect(BOARD_SIZE).toBe(40);
  });
});
