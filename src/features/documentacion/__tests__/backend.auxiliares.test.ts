/**
 * Catálogos auxiliares, conteo de hojas y alta en una sola llamada.
 *
 * ── Por qué estas tres cosas juntas ─────────────────────────────────────────
 * Son las tres piezas del backend que la interfaz nueva estrena, y las tres
 * tienen la misma clase de riesgo: parecen triviales y fallan con los datos
 * reales. La hoja `Auxiliar` del área tiene columnas de longitudes distintas,
 * con huecos, con acentos y con duplicados por mayúsculas; el conteo de hojas es
 * un entero que no puede aparecer en un documento digital; y el alta en una
 * llamada tiene que ser idempotente y no dejar nada a medias.
 *
 * Todo se ejecuta contra los `.gs` REALES cargados en Node, con dobles de
 * `SpreadsheetApp`, `LockService` y `CacheService`.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { crearExpediente, loadInstalledBackend, type DocHarness } from "../../../../scripts/documentacion-backend.mjs";

/* ------------------------------------------------------------------ */
/* Ayudas                                                             */
/* ------------------------------------------------------------------ */

/** Escribe valores crudos en una columna de `Auxiliar`, tal cual, con huecos. */
function escribirColumna(h: DocHarness, cabecera: string, valores: (string | number | null)[]) {
  const hoja = h.spreadsheet.getSheetByName("Auxiliar")!;
  const ancho = Math.max(hoja.getLastColumn(), 1);
  const cabeceras = hoja.getRange(1, 1, 1, ancho).getValues()[0];
  let indice = -1;
  for (let i = 0; i < cabeceras.length; i++) {
    if (String(cabeceras[i] ?? "").trim() === cabecera) {
      indice = i + 1;
      break;
    }
  }
  if (indice < 0) {
    indice = ancho + 1;
    hoja.getRange(1, indice, 1, 1).setValues([[cabecera]]);
  }
  if (!valores.length) return indice;
  hoja.getRange(2, indice, valores.length, 1).setValues(valores.map((v) => [v ?? ""]));
  return indice;
}

/** Renombra una cabecera de `Auxiliar`, para probar la lectura normalizada. */
function renombrarCabecera(h: DocHarness, desde: string, hasta: string) {
  const hoja = h.spreadsheet.getSheetByName("Auxiliar")!;
  const ancho = Math.max(hoja.getLastColumn(), 1);
  const cabeceras = hoja.getRange(1, 1, 1, ancho).getValues()[0];
  for (let i = 0; i < cabeceras.length; i++) {
    if (String(cabeceras[i] ?? "").trim() === desde) {
      hoja.getRange(1, i + 1, 1, 1).setValues([[hasta]]);
      return;
    }
  }
  throw new Error(`No existe la cabecera ${desde}`);
}

/* ------------------------------------------------------------------ */
/* Auxiliares                                                         */
/* ------------------------------------------------------------------ */

