"use client";

import { Component, useEffect, useMemo, type MutableRefObject, type ReactNode, type RefObject } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { STAGE_ARENA as A } from "@/lib/config";

/**
 * Shared, mutable link between the stage card and the arena. The card writes the
 * live angle (from the photo viewer) and calls `invalidate` — no React state, so
 * nothing re-renders per frame; the canvas only draws when the angle changes.
 */
export type ArenaHandle = { angleDeg: number; invalidate: (() => void) | null };

type Props = {
  handle: MutableRefObject<ArenaHandle>;
  /** Zero-size element on the athlete's feet line (platform centre). */
  anchorRef: RefObject<HTMLElement>;
  /** The figure box (its height = the photo frame height). */
  figureRef: RefObject<HTMLElement>;
  onReady: () => void;
  onFail: () => void;
};

const rad = (d: number) => (d * Math.PI) / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Deterministic pseudo-random so the arena layout is identical on every visit.
function seeded(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Camera rig: orbits the athlete axis at a fixed distance/height on the shared
 * angle, and is fitted to the DOM figure — field of view so 1 m in the scene
 * matches the photo's scale, and a view offset so the platform centre lands
 * exactly on the athlete's feet line. Refitted whenever the layout changes.
 */
function Rig({ handle, anchorRef, figureRef }: Pick<Props, "handle" | "anchorRef" | "figureRef">) {
  const { camera, gl, invalidate, size } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const d = A.cameraDistanceM;
  const camY = d * Math.tan(rad(A.cameraElevationDeg));
  const lookY = A.athleteHeightM / 2;

  useEffect(() => {
    const h = handle.current;
    h.invalidate = invalidate;
    return () => {
      h.invalidate = null;
    };
  }, [handle, invalidate]);

  useEffect(() => {
    const fit = () => {
      const a = anchorRef.current;
      const f = figureRef.current;
      const c = gl.domElement.getBoundingClientRect();
      if (!a || !f || c.width === 0 || c.height === 0) return;
      const ar = a.getBoundingClientRect();
      const fr = f.getBoundingClientRect();
      const W = c.width;
      const H = c.height;
      const ppm = (fr.height * A.athleteFrameFill) / A.athleteHeightM; // CSS px per metre at the athlete
      cam.fov = clamp((2 * Math.atan(H / 2 / (ppm * d)) * 180) / Math.PI, 12, 80);
      cam.aspect = W / H;
      cam.near = 0.1;
      cam.far = 80;
      cam.position.set(0, camY, d);
      cam.lookAt(0, lookY, 0);
      cam.clearViewOffset();
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      // Where the platform centre lands without an offset (same for every orbit
      // angle, since it sits on the orbit axis) -> shift it onto the feet line.
      const o = new THREE.Vector3(0, 0, 0).project(cam);
      const ox = ((o.x + 1) / 2) * W;
      const oy = ((1 - o.y) / 2) * H;
      cam.setViewOffset(W, H, ox - (ar.left - c.left), oy - (ar.top - c.top), W, H);
      invalidate();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(gl.domElement);
    if (figureRef.current) ro.observe(figureRef.current);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [anchorRef, figureRef, gl, cam, d, camY, lookY, invalidate, size]);

  useFrame(() => {
    const phi = A.orbitDirection * rad(handle.current.angleDeg);
    cam.position.set(Math.sin(phi) * d, camY, Math.cos(phi) * d);
    cam.lookAt(0, lookY, 0);
  });

  return null;
}

/** Soft radial glow sprite texture (made in code, no asset). */
function useGlowTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,45,85,0.9)");
    grd.addColorStop(0.35, "rgba(255,45,85,0.35)");
    grd.addColorStop(1, "rgba(255,45,85,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

/** A thin glowing neon bar between two points (core + soft additive halo). */
function NeonBar({ from, to, w = 0.028, glow = 0.14 }: { from: THREE.Vector3; to: THREE.Vector3; w?: number; glow?: number }) {
  const { pos, quat, len } = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(to, from);
    const l = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return { pos: new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5), quat: q, len: l };
  }, [from, to]);
  return (
    <group position={pos} quaternion={quat}>
      <mesh>
        <boxGeometry args={[w, len, w]} />
        <meshBasicMaterial color={A.color} toneMapped={false} />
      </mesh>
      <mesh>
        <boxGeometry args={[w * 5, len, w * 5]} />
        <meshBasicMaterial color={A.color} transparent opacity={glow} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Platform() {
  const R = A.platformRadiusM;
  const glowTex = useGlowTexture();
  return (
    <group>
      {/* Body + top face (hexagonal: 6 radial segments) */}
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[R, R * 1.05, 0.1, 6]} />
        <meshBasicMaterial color="#1c0c11" />
      </mesh>
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[R * 0.97, 6, Math.PI / 2]} />
        <meshBasicMaterial color="#26101a" />
      </mesh>
      {/* Neon hexagon rim (torus with 6 tubular segments = hexagon), aligned to the body */}
      <group rotation={[0, Math.PI / 2, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
          <torusGeometry args={[R, 0.013, 6, 6]} />
          <meshBasicMaterial color={A.color} toneMapped={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
          <torusGeometry args={[R, 0.07, 6, 6]} />
          <meshBasicMaterial color={A.color} transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.095, 0]}>
          <torusGeometry args={[R * 1.05, 0.01, 6, 6]} />
          <meshBasicMaterial color={A.color} transparent opacity={0.7} toneMapped={false} />
        </mesh>
      </group>
      {/* Floor glow under the platform */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.098, 0]}>
        <planeGeometry args={[R * 4.2, R * 4.2]} />
        <meshBasicMaterial map={glowTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
    </group>
  );
}

function Floor() {
  const lines = useMemo(() => {
    const pts: number[] = [];
    const y = -0.097;
    // Radial spokes
    const spokes = 24;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      pts.push(Math.sin(a) * 1.5, y, Math.cos(a) * 1.5, Math.sin(a) * 20, y, Math.cos(a) * 20);
    }
    // Concentric hexagon rings
    for (const r of [2.2, 3.6, 5.4, 8.5, 12.5]) {
      for (let k = 0; k < 6; k++) {
        const a0 = (k / 6) * Math.PI * 2;
        const a1 = ((k + 1) / 6) * Math.PI * 2;
        pts.push(Math.sin(a0) * r, y, Math.cos(a0) * r, Math.sin(a1) * r, y, Math.cos(a1) * r);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <circleGeometry args={[30, 48]} />
        <meshBasicMaterial color="#0b0708" />
      </mesh>
      <lineSegments geometry={lines}>
        <lineBasicMaterial color={A.color} transparent opacity={0.3} toneMapped={false} />
      </lineSegments>
    </group>
  );
}

/** Pillars, light frames and slanted beams — all beyond the camera radius. */
function Scenery() {
  const items = useMemo(() => {
    const out: { kind: "pillar" | "frame" | "beam"; a: number; r: number; h: number }[] = [];
    const n = A.pillars;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + seeded(i) * 0.35;
      out.push({ kind: "pillar", a, r: A.minSceneryRadiusM + 0.6 + seeded(i + 10) * 3.5, h: 3.2 + seeded(i + 20) * 2.2 });
    }
    for (let i = 0; i < 4; i++) {
      out.push({ kind: "frame", a: (i / 4) * Math.PI * 2 + 0.4, r: A.minSceneryRadiusM + 1.8, h: 3.1 });
    }
    for (let i = 0; i < 8; i++) {
      out.push({ kind: "beam", a: (i / 8) * Math.PI * 2 + 0.2, r: A.minSceneryRadiusM + 4.5, h: 5.5 });
    }
    return out;
  }, []);

  return (
    <group>
      {items.map((it, i) => {
        const x = Math.sin(it.a) * it.r;
        const z = Math.cos(it.a) * it.r;
        if (it.kind === "pillar") {
          const s = 0.34;
          return (
            <group key={i} position={[x, -0.1, z]} rotation={[0, it.a, 0]}>
              <mesh position={[0, it.h / 2, 0]}>
                <boxGeometry args={[s, it.h, s]} />
                <meshBasicMaterial color="#150a0d" />
              </mesh>
              <NeonBar from={new THREE.Vector3(-s / 2, 0, -s / 2 - 0.01)} to={new THREE.Vector3(-s / 2, it.h, -s / 2 - 0.01)} />
              <NeonBar from={new THREE.Vector3(s / 2, 0, -s / 2 - 0.01)} to={new THREE.Vector3(s / 2, it.h * 0.72, -s / 2 - 0.01)} glow={0.1} />
            </group>
          );
        }
        if (it.kind === "frame") {
          const w = 2.2;
          const h = it.h;
          const p = (px: number, py: number) => new THREE.Vector3(px, py, 0);
          return (
            <group key={i} position={[x, -0.1, z]} rotation={[0, it.a, 0]}>
              <NeonBar from={p(-w / 2, 0)} to={p(-w / 2, h)} />
              <NeonBar from={p(w / 2, 0)} to={p(w / 2, h)} />
              <NeonBar from={p(-w / 2, h)} to={p(w / 2, h)} />
              <NeonBar from={p(-w / 2 + 0.25, h - 0.25)} to={p(w / 2 - 0.25, h - 0.25)} w={0.012} glow={0.08} />
            </group>
          );
        }
        // Slanted light beam leaning in toward the stage
        const top = new THREE.Vector3(Math.sin(it.a + 0.18) * (it.r - 1.6), it.h, Math.cos(it.a + 0.18) * (it.r - 1.6));
        return <NeonBar key={i} from={new THREE.Vector3(x, -0.1, z)} to={top} w={0.02} glow={0.1} />;
      })}
    </group>
  );
}

class ArenaBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** The 3D arena canvas. Purely decorative: no pointer events, aria-hidden. */
export function StageArena3D({ handle, anchorRef, figureRef, onReady, onFail }: Props) {
  return (
    <ArenaBoundary onFail={onFail}>
      <Canvas
        frameloop="demand"
        flat
        dpr={[1, A.maxDpr]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        camera={{ fov: 35, near: 0.1, far: 80, position: [0, 1, A.cameraDistanceM] }}
        style={{ pointerEvents: "none" }}
        aria-hidden
        onCreated={({ scene }) => {
          scene.background = new THREE.Color(A.background);
          scene.fog = new THREE.Fog(A.background, A.fogNear, A.fogFar);
          onReady();
        }}
      >
        <Rig handle={handle} anchorRef={anchorRef} figureRef={figureRef} />
        <Floor />
        <Platform />
        <Scenery />
      </Canvas>
    </ArenaBoundary>
  );
}
