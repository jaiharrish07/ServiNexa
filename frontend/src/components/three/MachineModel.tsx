'use client';

import React, { useRef, useState, useEffect, useMemo, Component, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  OrbitControls, Float, Html, RoundedBox, ContactShadows,
  Environment, Lightformer,
} from '@react-three/drei';
import * as THREE from 'three';

class CanvasErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="h-full flex items-center justify-center text-sm text-[var(--text-muted)]">
          3D viewer failed to load. Try refreshing.
        </div>
      );
    }
    return this.props.children;
  }
}

/* ───────────── Types ───────────── */

export interface MachineComponent {
  component_id: string;
  component_name: string;
  coord_x: number;
  coord_y: number;
  coord_z: number;
  highlight_color?: string;
}

export interface SensorData {
  air_temp?: number;
  process_temp?: number;
  rotational_speed?: number;
  torque?: number;
  tool_wear?: number;
}

export interface MachineModelProps {
  health?: number;
  machineType?: string;
  sensorData?: SensorData;
  components?: MachineComponent[];
  highlightId?: string;
  onComponentClick?: (component: MachineComponent) => void;
  className?: string;
}

/* ───────────── Constants ───────────── */

function healthColor(health: number): string {
  if (health > 75) return '#10b981';
  if (health > 50) return '#f59e0b';
  if (health > 25) return '#f97316';
  return '#ef4444';
}

const MAT = {
  chassis: { color: '#3a4260', metalness: 0.65, roughness: 0.38 },
  panelDark: { color: '#2e3550', metalness: 0.55, roughness: 0.48 },
  panelLight: { color: '#4a5272', metalness: 0.5, roughness: 0.42 },
  steel: { color: '#8a9ab5', metalness: 0.9, roughness: 0.15 },
  steelDark: { color: '#5a6a85', metalness: 0.85, roughness: 0.22 },
  chrome: { color: '#d4dae6', metalness: 0.98, roughness: 0.05 },
  aluminum: { color: '#b0baca', metalness: 0.82, roughness: 0.28 },
  rubber: { color: '#1a1e28', metalness: 0.05, roughness: 0.92 },
  plastic: { color: '#3a4050', metalness: 0.1, roughness: 0.7 },
  orange: { color: '#e8701a', metalness: 0.45, roughness: 0.38 },
  orangeBright: { color: '#ff8c2a', metalness: 0.5, roughness: 0.32 },
  green: { color: '#1a3a2a', metalness: 0.3, roughness: 0.6 },
  copper: { color: '#c88040', metalness: 0.88, roughness: 0.2 },
  warning: { color: '#f59e0b', metalness: 0.1, roughness: 0.75 },
} as const;

const COMPONENT_SHAPES: Record<string, { geometry: 'box' | 'cylinder' | 'sphere'; args: number[] }> = {
  motor: { geometry: 'cylinder', args: [0.3, 0.3, 0.5, 16] },
  pump: { geometry: 'cylinder', args: [0.25, 0.25, 0.4, 12] },
  gearbox: { geometry: 'box', args: [0.5, 0.4, 0.4] },
  bearing: { geometry: 'sphere', args: [0.15, 16, 16] },
  hydraulic_pump: { geometry: 'cylinder', args: [0.25, 0.3, 0.45, 12] },
  hydraulic_cylinder: { geometry: 'cylinder', args: [0.12, 0.12, 0.6, 12] },
  belt: { geometry: 'box', args: [0.6, 0.05, 0.15] },
  spindle: { geometry: 'cylinder', args: [0.08, 0.08, 0.7, 12] },
  control_board: { geometry: 'box', args: [0.5, 0.35, 0.08] },
  coolant_system: { geometry: 'box', args: [0.35, 0.25, 0.3] },
  sensor_array: { geometry: 'box', args: [0.2, 0.1, 0.15] },
  wiring_harness: { geometry: 'box', args: [0.4, 0.06, 0.06] },
};

/* ───────────── Shared sub-components ───────────── */

function Bolt({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh>
        <cylinderGeometry args={[0.022, 0.022, 0.015, 6]} />
        <meshStandardMaterial color="#8090a5" metalness={0.95} roughness={0.12} />
      </mesh>
      <mesh position={[0, 0.01, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.008, 6]} />
        <meshStandardMaterial color="#5a6878" metalness={0.9} roughness={0.2} />
      </mesh>
    </group>
  );
}

function BoltGrid({ positions }: { positions: [number, number, number][] }) {
  return <>{positions.map((p, i) => <Bolt key={i} position={p} />)}</>;
}

function VentSlots({ position, rotation, count = 5, width = 0.6, gap = 0.06 }: {
  position: [number, number, number]; rotation?: [number, number, number];
  count?: number; width?: number; gap?: number;
}) {
  return (
    <group position={position} rotation={rotation}>
      {Array.from({ length: count }).map((_, i) => (
        <mesh key={i} position={[0, i * gap - ((count - 1) * gap) / 2, 0.001]}>
          <boxGeometry args={[width, 0.015, 0.01]} />
          <meshStandardMaterial color="#0a0d14" metalness={0.3} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function IndicatorLight({ position, color, on = true }: {
  position: [number, number, number]; color: string; on?: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (!on) return;
    const i = 0.5 + Math.sin(clock.getElapsedTime() * 2.5) * 0.5;
    (ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity = i;
  });
  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.025, 10, 10]} />
      <meshStandardMaterial
        color={color} emissive={color}
        emissiveIntensity={on ? 0.8 : 0} toneMapped={false}
      />
    </mesh>
  );
}

function CableTube({ points, radius = 0.018, color = '#1a1e28' }: {
  points: [number, number, number][]; radius?: number; color?: string;
}) {
  const curve = useMemo(() => {
    const vecs = points.map(p => new THREE.Vector3(...p));
    return new THREE.CatmullRomCurve3(vecs);
  }, [points]);
  const geo = useMemo(() => new THREE.TubeGeometry(curve, 20, radius, 8, false), [curve, radius]);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color={color} metalness={0.15} roughness={0.85} />
    </mesh>
  );
}

function HazardTape({ position, size }: { position: [number, number, number]; size: [number, number] }) {
  const tex = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const stripeW = 24;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, 256, 32);
    ctx.fillStyle = '#f59e0b';
    for (let x = -32; x < 300; x += stripeW * 2) {
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x + stripeW, 0);
      ctx.lineTo(x + stripeW + 16, 32); ctx.lineTo(x + 16, 32);
      ctx.fill();
    }
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(size[0] * 2, 1);
    return t;
  }, [size]);
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={size} />
      <meshStandardMaterial map={tex} metalness={0.1} roughness={0.75} />
    </mesh>
  );
}

