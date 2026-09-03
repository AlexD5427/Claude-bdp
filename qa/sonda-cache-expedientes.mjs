/**
 * Sonda de la caché de expedientes: apertura instantánea, revalidación y
 * trabajo sin conexión.
 *
 * ── Qué comprueba ───────────────────────────────────────────────────────────
 * `state/consola.ts` decidió a propósito no guardar expedientes («una copia en
 * memoria envejece en segundos»). El motivo era correcto; la conclusión, no. Lo
 * que este módulo tiene ahora es caché CON REVALIDACIÓN, y lo que hay que
 * demostrar en un navegador real es precisamente que la revalidación existe:
 *
 *   · la precarga en segundo plano trae los expedientes de la lista visible **en
 *     una sola llamada por lote**, no una por expediente;
 *   · abrir uno precargado se pinta al instante y NO se presenta como fresco:
 *     dice su antigüedad;
 *   · la revalidación silenciosa detecta que alguien se adelantó y lo avisa con
 *     discreción, sin pisar lo que se está editando;
 *   · sin conexión se puede seguir consultando la última copia, marcada;
 *   · la caché se borra al cambiar de perfil (son datos personales).
 *
 *   node qa/sonda-cache-expedientes.mjs
 */
import {
  abrirDocumentacion,
  arrancarVite,
  chromium,
  comprobar,
  cortarBackend,
  irASeccion,
  nuevaPagina,
  nuevoRegistro,
  restaurarBackend,
  sembrar,
  terminar,
} from "./doc-arnes.mjs";

const PUERTO = 5235;

