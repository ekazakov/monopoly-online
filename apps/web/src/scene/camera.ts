import * as THREE from "three";
import { SLAB_SIZE } from "./layout.ts";

export const FOV = 32;
const NEAR = 0.1;
const FAR = 200;

/** Direction from the board centre to the camera, unit length: the prototype "angle" view. */
export const VIEW_DIRECTION: readonly [number, number, number] = (() => {
  const v = new THREE.Vector3(0, 0.9, 0.44).normalize();
  return [v.x, v.y, v.z];
})();

const half = SLAB_SIZE / 2;
const SLAB_CORNERS: readonly THREE.Vector3[] = [-half, half].flatMap((x) =>
  [-0.55, 0.3].flatMap((y) => [-half, half].map((z) => new THREE.Vector3(x, y, z))),
);

/**
 * The shortest distance along `direction` at which the whole slab stays inside the frame, with
 * `margin` of the frame to spare. Found by bisection on the projected corners, like the prototype.
 */
export function fitDistance(
  aspect: number,
  direction: readonly [number, number, number] = VIEW_DIRECTION,
  margin = 0.97,
  fov = FOV,
): number {
  const camera = new THREE.PerspectiveCamera(fov, aspect, NEAR, FAR);
  const dir = new THREE.Vector3(...direction).normalize();
  const point = new THREE.Vector3();
  let lo = 4;
  let hi = 80;
  for (let i = 0; i < 24; i++) {
    const d = (lo + hi) / 2;
    camera.position.copy(dir).multiplyScalar(d);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const fits = SLAB_CORNERS.every((corner) => {
      point.copy(corner).project(camera);
      return Math.abs(point.x) < margin && Math.abs(point.y) < margin;
    });
    if (fits) hi = d;
    else lo = d;
  }
  return hi;
}

/** Orbit limits of the prototype: a little turn either way, never upside down. */
export const ORBIT = {
  minPolarAngle: 0,
  maxPolarAngle: 0.95,
  minAzimuthAngle: -0.7,
  maxAzimuthAngle: 0.7,
  /** Zoom range as a share of the fitted distance. */
  minZoom: 0.6,
  maxZoom: 1.15,
} as const;
