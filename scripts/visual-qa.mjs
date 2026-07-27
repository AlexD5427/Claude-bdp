#!/usr/bin/env node
/**
 * Captura reproducible de la matriz visual del módulo Evaluaciones.
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ ESTE SCRIPT NO SE EJECUTÓ EN EL ENTORNO DE LA TAREA.                      │
 * │ Playwright no está instalado en el repositorio (se retiró a propósito en   │
 * │ el commit 15f1d28) y en el entorno de la implementación la descarga del    │
 * │ binario de Chromium falla. Ver docs/evaluations/VISUAL_QA.md §Limitación.  │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * Cómo usarlo en una máquina con navegador:
 *
 *   npm ci
 *   npm run build && npm run preview -- --port 4173 &
 *   npx --yes playwright@1.49.0 install chromium
 *   node scripts/visual-qa.mjs                 # o: BASE_URL=http://localhost:5173 node …
 *
 * Deja las capturas en `docs/evaluations/screenshots/` con nombres estables, de
 * modo que dos ejecuciones sean comparables. El script NO se añade al `build` ni
 * a la suite de pruebas, y Playwright NO se añade como dependencia: se invoca con
 * `npx` para no volver a introducir una dependencia que el proyecto retiró.
 *
 * No captures ni publiques credenciales, tokens, datos personales ni contenido de
 * producción: ejecútalo con el proveedor de datos de demostración
 * (`VITE_ASSESSMENTS_PROVIDER=mock`, que es el valor por omisión).
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4173";
const OUT_DIR = process.env.OUT_DIR ?? join("docs", "evaluations", "screenshots");

/** Viewports de la matriz. */
const VIEWPORTS = [
  { name: "escritorio", width: 1512, height: 950 },
  { name: "tableta", width: 1024, height: 800 },
  { name: "movil", width: 414, height: 896 },
];

/** Temas de la matriz. El tema se aplica con la clase de `<html>`. */
const THEMES = ["light", "dark"];

/**
 * Pantallas a capturar. Cada una describe los pasos de interacción en términos
 * de textos accesibles, no de selectores CSS, para que sigan funcionando si
 * cambian las clases.
 */
const SCREENS = [
  { id: "01-listado", steps: [] },
  { id: "02-listado-filtros", steps: [{ click: "Filtros" }] },
  { id: "03-listado-tabla", steps: [{ click: "Tabla" }] },
  { id: "04-constructor-general", steps: [{ click: "Nueva evaluación" }, { click: "Configuración general" }] },
  { id: "05-constructor-preguntas", steps: [{ click: "Nueva evaluación" }, { click: "Agregar pregunta" }] },
  { id: "06-constructor-configuracion", steps: [{ click: "Nueva evaluación" }, { click: "Configuración de evaluación" }] },
  { id: "07-revision", steps: [{ click: "Nueva evaluación" }, { click: "Revisar" }] },
  { id: "08-vista-previa", steps: [{ click: "Nueva evaluación" }, { click: "Vista previa" }] },
  { id: "09-publicacion", steps: [{ click: "Nueva evaluación" }, { click: "Publicar" }] },
];

async function main() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.error(
      "Playwright no está disponible.\n" +
        "Instálalo temporalmente sin añadirlo al proyecto:\n" +
        "  npx --yes playwright@1.49.0 install chromium\n" +
        "  npm i --no-save playwright@1.49.0\n",
    );
    process.exit(2);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const consoleErrors = [];

  for (const theme of THEMES) {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        // Se captura también con movimiento reducido en el tema oscuro, para
        // comprobar que la interfaz sigue siendo legible sin animaciones.
        reducedMotion: theme === "dark" ? "reduce" : "no-preference",
        locale: "es-MX",
      });
      const page = await context.newPage();
      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors.push(`[${theme}/${viewport.name}] ${message.text()}`);
        }
      });

      for (const screen of SCREENS) {
        await page.goto(BASE_URL, { waitUntil: "networkidle" });
        await page.evaluate((value) => {
          document.documentElement.classList.remove("light", "dark");
          document.documentElement.classList.add(value);
        }, theme);

        // Entrar al módulo Evaluaciones desde el dock.
        const dock = page.getByRole("button", { name: /Evaluaciones/ }).first();
        if (await dock.count()) await dock.click();

        for (const step of screen.steps) {
          const target = page.getByRole("button", { name: new RegExp(step.click) }).first();
          if (await target.count()) {
            await target.click();
            await page.waitForTimeout(350);
          } else {
            console.warn(`· No se encontró «${step.click}» en ${screen.id}`);
          }
        }

        await page.waitForTimeout(500);
        const file = join(OUT_DIR, `${screen.id}-${theme}-${viewport.name}.png`);
        await page.screenshot({ path: file, fullPage: viewport.name !== "movil" });
        console.log(`✔ ${file}`);
      }

      await context.close();
    }
  }

  await browser.close();

  if (consoleErrors.length > 0) {
    console.error(`\n${consoleErrors.length} error(es) de consola:`);
    for (const error of consoleErrors) console.error(`  ${error}`);
    process.exit(1);
  }
  console.log("\nSin errores de consola. ✔");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
