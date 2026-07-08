import { useEffect, useMemo, useRef } from "react";
import { FileText, Sparkles } from "lucide-react";
import type { Candidate } from "../../types";
import { academicLine, bdpRole, worksAtBdp } from "../../lib/candidateDisplay";
import { initials, avatarGradient } from "../../lib/candidates";
import { overallScore, profileScores } from "../../lib/profileData";
import { useConfig } from "../../lib/configStore";
import { useTheme } from "../../context/ThemeContext";
import { SectionCard } from "./parts";

/**
 * The "Currículum" tab — a 3D, animated résumé card.
 *
 * A lazy-loaded Three.js scene floats a glassy CV card (drawn to a canvas
 * texture) that tilts toward the pointer, with orbiting corporate-blue nodes
 * for depth. It is entirely optional: when WebGL is unavailable, the visual
 * engine is off, or the user prefers reduced motion, an elegant static résumé
 * renders in its place — which is also what prints.
 */
export function CurriculumTab({ candidate }: { candidate: Candidate }) {
  const config = useConfig();
  const { theme } = useTheme();
  const mountRef = useRef<HTMLDivElement>(null);

  const prefersReduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const enable3D = config.enableThree && !config.reduceMotion && !prefersReduced;

  // Stable snapshot of what the CV card should render.
  const cv = useMemo(
    () => ({
      name: candidate.fullName,
      role: worksAtBdp(candidate.trabaja_bdp)
        ? bdpRole(candidate.cargo_bdp) ?? "Personal BDP"
        : "Postulante externo",
      academic: academicLine(candidate.nivel_academico, candidate.carrera) ?? "Formación no especificada",
      score: overallScore(candidate),
      initials: initials(candidate.fullName),
    }),
    [candidate],
  );

  useEffect(() => {
    if (!enable3D) return;
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let cleanup = () => {};

    void import("three")
      .then((THREE) => {
        if (disposed || !mount) return;
        const width = mount.clientWidth || 640;
        const height = 380;

        let renderer: import("three").WebGLRenderer;
        try {
          renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        } catch {
          return; // WebGL unavailable — the static CV below remains.
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height);
        renderer.setClearColor(0x000000, 0);
        mount.appendChild(renderer.domElement);
        renderer.domElement.style.borderRadius = "1.25rem";

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
        camera.position.set(0, 0, 6.2);

        const group = new THREE.Group();
        scene.add(group);

        // --- CV card face, drawn to a canvas texture. -------------------
        const texCanvas = document.createElement("canvas");
        texCanvas.width = 768;
        texCanvas.height = 1024;
        drawCvCard(texCanvas, cv, theme);
        const texture = new THREE.CanvasTexture(texCanvas);
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.colorSpace = THREE.SRGBColorSpace;

        const cardGeo = new THREE.PlaneGeometry(3, 4, 1, 1);
        const cardMat = new THREE.MeshStandardMaterial({
          map: texture,
          metalness: 0.35,
          roughness: 0.35,
          transparent: true,
        });
        const card = new THREE.Mesh(cardGeo, cardMat);
        group.add(card);

        // A subtle glowing rim behind the card.
        const rimGeo = new THREE.PlaneGeometry(3.24, 4.24);
        const rimMat = new THREE.MeshBasicMaterial({ color: 0x00b0d8, transparent: true, opacity: 0.28 });
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.position.z = -0.06;
        group.add(rim);

        // --- Orbiting nodes for depth. ----------------------------------
        const nodes: import("three").Mesh[] = [];
        const nodeColors = [0x00b0d8, 0x005baa, 0x7dd3fc, 0x38bdf8, 0x0090c5];
        for (let i = 0; i < 14; i++) {
          const g = new THREE.SphereGeometry(0.045 + Math.random() * 0.05, 16, 16);
          const m = new THREE.MeshStandardMaterial({
            color: nodeColors[i % nodeColors.length],
            emissive: nodeColors[i % nodeColors.length],
            emissiveIntensity: 0.6,
            metalness: 0.4,
            roughness: 0.3,
          });
          const s = new THREE.Mesh(g, m);
          const angle = (i / 14) * Math.PI * 2;
          const radius = 2.4 + Math.random() * 1.1;
          s.userData = { angle, radius, speed: 0.15 + Math.random() * 0.25, y: (Math.random() - 0.5) * 3 };
          nodes.push(s);
          group.add(s);
        }

        const light = new THREE.DirectionalLight(0xffffff, 2.1);
        light.position.set(2.5, 3, 5);
        scene.add(light);
        scene.add(new THREE.AmbientLight(0x88bbff, 0.9));
        const rimLight = new THREE.PointLight(0x00b0d8, 1.4, 20);
        rimLight.position.set(-3, -1, 3);
        scene.add(rimLight);

        // --- Pointer parallax. ------------------------------------------
        const target = { x: 0, y: 0 };
        const onPointer = (e: PointerEvent) => {
          const r = renderer.domElement.getBoundingClientRect();
          target.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
          target.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
        };
        const onLeave = () => {
          target.x = 0;
          target.y = 0;
        };
        renderer.domElement.addEventListener("pointermove", onPointer);
        renderer.domElement.addEventListener("pointerleave", onLeave);

        let raf = 0;
        const clock = new THREE.Clock();
        let curX = 0;
        let curY = 0;
        const render = () => {
          if (disposed) return;
          const t = clock.getElapsedTime();
          curX += (target.x - curX) * 0.06;
          curY += (target.y - curY) * 0.06;
          group.rotation.y = curX * 0.5 + Math.sin(t * 0.3) * 0.12;
          group.rotation.x = -curY * 0.4 + Math.sin(t * 0.22) * 0.05;
          card.position.y = Math.sin(t * 0.8) * 0.06;
          nodes.forEach((n) => {
            const d = n.userData as { angle: number; radius: number; speed: number; y: number };
            const a = d.angle + t * d.speed;
            n.position.set(Math.cos(a) * d.radius, d.y * 0.5 + Math.sin(t * d.speed + d.angle) * 0.3, Math.sin(a) * d.radius - 0.5);
          });
          renderer.render(scene, camera);
          raf = requestAnimationFrame(render);
        };
        render();

        const onResize = () => {
          const w = mount.clientWidth || width;
          renderer.setSize(w, height);
          camera.aspect = w / height;
          camera.updateProjectionMatrix();
        };
        window.addEventListener("resize", onResize);

        const onVisibility = () => {
          if (document.hidden) cancelAnimationFrame(raf);
          else render();
        };
        document.addEventListener("visibilitychange", onVisibility);

        cleanup = () => {
          cancelAnimationFrame(raf);
          window.removeEventListener("resize", onResize);
          document.removeEventListener("visibilitychange", onVisibility);
          renderer.domElement.removeEventListener("pointermove", onPointer);
          renderer.domElement.removeEventListener("pointerleave", onLeave);
          texture.dispose();
          cardGeo.dispose();
          cardMat.dispose();
          rimGeo.dispose();
          rimMat.dispose();
          nodes.forEach((n) => {
            n.geometry.dispose();
            (n.material as import("three").Material).dispose();
          });
          renderer.dispose();
          if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
        };
      })
      .catch(() => {
        /* three failed to load — the static CV below remains. */
      });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [enable3D, cv, theme]);

  const scores = profileScores(candidate);

  return (
    <div className="space-y-4">
      <SectionCard
        icon={<FileText className="h-5 w-5" />}
        title="Currículum 3D"
        sub={enable3D ? "Mueva el cursor sobre la tarjeta para inclinarla" : "Vista estática (motor 3D desactivado)"}
      >
        {enable3D ? (
          <div
            ref={mountRef}
            className="relative grid min-h-[380px] w-full place-items-center overflow-hidden rounded-3xl bg-gradient-to-br from-[#04122a]/40 to-[#005baa]/10"
            aria-label={`Currículum tridimensional de ${candidate.fullName}`}
          />
        ) : (
          <StaticCv candidate={candidate} />
        )}
      </SectionCard>

      {/* A print-friendly résumé always renders below the 3D scene. */}
      <SectionCard title="Resumen del currículum" sub="Versión imprimible">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div
            className={`grid h-20 w-20 shrink-0 place-items-center rounded-3xl bg-gradient-to-br ${avatarGradient(
              candidate.id,
            )} text-2xl font-black text-white shadow-glass ring-2 ring-white/40`}
          >
            {cv.initials}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="wrap-words text-xl font-black text-ink">{candidate.fullName}</h4>
            <p className="text-sm font-semibold text-cyan-400">{cv.role}</p>
            <p className="text-sm text-ink-soft">{cv.academic}</p>
          </div>
          {cv.score !== null && (
            <div className="rounded-2xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-4 py-3 text-center text-white shadow-glass ring-1 ring-white/30">
              <div className="text-2xl font-black leading-none">{cv.score}%</div>
              <div className="text-[0.6rem] font-bold uppercase tracking-wide opacity-80">Puntaje general</div>
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {scores.map((s) => (
            <div key={s.key} className="rounded-2xl fill-soft px-3 py-2 text-center ring-1 ring-[color:var(--hairline)]">
              <div className="text-lg font-black text-ink">{s.value === null ? "—" : `${s.value}%`}</div>
              <div className="text-[0.6rem] uppercase tracking-wide text-ink-faint">{s.label}</div>
            </div>
          ))}
        </div>

        {candidate.competenciasList.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {candidate.competenciasList.map((c) => (
              <span
                key={c.name}
                className="inline-flex items-center gap-1 rounded-full fill-softer px-2.5 py-1 text-xs font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)]"
              >
                <Sparkles className="h-3 w-3 text-cyan-400" />
                {c.name}
                {c.ajuste !== null && <span className="font-black text-ink">{c.ajuste}%</span>}
              </span>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/** A refined static résumé used as the fallback when 3D is unavailable. */
function StaticCv({ candidate }: { candidate: Candidate }) {
  return (
    <div className="grid min-h-[300px] place-items-center rounded-3xl bg-gradient-to-br from-[#004a8f] via-[#005baa] to-[#00b0d8] p-8 text-center text-white shadow-glass ring-1 ring-white/30">
      <div>
        <div className="mx-auto grid h-24 w-24 place-items-center rounded-3xl bg-white/15 text-3xl font-black ring-1 ring-white/40 backdrop-blur">
          {initials(candidate.fullName)}
        </div>
        <h4 className="mt-4 wrap-words text-2xl font-black drop-shadow">{candidate.fullName}</h4>
        <p className="mt-1 text-sm font-semibold text-cyan-100">
          {academicLine(candidate.nivel_academico, candidate.carrera) ?? "Formación no especificada"}
        </p>
      </div>
    </div>
  );
}

/** Paint the CV card face onto a 2D canvas for the Three.js texture. */
function drawCvCard(
  canvas: HTMLCanvasElement,
  cv: { name: string; role: string; academic: string; score: number | null; initials: string },
  theme: string,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;

  // Background gradient.
  const grad = ctx.createLinearGradient(0, 0, w, h);
  if (theme === "light") {
    grad.addColorStop(0, "#f4f9ff");
    grad.addColorStop(1, "#dcebff");
  } else {
    grad.addColorStop(0, "#0a2747");
    grad.addColorStop(1, "#04122a");
  }
  ctx.fillStyle = grad;
  roundRect(ctx, 0, 0, w, h, 60);
  ctx.fill();

  const ink = theme === "light" ? "#0a2747" : "#f8fafc";
  const soft = theme === "light" ? "rgba(13,47,84,0.7)" : "rgba(226,232,240,0.75)";

  // Header band.
  const band = ctx.createLinearGradient(0, 0, w, 0);
  band.addColorStop(0, "#00b0d8");
  band.addColorStop(1, "#005baa");
  ctx.fillStyle = band;
  roundRect(ctx, 0, 0, w, 260, 60);
  ctx.fill();
  ctx.fillStyle = band;
  ctx.fillRect(0, 180, w, 80);

  // Avatar circle.
  ctx.beginPath();
  ctx.arc(w / 2, 200, 96, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 76px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(cv.initials, w / 2, 204);

  // Name + role.
  ctx.fillStyle = ink;
  ctx.font = "900 56px Inter, sans-serif";
  wrapText(ctx, cv.name.toUpperCase(), w / 2, 360, w - 120, 62);
  ctx.fillStyle = "#00b0d8";
  ctx.font = "700 34px Inter, sans-serif";
  ctx.fillText(cv.role, w / 2, 500);
  ctx.fillStyle = soft;
  ctx.font = "500 30px Inter, sans-serif";
  wrapText(ctx, cv.academic, w / 2, 560, w - 140, 40);

  // Score ring.
  if (cv.score !== null) {
    const cx = w / 2;
    const cy = 780;
    const r = 120;
    ctx.lineWidth = 26;
    ctx.strokeStyle = theme === "light" ? "rgba(8,47,95,0.12)" : "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#00b0d8";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (cv.score / 100) * Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.font = "900 64px Inter, sans-serif";
    ctx.fillText(`${cv.score}%`, cx, cy + 4);
    ctx.fillStyle = soft;
    ctx.font = "700 24px Inter, sans-serif";
    ctx.fillText("PUNTAJE GENERAL", cx, cy + 60);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, yy);
}