function StatusScreen({ position, rotation, size, color, label }: {
  position: [number, number, number]; rotation?: [number, number, number];
  size: [number, number]; color: string; label?: string;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    const mat = ref.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 0.7 + Math.sin(clock.getElapsedTime() * 1.5) * 0.15;
  });
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0, -0.004]}>
        <boxGeometry args={[size[0] + 0.02, size[1] + 0.02, 0.006]} />
        <meshStandardMaterial color="#0a0d12" metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh ref={ref}>
        <planeGeometry args={size} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} toneMapped={false} />
      </mesh>
      {label && (
        <Html center position={[0, 0, 0.003]} distanceFactor={4} style={{ pointerEvents: 'none' }}>
          <div className="text-[7px] font-mono font-bold text-white/90 whitespace-nowrap tracking-wider">
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

function ServoMotor({ position, rotation }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <cylinderGeometry args={[0.065, 0.065, 0.14, 14]} />
        <meshStandardMaterial {...MAT.steelDark} />
      </mesh>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.05, 10]} />
        <meshStandardMaterial {...MAT.chrome} />
      </mesh>
      <mesh position={[0, -0.075, 0]}>
        <cylinderGeometry args={[0.04, 0.068, 0.01, 14]} />
        <meshStandardMaterial {...MAT.aluminum} />
      </mesh>
    </group>
  );
}

/* ───────────── CNC Mill (Haas VF-2 style) ───────────── */

function SpindleAssembly({ color }: { color: string }) {
  const spindleRef = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    spindleRef.current.rotation.y = clock.getElapsedTime() * 3;
  });
  return (
    <group position={[0, 0.65, 0]}>
      {/* Spindle head housing */}
      <RoundedBox args={[0.52, 0.44, 0.44]} radius={0.04} position={[0, 0.22, 0]}>
        <meshStandardMaterial {...MAT.panelDark} />
      </RoundedBox>
      {/* Z-axis linear rail */}
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[0.08, 0.2, 0.08]} />
        <meshStandardMaterial {...MAT.steel} />
      </mesh>
      {/* Spindle motor top */}
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.12, 16]} />
        <meshStandardMaterial {...MAT.steelDark} />
      </mesh>
      {/* Spindle shaft */}
      <group ref={spindleRef}>
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.035, 0.35, 14]} />
          <meshPhysicalMaterial color="#c8d4e4" metalness={0.97} roughness={0.04} clearcoat={0.8} />
        </mesh>
        {/* Tool holder / collet */}
        <mesh position={[0, -0.2, 0]}>
          <cylinderGeometry args={[0.06, 0.03, 0.1, 12]} />
          <meshStandardMaterial {...MAT.chrome} />
        </mesh>
        {/* Tool bit */}
        <mesh position={[0, -0.3, 0]}>
          <cylinderGeometry args={[0.015, 0.008, 0.12, 8]} />
          <meshStandardMaterial {...MAT.chrome} />
        </mesh>
      </group>
      {/* Coolant nozzle */}
      <CableTube
        points={[[0.22, 0.1, 0.18], [0.15, -0.1, 0.15], [0.06, -0.2, 0.08]]}
        radius={0.012} color="#4488aa"
      />
      <IndicatorLight position={[0.24, 0.35, 0.2]} color={color} />
    </group>
  );
}

