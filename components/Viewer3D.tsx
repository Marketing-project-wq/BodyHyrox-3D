"use client";

import { Suspense, useMemo, useRef, useState, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Decal, ContactShadows, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useRouter } from "next/navigation";
import type { Media360, PublicZone } from "@/lib/data";
import { VIEWER_3D, deg2rad, type DecalSlot } from "@/lib/viewer3d";
import { type Dict } from "@/lib/i18n";
import { formatIDR } from "@/lib/format";

/** A resolved decal = placement slot + the athlete's real zone it links to. */
type ResolvedDecal = {
  slot: DecalSlot;
  athleteZoneId: string | null;
  label: string;
  taken: boolean;
  price: number | null;
};

/** Draw a sponsor-chip texture on a canvas (20FIT-made; no external asset). */
function useDecalTexture(label: string, taken: boolean) {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 200;
    const g = c.getContext("2d")!;
    const r = 26;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = taken ? "#33333a" : "#ff2d55";
    g.beginPath();
    g.moveTo(r, 8);
    g.arcTo(c.width - 8, 8, c.width - 8, c.height - 8, r);
    g.arcTo(c.width - 8, c.height - 8, 8, c.height - 8, r);
    g.arcTo(8, c.height - 8, 8, 8, r);
    g.arcTo(8, 8, c.width - 8, 8, r);
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.85)";
    g.lineWidth = 4;
    g.stroke();
    g.fillStyle = "#ffffff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "700 46px 'Barlow Condensed', system-ui, sans-serif";
    g.fillText(label.toUpperCase(), c.width / 2, c.height / 2 - 8);
    g.font = "600 22px 'IBM Plex Mono', monospace";
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.fillText(taken ? "TERISI" : "SPONSOR", c.width / 2, c.height / 2 + 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }, [label, taken]);
}

function ClickDecal({ d, onPick }: { d: ResolvedDecal; onPick: (d: ResolvedDecal) => void }) {
  const tex = useDecalTexture(d.label, d.taken);
  const canApply = !d.taken && !!d.athleteZoneId;
  return (
    <Decal
      position={d.slot.position}
      rotation={d.slot.rotation}
      scale={d.slot.scale}
      onClick={(e) => {
        e.stopPropagation();
        onPick(d);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = canApply ? "pointer" : "default";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "default";
      }}
    >
      <meshStandardMaterial
        map={tex}
        transparent
        polygonOffset
        polygonOffsetFactor={-10}
        roughness={0.5}
        toneMapped={false}
      />
    </Decal>
  );
}

/** Neutral 20FIT placeholder mannequin (primitives) with decals on torso + legs. */
function Mannequin({ decals, onPick }: { decals: ResolvedDecal[]; onPick: (d: ResolvedDecal) => void }) {
  const skin = <meshStandardMaterial color="#cfcfd6" roughness={0.72} metalness={0.04} />;
  const torsoDecals = decals.filter((d) => d.slot.part === "torso");
  const legRDecals = decals.filter((d) => d.slot.part === "legR");
  return (
    <group position={[0, -0.05, 0]}>
      {/* head + neck */}
      <mesh position={[0, 0.78, 0]}>
        <sphereGeometry args={[0.135, 24, 24]} />
        {skin}
      </mesh>
      <mesh position={[0, 0.64, 0]}>
        <cylinderGeometry args={[0.06, 0.075, 0.12, 16]} />
        {skin}
      </mesh>
      {/* torso (hosts chest/back/belly decals) */}
      <mesh position={[0, 0.3, 0]}>
        <capsuleGeometry args={[0.22, 0.46, 10, 28]} />
        {skin}
        {torsoDecals.map((d) => (
          <ClickDecal key={d.slot.zone} d={d} onPick={onPick} />
        ))}
      </mesh>
      {/* arms — hang beside the torso */}
      <mesh position={[-0.265, 0.24, 0]} rotation={[0, 0, 0.05]}>
        <capsuleGeometry args={[0.06, 0.56, 8, 16]} />
        {skin}
      </mesh>
      <mesh position={[0.265, 0.24, 0]} rotation={[0, 0, -0.05]}>
        <capsuleGeometry args={[0.06, 0.56, 8, 16]} />
        {skin}
      </mesh>
      {/* legs (right hosts thigh decal) */}
      <mesh position={[0.12, -0.35, 0]}>
        <capsuleGeometry args={[0.088, 0.62, 8, 18]} />
        {skin}
        {legRDecals.map((d) => (
          <ClickDecal key={d.slot.zone} d={d} onPick={onPick} />
        ))}
      </mesh>
      <mesh position={[-0.12, -0.35, 0]}>
        <capsuleGeometry args={[0.088, 0.62, 8, 18]} />
        {skin}
      </mesh>
      {/* feet */}
      <mesh position={[0.12, -0.72, 0.05]}>
        <boxGeometry args={[0.12, 0.07, 0.24]} />
        {skin}
      </mesh>
      <mesh position={[-0.12, -0.72, 0.05]}>
        <boxGeometry args={[0.12, 0.07, 0.24]} />
        {skin}
      </mesh>
    </group>
  );
}

function GLBModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

function Scene({
  modelUrl,
  decals,
  onPick,
}: {
  modelUrl?: string;
  decals: ResolvedDecal[];
  onPick: (d: ResolvedDecal) => void;
}) {
  const [auto, setAuto] = useState<boolean>(VIEWER_3D.orbit.autoRotate);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 5, 4]} intensity={1.7} />
      <directionalLight position={[-4, 2, -3]} intensity={0.9} color="#ff3b57" />
      <pointLight position={[0, -1.2, 2.4]} intensity={0.5} color="#ff2d55" />

      <Suspense fallback={null}>
        {modelUrl ? <GLBModel url={modelUrl} /> : <Mannequin decals={decals} onPick={onPick} />}
      </Suspense>

      <ContactShadows position={[0, -0.82, 0]} opacity={0.55} scale={3.2} blur={2.6} far={1.4} color="#000000" />

      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom={false}
        enableDamping
        dampingFactor={VIEWER_3D.orbit.dampingFactor}
        autoRotate={auto}
        autoRotateSpeed={VIEWER_3D.orbit.autoRotateSpeed}
        minPolarAngle={deg2rad(VIEWER_3D.orbit.minPolarDeg)}
        maxPolarAngle={deg2rad(VIEWER_3D.orbit.maxPolarDeg)}
        target={[0, 0.05, 0]}
        onStart={() => {
          if (timer.current) clearTimeout(timer.current);
          setAuto(false);
        }}
        onEnd={() => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setAuto(true), VIEWER_3D.orbit.resumeAfterMs);
        }}
      />
    </>
  );
}

export function Viewer3D({
  athleteId,
  zones,
  m,
  modelUrl,
}: {
  athleteId: string;
  zones: PublicZone[];
  m: Dict;
  media?: Media360 | null;
  modelUrl?: string;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  // Resolve config decal slots against the athlete's real zones (by name).
  const decals: ResolvedDecal[] = useMemo(() => {
    return VIEWER_3D.decals
      .map((slot) => {
        const z = zones.find((zz) => zz.nama === slot.zone);
        if (!z) return null;
        return {
          slot,
          athleteZoneId: z.athleteZoneId,
          label: z.nama,
          taken: z.status === "terisi",
          price: z.status === "terisi" ? null : z.basePrice,
        } as ResolvedDecal;
      })
      .filter((x): x is ResolvedDecal => x !== null);
  }, [zones]);

  const onPick = useCallback(
    (d: ResolvedDecal) => {
      if (!d.taken && d.athleteZoneId) router.push(`/atlet/${athleteId}/ajukan?zone=${d.athleteZoneId}`);
    },
    [router, athleteId],
  );

  const style = {
    height: `min(${VIEWER_3D.maxHeightSvh}svh, ${VIEWER_3D.maxHeightPx}px)`,
    width: `min(${VIEWER_3D.maxWidthPx}px, 92vw)`,
  };

  return (
    <div className="relative mx-auto touch-none select-none" style={style}>
      <Canvas
        dpr={[1, 1.6]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ position: VIEWER_3D.camera.position, fov: VIEWER_3D.camera.fov }}
        onCreated={() => setReady(true)}
        style={{ background: "transparent" }}
      >
        <Scene modelUrl={modelUrl} decals={decals} onPick={onPick} />
      </Canvas>

      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-white/60">
          {m.v360_loading}
        </div>
      )}

      {/* hint + prices for available zones (below the figure, overlay) */}
      <div className="pointer-events-none absolute inset-x-0 -bottom-8 flex flex-col items-center gap-1 text-xs text-white/45">
        <span>{m.v360_hint}</span>
      </div>
    </div>
  );
}
