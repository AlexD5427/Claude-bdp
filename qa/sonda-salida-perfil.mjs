/**
 * Sonda: ¿se puede SALIR del formulario de perfil de cargo?
 *
 * `GlassDialog` —la confirmación de «¿salir sin guardar?»— valía `z-index: 110`, y
 * el formulario que la abre vive en `z-[115]`. La confirmación aparecía por detrás:
 * el botón «Descartar y salir» quedaba tapado y Escape solo la cancelaba. Quien
 * entraba a modificar un perfil se quedaba atrapado hasta recargar la página.
 *
 *   node qa/sonda-salida-perfil.mjs [puerto]
 */
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PUERTO = Number(process.argv[2] ?? 5250);
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
      experiencia_general: "3 años",
    },
  ],
};

async function arrancarVite() {
  const vite = spawn("npx", ["vite", "--port", String(PUERTO), "--strictPort"], { cwd: RAIZ, stdio: ["ignore", "pipe", "pipe"] });
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
  await pagina.waitForTimeout(3200);

  await pagina.getByRole("button", { name: "Perfiles", exact: true }).first().click();
  await pagina.waitForTimeout(1500);
  await pagina.getByRole("button", { name: /Oficial de Negocios/ }).first().click({ force: true });
  await pagina.waitForTimeout(1200);
  await pagina.getByRole("dialog", { name: /Perfil de cargo:/ }).getByRole("button", { name: /Modificar/ }).first().click({ force: true });
  await pagina.waitForTimeout(1500);

  // Pedir la salida y comprobar que la confirmación queda ENCIMA y se puede pulsar.
  await pagina.getByRole("button", { name: "Cerrar formulario" }).first().click({ force: true });
  await pagina.waitForTimeout(900);

  const encima = await pagina.evaluate(() => {
    const boton = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Descartar y salir"));
    if (!boton) return { existe: false };
    const r = boton.getBoundingClientRect();
    const enElPunto = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { existe: true, alcanzable: Boolean(boton.contains(enElPunto) || boton === enElPunto) };
  });

  let cerrado = false;
  if (encima.existe && encima.alcanzable) {
    await pagina.getByRole("button", { name: "Descartar y salir" }).click({ timeout: 5000 });
    await pagina.waitForTimeout(1200);
    cerrado = (await pagina.getByRole("dialog", { name: "Editar perfil de cargo" }).count()) === 0;
  }

  console.log(`\n${encima.existe ? "✓" : "✗"} aparece la confirmación de salida`);
  console.log(`${encima.alcanzable ? "✓" : "✗"} el botón «Descartar y salir» se puede pulsar (no lo tapa el formulario)`);
  console.log(`${cerrado ? "✓" : "✗"} el formulario se cierra`);
  console.log(`  overflow del body al final: ${JSON.stringify(await pagina.evaluate(() => document.body.style.overflow))}`);

  await navegador.close();
  vite.kill("SIGTERM");
  process.exit(encima.existe && encima.alcanzable && cerrado ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