function CNCMillBody({ color }: { color: string }) {
  return (
    <group>
      {/* ── Main cabinet body ── */}
      <RoundedBox args={[2.6, 1.7, 1.8]} radius={0.05} position={[0, 0.1, 0]}>
        <meshStandardMaterial {...MAT.chassis} />
      </RoundedBox>

      {/* ── Accent stripe (Haas green) on top edge ── */}
      <mesh position={[0, 0.96, 0.91]}>
        <boxGeometry args={[2.55, 0.04, 0.02]} />
        <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={0.4} metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.96, -0.91]}>
        <boxGeometry args={[2.55, 0.04, 0.02]} />
        <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={0.4} metalness={0.3} roughness={0.4} />
      </mesh>

      {/* ── Left side panel with vents ── */}
      <RoundedBox args={[0.03, 1.4, 1.5]} radius={0.01} position={[-1.32, 0.12, 0]}>
        <meshStandardMaterial {...MAT.panelLight} />
      </RoundedBox>
      <VentSlots position={[-1.34, -0.2, 0]} rotation={[0, -Math.PI / 2, 0]} count={7} width={0.8} />

      {/* ── Right side panel ── */}
      <RoundedBox args={[0.03, 1.4, 1.5]} radius={0.01} position={[1.32, 0.12, 0]}>
        <meshStandardMaterial {...MAT.panelLight} />
      </RoundedBox>
      <VentSlots position={[1.34, 0.3, 0]} rotation={[0, Math.PI / 2, 0]} count={5} width={0.6} />

      {/* ── Enclosure window (large front safety glass) ── */}
      <group position={[0, 0.25, 0.91]}>
        {/* Frame */}
        <RoundedBox args={[1.8, 1.0, 0.05]} radius={0.02}>
          <meshStandardMaterial {...MAT.steelDark} />
        </RoundedBox>
        {/* Glass */}
        <mesh position={[0, 0, 0.01]}>
          <boxGeometry args={[1.6, 0.85, 0.015]} />
          <meshPhysicalMaterial
            color="#88ccaa" metalness={0.1} roughness={0.05}
            transparent opacity={0.25} transmission={0.7}
            ior={1.45} clearcoat={1} clearcoatRoughness={0.02}
          />
        </mesh>
        {/* Window handle */}
        <mesh position={[0.85, 0, 0.03]}>
          <boxGeometry args={[0.04, 0.2, 0.03]} />
          <meshStandardMaterial {...MAT.aluminum} />
        </mesh>
      </group>

      {/* ── Top gantry housing ── */}
      <RoundedBox args={[2.3, 0.35, 1.6]} radius={0.04} position={[0, 1.05, 0]}>
        <meshStandardMaterial {...MAT.panelDark} />
      </RoundedBox>
      {/* Gantry rails (X axis) */}
      {[-0.4, 0.4].map(z => (
        <mesh key={z} position={[0, 0.95, z]}>
          <boxGeometry args={[2.0, 0.04, 0.06]} />
          <meshPhysicalMaterial color="#b8c4d4" metalness={0.95} roughness={0.08} clearcoat={0.5} />
        </mesh>
      ))}

      {/* ── Spindle assembly ── */}
      <SpindleAssembly color={color} />

      {/* ── Work table (Y axis) ── */}
      <group position={[0, -0.2, 0.15]}>
        {/* Table surface */}
        <RoundedBox args={[1.5, 0.1, 1.0]} radius={0.015}>
          <meshPhysicalMaterial color="#7888a0" metalness={0.92} roughness={0.12} clearcoat={0.3} />
        </RoundedBox>
        {/* T-slot grooves */}
        {[-0.3, -0.1, 0.1, 0.3].map(z => (
          <mesh key={z} position={[0, 0.052, z]}>
            <boxGeometry args={[1.45, 0.012, 0.025]} />
            <meshStandardMaterial color="#3a4a5a" metalness={0.85} roughness={0.3} />
          </mesh>
        ))}
        {/* Table Y-rail */}
        <mesh position={[0, -0.065, 0]}>
          <boxGeometry args={[0.08, 0.04, 1.4]} />
          <meshPhysicalMaterial color="#b0bcc8" metalness={0.94} roughness={0.1} clearcoat={0.4} />
        </mesh>
        {/* Saddle */}
        <RoundedBox args={[1.55, 0.08, 0.2]} radius={0.01} position={[0, -0.1, 0.5]}>
          <meshStandardMaterial {...MAT.steelDark} />
        </RoundedBox>
      </group>

      {/* ── Control panel (right side) ── */}
      <group position={[1.15, 0.2, 0.7]} rotation={[0, -0.5, 0]}>
        {/* Panel body */}
        <RoundedBox args={[0.45, 0.65, 0.08]} radius={0.02}>
          <meshStandardMaterial {...MAT.panelDark} />
        </RoundedBox>
        {/* Main screen */}
        <StatusScreen
          position={[0, 0.1, 0.045]} size={[0.3, 0.2]}
          color={color} label="HAAS VF-2"
        />
        {/* Button row */}
        {[-0.12, -0.04, 0.04, 0.12].map(x => (
          <mesh key={x} position={[x, -0.15, 0.045]}>
            <cylinderGeometry args={[0.018, 0.018, 0.012, 10]} />
            <meshStandardMaterial
              color={x === -0.12 ? '#ef4444' : x === 0.12 ? '#22c55e' : '#4b5563'}
              metalness={0.3} roughness={0.5}
            />
          </mesh>
        ))}
        {/* Jog wheel */}
        <mesh position={[0, -0.25, 0.045]}>
          <torusGeometry args={[0.04, 0.012, 10, 20]} />
          <meshStandardMaterial {...MAT.aluminum} />
        </mesh>
      </group>

      {/* ── Servo motors (3 axes) ── */}
      <ServoMotor position={[1.05, 0.95, 0.65]} rotation={[Math.PI / 2, 0, 0]} />
      <ServoMotor position={[-1.05, 0.95, 0]} rotation={[0, 0, Math.PI / 2]} />
      <ServoMotor position={[0, 0.95, -0.65]} rotation={[Math.PI / 2, 0, Math.PI / 2]} />

      {/* ── Chip conveyor (front bottom) ── */}
      <RoundedBox args={[1.0, 0.2, 0.25]} radius={0.02} position={[0, -0.75, 0.95]}>
        <meshStandardMaterial {...MAT.steelDark} />
      </RoundedBox>

      {/* ── Cable tray (back) ── */}
      <CableTube
        points={[[0.3, 0.85, -0.9], [0.3, 0.2, -0.95], [0.3, -0.5, -0.9], [0.2, -0.8, -0.7]]}
        radius={0.035} color="#1a1e28"
      />
      <CableTube
        points={[[-0.2, 0.85, -0.9], [-0.2, 0.2, -0.95], [-0.15, -0.5, -0.9], [-0.1, -0.8, -0.7]]}
        radius={0.025} color="#3a2828"
      />

      {/* ── Base / plinth ── */}
      <RoundedBox args={[2.8, 0.3, 2.0]} radius={0.03} position={[0, -1.05, 0]}>
        <meshStandardMaterial {...MAT.steelDark} />
      </RoundedBox>
      <HazardTape position={[0, -0.89, 1.01]} size={[2.75, 0.12]} />
      <HazardTape position={[0, -0.89, -1.01]} size={[2.75, 0.12]} />

      {/* ── Leveling feet ── */}
      {[-1.1, 1.1].map(x => [-0.7, 0.7].map(z => (
        <group key={`${x}-${z}`} position={[x, -1.25, z]}>
          <mesh>
            <cylinderGeometry args={[0.09, 0.12, 0.15, 12]} />
            <meshStandardMaterial {...MAT.rubber} />
          </mesh>
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.03, 10]} />
            <meshStandardMaterial {...MAT.steel} />
          </mesh>
        </group>
      )))}

      {/* ── Bolts detail ── */}
      <BoltGrid positions={[
        [-1.32, 0.6, 0.7], [-1.32, 0.6, -0.7], [-1.32, -0.4, 0.7], [-1.32, -0.4, -0.7],
        [1.32, 0.6, 0.7], [1.32, 0.6, -0.7], [1.32, -0.4, 0.7], [1.32, -0.4, -0.7],
      ]} />

      {/* ── Indicator lights row (top front) ── */}
      <IndicatorLight position={[-0.9, 0.86, 0.82]} color="#22c55e" on />
      <IndicatorLight position={[-0.84, 0.86, 0.82]} color="#f59e0b" on={false} />
      <IndicatorLight position={[-0.78, 0.86, 0.82]} color="#ef4444" on={false} />

      {/* ── Logo / brand plate ── */}
      <mesh position={[0, 0.86, 0.82]}>
        <boxGeometry args={[0.3, 0.06, 0.005]} />
        <meshStandardMaterial color="#2a3040" metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );
}

