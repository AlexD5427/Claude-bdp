import { describe, it, expect } from "vitest";
import { getDeviceProfile } from "../device";
import { slugify, slugCode, uid } from "../id";
import { toAppError, appError } from "../errors";
import { formatCurrency, formatPercent, formatDuration } from "../format";
import { getHeavyOverlayCount, pushHeavyOverlay } from "../heavyOverlayStore";

describe("device profile", () => {
  it("returns a stable, memoised profile", () => {
    const a = getDeviceProfile();
    const b = getDeviceProfile();
    expect(a).toBe(b);
    expect(["low", "medium", "high"]).toContain(a.tier);
  });
});

describe("id helpers", () => {
  it("slugifies and codes titles", () => {
    expect(slugify("Oficial de Créditos 2026")).toBe("oficial-de-creditos-2026");
    expect(slugCode("Jefe de Agencia")).toBe("JEFE-DE-AGENCIA");
  });
  it("generates unique ids with prefixes", () => {
    const a = uid("x");
    const b = uid("x");
    expect(a).not.toBe(b);
    expect(a.startsWith("x_")).toBe(true);
  });
});

describe("error normalisation", () => {
  it("normalises unknown throwables into Spanish AppErrors", () => {
    const err = toAppError(new Error("Failed to fetch"));
    expect(err.code).toBe("network");
    expect(err.message).toMatch(/conexión|servidor/i);
  });
  it("builds coded errors", () => {
    expect(appError("not_found").code).toBe("not_found");
  });
});

describe("es-BO formatting", () => {
  it("formats currency, percent and duration", () => {
    expect(formatCurrency(1234.5)).toContain("Bs");
    expect(formatPercent(45)).toContain("45");
    expect(formatDuration(3900)).toContain("h");
  });
});

describe("heavy overlay store", () => {
  it("reference-counts overlays", () => {
    const start = getHeavyOverlayCount();
    const release = pushHeavyOverlay();
    expect(getHeavyOverlayCount()).toBe(start + 1);
    release();
    expect(getHeavyOverlayCount()).toBe(start);
    // Double release is a no-op.
    release();
    expect(getHeavyOverlayCount()).toBe(start);
  });
});
