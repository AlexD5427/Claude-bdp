/**
 * Arnés compartido de las sondas del módulo de Evaluaciones.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * Las sondas de este módulo necesitan reproducir una situación que ninguna
 * prueba en jsdom puede montar: **dos navegadores distintos**. Uno es el del
 * reclutador, con su sesión y su configuración guardada; el otro es el de una
 * persona de fuera que solo tiene un enlace. El fallo que estas sondas persiguen
 * —«la evaluación abre para mí y para nadie más»— solo existe en la diferencia
 * entre esos dos navegadores.
 *
 * El backend es el `.gs` REAL cargado en memoria por
 * `scripts/evaluaciones-backend.mjs`, servido a través de una intercepción de
 * red: lo que ve el navegador salió del `doPost` de verdad, con su autorización,
 * su proyección pública y su calificación.
 *
 * Requiere Playwright, que se instala aparte a propósito y NO entra en
 * `package.json` (rompería el `npm ci` de Vercel con un navegador de 150 MB):
 *
 *     npm i -D playwright && npx playwright install chromium --with-deps
 */

import { spawn } from "node:child_process";
import { loadInstalledBackend, sampleDocument, TEST_ADMIN_KEY } from "../scripts/evaluaciones-backend.mjs";

export const RAIZ = new URL("..", import.meta.url).pathname;

/**
 * URL del despliegue de pruebas.
 *
 * Tiene la forma exacta de un despliegue real de Apps Script
 * (`/macros/s/<ID>/exec`) porque el enlace público extrae de ahí el
 * identificador: una URL con otra forma probaría otra cosa.
 */
export const URL_EVALUACIONES =
  "https://script.google.com/macros/s/AKfycbEVALUACIONESDEPRUEBAS0123456789abcdefghijkl/exec";

export const LLAVE = TEST_ADMIN_KEY;
export const ESCRITORIO = { width: 1500, height: 950 };
export const MOVIL = { width: 390, height: 844 };

/** Payload mínimo del backend del talento, para que el armazón del ATS arranque. */
export const PAYLOAD_TALENTO = {
  candidatos: [],
  competencias: [],
  perfiles: [],
  procesos: [],
  config: [],
  perfiles_cargo: [],
};

/* ------------------------------------------------------------------ */
/* Libro sembrado                                                      */
/* ------------------------------------------------------------------ */

/**
 * Backend instalado con una evaluación PUBLICADA y lista para responder.
 *
 * Se publica de verdad (`publishEvaluation`), no se falsifica el estado: la
 * portada pública, la versión inmutable y el código son los que genera el
 * backend real.
 */
export function sembrarBackend({ titulo = "Analista de riesgo crediticio" } = {}) {
  const h = loadInstalledBackend();
  const creada = h.admin("createEvaluation", { titulo });
  if (!creada.ok) throw new Error(`No se pudo crear la evaluación: ${creada.error.mensaje}`);
  const id = creada.datos.evaluacion.id;
  const seccionId = creada.datos.secciones[0].id;

  const documento = sampleDocument(id, seccionId);
  const guardada = h.admin("saveEvaluation", documento);
  if (!guardada.ok) throw new Error(`No se pudo guardar: ${guardada.error.mensaje}`);

  const publicada = h.admin("publishEvaluation", { id });
  if (!publicada.ok) throw new Error(`No se pudo publicar: ${publicada.error.mensaje}`);

  return {
    backend: h,
    evaluacionId: id,
    codigo: String(creada.datos.evaluacion.codigo),
    titulo,
  };
}

/* ------------------------------------------------------------------ */
/* Infraestructura                                                     */
/* ------------------------------------------------------------------ */

/**
 * Puerto libre para esta ejecución.
 *
 * Se sortea en lugar de fijarse: `vite preview` tarda un momento en soltar el
 * puerto al terminar, y lanzar los cinco escenarios seguidos con el mismo número
 * hacía que el segundo fallara con «port already in use» —un fallo del banco de
 * pruebas que se lee como un fallo del módulo—.
 */
export function puertoAlAzar() {
  return 5300 + Math.floor(Math.random() * 400);
}

/** Arranca `vite preview` sobre `dist/`: se mide y se prueba lo que se despliega. */
export async function arrancarServidor(puerto) {
  const servidor = spawn("npx", ["vite", "preview", "--port", String(puerto), "--strictPort", "--host", "127.0.0.1"], {
    cwd: RAIZ,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolver, rechazar) => {
    const t = setTimeout(
      () => rechazar(new Error(`El servidor no arrancó en el puerto ${puerto}. ¿Falta «npm run build»?`)),
      60000,
    );
    servidor.stdout.on("data", (d) => {
      if (String(d).includes("Local:") || String(d).includes("localhost")) {
        clearTimeout(t);
        setTimeout(resolver, 900);
      }
    });
    servidor.stderr.on("data", (d) => process.stderr.write(String(d)));
  });
  return servidor;
}

export function nuevoRegistro() {
  return {
    llamadas: 0,
    acciones: [],
    /** Acciones que llegaron SIN llave de administración. */
    sinLlave: [],
    /** Acciones que llegaron CON llave. */
    conLlave: [],
    fallos: [],
    errores: [],
    caidas: [],
    erroresEsperados: [],
    sinRed: false,
  };
}

