import { useEffect, useRef } from "react";
import { useTheme } from "../context/ThemeContext";
import { useConfig, type ThreeQuality } from "../lib/configStore";

/** Densidad de píxeles mínima a la que puede bajar el ajuste automático. */
const MIN_DPR = 0.5;
/** Fotogramas que se promedian antes de decidir si hay que aligerar. */
const MUESTRAS_RENDIMIENTO = 90;
/** Duración de la onda que deja un clic, en segundos. */
const VIDA_ONDA = 2.6;

/**
 * El motor visual Three.js: una capa WebGL optimizada que lleva la estética
 * Liquid Glass a una profundidad real.
 *
 * Objetivos, en orden:
 *   1. **Rendimiento primero.** Un único cuadro a pantalla completa (una sola
 *      llamada de dibujo) pinta un flujo «líquido» con deformación de dominio
 *      y dos cortinas de aurora. El coste es solo de relleno, así que:
 *        · la densidad de píxeles tiene un tope por calidad (más bajo que
 *          antes: el fondo es difuso y no gana nada con más resolución);
 *        · si los fotogramas reales tardan más de la cuenta, la resolución
 *          baja sola (×0.8 cada vez, hasta un mínimo) — se adapta al equipo;
 *        · en calidad «baja» se dibuja a 30 fps;
 *        · el bucle se detiene con la pestaña oculta y Three.js se carga
 *          aparte (import dinámico) para no pesar en la primera carga.
 *   2. **Fiel al tema.** Los colores salen de la paleta corporativa de cada
 *      tema: un Midnight profundo en oscuro y un Daylight aireado en claro.
 *   3. **Vivo pero sobrio.** Una luz suave sigue al puntero y cada clic deja
 *      una onda que se expande y se apaga.
 *   4. **Elegante al fallar.** Sin WebGL, con el motor apagado en
 *      Configuración o con movimiento reducido no pinta nada y queda el fondo
 *      aurora en CSS ({@link ./MeshBackground}). El lienzo aparece con un
 *      fundido solo cuando ya pintó su primer fotograma.
 */
