import { SQUARES } from "@monopoly/game-engine";
import type { RedactedGameState } from "@monopoly/shared";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ComponentRef, ReactNode } from "react";
import * as THREE from "three";
import { FOV, ORBIT, VIEW_DIRECTION, fitDistance } from "./camera.ts";
import { layoutTokens } from "./layout.ts";
import type { TokenSpot } from "./layout.ts";
import { buildSceneModel } from "./model.ts";
import { IDLE_PLAYBACK, isMove, restingSites, stepSquares } from "./motion.ts";
import type { MotionPlayback } from "./motion.ts";
import type { ScenePlayer } from "./model.ts";
import { createResources } from "./resources.ts";
import { createBoardTextures, whenBoardFontsReady } from "./textures.ts";
import { Tile } from "./Tile.tsx";
import { Tokens, useStudioEnvironment } from "./Tokens.tsx";

export interface BoardSceneProps {
  /** The game to draw. With `null` the scene shows the empty board. */
  state: RedactedGameState | null;
  /** Colour index per player id. A player left out takes the colour of their place in `state.players`. */
  players?: readonly ScenePlayer[];
  /** A square drawn with a glow, for example the last square a token landed on. */
  highlightSquare?: number | null;
  /** Called with the square index when the player taps a square (not after a drag). */
  onSquareClick?: (square: number) => void;
  /** The dice and token motion that plays now. Tokens with a move that has not ended wait at its start. */
  motion?: MotionPlayback;
  /** Turns off camera damping. Token movement will read it too. */
  reducedMotion?: boolean;
}

let webglSupport: boolean | undefined;

/** Whether this browser can make a WebGL context. Probed once; jsdom and old devices say no. */
function hasWebGL(): boolean {
  if (webglSupport === undefined) {
    try {
      const canvas = document.createElement("canvas");
      webglSupport = Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}

function Unavailable() {
  return (
    <div
      role="img"
      aria-label="The 3D board is not available on this device"
      data-testid="board-unavailable"
      style={{ width: "100%", height: "100%" }}
    />
  );
}

class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? <Unavailable /> : this.props.children;
  }
}

/** Places the camera so the whole slab fits the canvas, and keeps it so when the canvas is resized. */
function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => (s.size.height > 0 ? s.size.width / s.size.height : 1));
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const distance = useMemo(() => fitDistance(aspect), [aspect]);

  useLayoutEffect(() => {
    camera.position.set(...VIEW_DIRECTION).multiplyScalar(distance);
    camera.lookAt(0, 0, 0);
    controls.current?.target.set(0, 0, 0);
    controls.current?.update();
  }, [camera, distance]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping={!reducedMotion}
      dampingFactor={0.08}
      minPolarAngle={ORBIT.minPolarAngle}
      maxPolarAngle={ORBIT.maxPolarAngle}
      minAzimuthAngle={ORBIT.minAzimuthAngle}
      maxAzimuthAngle={ORBIT.maxAzimuthAngle}
      minDistance={distance * ORBIT.minZoom}
      maxDistance={distance * ORBIT.maxZoom}
    />
  );
}

/** Counts up once the board fonts are loaded, so the textures are drawn again with them. */
function useFontEpoch(): number {
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    let live = true;
    void whenBoardFontsReady().then(() => {
      if (live) setEpoch(1);
    });
    return () => {
      live = false;
    };
  }, []);
  return epoch;
}

interface SceneProps extends Required<Pick<BoardSceneProps, "reducedMotion">> {
  state: RedactedGameState | null;
  players?: readonly ScenePlayer[];
  motion: MotionPlayback;
  highlightSquare: number | null;
  onSquareClick?: (square: number) => void;
}

