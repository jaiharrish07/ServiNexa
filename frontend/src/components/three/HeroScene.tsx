'use client';

import { useRef, useMemo, useState, useEffect, Component, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Float, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';

/* ---------- Reduced-motion context ---------- */

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}

/* ---------- Gear (torus ring) ---------- */

function Gear({
  position,
  rotation,
  scale = 1,
  speed = 1,
  color = '#3b82f6',
  reverse = false,
  reducedMotion = false,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  speed?: number;
  color?: string;
  reverse?: boolean;
  reducedMotion?: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null!);

  useFrame((_, delta) => {
    if (reducedMotion) return;
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
  reducedMotion = false,
}: {
  position: [number, number, number];
  radius?: number;
  teeth?: number;
  speed?: number;
  color?: string;
  reverse?: boolean;
  reducedMotion?: boolean;
}) {
  const ref = useRef<THREE.Group>(null!);

  useFrame((_, delta) => {
    if (reducedMotion) return;
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

function Particles({ count = 400, reducedMotion = false }: { count?: number; reducedMotion?: boolean }) {
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
    if (reducedMotion) return;
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

function DistortSphere({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const sphere = (
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
        distort={reducedMotion ? 0 : 0.35}
        speed={reducedMotion ? 0 : 2}
      />
    </mesh>
  );

  if (reducedMotion) return sphere;

  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
      {sphere}
    </Float>
  );
}

/* ---------- Scene contents ---------- */

function SceneContent({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <>
      {/* Lights */}
      <ambientLight intensity={0.3} />
      <pointLight position={[5, 5, 5]} intensity={1.2} color="#3b82f6" />
      <pointLight position={[-5, -3, 3]} intensity={0.8} color="#8b5cf6" />
      <pointLight position={[0, -5, -5]} intensity={0.5} color="#06b6d4" />

      {/* Stars background */}
      <Stars radius={50} depth={60} count={1500} factor={3} fade speed={reducedMotion ? 0 : 1} />

      {/* Interlocking gears */}
      <GearTeeth position={[-1.2, 0.3, 0]} radius={1.2} teeth={16} speed={0.4} color="#3b82f6" reducedMotion={reducedMotion} />
      <GearTeeth position={[1.5, 0.3, 0]} radius={0.9} teeth={12} speed={-0.533} color="#8b5cf6" reverse reducedMotion={reducedMotion} />
      <Gear position={[0, -1.8, 0.3]} scale={0.6} speed={0.7} color="#06b6d4" reducedMotion={reducedMotion} />
      <Gear position={[-2.8, 1.5, -0.5]} scale={0.5} speed={0.5} color="#8b5cf6" reverse reducedMotion={reducedMotion} />
      <Gear position={[3, -1, -0.3]} scale={0.4} speed={0.8} color="#3b82f6" reducedMotion={reducedMotion} />

      {/* Central distort sphere */}
      <DistortSphere reducedMotion={reducedMotion} />

      {/* Floating particles (reduced from 600 to 400) */}
      <Particles count={400} reducedMotion={reducedMotion} />

      {/* Controls */}
      <OrbitControls
        autoRotate={!reducedMotion}
        autoRotateSpeed={0.5}
        enableZoom={false}
        enablePan={false}
        maxPolarAngle={Math.PI / 1.8}
        minPolarAngle={Math.PI / 3}
      />
    </>
  );
}

/* ---------- WebGL error boundary ---------- */

interface WebGLErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface WebGLErrorBoundaryState {
  hasError: boolean;
}

class WebGLErrorBoundary extends Component<WebGLErrorBoundaryProps, WebGLErrorBoundaryState> {
  constructor(props: WebGLErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): WebGLErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/* ---------- Gradient fallback ---------- */

function GradientFallback({ className }: { className?: string }) {
  return (
    <div
      className={className ?? 'absolute inset-0'}
      style={{
        background:
          'radial-gradient(ellipse at 30% 40%, rgba(59,130,246,0.15) 0%, transparent 60%), ' +
          'radial-gradient(ellipse at 70% 60%, rgba(139,92,246,0.12) 0%, transparent 55%), ' +
          'linear-gradient(135deg, #0a0e1a 0%, #111827 50%, #0a0e1a 100%)',
      }}
    />
  );
}

/* ---------- Check for WebGL support ---------- */

function isWebGLAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

/* ---------- Exported component (SSR-safe) ---------- */

export const HeroScene = ({ className }: { className?: string }) => {
  const [mounted, setMounted] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);
  const [webglSupported, setWebglSupported] = useState(true);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    setMounted(true);
    setWebglSupported(isWebGLAvailable());
    // Trigger fade-in after a brief delay to ensure the canvas is ready
    const timer = setTimeout(() => setFadeIn(true), 100);
    return () => clearTimeout(timer);
  }, []);

  if (!mounted) return null;

  if (!webglSupported) {
    return <GradientFallback className={className} />;
  }

  return (
    <div
      className={className ?? 'absolute inset-0'}
      style={{
        opacity: fadeIn ? 1 : 0,
        transition: 'opacity 0.8s ease-in-out',
      }}
    >
      <WebGLErrorBoundary fallback={<GradientFallback className={className} />}>
        <Canvas
          camera={{ position: [0, 0, 6], fov: 50 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent' }}
        >
          <SceneContent reducedMotion={reducedMotion} />
        </Canvas>
      </WebGLErrorBoundary>
    </div>
  );
};

export default HeroScene;
