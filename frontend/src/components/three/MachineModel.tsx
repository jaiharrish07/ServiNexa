'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Float } from '@react-three/drei';
import * as THREE from 'three';

/* ---------- Helpers ---------- */

/** Lerp a color from green to red based on health (0-100). */
function healthColor(health: number): string {
  if (health > 75) return '#10b981';
  if (health > 50) return '#f59e0b';
  if (health > 25) return '#f97316';
  return '#ef4444';
}

/* ---------- Machine body ---------- */

function MachineBody({ color }: { color: string }) {
  return (
    <group>
      {/* Main housing */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[2.4, 1.4, 1.6]} />
        <meshStandardMaterial
          color="#1a1f2e"
          metalness={0.7}
          roughness={0.3}
          emissive={color}
          emissiveIntensity={0.05}
        />
      </mesh>

      {/* Top panel */}
      <mesh position={[0, 0.85, 0]}>
        <boxGeometry args={[2.2, 0.3, 1.4]} />
        <meshStandardMaterial
          color="#222840"
          metalness={0.6}
          roughness={0.4}
        />
      </mesh>

      {/* Side vents */}
      {[-1, 1].map((side) => (
        <group key={side}>
          {[0.3, 0, -0.3].map((y, i) => (
            <mesh key={i} position={[side * 1.25, y, 0]}>
              <boxGeometry args={[0.08, 0.12, 1.2]} />
              <meshStandardMaterial color="#2a3050" metalness={0.5} roughness={0.5} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Base / legs */}
      {[-0.9, 0.9].map((x) =>
        [-0.6, 0.6].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, -0.95, z]}>
            <cylinderGeometry args={[0.12, 0.15, 0.5, 8]} />
            <meshStandardMaterial color="#2a3050" metalness={0.6} roughness={0.4} />
          </mesh>
        )),
      )}
    </group>
  );
}

/* ---------- Rotating gear ---------- */

function RotatingGear({
  position,
  radius = 0.4,
  speed = 1,
  color,
  reverse = false,
}: {
  position: [number, number, number];
  radius?: number;
  speed?: number;
  color: string;
  reverse?: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null!);

  useFrame((_, delta) => {
    ref.current.rotation.z += delta * speed * (reverse ? -1 : 1);
  });

  return (
    <mesh ref={ref} position={position}>
      <torusGeometry args={[radius, radius * 0.2, 12, 32]} />
      <meshStandardMaterial
        color={color}
        metalness={0.8}
        roughness={0.2}
        emissive={color}
        emissiveIntensity={0.3}
      />
    </mesh>
  );
}

/* ---------- Flywheel / cylinder ---------- */

function Flywheel({
  position,
  speed = 1,
  color,
}: {
  position: [number, number, number];
  speed?: number;
  color: string;
}) {
  const ref = useRef<THREE.Mesh>(null!);

  useFrame((_, delta) => {
    ref.current.rotation.x += delta * speed;
  });

  return (
    <mesh ref={ref} position={position} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.35, 0.35, 0.2, 24]} />
      <meshStandardMaterial
        color="#2a3050"
        metalness={0.7}
        roughness={0.3}
        emissive={color}
        emissiveIntensity={0.15}
      />
    </mesh>
  );
}

/* ---------- Hotspot marker ---------- */

function Hotspot({
  position,
  active,
}: {
  position: [number, number, number];
  active: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    if (!active) return;
    const s = 1 + Math.sin(clock.getElapsedTime() * 4) * 0.15;
    ref.current.scale.setScalar(s);
    glowRef.current.scale.setScalar(s * 1.8);
  });

  if (!active) return null;

  return (
    <Float speed={3} floatIntensity={0.3}>
      <group position={position}>
        {/* Core */}
        <mesh ref={ref}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshStandardMaterial
            color="#ef4444"
            emissive="#ef4444"
            emissiveIntensity={1.5}
          />
        </mesh>
        {/* Glow */}
        <mesh ref={glowRef}>
          <sphereGeometry args={[0.12, 16, 16]} />
          <meshStandardMaterial
            color="#ef4444"
            transparent
            opacity={0.25}
            emissive="#ef4444"
            emissiveIntensity={0.8}
          />
        </mesh>
      </group>
    </Float>
  );
}

/* ---------- Scene contents ---------- */

function MachineScene({ health, hotspots }: { health: number; hotspots: [number, number, number][] }) {
  const color = healthColor(health);

  const defaultHotspots: [number, number, number][] = useMemo(
    () => [
      [1.0, 0.6, 0.7],
      [-0.8, 0.3, 0.9],
      [0.5, -0.4, 0.8],
    ],
    [],
  );

  const spots = hotspots.length > 0 ? hotspots : defaultHotspots;
  const showHotspots = health < 60;

  return (
    <>
      {/* Lights */}
      <ambientLight intensity={0.4} />
      <pointLight position={[4, 4, 4]} intensity={1} color="#3b82f6" />
      <pointLight position={[-4, 2, 3]} intensity={0.6} color="#8b5cf6" />
      <directionalLight position={[0, 5, 5]} intensity={0.5} />

      {/* Machine body */}
      <MachineBody color={color} />

      {/* Moving parts */}
      <RotatingGear position={[-0.5, 0.5, 0.85]} radius={0.35} speed={1.2} color={color} />
      <RotatingGear position={[0.3, 0.5, 0.85]} radius={0.25} speed={-1.68} color={color} reverse />
      <Flywheel position={[1.35, 0.2, 0]} speed={1.5} color={color} />

      {/* Hotspot markers */}
      {spots.map((pos, i) => (
        <Hotspot key={i} position={pos} active={showHotspots} />
      ))}

      {/* Controls */}
      <OrbitControls
        enableZoom
        enablePan={false}
        maxPolarAngle={Math.PI / 1.5}
        minPolarAngle={Math.PI / 4}
        minDistance={3}
        maxDistance={10}
      />
    </>
  );
}

/* ---------- Exported component (SSR-safe) ---------- */

export interface MachineModelProps {
  health?: number;
  hotspots?: [number, number, number][];
  className?: string;
}

export const MachineModel = ({
  health = 85,
  hotspots = [],
  className,
}: MachineModelProps) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className={className ?? 'h-[400px] w-full'}>
      <Canvas
        camera={{ position: [3, 2, 4], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <MachineScene health={health} hotspots={hotspots} />
      </Canvas>
    </div>
  );
};

export default MachineModel;