export function ThreeBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const config = useConfig();
  // El bucle de dibujo vive mucho: lee el tema vigente desde aquí.
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
    const raiz = document.documentElement;

    let disposed = false;
    let cleanup = () => {};

    void import("three").then((THREE) => {
      if (disposed) return;

      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: false,
          alpha: true,
          depth: false,
          stencil: false,
          powerPreference: "high-performance",
        });
      } catch {
        return; // Sin WebGL: queda el fondo aurora en CSS.
      }

      const tope = pixelRatioCap(quality);
      let escala = 1;
      const aplicarDpr = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, tope) * escala;
        renderer.setPixelRatio(Math.max(MIN_DPR, dpr));
      };
      aplicarDpr();
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();
      const camera = new THREE.Camera(); // el vertex shader escribe en clip-space

      const uniforms = {
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uPointer: { value: new THREE.Vector2(0.5, 0.5) },
        // x, y = origen de la onda (0..1); z = edad en segundos (-1 = inactiva).
        uRipple: { value: new THREE.Vector3(0.5, 0.5, -1) },
        uColorA: { value: new THREE.Vector3() },
        uColorB: { value: new THREE.Vector3() },
        uColorC: { value: new THREE.Vector3() },
        uColorD: { value: new THREE.Vector3() },
        uBase: { value: new THREE.Vector3() },
        uAlpha: { value: 0.9 },
        uGlow: { value: 0.3 },
      };
      applyPalette(themeRef.current, uniforms);

      const geometry = new THREE.PlaneGeometry(2, 2);
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      });
      const quad = new THREE.Mesh(geometry, material);
      quad.frustumCulled = false;
      scene.add(quad);

      const resize = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        aplicarDpr();
        renderer.setSize(w, h, false);
        uniforms.uRes.value.set(w, h);
      };
      resize();
      window.addEventListener("resize", resize, { passive: true });

      // Luz que sigue al puntero y onda en cada clic (coordenadas de pantalla).
      const objetivo = new THREE.Vector2(0.5, 0.5);
      const actual = new THREE.Vector2(0.5, 0.5);
      const onMove = (e: PointerEvent) => {
        objetivo.set(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight);
      };
      const onDown = (e: PointerEvent) => {
        uniforms.uRipple.value.set(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight, 0);
      };
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });

      let raf = 0;
      let running = false;
      let perdido = false;
      let pintado = false;
      let lastTheme = themeRef.current;
      let ultimo = 0;
      let tiempo = 0;
      let acumulado = 0;
      let muestras = 0;
      // Presupuesto por fotograma: 60 fps, o 30 fps en calidad baja.
      const presupuesto = quality === "baja" ? 1000 / 30 : 1000 / 60;
      const intervaloMinimo = quality === "baja" ? 1000 / 30 - 2 : 0;

      const loop = (ahora: number) => {
        if (!running) return;
        raf = requestAnimationFrame(loop);
        if (ultimo === 0) ultimo = ahora;
        const delta = ahora - ultimo;
        if (intervaloMinimo > 0 && delta < intervaloMinimo) return;
        ultimo = ahora;

        const dt = Math.min(delta, 100) / 1000;
        tiempo += dt;
        uniforms.uTime.value = tiempo;
        // Seguimiento suave e independiente de la frecuencia de refresco.
        actual.lerp(objetivo, 1 - Math.pow(1 - 0.045, delta / (1000 / 60)));
        uniforms.uPointer.value.copy(actual);

        const onda = uniforms.uRipple.value;
        if (onda.z >= 0) {
          onda.z += dt;
          if (onda.z > VIDA_ONDA) onda.z = -1;
        }

        // Cambio de tema sin reiniciar el renderizador.
        if (themeRef.current !== lastTheme) {
          lastTheme = themeRef.current;
          applyPalette(lastTheme, uniforms);
        }

        renderer.render(scene, camera);

        if (!pintado) {
          pintado = true;
          canvas.style.opacity = "1";
          raiz.setAttribute("data-webgl", "");
        }

        // Ajuste automático: si el equipo no llega, menos píxeles.
        if (delta > 0 && delta < 250) {
          acumulado += delta;
          muestras += 1;
          if (muestras >= MUESTRAS_RENDIMIENTO) {
            const media = acumulado / muestras;
            acumulado = 0;
            muestras = 0;
            if (media > presupuesto * 1.4 && escala > MIN_DPR) {
              escala = Math.max(MIN_DPR, escala * 0.8);
              resize();
            }
          }
        }
      };

      const start = () => {
        if (running || perdido) return;
        running = true;
        ultimo = 0;
        acumulado = 0;
        muestras = 0;
        raf = requestAnimationFrame(loop);
      };
      const stop = () => {
        running = false;
        cancelAnimationFrame(raf);
      };

      const onVisibility = () => {
        if (document.hidden) stop();
        else start();
      };
      document.addEventListener("visibilitychange", onVisibility);

      // Un contexto WebGL de larga vida puede perderse (pestaña aparcada,
      // suspensión). Se detiene el bucle limpiamente, el lienzo se desvanece y
      // el fondo CSS vuelve a animarse; si el contexto vuelve, se reanuda.
      const onContextLost = (e: Event) => {
        e.preventDefault();
        perdido = true;
        stop();
        pintado = false;
        canvas.style.opacity = "0";
        raiz.removeAttribute("data-webgl");
      };
      const onContextRestored = () => {
        perdido = false;
        pintado = false;
        if (!document.hidden) start();
      };
      canvas.addEventListener("webglcontextlost", onContextLost, false);
      canvas.addEventListener("webglcontextrestored", onContextRestored, false);

      if (!document.hidden) start();

      cleanup = () => {
        stop();
        window.removeEventListener("resize", resize);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerdown", onDown);
        document.removeEventListener("visibilitychange", onVisibility);
        canvas.removeEventListener("webglcontextlost", onContextLost, false);
        canvas.removeEventListener("webglcontextrestored", onContextRestored, false);
        raiz.removeAttribute("data-webgl");
        canvas.style.opacity = "";
        geometry.dispose();
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
      className="three-canvas pointer-events-none fixed inset-0 -z-10 h-full w-full no-print"
    />
  );
}

/* ------------------------------------------------------------------ */

/** Tope de densidad de píxeles por calidad. */
function pixelRatioCap(quality: ThreeQuality): number {
  switch (quality) {
    case "baja":
      return 0.6;
    case "media":
      return 0.85;
    case "alta":
      return 1.5;
    default:
      return 1.1; // auto: el fondo es difuso; más resolución no se aprecia
  }
}

type Vec3Uniform = { value: { set: (x: number, y: number, z: number) => unknown } };

type Uniforms = {
  uColorA: Vec3Uniform;
  uColorB: Vec3Uniform;
  uColorC: Vec3Uniform;
  uColorD: Vec3Uniform;
  uBase: Vec3Uniform;
  uAlpha: { value: number };
  uGlow: { value: number };
};

function rgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/** Carga la paleta corporativa del tema en los uniforms del shader. */
function applyPalette(theme: "dark" | "light", u: Uniforms) {
  if (theme === "light") {
    u.uBase.value.set(...rgb(0xeaf1fb));
    u.uColorA.value.set(...rgb(0xbfd9f5));
    u.uColorB.value.set(...rgb(0x8fd3ec));
    u.uColorC.value.set(...rgb(0xafd0f2));
    u.uColorD.value.set(...rgb(0x9ec5ff));
    u.uAlpha.value = 0.72;
    u.uGlow.value = 0.18;
  } else {
    u.uBase.value.set(...rgb(0x04122a));
    u.uColorA.value.set(...rgb(0x005baa));
    u.uColorB.value.set(...rgb(0x00b0d8));
    u.uColorC.value.set(...rgb(0x0090c5));
    u.uColorD.value.set(...rgb(0x4f7cff));
    u.uAlpha.value = 0.92;
    u.uGlow.value = 0.34;
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
  uniform vec3 uRipple;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform vec3 uColorD;
  uniform vec3 uBase;
  uniform float uAlpha;
  uniform float uGlow;

  // Rotación entre octavas: rompe la rejilla del ruido.
  const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);

  // Hash sin seno: estable en GPUs móviles de precisión media.
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

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
    vec2 uv = vUv;
    vec2 p = uv * aspect * 1.35;
    float t = uTime * 0.045;

    // Onda del último clic: un anillo que crece, deforma el líquido y se apaga.
    float luzOnda = 0.0;
    if (uRipple.z >= 0.0) {
      vec2 haciaOnda = (uv - uRipple.xy) * aspect;
      float anillo = length(haciaOnda) - uRipple.z * 0.55;
      float fuerza = exp(-anillo * anillo * 160.0) * exp(-uRipple.z * 1.8);
      p += normalize(haciaOnda + 1e-5) * fuerza * 0.06;
      luzOnda = fuerza;
    }

    // Deformación de dominio en dos niveles: flujo orgánico, líquido.
    vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, -t)));
    vec2 r = vec2(
      fbm(p + 3.6 * q + vec2(1.7, 9.2) + t * 0.6),
      fbm(p + 3.6 * q + vec2(8.3, 2.8) - t * 0.4)
    );
    float f = fbm(p + 3.2 * r);

    vec3 col = mix(uColorA, uColorB, clamp(f * f * 1.8, 0.0, 1.0));
    col = mix(col, uColorC, clamp(length(q) * 0.55, 0.0, 1.0));
    col = mix(col, uColorD, clamp(r.y * r.y * 0.9, 0.0, 1.0) * 0.55);

    // Dos cortinas de aurora que ondulan en la mitad superior.
    float w1 = noise(vec2(p.x * 0.9 + t * 1.6, t * 0.7)) * 0.22;
    float y1 = uv.y - 0.7 - w1;
    float banda1 = exp(-y1 * y1 * 70.0);
    float w2 = noise(vec2(p.x * 1.3 - t * 1.2, 3.1 + t * 0.5)) * 0.18;
    float y2 = uv.y - 0.36 - w2;
    float banda2 = exp(-y2 * y2 * 120.0);
    float cortina = 0.65 + 0.35 * sin(p.x * 34.0 + t * 9.0 + f * 6.0);
    col += uColorB * banda1 * cortina * uGlow;
    col += uColorD * banda2 * (0.6 + 0.4 * cortina) * uGlow * 0.6;

    col = mix(uBase, col, 0.84);

    // Destellos dispersos, como polvo de luz dentro del líquido.
    float destello = smoothstep(0.84, 0.99, noise(p * 8.0 + t * 3.0));
    col += vec3(destello * destello) * 0.06 * uGlow;

    // Luz suave que sigue al puntero (eco del foco CSS).
    float dp = distance(uv * aspect, uPointer * aspect);
    col += uColorC * (1.0 - smoothstep(0.0, 0.6, dp)) * 0.12;

    // Brillo del anillo de la onda.
    col += uColorB * luzOnda * 0.35;

    // Viñeta: bordes tranquilos y texto legible.
    float vig = 1.0 - smoothstep(0.25, 1.25, length(uv - 0.5));
    col *= 0.86 + 0.14 * vig;

    // Tramado mínimo contra las bandas de los degradados.
    col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), uAlpha);
  }
`;
