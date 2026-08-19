/**
 * Sonda: ¿se puede ESCRIBIR dentro del panel del expediente?
 *
 * El panel lateral vuelve a montar su efecto de teclado en cada renderizado
 * porque sus dependencias son funciones nuevas cada vez. La limpieza de ese
 * efecto devuelve el foco al elemento que estaba enfocado antes de abrir el
 * panel, así que cada pulsación de tecla —que provoca un renderizado— saca el
 * foco del área de texto. Para quien escribe, «el teclado dejó de funcionar».
 *
 *   node qa/sonda-foco-expediente.mjs [puerto]
 */
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { crearExpediente, loadInstalledBackend } from "../scripts/documentacion-backend.mjs";

const PUERTO = Number(process.argv[2] ?? 5230);
const RAIZ = new URL("..", import.meta.url).pathname;
const URL_DOC = "https://script.google.com/macros/s/DOC/exec";
const FRASE = "Falta la ultima pagina del certificado";

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

function sembrar() {
  const h = loadInstalledBackend();
  const anio = new Date().getFullYear();
  crearExpediente(h, {
    identificador: `1234567 - 45 - ${anio}`,
    nombre: "Ana Quiroga Vargas",
    cargo: "Analista",
    agencia: "LA PAZ",
    gerencia: "GERENCIA DE RIESGOS",
    fechaIngreso: `${anio}-01-15`,
    tipoFuncionario: "GENERAL",
    tipoGarantia: "NINGUNA",
  });
  return h;
}

async function main() {
  const backend = sembrar();
  const vite = await arrancarVite();
  const navegador = await chromium.launch();
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 950 } });
  await contexto.addCookies([{ name: "bdp_perfil_sesion", value: "administrador", url: `http://localhost:${PUERTO}` }]);
  await contexto.addInitScript(
    ([clave, url]) => window.localStorage.setItem(clave, JSON.stringify({ dossiers: {}, settings: { scriptUrl: url } })),
    ["bdp-documentacion", URL_DOC],
  );
  const pagina = await contexto.newPage();
  await pagina.route((u) => u.hostname.endsWith("script.google.com"), async (r) => {
    if (r.request().method() !== "POST") {
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidatos: [], competencias: [], perfiles: [] }) });
    }
    const cuerpo = JSON.parse(r.request().postData() ?? "{}");
    if (!String(cuerpo.accion ?? "").startsWith("documentacion.")) {
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
    const salida = backend.call("doPost", { postData: { contents: JSON.stringify(cuerpo) } });
    await r.fulfill({ status: 200, contentType: "application/json", body: salida.getContent() });
  });

  await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(3000);
  await pagina.getByRole("button", { name: "Documentación", exact: true }).first().click();
  await pagina.waitForTimeout(2800);
  await pagina.getByRole("button", { name: "Expedientes", exact: true }).last().click();
  await pagina.waitForTimeout(2200);

  // Abrir el expediente sembrado.
  await pagina.getByText("Ana Quiroga Vargas").first().click({ force: true });
  await pagina.waitForTimeout(2500);
  const panel = pagina.getByRole("dialog").first();
  if (!(await panel.count())) {
    console.log("✗ no se abrió el panel del expediente");
    await navegador.close();
    vite.kill("SIGTERM");
    process.exit(1);
  }
  await pagina.screenshot({ path: "/tmp/sonda-panel.jpg", type: "jpeg", quality: 80 });

  // Abrir el detalle de un requisito para llegar al área de observaciones.
  const detalle = panel.getByRole("button", { name: /Detalle|Observaci/ }).first();
  if (await detalle.count()) {
    await detalle.click({ force: true });
    await pagina.waitForTimeout(1200);
  }

  const area = panel.locator("textarea").first();
  if (!(await area.count())) {
    console.log("✗ no se encontró un área de texto de observaciones en el panel");
    console.log("   (revisar el recorrido; se guardó una captura en /tmp/sonda-panel.jpg)");
    await pagina.screenshot({ path: "/tmp/sonda-panel-2.jpg", type: "jpeg", quality: 80 });
    await navegador.close();
    vite.kill("SIGTERM");
    process.exit(1);
  }

  await area.click();
  // Se escribe carácter a carácter, como una persona: cada pulsación provoca un
  // renderizado, que es justo lo que dispara el fallo.
  await pagina.keyboard.type(FRASE, { delay: 45 });
  await pagina.waitForTimeout(600);

  const escrito = await area.inputValue();
  const enfocado = await pagina.evaluate(() => document.activeElement?.tagName?.toLowerCase() ?? "");
  const ok = escrito === FRASE;
  console.log(`\n${ok ? "✓" : "✗"} se puede escribir en las observaciones del expediente`);
  console.log(`   esperado: ${JSON.stringify(FRASE)}`);
  console.log(`   escrito:  ${JSON.stringify(escrito)}`);
  console.log(`   foco tras escribir: <${enfocado}>`);

  await pagina.screenshot({ path: "/tmp/sonda-escritura.jpg", type: "jpeg", quality: 80 });
  await navegador.close();
  vite.kill("SIGTERM");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
