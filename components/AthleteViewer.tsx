"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { Media360, PublicZone } from "@/lib/data";
import type { Dict } from "@/lib/i18n";
import { Viewer360 } from "@/components/Viewer360";
import { VIEWER_3D } from "@/lib/viewer3d";

// three/r3f load only when the 3D viewer actually renders (kept out of the
// fallback path so non-WebGL visitors never download it).
const Viewer3D = dynamic(() => import("@/components/Viewer3D").then((mod) => mod.Viewer3D), { ssr: false });

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch {
    return false;
  }
}

/**
 * 3D preview entry (rendered only when `?v=3d` is requested). Detects WebGL:
 * supported -> the r3f 3D viewer; unsupported -> the photo viewer with a note,
 * so nobody gets a blank screen.
 */
export function AthleteViewer3D({
  athleteId,
  media,
  zones,
  m,
}: {
  athleteId: string;
  media: Media360 | null;
  zones: PublicZone[];
  m: Dict;
}) {
  const [mode, setMode] = useState<"checking" | "3d" | "fallback">("checking");
  useEffect(() => {
    setMode(hasWebGL() ? "3d" : "fallback");
  }, []);

  if (mode === "3d") {
    return <Viewer3D athleteId={athleteId} zones={zones} m={m} media={media} modelUrl={VIEWER_3D.models[athleteId]} />;
  }

  // checking (first paint) or no WebGL: show the photo viewer as the safe base.
  return (
    <div className="mx-auto w-full" style={{ maxWidth: "min(300px, 82vw)" }}>
      {media ? <Viewer360 athleteId={athleteId} media={media} m={m} /> : null}
      {mode === "fallback" && (
        <p className="mt-3 text-center text-xs text-white/45">{m.v3d_fallback}</p>
      )}
    </div>
  );
}