/* ───────────── Hydraulic Press (Schuler HPX-400 style) ───────────── */

function HydraulicRam({ color }: { color: string }) {
  const ramRef = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    const t = Math.sin(clock.getElapsedTime() * 0.4) * 0.03;
    ramRef.current.position.y = 0.35 + t;
  });
  return (
    <group ref={ramRef} position={[0, 0.35, 0]}>
      {/* Cylinder housing */}
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.28, 0.3, 0.5, 20]} />
        <meshStandardMaterial {...MAT.steelDark} />
      </mesh>
      {/* Cylinder flange top */}
      <mesh position={[0, 0.72, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.06, 20]} />
        <meshStandardMaterial {...MAT.steel} />
      </mesh>
      {/* Piston rod */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.6, 16]} />
        <meshPhysicalMaterial color="#dce4f0" metalness={0.98} roughness={0.03} clearcoat={1} />
      </mesh>
      {/* Piston guide bushing */}
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 0.06, 16]} />
        <meshStandardMaterial {...MAT.copper} />
      </mesh>
      {/* Ram plate */}
      <RoundedBox args={[1.2, 0.28, 0.95]} radius={0.025} position={[0, -0.2, 0]}>
        <meshPhysicalMaterial color="#7a8898" metalness={0.9} roughness={0.14} clearcoat={0.3} />
      </RoundedBox>
      {/* Die (lower punch) */}
      <RoundedBox args={[0.5, 0.12, 0.4]} radius={0.01} position={[0, -0.38, 0]}>
        <meshStandardMaterial color="#556070" metalness={0.88} roughness={0.18}
          emissive={color} emissiveIntensity={0.06} />
      </RoundedBox>
    </group>
  );
}

