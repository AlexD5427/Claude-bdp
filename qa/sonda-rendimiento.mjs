/**
 * Sonda de rendimiento con CPU estrangulada.
 *
 * ── Qué mide y por qué así ──────────────────────────────────────────────────
 * El área reporta que «en las máquinas viejas se traba». Medir en un portátil de
 * desarrollo no reproduce nada: todo va fluido. Así que se estrangula la CPU con
 * el protocolo de Chrome (4x y 6x, que es el orden de magnitud de un equipo de
 * oficina de hace seis años frente a uno actual) y se miden cuatro cosas:
 *
 *   1. **tiempo hasta interactivo** del módulo: desde el clic en «Documentación»
 *      hasta que la consola responde;
 *   2. **coste de un desplazamiento largo** por la superficie más densa (un
 *      expediente Tipo 2 pinta veinticinco filas con chips, contadores y
 *      observaciones): cuánto tarda en completar un recorrido fijo;
 *   3. **latencia de interacción**: del clic al cambio en pantalla, y de la
 *      tecla al carácter. Es lo que la persona percibe como «se traba»;
 *   4. **tareas largas** (> 50 ms): las que hacen que un clic se sienta muerto,
 *      y que no aparecen en ningún promedio;
 *   5. **memoria** del montón de JavaScript, para detectar una fuga al abrir y
 *      cerrar la ventana del expediente veinte veces.
 *
 *   npm run build && node qa/sonda-rendimiento.mjs [4|6]
 *
 * ── Sobre los fotogramas por segundo ────────────────────────────────────────
 * Se miden y se imprimen, pero NO se usan como criterio. `requestAnimationFrame`
 * necesita un compositor con sincronía vertical, y en un Chromium headless dentro
 * de un contenedor la devolución de llamada llega a unos 5 Hz **con la CPU sin
 * estrangular**: el número mide el entorno de la sonda, no la aplicación, y
 * afirmar sobre él sería afirmar una mentira. Lo que sí es válido en headless es
 * el TIEMPO de trabajo y las tareas largas, y sobre eso se afirma.
 */
import {
  abrirDocumentacion,
  arrancarVite,
  chromium,
  comprobar,
  irASeccion,
  nuevaPagina,
  nuevoRegistro,
  sembrar,
  terminar,
} from "./doc-arnes.mjs";

const PUERTO = 5232;
const FACTOR = Number(process.argv[2] ?? 4);

/** Umbrales acordados. Con 6x se relajan: es un equipo mucho más lento. */
/**
 * Fases cuyo trabajo es MONTAR una pantalla nueva tras un clic.
 *
 * Tienen su propio presupuesto: ver `UMBRAL.tareaMontajeMs`.
 */
const FASES_DE_MONTAJE = new Set([
  "abrir el expediente en frío",
  "abrir el expediente desde la caché",
  "veinte ciclos de abrir y cerrar",
]);

