"use client";

import { Component, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode, type RefObject } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { STAGE_ARENA as A, STAGE_PLATFORM_ROUND } from "@/lib/config";
import type { StageScreen } from "@/lib/stage-media";

/**
 * Shared, mutable link between the stage card and the arena. The card writes the
 * live angle (from the photo viewer) and calls `invalidate` — no React state, so
 * nothing re-renders per frame; the canvas only draws when the angle changes.
 */
export type ArenaHandle = {
  angleDeg: number;
  invalidate: (() => void) | null;
  /** Adaptive quality: lower the canvas pixel ratio on slow devices. */
  setDpr: ((dpr: number) => void) | null;
  /**
   * Where a screen point (client px) lands on the floor at the current angle:
   * inside the platform's top face or not, and its perspective scale relative
   * to the feet point (< 1 = further back, so a contact shadow there is smaller).
   */
  groundHit: ((clientX: number, clientY: number) => { inside: boolean; scale: number } | null) | null;
  /** The platform top face outline in client px (debug overlay). */
  outline: (() => [number, number][]) | null;
  /** Objects under a screen point (client px) at the current angle, nearest first. */
  pick: ((clientX: number, clientY: number, objects: THREE.Object3D[]) => THREE.Intersection[]) | null;
  /** The media screen (slot) under a screen point, or null. */
  mediaHit: ((clientX: number, clientY: number) => number | null) | null;
  /**
   * Re-fit the camera to the figure now (the zone zoom calls it every frame
   * while the figure scales, so the platform stays under the feet).
   */
  refit?: (() => void) | null;
};

export type PlatformShape = "hex" | "round";
const UP = new THREE.Vector3(0, 1, 0);
/** Sides of the platform outline: a hexagon, or a polygon fine enough to read as a circle. */
const sidesOf = (shape: PlatformShape) => (shape === "round" ? STAGE_PLATFORM_ROUND.roundSegments : 6);

/** Top face of the platform in world space (matches <Platform/>). */
function topFaceVertices(shape: PlatformShape): THREE.Vector3[] {
  const r = A.platformRadiusM * 0.97;
  const n = sidesOf(shape);
  return Array.from({ length: n }, (_, k) => {
    const a = Math.PI / 2 + (k * 2 * Math.PI) / n;
    return new THREE.Vector3(Math.cos(a) * r, 0, -Math.sin(a) * r);
  });
}

/** Point (on y = 0) inside the convex top face, at least `margin` m from its edges. */
function insideTopFace(p: THREE.Vector3, verts: THREE.Vector3[], margin: number): boolean {
  let sign = 0;
  for (let k = 0; k < verts.length; k++) {
    const a = verts[k];
    const b = verts[(k + 1) % verts.length];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const len = Math.hypot(ex, ez);
    const cross = (ex * (p.z - a.z) - ez * (p.x - a.x)) / len; // signed distance to the edge
    if (!sign) sign = Math.sign(cross) || 1;
    if (cross * sign < margin) return false;
  }
  return true;
}

