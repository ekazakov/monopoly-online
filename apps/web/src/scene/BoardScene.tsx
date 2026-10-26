import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";

export function BoardScene() {
  return (
    <Canvas camera={{ position: [6, 8, 6], fov: 45 }} shadows>
      <color attach="background" args={["#0e1822"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={1.5} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#cfe3cc" />
      </mesh>
      <mesh position={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#e2574c" />
      </mesh>
      <OrbitControls maxPolarAngle={Math.PI / 2.5} />
    </Canvas>
  );
}
