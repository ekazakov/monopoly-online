import { render } from "@testing-library/react";
import { describe, expect, test } from "vite-plus/test";
import { AvatarIcon } from "./avatars.tsx";

describe("AvatarIcon", () => {
  test("draws the shapes of the glyph as SVG elements", () => {
    const { container } = render(<AvatarIcon kind="cat" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 48 48");
    expect(svg.querySelectorAll("path")).toHaveLength(6);
    // the eyes are filled dots with no stroke
    const dots = svg.querySelectorAll('circle[fill="currentColor"][stroke="none"]');
    expect(dots).toHaveLength(2);
    expect(svg.querySelector('path[stroke-width="1.6"]')).not.toBeNull();
  });

  test("keeps the shift of the car glyph", () => {
    const { container } = render(<AvatarIcon kind="car" size={20} />);
    expect(container.querySelector("g")?.getAttribute("transform")).toBe("translate(0 -5)");
    expect(container.querySelector("svg")?.getAttribute("width")).toBe("20");
  });
});
