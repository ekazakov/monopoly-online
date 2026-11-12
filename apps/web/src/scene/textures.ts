import * as THREE from "three";
import type { Square } from "@monopoly/game-engine";
import { drawGlyph } from "./avatarGlyphs.ts";
import { GROUP_COLORS, SURFACE, UNKNOWN_OWNER_COLOR, markerColor, tokenLook } from "./colors.ts";
import { CARD_D, CARD_W } from "./layout.ts";
import type { StackDeck } from "./layout.ts";
import type { AvatarKind } from "./sculpt.ts";

export const DISPLAY = '"Barlow Condensed", "Arial Narrow", sans-serif';
export const BODY = '"Barlow", system-ui, sans-serif';

const TILE_W = 320;
const TILE_H = 560;
const CORNER_PX = 560;
const CENTRE_PX = 1024;
/** Depth of the owner marker on the square texture: the price sits in this band (BUG-9). */
const PRICE_BAND_PX = 96;
const PRICE_PX = 46;
/** The owner chip on the owner band: its radius, its ring and the space around it. */
const CHIP_R = 42;
const CHIP_RING_PX = 8;
const BAND_PAD_PX = 8;
/** The glyph is small on the screen, so its outlines are thicker than in the player rail. */
const CHIP_GLYPH_WEIGHT = 1.8;

/** The width of the owner band texture, in pixels. */
export const OWNER_BAND_W = TILE_W;

export interface OwnerBandLayout {
  /** The centre and the radius of the owner chip. */
  chipX: number;
  chipR: number;
  /** The centre of the price, and the scale of its font (1 or less). */
  priceX: number;
  priceScale: number;
}

/**
 * Where the owner chip and the price go on the owner band. The chip is at the left side and the
 * price is centred in the rest. A price wider than that room gets a smaller font, so the chip
 * never covers it (BUG-9). With no price, the chip is centred.
 */
export function ownerBandLayout(priceWidth: number): OwnerBandLayout {
  if (priceWidth <= 0) {
    return { chipX: OWNER_BAND_W / 2, chipR: CHIP_R, priceX: OWNER_BAND_W / 2, priceScale: 1 };
  }
  const chipX = BAND_PAD_PX + CHIP_R;
  const left = chipX + CHIP_R + BAND_PAD_PX;
  const room = OWNER_BAND_W - BAND_PAD_PX - left;
  return {
    chipX,
    chipR: CHIP_R,
    priceX: left + room / 2,
    priceScale: Math.min(1, room / priceWidth),
  };
}

/** The price line under a square name, or an empty string when the square has none. */
export function priceLabel(square: Square): string {
  if (square.kind === "tax") return `Pay $${square.amount}`;
  if ("price" in square) return `$${square.price}`;
  return "";
}

/** Breaks `text` into lines no wider than `maxWidth`, by words. A single long word stays whole. */
export function wrapLines(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  lines.push(line);
  return lines;
}

type Ctx = CanvasRenderingContext2D;