describe("documentación · lectura de la hoja Auxiliar", () => {
  let h: DocHarness;

  beforeEach(() => {
    h = loadInstalledBackend();
  });

  it("crea las tres columnas, incluida cargo_bdp", () => {
    const hoja = h.spreadsheet.getSheetByName("Auxiliar")!;
    const cabeceras = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map((c: unknown) => String(c ?? ""));
    expect(cabeceras).toContain("agencia_bdp");
    expect(cabeceras).toContain("gerencia_bdp");
    expect(cabeceras).toContain("cargo_bdp");
  });

  it("lee columnas de longitudes DISTINTAS sin cortar la larga ni inventar en la corta", () => {
    // El caso real: trescientos cargos y nueve gerencias en la misma hoja.
    const cargos = Array.from({ length: 300 }, (_, i) => `CARGO ${String(i + 1).padStart(3, "0")}`);
    escribirColumna(h, "cargo_bdp", cargos);
    escribirColumna(h, "agencia_bdp", ["LA PAZ", "EL ALTO"]);

    const aux = h.ok("documentacion.auxiliares", { refrescar: true }).auxiliares;
    // Sin topes artificiales: si la columna tiene 300 valores, llegan los 300.
    expect(aux.cargo_bdp).toHaveLength(300);
    expect(aux.cargo_bdp[0]).toBe("CARGO 001");
    expect(aux.cargo_bdp[299]).toBe("CARGO 300");
    expect(aux.agencia_bdp).toEqual(["EL ALTO", "LA PAZ"]);
  });

  it("no se detiene en el primer hueco: una hoja escrita a mano los tiene", () => {
    escribirColumna(h, "cargo_bdp", ["OFICIAL DE NEGOCIOS", "", "", "ANALISTA DE RIESGOS", "", "CAJERO"]);
    const aux = h.ok("documentacion.auxiliares", { refrescar: true }).auxiliares;
    expect(aux.cargo_bdp).toEqual(["ANALISTA DE RIESGOS", "CAJERO", "OFICIAL DE NEGOCIOS"]);
  });

  it("deduplica por mayúsculas y acentos, conservando el texto del área", () => {
    escribirColumna(h, "agencia_bdp", ["LA PAZ", "la paz", "La Paz ", "COCHABAMBA", "Cochabámba"]);
    const aux = h.ok("documentacion.auxiliares", { refrescar: true }).auxiliares;
    // Dos agencias, no cinco. Y el texto que se conserva es el primero escrito.
    expect(aux.agencia_bdp).toEqual(["COCHABAMBA", "LA PAZ"]);
  });

  it("encuentra la columna aunque la cabecera se escriba distinto", () => {
    // El fallo real: bastaba un `Cargo_BDP` o un espacio final para que la
    // columna «no existiera» y el desplegable llegara vacío.
    escribirColumna(h, "cargo_bdp", ["JEFE DE AGENCIA"]);
    renombrarCabecera(h, "cargo_bdp", " Cargo_BDP ");
    const aux = h.ok("documentacion.auxiliares", { refrescar: true }).auxiliares;
    expect(aux.cargo_bdp).toEqual(["JEFE DE AGENCIA"]);
  });

  it("ordena en español: la Ñ y las tildes caen donde una persona las busca", () => {
    escribirColumna(h, "agencia_bdp", ["ZONA SUR", "ÑUFLO DE CHAVEZ", "AROMA", "ÁVAROA"]);
    const aux = h.ok("documentacion.auxiliares", { refrescar: true }).auxiliares;
    expect(aux.agencia_bdp[0]).toBe("AROMA");
    expect(aux.agencia_bdp[aux.agencia_bdp.length - 1]).toBe("ZONA SUR");
  });

  it("añadir un valor NO pisa los que ya están, aunque la columna tenga duplicados", () => {
    // Este era el fallo grave: se escribía en `2 + valoresDeduplicados`, que con
    // duplicados cae EN MEDIO de los datos y sustituye una agencia real.
    escribirColumna(h, "agencia_bdp", ["LA PAZ", "la paz", "EL ALTO", "el alto", "TARIJA"]);
    const antes = h.ok("documentacion.auxiliares", { refrescar: true }).auxiliares.agencia_bdp;
    expect(antes).toEqual(["EL ALTO", "LA PAZ", "TARIJA"]);

    h.ok("documentacion.auxiliares.agregar", { columna: "agencia_bdp", valores: ["POTOSI"] });
    const despues = h.ok("documentacion.auxiliares", { refrescar: true }).auxiliares.agencia_bdp;
    expect(despues).toEqual(["EL ALTO", "LA PAZ", "POTOSI", "TARIJA"]);

    // Y las cinco celdas originales siguen intactas en la hoja.
    const crudos = h.read<string[]>("doc2LeerAuxiliarCrudo_('agencia_bdp')");
    expect(crudos).toEqual(["LA PAZ", "la paz", "EL ALTO", "el alto", "TARIJA", "POTOSI"]);
  });

  it("añadir un valor que ya existe con otras mayúsculas no lo duplica", () => {
    escribirColumna(h, "cargo_bdp", ["OFICIAL DE NEGOCIOS"]);
    const res = h.ok("documentacion.auxiliares.agregar", { columna: "cargo_bdp", valores: ["oficial de negocios"] });
    expect(res.agregados).toEqual([]);
    expect(h.ok("documentacion.auxiliares", { refrescar: true }).auxiliares.cargo_bdp).toEqual(["OFICIAL DE NEGOCIOS"]);
  });

  it("registrar un expediente aprende su cargo sin borrar nada del catálogo", () => {
    escribirColumna(h, "cargo_bdp", ["ANALISTA"]);
    crearExpediente(h, { identificador: "CI-CARGO-2026", cargo: "Supervisor de Cartera" });
    const aux = h.ok("documentacion.auxiliares", { refrescar: true }).auxiliares;
    expect(aux.cargo_bdp).toContain("ANALISTA");
    expect(aux.cargo_bdp).toContain("Supervisor de Cartera");
  });

  it("un cargo fuera del catálogo es un aviso, nunca un bloqueo", () => {
    escribirColumna(h, "cargo_bdp", ["ANALISTA"]);
    // Se registra con un cargo que no está en la lista: el alta NO se detiene.
    const creado = h.pedir("documentacion.expediente.crear", {
      expediente: { identificador: "CI-AVISO-2026", nombre: "Nuevo Cargo", cargo: "PUESTO RECIÉN CREADO" },
    });
    expect(creado.ok).toBe(true);

    // El diagnóstico lo reporta, pero como hallazgo, no como error.
    const hallazgos = h.ok("documentacion.inconsistencias").hallazgos;
    const codigos = hallazgos.map((x: { codigo: string }) => x.codigo);
    // Aprende el valor al registrar, así que en la segunda vuelta ya no avisa:
    // lo importante es que en ningún caso impidió guardar.
    expect(codigos).not.toContain("cargo-bloqueado");
  });
});