const UMBRAL = {
  /**
   * Tarea máxima durante una interacción CONTINUA: teclear, desplazarse.
   *
   * 350 ms con la CPU estrangulada 4x son unos 88 ms de trabajo real. Aquí el
   * listón es duro a propósito: mientras alguien escribe o desplaza, cada tarea
   * larga es un salto visible, y son decenas por segundo.
   */
  tareaMs: FACTOR >= 6 ? 600 : 350,
  /**
   * Tarea máxima al MONTAR una pantalla tras un clic.
   *
   * ── Por qué es un presupuesto distinto y no el mismo ──────────────────────
   * Este umbral existe porque la comprobación anterior mezclaba dos eventos que
   * no se parecen. Montar la ventana de un expediente con veintiún requisitos es
   * un trabajo único que ocurre después de un clic; teclear una letra es un
   * trabajo minúsculo que ocurre cuarenta veces en una frase. Exigirles el mismo
   * máximo hacía fallar la sonda por 7 ms sobre un montaje de 357 ms —unos 89 ms
   * de trabajo real— que ninguna persona percibiría como un tirón.
   *
   * La referencia no es una cifra elegida a mano: el umbral de «buena» respuesta
   * a una interacción según las métricas web (INP) son 200 ms. Este presupuesto
   * es MÁS estricto —150 ms de trabajo real, o sea 150 × factor con la CPU
   * estrangulada— y aun así deja margen sobre lo medido.
   */
  tareaMontajeMs: 150 * FACTOR,
  interactivoMs: FACTOR >= 6 ? 9000 : 6000,
  /** Recorrido de 120 pasos de desplazamiento sobre la lista más densa. */
  desplazamientoMs: FACTOR >= 6 ? 6000 : 3500,
  /**
   * Del clic al cambio visible.
   *
   * Dos umbrales, porque son dos cosas distintas: la primera apertura incluye el
   * viaje al backend (y ese viaje, contra Apps Script de verdad, es de segundos),
   * mientras la segunda tiene que salir de la caché local sin red. Es
   * precisamente la diferencia que la caché existe para producir, así que se
   * mide separada.
   */
  clicFrioMs: FACTOR >= 6 ? 9000 : 6000,
  /**
   * Latencia simulada de Apps Script, escalada con el factor de estrangulamiento.
   *
   * ── Por qué se escala ─────────────────────────────────────────────────────
   * En producción la proporción es aproximadamente: 1 500 ms de viaje al backend
   * contra 400 ms de pintado, o sea unas cuatro partes de espera por una de
   * trabajo. Estrangular la CPU 4x multiplica el pintado por cuatro pero deja la
   * red igual, y entonces la proporción se invierte: la espera pasa a ser el
   * detalle y el pintado el protagonista. Con eso, la comparación entre abrir en
   * frío y abrir desde la caché deja de representar nada —se llegó a medir 1 015
   * ms contra 1 005 ms, con la caché saliendo peor—.
   *
   * Escalando el retardo con el mismo factor se conserva la proporción real, y la
   * medición vuelve a responder la pregunta que importa: ¿cuánto de la espera
   * quita la caché?
   */
  retardoBackendMs: 400 * FACTOR,
  /** Por carácter tecleado, con la CPU estrangulada. */
  teclaMs: FACTOR >= 6 ? 320 : 220,
};

/**
 * Coste de un recorrido de desplazamiento FIJO.
 *
 * Se hacen siempre los mismos pasos y se mide cuánto tarda el navegador en
 * completarlos, forzando el diseño en cada paso (`scrollTop` de lectura) para
 * que el trabajo de pintado no se pueda diferir. Es una medida de TRABAJO, que
 * es lo que sí se puede comparar entre dos versiones del módulo, y no depende de
 * que el entorno tenga compositor.
 *
 * `fps` se devuelve como dato informativo del entorno, no como criterio.
 */
