/**
 * Sonda del ENLACE PÚBLICO de una evaluación.
 *
 * ── El fallo que reproduce ──────────────────────────────────────────────────
 * «Creo una evaluación, la publico, me da un enlace. A mí me abre. A nadie más:
 * dice *No existe ninguna evaluación con ese código*.»
 *
 * Para reproducirlo hacen falta DOS navegadores, y por eso esto es una sonda y
 * no una prueba de unidad:
 *
 *   · el del RECLUTADOR, con su sesión del ATS y la conexión del módulo guardada
 *     en `localStorage`;
 *   · el del POSTULANTE, que no tiene sesión, ni configuración, ni nada: solo un
 *     enlace que le llegó por WhatsApp.
 *
 * La sonda recorre el camino completo del postulante —abrir, leer la portada,
 * escribir sus datos, responder y enviar— y comprueba además que lo enviado
 * quedó en el libro y que nunca viajó la llave de administración.
 *
 *     node qa/sonda-enlace-publico.mjs
 */

import { chromium } from "playwright";
import {
  abrirEvaluaciones,
  arrancarServidor,
  comprobar,
  dato,
  nuevoNavegante,
  nuevoRegistro,
  puertoAlAzar,
  seccion,
  sembrarBackend,
  terminar,
  MOVIL,
  URL_EVALUACIONES,
} from "./arnes-evaluaciones.mjs";

/** Referencia del despliegue de pruebas, tal como la lleva un enlace. */
const REFERENCIA = /\/macros\/s\/([A-Za-z0-9_-]+)\/exec/.exec(URL_EVALUACIONES)[1];

const PUERTO = Number(process.argv[3] ?? puertoAlAzar());
const ESCENARIO = process.argv[2] ?? "completo";

/* ------------------------------------------------------------------ */
/* Escenario 1 · el camino completo del postulante                     */
/* ------------------------------------------------------------------ */

