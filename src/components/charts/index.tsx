import { useId } from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

/* ============================================================
   Liquid Glass chart kit — dependency-free SVG + Framer Motion.
   Every colour is corporate or theme-driven so the charts read
   well in both Midnight (dark) and Daylight (light) themes.
   ============================================================ */

export const CHART_PALETTE = [
  "#00b0d8",
  "#005baa",
  "#0090c5",
  "#004a8f",
  "#38bdf8",
  "#0e7490",
  "#6366f1",
  "#14b8a6",
];

/**
 * A high-contrast qualitative palette for multi-series comparisons (radar,
 * grouped bars). Unlike CHART_PALETTE — which is all corporate blues and blurs
 * together when overlaid — these hues stay distinct so each candidate reads
 * clearly against the others.
 */
export const SERIES_PALETTE = [
  "#00b0d8", // cyan
  "#f59e0b", // amber
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f43f5e", // rose
  "#8b5cf6", // violet
  "#0ea5e9", // sky
  "#14b8a6", // teal
];

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arc(cx: number, cy: number, r: number, start: number, end: number) {
  const s = polar(cx, cy, r, end);
  const e = polar(cx, cy, r, start);
  const large = end - start <= 180 ? 0 : 1;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`;
}

export interface Slice {
  label: string;
  value: number;
  color?: string;
}

/** Donut / pie with an animated sweep and an optional centre read-out. */
export function DonutChart({
  data,
  size = 180,
  thickness = 22,
  centerValue,
  centerLabel,
}: {
  data: Slice[];
  size?: number;
  thickness?: number;
  centerValue?: string;
  centerLabel?: string;
}) {
  const total = data.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  let acc = 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="max-w-full shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--hairline)" strokeWidth={thickness} />
        {data.map((s, i) => {
          const start = (acc / total) * 360;
          acc += s.value;
          const end = (acc / total) * 360;
          if (s.value <= 0) return null;
          const color = s.color ?? CHART_PALETTE[i % CHART_PALETTE.length];
          return (
            <motion.path
              key={s.label}
              d={arc(cx, cy, r, start, Math.max(start + 0.01, end - 1.2))}
              fill="none"
              stroke={color}
              strokeWidth={thickness}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.9, delay: 0.1 + i * 0.08, ease: "easeOut" }}
            />
          );
        })}
        {(centerValue || centerLabel) && (
          <g>
            <text x={cx} y={cy - 2} textAnchor="middle" className="fill-[color:var(--ink)]" style={{ fontSize: 26, fontWeight: 900 }}>
              {centerValue}
            </text>
            <text x={cx} y={cy + 16} textAnchor="middle" className="fill-[color:var(--ink-faint)]" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1 }}>
              {centerLabel}
            </text>
          </g>
        )}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color ?? CHART_PALETTE[i % CHART_PALETTE.length] }} />
            <span className="min-w-0 flex-1 truncate text-ink-soft">{s.label}</span>
            <span className="font-bold text-ink">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface Series {
  label: string;
  color?: string;
  /** One value per category, aligned by index. */
  values: number[];
}

/**
 * Grouped vertical bars — one cluster per category, one bar per series.
 * Perfect for the comparator: categories are the metrics (Nota CAP, Currículum…)
 * and each series is a candidate, so bars sit side by side for a direct read.
 */
export function GroupedBarChart({
  categories,
  series,
  height = 240,
  unit = "",
  max: maxProp,
}: {
  categories: string[];
  series: Series[];
  height?: number;
  unit?: string;
  max?: number;
}) {
  const max =
    maxProp ?? Math.max(1, ...series.flatMap((s) => s.values.map((v) => (Number.isFinite(v) ? v : 0))));
  const plot = height - 44;
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-end gap-4" style={{ height, minWidth: categories.length * Math.max(72, series.length * 26) }}>
        {categories.map((cat, ci) => (
          <div key={cat} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <div className="flex w-full items-end justify-center gap-1" style={{ height: plot }}>
              {series.map((s, si) => {
                const raw = s.values[ci];
                const v = Number.isFinite(raw) ? raw : 0;
                const h = (v / max) * plot;
                const color = s.color ?? CHART_PALETTE[si % CHART_PALETTE.length];
                return (
                  <motion.div
                    key={s.label}
                    className="group relative w-full max-w-[26px] rounded-t-md"
                    style={{ background: `linear-gradient(to top, ${color}, ${color}bb)` }}
                    initial={{ height: 0 }}
                    animate={{ height: Math.max(h, 2) }}
                    transition={{ type: "spring", stiffness: 130, damping: 18, delay: 0.04 * (ci + si) }}
                    title={`${s.label} · ${cat}: ${round(v)}${unit}`}
                  >
                    <span className="pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 text-[0.55rem] font-black text-ink opacity-0 transition-opacity group-hover:opacity-100">
                      {round(v)}
                    </span>
                  </motion.div>
                );
              })}
            </div>
            <span className="w-full truncate text-center text-[0.6rem] text-ink-faint" title={cat}>
              {cat}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * A radial "spider" chart. Each spoke is a metric and every candidate draws a
 * translucent polygon, so overlapping strengths and weaknesses jump out at a
 * glance. Dependency-free SVG with an animated, staggered draw.
 */
export function RadarChart({
  axes,
  series,
  size = 300,
  max = 100,
}: {
  axes: string[];
  series: Series[];
  size?: number;
  max?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 58;
  const n = axes.length;
  if (n < 3) {
    return (
      <p className="rounded-2xl border border-dashed border-[color:var(--hairline)] px-4 py-6 text-center text-sm text-ink-faint">
        Seleccione al menos 3 métricas para dibujar el radar.
      </p>
    );
  }

  const angle = (i: number) => (i / n) * 360 - 90;
  const point = (i: number, value: number) => {
    const rad = (angle(i) * Math.PI) / 180;
    const ratio = Math.max(0, Math.min(1, value / max));
    return { x: cx + r * ratio * Math.cos(rad), y: cy + r * ratio * Math.sin(rad) };
  };
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="max-w-full overflow-visible">
        {/* Grid rings */}
        {rings.map((t) => (
          <polygon
            key={t}
            points={axes
              .map((_, i) => {
                const rad = (angle(i) * Math.PI) / 180;
                return `${cx + r * t * Math.cos(rad)},${cy + r * t * Math.sin(rad)}`;
              })
              .join(" ")}
            fill="none"
            stroke="var(--hairline)"
            strokeWidth={1}
          />
        ))}
        {/* Spokes + labels */}
        {axes.map((label, i) => {
          const rad = (angle(i) * Math.PI) / 180;
          const ex = cx + r * Math.cos(rad);
          const ey = cy + r * Math.sin(rad);
          const lx = cx + (r + 14) * Math.cos(rad);
          const ly = cy + (r + 14) * Math.sin(rad);
          const anchor = Math.abs(Math.cos(rad)) < 0.35 ? "middle" : ex > cx ? "start" : "end";
          return (
            <g key={label}>
              <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="var(--hairline)" strokeWidth={1} />
              <text
                x={lx}
                y={ly}
                textAnchor={anchor}
                dominantBaseline="middle"
                className="fill-[color:var(--ink-soft)]"
                style={{ fontSize: 9, fontWeight: 700 }}
              >
                {label.length > 16 ? `${label.slice(0, 15)}…` : label}
              </text>
            </g>
          );
        })}
        {/* Series polygons */}
        {series.map((s, si) => {
          const color = s.color ?? CHART_PALETTE[si % CHART_PALETTE.length];
          const pts = axes.map((_, i) => point(i, s.values[i] ?? 0));
          const poly = pts.map((p) => `${p.x},${p.y}`).join(" ");
          return (
            <motion.g key={s.label} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 160, damping: 18, delay: 0.12 * si }} style={{ transformOrigin: `${cx}px ${cy}px` }}>
              <polygon points={poly} fill={color} fillOpacity={0.16} stroke={color} strokeWidth={2} strokeLinejoin="round" />
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={2.6} fill={color}>
                  <title>{`${s.label} · ${axes[i]}: ${round(s.values[i] ?? 0)}`}</title>
                </circle>
              ))}
            </motion.g>
          );
        })}
      </svg>
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {series.map((s, si) => (
          <li key={s.label} className="flex items-center gap-1.5 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color ?? CHART_PALETTE[si % CHART_PALETTE.length] }} />
            <span className="text-ink-soft">{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Vertical bars with a spring grow-in. */
export function BarChart({
  data,
  height = 180,
  unit = "",
}: {
  data: Slice[];
  height?: number;
  unit?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) => {
        const h = (d.value / max) * (height - 36);
        const color = d.color ?? CHART_PALETTE[i % CHART_PALETTE.length];
        return (
          <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs font-black text-ink">
              {d.value}
              {unit}
            </span>
            <motion.div
              className="w-full rounded-t-lg"
              style={{ background: `linear-gradient(to top, ${color}, ${color}aa)` }}
              initial={{ height: 0 }}
              animate={{ height: Math.max(h, 3) }}
              transition={{ type: "spring", stiffness: 120, damping: 18, delay: i * 0.05 }}
            />
            <span className="w-full truncate text-center text-[0.6rem] text-ink-faint">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export interface Point {
  label: string;
  value: number;
}

/** Smooth area + line chart with an animated draw and hover dots. */
export function AreaChart({
  data,
  height = 200,
  unit = "",
  color = "#00b0d8",
}: {
  data: Point[];
  height?: number;
  unit?: string;
  color?: string;
}) {
  const gid = useId();
  const w = 560;
  const h = height;
  const padX = 28;
  const padY = 26;
  const max = Math.max(...data.map((d) => d.value), 1);
  const min = Math.min(...data.map((d) => d.value), 0);
  const span = max - min || 1;
  const stepX = data.length > 1 ? (w - padX * 2) / (data.length - 1) : 0;
  const xy = data.map((d, i) => ({
    x: padX + i * stepX,
    y: padY + (1 - (d.value - min) / span) * (h - padY * 2),
  }));
  const line = xy.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const area = `${line} L ${xy[xy.length - 1]?.x ?? padX} ${h - padY} L ${xy[0]?.x ?? padX} ${h - padY} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: height }}>
      <defs>
        <linearGradient id={`grad-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((t) => (
        <line key={t} x1={padX} x2={w - padX} y1={padY + t * (h - padY * 2)} y2={padY + t * (h - padY * 2)} stroke="var(--hairline)" strokeWidth="1" />
      ))}
      <motion.path d={area} fill={`url(#grad-${gid})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.4 }} />
      <motion.path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: "easeInOut" }} />
      {xy.map((p, i) => (
        <motion.circle key={i} cx={p.x} cy={p.y} r="3.2" fill={color} stroke="var(--app-base)" strokeWidth="1.5" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6 + i * 0.04 }}>
          <title>{`${data[i].label}: ${data[i].value}${unit}`}</title>
        </motion.circle>
      ))}
      {data.map((d, i) => (
        <text key={i} x={xy[i].x} y={h - 6} textAnchor="middle" className="fill-[color:var(--ink-faint)]" style={{ fontSize: 9 }}>
          {d.label}
        </text>
      ))}
    </svg>
  );
}

