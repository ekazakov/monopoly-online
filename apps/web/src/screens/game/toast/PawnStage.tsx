import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import * as THREE from "three";
import type { Token } from "@monopoly/shared";
import { tokenLook } from "../../../scene/colors.ts";
import {
  AVATAR_HEIGHT,
  avatarFigure,
  avatarGeometry,
  metal,
  studioEnvironment,
} from "../../../scene/sculpt.ts";
import { AvatarIcon } from "../rail/avatars.tsx";

/** Same meshing resolution as the board tokens, so the figure comes from the shared cache. */
const FIGURE_RES = 80;

function hasWebGl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * The 3D figure of a token on a round plinth with a ring in the player colour (the stage of the
 * old handoff screen). It stands still. Without WebGL it
 * shows the flat icon instead. The figure is decoration: the notice carries the name as text.
 */
export function PawnStage({ token, size }: { token: Token; size: number }) {
  const look = tokenLook(token);
  const host = useRef<HTMLDivElement>(null);
  const [webgl] = useState(hasWebGl);

  useEffect(() => {
    const element = host.current;
    if (!webgl || !element) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size, size, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.domElement.setAttribute("aria-hidden", "true");
    element.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const env = studioEnvironment(renderer);
    scene.add(new THREE.HemisphereLight(0xdfeeff, 0x1d2b24, 0.35));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.8);
    sun.position.set(-3, 6, 4);
    sun.castShadow = true;
    scene.add(sun);

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 1.3, 4.2);
    camera.lookAt(0, 0.62, 0);

    const plinthGeometry = new THREE.LatheGeometry(
      [
        [0, 0],
        [0.85, 0],
        [0.88, 0.03],
        [0.88, 0.09],
        [0.8, 0.12],
        [0, 0.12],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      64,
    );
    const plinthMaterial = new THREE.MeshStandardMaterial({
      color: 0x1b2a35,
      metalness: 0.4,
      roughness: 0.45,
    });
    const plinth = new THREE.Mesh(plinthGeometry, plinthMaterial);
    plinth.receiveShadow = true;
    scene.add(plinth);

    const ringGeometry = new THREE.TorusGeometry(0.8, 0.014, 8, 72);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(look.hex) });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.122;
    scene.add(ring);

    const figureMaterial = metal(look.metal, env);
    const figure = avatarFigure(
      avatarGeometry(look.avatar, FIGURE_RES),
      figureMaterial,
      Math.min(1.25, AVATAR_HEIGHT[look.avatar] * 0.8),
      1.4,
    );
    figure.position.y = 0.12;
    figure.rotation.y = 0.5;
    scene.add(figure);

    renderer.render(scene, camera);

    return () => {
      renderer.setAnimationLoop(null);
      // The figure geometry is cached and shared. Everything else belongs to this stage.
      plinthGeometry.dispose();
      plinthMaterial.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
      figureMaterial.dispose();
      env.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [webgl, size, look.avatar, look.hex, look.metal]);

  const box = { width: size, height: size, "--player-color": look.cssColor } as CSSProperties;
  if (!webgl) {
    return (
      <span className="turn-toast__figure turn-toast__figure--flat" aria-hidden="true" style={box}>
        <AvatarIcon kind={look.avatar} size={Math.round(size * 0.7)} />
      </span>
    );
  }
  return <div ref={host} className="turn-toast__figure" aria-hidden="true" style={box} />;
}