function makeTexture(w: number, h: number, anisotropy: number, draw: (g: Ctx) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (g) draw(g);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

function drawIcon(g: Ctx, square: Square, cx: number, cy: number) {
  g.save();
  g.strokeStyle = SURFACE.ink;
  g.fillStyle = SURFACE.ink;
  g.lineWidth = 9;
  g.lineCap = "round";
  g.lineJoin = "round";
  if (square.kind === "station") {
    g.beginPath();
    g.roundRect(cx - 55, cy - 65, 110, 110, 24);
    g.stroke();
    g.beginPath();
    g.moveTo(cx - 55, cy - 15);
    g.lineTo(cx + 55, cy - 15);
    g.stroke();
    g.beginPath();
    g.arc(cx - 26, cy + 14, 6, 0, 7);
    g.fill();
    g.beginPath();
    g.arc(cx + 26, cy + 14, 6, 0, 7);
    g.fill();
    g.beginPath();
    g.moveTo(cx - 36, cy + 80);
    g.lineTo(cx - 20, cy + 45);
    g.moveTo(cx + 36, cy + 80);
    g.lineTo(cx + 20, cy + 45);
    g.stroke();
  } else if (square.kind === "utility") {
    g.beginPath();
    g.arc(cx, cy - 20, 48, 0, 7);
    g.stroke();
    g.beginPath();
    g.moveTo(cx - 22, cy + 42);
    g.lineTo(cx + 22, cy + 42);
    g.moveTo(cx - 16, cy + 62);
    g.lineTo(cx + 16, cy + 62);
    g.stroke();
  } else if (square.kind === "chance") {
    g.fillStyle = SURFACE.chance;
    g.font = `700 230px ${DISPLAY}`;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.fillText("?", cx, cy + 90);
  } else if (square.kind === "chest") {
    g.strokeStyle = SURFACE.chest;
    g.beginPath();
    g.roundRect(cx - 62, cy - 10, 124, 74, 8);
    g.stroke();
    g.beginPath();
    g.moveTo(cx - 62, cy + 18);
    g.lineTo(cx + 62, cy + 18);
    g.stroke();
    g.beginPath();
    g.moveTo(cx - 62, cy - 10);
    g.quadraticCurveTo(cx - 62, cy - 62, cx, cy - 62);
    g.quadraticCurveTo(cx + 62, cy - 62, cx + 62, cy - 10);
    g.stroke();
  } else if (square.kind === "tax") {
    g.beginPath();
    g.moveTo(cx, cy - 66);
    g.lineTo(cx + 62, cy);
    g.lineTo(cx, cy + 66);
    g.lineTo(cx - 62, cy);
    g.closePath();
    g.stroke();
    g.beginPath();
    g.moveTo(cx - 62, cy);
    g.lineTo(cx + 62, cy);
    g.stroke();
  }
  g.restore();
}

/** Top face of a side square: group band, name, icon or price. Local top is the inner edge. */
export function squareTexture(square: Square, anisotropy: number): THREE.CanvasTexture {
  return makeTexture(TILE_W, TILE_H, anisotropy, (g) => {
    g.fillStyle = SURFACE.paper;
    g.fillRect(0, 0, TILE_W, TILE_H);
    const street = square.kind === "street";
    if (street) {
      g.fillStyle = GROUP_COLORS[square.group];
      g.fillRect(0, 0, TILE_W, 120);
    }
    g.fillStyle = SURFACE.ink;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.font = `700 58px ${DISPLAY}`;
    const lines = wrapLines(square.name.toUpperCase(), 280, (t) => g.measureText(t).width);
    let y = (street ? 120 : 0) + 64;
    for (const line of lines) {
      g.fillText(line, TILE_W / 2, y);
      y += 56;
    }
    if (!street) drawIcon(g, square, TILE_W / 2, 350);
    g.font = `600 ${PRICE_PX}px ${BODY}`;
    const price = priceLabel(square);
    if (price) g.fillText(price, TILE_W / 2, priceBaseline(TILE_H));
  });
}

/** Baseline that centres the price in the marker band at the outer edge of a texture `height` high. */
function priceBaseline(height: number): number {
  return height - PRICE_BAND_PX / 2 + PRICE_PX * 0.35;
}

/**
 * The owner band on top of the owner marker: a neutral band with the owner chip and the price.
 * The chip is white, with the owner glyph in board ink and a ring in the owner colour, so the
 * glyph alone tells who owns the square. A mortgaged deed dims the ring and the glyph. The price
 * keeps the full ink, so it stays readable on the band.
 */
function ownerBandTexture(
  label: string,
  token: AvatarKind | undefined,
  mortgaged: boolean,
  anisotropy: number,
): THREE.CanvasTexture {
  return makeTexture(OWNER_BAND_W, PRICE_BAND_PX, anisotropy, (g) => {
    g.fillStyle = SURFACE.markerBand;
    g.fillRect(0, 0, OWNER_BAND_W, PRICE_BAND_PX);
    g.font = `600 ${PRICE_PX}px ${BODY}`;
    const layout = ownerBandLayout(label ? g.measureText(label).width : 0);
    const glyphInk = markerColor(SURFACE.ink, mortgaged);
    const ring = markerColor(token ? tokenLook(token).hex : UNKNOWN_OWNER_COLOR, mortgaged);
    const cy = PRICE_BAND_PX / 2;

    g.beginPath();
    g.arc(layout.chipX, cy, layout.chipR - CHIP_RING_PX / 2, 0, Math.PI * 2);
    g.fillStyle = "#ffffff";
    g.fill();
    g.lineWidth = CHIP_RING_PX;
    g.strokeStyle = ring;
    g.stroke();
    if (token) {
      const size = (layout.chipR - CHIP_RING_PX) * 1.6;
      drawGlyph(
        g,
        token,
        layout.chipX - size / 2,
        cy - size / 2,
        size,
        glyphInk,
        CHIP_GLYPH_WEIGHT,
      );
    }

    if (label) {
      g.fillStyle = SURFACE.ink;
      g.textAlign = "center";
      g.textBaseline = "alphabetic";
      g.font = `600 ${Math.floor(PRICE_PX * layout.priceScale)}px ${BODY}`;
      g.fillText(label, layout.priceX, priceBaseline(PRICE_BAND_PX));
    }
  });
}

type CornerKind = Extract<Square["kind"], "go" | "jail" | "free_parking" | "go_to_jail">;

/** Top face of a corner square. */
export function cornerTexture(kind: CornerKind, anisotropy: number): THREE.CanvasTexture {
  return makeTexture(CORNER_PX, CORNER_PX, anisotropy, (g) => {
    const w = CORNER_PX;
    g.fillStyle = SURFACE.paper;
    g.fillRect(0, 0, w, w);
    g.textAlign = "center";
    const ink = SURFACE.ink;
    if (kind === "go") {
      g.fillStyle = ink;
      g.font = `600 36px ${BODY}`;
      g.fillText("COLLECT $200", 280, 80);
      g.fillText("SALARY AS YOU PASS", 280, 122);
      g.fillStyle = SURFACE.red;
      g.font = `700 200px ${DISPLAY}`;
      g.fillText("START", 280, 370, 480);
      g.strokeStyle = SURFACE.red;
      g.lineWidth = 22;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.beginPath();
      g.moveTo(450, 470);
      g.lineTo(110, 470);
      g.moveTo(170, 425);
      g.lineTo(110, 470);
      g.lineTo(170, 515);
      g.stroke();
    } else if (kind === "jail") {
      g.fillStyle = "#f0902f";
      g.fillRect(0, 0, 400, 400);
      g.strokeStyle = ink;
      g.lineWidth = 8;
      g.strokeRect(0, 0, 400, 400);
      g.fillStyle = "#fbe3c4";
      g.fillRect(90, 60, 220, 190);
      g.strokeRect(90, 60, 220, 190);
      for (let x = 145; x < 310; x += 55) {
        g.beginPath();
        g.moveTo(x, 60);
        g.lineTo(x, 250);
        g.stroke();
      }
      g.fillStyle = ink;
      g.font = `700 70px ${DISPLAY}`;
      g.fillText("IN JAIL", 200, 340);
      g.font = `700 56px ${DISPLAY}`;
      g.fillText("JUST VISITING", 280, 510);
    } else if (kind === "free_parking") {
      g.fillStyle = ink;
      g.font = `700 92px ${DISPLAY}`;
      g.fillText("FREE", 280, 130);
      g.fillStyle = SURFACE.red;
      g.strokeStyle = ink;
      g.lineWidth = 9;
      g.lineJoin = "round";
      g.beginPath();
      g.moveTo(110, 360);
      g.lineTo(110, 300);
      g.lineTo(170, 280);
      g.lineTo(215, 215);
      g.lineTo(350, 215);
      g.lineTo(410, 280);
      g.lineTo(455, 295);
      g.lineTo(455, 360);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = SURFACE.paper;
      g.beginPath();
      g.arc(185, 365, 34, 0, 7);
      g.fill();
      g.stroke();
      g.beginPath();
      g.arc(385, 365, 34, 0, 7);
      g.fill();
      g.stroke();
      g.fillStyle = ink;
      g.fillText("PARKING", 280, 510);
    } else {
      g.fillStyle = ink;
      g.font = `700 92px ${DISPLAY}`;
      g.fillText("GO TO", 280, 130);
      g.fillStyle = "#2a6fb0";
      g.strokeStyle = ink;
      g.lineWidth = 9;
      g.lineJoin = "round";
      g.beginPath();
      g.moveTo(280, 170);
      g.lineTo(400, 215);
      g.lineTo(400, 320);
      g.quadraticCurveTo(400, 400, 280, 440);
      g.quadraticCurveTo(160, 400, 160, 320);
      g.lineTo(160, 215);
      g.closePath();
      g.fill();
      g.stroke();
      g.strokeStyle = "#fff";
      g.lineWidth = 24;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(222, 315);
      g.lineTo(268, 362);
      g.lineTo(345, 262);
      g.stroke();
      g.fillStyle = ink;
      g.fillText("JAIL", 280, 530);
    }
  });
}

/** The plain centre field. The card stacks are 3D (`CardStacks`), so nothing is drawn on it. */
export function centreTexture(anisotropy: number): THREE.CanvasTexture {
  return makeTexture(CENTRE_PX, CENTRE_PX, anisotropy, (g) => {
    g.fillStyle = SURFACE.centre;
    g.fillRect(0, 0, CENTRE_PX, CENTRE_PX);
  });
}

const CARD_LABELS = { chance: "CHANCE", chest: "CHEST" } as const;

/** The back of the top card of a deck: the deck colour, a light inner border and the deck name. */
export function cardBackTexture(deck: StackDeck, anisotropy: number): THREE.CanvasTexture {
  const w = 560;
  const h = Math.round((w * CARD_D) / CARD_W);
  return makeTexture(w, h, anisotropy, (g) => {
    g.fillStyle = SURFACE[deck];
    g.fillRect(0, 0, w, h);
    g.strokeStyle = SURFACE.paper;
    g.lineWidth = 8;
    g.strokeRect(24, 24, w - 48, h - 48);
    g.fillStyle = SURFACE.paper;
    g.font = `700 96px ${DISPLAY}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(CARD_LABELS[deck], w / 2, h / 2);
  });
}

/** Resolves when the board fonts are loaded, or after `timeoutMs`. Never rejects. */
export async function whenBoardFontsReady(timeoutMs = 1500): Promise<void> {
  const fonts = typeof document === "undefined" ? undefined : document.fonts;
  if (!fonts?.load) return;
  await Promise.race([
    Promise.all([fonts.load(`700 40px ${DISPLAY}`), fonts.load(`600 40px ${BODY}`)]),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]).catch(() => {});
}

export interface BoardTextures {
  /** Top face texture per square index. */
  squares: THREE.CanvasTexture[];
  /**
   * The owner band of a deed on `square`. Drawn on the first call and kept, so squares with the
   * same price, owner and mortgage state share one texture.
   */
  ownerBand(square: number, token: AvatarKind | undefined, mortgaged: boolean): THREE.CanvasTexture;
  centre: THREE.CanvasTexture;
  /** The back of the top card of each deck. */
  cardBacks: Record<StackDeck, THREE.CanvasTexture>;
  dispose(): void;
}

/** Draws every face of the board once. The caller owns the result and must call `dispose`. */
export function createBoardTextures(squares: readonly Square[], anisotropy: number): BoardTextures {
  const faces = squares.map((square) => {
    switch (square.kind) {
      case "go":
      case "jail":
      case "free_parking":
      case "go_to_jail":
        return cornerTexture(square.kind, anisotropy);
      default:
        return squareTexture(square, anisotropy);
    }
  });
  const bands = new Map<string, THREE.CanvasTexture>();
  const centre = centreTexture(anisotropy);
  const cardBacks = {
    chance: cardBackTexture("chance", anisotropy),
    chest: cardBackTexture("chest", anisotropy),
  };
  return {
    squares: faces,
    ownerBand(square, token, mortgaged) {
      const def = squares[square];
      const label = def && def.kind !== "tax" ? priceLabel(def) : "";
      const key = `${label}|${token ?? ""}|${mortgaged ? "m" : ""}`;
      let t = bands.get(key);
      if (!t) bands.set(key, (t = ownerBandTexture(label, token, mortgaged, anisotropy)));
      return t;
    },
    centre,
    cardBacks,
    dispose() {
      for (const t of faces) t.dispose();
      for (const t of bands.values()) t.dispose();
      bands.clear();
      centre.dispose();
      cardBacks.chance.dispose();
      cardBacks.chest.dispose();
    },
  };
}
