import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Z } from "../../design-system/tokens";

/**
 * Invariante de apilamiento.
 *
 * ── El fallo que esta prueba impide que vuelva ───────────────────────────────
 * `GlassDialog` es la confirmación que usan los formularios grandes para preguntar
 * «¿salir sin guardar?». Valía `z-index: 110`, y el formulario de perfiles de cargo
 * que la abre vive en `z-[115]`: la confirmación salía **por detrás**, «Descartar y
 * salir» no se podía pulsar y la única salida era guardar o recargar la página.
 *
 * El problema de fondo es que la escala del sistema de diseño convive con valores
 * escritos a mano por toda la aplicación (`z-[115]`, `z-[150]`, `z-[160]`…). Basta
 * que alguien añada un `z-[200]` a una superficie para volver a atrapar a la gente
 * dentro de un formulario, y eso no lo detecta ningún compilador.
 *
 * Así que se comprueba lo único que importa: **una confirmación está por encima de
 * cualquier superficie que la pueda abrir**, y el aviso flotante por encima de la
 * confirmación (informa, no bloquea).
 */

/* Vitest se ejecuta desde la raíz del repositorio (`vitest.config.ts` está allí),
   así que `src/` se resuelve desde el directorio de trabajo. */
const RAIZ = join(process.cwd(), "src");

/**
 * Superficies a pantalla completa con su `z-index` literal.
 *
 * Se buscan las clases que llevan `inset-0` y un `z-[NNN]` en el MISMO atributo:
 * eso es una superposición que cubre la ventana y que, por tanto, puede tapar una
 * confirmación. Un menú desplegable o un adorno con `z-index` alto pero sin
 * `inset-0` no compite: se cierra en cuanto se abre el diálogo.
 */
function zetasLiterales(): { archivo: string; valor: number }[] {
  const encontrados: { archivo: string; valor: number }[] = [];

  const recorrer = (directorio: string) => {
    for (const entrada of readdirSync(directorio)) {
      const ruta = join(directorio, entrada);
      if (statSync(ruta).isDirectory()) {
        if (entrada === "__tests__" || entrada === "node_modules") continue;
        recorrer(ruta);
        continue;
      }
      if (!/\.(tsx|ts|css)$/.test(entrada)) continue;
      const texto = readFileSync(ruta, "utf8");
      for (const linea of texto.split("\n")) {
        if (!linea.includes("inset-0")) continue;
        const z = /z-\[(\d+)\]/.exec(linea);
        if (z) encontrados.push({ archivo: ruta.slice(RAIZ.length + 1), valor: Number(z[1]) });
      }
    }
  };

  recorrer(RAIZ);
  return encontrados;
}

describe("escala de apilamiento", () => {
  it("la confirmación está por encima de cualquier superficie de la aplicación", () => {
    /* Se ignoran los valores por debajo del rango de superposiciones —menús,
       encabezados pegados y adornos no compiten con un diálogo— y la pantalla de
       acceso, que por definición tapa la aplicación entera y no abre ninguna
       confirmación: si no hay sesión, no hay formulario del que salir. */
    const superficies = zetasLiterales().filter(
      (z) => z.valor >= 90 && z.valor !== Z.toast && !z.archivo.includes("login/LoginScreen"),
    );
    expect(superficies.length).toBeGreaterThan(5); // la prueba encontró algo que mirar

    const masAlta = superficies.reduce((a, b) => (b.valor > a.valor ? b : a));
    expect(
      Z.dialog > masAlta.valor,
      `Z.dialog (${Z.dialog}) tiene que superar a la superficie más alta: ${masAlta.archivo} usa ${masAlta.valor}. ` +
        "Si no, la confirmación de «salir sin guardar» sale por detrás y deja a la persona atrapada en el formulario.",
    ).toBe(true);
  });

  it("el aviso flotante está por encima de la confirmación", () => {
    expect(Z.toast).toBeGreaterThan(Z.dialog);
  });

  it("el orden de la escala es el esperado", () => {
    expect(Z.base).toBeLessThan(Z.sticky);
    expect(Z.sticky).toBeLessThan(Z.dropdown);
    expect(Z.dropdown).toBeLessThan(Z.drawer);
    expect(Z.drawer).toBeLessThan(Z.dialog);
  });
});
