import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { TokenSpot } from "./layout.ts";
import type { TokenModel } from "./model.ts";
import {
  AVATAR_HEIGHT,
  avatarFigure,
  avatarGeometry,
  hasGeometry,
  metal,
  studioEnvironment,
} from "./sculpt.ts";
import type { AvatarKind } from "./sculpt.ts";

/** Grid cells across the longest side of a figure; the prototype used 80 for the board tokens. */
const FIGURE_RES = 80;
/** Delay between two figures, so the main thread gets a break between two meshing passes. */
const STAGGER_MS = 20;

/** Surface-nets meshing is slow, so the board shows first and each figure appears when it is done. */
function useAvatarGeometry(kind: AvatarKind, order: number): THREE.BufferGeometry | null {
  const [, refresh] = useState(0);
  const cached = hasGeometry(kind, FIGURE_RES);
  useEffect(() => {
    if (cached) return;
    const timer = setTimeout(
      () => {
        avatarGeometry(kind, FIGURE_RES);
        refresh((n) => n + 1);
      },
      STAGGER_MS * (order + 1),
    );
    return () => clearTimeout(timer);
  }, [kind, order, cached]);
  return cached ? avatarGeometry(kind, FIGURE_RES) : null;
}

/** The studio reflection map of the metal figures. Needs the renderer, so it lives inside the canvas. */
export function useStudioEnvironment(): THREE.Texture {
  const gl = useThree((s) => s.gl);
  const env = useMemo(() => studioEnvironment(gl), [gl]);
  useEffect(() => () => env.dispose(), [env]);
  return env;
}

interface TokenPieceProps {
  token: TokenModel;
  spot: TokenSpot;
  order: number;
  env: THREE.Texture;
}

/**
 * One player token. It stands at `spot` as given; a later animation can move the group between
 * two spots without touching the layout code.
 */
function TokenPiece({ token, spot, order, env }: TokenPieceProps) {
  const geometry = useAvatarGeometry(token.avatar, order);
  const figure = useMemo(() => {
    if (!geometry) return null;
    const group = avatarFigure(
      geometry,
      metal(token.metal, env),
      AVATAR_HEIGHT[token.avatar] * 0.5,
      0.72,
    );
    group.traverse((o) => {
      o.userData.player = token.id;
    });
    return group;
  }, [geometry, env, token.metal, token.avatar, token.id]);
  useEffect(
    () => () => {
      // the geometry is cached and shared; only the material belongs to this figure
      figure?.traverse((o) => {
        if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
      });
    },
    [figure],
  );
  return (
    <group position={spot.position} scale={spot.scale} rotation-y={0.35} name={`token-${token.id}`}>
      {figure && <primitive object={figure} dispose={null} />}
    </group>
  );
}

interface TokensProps {
  tokens: readonly TokenModel[];
  spots: ReadonlyMap<string, TokenSpot>;
  env: THREE.Texture;
}

export function Tokens({ tokens, spots, env }: TokensProps) {
  return (
    <>
      {tokens.map((token, order) => {
        const spot = spots.get(token.id);
        return spot ? (
          <TokenPiece key={token.id} token={token} spot={spot} order={order} env={env} />
        ) : null;
      })}
    </>
  );
}
