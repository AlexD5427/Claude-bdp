import { describe, expect, it } from "vitest";
import { mergePendingWrites } from "./TalentDataContext";
import type { RawCandidate } from "../types";

/**
 * Apps Script sirve el `doGet` desde su propia caché, así que el GET que sigue a
 * un alta suele devolver el listado *sin* la fila nueva. El código anterior
 * dejaba que ese payload viejo reemplazara el arreglo completo y el postulante
 * recién registrado desaparecía de la pantalla antes de que el analista lo viera
 * (reproducido en `qa/sondas.mjs carrera-optimista`). Estas pruebas fijan la
 * superposición que lo evita, y también su caducidad: un alta no puede quedar
 * pegada para siempre, o un borrado hecho en la hoja nunca se vería.
 */

type Pending = Parameters<typeof mergePendingWrites>[1];

const row = (identificador: string, over: Partial<RawCandidate> = {}): RawCandidate => ({
  identificador,
  nombres: "Ana",
  ...over,
});

const pending = (
  entries: [string, { kind: "create" | "update"; row: RawCandidate; at: number }][],
): Pending => new Map(entries);

const NOW = 1_000_000;

describe("mergePendingWrites", () => {
  it("devuelve el payload intacto cuando no hay nada pendiente", () => {
    const rows = [row("a")];
    const out = mergePendingWrites(rows, pending([]), NOW);
    expect(out.rows).toBe(rows);
    expect(out.pending.size).toBe(0);
  });

  it("mantiene visible un alta que el servidor todavía no devuelve", () => {
    const nueva = row("nueva", { nombres: "Recién" });
    const out = mergePendingWrites(
      [row("a"), row("b")],
      pending([["nueva", { kind: "create", row: nueva, at: NOW }]]),
      NOW + 1_000,
    );
    expect(out.rows.map((r) => r.identificador)).toEqual(["nueva", "a", "b"]);
    expect(out.pending.has("nueva")).toBe(true);
  });

  it("suelta el alta en cuanto el servidor la publica", () => {
    const nueva = row("nueva");
    const out = mergePendingWrites(
      [row("nueva", { nombres: "Del servidor" }), row("a")],
      pending([["nueva", { kind: "create", row: nueva, at: NOW }]]),
      NOW + 1_000,
    );
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0].nombres).toBe("Del servidor");
    expect(out.pending.size).toBe(0);
  });

  it("caduca un alta que el servidor nunca devuelve, para no inventar filas", () => {
    const out = mergePendingWrites(
      [row("a")],
      pending([["fantasma", { kind: "create", row: row("fantasma"), at: NOW }]]),
      NOW + 6 * 60 * 1000,
    );
    expect(out.rows.map((r) => r.identificador)).toEqual(["a"]);
    expect(out.pending.size).toBe(0);
  });

  it("superpone una edición mientras el servidor sigue devolviendo lo viejo", () => {
    const out = mergePendingWrites(
      [row("a", { nombres: "Viejo" })],
      pending([["a", { kind: "update", row: row("a", { nombres: "Nuevo" }), at: NOW }]]),
      NOW + 500,
    );
    expect(out.rows[0].nombres).toBe("Nuevo");
    expect(out.pending.has("a")).toBe(true);
  });

  it("suelta la edición en cuanto el servidor coincide", () => {
    const out = mergePendingWrites(
      [row("a", { nombres: "Nuevo" })],
      pending([["a", { kind: "update", row: row("a", { nombres: "Nuevo" }), at: NOW }]]),
      NOW + 500,
    );
    expect(out.pending.size).toBe(0);
  });

  it("compara como texto, porque la hoja devuelve números como cadenas", () => {
    const out = mergePendingWrites(
      [row("a", { nota_cap: "88" })],
      pending([["a", { kind: "update", row: row("a", { nota_cap: 88 }), at: NOW }]]),
      NOW + 500,
    );
    expect(out.pending.size).toBe(0);
  });

  it("no altera el orden de las filas que ya venían del servidor", () => {
    const out = mergePendingWrites(
      [row("a"), row("b"), row("c")],
      pending([["b", { kind: "update", row: row("b", { nombres: "Editado" }), at: NOW }]]),
      NOW + 500,
    );
    expect(out.rows.map((r) => r.identificador)).toEqual(["a", "b", "c"]);
    expect(out.rows[1].nombres).toBe("Editado");
  });
});