async function completo() {
  const { backend, codigo, titulo } = sembrarBackend();
  const servidor = await arrancarServidor(PUERTO);
  const navegador = await chromium.launch();
  const registro = nuevoRegistro();

  dato("código de la evaluación publicada", codigo);

  /* ---------------------------------------------------------------- */
  seccion("El reclutador copia el enlace");

  const reclutador = await nuevoNavegante(navegador, backend, registro, {
    puerto: PUERTO,
    comoReclutador: true,
  });
  await abrirEvaluaciones(reclutador, PUERTO);

  const fila = reclutador.getByText(titulo).first();
  comprobar(await fila.count() > 0, "la evaluación publicada aparece en la lista del módulo");

  // El enlace, tal como la interfaz lo entrega: se lee del portapapeles.
  await reclutador.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const botonEnlace = reclutador.getByRole("button", { name: /Enlace/ }).first();
  let enlace = "";
  if (await botonEnlace.count()) {
    await botonEnlace.click();
    await reclutador.waitForTimeout(700);
    enlace = await reclutador.evaluate(() => navigator.clipboard.readText());
  }
  dato("enlace que entrega la interfaz", enlace || "(no se pudo leer)");
  comprobar(enlace.includes(codigo), "el enlace contiene el código de la evaluación", enlace);
  comprobar(
    /[?&]b=[A-Za-z0-9_-]{20,}/.test(enlace),
    "y lleva dentro la referencia del despliegue, que es lo que lo hace portátil",
    enlace,
  );
  comprobar(
    !/Solo en este equipo/i.test((await reclutador.locator("body").innerText()).replace(/\s+/g, " ")),
    "la interfaz no lo marca como «solo en este equipo»",
  );

  // La comprobación desde el propio módulo: abre el enlace como una visita
  // anónima contra el despliegue que lleva dentro y dice qué contestó.
  seccion("El reclutador comprueba el enlace antes de enviarlo");
  await reclutador.getByText(titulo).first().click();
  await reclutador.waitForTimeout(2500);
  const botonComprobar = reclutador.getByRole("button", { name: /Comprobar/i }).first();
  if (await botonComprobar.count()) {
    await botonComprobar.click();
    await reclutador.waitForTimeout(2500);
    const textoComprobacion = (await reclutador.locator("body").innerText()).replace(/\s+/g, " ");
    comprobar(
      /Comprobado como lo verá el postulante/i.test(textoComprobacion),
      "el módulo confirma que el enlace responde",
      textoComprobacion.slice(0, 260),
    );
    const sinLlaveEnComprobacion = registro.conLlave.filter((a) => a === "openAssessment");
    comprobar(
      sinLlaveEnComprobacion.length === 0,
      "y la comprobación se hizo sin llave, como un postulante",
      sinLlaveEnComprobacion.join(", "),
    );
  } else {
    comprobar(false, "hay un botón para comprobar el enlace");
  }

  /* ---------------------------------------------------------------- */
  seccion("El postulante abre ese mismo enlace en su navegador");

  const postulante = await nuevoNavegante(navegador, backend, registro, {
    puerto: PUERTO,
    comoReclutador: false,
  });

  // Se navega al enlace TAL CUAL, cambiando solo el origen: el postulante recibe
  // la dirección del despliegue real y aquí el servidor de pruebas es local.
  const destino = enlace
    ? enlace.replace(/^https?:\/\/[^/]+/, `http://127.0.0.1:${PUERTO}`)
    : `http://127.0.0.1:${PUERTO}/#/evaluacion/${codigo}`;
  dato("dirección que abre el postulante", destino);
  await postulante.goto(destino, { waitUntil: "domcontentloaded" });
  await postulante.waitForTimeout(3500);

  const textoPantalla = (await postulante.locator("body").innerText()).replace(/\s+/g, " ");
  dato("primeros 200 caracteres de la pantalla", textoPantalla.slice(0, 200));

  comprobar(
    !/No se pudo abrir la evaluación/i.test(textoPantalla),
    "el postulante NO recibe «No se pudo abrir la evaluación»",
    textoPantalla.slice(0, 300),
  );
  comprobar(
    !/No existe ninguna evaluación con ese código/i.test(textoPantalla),
    "el postulante NO recibe «no existe ninguna evaluación con ese código»",
  );
  comprobar(
    new RegExp(titulo, "i").test(textoPantalla),
    "la portada muestra el título de la evaluación",
    textoPantalla.slice(0, 300),
  );
  comprobar(
    !/Iniciar sesión|Acceso|perfil/i.test(textoPantalla.slice(0, 120)),
    "no se le pide iniciar sesión ni registrarse",
  );

  /* ---------------------------------------------------------------- */
  seccion("El postulante escribe sus datos y empieza");

  const campoNombre = postulante.getByLabel(/Nombre completo/i).first();
  const campoDocumento = postulante.getByLabel(/Documento/i).first();
  const hayFormulario = (await campoNombre.count()) > 0 && (await campoDocumento.count()) > 0;
  comprobar(hayFormulario, "la portada pide nombre y documento, sin cuenta de usuario");

  if (hayFormulario) {
    await campoNombre.fill("María Quispe Rojas");
    await campoDocumento.fill("7654321 LP");
    const empezar = postulante.getByRole("button", { name: /Empezar|Comenzar|Iniciar/i }).first();
    comprobar(await empezar.count() > 0, "hay un botón para empezar la prueba");
    if (await empezar.count()) {
      await empezar.click();
      await postulante.waitForTimeout(4000);
    }
  }

  const enPrueba = (await postulante.locator("body").innerText()).replace(/\s+/g, " ");
  const empezada = registro.acciones.includes("startAttempt");
  comprobar(empezada, "el intento se creó en el backend real (`startAttempt`)");
  comprobar(
    !/No se pudo|error/i.test(enPrueba.slice(0, 160)),
    "la prueba se abre sin error",
    enPrueba.slice(0, 300),
  );

  /* ---------------------------------------------------------------- */
  seccion("Responde y envía");

  // Se responde lo que haya en pantalla: la sonda no depende del contenido
  // concreto de la evaluación de ejemplo, solo de que se pueda contestar. Las
  // opciones son botones con `aria-pressed`, no `input`s.
  const opciones = postulante.locator('button[aria-pressed="false"]');
  const cuantasOpciones = await opciones.count();
  dato("opciones ofrecidas en la pantalla", String(cuantasOpciones));
  for (let i = 0; i < Math.min(cuantasOpciones, 4); i += 1) {
    await postulante.locator('button[aria-pressed="false"]').first().click().catch(() => {});
    await postulante.waitForTimeout(120);
  }
  const textos = postulante.locator('input[type="text"], input[type="number"], textarea');
  const cuantosTextos = await textos.count();
  dato("campos de texto o número", String(cuantosTextos));
  for (let i = 0; i < Math.min(cuantosTextos, 4); i += 1) {
    await textos.nth(i).fill("42").catch(() => {});
  }
  const marcadas = await postulante.locator('button[aria-pressed="true"]').count();
  comprobar(marcadas > 0, "el postulante puede marcar respuestas", `marcadas: ${marcadas}`);

  // Avanzar hasta el final y enviar.
  for (let i = 0; i < 12; i += 1) {
    const siguiente = postulante.getByRole("button", { name: /Siguiente|Continuar/i }).first();
    if (!(await siguiente.count())) break;
    if (!(await siguiente.isEnabled())) break;
    await siguiente.click().catch(() => {});
    await postulante.waitForTimeout(500);
  }
  const enviar = postulante.getByRole("button", { name: /Enviar|Finalizar|Terminar/i }).first();
  if (await enviar.count()) {
    await enviar.click().catch(() => {});
    await postulante.waitForTimeout(1200);
    // Puede haber confirmación.
    const confirmar = postulante.getByRole("button", { name: /Enviar|Confirmar|Sí/i }).last();
    if (await confirmar.count()) await confirmar.click().catch(() => {});
    await postulante.waitForTimeout(4000);
  }

  const enviado = registro.acciones.includes("submitAttempt");
  comprobar(enviado, "el envío llegó al backend real (`submitAttempt`)", registro.acciones.join(", "));

  const intentos = backend.admin("listAttempts", { evaluacionId: sembrado(backend, codigo) });
  const lista = intentos.ok ? (intentos.datos?.intentos ?? []) : [];
  dato("intentos registrados en el libro", String(lista.length));
  comprobar(
    lista.length >= 1,
    "el intento del postulante quedó en el libro del área",
    intentos.ok ? "" : `la consulta falló: ${intentos.error?.mensaje}`,
  );
  if (lista.length >= 1) {
    const primero = lista[0];
    const participante = primero.participante ?? {};
    dato("participante registrado", JSON.stringify(participante));
    dato("estado del intento", String(primero.estado ?? ""));
    comprobar(
      JSON.stringify(participante).includes("María"),
      "con el nombre que escribió el postulante",
      JSON.stringify(primero).slice(0, 240),
    );
    comprobar(
      String(primero.estado ?? "") === "enviado" || String(primero.estado ?? "") === "calificado",
      "el intento quedó enviado, no a medias",
      `estado: ${primero.estado}`,
    );
    comprobar(
      (primero.respuestas ?? primero.totalRespuestas ?? 0) !== 0 || marcadas > 0,
      "las respuestas del postulante llegaron con el envío",
      JSON.stringify(primero).slice(0, 240),
    );
  }

  /* ---------------------------------------------------------------- */
  seccion("Seguridad");

  const accionesPublicas = ["openAssessment", "startAttempt", "saveProgress", "heartbeat", "submitAttempt"];
  const filtradas = registro.conLlave.filter((a) => accionesPublicas.includes(a));
  comprobar(
    filtradas.length === 0,
    "ninguna acción del postulante viajó con la llave de administración",
    filtradas.join(", "),
  );
  const soloPublicas = registro.sinLlave.every((a) => accionesPublicas.includes(a) || a === "ping");
  comprobar(soloPublicas, "el postulante solo pudo llamar a acciones públicas", registro.sinLlave.join(", "));

  const fuga = await postulante.evaluate(() => {
    const claves = [];
    for (let i = 0; i < window.localStorage.length; i += 1) claves.push(String(window.localStorage.key(i)));
    return claves;
  });
  dato("claves guardadas en el navegador del postulante", fuga.join(", ") || "(ninguna)");
  comprobar(
    !fuga.some((c) => /llave|admin/i.test(c)),
    "no se guardó ninguna llave en el navegador del postulante",
  );

  terminar(registro, navegador, servidor);
}

