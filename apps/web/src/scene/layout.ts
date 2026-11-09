import { BOARD_SIZE } from "@monopoly/game-engine";

// World units: the board is a 10 x 10 slab on the x/z plane, centred on the origin, y up.
// Square 0 (Start) is the corner at +x/+z; the squares run clockwise seen from above, as in the prototype.

/** Height of a square above the board base. */
export const CELL_H = 0.12;
export const CELL_W = 0.77;
export const CELL_D = 1.37;
export const CORNER_SIZE = 1.37;
/** Distance of the corner centres and of the outer row from the origin. */
export const RING = 4.3;
/** Distance of the first square of a side from the middle of that side's axis. */
const FIRST_SQUARE = 3.2;
/** Distance between two neighbouring squares of a side. */
export const STEP = 0.8;
/** Size of the slab that carries the squares. */
export const SLAB_SIZE = 10.3;

/** Local z of the colour bar, houses and hotel: the inner edge, facing the centre. */
export const BAR_Z = -0.535;
/**
 * Depth of the owner marker. It is a band along the outer edge and it carries the price, so it
 * is as deep as `PRICE_BAND_PX` of the 560px square texture (BUG-9).
 */
export const MARKER_DEPTH = 0.235;
/** Local z of the owner marker: its outer side is flush with the outer edge of the square. */
export const MARKER_Z = CELL_D / 2 - MARKER_DEPTH / 2;

export interface SquareCell {
  x: number;
  z: number;
  /** Rotation about y. A square's local -z always points at the centre of the board. */
  rotationY: number;
  corner: boolean;
}

/** World position and rotation of a square. Local frame: x along the edge, -z towards the centre. */
export function squareCell(square: number): SquareCell {
  if (!Number.isInteger(square) || square < 0 || square >= BOARD_SIZE) {
    throw new RangeError(`square out of range: ${square}`);
  }
  const side = Math.floor(square / 10);
  const slot = square % 10;
  if (slot === 0) {
    const corners = [
      [RING, RING],
      [-RING, RING],
      [-RING, -RING],
      [RING, -RING],
    ] as const;
    const [x, z] = corners[side]!;
    return { x, z, rotationY: 0, corner: true };
  }
  const run = (slot - 1) * STEP;
  const inner = FIRST_SQUARE;
  switch (side) {
    case 0:
      return { x: inner - run, z: RING, rotationY: 0, corner: false };
    case 1:
      return { x: -RING, z: inner - run, rotationY: -Math.PI / 2, corner: false };
    case 2:
      return { x: -inner + run, z: -RING, rotationY: Math.PI, corner: false };
    default:
      return { x: RING, z: -inner + run, rotationY: Math.PI / 2, corner: false };
  }
}

/** Turns a point given in the local frame of a square into world coordinates. */
export function localToWorld(
  cell: Pick<SquareCell, "x" | "z" | "rotationY">,
  lx: number,
  ly: number,
  lz: number,
): [number, number, number] {
  const cos = Math.cos(cell.rotationY);
  const sin = Math.sin(cell.rotationY);
  return [cell.x + lx * cos + lz * sin, ly, cell.z - lx * sin + lz * cos];
}

type Offset = readonly [number, number];

// Local (x, z) of the k-th of n tokens that share one square. The first row is nearer the colour bar.
const OFFSETS: readonly (readonly Offset[])[] = [
  [[0, 0.15]],
  [
    [-0.17, 0.15],
    [0.17, 0.15],
  ],
  [
    [-0.17, -0.05],
    [0.17, -0.05],
    [0, 0.4],
  ],
  [
    [-0.17, -0.1],
    [0.17, -0.1],
    [-0.17, 0.38],
    [0.17, 0.38],
  ],
  [
    [-0.17, -0.2],
    [0.17, -0.2],
    [0, 0.1],
    [-0.17, 0.4],
    [0.17, 0.4],
  ],
  [
    [-0.17, -0.2],
    [0.17, -0.2],
    [-0.17, 0.1],
    [0.17, 0.1],
    [-0.17, 0.4],
    [0.17, 0.4],
  ],
];

