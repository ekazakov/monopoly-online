import * as THREE from "three";
import { SURFACE } from "./colors.ts";
import {
  CARD_D,
  CARD_T,
  CARD_W,
  CELL_D,
  CELL_H,
  CELL_W,
  CORNER_SIZE,
  MARKER_DEPTH,
  SLAB_SIZE,
} from "./layout.ts";

const standard = (color: THREE.ColorRepresentation, roughness = 0.6) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });

/**
 * Geometries and materials that every square, house and marker shares, so the board costs a few
 * draw calls of shared buffers and not forty copies. `dispose` frees all of them.
 */
export function createResources() {
  const geometries = {
    slab: new THREE.BoxGeometry(SLAB_SIZE, 0.5, SLAB_SIZE),
    base: new THREE.BoxGeometry(10, 0.1, 10),
    shadowCatcher: new THREE.PlaneGeometry(40, 40),
    centre: new THREE.PlaneGeometry(7.2, 7.2),
    side: new THREE.BoxGeometry(CELL_W, CELL_H, CELL_D),
    corner: new THREE.BoxGeometry(CORNER_SIZE, CELL_H, CORNER_SIZE),
    bar: new THREE.BoxGeometry(CELL_W, 0.05, 0.3),
    marker: new THREE.BoxGeometry(CELL_W, 0.018, MARKER_DEPTH),
    /** The owner band (chip and price) on top of the marker. */
    markerPrice: new THREE.PlaneGeometry(CELL_W, MARKER_DEPTH),
    /** One card of a stack, and the plane with the card back on top of the top card. */
    card: new THREE.BoxGeometry(CARD_W, CARD_T, CARD_D),
    cardBack: new THREE.PlaneGeometry(CARD_W, CARD_D),
    houseBody: new THREE.BoxGeometry(0.15, 0.13, 0.15),
    houseRoof: new THREE.ConeGeometry(0.13, 0.1, 4),
    hotelBody: new THREE.BoxGeometry(0.5, 0.2, 0.2),
    hotelRoof: new THREE.BoxGeometry(0.52, 0.06, 0.22),
  };
  const materials = {
    slab: standard(SURFACE.slab, 0.7),
    base: standard(SURFACE.base, 0.8),
    edge: standard(SURFACE.edge, 0.8),
    shadowCatcher: new THREE.ShadowMaterial({ opacity: 0.35 }),
    /** The edge of a card. */
    card: standard(SURFACE.paper, 0.7),
    house: standard(SURFACE.house, 0.5),
    houseRoof: standard(SURFACE.houseRoof, 0.5),
    hotel: standard(SURFACE.hotel, 0.5),
    hotelRoof: standard(SURFACE.hotelRoof, 0.5),
    /** The owner marker. Neutral: the owner chip on its top tells who owns the square. */
    marker: standard(SURFACE.markerBand, 0.45),
  };
  const barMaterials = new Map<string, THREE.MeshStandardMaterial>();

  return {
    geometries,
    materials,
    /** Colour bar material of a group, one per colour. */
    barMaterial(hex: string) {
      let m = barMaterials.get(hex);
      if (!m) barMaterials.set(hex, (m = standard(hex, 0.5)));
      return m;
    },
    dispose() {
      for (const g of Object.values(geometries)) g.dispose();
      for (const m of [...Object.values(materials), ...barMaterials.values()]) {
        m.dispose();
      }
      barMaterials.clear();
    },
  };
}

export type Resources = ReturnType<typeof createResources>;