/* ------------------------------------------------------------------ */
/* Escenario 2 · el enlace de la versión anterior, sin referencia       */
/* ------------------------------------------------------------------ */

/**
 * Un enlace copiado ANTES de este arreglo no lleva `?b=`.
 *
 * Abierto en un navegador sin configuración, el módulo no puede saber a qué
 * despliegue pertenece. Lo que se comprueba aquí es que lo DIGA —y que diga cómo
 * arreglarlo— en lugar de contestar «no existe ninguna evaluación con ese
 * código», que es el mensaje que mandaba a buscar el problema donde no estaba.
 */
async function enlaceAntiguo() {
  const { backend, codigo } = sembrarBackend();
  const servidor = await arrancarServidor(PUERTO);
  const navegador = await chromium.launch();
  const registro = nuevoRegistro();

  seccion("Un enlace de la versión anterior (sin referencia del despliegue)");

  const postulante = await nuevoNavegante(navegador, backend, registro, { puerto: PUERTO });
  await postulante.goto(`http://127.0.0.1:${PUERTO}/#/evaluacion/${codigo}`, { waitUntil: "domcontentloaded" });
  await postulante.waitForTimeout(3000);

  const texto = (await postulante.locator("body").innerText()).replace(/\s+/g, " ");
  dato("pantalla", texto.slice(0, 240));
  comprobar(
    /no indica a qué servidor pertenece/i.test(texto),
    "dice que el enlace no indica a qué servidor pertenece",
    texto.slice(0, 240),
  );
  comprobar(
    !/No existe ninguna evaluación con ese código/i.test(texto),
    "y NO culpa al código de la evaluación",
  );
  comprobar(
    /copie el enlace otra vez|copie el enlace|vuelva a copiar|copie de nuevo|copiar el enlace/i.test(texto),
    "y explica el remedio: volver a copiar el enlace desde el módulo",
    texto.slice(0, 400),
  );
  comprobar(registro.llamadas === 0, "no se llamó a ningún backend a ciegas", `llamadas: ${registro.llamadas}`);

  terminar(registro, navegador, servidor);
}

