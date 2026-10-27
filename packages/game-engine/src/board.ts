export const BOARD_SIZE = 40;
export const JAIL_SQUARE = 10;
export const GO_SQUARE = 0;

export type StreetGroup = "brown" | "sky" | "pink" | "orange" | "red" | "yellow" | "green" | "navy";

export type SquareGroup = StreetGroup | "station" | "utility";

/** Rent with 0, 1, 2, 3, 4 houses, then a hotel. */
export type RentTable = readonly [number, number, number, number, number, number];

export type Square =
  | { kind: "go"; name: string }
  | { kind: "jail"; name: string }
  | { kind: "free_parking"; name: string }
  | { kind: "go_to_jail"; name: string }
  | { kind: "chance"; name: string }
  | { kind: "chest"; name: string }
  | { kind: "tax"; name: string; amount: number }
  | {
      kind: "street";
      name: string;
      group: StreetGroup;
      price: number;
      rent: RentTable;
      buildPrice: number;
      mortgage: number;
    }
  | { kind: "station"; name: string; group: "station"; price: number; mortgage: number }
  | { kind: "utility"; name: string; group: "utility"; price: number; mortgage: number };

export type PropertySquare = Extract<Square, { kind: "street" | "station" | "utility" }>;

export const STATION_RENT = [25, 50, 100, 200] as const;
export const UTILITY_MULTIPLIER = [4, 10] as const;

const street = (
  name: string,
  group: StreetGroup,
  price: number,
  rent: RentTable,
  buildPrice: number,
): Square => ({ kind: "street", name, group, price, rent, buildPrice, mortgage: price / 2 });
const station = (name: string): Square => ({
  kind: "station",
  name,
  group: "station",
  price: 200,
  mortgage: 100,
});
const utility = (name: string): Square => ({
  kind: "utility",
  name,
  group: "utility",
  price: 150,
  mortgage: 75,
});
const chance = (): Square => ({ kind: "chance", name: "Chance" });
const chest = (): Square => ({ kind: "chest", name: "Chest" });

/** Square index equals board position, clockwise from GO. Data from the rules reference, Appendix A and B. */
export const SQUARES: readonly Square[] = [
  { kind: "go", name: "GO" },
  street("Driftwood Lane", "brown", 60, [2, 10, 30, 90, 160, 250], 50),
  chest(),
  street("Kelp Court", "brown", 60, [4, 20, 60, 180, 320, 450], 50),
  { kind: "tax", name: "Income Tax", amount: 200 },
  station("North Station"),
  street("Lantern Row", "sky", 100, [6, 30, 90, 270, 400, 550], 50),
  chance(),
  street("Cobble Street", "sky", 100, [6, 30, 90, 270, 400, 550], 50),
  street("Saltmarsh Road", "sky", 120, [8, 40, 100, 300, 450, 600], 50),
  { kind: "jail", name: "Jail" },
  street("Anchor Street", "pink", 140, [10, 50, 150, 450, 625, 750], 100),
  utility("Power Works"),
  street("Rope Walk", "pink", 140, [10, 50, 150, 450, 625, 750], 100),
  street("Chandlers Quay", "pink", 160, [12, 60, 180, 500, 700, 900], 100),
  station("East Station"),
  street("Net Loft Road", "orange", 180, [14, 70, 200, 550, 750, 950], 100),
  chest(),
  street("Fishmarket Square", "orange", 180, [14, 70, 200, 550, 750, 950], 100),
  street("Customs House Row", "orange", 200, [16, 80, 220, 600, 800, 1000], 100),
  { kind: "free_parking", name: "Free Parking" },
  street("Beacon Hill", "red", 220, [18, 90, 250, 700, 875, 1050], 150),
  chance(),
  street("Lighthouse Road", "red", 220, [18, 90, 250, 700, 875, 1050], 150),
  street("Signal Point", "red", 240, [20, 100, 300, 750, 925, 1100], 150),
  station("South Station"),
  street("Boatyard Way", "yellow", 260, [22, 110, 330, 800, 975, 1150], 150),
  street("Shipwright Street", "yellow", 260, [22, 110, 330, 800, 975, 1150], 150),
  utility("Pump House"),
  street("Dry Dock Avenue", "yellow", 280, [24, 120, 360, 850, 1025, 1200], 150),
  { kind: "go_to_jail", name: "Go to Jail" },
  street("Admiralty Gardens", "green", 300, [26, 130, 390, 900, 1100, 1275], 200),
  street("Merchant Terrace", "green", 300, [26, 130, 390, 900, 1100, 1275], 200),
  chest(),
  street("Mariners Crescent", "green", 320, [28, 150, 450, 1000, 1200, 1400], 200),
  station("West Station"),
  chance(),
  street("Harbour Heights", "navy", 350, [35, 175, 500, 1100, 1300, 1500], 200),
  { kind: "tax", name: "Luxury Tax", amount: 100 },
  street("Grand Pier", "navy", 400, [50, 200, 600, 1400, 1700, 2000], 200),
];

export function isProperty(square: Square): square is PropertySquare {
  return square.kind === "street" || square.kind === "station" || square.kind === "utility";
}

/** Square indexes of every property in a group, in board order. */
export function groupSquares(group: SquareGroup): number[] {
  const result: number[] = [];
  SQUARES.forEach((square, index) => {
    if (isProperty(square) && square.group === group) result.push(index);
  });
  return result;
}
