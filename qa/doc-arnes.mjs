/**
 * Arnés compartido de las sondas del módulo de Documentación.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * Las cinco sondas nuevas (contraste, rendimiento, alta, ventana del expediente
 * y caché) necesitan exactamente lo mismo antes de poder medir nada: arrancar
 * Vite, sembrar el backend `.gs` REAL en memoria, interceptar
 * `script.google.com` para que las peticiones del navegador lo alcancen, y
 * entrar al módulo con sesión iniciada. Copiado cinco veces, eso son cinco
 * sitios donde el arnés se desactualiza por separado.
 *
 * No forma parte de la aplicación ni del despliegue: Playwright se instala
 * aparte a propósito, para no engordar el `npm ci` de Vercel con un navegador de
 * 150 MB.
 */
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { crearExpediente, loadInstalledBackend } from "../scripts/documentacion-backend.mjs";

export const RAIZ = new URL("..", import.meta.url).pathname;
export const URL_DOC = "https://script.google.com/macros/s/DOC_BACKEND_DE_PRUEBAS/exec";
export const ESCRITORIO = { width: 1500, height: 950 };

const AGENCIAS = ["LA PAZ", "SANTA CRUZ", "COCHABAMBA", "EL ALTO", "TARIJA", "ORURO"];
const GERENCIAS = ["GERENCIA DE RIESGOS", "GERENCIA COMERCIAL", "GERENCIA DE OPERACIONES"];
const CARGOS = ["OFICIAL DE NEGOCIOS", "CAJERO", "ANALISTA DE RIESGOS", "AUDITOR INTERNO", "JEFE DE AGENCIA"];

/** Payload mínimo del backend del talento (GET), para que la app no se cuelgue. */
export const PAYLOAD_TALENTO = {
  candidatos: [],
  competencias: [],
  perfiles: [],
  procesos: [],
  config: [],
  perfiles_cargo: [
    {
      area_cargo: "NEGOCIOS",
      puesto_bdp: "Oficial de Negocios",
      gestion_bdp: String(new Date().getFullYear()),
      formacion_principal: "Economía",
    },
  ],
};

export function enDias(dias) {
  return new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
}

/**
 * Backend real en memoria, con expedientes de todas las ramas.
 *
 * `cuantos` decide el volumen: las sondas de rendimiento piden muchos, las de
 * interacción unos pocos. Los cargos y las agencias se siembran en la hoja
 * `Auxiliar` porque es lo que alimenta los desplegables del alta.
 */
export function sembrar({ cuantos = 14 } = {}) {
  const h = loadInstalledBackend();
  const anio = new Date().getFullYear();
  const mes = String(new Date().getMonth() + 1).padStart(2, "0");

  h.ok("documentacion.auxiliares.agregar", { columna: "agencia_bdp", valores: AGENCIAS });
  h.ok("documentacion.auxiliares.agregar", { columna: "gerencia_bdp", valores: GERENCIAS });
  h.ok("documentacion.auxiliares.agregar", { columna: "cargo_bdp", valores: CARGOS });

  const creados = [];
  for (let i = 0; i < cuantos; i++) {
    const comercial = i % 4 === 1;
    const auditoria = i % 7 === 3;
    const cumplimiento = i % 9 === 5;
    creados.push(
      crearExpediente(h, {
        identificador: `${1234500 + i} ${i % 3 === 0 ? "1K" : ""}`.trim(),
        nombre: `Persona De Prueba ${String(i + 1).padStart(2, "0")}`,
        cargo: CARGOS[i % CARGOS.length],
        agencia: AGENCIAS[i % AGENCIAS.length],
        gerencia: GERENCIAS[i % GERENCIAS.length],
        fechaIngreso: i % 2 === 0 ? `${anio}-${mes}-${String((i % 27) + 1).padStart(2, "0")}` : `${anio}-01-1${i % 9}`,
        tipoFuncionario: comercial ? "COMERCIAL" : auditoria ? "AUDITORIA" : cumplimiento ? "CUMPLIMIENTO" : "GENERAL",
        tipoGarantia: comercial ? (i % 3 === 1 ? "COMERCIAL_2" : "COMERCIAL_1") : "NINGUNA",
      }),
    );
  }

  // Estados, hojas físicas y observaciones: sin ellos el visor no tiene nada que
  // pintar y las mediciones no representan un expediente real.
  creados.forEach((expediente, i) => {
    const cuantosDocs = Math.max(1, expediente.requisitos.length - (i % 6) - 1);
    const cambios = expediente.requisitos.slice(0, cuantosDocs).map((r) => ({
      expedienteDocumentoId: r.expedienteDocumentoId,
      estado: "ENTREGADO",
      ...(r.requiereConteoHojas ? { hojasFisicas: 2 + (i % 4) } : {}),
    }));
    if (cambios.length) h.ok("documentacion.requisitos.guardar", { expedienteId: expediente.expedienteId, cambios });

    const pendiente = expediente.requisitos.find((r) => r.estado !== "ENTREGADO") ?? expediente.requisitos[0];
    if (i % 3 === 0) {
      h.ok("documentacion.requisito.actualizar", {
        expedienteDocumentoId: pendiente.expedienteDocumentoId,
        cambios: { observaciones: `Observación ${i + 1}: falta el sello de la agencia.` },
      });
    }
  });

  return { backend: h, creados };
}