/* ------------------------------------------------------------------ */
/* Escenario 3 · el módulo en modo demostración                        */
/* ------------------------------------------------------------------ */

/**
 * En modo demostración la evaluación existe SOLO en el navegador del
 * reclutador. Ningún enlace puede funcionar fuera, y lo que se comprueba es que
 * la interfaz lo advierta antes de que alguien lo envíe.
 */
async function demostracion() {
  const { backend } = sembrarBackend();
  const servidor = await arrancarServidor(PUERTO);
  const navegador = await chromium.launch();
  const registro = nuevoRegistro();

  seccion("El módulo en modo demostración avisa de que el enlace no sale de aquí");

  const reclutador = await nuevoNavegante(navegador, backend, registro, {
    puerto: PUERTO,
    comoReclutador: true,
    modoConexion: "demostracion",
  });
  await abrirEvaluaciones(reclutador, PUERTO);
  await reclutador.waitForTimeout(1200);

  const texto = (await reclutador.locator("body").innerText()).replace(/\s+/g, " ");
  comprobar(/Modo demostración/i.test(texto), "el módulo anuncia el modo demostración");
  comprobar(
    /no abrirán en el equipo de nadie más|no abrirán/i.test(texto),
    "y dice explícitamente que los enlaces no abrirán en otros equipos",
    texto.slice(0, 400),
  );

  terminar(registro, navegador, servidor);
}

/* ------------------------------------------------------------------ */
/* Escenario 4 · el postulante entra desde el móvil                    */
/* ------------------------------------------------------------------ */

