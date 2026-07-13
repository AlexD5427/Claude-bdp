/**
 * Device capability detection.
 *
 * The Liquid Glass aesthetic leans on a continuously-rendered WebGL shader and
 * several large, blurred mesh blobs. Those are cheap on a modern laptop but can
 * pin the main thread on low-end hardware — which is exactly what caused the
 * "the page freezes / takes forever" reports. Rather than guessing, we probe a
 * few widely-supported signals once and derive a conservative tier that the
 * background engines use to scale (or switch off) their most expensive effects.
 *
 * The probe is deliberately synchronous and dependency-free so it can run during
 * the first render without adding latency.
 */

export type DeviceTier = "low" | "medium" | "high";

export interface DeviceProfile {
  tier: DeviceTier;
  /** `navigator.hardwareConcurrency` (logical cores), best-effort. */
  cores: number;
  /** `navigator.deviceMemory` in GB when exposed, else `null`. */
  memoryGb: number | null;
  /** Coarse pointer (touch-first) devices tend to be power-constrained. */
  coarsePointer: boolean;
  /** The OS/user asked for less motion. */
  prefersReducedMotion: boolean;
  /** WebGL is usable at all. */
  webglAvailable: boolean;
}

function safeMatchMedia(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

/** Probe WebGL support without leaking a long-lived context. */
function detectWebgl(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    return Boolean(gl);
  } catch {
    return false;
  }
}

let cached: DeviceProfile | null = null;

/** Compute (once) and memoise the device profile. */
export function getDeviceProfile(): DeviceProfile {
  if (cached) return cached;

  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const cores = Math.max(1, Number(nav?.hardwareConcurrency) || 4);
  // `deviceMemory` is only exposed by Chromium-family browsers.
  const memoryGb =
    nav && "deviceMemory" in nav
      ? Number((nav as Navigator & { deviceMemory?: number }).deviceMemory) || null
      : null;
  const coarsePointer = safeMatchMedia("(pointer: coarse)");
  const prefersReducedMotion = safeMatchMedia("(prefers-reduced-motion: reduce)");
  const webglAvailable = detectWebgl();

  // A conservative scoring model. The goal is to avoid the freeze, not to
  // squeeze every last frame out of a flagship device.
  let score = 0;
  if (cores >= 8) score += 2;
  else if (cores >= 4) score += 1;
  if (memoryGb === null) score += 1; // unknown → assume mid
  else if (memoryGb >= 8) score += 2;
  else if (memoryGb >= 4) score += 1;
  if (!coarsePointer) score += 1;

  let tier: DeviceTier;
  if (!webglAvailable || score <= 1) tier = "low";
  else if (score >= 4) tier = "high";
  else tier = "medium";

  cached = {
    tier,
    cores,
    memoryGb,
    coarsePointer,
    prefersReducedMotion,
    webglAvailable,
  };
  return cached;
}

/** Convenience helper for the common "should we run the heavy WebGL layer?". */
export function isLowPowerDevice(): boolean {
  return getDeviceProfile().tier === "low";
}
