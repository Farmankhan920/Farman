/**
 * three-scene.js
 * ------------------------------------------------------------------
 * A single fixed, transparent full-viewport canvas (#hero-canvas,
 * inside #dragon-layer) renders across the ENTIRE page and always
 * sits in FRONT of the page content (below the header only), so the
 * dragon is never hidden behind cards or panels.
 *
 * Flight path: rather than a handful of discrete "stops", the model's
 * screen position is driven by layered sine waves across the whole
 * document's scroll progress (0 → 1). This makes it roam continuously
 * left/right AND up/down/near/far as the user scrolls — never parked
 * in just one or two spots — while staying perfectly reversible,
 * since it's a pure function of scroll position. It enters from
 * off-screen at the very top of the page and exits off-screen at the
 * very bottom.
 * ------------------------------------------------------------------
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_URL = "assets/models/dragon_flying.glb";

const canvas = document.getElementById("hero-canvas");
const dragonLayer = document.getElementById("dragon-layer");
const glowEl = document.getElementById("dragon-glow");
const loaderEl = document.getElementById("hero-loader");
const loaderText = document.getElementById("loader-text");
const fallbackEl = document.getElementById("hero-fallback");
const scrollCue = document.getElementById("scroll-cue");

if (!canvas) {
  // Markup not present — nothing to do.
} else {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;

  /* ---------------------------------------------------------------
   * Renderer / Scene / Camera
   * ------------------------------------------------------------- */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.75 : 2));
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();

  const FOV = 42;
  const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 0, 9);
  camera.lookAt(0, 0, 0);

  /* ---------------------------------------------------------------
   * Lighting — warm key, cool emerald fill, gold rim
   * ------------------------------------------------------------- */
  const hemi = new THREE.HemisphereLight(0xfff6e6, 0x0e3b2c, 1.05);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xfff3df, 2.5);
  keyLight.position.set(6, 10, 8);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xe4c57c, 1.8);
  rimLight.position.set(-8, 3, -6);
  scene.add(rimLight);

  const fillLight = new THREE.DirectionalLight(0x9fd8bd, 0.75);
  fillLight.position.set(-4, -3, 6);
  scene.add(fillLight);

  /* ---------------------------------------------------------------
   * Model loading, auto-framed via bounding sphere
   * ------------------------------------------------------------- */
  let model = null;
  let mixer = null;
  let modelRadius = 1;
  let ready = false;
  const NORMALIZED_RADIUS = 1.85;

  const loader = new GLTFLoader();

  loader.load(
    MODEL_URL,
    (gltf) => {
      model = gltf.scene;

      model.traverse((node) => {
        if (node.isMesh && node.material) {
          node.material.envMapIntensity = 1.15;
        }
      });

      const box = new THREE.Box3().setFromObject(model);
      const sphere = new THREE.Sphere();
      box.getBoundingSphere(sphere);
      modelRadius = sphere.radius || 1;

      const normalizeScale = NORMALIZED_RADIUS / modelRadius;
      model.scale.setScalar(normalizeScale);
      const recenter = sphere.center.clone().multiplyScalar(normalizeScale);
      model.position.sub(recenter);

      scene.add(model);

      if (gltf.animations && gltf.animations.length) {
        mixer = new THREE.AnimationMixer(model);
        mixer.clipAction(gltf.animations[0]).play();
      }

      ready = true;
      if (loaderEl) loaderEl.classList.add("hidden");
    },
    (xhr) => {
      if (xhr.total && loaderText) {
        const pct = Math.min(100, Math.round((xhr.loaded / xhr.total) * 100));
        loaderText.textContent = `Loading scene · ${pct}%`;
      }
    },
    (err) => {
      console.error("GLB failed to load:", err);
      if (loaderEl) loaderEl.classList.add("hidden");
      if (fallbackEl) fallbackEl.classList.add("show");
      if (dragonLayer) dragonLayer.style.display = "none";
    }
  );

  /* ---------------------------------------------------------------
   * Continuous free-roaming flight path
   * x, y are normalized screen-space-ish coordinates: x -1..1 spans
   * left→right edge, y -1..1 spans bottom→top edge of the viewport
   * (values beyond ±1 push off-screen — used for enter/exit).
   * ------------------------------------------------------------- */
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (edge0, edge1, x) => {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  };

  // How many full left-right crossings happen across the whole page.
  const CROSSINGS = 4.2;

  function oscillate(t) {
    const x =
      Math.sin(t * Math.PI * 2 * CROSSINGS) * 0.82 +
      Math.sin(t * Math.PI * 2 * (CROSSINGS * 0.41) + 1.4) * 0.22;
    const y =
      Math.sin(t * Math.PI * 2 * (CROSSINGS * 0.66) + 0.7) * 0.55 +
      Math.cos(t * Math.PI * 2 * (CROSSINGS * 0.23) + 2.1) * 0.22;
    const depth = 6.4 + Math.sin(t * Math.PI * 2 * (CROSSINGS * 0.5) + 0.5) * 2.1;
    const scale = 1.05 + Math.sin(t * Math.PI * 2 * (CROSSINGS * 0.5) + 1.2) * 0.28;
    return { x, y, depth, scale };
  }

  function flightPath(t) {
    // Smoothly blend into an off-screen entry near t=0 and an
    // off-screen exit near t=1, so the dragon visibly flies in and
    // flies out rather than popping into existence.
    if (t < 0.07) {
      const local = smoothstep(0, 0.07, t);
      const mid = oscillate(0.07);
      return {
        x: lerp(1.6, mid.x, local),
        y: lerp(0.12, mid.y, local),
        depth: lerp(8.6, mid.depth, local),
        scale: lerp(0.85, mid.scale, local),
      };
    }
    if (t > 0.93) {
      const local = smoothstep(0.93, 1, t);
      const mid = oscillate(0.93);
      return {
        x: lerp(mid.x, 1.9, local),
        y: lerp(mid.y, 0.2, local),
        depth: lerp(mid.depth, 8.2, local),
        scale: lerp(mid.scale, 0.8, local),
      };
    }
    return oscillate(t);
  }

  /* ---------------------------------------------------------------
   * Convert normalized screen-ish coords to a 3D world position at
   * a given depth in front of the (fixed) camera.
   * ------------------------------------------------------------- */
  const vFovRad = (FOV * Math.PI) / 180;
  function ndcToWorld(x, y, depth) {
    const halfH = Math.tan(vFovRad / 2) * depth;
    const halfW = halfH * camera.aspect;
    return new THREE.Vector3(x * halfW, y * halfH, camera.position.z - depth);
  }

  /* ---------------------------------------------------------------
   * Scroll progress (0..1 across the WHOLE document)
   * ------------------------------------------------------------- */
  let rawProgress = 0;
  function updateScrollProgress() {
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    rawProgress = Math.min(1, Math.max(0, window.scrollY / maxScroll));
  }
  window.addEventListener("scroll", updateScrollProgress, { passive: true });

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    updateScrollProgress();
  }
  window.addEventListener("resize", onResize);

  /* ---------------------------------------------------------------
   * Desktop pointer parallax (subtle, additive — never fights scroll)
   * ------------------------------------------------------------- */
  let targetPointerX = 0, targetPointerY = 0;
  let pointerX = 0, pointerY = 0;
  const supportsHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (supportsHover && !prefersReducedMotion) {
    window.addEventListener("pointermove", (e) => {
      targetPointerX = (e.clientX / window.innerWidth - 0.5) * 2;
      targetPointerY = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
  }

  /* ---------------------------------------------------------------
   * Render loop
   * ------------------------------------------------------------- */
  const clock = new THREE.Clock();
  let dampedProgress = 0;
  const currentPos = new THREE.Vector3();
  let posInitialized = false;
  let prevWorldX = 0;

  onResize();
  updateScrollProgress();

  function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);

    if (mixer) mixer.update(delta);

    if (prefersReducedMotion) {
      dampedProgress = rawProgress;
    } else {
      dampedProgress += (rawProgress - dampedProgress) * Math.min(1, delta * 5.2);
    }

    const wp = flightPath(dampedProgress);

    pointerX += (targetPointerX - pointerX) * 0.06;
    pointerY += (targetPointerY - pointerY) * 0.06;

    const targetWorld = ndcToWorld(wp.x, wp.y, wp.depth);
    targetWorld.x += pointerX * 0.22;
    targetWorld.y += pointerY * 0.12;

    if (!posInitialized) {
      currentPos.copy(targetWorld);
      posInitialized = true;
    } else {
      currentPos.lerp(targetWorld, prefersReducedMotion ? 1 : 0.09);
    }

    if (model && ready) {
      // Face the direction of travel instead of spinning freely —
      // this is what keeps the dragon reading as "flying forward"
      // rather than ever looking reversed/upside-down.
      const velocityX = currentPos.x - prevWorldX;
      prevWorldX = currentPos.x;

      model.position.copy(currentPos);

      const BASE_YAW = 0.35; // resting facing angle for this model
      const MAX_YAW_SWING = 0.75;
      const yawTarget = BASE_YAW + Math.max(-MAX_YAW_SWING, Math.min(MAX_YAW_SWING, -velocityX * 9));
      model.rotation.y += (yawTarget - model.rotation.y) * 0.05;

      const desiredScale = (NORMALIZED_RADIUS / modelRadius) * wp.scale;
      model.scale.setScalar(model.scale.x + (desiredScale - model.scale.x) * 0.08);

      if (!prefersReducedMotion) {
        const bank = Math.max(-0.35, Math.min(0.35, -velocityX * 5));
        model.rotation.z += (bank - model.rotation.z) * 0.06;
        model.rotation.x += (Math.sin(clock.elapsedTime * 0.6) * 0.04 - model.rotation.x) * 0.05;
        model.position.y += Math.sin(clock.elapsedTime * 0.9) * 0.03;
      }
    }

    // Glow trail follows the same projected screen position
    if (glowEl) {
      const px = (wp.x * 0.5 + 0.5) * window.innerWidth;
      const py = (-wp.y * 0.5 + 0.5) * window.innerHeight;
      glowEl.style.transform = `translate(${px}px, ${py}px) translate(-50%,-50%)`;
      glowEl.style.opacity = String(Math.max(0.2, 1 - (wp.depth - 4) / 8));
    }

    renderer.render(scene, camera);
  }
  animate();

  /* ---------------------------------------------------------------
   * Scroll cue: only visible near the very top of the page
   * ------------------------------------------------------------- */
  function updateScrollCue() {
    if (scrollCue) {
      scrollCue.style.opacity = window.scrollY > 140 ? "0" : "1";
    }
    requestAnimationFrame(updateScrollCue);
  }
  updateScrollCue();

  window.__farmanScene = { scene, camera, renderer };
}