function PressBody({ color }: { color: string }) {
  return (
    <group>
      {/* ── Lower bed / bolster ── */}
      <RoundedBox args={[2.3, 0.65, 1.6]} radius={0.04} position={[0, -0.55, 0]}>
        <meshStandardMaterial {...MAT.chassis} />
      </RoundedBox>
      {/* Bed surface (die table) */}
      <RoundedBox args={[1.6, 0.12, 1.15]} radius={0.015} position={[0, -0.2, 0]}>
        <meshPhysicalMaterial color="#8090a5" metalness={0.92} roughness={0.1} clearcoat={0.3} />
      </RoundedBox>
      {/* T-slots on bed */}
      {[-0.3, 0, 0.3].map(z => (
        <mesh key={z} position={[0, -0.13, z]}>
          <boxGeometry args={[1.55, 0.008, 0.02]} />
          <meshStandardMaterial color="#3a4a5a" metalness={0.85} roughness={0.3} />
        </mesh>
      ))}

      {/* ── C-frame columns ── */}
      {[-0.85, 0.85].map(x => (
        <group key={x}>
          {/* Main column */}
          <RoundedBox args={[0.3, 2.2, 0.4]} radius={0.03} position={[x, 0.45, 0]}>
            <meshStandardMaterial {...MAT.steelDark} />
          </RoundedBox>
          {/* Column reinforcement ribs */}
          {[0, 0.5, 1.0].map(y => (
            <mesh key={y} position={[x + (x > 0 ? 0.16 : -0.16), y, 0]}>
              <boxGeometry args={[0.03, 0.35, 0.35]} />
              <meshStandardMaterial {...MAT.steel} />
            </mesh>
          ))}
          {/* Column bolts */}
          <BoltGrid positions={[
            [x, 1.2, 0.21], [x, 0.6, 0.21], [x, 0.0, 0.21], [x, -0.5, 0.21],
            [x, 1.2, -0.21], [x, 0.6, -0.21], [x, 0.0, -0.21], [x, -0.5, -0.21],
          ]} />
        </group>
      ))}

      {/* ── Blue accent stripes on columns ── */}
      {[-0.85, 0.85].map(x => (
        <mesh key={`acc-${x}`} position={[x, 0.45, x > 0 ? 0.21 : 0.21]}>
          <boxGeometry args={[0.02, 2.15, 0.01]} />
          <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={0.4} metalness={0.3} roughness={0.4} />
        </mesh>
      ))}

      {/* ── Crown (top beam) ── */}
      <RoundedBox args={[2.1, 0.4, 1.4]} radius={0.04} position={[0, 1.35, 0]}>
        <meshStandardMaterial {...MAT.panelDark} />
      </RoundedBox>
      {/* Blue accent on crown */}
      <mesh position={[0, 1.56, 0.71]}>
        <boxGeometry args={[2.05, 0.04, 0.02]} />
        <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={0.4} metalness={0.3} roughness={0.4} />
      </mesh>
      {/* Crown top plate */}
      <RoundedBox args={[2.0, 0.06, 1.3]} radius={0.02} position={[0, 1.58, 0]}>
        <meshStandardMaterial {...MAT.steel} />
      </RoundedBox>

      {/* ── Hydraulic ram ── */}
      <HydraulicRam color={color} />

      {/* ── Guide rails (4 corners) ── */}
      {[-0.55, 0.55].map(x => [-0.35, 0.35].map(z => (
        <mesh key={`${x}-${z}`} position={[x, 0.5, z]}>
          <cylinderGeometry args={[0.035, 0.035, 1.4, 10]} />
          <meshPhysicalMaterial color="#c0cce0" metalness={0.96} roughness={0.06} clearcoat={0.8} />
        </mesh>
      )))}

      {/* ── Hydraulic lines ── */}
      <CableTube
        points={[[-0.7, 1.2, -0.55], [-0.7, 0.6, -0.65], [-0.7, -0.1, -0.6], [-0.65, -0.5, -0.45]]}
        radius={0.028} color="#3a3022"
      />
      <CableTube
        points={[[0.7, 1.2, -0.55], [0.7, 0.6, -0.65], [0.7, -0.1, -0.6], [0.65, -0.5, -0.45]]}
        radius={0.028} color="#3a3022"
      />

      {/* ── Control pendant (hanging) ── */}
      <group position={[-1.25, 0.0, 0.55]} rotation={[0, 0.45, 0]}>
        <RoundedBox args={[0.32, 0.52, 0.08]} radius={0.025}>
          <meshStandardMaterial {...MAT.panelDark} />
        </RoundedBox>
        <StatusScreen
          position={[0, 0.08, 0.045]} size={[0.22, 0.15]}
          color={color} label="HPX-400"
        />
        {/* E-stop button */}
        <mesh position={[0, -0.18, 0.045]}>
          <cylinderGeometry args={[0.03, 0.03, 0.02, 12]} />
          <meshStandardMaterial color="#ef4444" metalness={0.2} roughness={0.5}
            emissive="#ef4444" emissiveIntensity={0.3} />
        </mesh>
        {/* Pendant arm */}
        <CableTube
          points={[[0, 0.26, 0], [0, 0.5, -0.1], [-0.1, 0.8, -0.3]]}
          radius={0.02} color="#2a2e38"
        />
      </group>

      {/* ── Safety light curtain (left side) ── */}
      {[0, 1].map(side => (
        <group key={side} position={[side ? 0.82 : -0.82, 0.0, 0.82]}>
          <mesh>
            <boxGeometry args={[0.04, 1.2, 0.04]} />
            <meshStandardMaterial color="#f59e0b" metalness={0.3} roughness={0.5} />
          </mesh>
          <IndicatorLight position={[0, 0.55, 0.025]} color="#22c55e" />
        </group>
      ))}

      {/* ── Base plinth ── */}
      <RoundedBox args={[2.5, 0.24, 1.8]} radius={0.03} position={[0, -1.0, 0]}>
        <meshStandardMaterial {...MAT.steelDark} />
      </RoundedBox>
      <HazardTape position={[0, -0.87, 0.91]} size={[2.45, 0.12]} />
      <HazardTape position={[0, -0.87, -0.91]} size={[2.45, 0.12]} />

      {/* ── Status indicators (top) ── */}
      <IndicatorLight position={[-0.8, 1.6, 0.65]} color="#22c55e" on />
      <IndicatorLight position={[-0.72, 1.6, 0.65]} color="#f59e0b" on={false} />
      <IndicatorLight position={[-0.64, 1.6, 0.65]} color="#ef4444" on={false} />
    </group>
  );
}

/* ───────────── Welding Robot (FANUC ARC Mate style) ───────────── */

function WeldingTorch({ color }: { color: string }) {
  const tipRef = useRef<THREE.PointLight>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    const flicker = 0.6 + Math.random() * 0.4;
    if (tipRef.current) tipRef.current.intensity = flicker * 2;
    if (glowRef.current) {
      (glowRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = flicker * 1.5;
    }
  });
  return (
    <group>
      {/* Torch body */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.05, 0.28, 10]} />
        <meshStandardMaterial color="#505860" metalness={0.7} roughness={0.35} />
      </mesh>
      {/* Gas nozzle (copper) */}
      <mesh position={[0, -0.18, 0]}>
        <cylinderGeometry args={[0.035, 0.025, 0.1, 10]} />
        <meshStandardMaterial {...MAT.copper} />
      </mesh>
      {/* Contact tip */}
      <mesh position={[0, -0.25, 0]}>
        <cylinderGeometry args={[0.01, 0.006, 0.06, 8]} />
        <meshStandardMaterial {...MAT.chrome} />
      </mesh>
      {/* Arc glow */}
      <mesh ref={glowRef} position={[0, -0.3, 0]}>
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshStandardMaterial
          color="#66aaff" emissive="#4488ff" emissiveIntensity={1.2}
          transparent opacity={0.8} toneMapped={false}
        />
      </mesh>
      <pointLight ref={tipRef} position={[0, -0.3, 0]} color="#6699ff" intensity={1.5} distance={2} />
    </group>
  );
}

