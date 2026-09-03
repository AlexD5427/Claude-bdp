/**
 * Arnés compartido de las sondas del módulo de Documentación.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * Cada sonda necesita lo mismo: un Vite sirviendo la aplicación, un Chromium con
 * la sesión iniciada, y las llamadas a `script.google.com` desviadas al backend
 * `.gs` REAL cargado en memoria por `scripts/documentacion-backend.mjs`. Tenerlo
 * copiado en seis archivos garantizaba que un cambio en la aplicación arreglara
 * dos sondas y dejara cuatro roídas.
 *
 * Lo que se ve en pantalla durante una sonda salió del `doPost` de verdad: no hay
 * respuestas inventadas, así que un cambio en un `.gs` se nota aquí.
 *
 * Requiere Playwright, que se instala aparte a propósito y NO entra en
 * `package.json` (rompería el `npm ci` de Vercel con un navegador de 150 MB):
 *
 *     npm i -D playwright && npx playwright install chromium --with-deps
 */

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { crearExpediente, loadInstalledBackend } from "../scripts/documentacion-backend.mjs";

export const RAIZ = new URL("..", import.meta.url).pathname;
export const URL_DOC = "https://script.google.com/macros/s/DOC_BACKEND_DE_PRUEBAS/exec";
export const ESCRITORIO = { width: 1500, height: 950 };

/** Payload mínimo del backend del talento, para que la aplicación no se cuelgue. */
export const PAYLOAD_TALENTO = {
  candidatos: [],
  competencias: [],
  perfiles: [],
  procesos: [],
  config: [],
  perfiles_cargo: [],
};

const AGENCIAS = ["LA PAZ", "SANTA CRUZ", "COCHABAMBA", "EL ALTO", "TARIJA", "ORURO", "POTOSI", "SUCRE"];
const GERENCIAS = ["GERENCIA DE RIESGOS", "GERENCIA DE NEGOCIOS", "GERENCIA DE OPERACIONES"];
const CARGOS = [
  "OFICIAL DE NEGOCIOS",
  "ANALISTA DE RIESGOS",
  "CAJERO",
  "JEFE DE AGENCIA",
  "AUDITOR INTERNO",
  "OFICIAL DE CUMPLIMIENTO",
];
const NOMBRES = [
  "Ana Quiroga Vargas", "Luis Fernando Mamani", "Rocío Casas Peña", "Jorge Ariel Salazar",
  "María Elena Choque", "Diego Antonio Rivas", "Paola Andrea Suárez", "Marcelo Ticona Flores",
  "Gabriela Nina Alvarado", "Ramiro Céspedes Ortiz", "Silvia Rojas Montaño", "Óscar Delgado Ríos",
  "Elena Villca Apaza", "Rubén Cardozo Loayza", "Ivana Muñoz Terceros", "Hugo Sandoval Pinto",
  "Lucía Ballón Arce", "Teresa Yujra Condori", "Nelson Aguilar Bravo", "Carla Zambrana Vaca",
  "Iván Poma Chuquimia", "Daniela Encinas Rocha", "Wilson Tarqui Ramos", "Fátima Alcocer Vidal",
  "Álvaro Siles Guzmán",
];

export function enDias(dias) {
  return new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
}

/**
 * Libro sembrado con veinticinco expedientes de las cinco ramas.
 *
 * Veinticinco es el tamaño de una página de la lista: es el número con el que la
 * precarga y el rendimiento se pueden medir de verdad. Se siembran también los
 * catálogos auxiliares —agencias, gerencias y CARGOS— porque el desplegable de
 * cargo es una de las cosas que hay que ver funcionando.
 */
