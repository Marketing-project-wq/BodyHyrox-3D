"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * ?debug=viewport — internal measuring aid for real phones (English only, not
 * user-facing). Shows the viewport units, the visual viewport, the safe-area
 * insets and where the stage's "Place Your Logo" button sits relative to the
 * visible bottom edge, so toolbar overlap can be measured on the device.
 * Mounted only with the parameter; nothing here runs otherwise.
 */
export function ViewportDebug({ sectionRef }: { sectionRef: RefObject<HTMLElement> }) {
  const probeRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [atBottom, setAtBottom] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let raf = 0;
    const px = (n: number) => `${Math.round(n)}`;
    const measure = () => {
      raf = 0;
      const probe = probeRef.current;
      if (!probe) return;
      const h = (sel: string) => probe.querySelector<HTMLElement>(sel)?.getBoundingClientRect().height ?? NaN;
      const inset = getComputedStyle(probe.querySelector<HTMLElement>("[data-inset]")!);
      const vv = window.visualViewport;
      const vvH = vv?.height ?? window.innerHeight;
      const vvTop = vv?.offsetTop ?? 0;
      const visibleBottom = vvTop + vvH;
      const sec = sectionRef.current;
      const cta = sec?.querySelector<HTMLElement>('a[href="#zona-sponsor"]')?.getBoundingClientRect();
      const tabs = sec?.querySelector<HTMLElement>('[role="tablist"]')?.getBoundingClientRect();
      const readout = sec?.querySelector<HTMLElement>(".stagecard-readout")?.getBoundingClientRect();
      const header = document.querySelector("header")?.getBoundingClientRect();
      const portrait = window.matchMedia("(orientation: portrait)").matches;
      setLines([
        `${portrait ? "portrait" : "landscape"} · dpr ${window.devicePixelRatio} · screen ${screen.width}x${screen.height}`,
        `inner ${px(window.innerWidth)}x${px(window.innerHeight)} · client h ${px(document.documentElement.clientHeight)}`,
        `visualViewport h ${px(vvH)} · offsetTop ${px(vvTop)} · scale ${(vv?.scale ?? 1).toFixed(2)}`,
        `100svh ${px(h("[data-svh]"))} · 100dvh ${px(h("[data-dvh]"))} · 100lvh ${px(h("[data-lvh]"))}`,
        `safe-area t ${inset.paddingTop} r ${inset.paddingRight} b ${inset.paddingBottom} l ${inset.paddingLeft}`,
        `scrollY ${px(window.scrollY)} · header bottom ${header ? px(header.bottom) : "-"}`,
        `readout top ${readout ? px(readout.top) : "-"} · tabs ${tabs ? `${px(tabs.top)}–${px(tabs.bottom)}` : "-"}`,
        cta
          ? `sponsors btn ${px(cta.top)}–${px(cta.bottom)} · space below to visible bottom ${px(visibleBottom - cta.bottom)}`
          : "sponsors btn -",
        `readout→btn span ${readout && cta ? px(cta.bottom - readout.top) : "-"} · visible below header ${
          header ? px(visibleBottom - header.bottom) : "-"
        }`,
        navigator.userAgent.replace(/^Mozilla\/5\.0 /, "").slice(0, 90),
      ]);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    schedule();
    const vv = window.visualViewport;
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("scroll", schedule, { passive: true });
    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
    };
  }, [sectionRef]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: take a screenshot instead */
    }
  };

  return createPortal(
    <>
      {/* Invisible probes for the viewport units and safe-area insets */}
      <div ref={probeRef} aria-hidden style={{ position: "fixed", left: 0, top: 0, width: 0, height: 0, overflow: "hidden", visibility: "hidden", pointerEvents: "none" }}>
        <div data-svh style={{ position: "absolute", height: "100svh", width: 1 }} />
        <div data-dvh style={{ position: "absolute", height: "100dvh", width: 1 }} />
        <div data-lvh style={{ position: "absolute", height: "100lvh", width: 1 }} />
        <div
          data-inset
          style={{
            position: "absolute",
            paddingTop: "env(safe-area-inset-top, 0px)",
            paddingRight: "env(safe-area-inset-right, 0px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            paddingLeft: "env(safe-area-inset-left, 0px)",
          }}
        />
      </div>
      <div
        style={{
          position: "fixed",
          left: 8,
          right: 8,
          zIndex: 9999,
          ...(atBottom ? { bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)" } : { top: "calc(env(safe-area-inset-top, 0px) + 64px)" }),
          font: "11px/1.35 ui-monospace, Menlo, monospace",
          color: "#d9f99d",
          background: "rgba(0,0,0,0.82)",
          border: "1px solid rgba(217,249,157,0.5)",
          borderRadius: 8,
          padding: "6px 8px",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
          <strong style={{ flex: 1, alignSelf: "center" }}>debug=viewport</strong>
          <button type="button" onClick={() => setAtBottom((b) => !b)} style={{ minWidth: 44, minHeight: 44, border: "1px solid #d9f99d", borderRadius: 6, padding: "0 8px", fontSize: 16, color: "#d9f99d", background: "transparent" }}>
            {atBottom ? "Move up" : "Move down"}
          </button>
          <button type="button" onClick={copy} style={{ minWidth: 44, minHeight: 44, border: "1px solid #d9f99d", borderRadius: 6, padding: "0 8px", fontSize: 16, color: "#d9f99d", background: "transparent" }}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        {lines.join("\n")}
      </div>
    </>,
    document.body,
  );
}