/**
 * Arranca el servidor de la aplicación y espera a que esté listo.
 *
 * `produccion: true` sirve el `dist/` construido en lugar del modo desarrollo.
 * Es obligatorio para medir rendimiento: en modo desarrollo el navegador ejecuta
 * React sin minificar, con las comprobaciones de desarrollo activadas y los
 * módulos sin empaquetar. Con CPU estrangulada 4x eso da 4 fps —y no dice nada
 * de lo que va a sentir el área—, mientras la misma pantalla construida va
 * fluida. Medir el modo desarrollo es medir el compilador, no la aplicación.
 */
export async function arrancarVite(puerto, { produccion = false } = {}) {
  const argumentos = produccion
    ? ["vite", "preview", "--port", String(puerto), "--strictPort", "--host", "127.0.0.1"]
    : ["vite", "--port", String(puerto), "--strictPort"];
  const vite = spawn("npx", argumentos, { cwd: RAIZ, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolver, rechazar) => {
    const t = setTimeout(() => rechazar(new Error("El servidor no arrancó")), 90000);
    vite.stdout.on("data", (d) => {
      const texto = String(d);
      if (texto.includes("ready in") || texto.includes("Local:")) {
        clearTimeout(t);
        setTimeout(resolver, 900);
      }
    });
    vite.stderr.on("data", (d) => process.stderr.write(String(d)));
  });
  return vite;
}

/**
 * Página con sesión, backend interceptado y registro de errores de consola.
 *
 * `registro.errores` es la parte que no se puede negociar: una sonda que pasa
 * con la consola llena de errores no ha comprobado nada.
 */
export async function nuevaPagina(navegador, backend, registro, opciones = {}) {
  const puerto = opciones.puerto;
  const contexto = await navegador.newContext({
    viewport: opciones.viewport ?? ESCRITORIO,
    deviceScaleFactor: 1,
    reducedMotion: opciones.reducedMotion,
  });
  await contexto.addCookies([{ name: "bdp_perfil_sesion", value: "administrador", url: `http://localhost:${puerto}` }]);
  await contexto.addInitScript(
    ([clave, url, extras]) => {
      window.localStorage.setItem(clave, JSON.stringify({ dossiers: {}, settings: { scriptUrl: url } }));
      for (const [k, v] of Object.entries(extras ?? {})) window.localStorage.setItem(k, v);
    },
    ["bdp-documentacion", URL_DOC, opciones.almacenamiento ?? {}],
  );

  const pagina = await contexto.newPage();
  await pagina.route(
    (url) => url.hostname.endsWith("script.google.com"),
    async (ruta) => {
      /* Corte de backend simulado: ver `cortarBackend`. Se aborta la conexión
         en lugar de devolver un 500 porque lo que el módulo tiene que manejar es
         una red que no llega, no un servidor que contesta mal. */
      if (registro.cortado) return ruta.abort("connectionfailed");
      const peticion = ruta.request();
      if (peticion.method() !== "POST") {
        return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PAYLOAD_TALENTO) });
      }
      const cuerpo = JSON.parse(peticion.postData() ?? "{}");
      if (!String(cuerpo.accion ?? "").startsWith("documentacion.")) {
        return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      }
      if (registro.retardoMs) await new Promise((r) => setTimeout(r, registro.retardoMs));
      const salida = backend.call("doPost", { postData: { contents: JSON.stringify(cuerpo) } });
      const texto = salida.getContent();
      registro.llamadas += 1;
      registro.porAccion[cuerpo.accion] = (registro.porAccion[cuerpo.accion] ?? 0) + 1;
      const json = JSON.parse(texto);
      /* Los rechazos ESPERADOS —un duplicado, una validación— no son fallos de
         la sonda: son la respuesta correcta a una prueba que los provoca a
         propósito. Se anotan aparte para poder mirarlos, y solo los inesperados
         cuentan como fallo. */
      if (!json.ok) {
        const entrada = `${cuerpo.accion}: ${json.error?.message ?? json.error?.mensaje}`;
        if ((registro.esperados ?? []).some((patron) => patron.test(entrada))) registro.rechazos.push(entrada);
        else registro.fallos.push(entrada);
      }
      await ruta.fulfill({ status: 200, contentType: "application/json", body: texto });
    },
  );

  pagina.on("console", (m) => {
    if (m.type() === "error") anotarError(registro, m.text().slice(0, 300));
  });
  pagina.on("pageerror", (e) => anotarError(registro, `pageerror: ${e.message}`.slice(0, 300)));

  await pagina.goto(`http://localhost:${puerto}/`, { waitUntil: "domcontentloaded" });
  return pagina;
}

