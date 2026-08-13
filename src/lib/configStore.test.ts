import { describe, expect, it } from "vitest";
import { defaultConfig, sanitiseConfig } from "./configStore";

/**
 * Saneamiento de la configuración.
 *
 * Estas pruebas cubren el fallo que dejaba el Comparador inservible para una
 * sola persona del equipo: su `config_personal_perfil` (guardado en la hoja y
 * aplicado al iniciar sesión en cualquier equipo) traía `maxComparador: 0`, así
 * que el buscador aparecía apagado con «Límite alcanzado (0/0)» y no podía
 * comparar a nadie. La configuración no se valida en cada consumidor sino en su
 * única puerta de entrada, que es lo que se comprueba aquí.
 */
describe("sanitiseConfig · rangos numéricos", () => {
  it("nunca deja el comparador por debajo de dos columnas", () => {
    expect(sanitiseConfig({ maxComparador: 0 }).maxComparador).toBe(2);
    expect(sanitiseConfig({ maxComparador: 1 }).maxComparador).toBe(2);
    expect(sanitiseConfig({ maxComparador: -30 }).maxComparador).toBe(2);
  });

  it("recorta el máximo de columnas al tope soportado", () => {
    expect(sanitiseConfig({ maxComparador: 99 }).maxComparador).toBe(10);
  });

  it("acepta un número escrito como texto (viene así de versiones viejas)", () => {
    expect(sanitiseConfig({ maxComparador: "7" as unknown as number }).maxComparador).toBe(7);
  });

  it("conserva el valor previo cuando el nuevo no es un número", () => {
    const base = { ...defaultConfig(), maxComparador: 6 };
    expect(
      sanitiseConfig({ maxComparador: Number.NaN }, base).maxComparador,
    ).toBe(6);
    expect(
      sanitiseConfig({ maxComparador: "diez" as unknown as number }, base).maxComparador,
    ).toBe(6);
  });

  it("mantiene el umbral CAP y la frecuencia de refresco en rangos usables", () => {
    expect(sanitiseConfig({ capApprovalThreshold: 1200 }).capApprovalThreshold).toBe(100);
    expect(sanitiseConfig({ capApprovalThreshold: 0 }).capApprovalThreshold).toBe(40);
    // Menos de 15 s agotaría la cuota de Apps Script.
    expect(sanitiseConfig({ autoRefreshSeconds: 1 }).autoRefreshSeconds).toBe(15);
    expect(sanitiseConfig({ autoRefreshSeconds: 99999 }).autoRefreshSeconds).toBe(900);
  });
});

describe("sanitiseConfig · opciones cerradas", () => {
  it("descarta valores que no están en el catálogo", () => {
    const c = sanitiseConfig({
      rankPlacement: "izquierda" as never,
      comparatorOrder: "aleatorio" as never,
      dockPosition: "arriba" as never,
      dockSize: "xl" as never,
      defaultPaper: "A4" as never,
      defaultOrientation: "vertical" as never,
      threeQuality: "ultra" as never,
    });
    const base = defaultConfig();
    expect(c.rankPlacement).toBe(base.rankPlacement);
    expect(c.comparatorOrder).toBe(base.comparatorOrder);
    expect(c.dockPosition).toBe(base.dockPosition);
    expect(c.dockSize).toBe(base.dockSize);
    expect(c.defaultPaper).toBe(base.defaultPaper);
    expect(c.defaultOrientation).toBe(base.defaultOrientation);
    expect(c.threeQuality).toBe(base.threeQuality);
  });

  it("acepta las opciones válidas", () => {
    expect(sanitiseConfig({ dockPosition: "left" }).dockPosition).toBe("left");
    expect(sanitiseConfig({ rankPlacement: "fila" }).rankPlacement).toBe("fila");
  });

  it("ignora los interruptores que no son booleanos", () => {
    const base = defaultConfig();
    expect(
      sanitiseConfig({ rankingEnabled: "sí" as unknown as boolean }).rankingEnabled,
    ).toBe(base.rankingEnabled);
    expect(sanitiseConfig({ reduceMotion: true }).reduceMotion).toBe(true);
  });
});

describe("sanitiseConfig · formatos de correo y claves ajenas", () => {
  it("recupera la biblioteca de formatos cuando lo guardado no sirve", () => {
    // Los formatos sembrados llevan un id aleatorio, así que se comparan por
    // categoría: lo que importa es que la biblioteca vuelva completa.
    const base = defaultConfig();
    const categorias = (cfg: ReturnType<typeof defaultConfig>) =>
      cfg.emailTemplates.map((t) => t.category);
    expect(
      sanitiseConfig({ emailTemplates: "no es una lista" as never }, base).emailTemplates,
    ).toEqual(base.emailTemplates);
    expect(sanitiseConfig({ emailTemplates: [] }, base).emailTemplates).toEqual(
      base.emailTemplates,
    );
    expect(
      categorias(sanitiseConfig({ emailTemplates: [null, { id: 1 }] as never })),
    ).toEqual(categorias(defaultConfig()));
  });

  it("conserva los formatos bien formados", () => {
    const tpl = {
      id: "t1",
      name: "Mío",
      category: "entrevista" as const,
      subject: "s",
      body: "b",
      active: true,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(sanitiseConfig({ emailTemplates: [tpl] }).emailTemplates).toEqual([tpl]);
  });

  it("no deja entrar claves que no son de la configuración", () => {
    const c = sanitiseConfig({ maxComparador: 4, sarasa: "x" } as never);
    expect(c.maxComparador).toBe(4);
    expect("sarasa" in c).toBe(false);
  });

  it("devuelve la base intacta ante entradas absurdas", () => {
    const base = defaultConfig();
    expect(sanitiseConfig(null, base)).toBe(base);
    expect(sanitiseConfig("texto" as never, base)).toBe(base);
  });
});
