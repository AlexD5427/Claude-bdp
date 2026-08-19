/**
 * Sonda mínima del candado de scroll, en un navegador real.
 *
 * Abre y cierra una superposición de cada módulo y comprueba una sola cosa
 * después de cada ciclo: ¿quedó el `body` con `overflow: hidden`? Si queda, la
 * página no vuelve a scrollear y el área lo reporta como «la pantalla se congeló».
 *
 *   node qa/sonda-congelamiento.mjs [puerto]
 */
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PUERTO = Number(process.argv[2] ?? 5215);
const RAIZ = new URL("..", import.meta.url).pathname;

const PAYLOAD = {
  candidatos: [],
  competencias: [],
  perfiles: [],
  perfiles_cargo: [
    {
      area_cargo: "NEGOCIOS",
      puesto_bdp: "Oficial de Negocios",
      gestion_bdp: String(new Date().getFullYear()),
      formacion_principal: "Economía",
    },
  ],
};

async function arrancarVite() {
  const vite = spawn("npx", ["vite", "--port", String(PUERTO), "--strictPort"], {
    cwd: RAIZ,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("Vite no arrancó")), 90000);
    vite.stdout.on("data", (d) => {
      if (String(d).includes("ready in") || String(d).includes("Local:")) {
        clearTimeout(t);
        setTimeout(res, 900);
      }
    });
    vite.stderr.on("data", (d) => process.stderr.write(String(d)));
  });
  return vite;
}

async function main() {
  const vite = await arrancarVite();
  const navegador = await chromium.launch();
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  await contexto.addCookies([{ name: "bdp_perfil_sesion", value: "administrador", url: `http://localhost:${PUERTO}` }]);
  const pagina = await contexto.newPage();
  await pagina.route((u) => u.hostname.endsWith("script.google.com"), (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PAYLOAD) }),
  );
  await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(3500);

  const overflow = () => pagina.evaluate(() => document.body.style.overflow);
  let fallos = 0;
  const comprobar = async (etiqueta) => {
    const v = await overflow();
    const ok = v !== "hidden";
    if (!ok) fallos += 1;
    console.log(`  ${ok ? "✓" : "✗"} ${etiqueta} → overflow=${JSON.stringify(v)}`);
  };

  const modulo = async (nombre) => {
    await pagina.getByRole("button", { name: nombre, exact: true }).first().click();
    await pagina.waitForTimeout(1400);
  };

  console.log("\n▸ Candado de scroll tras abrir y cerrar superposiciones");
  await comprobar("estado inicial");

  // 1 · Documentación › Configuración › Ajustes locales (modal sobre el módulo).
  await modulo("Documentación");
  await pagina.waitForTimeout(2200);
  await pagina.getByRole("button", { name: "Configuración", exact: true }).last().click();
  await pagina.waitForTimeout(1000);
  await pagina.getByRole("tab", { name: "Ajustes locales" }).click();
  await pagina.waitForTimeout(600);
  await pagina.getByRole("button", { name: "Abrir ajustes locales" }).click();
  await pagina.waitForTimeout(1200);
  await pagina.getByRole("button", { name: "Listo", exact: true }).first().click();
  await pagina.waitForTimeout(1300);
  await comprobar("Documentación › Ajustes locales abierto y cerrado");

  // 2 · Perfiles › Herramientas (panel global, portal a body).
  await modulo("Perfiles");
  await pagina.getByRole("button", { name: /Herramientas/ }).first().click();
  await pagina.waitForTimeout(1100);
  await pagina.keyboard.press("Escape");
  await pagina.waitForTimeout(1400);
  await comprobar("Perfiles › Herramientas abierto y cerrado");

  // 3 · Perfiles › visor de perfil de cargo.
  await pagina.getByRole("button", { name: /Oficial de Negocios/ }).first().click({ force: true });
  await pagina.waitForTimeout(1200);
  await pagina.keyboard.press("Escape");
  await pagina.waitForTimeout(1400);
  await comprobar("Perfiles › visor abierto y cerrado");

  // 4 · Dos ciclos seguidos: es donde el patrón antiguo se desincroniza.
  for (let i = 0; i < 2; i++) {
    await pagina.getByRole("button", { name: /Herramientas/ }).first().click();
    await pagina.waitForTimeout(800);
    await pagina.keyboard.press("Escape");
    await pagina.waitForTimeout(1100);
  }
  await comprobar("dos ciclos seguidos de Herramientas");

  // 5 · Visor + formulario solapados, cerrados en orden inverso. Se intenta y, si
  //     la pantalla heredada no colabora con el clic, se informa sin fallar.
  try {
    await pagina.getByRole("button", { name: /Oficial de Negocios/ }).first().click({ force: true });
    await pagina.waitForTimeout(1100);
    const visor = pagina.getByRole("dialog", { name: /Perfil de cargo:/ });
    await visor.getByRole("button", { name: /Modificar/ }).first().click({ force: true, timeout: 4000 });
    await pagina.waitForTimeout(1300);
    await pagina.getByRole("button", { name: "Cerrar formulario" }).first().click({ force: true, timeout: 4000 });
    await pagina.waitForTimeout(700);
    const descartar = pagina.getByRole("button", { name: "Descartar y salir" }).first();
    if (await descartar.count()) await descartar.click({ force: true, timeout: 4000 });
    await pagina.waitForTimeout(1500);
    await comprobar("visor → formulario → cerrar (orden inverso)");
  } catch {
    console.log("  · no se pudo completar el recorrido visor→formulario en esta pantalla heredada");
  }

  /* 6 · El caso decisivo: DOS candados solapados.
   *
   * Se cierra el panel de Herramientas y, antes de que termine su animación de
   * salida (todavía montado, todavía con el `body` en «hidden»), se abre el visor
   * de un perfil. El visor guarda «cómo estaba antes» y lo que ve es «hidden».
   * Cuando el panel acaba de salir, devuelve el valor original («»); al cerrar el
   * visor, éste restaura el suyo: «hidden». La página se queda sin scroll. */
  // Se recarga para partir de un estado limpio: lo anterior deja pantallas abiertas.
  await pagina.reload({ waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(3000);
  await modulo("Perfiles");
  await pagina.getByRole("button", { name: /Herramientas/ }).first().click();
  await pagina.waitForTimeout(900);
  await pagina.keyboard.press("Escape");
  await pagina.waitForTimeout(60); // el panel sigue animando su salida
  await pagina.getByRole("button", { name: /Oficial de Negocios/ }).first().click({ force: true });
  await pagina.waitForTimeout(1500);
  await pagina.keyboard.press("Escape");
  await pagina.waitForTimeout(1600);
  await comprobar("dos candados solapados (panel saliendo + visor entrando)");

  console.log(fallos ? `\n${fallos} comprobación(es) fallida(s): la página queda sin scroll.` : "\nEl candado se libera siempre.");
  await navegador.close();
  vite.kill("SIGTERM");
  process.exit(fallos ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
