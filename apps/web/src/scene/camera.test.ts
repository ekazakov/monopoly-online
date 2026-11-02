import * as THREE from "three";
import { describe, expect, test } from "vite-plus/test";
import { FOV, VIEW_DIRECTION, fitDistance } from "./camera.ts";
import { SLAB_SIZE } from "./layout.ts";

function corners(): THREE.Vector3[] {
  const h = SLAB_SIZE / 2;
  return [-h, h].flatMap((x) =>
    [-0.55, 0.3].flatMap((y) => [-h, h].map((z) => new THREE.Vector3(x, y, z))),
  );
}

function extent(aspect: number, distance: number) {
  const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 200);
  camera.position.set(...VIEW_DIRECTION).multiplyScalar(distance);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const ndc = corners().map((c) => c.clone().project(camera));
  return {
    x: Math.max(...ndc.map((p) => Math.abs(p.x))),
    y: Math.max(...ndc.map((p) => Math.abs(p.y))),
  };
}

describe("fitDistance", () => {
  test("has a unit view direction", () => {
    expect(Math.hypot(...VIEW_DIRECTION)).toBeCloseTo(1);
  });

  test.each([0.5, 1, 1.6, 2.4])("keeps the whole slab in frame at aspect %s", (aspect) => {
    const { x, y } = extent(aspect, fitDistance(aspect));
    expect(x).toBeLessThanOrEqual(0.97 + 1e-3);
    expect(y).toBeLessThanOrEqual(0.97 + 1e-3);
    // and it is the tightest fit: one side touches the margin
    expect(Math.max(x, y)).toBeGreaterThan(0.95);
  });

  test("backs off in a narrow frame", () => {
    expect(fitDistance(0.5)).toBeGreaterThan(fitDistance(1.6));
  });

  test("a bigger margin lets the camera come closer", () => {
    expect(fitDistance(1, VIEW_DIRECTION, 1)).toBeLessThan(fitDistance(1, VIEW_DIRECTION, 0.8));
  });
});