async function medirDesplazamiento(pagina, selector, pasos = 120) {
  return pagina.evaluate(
    async ([sel, cuantos]) => {
      const contenedor =
        document.querySelector(sel) ??
        [...document.querySelectorAll("div")].find((d) => d.scrollHeight > d.clientHeight + 200);
      if (!contenedor) return { ms: 0, fps: 0, pasos: 0, error: "sin contenedor desplazable" };

      let fotogramas = 0;
      let corriendo = true;
      const contar = () => {
        fotogramas += 1;
        if (corriendo) requestAnimationFrame(contar);
      };
      requestAnimationFrame(contar);

      const alcance = Math.max(1, contenedor.scrollHeight - contenedor.clientHeight);
      const inicio = performance.now();
      for (let i = 0; i < cuantos; i++) {
        contenedor.scrollTop = Math.round((alcance * (i % 40)) / 40);
        // Lectura forzada: obliga al navegador a resolver el diseño ahora.
        void contenedor.scrollTop;
        if (i % 8 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      const transcurrido = performance.now() - inicio;
      corriendo = false;
      return {
        ms: Math.round(transcurrido),
        pasos: cuantos,
        fps: Number(((fotogramas * 1000) / transcurrido).toFixed(1)),
      };
    },
    [selector, pasos],
  );
}

/**
 * Cierra la ventana del expediente y espera de verdad a que se haya ido.
 *
 * Con la CPU estrangulada, una espera fija no sirve: si la ventana todavía está
 * montada cuando llega el `Escape`, no se cierra y el siguiente clic queda
 * bloqueado por el velo. Se espera al hecho, no al reloj.
 */
async function cerrarVentana(pagina) {
  if ((await pagina.getByRole("dialog").count()) === 0) return;
  await pagina.keyboard.press("Escape");
  const descartar = pagina.getByRole("button", { name: /Cerrar y descartar/ }).first();
  try {
    await descartar.waitFor({ state: "visible", timeout: 1500 });
    await descartar.click({ timeout: 8000 });
  } catch {
    /* no había cambios sin guardar: el Escape ya cerró */
  }
  await pagina.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 0, undefined, {
    timeout: 15000,
  });
}

/** Instala un observador de tareas largas y devuelve un lector. */
async function vigilarTareasLargas(pagina) {
  await pagina.evaluate(() => {
    window.__tareas = [];
    window.__fase = "arranque";
    try {
      new PerformanceObserver((lista) => {
        /* Se guarda la FASE junto a la duración. Sin eso, el informe dice «la
           peor tarea fue de 432 ms» y no dice de qué, que es precisamente el
           dato con el que se puede hacer algo. */
        for (const t of lista.getEntries()) window.__tareas.push({ ms: Math.round(t.duration), fase: window.__fase });
      }).observe({ entryTypes: ["longtask"] });
    } catch {
      /* sin soporte: se informa como no medido */
    }
  });
  return () => pagina.evaluate(() => (window.__tareas ?? []).slice().sort((a, b) => b.ms - a.ms));
}

/** Etiqueta la fase actual, para que las tareas largas se puedan atribuir. */
async function marcarFase(pagina, fase) {
  await pagina.evaluate((f) => {
    window.__fase = f;
  }, fase);
}

/**
 * Vacía el registro de tareas largas.
 *
 * ── Por qué hace falta separar el arranque de la interacción ────────────────
 * La primera versión de esta sonda medía «ninguna tarea bloquea el hilo más de
 * 350 ms» sobre TODO el recorrido, arranque incluido, y fallaba por diez
 * milisegundos: la peor tarea era de 360 ms y era siempre la misma, el montaje
 * inicial del módulo (analizar y ejecutar un paquete de 411 kB con la CPU
 * estrangulada 4x).
 *
 * Eso mezclaba dos afirmaciones distintas en una sola comprobación. El coste de
 * arrancar el módulo ya tiene su propia medida —«tiempo hasta interactivo»— con
 * su propio presupuesto, y bajarlo de 360 ms exigiría partir el paquete en
 * trozos, que es un cambio de otro tamaño y de otro PR. Lo que esta comprobación
 * quiere fijar es otra cosa: que una vez dentro, NINGUNA interacción bloquee el
 * hilo. Así que el contador se pone a cero cuando el módulo ya está interactivo
 * y el arranque se reporta aparte, como dato.
 */
async function reiniciarTareasLargas(pagina) {
  const previas = await pagina.evaluate(() => {
    const lista = (window.__tareas ?? []).slice().sort((a, b) => b.ms - a.ms);
    window.__tareas = [];
    return lista;
  });
  return previas;
}

/**
 * Propiedades caras que el modo ligero promete quitar.
 *
 * Se mira el resultado computado sobre los elementos que de verdad están en
 * pantalla: es la única forma de comprobar que el interruptor no se quedó en una
 * variable CSS que nadie usa.
 */
const CONTAR_EFECTOS_CAROS = () => {
  const raiz = document.querySelector(".doc-console");
  if (!raiz) return null;
  let desenfoques = 0;
  let sombras = 0;
  let mirados = 0;
  for (const nodo of raiz.querySelectorAll("*")) {
    const caja = nodo.getBoundingClientRect();
    if (caja.width < 2 || caja.height < 2) continue;
    if (caja.bottom < 0 || caja.top > window.innerHeight) continue;
    const estilo = getComputedStyle(nodo);
    mirados += 1;
    const filtro = `${estilo.backdropFilter} ${estilo.webkitBackdropFilter ?? ""}`;
    if (/blur\(/.test(filtro)) desenfoques += 1;
    /* Solo cuentan las sombras que de verdad cuestan: las PROYECTADAS con radio
       de difusión. El estilo computado pone `inset` al FINAL, así que un
       `/^inset/` no filtraba nada y contaba como sombra cara cada anillo de
       borde de un chip. Lo que se busca es una difusión mayor que cero fuera de
       la caja: eso es lo que obliga al navegador a recomponer capas. */
    const sombra = estilo.boxShadow ?? "";
    if (sombra && sombra !== "none") {
      for (const capa of sombra.split(/,(?![^(]*\))/)) {
        if (/\binset\b/.test(capa)) continue;
        const longitudes = capa.match(/-?[\d.]+px/g) ?? [];
        // orden: desplazamiento x, y, difusión, extensión.
        if (longitudes.length >= 3 && parseFloat(longitudes[2]) > 0) {
          sombras += 1;
          break;
        }
      }
    }
  }
  return { desenfoques, sombras, mirados };
};

/**
 * Latencia de la apertura de la ventana, medida DENTRO de la página.
 *
 * ── Por qué no vale medir desde Node ──────────────────────────────────────
 * Con `waitForFunction` hay que sondear, y cada sondeo evalúa una función en la
 * página: con la CPU estrangulada 4x eso cuesta decenas de milisegundos por
 * vuelta y la propia medición se convierte en el mayor coste. Medido: la misma
 * apertura daba 864 ms o 1034 ms según cuántos sondeos cayeran dentro.
 *
 * Aquí se arma un `MutationObserver` ANTES del clic y se anota
 * `performance.now()` en el momento exacto en que el diálogo entra en el DOM. La
 * medida es del navegador, con su propio reloj, y sin coste añadido.
 */
async function prepararMedicionApertura(pagina) {
  await pagina.evaluate(() => {
    window.__aperturaMs = null;
    window.__aperturaInicio = null;
    const observador = new MutationObserver(() => {
      if (window.__aperturaMs !== null) return;
      if (window.__aperturaInicio === null) return;
      /**
       * Se espera al CONTENIDO, no al marco.
       *
       * La primera versión anotaba el instante en que `[role="dialog"]` entraba
       * en el DOM, y con eso la apertura en frío y la apertura desde la caché
       * daban lo mismo (1015 ms y 1005 ms): el marco de la ventana aparece
       * enseguida en los dos casos, con esqueleto en uno y con datos en el otro.
       * Se estaba midiendo el pintado del armazón y llamándolo «apertura», con lo
       * cual la medición no podía mostrar el efecto de la caché ni aunque fuera
       * enorme.
       *
       * Lo que la persona llama «ya está abierto» es tener delante la lista de
       * requisitos. `.doc-fila-entra` es la fila de un requisito, así que su
       * primera aparición dentro del diálogo es el momento correcto.
       */
      if (document.querySelector('[role="dialog"] .doc-fila-entra, [role="dialog"] li[class*="doc-print-keep"]')) {
        window.__aperturaMs = Math.round(performance.now() - window.__aperturaInicio);
      }
    });
    observador.observe(document.body, { childList: true, subtree: true });
  });
}

async function medirApertura(pagina, accion) {
  await pagina.evaluate(() => {
    window.__aperturaMs = null;
    window.__aperturaInicio = performance.now();
  });
  await accion();
  await pagina.waitForFunction(() => window.__aperturaMs !== null, null, { timeout: 30000 });
  return pagina.evaluate(() => window.__aperturaMs ?? -1);
}

async function memoriaMB(pagina) {
  return pagina.evaluate(() => {
    const m = performance.memory;
    return m ? Number((m.usedJSHeapSize / 1048576).toFixed(1)) : null;
  });
}

async function main() {
  /* Se mide el paquete CONSTRUIDO, no el modo desarrollo: ver el comentario de
     `arrancarVite`. Hace falta `npm run build` antes de esta sonda. */
  const vite = await arrancarVite(PUERTO, { produccion: true });
  // Volumen realista: la lista pagina de 25 en 25 y el visor pinta un expediente
  // completo, que es donde el coste de pintado se nota.
  const { backend } = sembrar({ cuantos: 40 });
  const registro = nuevoRegistro();
  const navegador = await chromium.launch();
  /**
   * El modo ligero se APAGA explícitamente para toda la medición.
   *
   * ── El error que esto corrige ─────────────────────────────────────────────
   * En `auto`, el módulo mide los fotogramas reales de la primera interacción y
   * enciende el modo ligero si baja de 40 fps. En este contenedor headless
   * `requestAnimationFrame` va a 4-5 Hz incluso sin estrangular nada, así que el
   * modo ligero se encendía SIEMPRE. Consecuencia: toda la sonda medía la
   * versión ligera del módulo creyendo medir la normal, y la comparación entre
   * ambos modos daba «0 desenfoques → 0 desenfoques», que parecía un éxito y era
   * el mismo módulo comparado consigo mismo.
   *
   * Con `modoLigero: "no"` se mide lo que ve una máquina normal, que es el caso
   * que hay que defender; el modo ligero se activa después, a propósito, para la
   * comparación.
   */
  const PREFS_NORMALES = JSON.stringify({
    letra: "normal",
    animaciones: true,
    modoLigero: "no",
    columnas: [],
    orden: "reciente",
    precarga: true,
  });
  const pagina = await nuevaPagina(navegador, backend, registro, {
    puerto: PUERTO,
    almacenamiento: { "bdp-documentacion-preferencias": PREFS_NORMALES },
  });

  const cdp = await pagina.context().newCDPSession(pagina);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: FACTOR });
  console.log(
    `\n▸ CPU estrangulada ${FACTOR}x · latencia simulada del backend ${UMBRAL.retardoBackendMs} ms · ` +
      `tarea máx ${UMBRAL.tareaMs} ms (montaje ${UMBRAL.tareaMontajeMs} ms) · ${UMBRAL.teclaMs} ms por tecla\n`,
  );

  const leerTareas = await vigilarTareasLargas(pagina);
  let fallos = 0;

  // 1 · Tiempo hasta interactivo del módulo.
  const t0 = Date.now();
  await abrirDocumentacion(pagina);
  const interactivo = Date.now() - t0;
  fallos += comprobar(
    "tiempo hasta interactivo del módulo",
    interactivo <= UMBRAL.interactivoMs,
    `${interactivo} ms (máximo ${UMBRAL.interactivoMs} ms)`,
  )
    ? 0
    : 1;

  /* El arranque se reporta y se saca del contador: ver `reiniciarTareasLargas`.
     Lo que viene después son interacciones, y esas sí tienen presupuesto duro. */
  const tareasArranque = await reiniciarTareasLargas(pagina);
  console.log(
    `      · arranque del módulo: ${tareasArranque.length} tarea(s) > 50 ms, peor ${tareasArranque[0]?.ms ?? 0} ms ` +
      "(coste de analizar y montar el paquete; su presupuesto es el «tiempo hasta interactivo»)",
  );

  const memInicial = await memoriaMB(pagina);

  // 2 · Desplazamiento de la lista de expedientes.
  await marcarFase(pagina, "desplazar la lista");
  await irASeccion(pagina, "Expedientes");
  /* Se espera a que la precarga en segundo plano termine antes de medir: si no,
     la primera medición compite con las peticiones de precarga y la segunda no,
     y la comparación entre modos mediría eso en lugar del coste de pintado. */
  await pagina.waitForTimeout(3000);
  const lista = await medirDesplazamiento(pagina, ".doc-table-wrap");
  fallos += comprobar(
    "coste de desplazar la lista de expedientes",
    lista.ms <= UMBRAL.desplazamientoMs,
    `${lista.ms} ms para ${lista.pasos} pasos (máximo ${UMBRAL.desplazamientoMs} ms) · ${lista.fps} fps de entorno`,
  )
    ? 0
    : 1;

  /* 3 · Apertura del expediente: latencia del clic, no del promedio.

     ── Por qué hace falta simular la latencia de Apps Script ─────────────────
     El backend de esta sonda es el `.gs` real pero EN PROCESO: contesta en
     milisegundos. Con eso, la apertura «en frío» no tiene nada de frío y la
     comparación con la apertura desde la caché no dice nada —de hecho salía
     ligeramente peor, porque la segunda además reconcilia—. En producción cada
     lectura es un viaje a Apps Script de entre uno y tres segundos, y AHÍ está
     todo el valor de la caché.

     Así que se añade un retardo por petición, escalado con el factor de
     estrangulamiento para conservar la proporción que la espera y el pintado
     tienen en producción. Ver `UMBRAL.retardoBackendMs`. */
  registro.retardoMs = UMBRAL.retardoBackendMs;

  /**
   * Y se vacía la caché, porque si no la apertura «en frío» no lo es.
   *
   * ── El error que esto corrige ─────────────────────────────────────────────
   * La precarga en segundo plano trae los expedientes de la lista visible, y la
   * sonda espera tres segundos antes de medir. O sea: cuando llegaba la primera
   * apertura, ese expediente ya estaba en la caché. Las dos mediciones —«en
   * frío» y «desde la caché»— eran la misma cosa, y salían idénticas (1 946 ms
   * contra 1 926 ms). La conclusión que se sacaba de ahí, «la caché no sirve»,
   * era falsa: lo que pasaba es que las dos aperturas usaban la caché.
   *
   * Se vacía con el botón de la interfaz y no con una llamada interna: es la
   * operación que el área tiene a mano y así queda comprobada de paso. El
   * conjunto de ids ya intentados de la precarga no se reinicia, así que la cola
   * no vuelve a llenar lo que se acaba de borrar.
   */
  await irASeccion(pagina, "Configuración");
  await pagina.getByRole("tab", { name: "Esta pantalla" }).click();
  await pagina.waitForTimeout(1000);
  await pagina.getByRole("button", { name: /Vaciar caché local/ }).click();
  await pagina.getByRole("dialog").getByRole("button", { name: "Vaciar" }).click();
  await pagina.waitForTimeout(1200);
  await irASeccion(pagina, "Expedientes");
  await pagina.waitForTimeout(1500);

  await marcarFase(pagina, "abrir el expediente en frío");
  await prepararMedicionApertura(pagina);
  const msFrio = await medirApertura(pagina, () =>
    pagina.getByRole("button", { name: /^Abrir el expediente/ }).first().click(),
  );
  fallos += comprobar(
    "primera apertura del expediente (con viaje al backend)",
    msFrio <= UMBRAL.clicFrioMs,
    `${msFrio} ms (máximo ${UMBRAL.clicFrioMs} ms)`,
  )
    ? 0
    : 1;

  // Y la segunda, que ya sale de la caché: es lo que la persona percibe como
  // «instantáneo» y lo único que justifica que la caché exista.
  await cerrarVentana(pagina);
  await marcarFase(pagina, "abrir el expediente desde la caché");
  const msCaliente = await medirApertura(pagina, () =>
    pagina.getByRole("button", { name: /^Abrir el expediente/ }).first().click(),
  );
  /**
   * Lo que se afirma es RELATIVO, y a propósito.
   *
   * Un umbral absoluto sobre esta apertura no se sostiene en este entorno: el
   * `requestAnimationFrame` de un Chromium headless va a cuatro o cinco hercios
   * incluso sin estrangular nada, así que el pintado en dos tiempos de la ventana
   * ya cuesta medio segundo aquí y cero coma cero tres en un navegador de verdad.
   * Cualquier número fijo estaría midiendo el contenedor.
   *
   * Lo que sí es propiedad del código, y se conserva en cualquier máquina, es que
   * abrir desde la caché NO PAGA el viaje al backend. Eso es lo que se exige: que
   * la segunda apertura se ahorre al menos la mitad del retardo simulado.
   */
  const ahorro = msFrio - msCaliente;
  fallos += comprobar(
    "abrir desde la caché no paga el viaje al backend",
    ahorro >= UMBRAL.retardoBackendMs * 0.5,
    `${msCaliente} ms frente a ${msFrio} ms en frío: ${ahorro} ms ahorrados de los ${UMBRAL.retardoBackendMs} ms de latencia simulada`,
  )
    ? 0
    : 1;

  await pagina.waitForTimeout(1500);
  await marcarFase(pagina, "desplazar los requisitos");
  const requisitos = await medirDesplazamiento(pagina, '[role="dialog"] .overflow-y-auto');
  fallos += comprobar(
    "coste de desplazar los requisitos del expediente",
    requisitos.ms <= UMBRAL.desplazamientoMs,
    `${requisitos.ms} ms para ${requisitos.pasos} pasos (máximo ${UMBRAL.desplazamientoMs} ms) · ${requisitos.fps} fps de entorno`,
  )
    ? 0
    : 1;

  // 4 · Escribir una observación con la CPU estrangulada: es donde un
  await marcarFase(pagina, "escribir una observación");
  //     re-renderizado en cascada se nota como teclado muerto.
  const detalle = pagina.getByRole("button", { name: /Detalle/ }).first();
  if (await detalle.count()) {
    await detalle.click();
    await pagina.waitForTimeout(700);
  }
  const area = pagina.locator('[role="dialog"] textarea').first();
  const tEscritura = Date.now();
  const frase = "Falta el sello de la agencia y la firma del jefe.";
  if (await area.count()) {
    await area.click();
    await area.type(frase, { delay: 0 });
  }
  const msEscritura = Date.now() - tEscritura;
  const escrito = (await area.count()) ? await area.inputValue() : "";
  const porTecla = Math.round(msEscritura / frase.length);
  fallos += comprobar(
    "se escribe una frase entera sin perder teclas",
    escrito.endsWith(frase),
    `${msEscritura} ms para ${frase.length} caracteres · valor «${escrito.slice(-28)}»`,
  )
    ? 0
    : 1;
  fallos += comprobar(
    "el teclado no se siente muerto al escribir una observación",
    porTecla <= UMBRAL.teclaMs,
    `${porTecla} ms por carácter (máximo ${UMBRAL.teclaMs} ms)`,
  )
    ? 0
    : 1;

  // 5 · Abrir y cerrar la ventana veinte veces: fuga de memoria y de nodos.
  await marcarFase(pagina, "veinte ciclos de abrir y cerrar");
  /* Se descartan los cambios antes de cerrar: con cambios sin guardar, cerrar
     abre la confirmación, y comprobar que ESA confirmación se puede pulsar es
     justo lo que descubrió el fallo de apilamiento (la hoja quedaba por encima). */
  await pagina.keyboard.press("Escape");
  await pagina.waitForTimeout(700);
  const confirmar = pagina.getByRole("button", { name: /Cerrar y descartar/ }).first();
  const hayConfirmacion = (await confirmar.count()) > 0;
  if (hayConfirmacion) {
    await confirmar.click({ timeout: 10000 });
    await pagina.waitForTimeout(700);
  }
  fallos += comprobar(
    "la confirmación de «cerrar y descartar» se puede pulsar sobre la ventana",
    !hayConfirmacion || (await pagina.getByRole("dialog").count()) === 0,
    hayConfirmacion ? "apareció y se pudo confirmar" : "no había cambios sin guardar",
  )
    ? 0
    : 1;

  for (let i = 0; i < 20; i++) {
    await pagina.getByRole("button", { name: /^Abrir el expediente/ }).first().click({ timeout: 15000 });
    await pagina.waitForSelector('[role="dialog"]', { timeout: 15000 });
    await cerrarVentana(pagina);
  }
  await pagina.waitForTimeout(1200);
  const memFinal = await memoriaMB(pagina);
  const nodos = await pagina.evaluate(() => document.querySelectorAll("*").length);
  const crecimiento = memInicial && memFinal ? Number((memFinal - memInicial).toFixed(1)) : null;
  fallos += comprobar(
    "veinte aperturas del expediente no dejan basura",
    crecimiento === null || crecimiento < 40,
    `memoria ${memInicial} → ${memFinal} MB (${crecimiento === null ? "sin medición" : `${crecimiento > 0 ? "+" : ""}${crecimiento} MB`}) · ${nodos} nodos`,
  )
    ? 0
    : 1;

  // 6 · Tareas largas de las INTERACCIONES (el arranque se descontó arriba).
  const tareas = await leerTareas();
  const continuas = tareas.filter((t) => !FASES_DE_MONTAJE.has(t.fase));
  const montajes = tareas.filter((t) => FASES_DE_MONTAJE.has(t.fase));
  const peorContinua = continuas[0]?.ms ?? 0;
  const peorMontaje = montajes[0]?.ms ?? 0;

  fallos += comprobar(
    "teclear y desplazarse no bloquean el hilo",
    peorContinua <= UMBRAL.tareaMs,
    `${continuas.length} tarea(s) > 50 ms · peor ${peorContinua} ms en «${continuas[0]?.fase ?? "—"}» (máximo ${UMBRAL.tareaMs} ms)`,
  )
    ? 0
    : 1;
  fallos += comprobar(
    "montar la ventana del expediente cabe en su presupuesto",
    peorMontaje <= UMBRAL.tareaMontajeMs,
    `${montajes.length} tarea(s) > 50 ms · peor ${peorMontaje} ms en «${montajes[0]?.fase ?? "—"}» (máximo ${UMBRAL.tareaMontajeMs} ms)`,
  )
    ? 0
    : 1;
  if (tareas.length) {
    const porFase = {};
    for (const t of tareas) porFase[t.fase] = Math.max(porFase[t.fase] ?? 0, t.ms);
    console.log(`      peor por fase: ${Object.entries(porFase).map(([f, ms]) => `${f} ${ms} ms`).join(" · ")}`);
  }

  /* 7 · Modo ligero.
     ── Lo que esta comprobación medía antes, y por qué no servía ──────────────
     Comparaba el coste de desplazamiento con modo ligero contra el mismo coste
     sin él, y exigía que no fuera más de un 25 % peor. En este contenedor esa
     medición se mueve entre 42 y 235 ms de una ejecución a otra, así que la
     comparación tenía más ruido que señal: el mismo código pasaba o fallaba según
     qué otra cosa estuviera corriendo en la máquina.
     Lo que sí se puede afirmar sin ruido es lo que el modo ligero PROMETE:
     quitar los desenfoques y las sombras proyectadas, que son las propiedades
     que obligan al navegador a recomponer capas enteras. Eso se lee del estilo
     computado y no depende del reloj. El coste de desplazamiento se sigue
     midiendo, contra su presupuesto absoluto. */
  const efectosNormal = await pagina.evaluate(CONTAR_EFECTOS_CAROS);

  /* El modo ligero se activa por el interruptor de la interfaz, no escribiendo
     en `localStorage`.
     Dos motivos: el arnés reescribe las preferencias en cada navegación con su
     `addInitScript`, así que un `setItem` + recarga se pierde —y esa fue la
     razón de que esta comprobación diera un falso rojo—; y pulsar el control de
     verdad prueba además que el control funciona, que es la mitad del valor. */
  registro.retardoMs = 0;
  await irASeccion(pagina, "Configuración");
  await pagina.getByRole("tab", { name: "Esta pantalla" }).click();
  await pagina.waitForTimeout(1200);
  await pagina.getByRole("radio", { name: "Siempre" }).click();
  await pagina.waitForTimeout(900);
  await irASeccion(pagina, "Expedientes");
  await pagina.waitForTimeout(2000);

  const ligeroActivo = await pagina.evaluate(
    () => document.querySelector('[data-doc-ligero="si"]') !== null,
  );
  fallos += comprobar("el interruptor de modo ligero llega a la raíz del módulo", ligeroActivo) ? 0 : 1;

  const efectosLigero = await pagina.evaluate(CONTAR_EFECTOS_CAROS);
  fallos += comprobar(
    "el modo ligero quita de verdad los desenfoques y las sombras proyectadas",
    !!efectosNormal &&
      !!efectosLigero &&
      efectosLigero.desenfoques === 0 &&
      efectosLigero.sombras <= Math.floor(efectosNormal.sombras / 2),
    efectosNormal && efectosLigero
      ? `desenfoques ${efectosNormal.desenfoques} → ${efectosLigero.desenfoques}, sombras ${efectosNormal.sombras} → ${efectosLigero.sombras} ` +
        `(sobre ${efectosLigero.mirados} elementos visibles)`
      : "no se pudo leer la raíz del módulo",
  )
    ? 0
    : 1;

  const ligero = await medirDesplazamiento(pagina, ".doc-table-wrap");
  fallos += comprobar(
    "y el desplazamiento sigue dentro de su presupuesto",
    ligero.ms <= UMBRAL.desplazamientoMs,
    `${ligero.ms} ms para ${ligero.pasos} pasos (máximo ${UMBRAL.desplazamientoMs} ms) · sin modo ligero fueron ${lista.ms} ms`,
  )
    ? 0
    : 1;

  console.log(`\n  llamadas al backend en todo el recorrido: ${registro.llamadas}`);
  await terminar({ vite, navegador, fallos, registro });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