/* ------------------------------------------------------------------ */
/* Conteo de hojas                                                    */
/* ------------------------------------------------------------------ */

describe("documentación · conteo de hojas de los documentos físicos", () => {
  let h: DocHarness;
  let expedienteId: string;
  let requisitos: { codigo: string; expedienteDocumentoId: string; requiereConteoHojas: boolean; hojasFisicas: number }[];

  beforeEach(() => {
    h = loadInstalledBackend();
    const creado = crearExpediente(h, { identificador: "CI-HOJAS-2026", nombre: "Hilda Hojas" });
    expedienteId = creado.expedienteId;
    requisitos = creado.requisitos;
  });

  const porCodigo = (codigo: string) => requisitos.find((r) => r.codigo === codigo)!;

  it("solo los requisitos con presentación física lo declaran", () => {
    const conConteo = requisitos.filter((r) => r.requiereConteoHojas).map((r) => r.codigo).sort();
    expect(conConteo).toEqual([
      "antecedentes-felcc",
      "rejap",
      "seguro-accidentes",
      "seguro-vida",
      "titulo-legalizado",
    ]);
    expect(porCodigo("foto-4x4").requiereConteoHojas).toBe(false);
    expect(porCodigo("cv").requiereConteoHojas).toBe(false);
  });

  it("guarda el conteo en la hoja y lo devuelve al leer", () => {
    const rejap = porCodigo("rejap");
    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: rejap.expedienteDocumentoId,
      cambios: { estado: "ENTREGADO", hojasFisicas: 3 },
    });

    const fila = h.rowsOf("ExpedienteDocumentos").find((f) => f.expediente_documento_id === rejap.expedienteDocumentoId)!;
    expect(Number(fila.hojas_fisicas)).toBe(3);

    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId });
    expect(detalle.requisitos.find((r: { codigo: string }) => r.codigo === "rejap").hojasFisicas).toBe(3);
  });

  it("rechaza el conteo en un documento digital, señalando el campo", () => {
    const foto = porCodigo("foto-4x4");
    const res = h.pedir("documentacion.requisito.actualizar", {
      expedienteDocumentoId: foto.expedienteDocumentoId,
      cambios: { hojasFisicas: 2 },
    });
    expect(res.ok).toBe(false);
    // Guardarlo en silencio dejaría un dato falso en un expediente laboral.
    expect(res.error.message).toMatch(/no se presenta en físico/i);
    expect(res.error.fields.hojas_fisicas).toBeTruthy();
  });

  it("rechaza lo que no es un entero entre 0 y 999", () => {
    const titulo = porCodigo("titulo-legalizado");
    for (const valor of [-1, 3.5, 1000, "muchas"]) {
      const res = h.pedir("documentacion.requisito.actualizar", {
        expedienteDocumentoId: titulo.expedienteDocumentoId,
        cambios: { hojasFisicas: valor },
      });
      expect(res.ok, `valor ${valor}`).toBe(false);
      expect(res.error.fields.hojas_fisicas).toBeTruthy();
    }
    // Y cero sí vale: es «lo conté y no tiene hojas todavía».
    const cero = h.pedir("documentacion.requisito.actualizar", {
      expedienteDocumentoId: titulo.expedienteDocumentoId,
      cambios: { hojasFisicas: 0 },
    });
    expect(cero.ok).toBe(true);
  });

  it("marcar «no aplica» CONSERVA el conteo, por si se revierte la decisión", () => {
    const seguro = porCodigo("titulo-legalizado");
    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: seguro.expedienteDocumentoId,
      cambios: { estado: "ENTREGADO", hojasFisicas: 4 },
    });
    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: seguro.expedienteDocumentoId,
      cambios: { estado: "NO_APLICA" },
    });
    const fila = h.rowsOf("ExpedienteDocumentos").find((f) => f.expediente_documento_id === seguro.expedienteDocumentoId)!;
    expect(Number(fila.hojas_fisicas)).toBe(4);
  });

  it("queda registrado en el historial, como cualquier otro cambio", () => {
    const rejap = porCodigo("rejap");
    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: rejap.expedienteDocumentoId,
      cambios: { hojasFisicas: 5 },
    });
    const historial = h.ok("documentacion.historial.consultar", { expedienteId }).historial;
    const linea = historial.find((x: { campo: string }) => x.campo === "hojas_fisicas");
    expect(linea).toBeTruthy();
    expect(linea.nuevo).toBe("5");
  });

  it("viaja al libro anual, a la columna PAGINAS del bloque de gestión", () => {
    const rejap = porCodigo("rejap");
    const felcc = porCodigo("antecedentes-felcc");
    h.ok("documentacion.requisitos.guardar", {
      expedienteId,
      cambios: [
        { expedienteDocumentoId: rejap.expedienteDocumentoId, estado: "ENTREGADO", hojasFisicas: 3 },
        { expedienteDocumentoId: felcc.expedienteDocumentoId, estado: "ENTREGADO", hojasFisicas: 2 },
      ],
    });

    const anio = new Date("2026-01-15T12:00:00").getFullYear();
    const filaLibro = h.rowsOf(`CONTROL INGRESOS ${anio}`).find((f) => f["ID EXPEDIENTE"] === "CI-HOJAS-2026")!;
    expect(Number(filaLibro.PAGINAS)).toBe(5);
    // Las columnas A-W del Excel del área no se tocan: el nombre sigue en su sitio.
    expect(filaLibro.Nombre).toBe("Hilda Hojas");
  });

  it("llega al reporte y a la exportación", () => {
    const rejap = porCodigo("rejap");
    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: rejap.expedienteDocumentoId,
      cambios: { hojasFisicas: 7 },
    });

    const completitud = h.ok("documentacion.reporte", { tipo: "completitud" });
    expect(completitud.columnas).toContain("Hojas físicas");
    const columna = completitud.columnas.indexOf("Hojas físicas");
    expect(completitud.filas[0][columna]).toBe(7);

    const pendientes = h.ok("documentacion.reporte", { tipo: "pendientes" });
    expect(pendientes.columnas).toContain("Hojas físicas");
    expect(pendientes.columnas).toContain("Subsección");
  });
});

