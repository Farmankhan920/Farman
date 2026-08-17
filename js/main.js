/**
 * main.js — UI behaviour: theme toggle, navigation, mobile menu,
 * scroll reveals, cursor light, magnetic/tilt micro-interactions.
 * No build step, no framework — vanilla DOM APIs only.
 */

const root = document.documentElement;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (prefersReducedMotion) root.classList.add("reduced-motion");

/* ------------------------------------------------------------------
 * Theme toggle (light default, optional dark mode, persisted)
 * ---------------------------------------------------------------- */
(function initTheme() {
  const toggle = document.getElementById("theme-toggle");
  const STORAGE_KEY = "farman-theme";

  let stored = null;
  try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) { /* storage unavailable */ }

  if (stored === "dark") {
    root.classList.add("dark");
  }
  // Default is always light per design spec, even if system prefers dark.

  function applyMeta() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", root.classList.contains("dark") ? "#0B1310" : "#FBF7EE");
  }
  applyMeta();

  if (toggle) {
    toggle.addEventListener("click", () => {
      root.classList.toggle("dark");
      const isDark = root.classList.contains("dark");
      toggle.setAttribute("aria-pressed", String(isDark));
      applyMeta();
      try { localStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light"); } catch (e) { /* ignore */ }
    });
  }
})();

/* ------------------------------------------------------------------
 * Mobile menu
 * ---------------------------------------------------------------- */
(function initMobileMenu() {
  const menu = document.getElementById("mobile-menu");
  const openBtn = document.getElementById("menu-open");
  const closeBtn = document.getElementById("menu-close");
  if (!menu || !openBtn) return;

  function open() {
    menu.classList.add("open");
    openBtn.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }
  function close() {
    menu.classList.remove("open");
    openBtn.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  openBtn.addEventListener("click", open);
  if (closeBtn) closeBtn.addEventListener("click", close);
  menu.querySelectorAll("[data-nav-mobile]").forEach((a) => a.addEventListener("click", close));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu.classList.contains("open")) close();
  });
})();

/* ------------------------------------------------------------------
 * Active section indicator in desktop nav
 * ---------------------------------------------------------------- */
(function initActiveNav() {
  const navLinks = Array.from(document.querySelectorAll("[data-nav]"));
  if (!navLinks.length) return;
  const sections = navLinks
    .map((a) => document.querySelector(a.getAttribute("href")))
    .filter(Boolean);

  if (!("IntersectionObserver" in window) || !sections.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const id = "#" + entry.target.id;
        const link = navLinks.find((a) => a.getAttribute("href") === id);
        if (!link) return;
        if (entry.isIntersecting) {
          navLinks.forEach((a) => a.classList.remove("active"));
          link.classList.add("active");
        }
      });
    },
    { rootMargin: "-40% 0px -50% 0px", threshold: 0 }
  );

  sections.forEach((s) => observer.observe(s));
})();

/* ------------------------------------------------------------------
 * Scroll-reveal animations
 * ---------------------------------------------------------------- */
(function initReveals() {
  const items = document.querySelectorAll(".reveal");
  if (!items.length) return;

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("in-view"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14, rootMargin: "0px 0px -6% 0px" }
  );

  items.forEach((el) => observer.observe(el));
})();

/* ------------------------------------------------------------------
 * Desktop cursor-following light + magnetic buttons + card tilt
 * ---------------------------------------------------------------- */
(function initPointerFX() {
  const supportsHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!supportsHover || prefersReducedMotion) return;

  const light = document.querySelector(".cursor-light");
  let raf = null;
  let mx = 0, my = 0;

  document.addEventListener("pointermove", (e) => {
    mx = e.clientX; my = e.clientY;
    document.body.classList.add("cursor-active");
    if (light && !raf) {
      raf = requestAnimationFrame(() => {
        light.style.transform = `translate(${mx}px, ${my}px) translate(-50%,-50%)`;
        raf = null;
      });
    }
  }, { passive: true });

  document.addEventListener("pointerleave", () => document.body.classList.remove("cursor-active"));

  // Magnetic buttons
  document.querySelectorAll(".btn, .icon-btn").forEach((btn) => {
    btn.addEventListener("pointermove", (e) => {
      const r = btn.getBoundingClientRect();
      const relX = (e.clientX - r.left - r.width / 2) * 0.22;
      const relY = (e.clientY - r.top - r.height / 2) * 0.22;
      btn.style.transform = `translate(${relX}px, ${relY}px)`;
    });
    btn.addEventListener("pointerleave", () => { btn.style.transform = ""; });
  });

  // Subtle 3D tilt on project + capability cards
  document.querySelectorAll(".project-card, .cap-card").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(800px) rotateX(${(-py * 4).toFixed(2)}deg) rotateY(${(px * 4).toFixed(2)}deg) translateY(-4px)`;
    });
    card.addEventListener("pointerleave", () => { card.style.transform = ""; });
  });
})();

/* ------------------------------------------------------------------
 * Subtle scroll parallax on portrait imagery
 * ---------------------------------------------------------------- */
(function initParallax() {
  if (prefersReducedMotion) return;
  const targets = Array.from(document.querySelectorAll(".hero-photo-frame img, .about-portrait img"));
  if (!targets.length) return;

  let raf = null;
  function update() {
    const vh = window.innerHeight;
    targets.forEach((el) => {
      const r = el.getBoundingClientRect();
      const centerOffset = (r.top + r.height / 2 - vh / 2) / vh;
      el.style.transform = `translateY(${(-centerOffset * 22).toFixed(1)}px) scale(1.06)`;
    });
    raf = null;
  }
  window.addEventListener("scroll", () => {
    if (!raf) raf = requestAnimationFrame(update);
  }, { passive: true });
  update();
})();

/* ------------------------------------------------------------------
 * Footer year
 * ---------------------------------------------------------------- */
(function setYear() {
  const el = document.getElementById("year");
  if (el) el.textContent = new Date().getFullYear();
})();

/* ------------------------------------------------------------------
 * Header shadow state on scroll (subtle depth cue)
 * ---------------------------------------------------------------- */
(function initHeaderScrollState() {
  const header = document.querySelector(".site-header .container");
  if (!header) return;
  let lastState = false;
  function onScroll() {
    const scrolled = window.scrollY > 12;
    if (scrolled !== lastState) {
      header.style.boxShadow = scrolled
        ? "0 1px 0 rgba(255,255,255,0.5) inset, 0 20px 46px -18px rgba(30,45,35,0.38)"
        : "";
      lastState = scrolled;
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
})();

/* ------------------------------------------------------------------
 * Contact configuration notice (dev console hint only)
 * Update the two data-config anchors in index.html's #contact
 * section with real mailto:/profile links before deploying.
 * ---------------------------------------------------------------- */
if (document.querySelector('[data-config="email"]')) {
  // Intentionally silent in production; see README "Editing contact links".
}