async function movil() {
  const { backend, codigo, titulo } = sembrarBackend();
  const servidor = await arrancarServidor(PUERTO);
  const navegador = await chromium.launch();
  const registro = nuevoRegistro();

  seccion("El postulante abre el enlace en un teléfono");

  const postulante = await nuevoNavegante(navegador, backend, registro, {
    puerto: PUERTO,
    viewport: MOVIL,
    contexto: { isMobile: true, hasTouch: true },
  });
  const enlace = `http://127.0.0.1:${PUERTO}/#/evaluacion/${codigo}?b=${REFERENCIA}`;
  await postulante.goto(enlace, { waitUntil: "domcontentloaded" });
  await postulante.waitForTimeout(3000);

  const texto = (await postulante.locator("body").innerText()).replace(/\s+/g, " ");
  comprobar(new RegExp(titulo, "i").test(texto), "la portada abre en 390 px de ancho", texto.slice(0, 200));

  // Se mide el desplazamiento HORIZONTAL de la página, no la caja de cada
  // elemento: las manchas decorativas del fondo son enormes a propósito y viven
  // dentro de un contenedor que las recorta, así que contarlas daría un falso
  // positivo en todas las pantallas.
  const horizontal = await postulante.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    visible: document.documentElement.clientWidth,
    textos: [...document.querySelectorAll("p, h1, h2, h3, span, button, label, input, code")]
      .filter((el) => {
        const caja = el.getBoundingClientRect();
        return caja.width > 0 && caja.right > document.documentElement.clientWidth + 2;
      })
      .map((el) => `${el.tagName}.${String(el.className).slice(0, 40)}`),
  }));
  comprobar(
    horizontal.scroll <= horizontal.visible + 2,
    "la página no se desplaza en horizontal",
    `${horizontal.scroll} px de contenido en ${horizontal.visible} px de pantalla`,
  );
  comprobar(
    horizontal.textos.length === 0,
    "ningún texto ni control se sale de la pantalla",
    horizontal.textos.join("\n"),
  );

  const nombre = postulante.getByLabel(/Nombre completo/i).first();
  comprobar(await nombre.count() > 0, "el formulario de datos se puede rellenar en el móvil");

  terminar(registro, navegador, servidor);
}

/* ------------------------------------------------------------------ */
/* Escenario 4 bis · quien prueba el módulo sin configurar nada        */
/* ------------------------------------------------------------------ */

/**
 * El propio reclutador abriendo su enlace de demostración.
 *
 * Es el único caso en el que un enlace sin referencia debe abrir: la evaluación
 * está en ESE navegador. Lo que se comprueba es que abra —no se puede castigar a
 * quien está probando— y que la pantalla diga que es una vista local que nadie
 * más podrá abrir.
 */
