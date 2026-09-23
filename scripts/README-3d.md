# Athlete 3D viewer — capture → GLB pipeline

The `/atlet/[id]?v=3d` preview renders a real-time 3D athlete on the neon stage
(react-three-fiber), with sponsor logos projected onto the body as decals that
rotate with the mesh. It is **preview-only** until a real per-athlete model
exists; today it shows a neutral 20FIT placeholder mannequin so the interaction
and decals can be built and tested.

This is the reusable pipeline for turning a real athlete capture into the GLB
the viewer loads. The capture + heavy processing run **outside** this repo (they
need a phone/camera and, for photogrammetry, a GPU or a cloud service) — this
file is the runbook; the app only consumes the finished GLB.

## 1. Capture (choose one)
- **Phone scan (easiest):** Polycam / Scaniverse / KIRI Engine. Walk a full
  circle around the athlete (who holds still), keep them centred, even lighting,
  plain background. Export **GLB** (glTF binary), Y-up, real-world scale.
- **Photo set → photogrammetry:** 40–100+ sharp photos orbiting the athlete
  (~60–70% overlap), plain background, no motion blur. Process in
  RealityCapture / Metashape / Meshroom → export **GLB** + baked texture.

> A 12-frame turntable (what the photo viewer uses) is **not** enough for a mesh
> — that is exactly why the photo path can't be perfectly smooth.

## 2. Optimize for web/mobile
- Decimate to ~30–80k triangles, bake a single 2k (mobile) / 4k (desktop) texture.
- Draco/meshopt compress the GLB (`gltf-transform optimize in.glb out.glb`).
- Target < ~5 MB. Verify it loads in https://gltf-viewer.donmccurdy.com.

## 3. Install into the app
1. Put the file at `public/media/atlet-3d/<athlete-slug>/model.glb`
   (or a Storage/CDN URL — the viewer takes any URL).
2. Register it in `lib/viewer3d.ts` → `VIEWER_3D.models`:
   ```ts
   models: { "<athlete-uuid>": "/media/atlet-3d/<athlete-slug>/model.glb" }
   ```
   (Later this moves to a DB column so it's data, not code.)
3. Set the per-zone decal placements for that model in `VIEWER_3D.decals`
   (position / rotation / scale on the mesh surface, keyed by zone name). Tune
   against the real mesh — placeholder values won't match a real body.

## 4. Ship
- Keep it behind `?v=3d` (or flip the page default) until the model looks right
  on desktop + mobile. WebGL is detected at runtime; unsupported browsers fall
  back to the photo viewer automatically.

## Notes / log
- Renderer: three.js + @react-three/fiber + @react-three/drei (see package.json).
- No GPU/photogrammetry runs in this repo's CI/sandbox; keep captures + GLB
  processing in the capture tool or a dedicated machine, commit only the final
  optimized GLB (or host it and reference the URL).
