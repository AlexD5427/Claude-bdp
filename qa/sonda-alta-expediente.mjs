/**
 * Sonda del alta de expediente, de punta a punta y contra el backend real.
 *
 * ── Qué recorre ─────────────────────────────────────────────────────────────
 * El camino completo que hace una persona del área: carnet sin formato impuesto,
 * cargo del catálogo `cargo_bdp`, marcar documentos generales, anotar hojas de
 * un documento físico, elegir tipo de funcionario y garantía, comprobar que los
 * requisitos de la rama llegan agrupados por subsección, conceder una prórroga y
 * guardar. Después comprueba en el LIBRO —el `.gs` real en memoria— que quedó lo
 * que se marcó.
 *
 *   node qa/sonda-alta-expediente.mjs
 *
 * ── Por qué en un navegador y no en jsdom ───────────────────────────────────
 * Porque `wizard.test.tsx` ya cubre la lógica en jsdom y hay cosas que allí no
 * existen: el candado de scroll, la superficie central sobre fondo atenuado, el
 * desplazamiento dentro de la hoja, el foco real y el número de llamadas al
 * backend. El alta en UNA llamada, en particular, solo se puede contar de verdad
 * mirando el tráfico.
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

const PUERTO = 5233;
const CARNET = "8877665 3K";

async function main() {
  const vite = await arrancarVite(PUERTO);
  const { backend } = sembrar({ cuantos: 6 });
  /* El recorrido provoca un duplicado a propósito: ese rechazo es la respuesta
     correcta, no un fallo. */
  const registro = nuevoRegistro({ esperados: [/Ya existe un expediente con ese carnet/i] });
  const navegador = await chromium.launch();
  const pagina = await nuevaPagina(navegador, backend, registro, { puerto: PUERTO });

  let fallos = 0;
  await abrirDocumentacion(pagina);
  await irASeccion(pagina, "Expedientes");

  console.log("\n▸ Asistente de alta");
  await pagina.getByRole("button", { name: /Nuevo expediente/ }).first().click();
  await pagina.waitForSelector('[role="dialog"]', { timeout: 15000 });

  // 1 · La superficie ya NO ocupa toda la pantalla: hoja central con aire.
  const caja = await pagina.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return null;
    const r = d.getBoundingClientRect();
    return {
      ancho: Math.round(r.width),
      alto: Math.round(r.height),
      izquierda: Math.round(r.left),
      ventana: window.innerWidth,
      alturaVentana: window.innerHeight,
      radio: getComputedStyle(d).borderTopLeftRadius,
    };
  });
  fallos += comprobar(
    "el asistente es una hoja central, no la pantalla entera",
    caja !== null && caja.izquierda > 20 && caja.ancho < caja.ventana - 40 && parseFloat(caja.radio) >= 12,
    caja ? `${caja.ancho}×${caja.alto} en una ventana de ${caja.ventana}×${caja.alturaVentana}, radio ${caja.radio}, margen izquierdo ${caja.izquierda}px` : "sin diálogo",
  )
    ? 0
    : 1;

  // 2 · El fondo no se desplaza mientras la hoja está abierta.
  const bloqueado = await pagina.evaluate(() => document.body.style.overflow);
  fallos += comprobar("el fondo queda bloqueado con el candado del módulo", bloqueado === "hidden", `overflow=${bloqueado}`) ? 0 : 1;

  // 3 · Identidad: carnet libre y cargo del catálogo.
  const campoCarnet = pagina.getByPlaceholder("Ej. 1234567 1K");
  await campoCarnet.click();
  await campoCarnet.type(CARNET, { delay: 8 });
  const escrito = await campoCarnet.inputValue();
  fallos += comprobar("el carnet se escribe entero, sin formato impuesto", escrito === CARNET, `«${escrito}»`) ? 0 : 1;

  await pagina.getByPlaceholder("Nombres y apellidos").fill("Camila Comercial Rojas");

  // Cargo: catálogo `cargo_bdp` con búsqueda en vivo y elección con teclado.
  await pagina.getByRole("combobox", { name: /Elige un cargo/ }).click();
  await pagina.waitForTimeout(500);
  const buscador = pagina.getByPlaceholder("Buscar o escribir uno nuevo…");
  await buscador.type("ofici", { delay: 15 });
  await pagina.waitForTimeout(400);
  const recuento = await pagina
    .locator('[role="listbox"] ~ p, [aria-live="polite"]')
    .filter({ hasText: /coincidencia|valor/ })
    .first()
    .textContent()
    .catch(() => "");
  await pagina.keyboard.press("Enter");
  await pagina.waitForTimeout(400);
  const cargo = await pagina.getByRole("combobox", { name: /OFICIAL|Elige un cargo/ }).first().textContent();
  fallos += comprobar(
    "el cargo se elige del catálogo con búsqueda y teclado",
    /OFICIAL/i.test(cargo ?? ""),
    `${(recuento ?? "").trim() || "sin recuento visible"} · elegido «${(cargo ?? "").trim()}»`,
  )
    ? 0
    : 1;

  await pagina.getByRole("button", { name: /Continuar/ }).click();
  await pagina.waitForTimeout(700);

  // 4 · Documentos generales: 16 filas, contador solo en los físicos.
  console.log("\n▸ Documentos generales");
  const generales = await pagina.evaluate(() => {
    const filas = [...document.querySelectorAll('[role="dialog"] li.doc-raised')];
    return filas.map((li) => ({
      nombre: li.querySelector("p")?.textContent?.trim().slice(0, 40) ?? "",
      contador: Boolean(li.querySelector('input[aria-label^="Hojas del documento"]')),
      sellos: [...li.querySelectorAll("span")].map((s) => s.textContent?.trim()).filter((t) => t === "Física" || t === "Física*" || t === "Digital"),
    }));
  });
  fallos += comprobar("son los 16 documentos generales de la lista del área", generales.length === 16, `${generales.length} filas`) ? 0 : 1;
  const conContador = generales.filter((g) => g.contador).length;
  fallos += comprobar(
    "el contador de hojas aparece solo en los físicos",
    conContador === 5,
    `${conContador} de 16 (antecedentes FELCC, REJAP, título, seguro de accidentes y seguro de vida)`,
  )
    ? 0
    : 1;
  const soloDigital = generales.find((g) => !g.contador);
  fallos += comprobar(
    "un documento solo digital no lleva contador ni oculto",
    Boolean(soloDigital) && !soloDigital.contador && soloDigital.sellos.includes("Digital"),
    `«${soloDigital?.nombre}…» con sellos ${JSON.stringify(soloDigital?.sellos)}`,
  )
    ? 0
    : 1;

  // Se marca la fotografía como entregada y se anotan 3 hojas del REJAP.
  const filaFoto = pagina.locator('[role="dialog"] li', { hasText: /^1 Fotografía en formato digital/ }).first();
  await filaFoto.getByRole("button", { name: "Entregado", exact: true }).click();
  const filaRejap = pagina.locator('[role="dialog"] li', { hasText: /^Registro Judicial de Antecedentes/ }).first();
  const contadorRejap = filaRejap.getByLabel(/Hojas del documento físico/);
  await contadorRejap.fill("");
  await contadorRejap.type("3", { delay: 20 });
  fallos += comprobar("el conteo de hojas se anota en la fila del documento", (await contadorRejap.inputValue()) === "3") ? 0 : 1;

  await pagina.getByRole("button", { name: /Continuar/ }).click();
  await pagina.waitForTimeout(700);

  // 5 · Tipo de funcionario: radiogrupo, marca de selección y revelado de la garantía.
  console.log("\n▸ Tipo de funcionario");
  const radios = await pagina.getByRole("radio").count();
  fallos += comprobar("las categorías son un radiogrupo navegable con teclado", radios >= 4, `${radios} opciones`) ? 0 : 1;

  const comercial = pagina.getByRole("radio", { name: /Funcionario área comercial/ });
  await comercial.click();
  await pagina.waitForTimeout(800);
  const marcada = await comercial.getAttribute("aria-checked");
  fallos += comprobar("la selección se anuncia y se marca, no solo con color", marcada === "true") ? 0 : 1;

  const garantiaVisible = await pagina.getByRole("radiogroup", { name: /garantía/i }).isVisible();
  fallos += comprobar("elegir «comercial» revela la elección de garantía", garantiaVisible) ? 0 : 1;

  await pagina.getByRole("radio", { name: /Tipo 1/ }).click();
  await pagina.waitForTimeout(500);
  await pagina.getByRole("button", { name: /Continuar/ }).click();
  await pagina.waitForTimeout(800);

  // 6 · Requisitos de la rama, agrupados por subsección con título.
  console.log("\n▸ Requisitos de la rama");
  const subsecciones = await pagina.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"] h4')].map((h) => h.textContent?.trim()).filter(Boolean),
  );
  fallos += comprobar(
    "los requisitos de garantía llegan en subsecciones con título",
    subsecciones.some((t) => /Garante con Bien Inmueble/i.test(t ?? "")) &&
      subsecciones.some((t) => /Garante Familiar/i.test(t ?? "")),
    JSON.stringify(subsecciones),
  )
    ? 0
    : 1;

  /* `li` a secas también cuenta los pasos del encabezado (son un `ol`): se
     filtra por la superficie de una fila de documento. */
  const filasRama = await pagina.locator('[role="dialog"] li.doc-raised').count();
  fallos += comprobar("la rama Tipo 1 añade sus cinco documentos", filasRama === 5, `${filasRama} filas`) ? 0 : 1;

  const sinContador = await pagina.locator('[role="dialog"] input[aria-label^="Hojas del documento"]').count();
  fallos += comprobar("ningún documento de garantía lleva contador de hojas", sinContador === 0, `${sinContador} contadores`) ? 0 : 1;

  await pagina.getByRole("button", { name: /Continuar/ }).click();
  await pagina.waitForTimeout(800);

  // 7 · Revisión honesta: recuentos, hojas y avisos con enlace al paso.
  console.log("\n▸ Revisión y guardado");
  const revision = await pagina.evaluate(() => document.querySelector('[role="dialog"]')?.textContent ?? "");
  fallos += comprobar(
    "la revisión resume los requisitos, las hojas físicas y lo que falta",
    /21/.test(revision) && /hoja/i.test(revision) && /Documentos físicos/i.test(revision),
    "recuento total, bloque de documentos físicos y su desglose",
  )
    ? 0
    : 1;
  fallos += comprobar(
    "avisa de la fecha de ingreso vacía con enlace al paso",
    /Sin fecha de ingreso/i.test(revision) && /Ir al paso/i.test(revision),
  )
    ? 0
    : 1;

  // 8 · Guardado: UNA sola llamada de escritura.
  const antes = { ...registro.porAccion };
  await pagina.getByRole("button", { name: /Guardar y abrir expediente/ }).click();
  await pagina.waitForTimeout(3500);

  const creadas = (registro.porAccion["documentacion.expediente.crear"] ?? 0) - (antes["documentacion.expediente.crear"] ?? 0);
  const guardados = (registro.porAccion["documentacion.requisitos.guardar"] ?? 0) - (antes["documentacion.requisitos.guardar"] ?? 0);
  const obtenidos = (registro.porAccion["documentacion.expediente.obtener"] ?? 0) - (antes["documentacion.expediente.obtener"] ?? 0);
  fallos += comprobar(
    "el alta completa viaja en UNA sola escritura",
    creadas === 1 && guardados === 0,
    `crear=${creadas}, requisitos.guardar=${guardados}, expediente.obtener=${obtenidos} (antes eran 4 viajes)`,
  )
    ? 0
    : 1;

  // 9 · Y en el libro quedó lo que se marcó.
  backend.call("doc2Reset_");
  const detalle = backend.ok("documentacion.expediente.obtener", { identificador: CARNET });
  const porCodigo = new Map(detalle.requisitos.map((r) => [r.codigo, r]));
  fallos += comprobar("el expediente quedó con la rama elegida", detalle.expediente.tipoGarantia === "COMERCIAL_1", detalle.expediente.tipoGarantia) ? 0 : 1;
  fallos += comprobar("con sus 21 requisitos", detalle.requisitos.length === 21, `${detalle.requisitos.length}`) ? 0 : 1;
  fallos += comprobar("la fotografía quedó entregada", porCodigo.get("foto-4x4")?.estado === "ENTREGADO") ? 0 : 1;
  fallos += comprobar("el REJAP guardó sus 3 hojas", porCodigo.get("rejap")?.hojasFisicas === 3, `${porCodigo.get("rejap")?.hojasFisicas}`) ? 0 : 1;
  fallos += comprobar(
    "la subsección quedó materializada por rama",
    porCodigo.get("garante-inmueble")?.subseccion === "1 Garante con Bien Inmueble",
    porCodigo.get("garante-inmueble")?.subseccion,
  )
    ? 0
    : 1;
  fallos += comprobar("el cargo del catálogo llegó al expediente", /OFICIAL/i.test(detalle.expediente.cargo), detalle.expediente.cargo) ? 0 : 1;

  // 10 · El visor se abre con los datos recién guardados y el fondo se libera.
  const ventana = await pagina.getByRole("dialog").count();
  fallos += comprobar("al guardar, el expediente se abre en el visor nuevo", ventana === 1, `${ventana} diálogo(s)`) ? 0 : 1;
  await pagina.keyboard.press("Escape");
  await pagina.waitForTimeout(1200);
  const liberado = await pagina.evaluate(() => document.body.style.overflow);
  fallos += comprobar("al cerrar, el candado de scroll se libera", liberado !== "hidden", `overflow=${JSON.stringify(liberado)}`) ? 0 : 1;

  // 11 · Duplicado: no se pierde lo escrito y se ofrece abrir el existente.
  console.log("\n▸ Carnet duplicado");
  await pagina.getByRole("button", { name: /Nuevo expediente/ }).first().click();
  await pagina.waitForSelector('[role="dialog"]', { timeout: 15000 });
  const otroCampo = pagina.getByPlaceholder("Ej. 1234567 1K");
  await otroCampo.click();
  await otroCampo.type(CARNET.replace(" ", "-"), { delay: 8 });
  await pagina.getByPlaceholder("Nombres y apellidos").fill("Otra Persona");
  // identidad → generales → categoría
  await pagina.getByRole("button", { name: /Continuar/ }).click();
  await pagina.waitForTimeout(600);
  await pagina.getByRole("button", { name: /Continuar/ }).click();
  await pagina.waitForTimeout(600);
  await pagina.getByRole("radio", { name: /Funcionario área auditoría/ }).click();
  await pagina.waitForTimeout(500);
  // categoría → específicos → revisión
  await pagina.getByRole("button", { name: /Continuar/ }).click();
  await pagina.waitForTimeout(600);
  await pagina.getByRole("button", { name: /Continuar/ }).click();
  await pagina.waitForTimeout(700);
  await pagina.getByRole("button", { name: /Guardar y abrir expediente/ }).click();
  await pagina.waitForTimeout(2500);
  const aviso = await pagina.evaluate(() => document.querySelector('[role="dialog"]')?.textContent ?? "");
  fallos += comprobar(
    "el duplicado se explica y ofrece abrir el expediente existente",
    /Ya existe un expediente con ese carnet/i.test(aviso) && /Abrir el expediente existente/i.test(aviso),
  )
    ? 0
    : 1;
  const nombreConservado = await pagina.getByPlaceholder("Nombres y apellidos").inputValue();
  fallos += comprobar(
    "y lo escrito NO se pierde",
    nombreConservado === "Otra Persona",
    `el nombre sigue siendo «${nombreConservado}»`,
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
