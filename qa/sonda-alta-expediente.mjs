/**
 * Sonda del ALTA de un expediente, de principio a fin.
 *
 * ── Qué demuestra ───────────────────────────────────────────────────────────
 * El alta es la operación más larga del módulo: cinco pasos, dieciséis
 * documentos generales, la elección de categoría, los requisitos de la rama y el
 * guardado. Antes de este cambio el guardado eran CUATRO llamadas al backend
 * (crear, leer, guardar estados, crear prórrogas) y cada una podía fallar por su
 * cuenta, con lo que un corte a mitad dejaba un expediente creado y sin marcar.
 * Ahora es UNA llamada, y esta sonda lo comprueba contando las llamadas que
 * llegan al `doPost` real.
 *
 * De paso verifica lo que el área pidió y no existía:
 *
 *   · el CARNET se escribe como está en el documento (sin formato obligatorio);
 *   · un carnet repetido avisa y ofrece abrir el expediente que ya existe, sin
 *     perder nada de lo escrito;
 *   · el CARGO sale de la hoja Auxiliar (columna `cargo_bdp`);
 *   · los documentos físicos llevan CONTADOR DE HOJAS y el número llega al libro;
 *   · los requisitos de garantía aparecen agrupados por SUBSECCIÓN;
 *   · una prórroga concedida durante el alta queda creada.
 *
 * Todo contra el backend `.gs` de verdad: lo que se ve en pantalla salió del
 * mismo código que corre en Apps Script.
 *
 *     node qa/sonda-alta-expediente.mjs
 */

import { chromium } from "playwright";
import {
  abrirDocumentacion,
  abrirExpedientes,
  arrancarServidor,
  cerrarVentana,
  comprobar,
  dato,
  enDias,
  nuevaPagina,
  nuevoRegistro,
  seccion,
  sembrarLibro,
  terminar,
} from "./arnes-documentacion.mjs";

const PUERTO = 5233;

/** Carnet que NO existe en el libro sembrado (allí van del 1234500 al 1234524). */
const CARNET_NUEVO = "9876543 CB";
const NOMBRE_NUEVO = "Rodrigo Peñaranda Ibáñez";

