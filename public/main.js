/* BodyHyrox-3D — interactive 3D hero scene (Three.js r128, UMD global). */
(function () {
  "use strict";

  if (typeof THREE === "undefined") {
    console.error("Three.js failed to load.");
    return;
  }

  var canvas = document.getElementById("scene");
  var renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  var scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0a0b, 0.08);

  var camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 0, 6);

  // --- Central geometry: wireframe icosahedron + inner solid ---
  var group = new THREE.Group();
  scene.add(group);

  var solidGeo = new THREE.IcosahedronGeometry(1.6, 1);
  var solidMat = new THREE.MeshStandardMaterial({
    color: 0x111114,
    metalness: 0.6,
    roughness: 0.35,
    emissive: 0x1a1a00,
  });
  group.add(new THREE.Mesh(solidGeo, solidMat));

  var wireGeo = new THREE.IcosahedronGeometry(2.1, 1);
  var wireMat = new THREE.MeshBasicMaterial({
    color: 0xffd11a,
    wireframe: true,
    transparent: true,
    opacity: 0.35,
  });
  group.add(new THREE.Mesh(wireGeo, wireMat));

  // --- Lighting ---
  var keyLight = new THREE.PointLight(0xffd11a, 1.4, 50);
  keyLight.position.set(5, 5, 5);
  scene.add(keyLight);

  var rimLight = new THREE.PointLight(0x4488ff, 0.8, 50);
  rimLight.position.set(-6, -3, 2);
  scene.add(rimLight);

  scene.add(new THREE.AmbientLight(0x404040, 0.6));

  // --- Particle field ---
  var particleCount = 700;
  var positions = new Float32Array(particleCount * 3);
  for (var i = 0; i < positions.length; i++) {
    positions[i] = (Math.random() - 0.5) * 22;
  }
  var particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3)
  );
  var particles = new THREE.Points(
    particleGeo,
    new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.02,
      transparent: true,
      opacity: 0.6,
    })
  );
  scene.add(particles);

  // --- Interaction (mouse / touch parallax) ---
  var pointer = { x: 0, y: 0 };
  window.addEventListener("pointermove", function (e) {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  });

  // --- Resize handling ---
  function resize() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  // --- Animation loop ---
  var clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    var t = clock.getElapsedTime();

    group.rotation.y = t * 0.25;
    group.rotation.x = Math.sin(t * 0.3) * 0.2;
    particles.rotation.y = t * 0.03;

    // Smooth parallax toward pointer
    camera.position.x += (pointer.x * 1.2 - camera.position.x) * 0.04;
    camera.position.y += (-pointer.y * 0.8 - camera.position.y) * 0.04;
    camera.lookAt(scene.position);

    renderer.render(scene, camera);
  }
  animate();
})();