function Scene({
  state,
  players,
  motion,
  highlightSquare,
  onSquareClick,
  reducedMotion,
}: SceneProps) {
  const gl = useThree((s) => s.gl);
  const resources = useMemo(createResources, []);
  useEffect(() => () => resources.dispose(), [resources]);

  const epoch = useFontEpoch();
  const textures = useMemo(
    () => createBoardTextures(SQUARES, gl.capabilities.getMaxAnisotropy()),
    // the epoch is not read: a new value only asks for a fresh draw once the fonts are there
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gl, epoch],
  );
  useEffect(() => () => textures.dispose(), [textures]);

  const env = useStudioEnvironment();

  const model = useMemo(() => buildSceneModel(state, players), [state, players]);
  const deeds = useMemo(() => new Map(model.deeds.map((d) => [d.square, d])), [model]);
  const sites = useMemo(
    () =>
      restingSites(model.tokens, motion).map((t) => ({
        id: t.id,
        square: t.square,
        inJail: t.inJail,
      })),
    [model, motion],
  );
  const spots = useMemo(() => layoutTokens(sites), [sites]);
  // Where the moving token ends, with the other tokens where they stand now.
  const landing = useMemo<TokenSpot | null>(() => {
    const step = motion.current;
    if (!isMove(step)) return null;
    const to = stepSquares(step).at(-1)!;
    const state = model.tokens.find((t) => t.id === step.playerId);
    const after = sites.map((s) =>
      s.id === step.playerId
        ? { id: s.id, square: to, inJail: Boolean(state?.inJail) && to === 10 }
        : s,
    );
    return layoutTokens(after).get(step.playerId) ?? null;
  }, [motion, model, sites]);

  return (
    <>
      <hemisphereLight args={[0xdfeeff, 0x2a3a2c, 0.85]} />
      <directionalLight
        color={0xfff1dc}
        intensity={2.2}
        position={[-6, 12, 7]}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-near={1}
        shadow-camera-far={30}
        shadow-bias={-0.0004}
      />
      <CameraRig reducedMotion={reducedMotion} />

      <mesh
        geometry={resources.geometries.slab}
        material={resources.materials.slab}
        position-y={-0.3}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={resources.geometries.base}
        material={resources.materials.base}
        position-y={-0.05}
        receiveShadow
      />
      <mesh
        geometry={resources.geometries.shadowCatcher}
        material={resources.materials.shadowCatcher}
        rotation-x={-Math.PI / 2}
        position-y={-0.56}
        receiveShadow
      />
      <mesh
        geometry={resources.geometries.centre}
        rotation-x={-Math.PI / 2}
        position-y={0.004}
        receiveShadow
      >
        <meshStandardMaterial map={textures.centre} roughness={0.85} />
      </mesh>

      {SQUARES.map((_, i) => (
        <Tile
          key={i}
          square={i}
          texture={textures.squares[i]!}
          priceTexture={textures.prices[i]}
          resources={resources}
          deed={deeds.get(i)}
          highlighted={highlightSquare === i}
          onSelect={onSquareClick}
        />
      ))}

      <Tokens
        tokens={model.tokens}
        spots={spots}
        env={env}
        step={motion.current}
        landing={landing}
      />
    </>
  );
}

/**
 * The 3D board. It fills its parent, so the parent needs a size. The canvas is transparent and the
 * shell paints the ground behind it.
 */
export function BoardScene({
  state,
  players,
  highlightSquare = null,
  onSquareClick,
  motion = IDLE_PLAYBACK,
  reducedMotion = false,
}: BoardSceneProps) {
  if (!hasWebGL()) return <Unavailable />;
  return (
    <SceneErrorBoundary>
      <Canvas
        // the scene only changes with props and camera moves, so it draws on demand
        frameloop="demand"
        // three r186 has no soft PCF map any more, so ask for the plain one and skip a warning
        shadows="percentage"
        dpr={[1, 2]}
        camera={{ fov: FOV, near: 0.1, far: 200, position: [0, 12, 6] }}
        gl={{
          antialias: true,
          alpha: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
        }}
        aria-hidden="true"
      >
        <Scene
          state={state}
          players={players}
          motion={motion}
          highlightSquare={highlightSquare}
          onSquareClick={onSquareClick}
          reducedMotion={reducedMotion}
        />
      </Canvas>
    </SceneErrorBoundary>
  );
}