async function main() {
  const { backend } = sembrarLibro();
  const servidor = await arrancarServidor(PUERTO);
  const navegador = await chromium.launch();
  const registro = nuevoRegistro();
  const pagina = await nuevaPagina(navegador, backend, registro, { puerto: PUERTO });
  await pagina.waitForTimeout(2000);
  await abrirDocumentacion(pagina);
  await abrirExpedientes(pagina);

  /* ---------------------------------------------------------------- */
  seccion("Apertura del asistente");

  await pagina.getByRole("button", { name: /Nuevo expediente/ }).first().click();
  const asistente = pagina.locator('[role="dialog"][aria-label="Nuevo expediente documental"]');
  await asistente.waitFor({ timeout: 20000 });
  comprobar(true, "el asistente abre como hoja centrada, no como pantalla completa");

  const caja = await asistente.boundingBox();
  const ventana = pagina.viewportSize();
  comprobar(
    caja !== null && caja.width < ventana.width - 40,
    "la hoja deja ver el módulo por detrás",
    caja ? `hoja ${Math.round(caja.width)} px de ${ventana.width} px` : "sin caja",
  );

  /* ---------------------------------------------------------------- */
  seccion("Paso 1 · Identidad, carnet libre y duplicado");

  const carnet = asistente.getByPlaceholder("Ej. 1234567 LP");
  comprobar(await carnet.count() > 0, "el carnet se pide con el formato del documento, sin plantilla obligatoria");

  // Primero un carnet QUE YA EXISTE, para ver el aviso de duplicado.
  await carnet.fill("1234500 LP");
  await asistente.getByPlaceholder("Nombres y apellidos").fill("Homónimo de prueba");
  await pagina.waitForTimeout(1400);
  const avisoDuplicado = asistente.getByText(/Ya existe un expediente con ese carnet/i).first();
  const hayAviso = await avisoDuplicado.count() > 0;
  comprobar(hayAviso, "un carnet repetido se avisa antes de guardar");
  if (hayAviso) {
    comprobar(
      (await asistente.getByRole("button", { name: /Abrir el expediente existente/ }).count()) > 0,
      "el aviso ofrece abrir el expediente que ya existe",
    );
    comprobar(
      (await asistente.getByPlaceholder("Nombres y apellidos").inputValue()) === "Homónimo de prueba",
      "lo escrito no se pierde con el aviso",
    );
  }

  // Y ahora los datos definitivos.
  await carnet.fill(CARNET_NUEVO);
  await asistente.getByPlaceholder("Nombres y apellidos").fill(NOMBRE_NUEVO);
  await pagina.waitForTimeout(900);
  comprobar(
    (await asistente.getByText(/Ya existe un expediente con ese carnet/i).count()) === 0,
    "al corregir el carnet el aviso desaparece",
  );

  // Cargo: sale de la hoja Auxiliar, columna `cargo_bdp`. El selector es un
  // botón que abre el listado, no un campo de texto.
  // Se busca por el NOMBRE ACCESIBLE del disparador («Cargo: sin elegir»), que
  // es justamente lo que oye quien usa lector de pantalla.
  const cargo = asistente.getByRole("button", { name: /^Cargo:/ });
  comprobar(await cargo.count() > 0, "el cargo se elige de una lista del libro y no se escribe a mano");
  comprobar(
    (await cargo.getAttribute("aria-label")) === "Cargo: sin elegir",
    "el desplegable se anuncia con su nombre y con lo que hay elegido",
    `nombre: ${await cargo.getAttribute("aria-label")}`,
  );
  await cargo.click();
  await pagina.waitForTimeout(400);
  const opciones = pagina.getByRole("option");
  const cuantosCargos = await opciones.count();
  dato("cargos ofrecidos por la hoja Auxiliar", String(cuantosCargos));
  comprobar(cuantosCargos >= 6, "los seis cargos sembrados en `cargo_bdp` llegan al desplegable");
  await opciones.filter({ hasText: "OFICIAL DE NEGOCIOS" }).first().click();
  await pagina.waitForTimeout(300);

  await asistente.getByRole("button", { name: /^Agencia:/ }).click();
  await pagina.waitForTimeout(350);
  await pagina.getByRole("option").filter({ hasText: "LA PAZ" }).first().click();
  await asistente.getByRole("button", { name: /^Gerencia:/ }).click();
  await pagina.waitForTimeout(350);
  await pagina.getByRole("option").filter({ hasText: "GERENCIA DE NEGOCIOS" }).first().click();
  await asistente.getByPlaceholder("Nombre o correo").fill("auxiliar@bdp.com");

  // Fecha de ingreso: el calendario propio del módulo.
  const fecha = asistente.getByRole("textbox", { name: /Fecha de ingreso/ }).first();
  if (await fecha.count()) await fecha.fill("2024-03-11");
  else await asistente.locator('input[type="date"]').first().fill("2024-03-11");
  await pagina.waitForTimeout(400);

  await asistente.getByRole("button", { name: /Continuar/ }).click();
  await pagina.waitForTimeout(900);

  /* ---------------------------------------------------------------- */
  seccion("Paso 2 · Los dieciséis generales y las hojas físicas");

  const filas = asistente.locator("li").filter({ has: pagina.getByRole("button", { name: "Entregado", exact: true }) });
  const cuantasFilas = await filas.count();
  dato("documentos generales en el paso", String(cuantasFilas));
  comprobar(cuantasFilas === 16, "el paso muestra los dieciséis generales vigentes (los dos retirados no aparecen)");

  const contadores = asistente.getByLabel(/Hojas del documento físico/);
  const cuantosContadores = await contadores.count();
  dato("documentos con contador de hojas", String(cuantosContadores));
  comprobar(cuantosContadores >= 3, "los documentos que se archivan en físico piden el número de hojas");

  // Se marcan cinco como entregados y se cuentan hojas en los que lo piden.
  for (let i = 0; i < 5; i += 1) {
    await filas.nth(i).getByRole("button", { name: "Entregado", exact: true }).click();
    await pagina.waitForTimeout(120);
  }
  await contadores.first().fill("7");
  await contadores.first().blur();
  await pagina.waitForTimeout(200);
  comprobar((await contadores.first().inputValue()) === "7", "el contador acepta el número escrito a mano");

  // Y con las flechas del teclado, que es como se cuenta un legajo.
  await contadores.first().focus();
  await pagina.keyboard.press("ArrowUp");
  await pagina.waitForTimeout(200);
  comprobar(
    (await contadores.first().inputValue()) === "8",
    "la flecha arriba suma una hoja",
    `valor: ${await contadores.first().inputValue()}`,
  );

  // Observación en el primer documento.
  await filas.first().getByRole("button", { name: /Añadir observación|Observación/ }).click();
  await pagina.waitForTimeout(300);
  const observacion = filas.first().locator("textarea").first();
  await observacion.fill("Entregó copia simple; falta la legalizada.");
  await observacion.blur();
  await pagina.waitForTimeout(300);

  // Prórroga en el primer documento que la admita.
  const conProrroga = asistente.getByRole("button", { name: "Conceder prórroga" }).first();
  let prorrogaPedida = false;
  if (await conProrroga.count()) {
    await conProrroga.click();
    await pagina.waitForTimeout(500);
    const campoFecha = asistente.getByRole("textbox", { name: /Fecha límite de la prórroga/ }).first();
    if (await campoFecha.count()) await campoFecha.fill(enDias(20));
    await asistente.getByPlaceholder("Por qué se concede el plazo").first().fill("El título está en legalización.");
    await pagina.waitForTimeout(300);
    prorrogaPedida = true;
  }
  comprobar(prorrogaPedida, "se puede conceder una prórroga durante el alta");

  await asistente.getByRole("button", { name: /Continuar/ }).click();
  await pagina.waitForTimeout(700);

  /* ---------------------------------------------------------------- */
  seccion("Paso 3 · Tipo de funcionario con el teclado");

  const grupo = asistente.getByRole("radiogroup", { name: "Tipo de funcionario" });
  const tarjetas = grupo.getByRole("radio");
  const cuantasCategorias = await tarjetas.count();
  dato("categorías ofrecidas", String(cuantasCategorias));
  comprobar(cuantasCategorias === 4, "las cuatro ramas se ofrecen como un grupo de opciones");

  // El patrón ARIA: con las flechas se recorre el grupo.
  await tarjetas.first().click();
  await pagina.waitForTimeout(400);
  comprobar(
    (await tarjetas.first().getAttribute("aria-checked")) === "true",
    "la categoría elegida queda marcada como tal para el lector de pantalla",
  );
  await pagina.keyboard.press("ArrowRight");
  await pagina.waitForTimeout(400);
  comprobar(
    (await tarjetas.nth(1).getAttribute("aria-checked")) === "true",
    "la flecha derecha mueve la elección a la siguiente categoría",
  );
  await pagina.keyboard.press("ArrowLeft");
  await pagina.waitForTimeout(400);

  const garantias = asistente.getByRole("radiogroup", { name: "Tipo de garantía comercial" });
  comprobar(await garantias.count() > 0, "al elegir comercial aparece la pregunta por el tipo de garantía");
  await garantias.getByRole("radio").first().click();
  await pagina.waitForTimeout(400);

  await asistente.getByRole("button", { name: /Continuar/ }).click();
  await pagina.waitForTimeout(800);

  /* ---------------------------------------------------------------- */
  seccion("Paso 4 · Requisitos de la rama, por subsección");

  const especificos = asistente.locator("li").filter({ has: pagina.getByRole("button", { name: "Entregado", exact: true }) });
  dato("requisitos propios de la garantía tipo 1", String(await especificos.count()));
  comprobar((await especificos.count()) > 0, "la rama trae sus propios requisitos");
  const textoPaso = (await asistente.innerText()).replace(/\s+/g, " ");
  comprobar(
    /Garante con bien inmueble/i.test(textoPaso) && /Garante familiar/i.test(textoPaso),
    "los requisitos de garantía se agrupan por subsección, como en la hoja del área",
  );

  await asistente.getByRole("button", { name: /Continuar/ }).click();
  await pagina.waitForTimeout(800);

  /* ---------------------------------------------------------------- */
  seccion("Paso 5 · Revisión y guardado en una sola llamada");

  const revision = (await asistente.innerText()).replace(/\s+/g, " ");
  comprobar(new RegExp(NOMBRE_NUEVO).test(revision), "la revisión muestra a quién se va a dar de alta");
  comprobar(/OFICIAL DE NEGOCIOS/.test(revision), "la revisión muestra el cargo elegido");

  const antes = registro.acciones.length;
  await asistente.getByRole("button", { name: /Guardar y abrir expediente/ }).click();
  await pagina
    .locator('[role="dialog"]')
    .filter({ hasText: NOMBRE_NUEVO })
    .first()
    .waitFor({ timeout: 40000 })
    .catch(() => {});
  await pagina.waitForTimeout(2500);

  const nuevas = registro.acciones.slice(antes);
  const creaciones = nuevas.filter((a) => a === "documentacion.expediente.crear").length;
  const guardados = nuevas.filter((a) => a === "documentacion.requisitos.guardar").length;
  const prorrogas = nuevas.filter((a) => a === "documentacion.prorroga.crear").length;
  dato("llamadas del guardado", nuevas.join(", ") || "ninguna");
  comprobar(creaciones === 1, "el alta se guarda con UNA llamada al backend", `crear: ${creaciones}`);
  comprobar(
    guardados === 0 && prorrogas === 0,
    "los estados y la prórroga viajan dentro de esa misma llamada",
    `guardar: ${guardados} · prórrogas: ${prorrogas}`,
  );
  comprobar(registro.fallos.length === 0, "ninguna llamada del alta falló", registro.fallos.join("\n"));

  /* ---------------------------------------------------------------- */
  seccion("Lo que quedó escrito en el libro");

  const listado = backend.ok("documentacion.expedientes.listar", { filtros: { texto: CARNET_NUEVO } });
  const encontrado = (listado.expedientes ?? []).find((e) => String(e.nombre ?? "").includes("Peñaranda"));
  comprobar(!!encontrado, "el expediente existe en el libro y se encuentra por su carnet");

  if (encontrado) {
    const detalle = backend.ok("documentacion.expediente.obtener", { expedienteId: encontrado.expedienteId });
    const entregados = detalle.requisitos.filter((r) => r.estado === "ENTREGADO");
    const conHojas = detalle.requisitos.filter((r) => Number(r.hojasFisicas ?? 0) > 0);
    const conObservacion = detalle.requisitos.filter((r) => String(r.observaciones ?? "").length > 0);
    dato("requisitos del expediente nuevo", String(detalle.requisitos.length));
    dato("entregados", String(entregados.length));
    dato("con hojas contadas", conHojas.map((r) => `${r.codigo}=${r.hojasFisicas}`).join(", ") || "ninguno");
    comprobar(detalle.requisitos.length === 21, "la rama comercial tipo 1 abre veintiún requisitos", `son ${detalle.requisitos.length}`);
    comprobar(entregados.length === 5, "los cinco marcados llegaron como entregados", `son ${entregados.length}`);
    comprobar(conHojas.length >= 1, "el conteo de hojas quedó guardado en el libro");
    comprobar(
      conHojas.some((r) => Number(r.hojasFisicas) === 8),
      "las ocho hojas contadas con el teclado son las que se guardaron",
      conHojas.map((r) => `${r.codigo}=${r.hojasFisicas}`).join(", "),
    );
    comprobar(conObservacion.length >= 1, "la observación escrita en el alta quedó guardada");
    const prorrogasLibro = backend.ok("documentacion.prorrogas.listar", { expedienteId: encontrado.expedienteId });
    comprobar(
      (prorrogasLibro.prorrogas ?? []).length >= 1,
      "la prórroga concedida en el alta existe en el libro",
      `son ${(prorrogasLibro.prorrogas ?? []).length}`,
    );
    comprobar(
      detalle.requisitos.some((r) => String(r.subseccion ?? "").length > 0),
      "los requisitos de garantía llevan su subsección grabada",
    );
  }

  await cerrarVentana(pagina);
  terminar(registro, navegador, servidor);
}

await main();
