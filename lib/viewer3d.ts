/**
 * 3D athlete viewer configuration (react-three-fiber).
 *
 * The 3D viewer is a PREVIEW for now: production keeps the photo viewer. A real
 * per-athlete model (from a capture -> GLB pipeline, see scripts/README-3d.md)
 * is registered in `models` and enabled later; until then the viewer shows a
 * neutral 20FIT placeholder mannequin so the interaction + decals can be built
 * and tested. Nothing about a model/decal is hardcoded in the component — it all
 * comes from here (and, later, the DB).
 */
export type DecalSlot = {
  /** Matches the athlete's real zone name (from the DB) so a decal links to it. */
  zone: string;
  /** Which placeholder body mesh it sits on. */
  part: "torso" | "legR" | "legL" | "armR" | "armL";
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
};

export const VIEWER_3D = {
  /** athleteId -> GLB url. Absent => neutral placeholder mannequin. */
  models: {} as Record<string, string>,

  camera: { position: [0, 0.1, 3.6] as [number, number, number], fov: 30 },

  orbit: {
    autoRotate: true,
    autoRotateSpeed: 0.9,
    dampingFactor: 0.09,
    minPolarDeg: 74, // clamp vertical so you can't look under/over the figure
    maxPolarDeg: 104,
    resumeAfterMs: 3000, // auto-rotate resumes this long after you let go
  },

  /** On-screen size of the 3D stage figure (height-capped to the viewport). */
  maxHeightSvh: 66,
  maxHeightPx: 620,
  maxWidthPx: 460,

  /**
   * Decal slots on the placeholder mannequin, keyed by zone name. Real models
   * will carry their own per-zone placement (added with the model), so this list
   * is the placeholder mapping only.
   */
  decals: [
    { zone: "Dada", part: "torso", position: [0, 0.12, 0.23], rotation: [0, 0, 0], scale: 0.3 },
    { zone: "Perut", part: "torso", position: [0, -0.12, 0.23], rotation: [0, 0, 0], scale: 0.26 },
    { zone: "Punggung", part: "torso", position: [0, 0.12, -0.23], rotation: [0, Math.PI, 0], scale: 0.3 },
    { zone: "Paha Kanan", part: "legR", position: [0, 0.16, 0.1], rotation: [0, 0, 0], scale: 0.14 },
  ] as DecalSlot[],
} as const;

export function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}
