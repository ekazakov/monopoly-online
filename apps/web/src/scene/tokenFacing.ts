import type { AvatarKind } from "./sculpt.ts";
import { hopAt, stepSquares } from "./motion.ts";
import type { MoveStep } from "./motion.ts";

// The profile figures have their heads at -x. The car points along +x and the penguin along +z.
const FRONT_YAW: Record<AvatarKind, number> = {
  cat: -Math.PI / 2,
  dog: -Math.PI / 2,
  horse: -Math.PI / 2,
  duck: -Math.PI / 2,
  car: Math.PI / 2,
  penguin: 0,
};

/** Board north is -z and east is +x. Corners take the facing of the following side. */
export function tokenFacing(kind: AvatarKind, square: number): number {
  const heading = square >= 10 && square < 30 ? (3 * Math.PI) / 4 : -Math.PI / 4;
  return heading - FRONT_YAW[kind];
}

/** Keep the old facing during a hop; change it when the token touches the next square. */
export function arrivedSquare(step: MoveStep, elapsedMs: number): number {
  const { hop, t } = hopAt(step, elapsedMs);
  return stepSquares(step)[hop + (t === 1 ? 1 : 0)]!;
}