async function demostracionPropia() {
  const { backend } = sembrarBackend();
  const servidor = await arrancarServidor(PUERTO);
  const navegador = await chromium.launch();
  const registro = nuevoRegistro();

  seccion("El reclutador abre su propio enlace de demostración");

  // Un navegador con una evaluación en la demostración local y SIN haber tocado
  // nunca el panel de conexión: no hay configuración guardada.
  const pagina = await nuevoNavegante(navegador, backend, registro, {
    puerto: PUERTO,
    initScript: `window.localStorage.setItem("bdp-evaluaciones-demo", ${JSON.stringify(
      JSON.stringify({
        documentos: {
          ev_local: {
            evaluacion: {
              id: "ev_local",
              codigo: "EV-LOCAL-1",
              titulo: "Prueba hecha en este equipo",
              descripcion: "",
              estado: "publicada",
              versionVigenteId: "vr_local",
              instrucciones: { v: 1, b: [] },
              aplicacion: { duracionMinutos: 10, intentosMaximos: 1, ventanaInicio: "", ventanaFin: "" },
              participante: {
                campos: [
                  { clave: "nombre", etiqueta: "Nombre completo", obligatorio: true, activo: true },
                  { clave: "documento", etiqueta: "Documento de identidad (CI)", obligatorio: true, activo: true },
                ],
                requiereConsentimiento: false,
                textoConsentimiento: "",
                visibilidadResultado: "solo_envio",
              },
              integridad: {},
              tema: { acento: "cian", logoUrl: "", mostrarNumeracion: true },
              preguntas: 1,
            },
            secciones: [],
            versiones: [],
          },
        },
        versiones: [
          {
            id: "vr_local",
            evaluacionId: "ev_local",
            etiqueta: "v1.0",
            estado: "vigente",
            contenido: { evaluacion: {}, secciones: [] },
          },
        ],
        intentos: [],
        respuestas: [],
        eventos: [],
        solicitudes: {},
        tokens: {},
      }),
    )});`,
  });
  await pagina.goto(`http://127.0.0.1:${PUERTO}/#/evaluacion/EV-LOCAL-1`, { waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(3000);

  const texto = (await pagina.locator("body").innerText()).replace(/\s+/g, " ");
  dato("pantalla", texto.slice(0, 220));
  comprobar(
    /Vista local de demostración/i.test(texto),
    "avisa de que es una vista local",
    texto.slice(0, 260),
  );
  comprobar(
    !/no indica a qué servidor pertenece/i.test(texto),
    "y no la trata como un enlace huérfano: la evaluación está en este navegador",
  );

  terminar(registro, navegador, servidor);
}

/* ------------------------------------------------------------------ */
/* Escenario 5 · una convocatoria entera entrando a la vez             */
/* ------------------------------------------------------------------ */

/**
 * El límite de inicios por minuto lo toca gente legítima.
 *
 * Se agota el cupo del enlace desde el propio backend y se comprueba que el
 * postulante NO se queda en un callejón: la pantalla dice que hay mucha gente
 * entrando, cuenta atrás, y cuando el minuto pasa entra sola.
 */
async function avalancha() {
  const { backend, codigo } = sembrarBackend();
  const servidor = await arrancarServidor(PUERTO);
  const navegador = await chromium.launch();
  const registro = nuevoRegistro();

  seccion("Cupo de inicios agotado por una convocatoria simultánea");

  const cupo = backend.read("EV_LIMITS.START_RATE_PER_MINUTE");
  dato("cupo de inicios por minuto", String(cupo));

  const postulante = await nuevoNavegante(navegador, backend, registro, { puerto: PUERTO });
  await postulante.goto(`http://127.0.0.1:${PUERTO}/#/evaluacion/${codigo}?b=${REFERENCIA}`, {
    waitUntil: "domcontentloaded",
  });
  await postulante.waitForTimeout(3000);
  await postulante.getByLabel(/Nombre completo/i).first().fill("Última en la fila");
  await postulante.getByLabel(/Documento/i).first().fill("9999999");

  // El cupo se agota AQUÍ, con el navegador ya listo y el formulario relleno: la
  // ventana del límite es de un minuto, y llenarla antes de arrancar el servidor
  // y el navegador la dejaba caducar por el camino.
  for (let i = 0; i < cupo + 1; i += 1) {
    backend.publico("startAttempt", {
      codigo,
      participante: { nombre: `Relleno ${i}`, documento: `REL-${i}` },
    });
  }
  await postulante.getByRole("button", { name: /Comenzar/i }).first().click();
  await postulante.waitForTimeout(2500);

  const enEspera = (await postulante.locator("body").innerText()).replace(/\s+/g, " ");
  comprobar(
    /muchas personas entrando a la vez/i.test(enEspera),
    "se explica que hay una avalancha, no un error del postulante",
    enEspera.slice(0, 260),
  );
  comprobar(/Reintentando en \d+ s/i.test(enEspera), "y se anuncia el reintento con su cuenta atrás");
  comprobar(
    !/límite de inicios/i.test(enEspera),
    "sin echarle encima el vocabulario del servidor",
  );

  // Pasa el minuto: el cupo se renueva y el reintento automático debe entrar.
  backend.advanceClock(61000);
  await postulante.waitForTimeout(23000);
  const despues = (await postulante.locator("body").innerText()).replace(/\s+/g, " ");
  dato("pantalla tras el reintento", despues.slice(0, 180));
  comprobar(
    registro.acciones.filter((a) => a === "startAttempt").length >= 2,
    "el reintento se hizo solo, sin que nadie pulsara nada",
    registro.acciones.join(", "),
  );
  comprobar(
    /respondidas|Enviar la evaluación/i.test(despues),
    "y la prueba acaba abriéndose",
    despues.slice(0, 300),
  );

  terminar(registro, navegador, servidor);
}

/** Identificador de la evaluación a partir de su código, desde el libro. */
function sembrado(backend, codigo) {
  const lista = backend.admin("listEvaluations", {});
  const fila = (lista.datos?.items ?? []).find((e) => e.codigo === codigo);
  return fila ? fila.id : "";
}

const ESCENARIOS = {
  completo,
  "enlace-antiguo": enlaceAntiguo,
  demostracion,
  "demostracion-propia": demostracionPropia,
  movil,
  avalancha,
};

const elegido = ESCENARIOS[ESCENARIO];
if (!elegido) {
  console.error(`Escenario desconocido: ${ESCENARIO}. Opciones: ${Object.keys(ESCENARIOS).join(", ")}`);
  process.exit(2);
}
await elegido();
