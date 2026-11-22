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
 *
 *      Liquid Glass 2: el campo es un difuminado suave, así que se dibuja a menor
 *      resolución (el navegador lo escala sin que se note) y con un tope de
 *      fotogramas — 60 por segundo, 30 en calidad «baja» —. En pantallas de
 *      120/144 Hz eso evita dibujar el doble de veces lo mismo.
 *   2. **Theme-true.** Colours are pulled from the corporate palette per theme,
 *      so it reads as a deep Midnight in dark mode and an airy Daylight in light
 *      mode — always sober and corporate. Al cambiar de tema la paleta se funde
 *      en unos cientos de milisegundos en lugar de saltar de golpe.
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
      // La paleta visible se acerca a la del tema en cada fotograma.
      const paleta = copiarPaleta(palettes[themeRef.current]);
      applyPalette(paleta, uniforms);

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

      // A long-lived WebGL context can be dropped by the OS/GPU (tab parked for
      // a long time, device sleep). If we don't intercept the event the tab can
      // wedge; we stop the loop cleanly and let the CSS mesh cover for us.
      const onContextLost = (e: Event) => {
        e.preventDefault();
        running = false;
        cancelAnimationFrame(raf);
      };
      const onContextRestored = () => {
        if (!running) {
          running = true;
          last = 0;
          raf = requestAnimationFrame(loop);
        }
      };
      canvas.addEventListener("webglcontextlost", onContextLost, false);
      canvas.addEventListener("webglcontextrestored", onContextRestored, false);

      // Pointer parallax — a subtle light that follows the cursor (screen space).
      const target = new THREE.Vector2(0.5, 0.5);
      const current = new THREE.Vector2(0.5, 0.5);
      const onMove = (e: MouseEvent) => {
        target.set(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight);
      };
      window.addEventListener("mousemove", onMove, { passive: true });

      let raf = 0;
      let running = true;
      const start = performance.now();
      // Tope de fotogramas con holgura: a 60 Hz se dibujan todos; a 120/144 Hz,
      // uno de cada dos. En calidad «baja», unos 30 por segundo.
      const minDt = quality === "baja" ? 1000 / 40 : 1000 / 75;
      let last = 0;

      const loop = (now: number) => {
        if (!running) return;
        raf = requestAnimationFrame(loop);
        // El primer fotograma se dibuja siempre; después, como mucho uno por
        // cada `minDt` milisegundos.
        if (last !== 0 && now - last < minDt) return;
        const dt = last === 0 ? 16.7 : now - last;
        last = now;
        // Factor de suavizado independiente de los fotogramas por segundo.
        const paso = Math.min(dt, 100) / 16.7;
        uniforms.uTime.value = (now - start) / 1000;
        current.lerp(target, 1 - Math.pow(1 - 0.045, paso));
        uniforms.uPointer.value.copy(current);
        // Cheap theme-change handling without re-initialising the renderer:
        // the palette glides towards the new theme.
        if (mezclarPaleta(paleta, palettes[themeRef.current], 1 - Math.pow(1 - 0.14, paso))) {
          applyPalette(paleta, uniforms);
        }
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(loop);

      const onVisibility = () => {
        if (document.hidden) {
          running = false;
          cancelAnimationFrame(raf);
        } else if (!running) {
          running = true;
          last = 0;
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
        canvas.removeEventListener("webglcontextlost", onContextLost, false);
        canvas.removeEventListener("webglcontextrestored", onContextRestored, false);
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

/**
 * Tope de resolución del lienzo. El campo es un difuminado sin bordes, así que
 * dibujarlo a menos píxeles y dejar que el navegador lo escale no se distingue
 * y reduce el trabajo de la GPU a la mitad o menos.
 */
function pixelRatioCap(quality: ThreeQuality): number {
  switch (quality) {
    case "baja":
      return 0.5;
    case "media":
      return 0.75;
    case "alta":
      return 1.5;
    default:
      return 1; // auto — a balanced default for crisp yet cheap rendering
  }
}

type Uniforms = {
  uColorA: { value: { set: (x: number, y: number, z: number) => void } };
  uColorB: { value: { set: (x: number, y: number, z: number) => void } };
  uColorC: { value: { set: (x: number, y: number, z: number) => void } };
  uBase: { value: { set: (x: number, y: number, z: number) => void } };
  uAlpha: { value: number };
};

type Rgb = [number, number, number];

type Palette = { base: Rgb; a: Rgb; b: Rgb; c: Rgb; alpha: number };

function rgb(hex: number): Rgb {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/** The corporate palette per theme. */
const palettes: Record<"dark" | "light", Palette> = {
  light: {
    base: rgb(0xeaf1fb),
    a: rgb(0xbfd9f5),
    b: rgb(0x8fd3ec),
    c: rgb(0xafd0f2),
    alpha: 0.72,
  },
  dark: {
    base: rgb(0x04122a),
    a: rgb(0x005baa),
    b: rgb(0x00b0d8),
    c: rgb(0x0090c5),
    alpha: 0.92,
  },
};

const COLOR_KEYS = ["base", "a", "b", "c"] as const;

function copiarPaleta(p: Palette): Palette {
  const copia = (c: Rgb): Rgb => [c[0], c[1], c[2]];
  return { base: copia(p.base), a: copia(p.a), b: copia(p.b), c: copia(p.c), alpha: p.alpha };
}

/**
 * Acerca `actual` a `destino` una fracción `k`. Devuelve `false` cuando ya
 * coinciden, para no volver a subir los mismos valores a la GPU.
 */
function mezclarPaleta(actual: Palette, destino: Palette, k: number): boolean {
  let cambio = Math.abs(destino.alpha - actual.alpha) > 0.001;
  actual.alpha = cambio ? actual.alpha + (destino.alpha - actual.alpha) * k : destino.alpha;
  for (const clave of COLOR_KEYS) {
    const de = actual[clave];
    const a = destino[clave];
    for (let i = 0; i < 3; i++) {
      const diferencia = a[i] - de[i];
      if (Math.abs(diferencia) > 0.001) {
        de[i] += diferencia * k;
        cambio = true;
      } else {
        de[i] = a[i];
      }
    }
  }
  return cambio;
}

/** Load a palette into the shader uniforms. */
function applyPalette(p: Palette, u: Uniforms) {
  u.uBase.value.set(...p.base);
  u.uColorA.value.set(...p.a);
  u.uColorB.value.set(...p.b);
  u.uColorC.value.set(...p.c);
  u.uAlpha.value = p.alpha;
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

  // Rotating every octave hides the axis-aligned grid of value noise.
  const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = ROT * p * 2.02;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 aspect = vec2(uRes.x / max(uRes.y, 1.0), 1.0);
    vec2 uv = vUv * aspect;
    vec2 toP = uv - uPointer * aspect;
    float pd = length(toP);

    // Liquid lens: the flow bulges gently around the cursor, like a drop of
    // water resting on the glass.
    float lens = exp(-pd * pd * 9.0);
    vec2 p = uv * 1.4 - toP * lens * 0.22;
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

    // Light on the crests where the flow folds, plus thin filaments, like the
    // caustics cast by water.
    float crest = smoothstep(0.6, 0.85, f);
    float filament = 1.0 - smoothstep(0.0, 0.03, abs(f - 0.56));
    col += uColorB * (crest * 0.07 + filament * 0.045);

    // A soft light that trails the cursor, echoing the CSS spotlight, and the
    // brighter core of the lens.
    col += uColorC * smoothstep(0.55, 0.0, pd) * 0.10;
    col += uColorB * lens * 0.06;

    // Gentle vignette to keep the edges calm and text legible.
    float vig = smoothstep(1.25, 0.25, length(vUv - 0.5));
    col *= 0.86 + 0.14 * vig;

    // Half-level dithering: removes banding from the slow gradients.
    col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;

    gl_FragColor = vec4(col, uAlpha);
  }
`;
