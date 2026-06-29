import { useEffect, useRef, useState } from "react";

interface GaugeInputProps {
  label: string;
  /** Short helper shown under the label. */
  hint?: string;
  /** 0..100, or null when unset. */
  value: number | null;
  onChange: (value: number) => void;
}

const R = 78;
const CX = 100;
const CY = 100;
const STROKE = 16;

/** Describe the SVG arc path from value `a` to value `b` along the dial. */
function arcPath(a: number, b: number): string {
  const ang = (v: number) => Math.PI - (Math.PI * v) / 100; // π (v=0) → 0 (v=100)
  const p = (v: number) => ({
    x: CX + R * Math.cos(ang(v)),
    y: CY - R * Math.sin(ang(v)),
  });
  const start = p(a);
  const end = p(b);
  const large = b - a > 50 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${R} ${R} 0 ${large} 1 ${end.x} ${end.y}`;
}

function bandColor(v: number | null): { stroke: string; text: string } {
  if (v === null) return { stroke: "#64748b", text: "text-ink-soft" };
  if (v <= 50) return { stroke: "#f43f5e", text: "text-rose-400" };
  if (v <= 75) return { stroke: "#f59e0b", text: "text-amber-400" };
  return { stroke: "#10b981", text: "text-emerald-400" };
}

/**
 * An analog "speedometer" dial used to capture an evaluation score (0–100 %).
 *
 *   · Drag the needle (or click anywhere on the arc) to set the value.
 *   · Click the percentage in the centre to type an exact figure.
 *   · Arrow keys nudge the value when the dial is focused.
 */
export function GaugeInput({ label, hint, value, onChange }: GaugeInputProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const dragging = useRef(false);
  const v = value ?? 0;
  const { stroke, text } = bandColor(value);

  const needle = (() => {
    const ang = Math.PI - (Math.PI * v) / 100;
    return { x: CX + (R - 2) * Math.cos(ang), y: CY - (R - 2) * Math.sin(ang) };
  })();

  function valueFromEvent(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // Map screen point into the 200×120 viewBox coordinate space.
    const px = ((clientX - rect.left) / rect.width) * 200;
    const py = ((clientY - rect.top) / rect.height) * 120;
    let angle = Math.atan2(CY - py, px - CX); // radians, 0 = right, π = left
    // Below the dial's baseline: snap to the nearest end instead of wrapping.
    if (angle < 0) angle = px < CX ? Math.PI : 0;
    angle = Math.max(0, Math.min(Math.PI, angle));
    const next = Math.round(((Math.PI - angle) / Math.PI) * 100);
    onChange(Math.max(0, Math.min(100, next)));
  }

  useEffect(() => {
    function move(e: PointerEvent) {
      if (!dragging.current) return;
      valueFromEvent(e.clientX, e.clientY);
    }
    function up() {
      dragging.current = false;
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commitDraft() {
    const n = Number.parseInt(draft.replace(/[^0-9]/g, ""), 10);
    if (Number.isFinite(n)) onChange(Math.max(0, Math.min(100, n)));
    setEditing(false);
  }

  return (
    <div className="glass glow flex flex-col items-center rounded-2xl p-4 print-avoid-break">
      <div className="mb-1 text-center">
        <div className="text-xs font-bold uppercase tracking-wide text-ink">
          {label}
        </div>
        {hint && <div className="text-[0.65rem] text-ink-faint">{hint}</div>}
      </div>

      <div
        className="relative w-full max-w-[12rem] select-none"
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? 0}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            onChange(Math.min(100, v + 1));
          } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            onChange(Math.max(0, v - 1));
          }
        }}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 200 120"
          className="w-full cursor-pointer touch-none"
          onPointerDown={(e) => {
            dragging.current = true;
            (e.target as Element).setPointerCapture?.(e.pointerId);
            valueFromEvent(e.clientX, e.clientY);
          }}
        >
          {/* Track */}
          <path
            d={arcPath(0, 100)}
            fill="none"
            stroke="rgba(120,140,170,0.35)"
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
          {/* Tick marks every 10% */}
          {Array.from({ length: 11 }).map((_, i) => {
            const ang = Math.PI - (Math.PI * (i * 10)) / 100;
            const r1 = R + STROKE / 2 + 2;
            const r2 = R + STROKE / 2 + (i % 5 === 0 ? 9 : 5);
            return (
              <line
                key={i}
                x1={CX + r1 * Math.cos(ang)}
                y1={CY - r1 * Math.sin(ang)}
                x2={CX + r2 * Math.cos(ang)}
                y2={CY - r2 * Math.sin(ang)}
                stroke="var(--ink-faint)"
                strokeWidth={i % 5 === 0 ? 1.6 : 0.9}
              />
            );
          })}
          {/* Progress */}
          {value !== null && v > 0 && (
            <path
              d={arcPath(0, v)}
              fill="none"
              stroke={stroke}
              strokeWidth={STROKE}
              strokeLinecap="round"
              style={{ transition: "stroke 0.3s ease" }}
            />
          )}
          {/* Needle */}
          <line
            x1={CX}
            y1={CY}
            x2={needle.x}
            y2={needle.y}
            stroke={stroke}
            strokeWidth={3.5}
            strokeLinecap="round"
          />
          <circle cx={CX} cy={CY} r={7} fill={stroke} />
          <circle cx={CX} cy={CY} r={3} fill="var(--app-base)" />
        </svg>

        {/* Centre read-out / manual entry */}
        <div className="absolute inset-x-0 bottom-1 flex justify-center">
          {editing ? (
            <input
              autoFocus
              value={draft}
              inputMode="numeric"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitDraft();
                if (e.key === "Escape") setEditing(false);
              }}
              className="w-16 rounded-lg bg-white/80 px-2 py-0.5 text-center text-lg font-black text-corp-ink outline-none ring-2 ring-cyan-400"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraft(value === null ? "" : String(value));
                setEditing(true);
              }}
              title="Clic para ingresar manualmente"
              className={`rounded-lg px-2 text-2xl font-black leading-none drop-shadow-md transition-transform hover:scale-110 ${text}`}
            >
              {value === null ? "—" : `${value}%`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