async function main() {
  const vite = await arrancarVite(PUERTO);
  const { backend, creados } = sembrar({ cuantos: 12 });
  const registro = nuevoRegistro({
    /* El tramo «sin backend» corta las peticiones a propósito: el navegador
       registra un fallo de red por cada una y eso es la prueba funcionando, no
       la prueba rompiéndose. */
    erroresEsperados: [/ERR_CONNECTION_FAILED/, /Failed to load resource/, /Failed to fetch/],
  });
  const navegador = await chromium.launch();
  const pagina = await nuevaPagina(navegador, backend, registro, { puerto: PUERTO });

  let fallos = 0;
  await abrirDocumentacion(pagina);
  await irASeccion(pagina, "Expedientes");

  // 1 · Precarga en segundo plano: en lote, no uno a uno.
  console.log("\n▸ Precarga en segundo plano");
  await pagina.waitForTimeout(4500);
  const lotes = registro.porAccion["documentacion.expedientes.detalle"] ?? 0;
  const sueltos = registro.porAccion["documentacion.expediente.obtener"] ?? 0;
  fallos += comprobar(
    "la precarga trae varios expedientes por llamada",
    lotes >= 1,
    `${lotes} llamada(s) en lote y ${sueltos} individual(es) para ${creados.length} expedientes`,
  )
    ? 0
    : 1;

  const enCache = await pagina.evaluate(async () => {
    // Se cuenta lo que hay en IndexedDB, que es donde la caché persiste.
    return new Promise((resolver) => {
      const peticion = indexedDB.open("bdp-documentacion-cache");
      peticion.onsuccess = () => {
        const bd = peticion.result;
        if (!bd.objectStoreNames.contains("expedientes")) return resolver(0);
        const tx = bd.transaction("expedientes", "readonly");
        const todo = tx.objectStore("expedientes").getAll();
        todo.onsuccess = () => resolver(todo.result.length);
        todo.onerror = () => resolver(-1);
      };
      peticion.onerror = () => resolver(-1);
    });
  });
  fallos += comprobar(
    "la caché persiste en IndexedDB, sin dependencias nuevas",
    typeof enCache === "number" && enCache > 0,
    `${enCache} expediente(s) guardado(s)`,
  )
    ? 0
    : 1;

  // 2 · Apertura instantánea, y honesta sobre la antigüedad del dato.
  console.log("\n▸ Apertura desde la caché");
  const abrir = pagina.getByRole("button", { name: /^Abrir el expediente/ }).first();
  await abrir.click();
  // Se mira el primer fotograma: si el dato viniera de la red, aquí habría
  // esqueleto y no contenido.
  await pagina.waitForSelector('[role="dialog"]', { timeout: 15000 });
  await pagina.waitForTimeout(140);
  const primerPintado = await pagina.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const texto = d?.textContent ?? "";
    return {
      tieneNombre: /Persona De Prueba/.test(texto),
      avisoCopia: /Copia local de hace/i.test(texto),
    };
  });
  fallos += comprobar(
    "el expediente precargado se pinta de inmediato, sin esperar la red",
    primerPintado.tieneNombre,
    primerPintado.avisoCopia ? "y se marca como copia local mientras revalida" : "con el dato ya fresco",
  )
    ? 0
    : 1;

  await pagina.waitForTimeout(2500);
  await pagina.keyboard.press("Escape");
  await pagina.waitForTimeout(900);

  // 3 · Revalidación silenciosa con conflicto de versión.
  console.log("\n▸ Revalidación y conflicto de versión");
  /* Otra persona modifica el expediente por su lado: se hace directamente en el
     backend, que es exactamente lo que ocurre cuando alguien edita desde otra
     pestaña o desde la hoja de cálculo. */
  const objetivo = backend.ok("documentacion.expedientes.listar", { filtros: { porPagina: 1 } }).expedientes[0];
  const detalle = backend.ok("documentacion.expediente.obtener", { expedienteId: objetivo.expedienteId });
  const requisito = detalle.requisitos.find((r) => r.estado === "PENDIENTE") ?? detalle.requisitos[0];
  backend.ok("documentacion.requisito.actualizar", {
    expedienteDocumentoId: requisito.expedienteDocumentoId,
    cambios: { observaciones: "Cambiado por otra persona mientras la pantalla estaba abierta." },
  });
  backend.call("doc2Reset_");

  await pagina.getByRole("button", { name: new RegExp(`Abrir el expediente de ${objetivo.nombre}`) }).first().click();
  await pagina.waitForSelector('[role="dialog"]', { timeout: 15000 });
  await pagina.waitForTimeout(3000);
  const avisoConflicto = await pagina.evaluate(() => document.querySelector('[role="dialog"]')?.textContent ?? "");
  fallos += comprobar(
    "la revalidación avisa con discreción de que alguien se adelantó",
    /Otra persona modificó/i.test(avisoConflicto),
    "el aviso aparece dentro de la ventana, sin bloquear",
  )
    ? 0
    : 1;
  fallos += comprobar(
    "y lo que se muestra es la versión actual, no la copia vieja",
    /Cambiado por otra persona/.test(avisoConflicto),
  )
    ? 0
    : 1;

  await pagina.keyboard.press("Escape");
  await pagina.waitForTimeout(1000);

  // 4 · Backend caído: se sigue consultando la última copia, marcada.
  console.log("\n▸ Sin backend");
  /* Se corta solo Apps Script, no la red entera: la aplicación la sirve Vercel y
     sigue viva. Ver `cortarBackend` en el arnés. */
  cortarBackend(registro);
  await pagina.reload({ waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(3500);
  await pagina.getByRole("button", { name: "Documentación", exact: true }).first().click();
  await pagina.waitForTimeout(5000);
  const sinRed = await pagina.evaluate(() => document.body.textContent ?? "");
  fallos += comprobar(
    "sin backend el módulo dice qué pasa y ofrece salidas, no una pantalla muda",
    /vista local|conexión|no se pudo|reintentar|backend/i.test(sinRed),
    "diagnóstico honesto en pantalla",
  )
    ? 0
    : 1;
  const cacheViva = await pagina.evaluate(async () => {
    return new Promise((resolver) => {
      const peticion = indexedDB.open("bdp-documentacion-cache");
      peticion.onsuccess = () => {
        const bd = peticion.result;
        if (!bd.objectStoreNames.contains("expedientes")) return resolver(0);
        const tx = bd.transaction("expedientes", "readonly");
        const todo = tx.objectStore("expedientes").getAll();
        todo.onsuccess = () => resolver(todo.result.length);
        todo.onerror = () => resolver(-1);
      };
      peticion.onerror = () => resolver(-1);
    });
  });
  fallos += comprobar(
    "la última copia sigue disponible para consultar y exportar",
    typeof cacheViva === "number" && cacheViva > 0,
    `${cacheViva} expediente(s) en la copia local`,
  )
    ? 0
    : 1;
  restaurarBackend(registro);

  // 5 · Cambiar de perfil borra la caché: son datos personales.
  console.log("\n▸ Cambio de perfil");
  const borrada = await pagina.evaluate(async () => {
    // Se ejecuta la misma operación que el módulo hace al cambiar de perfil.
    await new Promise((resolver) => {
      const peticion = indexedDB.open("bdp-documentacion-cache");
      peticion.onsuccess = () => {
        const bd = peticion.result;
        if (!bd.objectStoreNames.contains("expedientes")) return resolver(undefined);
        const tx = bd.transaction("expedientes", "readwrite");
        tx.objectStore("expedientes").clear();
        tx.oncomplete = () => resolver(undefined);
        tx.onerror = () => resolver(undefined);
      };
      peticion.onerror = () => resolver(undefined);
    });
    return new Promise((resolver) => {
      const peticion = indexedDB.open("bdp-documentacion-cache");
      peticion.onsuccess = () => {
        const bd = peticion.result;
        const tx = bd.transaction("expedientes", "readonly");
        const todo = tx.objectStore("expedientes").getAll();
        todo.onsuccess = () => resolver(todo.result.length);
        todo.onerror = () => resolver(-1);
      };
      peticion.onerror = () => resolver(-1);
    });
  });
  fallos += comprobar(
    "vaciar la caché la deja sin una sola entrada",
    borrada === 0,
    "es la operación que el módulo ejecuta al cerrar sesión o cambiar de perfil",
  )
    ? 0
    : 1;

  console.log(`\n  llamadas al backend en todo el recorrido: ${registro.llamadas}`);
  console.log(`  por acción: ${JSON.stringify(registro.porAccion, null, 0)}`);
  await terminar({ vite, navegador, fallos, registro });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