export function sembrarLibro({ expedientes = NOMBRES.length } = {}) {
  const h = loadInstalledBackend();
  h.ok("documentacion.auxiliares.agregar", { columna: "agencia_bdp", valores: AGENCIAS });
  h.ok("documentacion.auxiliares.agregar", { columna: "gerencia_bdp", valores: GERENCIAS });
  h.ok("documentacion.auxiliares.agregar", { columna: "cargo_bdp", valores: CARGOS });

  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const creados = [];

  NOMBRES.slice(0, expedientes).forEach((nombre, i) => {
    const comercial = i % 4 === 1;
    const auditoria = i % 7 === 3;
    const cumplimiento = i % 5 === 0 && !comercial && !auditoria;
    const creado = crearExpediente(h, {
      identificador: `${1234500 + i} ${i % 2 === 0 ? "LP" : "SC"}`,
      nombre,
      cargo: comercial ? "OFICIAL DE NEGOCIOS" : auditoria ? "AUDITOR INTERNO" : CARGOS[i % CARGOS.length],
      agencia: AGENCIAS[i % AGENCIAS.length],
      gerencia: GERENCIAS[i % GERENCIAS.length],
      fechaIngreso: i % 2 === 0 ? `${anio}-${mes}-${String((i % 27) + 1).padStart(2, "0")}` : `${anio}-01-1${i % 9}`,
      tipoFuncionario: comercial ? "COMERCIAL" : auditoria ? "AUDITORIA" : cumplimiento ? "CUMPLIMIENTO" : "GENERAL",
      tipoGarantia: comercial ? (i % 3 === 1 ? "COMERCIAL_2" : "COMERCIAL_1") : "NINGUNA",
    });
    creados.push(creado);
  });

  // Estados, hojas físicas y observaciones, para que las pantallas tengan materia.
  creados.forEach((expediente, i) => {
    const cuantos = i % 5 === 0 ? expediente.requisitos.length : Math.max(0, expediente.requisitos.length - (i % 7) - 2);
    const cambios = expediente.requisitos.slice(0, cuantos).map((r) => ({
      expedienteDocumentoId: r.expedienteDocumentoId,
      estado: "ENTREGADO",
      ...(r.requiereConteoHojas ? { hojasFisicas: 1 + (i % 4) } : {}),
    }));
    if (cambios.length) h.ok("documentacion.requisitos.guardar", { expedienteId: expediente.expedienteId, cambios });
  });

  creados.slice(0, 6).forEach((expediente, i) => {
    const pendiente = expediente.requisitos.find((r) => r.estado !== "ENTREGADO") ?? expediente.requisitos[0];
    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: pendiente.expedienteDocumentoId,
      cambios: { observaciones: `Observación de prueba ${i + 1}: falta la última página.` },
    });
  });

  creados.slice(6, 9).forEach((expediente, i) => {
    const requisito = expediente.requisitos.find((r) => r.permiteProrroga);
    if (!requisito) return;
    h.ok("documentacion.prorroga.crear", {
      prorroga: {
        expedienteDocumentoId: requisito.expedienteDocumentoId,
        fechaProrroga: enDias(8 + i * 10),
        motivo: "El título está en legalización.",
      },
    });
  });

  return { backend: h, creados };
}

/* ------------------------------------------------------------------ */
/* Infraestructura                                                     */
/* ------------------------------------------------------------------ */

/**
 * Arranca `vite preview` sobre `dist/`.
 *
 * Se usa la versión CONSTRUIDA, no el servidor de desarrollo: las sondas de
 * rendimiento tienen que medir el código que se despliega, con su minificado y
 * su reparto de paquetes, no el que trae el instrumental de desarrollo.
 */
