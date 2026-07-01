import { useEffect, useRef } from "react";
import { useTheme } from "../context/ThemeContext";
import { useConfig, type ThreeQuality } from "../lib/configStore";

/**
 * The Three.js visual engine — an optimized WebGL layer that lifts the Liquid
 * Glass aesthetic into real depth.
 *
 * Design goals, in order:
 *   1. **Performance first.** A single full-screen shader quad (one draw call)
 *      renders a domain-warped "liquid" flow, so cost is fill-rate only. The
 *      pixel ratio is capped by the chosen quality, the loop pauses when the tab
 *      is hidden, and Three.js is *code-split* (dynamic import) so it never
 *      weighs down first paint. This comfortably holds ~60 fps.
 *   2. **Theme-true.** Colours are pulled from the corporate palette per theme,
 *      so it reads as a deep Midnight in dark mode and an airy Daylight in light
 *      mode — always sober and corporate.
 *   3. **Graceful.** If WebGL is unavailable, the engine is disabled in
 *      Configuración, or the user prefers reduced motion, it renders nothing and
 *      the CSS {@link ./MeshBackground} remains as the fallback.
 */
export function ThreeBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const config = useConfig();
  // Keep the latest theme reachable from the (long-lived) render loop.
  const themeRef = useRef(theme);
  themeRef.current = theme;

  const prefersReduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const active = config.enableThree && !config.reduceMotion && !prefersReduced;
  const quality = config.threeQuality;

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let cleanup = () => {};

    void import("three").then((THREE) => {
      if (disposed || !canvas) return;

      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
      } catch {
        return; // WebGL unavailable — CSS mesh remains.
      }

      const dprCap = pixelRatioCap(quality);
      const setDpr = () => renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
      setDpr();
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();
      const camera = new THREE.Camera(); // vertex shader writes clip-space directly

      const uniforms = {
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uPointer: { value: new THREE.Vector2(0.5, 0.5) },
        uColorA: { value: new THREE.Vector3() },
        uColorB: { value: new THREE.Vector3() },
        uColorC: { value: new THREE.Vector3() },
        uBase: { value: new THREE.Vector3() },
        uAlpha: { value: 0.9 },
      };
      applyPalette(themeRef.current, uniforms);

      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      });
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
      scene.add(quad);

      const resize = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        setDpr();
        renderer.setSize(w, h, false);
        uniforms.uRes.value.set(w, h);
      };
      resize();
      window.addEventListener("resize", resize, { passive: true });

      // Pointer parallax — a subtle light that follows the cursor (screen space).
      const target = new THREE.Vector2(0.5, 0.5);
      const current = new THREE.Vector2(0.5, 0.5);
      const onMove = (e: MouseEvent) => {
        target.set(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight);
      };
      window.addEventListener("mousemove", onMove, { passive: true });

      let raf = 0;
      let running = true;
      let lastTheme = themeRef.current;
      const start = performance.now();

      const loop = () => {
        if (!running) return;
        const now = performance.now();
        uniforms.uTime.value = (now - start) / 1000;
        current.lerp(target, 0.045);
        uniforms.uPointer.value.copy(current);
        // Cheap theme-change detection without re-initialising the renderer.
        if (themeRef.current !== lastTheme) {
          lastTheme = themeRef.current;
          applyPalette(lastTheme, uniforms);
        }
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      const onVisibility = () => {
        if (document.hidden) {
          running = false;
          cancelAnimationFrame(raf);
        } else if (!running) {
          running = true;
          raf = requestAnimationFrame(loop);
        }
      };
      document.addEventListener("visibilitychange", onVisibility);

      cleanup = () => {
        running = false;
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", resize);
        window.removeEventListener("mousemove", onMove);
        document.removeEventListener("visibilitychange", onVisibility);
        quad.geometry.dispose();
        material.dispose();
        renderer.dispose();
      };
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [active, quality]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full no-print"
    />
  );
}

/* ------------------------------------------------------------------ */

function pixelRatioCap(quality: ThreeQuality): number {
  switch (quality) {
    case "baja":
      return 0.75;
    case "media":
      return 1;
    case "alta":
      return 2;
    default:
      return 1.5; // auto — a balanced default for crisp yet cheap rendering
  }
}

type Uniforms = {
  uColorA: { value: { set: (x: number, y: number, z: number) => void } };
  uColorB: { value: { set: (x: number, y: number, z: number) => void } };
  uColorC: { value: { set: (x: number, y: number, z: number) => void } };
  uBase: { value: { set: (x: number, y: number, z: number) => void } };
  uAlpha: { value: number };
};

function rgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/** Load the corporate palette for the given theme into the shader uniforms. */
function applyPalette(theme: "dark" | "light", u: Uniforms) {
  if (theme === "light") {
    u.uBase.value.set(...rgb(0xeaf1fb));
    u.uColorA.value.set(...rgb(0xbfd9f5));
    u.uColorB.value.set(...rgb(0x8fd3ec));
    u.uColorC.value.set(...rgb(0xafd0f2));
    u.uAlpha.value = 0.72;
  } else {
    u.uBase.value.set(...rgb(0x04122a));
    u.uColorA.value.set(...rgb(0x005baa));
    u.uColorB.value.set(...rgb(0x00b0d8));
    u.uColorC.value.set(...rgb(0x0090c5));
    u.uAlpha.value = 0.92;
  }
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uRes;
  uniform vec2 uPointer;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform vec3 uBase;
  uniform float uAlpha;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 aspect = vec2(uRes.x / max(uRes.y, 1.0), 1.0);
    vec2 p = vUv * aspect * 1.4;
    float t = uTime * 0.05;

    // Domain warping for an organic, liquid flow.
    vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, -t)));
    vec2 r = vec2(
      fbm(p + 4.0 * q + vec2(1.7, 9.2) + t * 0.5),
      fbm(p + 4.0 * q + vec2(8.3, 2.8) - t * 0.5)
    );
    float f = fbm(p + 4.0 * r);

    vec3 col = mix(uColorA, uColorB, clamp(f * f * 1.7, 0.0, 1.0));
    col = mix(col, uColorC, clamp(length(r) * 0.6, 0.0, 1.0));
    col = mix(uBase, col, 0.82);

    // A soft light that trails the cursor, echoing the CSS spotlight.
    float d = distance(vUv * aspect, uPointer * aspect);
    col += uColorC * smoothstep(0.55, 0.0, d) * 0.12;

    // Gentle vignette to keep the edges calm and text legible.
    float vig = smoothstep(1.25, 0.25, length(vUv - 0.5));
    col *= 0.86 + 0.14 * vig;

    gl_FragColor = vec4(col, uAlpha);
  }
`;
