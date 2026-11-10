import type * as THREE from "three";
import { CARD_COUNT, CARD_STACKS, CARD_T, cardJitter } from "./layout.ts";
import type { StackDeck } from "./layout.ts";
import type { Resources } from "./resources.ts";

/** Height of the board centre plane (`BoardScene`). The bottom card lies on it. */
const CENTRE_Y = 0.004;

// The Community Chest and Chance stacks in the board centre (BUG-7): a few thin cards, with the
// card back on the top card. The height is fixed, because the device does not know the deck size.
// Static: no animation, so reduced motion needs nothing.
export function CardStacks({
  resources,
  backs,
}: {
  resources: Resources;
  backs: Record<StackDeck, THREE.Texture>;
}) {
  return (
    <>
      {CARD_STACKS.map(({ deck, x, z, rotation }) => (
        <group key={deck} position={[x, CENTRE_Y, z]} rotation-y={rotation} name={`${deck}-stack`}>
          {Array.from({ length: CARD_COUNT }, (_, i) => {
            const jitter = cardJitter(i);
            return (
              <mesh
                key={i}
                geometry={resources.geometries.card}
                material={resources.materials.card}
                position={[jitter.x, CARD_T * (i + 0.5), jitter.z]}
                rotation-y={jitter.rotation}
                castShadow
                receiveShadow
              />
            );
          })}
          <mesh
            geometry={resources.geometries.cardBack}
            position={[
              cardJitter(CARD_COUNT - 1).x,
              CARD_T * CARD_COUNT + 0.001,
              cardJitter(CARD_COUNT - 1).z,
            ]}
            rotation={[-Math.PI / 2, 0, cardJitter(CARD_COUNT - 1).rotation]}
          >
            <meshStandardMaterial map={backs[deck]} roughness={0.7} />
          </mesh>
        </group>
      ))}
    </>
  );
}