/** Tiny inline trend line for KPI cards. */
export function Sparkline({ data, color = "#00b0d8", width = 96, height = 30 }: { data: number[]; color?: string; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => `${i === 0 ? "M" : "L"} ${i * step} ${height - ((v - min) / span) * height}`).join(" ");
  return (
    <svg width={width} height={height} className="overflow-visible">
      <motion.path d={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1 }} />
    </svg>
  );
}

/** A circular progress ring with a centred percentage. */
export function RadialProgress({
  value,
  size = 132,
  thickness = 12,
  color = "#00b0d8",
  label,
  na = false,
}: {
  value: number | null;
  size?: number;
  thickness?: number;
  color?: string;
  label?: string;
  na?: boolean;
}) {
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const pct = na || value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--hairline)" strokeWidth={thickness} />
      {!na && value !== null && (
        <motion.path
          d={arc(cx, cx, r, 0, Math.max(0.01, (pct / 100) * 359.9))}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      )}
      <text x={cx} y={cx - 2} textAnchor="middle" className="fill-[color:var(--ink)]" style={{ fontSize: 28, fontWeight: 900 }}>
        {na || value === null ? "N/A" : `${Math.round(pct)}%`}
      </text>
      {label && (
        <text x={cx} y={cx + 18} textAnchor="middle" className="fill-[color:var(--ink-faint)]" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1 }}>
          {label}
        </text>
      )}
    </svg>
  );
}

/** Month-over-month delta pill with directional icon + colour. */
export function TrendBadge({
  delta,
  unit = "",
  goodWhenUp = true,
  suffix = "vs. mes anterior",
}: {
  delta: number | null;
  unit?: string;
  goodWhenUp?: boolean;
  suffix?: string;
}) {
  if (delta === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full fill-softer px-2 py-0.5 text-[0.7rem] font-semibold text-ink-faint ring-1 ring-[color:var(--hairline)]">
        <Minus className="h-3 w-3" /> sin dato previo
      </span>
    );
  }
  const flat = delta === 0;
  const up = delta > 0;
  const good = flat ? true : up === goodWhenUp;
  const cls = flat
    ? "bg-slate-500/15 text-ink-soft ring-slate-400/30"
    : good
      ? "bg-emerald-500/15 text-emerald-500 ring-emerald-400/40"
      : "bg-rose-500/15 text-rose-500 ring-rose-400/40";
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-bold ring-1 ${cls}`}>
      <Icon className="h-3 w-3" />
      {up ? "+" : ""}
      {delta}
      {unit} <span className="font-medium opacity-70">{suffix}</span>
    </span>
  );
}