/**
 * Contexto de navegador con el backend de Evaluaciones desviado al `.gs` real.
 *
 * `opciones.comoReclutador` decide si el navegador lleva la sesión del ATS y la
 * configuración guardada del módulo. Un candidato NO lleva ninguna de las dos
 * cosas: es justo lo que hay que reproducir.
 */
export async function nuevoNavegante(navegador, backend, registro, opciones = {}) {
  const puerto = opciones.puerto;
  const contexto = await navegador.newContext({
    viewport: opciones.viewport ?? ESCRITORIO,
    deviceScaleFactor: 1,
    ...(opciones.contexto ?? {}),
  });

  if (opciones.comoReclutador) {
    for (const host of ["localhost", "127.0.0.1"]) {
      await contexto.addCookies([
        { name: "bdp_perfil_sesion", value: "administrador", url: `http://${host}:${puerto}` },
      ]);
    }
    await contexto.addInitScript(
      ([clave, valor]) => {
        window.localStorage.setItem(clave, valor);
      },
      [
        "bdp-evaluaciones-conexion",
        JSON.stringify({
          modo: opciones.modoConexion ?? "apps-script",
          url: opciones.urlConexion ?? URL_EVALUACIONES,
          llave: LLAVE,
          cliente: "cli_reclutador_pruebas",
          verificadoEn: new Date().toISOString(),
        }),
      ],
    );
  }
  if (opciones.initScript) await contexto.addInitScript(opciones.initScript);

  const pagina = await contexto.newPage();

  await pagina.route(
    (url) => url.hostname.endsWith("script.google.com"),
    async (ruta) => {
      const peticion = ruta.request();
      const destino = peticion.url();

      // El backend del talento (el del ATS) no es el de Evaluaciones: se
      // responde con un payload mínimo para que el armazón arranque.
      if (!destino.includes("EVALUACIONESDEPRUEBAS")) {
        return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PAYLOAD_TALENTO) });
      }
      if (registro.sinRed) return ruta.abort("internetdisconnected");
      if (peticion.method() !== "POST") {
        return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false }) });
      }

      const contenido = peticion.postData() ?? "{}";
      const cuerpo = JSON.parse(contenido);
      registro.llamadas += 1;
      registro.acciones.push(String(cuerpo.accion));
      if (cuerpo.llaveAdmin) registro.conLlave.push(String(cuerpo.accion));
      else registro.sinLlave.push(String(cuerpo.accion));

      const salida = backend.call("doPost", { postData: { contents: contenido } });
      const texto = salida.getContent();
      const json = JSON.parse(texto);
      if (!json.ok) registro.fallos.push(`${cuerpo.accion}: ${json.error?.mensaje ?? ""}`);
      await ruta.fulfill({ status: 200, contentType: "application/json", body: texto });
    },
  );

  pagina.on("console", (m) => {
    if (m.type() === "error") registro.errores.push(m.text().slice(0, 300));
  });
  pagina.on("pageerror", (e) => registro.errores.push(`pageerror: ${e.message}`.slice(0, 300)));
  pagina.on("crash", () => registro.caidas.push("la página se colgó"));

  return pagina;
}

/** Entra al ATS y abre el módulo de Evaluaciones. */
export async function abrirEvaluaciones(pagina, puerto) {
  await pagina.goto(`http://127.0.0.1:${puerto}/`, { waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(2200);
  await pagina.getByRole("button", { name: "Evaluaciones", exact: true }).first().click();
  await pagina.waitForTimeout(1800);
}

/* ------------------------------------------------------------------ */
/* Informe                                                             */
/* ------------------------------------------------------------------ */

let fallos = 0;

export function comprobar(ok, etiqueta, detalle) {
  if (!ok) fallos += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${etiqueta}`);
  if (detalle) {
    for (const linea of String(detalle).split("\n")) console.log(`      ${linea}`);
  }
  return ok;
}

export function dato(etiqueta, valor) {
  console.log(`  · ${etiqueta}: ${valor}`);
}

export function seccion(titulo) {
  console.log(`\n▸ ${titulo}`);
}

/** Cierra la sonda con el código de salida que corresponde. */
export function terminar(registro, navegador, servidor) {
  console.log("");
  if (registro) {
    console.log(`Llamadas al backend: ${registro.llamadas} · fallidas: ${registro.fallos.length}`);
    for (const f of registro.fallos.slice(0, 8)) console.log(`  · ${f}`);
    if (registro.caidas.length) console.log(`Caídas del navegador de pruebas: ${registro.caidas.length}`);
    const esperados = registro.erroresEsperados ?? [];
    const inesperados = registro.errores.filter((e) => !esperados.some((patron) => patron.test(e)));
    if (inesperados.length) {
      console.log("Errores de la consola del navegador:");
      for (const e of [...new Set(inesperados)].slice(0, 10)) console.log(`  - ${e}`);
      fallos += 1;
    } else {
      console.log("Sin errores inesperados en la consola del navegador.");
    }
  }
  const salida = fallos === 0 ? 0 : 1;
  console.log(fallos === 0 ? "\nTodo en verde." : `\n${fallos} comprobación(es) fallida(s).`);
  const cerrar = async () => {
    if (navegador) await navegador.close().catch(() => {});
    if (servidor) {
      servidor.kill("SIGTERM");
      // Y sin esperar cortesías: el proceso siguiente necesita el puerto.
      setTimeout(() => servidor.kill("SIGKILL"), 400);
      await new Promise((r) => setTimeout(r, 600));
    }
    process.exit(salida);
  };
  void cerrar();
}
