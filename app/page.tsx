"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

export default function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    let cleanup = () => {};

    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    script.async = true;
    script.onload = () => {
      const THREE = (window as unknown as { THREE?: any }).THREE;
      if (!THREE || !canvas) return;

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x0d090b, 0.08);
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
      camera.position.set(0, 0, 6);

      const group = new THREE.Group();
      scene.add(group);
      group.add(
        new THREE.Mesh(
          new THREE.IcosahedronGeometry(1.6, 1),
          new THREE.MeshStandardMaterial({ color: 0x160b10, metalness: 0.6, roughness: 0.35, emissive: 0x1a0008 }),
        ),
      );
      group.add(
        new THREE.Mesh(
          new THREE.IcosahedronGeometry(2.1, 1),
          new THREE.MeshBasicMaterial({ color: 0xff2d55, wireframe: true, transparent: true, opacity: 0.35 }),
        ),
      );

      const key = new THREE.PointLight(0xff2d55, 1.5, 50);
      key.position.set(5, 5, 5);
      scene.add(key);
      const rim = new THREE.PointLight(0x4488ff, 0.7, 50);
      rim.position.set(-6, -3, 2);
      scene.add(rim);
      scene.add(new THREE.AmbientLight(0x404040, 0.6));

      const positions = new Float32Array(700 * 3);
      for (let i = 0; i < positions.length; i++) positions[i] = (Math.random() - 0.5) * 22;
      const pgeo = new THREE.BufferGeometry();
      pgeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const particles = new THREE.Points(
        pgeo,
        new THREE.PointsMaterial({ color: 0xffffff, size: 0.02, transparent: true, opacity: 0.55 }),
      );
      scene.add(particles);

      const pointer = { x: 0, y: 0 };
      const onMove = (e: PointerEvent) => {
        pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
      };
      window.addEventListener("pointermove", onMove);

      const resize = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      window.addEventListener("resize", resize);
      resize();

      const clock = new THREE.Clock();
      const animate = () => {
        raf = requestAnimationFrame(animate);
        const t = clock.getElapsedTime();
        group.rotation.y = t * 0.25;
        group.rotation.x = Math.sin(t * 0.3) * 0.2;
        particles.rotation.y = t * 0.03;
        camera.position.x += (pointer.x * 1.2 - camera.position.x) * 0.04;
        camera.position.y += (-pointer.y * 0.8 - camera.position.y) * 0.04;
        camera.lookAt(scene.position);
        renderer.render(scene, camera);
      };
      animate();

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("resize", resize);
        renderer.dispose();
      };
    };
    document.body.appendChild(script);

    return () => {
      cleanup();
      script.remove();
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg text-text">
      <canvas ref={canvasRef} className="fixed inset-0 z-0 h-full w-full" />
      <div className="relative z-10 flex min-h-screen flex-col p-6 md:p-10">
        <header className="flex items-center justify-between">
          <span className="font-display text-xl font-bold tracking-tight">
            2<span className="text-accent">0</span>FIT
          </span>
          <Link href="/login" className="btn btn-ghost">Masuk Admin</Link>
        </header>

        <main className="flex flex-1 flex-col justify-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-accent">
            Sponsor My Body
          </p>
          <h1 className="max-w-3xl font-display text-5xl font-bold leading-[1.05] md:text-7xl">
            Sponsori <span className="text-accent">zona tubuh</span> atlet Hyrox
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted md:text-lg">
            Platform yang menghubungkan brand dengan atlet Hyrox — pasang sponsor
            di zona tubuh, kelola transaksi, dan pantau performa secara real-time.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className="btn btn-primary">Buka Dashboard</Link>
            <a href="#" className="btn btn-ghost">Pelajari Lebih Lanjut</a>
          </div>
        </main>

        <footer className="flex items-center justify-between text-sm text-faint">
          <span className="text-green">● Live</span>
          <span>© {new Date().getFullYear()} 20FIT</span>
        </footer>
      </div>
    </div>
  );
}