export async function arrancarServidor(puerto) {
  const servidor = spawn("npx", ["vite", "preview", "--port", String(puerto), "--strictPort", "--host", "127.0.0.1"], {
    cwd: RAIZ,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolver, rechazar) => {
    const t = setTimeout(() => rechazar(new Error(`El servidor no arrancó en el puerto ${puerto}. ¿Falta «npm run build»?`)), 60000);
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

/**
 * Página con sesión iniciada y el backend de Documentación desviado.
 *
 * `registro` acumula hechos que la sonda puede examinar después: cuántas llamadas
 * se hicieron, a qué acciones, cuáles fallaron y qué errores dejó la consola del
 * navegador. Contar acciones es lo que permite demostrar que la precarga trae
 * veinticinco expedientes en tres llamadas y no en veinticinco.
 */
export async function nuevaPagina(navegador, backend, registro, opciones = {}) {
  const puerto = opciones.puerto;
  const contexto = await navegador.newContext({
    viewport: opciones.viewport ?? ESCRITORIO,
    deviceScaleFactor: 1,
    ...(opciones.contexto ?? {}),
  });
  for (const host of ["localhost", "127.0.0.1"]) {
    await contexto.addCookies([{ name: "bdp_perfil_sesion", value: "administrador", url: `http://${host}:${puerto}` }]);
  }
  await contexto.addInitScript(
    ([clave, url]) => {
      window.localStorage.setItem(clave, JSON.stringify({ dossiers: {}, settings: { scriptUrl: url } }));
    },
    ["bdp-documentacion", URL_DOC],
  );
  if (opciones.initScript) await contexto.addInitScript(opciones.initScript);

  const pagina = await contexto.newPage();
  await pagina.route(
    (url) => url.hostname.endsWith("script.google.com"),
    async (ruta) => {
      const peticion = ruta.request();
      if (peticion.method() !== "POST") {
        return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PAYLOAD_TALENTO) });
      }
      const cuerpo = JSON.parse(peticion.postData() ?? "{}");
      if (!String(cuerpo.accion ?? "").startsWith("documentacion.")) {
        return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      }
      if (registro.sinRed) {
        return ruta.abort("internetdisconnected");
      }
      const salida = backend.call("doPost", { postData: { contents: JSON.stringify(cuerpo) } });
      const texto = salida.getContent();
      registro.llamadas += 1;
      registro.acciones.push(String(cuerpo.accion));
      const json = JSON.parse(texto);
      if (!json.ok) registro.fallos.push(`${cuerpo.accion}: ${json.error?.message ?? json.error?.mensaje}`);
      await ruta.fulfill({ status: 200, contentType: "application/json", body: texto });
    },
  );

  pagina.on("console", (m) => {
    if (m.type() === "error") registro.errores.push(m.text().slice(0, 300));
    if (m.type() === "warning" && /React|Warning/.test(m.text())) registro.avisos.push(m.text().slice(0, 300));
  });
  pagina.on("pageerror", (e) => registro.errores.push(`pageerror: ${e.message}`.slice(0, 300)));
  // Una caída del navegador no se distingue de un fallo de la aplicación en el
  // mensaje de Playwright («target closed»), y las dos cosas se arreglan de
  // maneras muy distintas. Se anota aparte.
  pagina.on("crash", () => registro.caidas.push("el navegador cerró la página"));

  await pagina.goto(`http://127.0.0.1:${puerto}/`, { waitUntil: "domcontentloaded" });
  return pagina;
}

export function nuevoRegistro() {
  return {
    llamadas: 0,
    acciones: [],
    fallos: [],
    errores: [],
    avisos: [],
    caidas: [],
    sinRed: false,
    /**
     * Errores de consola que la sonda ESPERA ver.
     *
     * La sonda que corta la red a propósito provoca un
     * `ERR_INTERNET_DISCONNECTED` en el navegador: es la prueba de que el corte
     * funcionó, no un defecto. Cada sonda declara los suyos con expresiones
     * regulares y el resto sigue contando como fallo.
     */
    erroresEsperados: [],
  };
}

/** Entra a un módulo por el dock. */
export async function irAModulo(pagina, etiqueta) {
  await pagina.getByRole("button", { name: etiqueta, exact: true }).first().click();
  await pagina.waitForTimeout(1200);
}