type Props = {
  handle: MutableRefObject<ArenaHandle>;
  /** Zero-size element on the athlete's feet line (platform centre). */
  anchorRef: RefObject<HTMLElement>;
  /** The figure box (its height = the photo frame height). */
  figureRef: RefObject<HTMLElement>;
  onReady: () => void;
  /** Platform shape (STAGE_PLATFORM, or the ?platform= preview). */
  platform: PlatformShape;
  /**
   * "static-athlete" stage: the platform turns with the camera, so it stays
   * still on screen (under the still athlete) while the scenery orbits.
   */
  platformLocked?: boolean;
  onFail: () => void;
  /** Published stage frame media (empty = neon frames only). */
  screens?: StageScreen[];
  /** Load the screens' pictures (after the athlete and the arena are ready). */
  screensActive?: boolean;
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
function Rig({ handle, anchorRef, figureRef, platform, platformLocked }: Pick<Props, "handle" | "anchorRef" | "figureRef" | "platform" | "platformLocked">) {
  const { camera, gl, invalidate, size, setDpr } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const d = A.cameraDistanceM;
  const camY = d * Math.tan(rad(A.cameraElevationDeg));
  const lookY = A.athleteHeightM / 2;

  useEffect(() => {
    const h = handle.current;
    h.invalidate = invalidate;
    h.setDpr = setDpr;
    const verts = topFaceVertices(platform);
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const ndc = new THREE.Vector2();
    // The camera for the angle the card just painted (useFrame may not have
    // run yet this frame).
    const sync = () => {
      const phi = A.orbitDirection * rad(h.angleDeg);
      cam.position.set(Math.sin(phi) * d, camY, Math.cos(phi) * d);
      cam.lookAt(0, lookY, 0);
      cam.updateMatrixWorld();
      return phi;
    };
    h.groundHit = (x, y) => {
      const c = gl.domElement.getBoundingClientRect();
      if (!c.width || !c.height) return null;
      const phi = sync();
      ndc.set(((x - c.left) / c.width) * 2 - 1, -((y - c.top) / c.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      if (!ray.ray.intersectPlane(plane, hit)) return null;
      const f = A.feetForward * A.platformRadiusM; // the feet point (see fit)
      const feet = new THREE.Vector3(Math.sin(phi) * f, 0, Math.cos(phi) * f);
      // A locked platform turned with the camera: test in its own frame.
      const local = platformLocked ? hit.clone().applyAxisAngle(UP, -phi) : hit;
      return {
        inside: insideTopFace(local, verts, A.contactMarginM),
        scale: cam.position.distanceTo(feet) / cam.position.distanceTo(hit),
      };
    };
    h.pick = (x, y, objects) => {
      const c = gl.domElement.getBoundingClientRect();
      if (!c.width || !c.height) return [];
      sync();
      ndc.set(((x - c.left) / c.width) * 2 - 1, -((y - c.top) / c.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      return ray.intersectObjects(objects, true);
    };
    h.outline = () => {
      const c = gl.domElement.getBoundingClientRect();
      const phi = sync();
      return verts.map((v) => {
        const q = (platformLocked ? v.clone().applyAxisAngle(UP, phi) : v.clone()).project(cam);
        return [c.left + ((q.x + 1) / 2) * c.width, c.top + ((1 - q.y) / 2) * c.height] as [number, number];
      });
    };
    return () => {
      h.invalidate = null;
      h.setDpr = null;
      h.groundHit = null;
      h.outline = null;
      h.pick = null;
    };
  }, [handle, invalidate, setDpr, cam, gl, d, camY, lookY, platform, platformLocked]);

  const lastAnchorRef = useRef({ x: NaN, y: NaN, h: NaN });
  const fitRef = useRef<() => void>(() => {});
  useEffect(() => {
    const fit = () => {
      const a = anchorRef.current;
      const f = figureRef.current;
      const c = gl.domElement.getBoundingClientRect();
      if (!a || !f || c.width === 0 || c.height === 0) return;
      const ar = a.getBoundingClientRect();
      const fr = f.getBoundingClientRect();
      lastAnchorRef.current = { x: ar.left - c.left, y: ar.top - c.top, h: fr.height };
      const W = c.width;
      const H = c.height;
      const ppm = (fr.height * A.athleteFrameFill) / A.athleteHeightM; // CSS px per metre at the athlete
      cam.fov = clamp((2 * Math.atan(H / 2 / (ppm * d)) * 180) / Math.PI, 4, 80); // narrow when zoomed onto a zone
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
      // Stand the feet A.feetForward of the way toward the platform's front
      // edge: raise the centre by that share of the top face's half-depth.
      const front = new THREE.Vector3(0, 0, A.platformRadiusM).project(cam);
      const halfDepth = ((front.y - o.y) / -2) * H; // px, front edge below centre
      const oy = ((1 - o.y) / 2) * H + A.feetForward * halfDepth;
      cam.setViewOffset(W, H, ox - (ar.left - c.left), oy - (ar.top - c.top), W, H);
      invalidate();
    };
    fitRef.current = fit;
    handle.current.refit = fit;
    fit();
    // Web fonts swapping in (and other late layout shifts) move the figure
    // without resizing anything: refit when they settle, and poll the anchor
    // cheaply so the platform never drifts off the feet.
    document.fonts?.ready.then(fit).catch(() => {});
    const poll = window.setInterval(() => {
      const a = anchorRef.current;
      const f = figureRef.current;
      if (!a || !f) return;
      const c = gl.domElement.getBoundingClientRect();
      const ar = a.getBoundingClientRect();
      const L = lastAnchorRef.current;
      if (
        Math.abs(ar.left - c.left - L.x) > 0.5 ||
        Math.abs(ar.top - c.top - L.y) > 0.5 ||
        Math.abs(f.getBoundingClientRect().height - L.h) > 0.5
      )
        fit();
    }, 400);
    const ro = new ResizeObserver(fit);
    ro.observe(gl.domElement);
    if (figureRef.current) ro.observe(figureRef.current);
    window.addEventListener("resize", fit);
    return () => {
      window.clearInterval(poll);
      ro.disconnect();
      window.removeEventListener("resize", fit);
      if (handle.current.refit === fit) handle.current.refit = null;
    };
  }, [anchorRef, figureRef, gl, cam, d, camY, lookY, invalidate, size, handle]);

  useFrame(() => {
    const phi = A.orbitDirection * rad(handle.current.angleDeg);
    cam.position.set(Math.sin(phi) * d, camY, Math.cos(phi) * d);
    cam.lookAt(0, lookY, 0);
  });

  return null;
}

/** Spotlight pool on the platform top: bright centre, soft edge (made in code). */
function usePoolTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    // Slightly dimmer right under the feet (A.poolCenterDim), brightest just around them.
    grd.addColorStop(0, `rgba(255,255,255,${1 - A.poolCenterDim})`);
    grd.addColorStop(A.poolDimRadius, "rgba(255,255,255,1)");
    grd.addColorStop(Math.max(0.5, A.poolDimRadius + 0.2), "rgba(255,255,255,0.55)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

/** Soft radial glow sprite texture (made in code, no asset). */
function useGlowTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(0,180,255,0.9)");
    grd.addColorStop(0.35, "rgba(0,180,255,0.35)");
    grd.addColorStop(1, "rgba(0,180,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

function Platform({ handle, platform, platformLocked }: Pick<Props, "handle" | "platform" | "platformLocked">) {
  const R = A.platformRadiusM;
  const n = sidesOf(platform);
  const groupRef = useRef<THREE.Group>(null);
  const glowTex = useGlowTexture();
  const poolTex = usePoolTexture();
  // The feet stand A.feetForward toward the viewer (see Rig), so the light
  // pool sits under them: on the camera-facing radius, whatever the angle.
  const poolRef = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const phi = A.orbitDirection * rad(handle.current.angleDeg);
    const d = A.feetForward * R;
    if (platformLocked) {
      // Turn the whole platform with the camera: it stays still on screen.
      groupRef.current?.rotation.set(0, phi, 0);
      poolRef.current?.position.set(0, 0.002, d);
    } else {
      groupRef.current?.rotation.set(0, 0, 0);
      poolRef.current?.position.set(Math.sin(phi) * d, 0.002, Math.cos(phi) * d);
    }
  });
  return (
    <group ref={groupRef}>
      {/* Body + top face (hexagon: 6 radial segments; round: many) */}
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[R, R * 1.05, 0.1, n]} />
        <meshBasicMaterial color="#0b1218" />
      </mesh>
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[R * 0.97, n, Math.PI / 2]} />
        <meshBasicMaterial color={A.topFaceColor} />
      </mesh>
      {/* Spotlight pool under the feet (the athlete stands on a lit floor) */}
      <mesh ref={poolRef} position={[0, 0.002, A.feetForward * R]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[R * A.poolRadius, 48]} />
        <meshBasicMaterial
          map={poolTex}
          color={A.poolColor}
          transparent
          opacity={A.poolOpacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          fog={false}
        />
      </mesh>
      {/* Neon rim (torus with 6 tubular segments = hexagon, many = ring), aligned to the body */}
      <group rotation={[0, Math.PI / 2, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
          <torusGeometry args={[R, 0.013, 6, n]} />
          <meshBasicMaterial color={A.color} toneMapped={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
          <torusGeometry args={[R, 0.07, 6, n]} />
          <meshBasicMaterial color={A.color} transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.095, 0]}>
          <torusGeometry args={[R * 1.05, 0.01, 6, n]} />
          <meshBasicMaterial color={A.color} transparent opacity={0.7} toneMapped={false} />
        </mesh>
        {/* Round: thin glowing rings on the top face (a lit ring stage) */}
        {platform === "round" &&
          STAGE_PLATFORM_ROUND.roundInnerRings.map((f) => (
            <mesh key={f} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
              <torusGeometry args={[R * f, 0.006, 6, n]} />
              <meshBasicMaterial color={A.color} transparent opacity={STAGE_PLATFORM_ROUND.innerRingOpacity} toneMapped={false} />
            </mesh>
          ))}
      </group>
      {/* Floor glow under the platform */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.098, 0]}>
        <planeGeometry args={[R * 4.2, R * 4.2]} />
        <meshBasicMaterial map={glowTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
    </group>
  );
}

function Floor({ platform }: Pick<Props, "platform">) {
  const lines = useMemo(() => {
    const pts: number[] = [];
    const y = -0.097;
    // Radial spokes
    const spokes = 24;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      pts.push(Math.sin(a) * 1.5, y, Math.cos(a) * 1.5, Math.sin(a) * 20, y, Math.cos(a) * 20);
    }
    // Concentric rings, the platform's shape (hexagons or circles)
    const n = platform === "round" ? 64 : 6;
    for (const r of [2.2, 3.6, 5.4, 8.5, 12.5]) {
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2;
        const a1 = ((k + 1) / n) * Math.PI * 2;
        pts.push(Math.sin(a0) * r, y, Math.cos(a0) * r, Math.sin(a1) * r, y, Math.cos(a1) * r);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [platform]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <circleGeometry args={[30, 48]} />
        <meshBasicMaterial color="#06090c" />
      </mesh>
      <lineSegments geometry={lines}>
        <lineBasicMaterial color={A.color} transparent opacity={0.3} toneMapped={false} />
      </lineSegments>
    </group>
  );
}

/** A box of the given size placed/oriented along the segment from -> to. */
function barGeometry(from: THREE.Vector3, to: THREE.Vector3, w: number): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const g = new THREE.BoxGeometry(w, len, w);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
  return g;
}

/** Angle (rad) of screen i around the stage (same layout for scenery and media). */
function screenAngle(i: number): number {
  return (i / A.screens.count) * Math.PI * 2 + A.screens.angleOffsetRad;
}

/** A white ▶ in a ring, drawn once (shared by every video screen). */
let playTexture: THREE.CanvasTexture | null = null;
function playIcon(): THREE.CanvasTexture {
  if (playTexture) return playTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(0,0,0,0.45)";
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#fff";
  g.lineWidth = 6;
  g.stroke();
  g.fillStyle = "#fff";
  g.beginPath();
  g.moveTo(52, 40);
  g.lineTo(52, 88);
  g.lineTo(92, 64);
  g.closePath();
  g.fill();
  playTexture = new THREE.CanvasTexture(c);
  playTexture.colorSpace = THREE.SRGBColorSpace;
  return playTexture;
}

/** Instagram look (gradient + camera glyph): the badge, or a whole card when there is no cover image. */
const igCache = new Map<string, THREE.CanvasTexture>();
function instagramTexture(kind: "badge" | "card", caption?: string | null): THREE.CanvasTexture {
  const key = `${kind}:${caption ?? ""}`;
  const hit = igCache.get(key);
  if (hit) return hit;
  const W = kind === "card" ? 576 : 128;
  const H = kind === "card" ? 960 : 128;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, H, W, 0);
  grad.addColorStop(0, "#feda75");
  grad.addColorStop(0.45, "#d62976");
  grad.addColorStop(1, "#4f5bd5");
  g.fillStyle = grad;
  // roundRect: Safari 16+ / Chrome 99+; plain rectangles on older browsers.
  const rr = (x: number, y: number, w: number, h: number, r: number) => (g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h));
  if (kind === "badge") {
    g.beginPath();
    rr(8, 8, W - 16, H - 16, 28);
    g.fill();
  } else g.fillRect(0, 0, W, H);
  // camera glyph
  const s = kind === "card" ? 180 : 72;
  const x = W / 2 - s / 2;
  const y = (kind === "card" ? H * 0.42 : H / 2) - s / 2;
  g.strokeStyle = "#fff";
  g.lineWidth = s * 0.09;
  g.beginPath();
  rr(x, y, s, s, s * 0.28);
  g.stroke();
  g.beginPath();
  g.arc(x + s / 2, y + s / 2, s * 0.22, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#fff";
  g.beginPath();
  g.arc(x + s * 0.76, y + s * 0.24, s * 0.06, 0, Math.PI * 2);
  g.fill();
  if (kind === "card" && caption) {
    g.font = "600 40px system-ui, sans-serif";
    g.textAlign = "center";
    g.fillText(caption.length > 24 ? caption.slice(0, 23) + "…" : caption, W / 2, H * 0.68);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  igCache.set(key, t);
  return t;
}

/**
 * Media on the screens: each picture fitted ("contain") inside its frame,
 * dimmed / tinted (A.screens), plus a ▶ for videos. Pictures load only once
 * `active` (athlete and arena ready); a picture that fails to load just leaves
 * the empty neon frame. Registers handle.mediaHit for taps.
 */
function Screens({ handle, screens, active }: { handle: MutableRefObject<ArenaHandle>; screens: StageScreen[]; active: boolean }) {
  const { invalidate } = useThree();
  const SC = A.screens;
  const group = useRef<THREE.Group>(null);
  const [tex, setTex] = useState<Record<number, THREE.Texture>>({});

  useEffect(() => {
    if (!active) return;
    let off = false;
    // Instagram without a cover image: a drawn Instagram card (no network).
    const cards: Record<number, THREE.Texture> = {};
    for (const s of screens) if (s.kind === "instagram" && !s.picture && s.slot < SC.count) cards[s.slot] = instagramTexture("card", s.title);
    if (Object.keys(cards).length) {
      setTex((m) => ({ ...m, ...cards }));
      invalidate();
    }
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    const made: THREE.Texture[] = [];
    for (const s of screens) {
      if (!s.picture || s.slot >= SC.count) continue;
      loader.load(
        s.picture,
        (t) => {
          if (off) return t.dispose();
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 4;
          made.push(t);
          setTex((m) => ({ ...m, [s.slot]: t }));
          invalidate();
        },
        undefined,
        () => {}, // dead link / blocked: the frame stays empty
      );
    }
    return () => {
      off = true;
      made.forEach((t) => t.dispose());
      setTex({});
    };
  }, [active, screens, invalidate, SC.count]);

  useEffect(() => {
    const h = handle.current;
    h.mediaHit = (x, y) => {
      const g = group.current;
      if (!g || !h.pick) return null;
      const hit = h.pick(x, y, g.children)[0];
      return hit ? (hit.object.userData.slot as number) : null;
    };
    return () => {
      h.mediaHit = null;
    };
  }, [handle]);

  const tint = useMemo(() => new THREE.Color(SC.tint).multiplyScalar(SC.brightness), [SC.tint, SC.brightness]);
  const iw = SC.widthM - SC.insetM * 2;
  const ih = SC.heightM - SC.insetM * 2;
  const cy = -0.1 + SC.bottomM + SC.heightM / 2;

  return (
    <group ref={group}>
      {screens.map((s) => {
        const t = tex[s.slot];
        if (!t || s.slot >= SC.count) return null;
        const img = t.image as { width?: number; height?: number } | undefined;
        const ar = img?.width && img?.height ? img.width / img.height : 16 / 9;
        const w = ar >= iw / ih ? iw : ih * ar;
        const hh = ar >= iw / ih ? iw / ar : ih;
        const a = screenAngle(s.slot);
        // Facing the stage centre (rotate half a turn more than the frame bars).
        const pos: [number, number, number] = [Math.sin(a) * (SC.radiusM - 0.02), cy, Math.cos(a) * (SC.radiusM - 0.02)];
        return (
          <group key={s.slot} position={pos} rotation={[0, a + Math.PI, 0]}>
            <mesh userData={{ slot: s.slot }}>
              <planeGeometry args={[w, hh]} />
              <meshBasicMaterial map={t} color={tint} fog={false} toneMapped={false} />
            </mesh>
            {(s.kind === "youtube" || s.kind === "video") && (
              <mesh position={[0, 0, 0.01]} userData={{ slot: s.slot }}>
                <planeGeometry args={[SC.playIconM, SC.playIconM]} />
                <meshBasicMaterial map={playIcon()} transparent opacity={SC.playIconOpacity} fog={false} toneMapped={false} depthWrite={false} />
              </mesh>
            )}
            {s.kind === "instagram" && s.picture && (
              <mesh position={[w / 2 - SC.playIconM * 0.45, hh / 2 - SC.playIconM * 0.45, 0.01]} userData={{ slot: s.slot }}>
                <planeGeometry args={[SC.playIconM * 0.6, SC.playIconM * 0.6]} />
                <meshBasicMaterial map={instagramTexture("badge")} transparent opacity={SC.playIconOpacity} fog={false} toneMapped={false} depthWrite={false} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

/**
 * Pillars, light frames, slanted beams and a far ring of panels, all beyond the
 * camera radius and spread all the way round (the stage turns continuously, so
 * no side may be empty). Everything static is merged into three meshes — dark
 * bodies, neon cores, glow halos — so the whole scenery costs 3 draw calls per
 * frame instead of ~100.
 */
function Scenery() {
  const geos = useMemo(() => {
    const bodies: THREE.BufferGeometry[] = [];
    const cores: THREE.BufferGeometry[] = [];
    const halos: THREE.BufferGeometry[] = [];
    const Y0 = -0.1;
    const place = (g: THREE.BufferGeometry, a: number, r: number) =>
      g.applyMatrix4(
        new THREE.Matrix4().compose(
          new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a),
          new THREE.Vector3(1, 1, 1),
        ),
      );
    const neon = (from: THREE.Vector3, to: THREE.Vector3, w: number, halo: boolean, a: number, r: number) => {
      cores.push(place(barGeometry(from, to, w), a, r));
      if (halo) halos.push(place(barGeometry(from, to, w * 5), a, r));
    };
    const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

    // Pillars (near ring)
    for (let i = 0; i < A.pillars; i++) {
      const a = (i / A.pillars) * Math.PI * 2 + seeded(i) * 0.35;
      const r = A.minSceneryRadiusM + 0.6 + seeded(i + 10) * 3.5;
      const h = 3.2 + seeded(i + 20) * 2.2;
      const s = 0.34;
      const body = new THREE.BoxGeometry(s, h, s);
      body.translate(0, Y0 + h / 2, 0);
      bodies.push(place(body, a, r));
      neon(v(-s / 2, Y0, -s / 2 - 0.01), v(-s / 2, Y0 + h, -s / 2 - 0.01), 0.028, true, a, r);
      neon(v(s / 2, Y0, -s / 2 - 0.01), v(s / 2, Y0 + h * 0.72, -s / 2 - 0.01), 0.028, true, a, r);
    }
    // Screens (landscape neon frames; media inside, see <Screens/>)
    const SC = A.screens;
    for (let i = 0; i < SC.count; i++) {
      const a = screenAngle(i);
      const w = SC.widthM;
      const y0 = Y0 + SC.bottomM;
      const y1 = y0 + SC.heightM;
      neon(v(-w / 2, y0), v(-w / 2, y1), 0.028, true, a, SC.radiusM);
      neon(v(w / 2, y0), v(w / 2, y1), 0.028, true, a, SC.radiusM);
      neon(v(-w / 2, y1), v(w / 2, y1), 0.028, true, a, SC.radiusM);
      neon(v(-w / 2, y0), v(w / 2, y0), 0.028, true, a, SC.radiusM);
      // legs down to the floor, so the screens stand like the old frames did
      neon(v(-w / 2 + 0.2, Y0), v(-w / 2 + 0.2, y0), 0.012, false, a, SC.radiusM);
      neon(v(w / 2 - 0.2, Y0), v(w / 2 - 0.2, y0), 0.012, false, a, SC.radiusM);
    }
    // Slanted beams leaning in toward the stage
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      const r = A.minSceneryRadiusM + 4.5;
      const from = new THREE.Vector3(Math.sin(a) * r, Y0, Math.cos(a) * r);
      const to = new THREE.Vector3(Math.sin(a + 0.18) * (r - 1.6), 5.5, Math.cos(a + 0.18) * (r - 1.6));
      cores.push(barGeometry(from, to, 0.02));
      halos.push(barGeometry(from, to, 0.1));
    }
    // Far ring of tall slim panels (fog-faded) so the horizon is never empty
    for (let i = 0; i < A.farPanels; i++) {
      const a = (i / A.farPanels) * Math.PI * 2 + seeded(i + 40) * 0.2;
      const r = A.farRadiusM + seeded(i + 50) * 2;
      const h = 4 + seeded(i + 60) * 3;
      const body = new THREE.BoxGeometry(0.6, h, 0.25);
      body.translate(0, Y0 + h / 2, 0);
      bodies.push(place(body, a, r));
      neon(v(0.3, Y0, -0.14), v(0.3, Y0 + h, -0.14), 0.035, false, a, r);
    }
    return {
      bodies: mergeGeometries(bodies)!,
      cores: mergeGeometries(cores)!,
      halos: mergeGeometries(halos)!,
    };
  }, []);

  return (
    <group>
      <mesh geometry={geos.bodies}>
        <meshBasicMaterial color="#0a1016" />
      </mesh>
      <mesh geometry={geos.cores}>
        <meshBasicMaterial color={A.color} toneMapped={false} />
      </mesh>
      <mesh geometry={geos.halos}>
        <meshBasicMaterial
          color={A.color}
          transparent
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
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

const NO_SCREENS: StageScreen[] = [];

/** The 3D arena canvas. Purely decorative: no pointer events, aria-hidden. */
export function StageArena3D({ handle, anchorRef, figureRef, onReady, onFail, platform, platformLocked = false, screens = NO_SCREENS, screensActive = false }: Props) {
  const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  return (
    <ArenaBoundary onFail={onFail}>
      <Canvas
        frameloop="demand"
        flat
        dpr={[1, coarse ? A.touchMaxDpr : A.maxDpr]}
        gl={{ antialias: !coarse, alpha: false, powerPreference: "high-performance" }}
        camera={{ fov: 35, near: 0.1, far: 80, position: [0, 1, A.cameraDistanceM] }}
        style={{ pointerEvents: "none" }}
        aria-hidden
        onCreated={({ scene }) => {
          scene.background = new THREE.Color(A.background);
          scene.fog = new THREE.Fog(A.background, A.fogNear, A.fogFar);
          onReady();
        }}
      >
        <Rig handle={handle} anchorRef={anchorRef} figureRef={figureRef} platform={platform} platformLocked={platformLocked} />
        <Floor platform={platform} />
        <Platform handle={handle} platform={platform} platformLocked={platformLocked} />
        <Scenery />
        {screens.length > 0 && <Screens handle={handle} screens={screens} active={screensActive} />}
      </Canvas>
    </ArenaBoundary>
  );
}