/** Largest number of tokens the layout spreads; more than this share the last spots. */
export const MAX_SPREAD = OFFSETS.length;

/** Local (x, z) offset of the k-th of n tokens on one square. */
export function tokenOffset(k: number, n: number): Offset {
  if (n < 1) throw new RangeError("n must be at least 1");
  const row = OFFSETS[Math.min(n, MAX_SPREAD) - 1]!;
  return row[Math.min(k, row.length - 1)]!;
}

/** Scale of a token that shares its square with others. */
export function tokenScale(n: number): number {
  if (n <= 1) return 1;
  if (n <= 4) return 0.82;
  return 0.7;
}

const JAIL_SQUARE = 10;
// The jail cell is the top-left 400 x 400 of the 560 x 560 corner texture: local x and z in [-0.685, 0.29].
const JAIL_CELL_CENTRE: Offset = [-0.2, -0.2];
// "Just visiting" runs along the bottom and right edges of the same corner.
const VISITING_CENTRE: Offset = [0.35, 0.35];

export interface TokenSite {
  id: string;
  square: number;
  inJail?: boolean;
}

export interface TokenSpot {
  position: [number, number, number];
  scale: number;
}

/**
 * Where every token stands. Tokens that share a square are spread; on the jail corner the
 * prisoners stand inside the cell and the visitors outside it. Input order decides who stands where.
 */
export function layoutTokens(sites: readonly TokenSite[]): Map<string, TokenSpot> {
  const groups = new Map<string, TokenSite[]>();
  for (const site of sites) {
    const key = site.square === JAIL_SQUARE && site.inJail ? "jail" : String(site.square);
    const group = groups.get(key);
    if (group) group.push(site);
    else groups.set(key, [site]);
  }
  const spots = new Map<string, TokenSpot>();
  for (const group of groups.values()) {
    const n = group.length;
    group.forEach((site, k) => {
      const cell = squareCell(site.square);
      const [ox, oz] = tokenOffset(k, n);
      let lx = ox;
      let lz = oz;
      if (cell.corner) {
        // a corner is larger, so the spread grows with it; the prototype used 1.4 for jail and 1.6 elsewhere
        const f = site.square === JAIL_SQUARE ? 1.4 : 1.6;
        lx = ox * f;
        lz = (oz - 0.15) * f;
        if (site.square === JAIL_SQUARE) {
          const [cx, cz] = site.inJail ? JAIL_CELL_CENTRE : VISITING_CENTRE;
          lx = cx + ox * (site.inJail ? 0.9 : 0.6);
          lz = cz + (oz - 0.15) * (site.inJail ? 0.9 : 0.6);
        }
      }
      spots.set(site.id, {
        position: localToWorld(cell, lx, CELL_H, lz),
        scale: tokenScale(n),
      });
    });
  }
  return spots;
}

export interface BuildingSlot {
  kind: "house" | "hotel";
  /** Position in the local frame of the square. */
  position: [number, number, number];
}

const BAR_TOP = CELL_H + 0.05;
const HOUSE_PITCH = 0.19;

/** Slots for the buildings of a street: 0 to 4 houses side by side, 5 means one hotel. */
export function buildingSlots(houses: number): BuildingSlot[] {
  const count = Math.max(0, Math.min(5, Math.trunc(houses)));
  if (count === 5) return [{ kind: "hotel", position: [0, BAR_TOP + 0.1, BAR_Z] }];
  return Array.from({ length: count }, (_, i) => ({
    kind: "house" as const,
    position: [(i - (count - 1) / 2) * HOUSE_PITCH, BAR_TOP + 0.065, BAR_Z] as [
      number,
      number,
      number,
    ],
  }));
}

/** Where a lone token stands on a square: the spot a walking token steps on. */
export function soloSpot(square: number): TokenSpot {
  return layoutTokens([{ id: "solo", square }]).get("solo")!;
}
