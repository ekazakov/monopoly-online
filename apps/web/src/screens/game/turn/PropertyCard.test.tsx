import { SQUARES } from "@monopoly/game-engine";
import type { PropertySquare } from "@monopoly/game-engine";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vite-plus/test";
import { PropertyCard, deedRows } from "./PropertyCard.tsx";

const byName = (name: string) => SQUARES.find((s) => s.name === name) as PropertySquare;
const rows = (square: PropertySquare) => deedRows(square).map((r) => [r.label, r.value]);

describe("deedRows", () => {
  test("a street lists every rent, the building costs and the mortgage value", () => {
    const street = SQUARES.find((s) => s.kind === "street") as PropertySquare & {
      kind: "street";
    };
    const [base, h1, h2, h3, h4, hotel] = street.rent;
    expect(rows(street)).toEqual([
      ["Price", `$${street.price}`],
      ["Rent", `$${base}`],
      ["Rent with color set", `$${base * 2}`],
      ["With 1 house", `$${h1}`],
      ["With 2 houses", `$${h2}`],
      ["With 3 houses", `$${h3}`],
      ["With 4 houses", `$${h4}`],
      ["With hotel", `$${hotel}`],
      ["House cost", `$${street.buildPrice}`],
      ["Hotel cost", `$${street.buildPrice}`],
      ["Mortgage value", `$${street.mortgage}`],
    ]);
  });

  test("a station lists the rent for 1, 2, 3 and 4 stations (BUG-1)", () => {
    expect(rows(byName("North Station"))).toEqual([
      ["Price", "$200"],
      ["Rent with 1 station", "$25"],
      ["Rent with 2 stations", "$50"],
      ["Rent with 3 stations", "$100"],
      ["Rent with 4 stations", "$200"],
      ["Mortgage value", "$100"],
    ]);
  });

  test("a utility lists the dice multiplier for one and for both utilities", () => {
    const utility = SQUARES.find((s) => s.kind === "utility") as PropertySquare;
    expect(rows(utility)).toEqual([
      ["Price", "$150"],
      ["Rent with 1 utility", "4 × dice"],
      ["Rent with 2 utilities", "10 × dice"],
      ["Mortgage value", "$75"],
    ]);
  });

  test("a rule starts the cost block and the mortgage block", () => {
    const street = SQUARES.find((s) => s.kind === "street") as PropertySquare;
    expect(
      deedRows(street)
        .filter((r) => r.rule)
        .map((r) => r.label),
    ).toEqual(["House cost"]);
    expect(
      deedRows(byName("North Station"))
        .filter((r) => r.rule)
        .map((r) => r.label),
    ).toEqual(["Mortgage value"]);
  });
});

describe("PropertyCard", () => {
  test("shows the name, the kind and a row for each value", () => {
    const station = byName("North Station");
    const { container } = render(<PropertyCard square={station} />);
    expect(screen.getByText("Title deed")).toBeInTheDocument();
    expect(screen.getByText("North Station")).toBeInTheDocument();
    const list = container.querySelector("dl")!;
    expect(within(list).getAllByRole("term")).toHaveLength(deedRows(station).length);
  });
});