function RobotJoint({ radius = 0.14 }: { radius?: number }) {
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius, radius, radius * 1.4, 18]} />
        <meshPhysicalMaterial color="#b8c4d4" metalness={0.94} roughness={0.08} clearcoat={0.6} />
      </mesh>
      {/* Joint cover ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, radius * 0.75]}>
        <torusGeometry args={[radius * 0.85, 0.012, 8, 18]} />
        <meshStandardMaterial {...MAT.steelDark} />
      </mesh>
    </group>
  );
}

function WeldingRobotBody({ color }: { color: string }) {
  const j1Ref = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    j1Ref.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.3) * 0.15;
  });

  return (
    <group>
      {/* ── Floor mounting plate ── */}
      <RoundedBox args={[1.3, 0.1, 1.3]} radius={0.02} position={[0, -1.12, 0]}>
        <meshStandardMaterial {...MAT.steelDark} />
      </RoundedBox>
      <BoltGrid positions={[
        [-0.5, -1.06, -0.5], [0.5, -1.06, -0.5], [-0.5, -1.06, 0.5], [0.5, -1.06, 0.5],
        [-0.5, -1.06, 0], [0.5, -1.06, 0], [0, -1.06, -0.5], [0, -1.06, 0.5],
      ]} />

      {/* ── Pedestal base ── */}
      <mesh position={[0, -0.9, 0]}>
        <cylinderGeometry args={[0.52, 0.6, 0.35, 24]} />
        <meshStandardMaterial {...MAT.chassis} />
      </mesh>
      <mesh position={[0, -0.72, 0]}>
        <cylinderGeometry args={[0.48, 0.52, 0.05, 24]} />
        <meshStandardMaterial {...MAT.steel} />
      </mesh>

      {/* ── Rotating base (J1) ── */}
      <group ref={j1Ref}>
        <mesh position={[0, -0.6, 0]}>
          <cylinderGeometry args={[0.38, 0.44, 0.3, 22]} />
          <meshStandardMaterial {...MAT.orange} />
        </mesh>
        {/* J1 cover */}
        <mesh position={[0, -0.43, 0]}>
          <cylinderGeometry args={[0.36, 0.38, 0.06, 22]} />
          <meshStandardMaterial {...MAT.steelDark} />
        </mesh>

        {/* ── J2 joint ── */}
        <group position={[0, -0.35, 0]}>
          <RobotJoint radius={0.16} />

          {/* ── Lower arm (J2 → J3) ── */}
          <group rotation={[0, 0, 0.1]}>
            {/* Arm link */}
            <RoundedBox args={[0.24, 0.95, 0.22]} radius={0.06} position={[0, 0.5, 0]}>
              <meshStandardMaterial {...MAT.orangeBright} />
            </RoundedBox>
            {/* Arm ribs / branding area */}
            <mesh position={[0.125, 0.5, 0]}>
              <boxGeometry args={[0.008, 0.6, 0.18]} />
              <meshStandardMaterial {...MAT.steelDark} />
            </mesh>
            {/* Servo motor housing */}
            <ServoMotor position={[0.13, 0.15, 0]} rotation={[0, 0, Math.PI / 2]} />

            {/* ── J3 joint ── */}
            <group position={[0, 0.98, 0]}>
              <RobotJoint radius={0.13} />

              {/* ── Upper arm (J3 → J4/5/6) ── */}
              <group rotation={[0, 0, -0.6]}>
                <RoundedBox args={[0.19, 0.8, 0.18]} radius={0.05} position={[0, 0.4, 0]}>
                  <meshStandardMaterial {...MAT.orangeBright} />
                </RoundedBox>
                {/* Arm detail line */}
                <mesh position={[-0.1, 0.4, 0]}>
                  <boxGeometry args={[0.008, 0.55, 0.15]} />
                  <meshStandardMaterial {...MAT.steelDark} />
                </mesh>

                {/* ── J4 joint (inline wrist) ── */}
                <group position={[0, 0.82, 0]}>
                  <RobotJoint radius={0.1} />

                  {/* ── J5 (wrist bend) ── */}
                  <group rotation={[0, 0, 0.45]}>
                    <mesh position={[0, 0.12, 0]}>
                      <cylinderGeometry args={[0.08, 0.08, 0.22, 14]} />
                      <meshStandardMaterial {...MAT.orange} />
                    </mesh>

                    {/* ── J6 (wrist rotate) ── */}
                    <group position={[0, 0.24, 0]}>
                      <mesh rotation={[Math.PI / 2, 0, 0]}>
                        <cylinderGeometry args={[0.06, 0.06, 0.08, 14]} />
                        <meshStandardMaterial {...MAT.steelDark} />
                      </mesh>
                      {/* Tool flange */}
                      <mesh position={[0, 0.04, 0]}>
                        <cylinderGeometry args={[0.055, 0.055, 0.02, 14]} />
                        <meshStandardMaterial {...MAT.aluminum} />
                      </mesh>

                      {/* ── Welding torch ── */}
                      <group position={[0.04, 0.06, 0.05]} rotation={[0.25, 0, 0.12]}>
                        <WeldingTorch color={color} />
                      </group>
                    </group>
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>

        {/* ── Cable harness (corrugated tube along arm) ── */}
        <CableTube
          points={[
            [-0.15, -0.5, 0.2], [-0.18, -0.1, 0.22], [-0.15, 0.3, 0.18],
            [-0.1, 0.6, 0.12], [-0.05, 0.9, 0.05], [0.05, 1.1, -0.05],
          ]}
          radius={0.032} color="#1e2230"
        />
        <CableTube
          points={[
            [0.15, -0.5, 0.2], [0.18, -0.1, 0.22], [0.15, 0.3, 0.18],
            [0.12, 0.6, 0.12], [0.08, 0.9, 0.08],
          ]}
          radius={0.02} color="#442828"
        />
      </group>

      {/* ── Controller cabinet (behind robot) ── */}
      <group position={[-0.9, -0.5, -0.7]}>
        <RoundedBox args={[0.55, 1.0, 0.45]} radius={0.03}>
          <meshStandardMaterial {...MAT.panelDark} />
        </RoundedBox>
        <VentSlots position={[0, -0.25, 0.23]} count={6} width={0.4} gap={0.055} />
        <StatusScreen
          position={[0, 0.25, 0.23]} rotation={[0, 0, 0]} size={[0.2, 0.12]}
          color="#22c55e" label="FANUC"
        />
        <IndicatorLight position={[-0.2, 0.42, 0.23]} color="#22c55e" on />
        <IndicatorLight position={[-0.14, 0.42, 0.23]} color={color} />
      </group>

      {/* ── Wire feeder (mounted near J3) ── */}
      <group position={[0.35, 0.2, -0.2]}>
        <mesh>
          <cylinderGeometry args={[0.1, 0.1, 0.15, 14]} />
          <meshStandardMaterial {...MAT.steelDark} />
        </mesh>
        <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.08, 0.025, 8, 14]} />
          <meshStandardMaterial {...MAT.copper} />
        </mesh>
      </group>

      {/* ── Hazard tape on base ── */}
      <HazardTape position={[0, -1.06, 0.66]} size={[1.25, 0.1]} />
      <HazardTape position={[0, -1.06, -0.66]} size={[1.25, 0.1]} />
    </group>
  );
}

