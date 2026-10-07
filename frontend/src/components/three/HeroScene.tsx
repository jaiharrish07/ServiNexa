'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Float, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';

/* ---------- Gear (torus ring) ---------- */

function Gear({
  position,
  rotation,
  scale = 1,
  speed = 1,
  color = '#3b82f6',
  reverse = false,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  speed?: number;
  color?: string;
  reverse?: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null!);

  useFrame((_, delta) => {
    ref.current.rotation.z += delta * speed * (reverse ? -1 : 1);
  });

  return (
    <mesh ref={ref} position={position} rotation={rotation} scale={scale}>
      <torusGeometry args={[1, 0.15, 16, 48]} />
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

/* ---------- Gear teeth ring ---------- */

function GearTeeth({
  position,
  radius = 1,
  teeth = 12,
  speed = 1,
  color = '#3b82f6',
  reverse = false,
}: {
  position: [number, number, number];
  radius?: number;
  teeth?: number;
  speed?: number;
  color?: string;
  reverse?: boolean;
}) {
  const ref = useRef<THREE.Group>(null!);

  useFrame((_, delta) => {
    ref.current.rotation.z += delta * speed * (reverse ? -1 : 1);
  });

  return (
    <group ref={ref} position={position}>
      <mesh>
        <torusGeometry args={[radius, 0.12, 16, 48]} />
        <meshStandardMaterial
          color={color}
          metalness={0.8}
          roughness={0.2}
          emissive={color}
          emissiveIntensity={0.25}
        />
      </mesh>
      {Array.from({ length: teeth }).map((_, i) => {
        const angle = (i / teeth) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[
              Math.cos(angle) * (radius + 0.2),
              Math.sin(angle) * (radius + 0.2),
              0,
            ]}
            rotation={[0, 0, angle]}
          >
            <boxGeometry args={[0.15, 0.12, 0.12]} />
            <meshStandardMaterial
              color={color}
              metalness={0.8}
              roughness={0.2}
              emissive={color}
              emissiveIntensity={0.2}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/* ---------- Floating particles ---------- */

function Particles({ count = 500 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null!);

  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const blue = new THREE.Color('#3b82f6');
    const purple = new THREE.Color('#8b5cf6');
    const cyan = new THREE.Color('#06b6d4');

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      pos[i3] = (Math.random() - 0.5) * 20;
      pos[i3 + 1] = (Math.random() - 0.5) * 20;
      pos[i3 + 2] = (Math.random() - 0.5) * 20;

      const c = [blue, purple, cyan][Math.floor(Math.random() * 3)];
      col[i3] = c.r;
      col[i3 + 1] = c.g;
      col[i3 + 2] = c.b;
    }
    return [pos, col];
  }, [count]);

  useFrame((_, delta) => {
    ref.current.rotation.y += delta * 0.03;
    ref.current.rotation.x += delta * 0.01;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.04}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation
      />
    </points>
  );
}

/* ---------- Distort Sphere ---------- */

function DistortSphere() {
  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
      <mesh position={[0, 0, -2]} scale={1.8}>
        <icosahedronGeometry args={[1, 4]} />
        <MeshDistortMaterial
          color="#3b82f6"
          emissive="#8b5cf6"
          emissiveIntensity={0.15}
          metalness={0.6}
          roughness={0.3}
          transparent
          opacity={0.25}
          distort={0.35}
          speed={2}
        />
      </mesh>
    </Float>
  );
}

/* ---------- Scene contents ---------- */

function SceneContent() {
  return (
    <>
      {/* Lights */}
      <ambientLight intensity={0.3} />
      <pointLight position={[5, 5, 5]} intensity={1.2} color="#3b82f6" />
      <pointLight position={[-5, -3, 3]} intensity={0.8} color="#8b5cf6" />
      <pointLight position={[0, -5, -5]} intensity={0.5} color="#06b6d4" />

      {/* Stars background */}
      <Stars radius={50} depth={60} count={1500} factor={3} fade speed={1} />

      {/* Interlocking gears */}
      <GearTeeth position={[-1.2, 0.3, 0]} radius={1.2} teeth={16} speed={0.4} color="#3b82f6" />
      <GearTeeth position={[1.5, 0.3, 0]} radius={0.9} teeth={12} speed={-0.533} color="#8b5cf6" reverse />
      <Gear position={[0, -1.8, 0.3]} scale={0.6} speed={0.7} color="#06b6d4" />
      <Gear position={[-2.8, 1.5, -0.5]} scale={0.5} speed={0.5} color="#8b5cf6" reverse />
      <Gear position={[3, -1, -0.3]} scale={0.4} speed={0.8} color="#3b82f6" />

      {/* Central distort sphere */}
      <DistortSphere />

      {/* Floating particles */}
      <Particles count={600} />

      {/* Controls */}
      <OrbitControls
        autoRotate
        autoRotateSpeed={0.5}
        enableZoom={false}
        enablePan={false}
        maxPolarAngle={Math.PI / 1.8}
        minPolarAngle={Math.PI / 3}
      />
    </>
  );
}

/* ---------- Exported component (SSR-safe) ---------- */

export const HeroScene = ({ className }: { className?: string }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className={className ?? 'absolute inset-0'}>
      <Canvas
        camera={{ position: [0, 0, 6], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <SceneContent />
      </Canvas>
    </div>
  );
};

export default HeroScene;
