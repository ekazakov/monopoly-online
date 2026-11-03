import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { soloSpot } from "./layout.ts";
import type { TokenSpot } from "./layout.ts";
import type { TokenModel } from "./model.ts";
import { hopAt, stepSquares } from "./motion.ts";
import type { MotionStep } from "./motion.ts";
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

/** Height a token rises at the middle of a hop, and of a jump. */
const HOP_LIFT = 0.3;
const JUMP_LIFT = 0.9;

/** The spots a move passes: the start, a lone-token spot for each square between, and the landing. */
function waypoints(
  step: Exclude<MotionStep, { kind: "roll" }>,
  start: TokenSpot,
  landing: TokenSpot,
): TokenSpot[] {
  const squares = stepSquares(step);
  return squares.map((square, i) =>
    i === 0 ? start : i === squares.length - 1 ? landing : soloSpot(square),
  );
}

interface TokenPieceProps {
  token: TokenModel;
  spot: TokenSpot;
  order: number;
  env: THREE.Texture;
  /** The move this token makes now, with the spot it lands on. */
  move: { step: Exclude<MotionStep, { kind: "roll" }>; landing: TokenSpot } | null;
}

/**
 * One player token. It stands at `spot` as given. During a move the group hops along the
 * waypoints of the step; the canvas draws on demand, so each frame asks for the next one.
 */
function TokenPiece({ token, spot, order, env, move }: TokenPieceProps) {
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
  const group = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const startedAt = useRef(0);
  const path = useMemo(
    () => (move ? waypoints(move.step, spot, move.landing) : null),
    [move, spot],
  );
  const step = move?.step ?? null;

  useLayoutEffect(() => {
    startedAt.current = performance.now();
    invalidate();
  }, [step, invalidate]);

  // The frame loop moves the group by hand, and React does not set a prop that has not changed.
  // So when no move plays, the group goes back to its spot here.
  useLayoutEffect(() => {
    if (step) return;
    group.current?.position.set(...spot.position);
    group.current?.scale.setScalar(spot.scale);
    invalidate();
  }, [step, spot, invalidate]);

  useFrame(() => {
    const g = group.current;
    if (!g || !step || !path) return;
    const { hop, t } = hopAt(step, performance.now() - startedAt.current);
    const a = path[hop]!;
    const b = path[hop + 1] ?? path[hop]!;
    const lift = Math.sin(Math.PI * t) * (step.kind === "jump" ? JUMP_LIFT : HOP_LIFT);
    g.position.set(
      a.position[0] + (b.position[0] - a.position[0]) * t,
      a.position[1] + (b.position[1] - a.position[1]) * t + lift,
      a.position[2] + (b.position[2] - a.position[2]) * t,
    );
    g.scale.setScalar(a.scale + (b.scale - a.scale) * t);
    invalidate();
  });

  return (
    <group
      ref={group}
      position={spot.position}
      scale={spot.scale}
      rotation-y={0.35}
      name={`token-${token.id}`}
    >
      {figure && <primitive object={figure} dispose={null} />}
    </group>
  );
}

interface TokensProps {
  tokens: readonly TokenModel[];
  spots: ReadonlyMap<string, TokenSpot>;
  env: THREE.Texture;
  /** The step that plays now. A roll moves no token. */
  step: MotionStep | null;
  /** Where the token of a move step ends. */
  landing: TokenSpot | null;
}

export function Tokens({ tokens, spots, env, step, landing }: TokensProps) {
  return (
    <>
      {tokens.map((token, order) => {
        const spot = spots.get(token.id);
        return spot ? (
          <TokenPiece
            key={token.id}
            token={token}
            spot={spot}
            order={order}
            env={env}
            move={
              step && step.kind !== "roll" && step.playerId === token.id && landing
                ? { step, landing }
                : null
            }
          />
        ) : null;
      })}
    </>
  );
}