/* ───────────── Machine body dispatcher ───────────── */

function MachineTypeLabel({ machineType }: { machineType?: string }) {
  const label = machineType === 'Press' ? 'HYDRAULIC PRESS · HPX-400'
    : machineType === 'Welding Robot' ? 'WELDING ROBOT · ARC MATE 120iD'
    : 'CNC MILLING · HAAS VF-2';
  const accentColor = machineType === 'Press' ? '#3b82f6'
    : machineType === 'Welding Robot' ? '#f97316'
    : '#10b981';
  return (
    <Html position={[0, -1.6, 0]} center distanceFactor={5} style={{ pointerEvents: 'none' }}>
      <div className="text-center">
        <div className="text-[10px] font-bold tracking-[0.2em] uppercase px-4 py-1.5 rounded-full border"
          style={{ color: accentColor, borderColor: `${accentColor}55`, backgroundColor: `${accentColor}15` }}>
          {label}
        </div>
      </div>
    </Html>
  );
}

function MachineBody({ color, machineType }: { color: string; machineType?: string }) {
  if (machineType === 'Press') return <PressBody color={color} />;
  if (machineType === 'Welding Robot') return <WeldingRobotBody color={color} />;
  return <CNCMillBody color={color} />;
}

/* ───────────── Interactive component node ───────────── */