/* ------------------------------------------------------------------ */
/* Alta en una sola llamada                                           */
/* ------------------------------------------------------------------ */

describe("documentación · alta completa en una sola llamada", () => {
  let h: DocHarness;

  beforeEach(() => {
    h = loadInstalledBackend();
  });

  it("crea, marca, cuenta hojas y concede prórroga en la misma operación", () => {
    const res = h.ok("documentacion.expediente.crear", {
      expediente: {
        identificador: "1234567 LP",
        nombre: "Única Llamada",
        cargo: "Oficial de Negocios",
        agencia: "LA PAZ",
        fechaIngreso: "2026-03-02",
        tipoFuncionario: "CUMPLIMIENTO",
        requisitos: [
          { codigo: "foto-4x4", estado: "ENTREGADO" },
          { codigo: "rejap", estado: "ENTREGADO", hojasFisicas: 2 },
          { codigo: "cv", observaciones: "Lo trae mañana firmado." },
        ],
        prorrogas: [
          {
            codigo: "examen-uif",
            // Tres meses desde la contratación, contados con el reloj del
            // backend: una fecha fija en el código caduca y la prueba empieza a
            // fallar sola un día cualquiera.
            fechaProrroga: h.read<string>("doc2FechaMasDias_(90)"),
            motivo: "Tres meses desde la contratación.",
          },
        ],
      },
    });

    expect(res.creado).toBe(true);
    // `completa: true` es lo que le dice al cliente que NO hace falta la ruta de
    // cuatro pasos: sin esta marca, el frontend nuevo contra un backend viejo
    // creería que se aplicó y no se aplicó nada.
    expect(res.completa).toBe(true);
    expect(res.aplicados).toBe(3);
    expect(res.prorrogasCreadas).toBe(1);
    expect(res.fallidos).toEqual([]);

    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId: res.expedienteId });
    const porCodigo: Record<string, { estado: string; hojasFisicas: number; observaciones: string }> = {};
    for (const r of detalle.requisitos) porCodigo[r.codigo] = r;
    expect(porCodigo["foto-4x4"].estado).toBe("ENTREGADO");
    expect(porCodigo["rejap"].hojasFisicas).toBe(2);
    expect(porCodigo["cv"].observaciones).toBe("Lo trae mañana firmado.");
    expect(detalle.prorrogas).toHaveLength(1);
    expect(detalle.prorrogas[0].codigo).toBe("examen-uif");
    expect(detalle.prorrogas[0].situacion).not.toBe("vencida");
  });

  it("el alta mínima sigue funcionando y NO se declara completa", () => {
    const res = h.ok("documentacion.expediente.crear", {
      expediente: { identificador: "CI-MINIMA-2026", nombre: "Alta Mínima" },
    });
    expect(res.creado).toBe(true);
    expect(res.completa).toBe(false);
  });

  it("ignora en silencio un requisito que no aplica a la rama elegida", () => {
    // El asistente pudo tener marcado algo de una categoría que la persona
    // cambió después: tirar el alta por eso sería peor que ignorarlo.
    const res = h.ok("documentacion.expediente.crear", {
      expediente: {
        identificador: "CI-RAMA-CAMBIADA-2026",
        nombre: "Rama Cambiada",
        tipoFuncionario: "GENERAL",
        requisitos: [
          { codigo: "cv", estado: "ENTREGADO" },
          { codigo: "garante-inmueble", estado: "ENTREGADO" },
        ],
      },
    });
    expect(res.aplicados).toBe(1);
    expect(res.fallidos).toEqual([]);
  });

  it("informa de lo que rechaza sin tirar el alta entera", () => {
    const res = h.ok("documentacion.expediente.crear", {
      expediente: {
        identificador: "CI-PARCIAL-2026",
        nombre: "Alta Parcial",
        requisitos: [
          { codigo: "cv", estado: "ENTREGADO" },
          // Conteo de hojas en un documento digital: se rechaza ESE, no el alta.
          { codigo: "foto-4x4", hojasFisicas: 3 },
        ],
      },
    });
    expect(res.creado).toBe(true);
    expect(res.aplicados).toBe(1);
    expect(res.fallidos).toHaveLength(1);
    expect(res.fallidos[0].codigo).toBe("foto-4x4");
  });

  it("es idempotente: la misma clave no crea dos expedientes", () => {
    const carga = {
      expediente: {
        identificador: "CI-IDEM-2026",
        nombre: "Doble Clic",
        idempotencyKey: "alta_doble_clic",
        requisitos: [{ codigo: "cv", estado: "ENTREGADO" }],
      },
    };
    const primero = h.ok("documentacion.expediente.crear", carga);
    const segundo = h.ok("documentacion.expediente.crear", carga);
    expect(segundo.expedienteId).toBe(primero.expedienteId);
    expect(segundo.creado).toBe(false);
    expect(h.rowsOf("Expedientes")).toHaveLength(1);
  });

  it("el carnet duplicado devuelve el expediente existente, con su nombre", () => {
    h.ok("documentacion.expediente.crear", { expediente: { identificador: "9876543 CB", nombre: "Primera Persona" } });
    const res = h.pedir("documentacion.expediente.crear", {
      expediente: { identificador: "  9876543 - CB  ", nombre: "Segunda Persona" },
    });
    // La unicidad se comprueba sobre la forma normalizada: espacios y guiones no
    // hacen de dos personas una.
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("CONFLICTO");
    expect(res.error.message).toMatch(/Primera Persona/);
    expect(res.error.detalle.expedienteId).toBeTruthy();
    expect(res.error.detalle.nombre).toBe("Primera Persona");
  });

  it("acepta el carnet en cualquier formato, sin imponer ninguno", () => {
    const formatos = ["1234567", "1234567 LP", "1234567-1L", "12.345.678", "E-4455667", "1234567 - 45 - 2026"];
    let n = 0;
    for (const identificador of formatos) {
      const res = h.pedir("documentacion.expediente.crear", {
        expediente: { identificador, nombre: `Formato ${n++}` },
      });
      expect(res.ok, `carnet «${identificador}»`).toBe(true);
    }
    // Y vacío sigue siendo obligatorio.
    const vacio = h.pedir("documentacion.expediente.crear", { expediente: { identificador: "   ", nombre: "Sin Carnet" } });
    expect(vacio.ok).toBe(false);
    expect(vacio.error.fields.identificador).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/* Detalle por lotes                                                  */
/* ------------------------------------------------------------------ */

describe("documentación · detalle de varios expedientes en una llamada", () => {
  let h: DocHarness;

  beforeEach(() => {
    h = loadInstalledBackend();
  });

  it("devuelve cabecera, requisitos y prórrogas de varios de golpe", () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(crearExpediente(h, { identificador: `CI-LOTE${i}-2026`, nombre: `Persona ${i}` }).expedienteId);
    }

    const res = h.ok("documentacion.expedientes.detalle", { expedienteIds: ids });
    expect(res.devueltos).toBe(5);
    expect(res.noEncontrados).toEqual([]);
    expect(res.expedientes[0].requisitos).toHaveLength(16);
    // La respuesta declara que es PARCIAL: no trae historial ni comentarios, y
    // el cliente no debe presentarla como un expediente completo.
    expect(res.expedientes[0].parcial).toBe(true);
  });

  it("dice cuáles no encontró en lugar de fallar entero", () => {
    const uno = crearExpediente(h, { identificador: "CI-EXISTE-2026" }).expedienteId;
    const res = h.ok("documentacion.expedientes.detalle", { expedienteIds: [uno, "exp_inventado"] });
    expect(res.devueltos).toBe(1);
    expect(res.noEncontrados).toEqual(["exp_inventado"]);
  });

  it("rechaza un lote demasiado grande con su tope explicado", () => {
    const res = h.pedir("documentacion.expedientes.detalle", {
      expedienteIds: Array.from({ length: 30 }, (_, i) => `x_${i}`),
    });
    expect(res.ok).toBe(false);
    expect(res.error.message).toMatch(/máximo por lote/i);
  });
});