export function nuevoRegistro({ esperados = [], erroresEsperados = [] } = {}) {
  return {
    llamadas: 0,
    porAccion: {},
    errores: [],
    erroresIgnorados: [],
    fallos: [],
    rechazos: [],
    esperados,
    /* Igual que con los rechazos del backend: una sonda que corta la red a
       propósito PROVOCA errores de consola, y contarlos como fallo haría que la
       única forma de pasar fuera no probar el caso. Se listan los patrones que
       la sonda espera y solo lo demás cuenta. */
    erroresEsperados,
    retardoMs: 0,
    cortado: false,
  };
}

/**
 * Simula la caída del backend sin cortar el resto de la red.
 *
 * `context().setOffline(true)` parece la herramienta obvia y es la equivocada:
 * corta TODO, incluido `localhost`, así que la propia aplicación deja de
 * cargarse y lo que se mide es un `ERR_INTERNET_DISCONNECTED` del navegador, no
 * el comportamiento del módulo sin backend. Lo que le pasa al área es otra cosa:
 * la aplicación está servida por Vercel y viva, y lo que no responde es Apps
 * Script. Eso es lo que se reproduce aquí, con un interruptor que lee el propio
 * interceptor del arnés.
 */
export function cortarBackend(registro) {
  registro.cortado = true;
}

/** Devuelve el backend al aire. */
export function restaurarBackend(registro) {
  registro.cortado = false;
}

/** Entra al módulo de Documentación y espera a que la consola esté pintada. */
export async function abrirDocumentacion(pagina) {
  await pagina.getByRole("button", { name: "Documentación", exact: true }).first().click();
  // La cortina de carga tiene un mínimo perceptible y un tope duro; con el
  // backend en memoria se cruza rápido, pero se espera al armazón, no a un
  // tiempo fijo.
  await pagina.waitForSelector(".doc-console", { timeout: 20000 });
  await pagina.waitForTimeout(1200);
}

/** Va a una sección del módulo por su etiqueta de la navegación. */
export async function irASeccion(pagina, etiqueta) {
  await pagina.getByRole("button", { name: etiqueta, exact: true }).last().click();
  await pagina.waitForTimeout(1000);
}

/** Clasifica un error de consola en «esperado por la sonda» o fallo real. */
function anotarError(registro, texto) {
  if ((registro.erroresEsperados ?? []).some((patron) => patron.test(texto))) registro.erroresIgnorados.push(texto);
  else registro.errores.push(texto);
}

/** Imprime el resultado de una comprobación y devuelve si pasó. */
export function comprobar(etiqueta, ok, detalle = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${etiqueta}${detalle ? ` — ${detalle}` : ""}`);
  return ok;
}

/** Cierra Vite y el navegador, y sale con el código que corresponda. */
export async function terminar({ vite, navegador, fallos, registro }) {
  if (registro?.errores?.length) {
    console.log(`\n  ✗ ${registro.errores.length} error(es) de consola:`);
    for (const e of registro.errores.slice(0, 8)) console.log(`      ${e}`);
    fallos += registro.errores.length;
  } else if (registro) {
    console.log("  ✓ cero errores de consola");
  }
  if (registro?.erroresIgnorados?.length) {
    console.log(`  · ${registro.erroresIgnorados.length} error(es) de consola esperado(s) (la sonda los provoca)`);
  }
  if (registro?.rechazos?.length) {
    console.log(`\n  · ${registro.rechazos.length} rechazo(s) esperado(s) del backend (la sonda los provoca):`);
    for (const r of registro.rechazos.slice(0, 5)) console.log(`      ${r}`);
  }
  if (registro?.fallos?.length) {
    console.log(`\n  ✗ ${registro.fallos.length} respuesta(s) de error del backend:`);
    for (const f of registro.fallos.slice(0, 8)) console.log(`      ${f}`);
    fallos += registro.fallos.length;
  }
  console.log(fallos ? `\n${fallos} comprobación(es) fallida(s).\n` : "\nTodo en verde.\n");
  await navegador?.close();
  vite?.kill("SIGTERM");
  process.exit(fallos ? 1 : 0);
}

export { chromium };