function ComponentNode({
  component, isHighlighted, isSelected, onClick,
}: {
  component: MachineComponent; isHighlighted: boolean;
  isSelected: boolean; onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);

  const shape = COMPONENT_SHAPES[component.component_id] ?? { geometry: 'box', args: [0.3, 0.3, 0.3] };
  const color = isHighlighted
    ? (component.highlight_color ?? '#ef4444')
    : isSelected ? '#3b82f6' : '#64748b';
  const emissiveIntensity = isHighlighted ? 1.2 : hovered ? 0.6 : 0.15;

  useFrame(({ clock }) => {
    if (!isHighlighted) return;
    const s = 1 + Math.sin(clock.getElapsedTime() * 3) * 0.08;
    meshRef.current.scale.setScalar(s);
    if (glowRef.current) glowRef.current.scale.setScalar(s * 1.6);
  });

  const pos: [number, number, number] = [component.coord_x, component.coord_y, component.coord_z];
  const GeometryEl = shape.geometry === 'cylinder'
    ? <cylinderGeometry args={shape.args as [number, number, number, number]} />
    : shape.geometry === 'sphere'
    ? <sphereGeometry args={shape.args as [number, number, number]} />
    : <boxGeometry args={shape.args as [number, number, number]} />;

  return (
    <group position={pos}>
      {isHighlighted && (
        <Float speed={2} floatIntensity={0.2}>
          <Html center distanceFactor={6} style={{ pointerEvents: 'none' }}>
            <div className="bg-red-500/90 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg backdrop-blur-sm border border-red-400/30">
              ⚠ {component.component_name}
            </div>
          </Html>
        </Float>
      )}
      {hovered && !isHighlighted && (
        <Html center distanceFactor={6} style={{ pointerEvents: 'none' }}>
          <div className="bg-slate-800/90 text-white text-[11px] px-2 py-1 rounded-md whitespace-nowrap shadow-lg">
            {component.component_name}
          </div>
        </Html>
      )}
      <mesh
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerEnter={() => { setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerLeave={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
      >
        {GeometryEl}
        <meshStandardMaterial
          color={color} metalness={0.6} roughness={0.3}
          emissive={color} emissiveIntensity={emissiveIntensity}
          transparent={!isHighlighted && !isSelected}
          opacity={isHighlighted || isSelected ? 1 : hovered ? 0.9 : 0.7}
        />
      </mesh>
      {isHighlighted && (
        <mesh ref={glowRef}>
          {GeometryEl}
          <meshStandardMaterial color={color} transparent opacity={0.15} emissive={color} emissiveIntensity={0.6} />
        </mesh>
      )}
    </group>
  );
}

/* ───────────── Sensor HUD ───────────── */

function SensorHUD({ sensorData, health }: { sensorData: SensorData; health: number }) {
  const gauges = [
    { label: 'Air Temp', value: sensorData.air_temp, unit: '°C', max: 50, warn: 35 },
    { label: 'Process', value: sensorData.process_temp, unit: '°C', max: 80, warn: 60 },
    { label: 'RPM', value: sensorData.rotational_speed, unit: '', max: 3000, warn: 2200 },
    { label: 'Torque', value: sensorData.torque, unit: 'Nm', max: 80, warn: 60 },
    { label: 'Tool Wear', value: sensorData.tool_wear, unit: 'min', max: 250, warn: 180 },
  ].filter(g => g.value != null);

  if (gauges.length === 0) return null;

  return (
    <Html position={[-2.4, 2.0, 0]} distanceFactor={5} style={{ pointerEvents: 'none' }}>
      <div className="bg-[#0a0e17]/92 backdrop-blur-xl border border-[#1e2a45] rounded-xl p-3.5 w-52 shadow-2xl">
        <div className="flex items-center gap-2 mb-2.5 border-b border-[#1e2a45] pb-2">
          <div className={`w-2.5 h-2.5 rounded-full ${health > 75 ? 'bg-emerald-400' : health > 50 ? 'bg-amber-400' : 'bg-red-400'} animate-pulse shadow-lg`} />
          <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Live Sensors</span>
          <span className={`ml-auto text-sm font-mono font-bold ${health > 75 ? 'text-emerald-400' : health > 50 ? 'text-amber-400' : 'text-red-400'}`}>
            {health}%
          </span>
        </div>
        {gauges.map(g => {
          const pct = Math.min(100, ((g.value ?? 0) / g.max) * 100);
          const over = (g.value ?? 0) > g.warn;
          return (
            <div key={g.label} className="mb-2 last:mb-0">
              <div className="flex justify-between text-[9px] mb-0.5">
                <span className="text-gray-500 font-medium">{g.label}</span>
                <span className={`font-mono font-semibold ${over ? 'text-red-400' : 'text-gray-300'}`}>
                  {g.value}{g.unit}
                </span>
              </div>
              <div className="h-1.5 bg-[#141a28] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${over ? 'bg-gradient-to-r from-red-600 to-red-400' : 'bg-gradient-to-r from-blue-600 to-cyan-400'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Html>
  );
}

/* ───────────── Studio Lighting (replaces external HDR) ───────────── */

function StudioLighting() {
  return (
    <Environment resolution={256}>
      {/* Key light — large overhead softbox */}
      <Lightformer position={[0, 5, 0]} scale={[14, 4, 1]} intensity={3.0} color="#f0f2fa" />
      {/* Fill — left side */}
      <Lightformer position={[-5, 2, 0]} rotation={[0, Math.PI / 2, 0]} scale={[8, 4, 1]} intensity={1.8} color="#c8d4f0" />
      {/* Rim — right back */}
      <Lightformer position={[5, 1, -3]} rotation={[0, -Math.PI / 3, 0]} scale={[5, 3, 1]} intensity={2.0} color="#b0c0e0" />
      {/* Floor bounce */}
      <Lightformer position={[0, -2, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[12, 12, 1]} intensity={0.8} color="#2a3050" />
      {/* Accent — warm highlight from front */}
      <Lightformer position={[2, 3, 5]} scale={[4, 2, 1]} intensity={1.2} color="#ffe0b8" />
      {/* Back fill */}
      <Lightformer position={[0, 3, -5]} scale={[8, 3, 1]} intensity={1.0} color="#d0d8f0" />
    </Environment>
  );
}

/* ───────────── Floor ───────────── */

function FloorPlane() {
  return (
    <group position={[0, -1.32, 0]}>
      {/* Reflective floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial
          color="#1e2538" metalness={0.5} roughness={0.4}
          transparent opacity={0.9}
        />
      </mesh>
      <gridHelper args={[12, 24, '#2a3555', '#222a42']} position={[0, 0.002, 0]} />
    </group>
  );
}

/* ───────────── Scene ───────────── */

function MachineScene({
  health, machineType, sensorData, components, highlightId, selectedId, onComponentClick,
}: {
  health: number; machineType?: string; sensorData?: SensorData;
  components: MachineComponent[]; highlightId?: string; selectedId?: string;
  onComponentClick: (c: MachineComponent) => void;
}) {
  const color = healthColor(health);

  return (
    <>
      {/* ── Lighting ── */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 6, 4]} intensity={2.0} castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024}
        shadow-camera-far={20} shadow-camera-near={0.1}
      />
      <directionalLight position={[-3, 4, -2]} intensity={1.0} color="#b0c0e0" />
      <pointLight position={[4, 3, 4]} intensity={1.2} color="#80a8e0" />
      <pointLight position={[-4, 2, 3]} intensity={0.8} color="#a088d0" />
      <pointLight position={[0, -0.5, 4]} intensity={0.5} color="#e0d8c0" />
      <StudioLighting />

      {/* ── Machine ── */}
      <MachineBody color={color} machineType={machineType} />
      <MachineTypeLabel machineType={machineType} />
      {sensorData && <SensorHUD sensorData={sensorData} health={health} />}

      {/* ── Component nodes ── */}
      {components.map(comp => (
        <ComponentNode
          key={comp.component_id}
          component={comp}
          isHighlighted={highlightId === comp.component_id}
          isSelected={selectedId === comp.component_id}
          onClick={() => onComponentClick(comp)}
        />
      ))}

      {/* ── Controls ── */}
      <OrbitControls
        enableZoom enablePan
        maxPolarAngle={Math.PI / 1.3}
        minPolarAngle={Math.PI / 6}
        minDistance={2.5} maxDistance={12}
        autoRotate autoRotateSpeed={0.4}
      />

      {/* ── Ground ── */}
      <ContactShadows position={[0, -1.31, 0]} opacity={0.65} scale={10} blur={2.5} far={3} />
      <FloorPlane />
    </>
  );
}

/* ───────────── Exported component (SSR-safe) ───────────── */

export const MachineModel = ({
  health = 85, machineType, sensorData, components = [],
  highlightId, onComponentClick, className,
}: MachineModelProps) => {
  const [mounted, setMounted] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>();

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  return (
    <div className={className ?? 'h-[500px] w-full'}>
      <CanvasErrorBoundary>
        <Canvas
          camera={{ position: [4.5, 2.8, 4.5], fov: 38 }}
          gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.4 }}
          shadows
          style={{ background: 'transparent' }}
        >
          <MachineScene
            health={health}
            machineType={machineType}
            sensorData={sensorData}
            components={components}
            highlightId={highlightId}
            selectedId={selectedId}
            onComponentClick={c => {
              setSelectedId(c.component_id);
              onComponentClick?.(c);
            }}
          />
        </Canvas>
      </CanvasErrorBoundary>
    </div>
  );
};

export default MachineModel;
