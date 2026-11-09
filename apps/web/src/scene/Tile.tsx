import { SQUARES } from "@monopoly/game-engine";
import { useCursor } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { memo, useState } from "react";
import * as THREE from "three";
import { HIGHLIGHT_COLOR, MORTGAGED_TINT, groupColor, markerColor, markerInk } from "./colors.ts";
import { BAR_Z, CELL_H, MARKER_Z, buildingSlots, squareCell } from "./layout.ts";
import type { DeedModel } from "./model.ts";
import type { Resources } from "./resources.ts";

/** Pointer moves further than this many pixels between press and release are a drag, not a click. */
const CLICK_SLOP = 5;

interface TileProps {
  square: number;
  texture: THREE.Texture;
  /** The price in white, drawn on the owner marker. */
  priceTexture?: THREE.Texture;
  resources: Resources;
  deed?: DeedModel;
  highlighted: boolean;
  onSelect?: (square: number) => void;
}

export const Tile = memo(function Tile({
  square,
  texture,
  priceTexture,
  resources,
  deed,
  highlighted,
  onSelect,
}: TileProps) {
  const def = SQUARES[square]!;
  const cell = squareCell(square);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered && Boolean(onSelect));
  const mortgaged = deed?.mortgaged ?? false;
  const edge = resources.materials.edge;

  const handlers = onSelect
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          if (e.delta > CLICK_SLOP) return;
          e.stopPropagation();
          onSelect(square);
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHovered(true);
        },
        onPointerOut: () => setHovered(false),
      }
    : {};

  const slots = deed && def.kind === "street" ? buildingSlots(deed.houses) : [];

  return (
    <group position={[cell.x, 0, cell.z]} rotation-y={cell.rotationY}>
      <mesh
        geometry={cell.corner ? resources.geometries.corner : resources.geometries.side}
        position-y={CELL_H / 2}
        castShadow
        receiveShadow
        {...handlers}
      >
        {/* box face order: +x, -x, +y (the top), -y, +z, -z */}
        <primitive object={edge} attach="material-0" dispose={null} />
        <primitive object={edge} attach="material-1" dispose={null} />
        <meshStandardMaterial
          attach="material-2"
          map={texture}
          roughness={0.7}
          color={mortgaged ? MORTGAGED_TINT : "#ffffff"}
          emissive={HIGHLIGHT_COLOR}
          emissiveIntensity={highlighted ? 0.45 : 0}
        />
        <primitive object={edge} attach="material-3" dispose={null} />
        <primitive object={edge} attach="material-4" dispose={null} />
        <primitive object={edge} attach="material-5" dispose={null} />
      </mesh>
      {def.kind === "street" && (
        <mesh
          geometry={resources.geometries.bar}
          material={resources.barMaterial(groupColor(def.group))}
          position={[0, CELL_H + 0.025 - 0.001, BAR_Z]}
          castShadow
          receiveShadow
          {...handlers}
        />
      )}
      {deed && (
        <mesh
          geometry={resources.geometries.marker}
          material={resources.markerMaterial(deed.ownerColor, mortgaged)}
          position={[0, CELL_H + 0.009, MARKER_Z]}
          receiveShadow
        />
      )}
      {deed && priceTexture && (
        <mesh
          geometry={resources.geometries.markerPrice}
          position={[0, CELL_H + 0.0185, MARKER_Z]}
          rotation-x={-Math.PI / 2}
        >
          <meshBasicMaterial
            map={priceTexture}
            color={markerInk(markerColor(deed.ownerColor, mortgaged))}
            transparent
            toneMapped={false}
          />
        </mesh>
      )}
      {slots.map((slot, i) =>
        slot.kind === "hotel" ? (
          <group key={i} position={slot.position}>
            <mesh
              geometry={resources.geometries.hotelBody}
              material={resources.materials.hotel}
              castShadow
            />
            <mesh
              geometry={resources.geometries.hotelRoof}
              material={resources.materials.hotelRoof}
              position-y={0.13}
              castShadow
            />
          </group>
        ) : (
          <group key={i} position={slot.position}>
            <mesh
              geometry={resources.geometries.houseBody}
              material={resources.materials.house}
              castShadow
            />
            <mesh
              geometry={resources.geometries.houseRoof}
              material={resources.materials.houseRoof}
              position-y={0.115}
              rotation-y={Math.PI / 4}
              castShadow
            />
          </group>
        ),
      )}
    </group>
  );
});