/** Abre Documentación y espera a que la consola esté lista (sin pantalla de carga). */
export async function abrirDocumentacion(pagina) {
  await irAModulo(pagina, "Documentación");
  await pagina
    .waitForFunction(() => !document.querySelector(".doc-carga"), { timeout: 15000 })
    .catch(() => {});
  await pagina.waitForTimeout(600);
}

/** Abre la sección de expedientes y espera a que la lista tenga filas. */
export async function abrirExpedientes(pagina) {
  await pagina.getByRole("button", { name: "Expedientes", exact: true }).last().click();
  await pagina.waitForFunction(() => document.querySelectorAll("table tbody tr").length > 0, { timeout: 20000 });
  await pagina.waitForTimeout(400);
}

/**
 * Cierra la ventana del expediente, pase lo que pase.
 *
 * Un `Escape` a secas no basta: si quedaron cambios sin guardar, la ventana
 * levanta encima una confirmación —también con `role="dialog"`— que tapa la
 * pantalla entera con su velo. La primera versión de la sonda de rendimiento
 * fallaba justo por eso: intentaba pulsar una fila de la tabla y el clic lo
 * interceptaba el velo de una confirmación que nadie había contestado.
 *
 * El bucle mira primero si hay confirmación (se identifica por su etiqueta) y la
 * contesta; si no la hay y sigue habiendo ventana, manda `Escape`; y si no queda
 * ninguna, termina. Ocho vueltas son de sobra para la pila más profunda que el
 * módulo puede montar (ventana → confirmación).
 *
 * La confirmación se busca por `aria-label` y NO por rol: al ser destructiva se
 * anuncia como `alertdialog`, y un selector que solo mirara `role="dialog"` la
 * daría por ausente —exactamente el fallo que dejaba la sonda de rendimiento
 * pulsando contra un velo invisible.
 */
export async function cerrarVentana(pagina) {
  const confirmacion = pagina.locator('[aria-label="Hay cambios sin guardar"]').first();
  const cualquiera = pagina.locator('[role="dialog"], [role="alertdialog"]');
  for (let intento = 0; intento < 8; intento += 1) {
    // `isVisible` y no `count`: mientras la confirmación se desvanece sigue en el
    // árbol, y pulsar un botón que está a punto de desaparecer deja a Playwright
    // esperando treinta segundos a que se «estabilice». Los fallos se ignoran a
    // propósito; la vuelta siguiente vuelve a mirar el estado real.
    if (await confirmacion.isVisible().catch(() => false)) {
      await confirmacion
        .getByRole("button", { name: "Cerrar y descartar" })
        .first()
        .click({ timeout: 3000 })
        .catch(() => {});
    } else if (await cualquiera.count()) {
      await pagina.keyboard.press("Escape");
    } else {
      return true;
    }
    await pagina.waitForTimeout(340);
  }
  return (await cualquiera.count()) === 0;
}

/** Abre el expediente de la fila indicada y devuelve su ventana. */
export async function abrirFila(pagina, indice = 0) {
  await cerrarVentana(pagina);
  const fila = pagina.locator("table tbody tr").nth(indice);
  await fila.scrollIntoViewIfNeeded();
  await fila.click();
  const ventana = pagina.locator('[role="dialog"]').first();
  await ventana.waitFor({ timeout: 30000 });
  return ventana;
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
    for (const f of registro.fallos.slice(0, 8)) console.log(`  ✗ ${f}`);
    if (registro.caidas?.length) {
      console.log(`Caídas del navegador de pruebas: ${registro.caidas.length} (no cuentan como fallo del módulo).`);
    }
    const esperados = registro.erroresEsperados ?? [];
    const inesperados = registro.errores.filter((e) => !esperados.some((patron) => patron.test(e)));
    const previstos = registro.errores.length - inesperados.length;
    if (previstos) console.log(`Errores de consola previstos por la sonda: ${previstos}.`);
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
    if (servidor) servidor.kill("SIGTERM");
    process.exit(salida);
  };
  void cerrar();
}
