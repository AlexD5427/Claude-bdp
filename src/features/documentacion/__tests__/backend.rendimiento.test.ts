import { describe, expect, it } from "vitest";
import { loadBackend, loadInstalledBackend, crearExpediente } from "../../../../scripts/documentacion-backend.mjs";

/**
 * Rendimiento y estabilidad del backend, medidos donde se pagan: en el número de
 * LECTURAS DE HOJA y de FILAS LEÍDAS por petición.
 *
 * ── Por qué se mide eso y no milisegundos ───────────────────────────────────
 * Porque el arnés corre en Node y contesta en microsegundos: medir su tiempo no
 * dice nada sobre Apps Script. Lo que sí se conserva de un entorno a otro es el
 * TRABAJO: cada `getRange(...).getValues()` contra el servicio de Sheets cuesta
 * entre 20 y 200 ms, y cada fila decodificada cuesta CPU del intérprete. Una
 * petición que lee tres hojas de mil filas es lenta en cualquier máquina, y una
 * que lee dos hojas de cien no lo es en ninguna.
 *
 * Estas afirmaciones son techos, no igualdades: suben solo si alguien añade
 * trabajo, y bajar por debajo no rompe nada.
 */

/** Contadores de trabajo de hoja de una respuesta del enrutador. */
function trabajo(respuesta: { meta?: { contadores?: Record<string, number> } }) {
  const c = respuesta.meta?.contadores ?? {};
  return {
    hojas: c.hojasLeidas ?? 0,
    filas: c.filasLeidas ?? 0,
    escritas: c.filasEscritas ?? 0,
  };
}

describe("rendimiento · la bitácora de idempotencia no se lee en cada consulta", () => {
  /**
   * El fallo que esto fija para siempre.
   *
   * `docReplay_` consultaba la hoja heredada `_SOLICITUDES` en TODA petición,
   * incluidas las de lectura, para preguntar si un identificador recién generado
   * ya se había visto. Esa hoja crece una fila por escritura, así que el coste de
   * cualquier consulta crecía con el uso del módulo: en un libro con seis meses
   * de trabajo son varios miles de filas decodificadas para nada, en cada
   * pantalla que se abre.
   */
  it("una lectura no toca la hoja de solicitudes, aunque tenga miles de filas", () => {
    const h = loadBackend();
    // La instalación heredada es la que crea `_SOLICITUDES`.
    h.pedir("instalar", {});
    h.pedir("documentacion.instalar", { conRespaldo: false });

    // Se engorda la bitácora como lo hace el uso real: una fila por escritura.
    const hoja = h.spreadsheet.getSheetByName("_SOLICITUDES")!;
    const columnas = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].length;
    const filas: unknown[][] = [];
    for (let i = 0; i < 3000; i++) {
      const linea = new Array(columnas).fill("");
      linea[0] = `req_viejo_${i}`;
      filas.push(linea);
    }
    hoja.getRange(2, 1, filas.length, columnas).setValues(filas);
    expect(hoja.getLastRow()).toBe(3001);

    const lectura = h.pedir("documentacion.expedientes.listar", { filtros: {} });
    expect(lectura.ok).toBe(true);
    const t = trabajo(lectura);
    /* Dos hojas: Expedientes y ExpedienteDocumentos. Ni una más, y desde luego
       no tres mil filas de bitácora. */
    expect(t.hojas).toBeLessThanOrEqual(3);
    expect(t.filas).toBeLessThan(500);
  });

  it("una escritura sí la consulta, y reintentar con el mismo identificador no duplica", () => {
    const h = loadBackend();
    h.pedir("instalar", {});
    h.pedir("documentacion.instalar", { conRespaldo: false });

    const solicitudId = "req_reintento_1";
    const datos = {
      identificador: "CI-IDEM-1",
      nombre: "Ida Idempotente",
      tipoFuncionario: "ADMINISTRATIVO",
      tipoGarantia: "NINGUNA",
    };

    const primera = h.pedir("documentacion.expediente.crear", { expediente: datos }, { solicitudId });
    expect(primera.ok).toBe(true);
    const antes = h.rowsOf("Expedientes").length;

    // El mismo identificador otra vez: es lo que hace el cliente al reintentar
    // tras un tiempo de espera agotado.
    const segunda = h.pedir("documentacion.expediente.crear", { expediente: datos }, { solicitudId });
    expect(segunda.ok).toBe(true);
    expect(segunda.avisos?.join(" ")).toContain("ya procesada");
    expect(h.rowsOf("Expedientes").length).toBe(antes);
  });
});

describe("rendimiento · la hoja Auxiliar se lee una vez por petición", () => {
  /**
   * Antes había una lectura de rango POR COLUMNA, más una lectura de cabeceras
   * por columna: seis viajes al servicio de Sheets para traer un rectángulo que
   * cabe en uno. Con `getMaxRows()` a mil filas, eso eran tres mil filas
   * decodificadas para llenar tres desplegables.
   */
  it("los tres catálogos auxiliares cuestan una sola lectura de rango", () => {
    const h = loadInstalledBackend();
    const respuesta = h.pedir("documentacion.auxiliares", {});
    expect(respuesta.ok).toBe(true);
    const t = trabajo(respuesta);
    /* Una por la hoja Auxiliar; la otra es la de configuración, que el contexto
       necesita para resolver el rol. */
    expect(t.hojas).toBeLessThanOrEqual(2);
    // Mil filas del alto de la hoja, UNA vez, no tres.
    expect(t.filas).toBeLessThan(1100);
  });

  it("añadir un valor dentro de la misma petición se ve al leer después", () => {
    const h = loadInstalledBackend();
    h.ok("documentacion.auxiliares.agregar", { columna: "cargo_bdp", valores: ["JEFE DE ARCHIVO"] });
    const despues = h.ok("documentacion.auxiliares");
    expect(despues.auxiliares.cargo_bdp).toContain("JEFE DE ARCHIVO");
  });
});

describe("rendimiento · el arranque del módulo cuesta una sola ida y vuelta", () => {
  /**
   * El arranque eran DOS llamadas encadenadas: `estado` y después `catalogo`,
   * que no podía empezar antes porque depende de la respuesta de la primera. En
   * Apps Script cada llamada paga el arranque del intérprete y la apertura del
   * libro: entre uno y tres segundos cada una.
   */
  it("devuelve estado y catálogo juntos, y el catálogo sale gratis", () => {
    const h = loadInstalledBackend();

    const soloEstado = h.pedir("documentacion.estado", {});
    const arranque = h.pedir("documentacion.arranque", {});
    expect(arranque.ok).toBe(true);

    expect(arranque.data.estado.instalado).toBe(true);
    expect(arranque.data.estado.esquema).toBe(6);
    expect(arranque.data.catalogo.documentos.length).toBe(43);
    expect(arranque.data.catalogoError).toBe("");

    /* El catálogo viaja en la misma ejecución, con el libro ya abierto: el
       trabajo extra es leer dos hojas más (catálogo y auxiliar), no repetir todo
       el arranque. Eso es lo que convierte dos segundos en cero. */
    const extra = trabajo(arranque).hojas - trabajo(soloEstado).hojas;
    expect(extra).toBeLessThanOrEqual(3);
  });

  it("funciona antes de instalar y dice que no está instalado, sin catálogo", () => {
    const h = loadBackend();
    const arranque = h.pedir("documentacion.arranque", {});
    expect(arranque.ok).toBe(true);
    expect(arranque.data.estado.instalado).toBe(false);
    expect(arranque.data.catalogo).toBeNull();
  });
});

describe("estabilidad · la sincronización no archiva trabajo hecho", () => {
  /**
   * `doc2SincronizarRequisitos_` archiva los requisitos que dejaron de aplicar y
   * «no tienen datos». La definición de «tener datos» miraba tres campos y le
   * faltaban dos; la segunda apareció migrando el libro real: un requisito en
   * PENDIENTE **con una prórroga concedida** se archivaba, porque sus tres
   * campos estaban vacíos. La prórroga era el dato.
   */
  it("un requisito que ya no aplica pero tiene prórroga se conserva", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h, {
      identificador: "CI-SYNC-1",
      tipoFuncionario: "CUMPLIMIENTO",
      tipoGarantia: "NINGUNA",
    });
    const examen = requisitos.find((r: { codigo: string }) => r.codigo === "examen-uif")!;
    expect(examen.permiteProrroga).toBe(true);

    // Dentro del tope de 90 días que valida el backend.
    const enDias = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    h.ok("documentacion.prorroga.crear", {
      prorroga: {
        expedienteDocumentoId: examen.expedienteDocumentoId,
        fechaProrroga: enDias(60),
        motivo: "El examen de la UIF es a tres meses del ingreso.",
      },
    });

    // Cambiar de rama deja `examen-uif` fuera de la aplicabilidad.
    h.ok("documentacion.expediente.actualizar", {
      expedienteId,
      cambios: { tipoFuncionario: "ADMINISTRATIVO" },
    });

    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId, incluirArchivados: true });
    const conservado = detalle.requisitos.find((r: { codigo: string }) => r.codigo === "examen-uif");
    expect(conservado, "el requisito con prórroga no debe desaparecer").toBeTruthy();
    expect(conservado.archivado).toBe(false);
    expect(conservado.prorrogas.length).toBe(1);
  });

  it("un requisito que ya no aplica y tiene hojas contadas se conserva", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h, {
      identificador: "CI-SYNC-2",
      tipoFuncionario: "AUDITORIA",
      tipoGarantia: "NINGUNA",
    });
    const impedimento = requisitos.find((r: { codigo: string }) => r.codigo === "impedimento-auditor")!;
    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: impedimento.expedienteDocumentoId,
      cambios: { hojasFisicas: 2 },
    });

    h.ok("documentacion.expediente.actualizar", {
      expedienteId,
      cambios: { tipoFuncionario: "ADMINISTRATIVO" },
    });

    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId, incluirArchivados: true });
    const conservado = detalle.requisitos.find((r: { codigo: string }) => r.codigo === "impedimento-auditor");
    expect(conservado).toBeTruthy();
    expect(conservado.archivado).toBe(false);
    expect(conservado.hojasFisicas).toBe(2);
  });

  it("un requisito que ya no aplica y está intacto sí se archiva", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h, {
      identificador: "CI-SYNC-3",
      tipoFuncionario: "AUDITORIA",
      tipoGarantia: "NINGUNA",
    });

    h.ok("documentacion.expediente.actualizar", {
      expedienteId,
      cambios: { tipoFuncionario: "ADMINISTRATIVO" },
    });

    const vigentes = h.ok("documentacion.expediente.obtener", { expedienteId });
    expect(vigentes.requisitos.map((r: { codigo: string }) => r.codigo)).not.toContain("impedimento-auditor");
    expect(vigentes.requisitos.length).toBe(20);
  });
});

describe("estabilidad · la presentación editable y el conteo no se contradicen", () => {
  it("marcar «solo digital» pone el conteo a cero en la misma escritura", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h, { identificador: "CI-OTROS-1" });
    const otros = requisitos.find((r: { codigo: string }) => r.codigo === "otros-documento")!;

    h.ok("documentacion.requisitos.guardar", {
      expedienteId,
      cambios: [
        {
          expedienteDocumentoId: otros.expedienteDocumentoId,
          estado: "ENTREGADO",
          nombrePersonalizado: "Certificación del colegio",
          presentacion: "AMBOS",
          hojasFisicas: 6,
        },
      ],
    });
    let detalle = h.ok("documentacion.expediente.obtener", { expedienteId });
    let fila = detalle.requisitos.find((r: { codigo: string }) => r.codigo === "otros-documento");
    expect(fila.hojasFisicas).toBe(6);
    expect(fila.requiereConteoHojas).toBe(true);
    expect(fila.nombre).toBe("Certificación del colegio");

    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: otros.expedienteDocumentoId,
      cambios: { presentacion: "DIGITAL" },
    });
    detalle = h.ok("documentacion.expediente.obtener", { expedienteId });
    fila = detalle.requisitos.find((r: { codigo: string }) => r.codigo === "otros-documento");
    expect(fila.presentacionFisica).toBe("NO");
    expect(fila.requiereConteoHojas).toBe(false);
    /* Cero y no seis: un documento sin presencia física con seis hojas de papel
       es el dato contradictorio que todo lo demás se esfuerza en impedir. */
    expect(fila.hojasFisicas).toBe(0);
  });

  it("marcar «ambos» y contar hojas en el MISMO guardado funciona", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h, { identificador: "CI-OTROS-2" });
    const otros = requisitos.find((r: { codigo: string }) => r.codigo === "otros-documento")!;

    // Primero solo digital…
    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: otros.expedienteDocumentoId,
      cambios: { presentacion: "DIGITAL" },
    });
    /* …y ahora las dos cosas de golpe. Sin el orden correcto dentro del
       servicio, la validación del conteo consultaría la presentación ANTERIOR
       —«solo digital»— y rechazaría un cambio perfectamente válido con el
       mensaje «este documento no lleva conteo de hojas». */
    const res = h.pedir("documentacion.requisito.actualizar", {
      expedienteDocumentoId: otros.expedienteDocumentoId,
      cambios: { presentacion: "AMBOS", hojasFisicas: 3 },
    });
    expect(res.ok, res.error?.message).toBe(true);

    const fila = h
      .ok("documentacion.expediente.obtener", { expedienteId })
      .requisitos.find((r: { codigo: string }) => r.codigo === "otros-documento");
    expect(fila.hojasFisicas).toBe(3);
    expect(fila.presentacionFisica).toBe("SI");
    expect(fila.presentacionDigital).toBe("SI");
  });

  it("un requisito normal rechaza el nombre libre y la presentación por expediente", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h, { identificador: "CI-OTROS-3" });
    const rejap = requisitos.find((r: { codigo: string }) => r.codigo === "rejap")!;

    const conNombre = h.pedir("documentacion.requisito.actualizar", {
      expedienteDocumentoId: rejap.expedienteDocumentoId,
      cambios: { nombrePersonalizado: "Mi propio REJAP" },
    });
    expect(conNombre.ok).toBe(false);
    expect(conNombre.error.fields.nombre_personalizado).toBeTruthy();

    const conPresentacion = h.pedir("documentacion.requisito.actualizar", {
      expedienteDocumentoId: rejap.expedienteDocumentoId,
      cambios: { presentacion: "DIGITAL" },
    });
    expect(conPresentacion.ok).toBe(false);
    expect(conPresentacion.error.message).toContain("la fija el catálogo");

    // Y el expediente sigue intacto.
    const fila = h
      .ok("documentacion.expediente.obtener", { expedienteId })
      .requisitos.find((r: { codigo: string }) => r.codigo === "rejap");
    expect(fila.nombre).toContain("REJAP");
    expect(fila.presentacionFisica).toBe("CONDICIONAL");
  });

  it("no se puede dejar un documento sin ninguna forma de presentación", () => {
    const h = loadInstalledBackend();
    const { requisitos } = crearExpediente(h, { identificador: "CI-OTROS-4" });
    const otros = requisitos.find((r: { codigo: string }) => r.codigo === "otros-documento")!;

    const res = h.pedir("documentacion.requisito.actualizar", {
      expedienteDocumentoId: otros.expedienteDocumentoId,
      cambios: { presentacionFisica: "NO", presentacionDigital: "NO" },
    });
    expect(res.ok).toBe(false);
    expect(res.error.message).toContain("físico, en digital o en ambos");
  });
});

describe("estabilidad · el catálogo se puede corregir desde la configuración", () => {
  /**
   * Es la palanca de emergencia que pidió el área: cuando un documento cambia de
   * papel a digital —o al revés— tiene que poder reflejarse el mismo día, sin
   * desplegar código. El conteo de hojas se DERIVA de la presentación, así que
   * el estado imposible «solo digital con contador» no es representable.
   */
  it("cambiar la presentación de un requisito apaga o enciende su contador en todo el módulo", () => {
    const h = loadInstalledBackend();

    h.ok("documentacion.catalogo.guardar", {
      catalogo: [{ codigo: "cv", presentacion_fisica: "SI", presentacion_digital: "SI" }],
    });
    let cv = h.ok("documentacion.catalogo").documentos.find((d: { codigo: string }) => d.codigo === "cv");
    expect(cv.presentacionFisica).toBe("SI");
    expect(cv.requiereConteoHojas).toBe(true);

    // Un expediente nuevo ya lo pide con contador.
    const { requisitos } = crearExpediente(h, { identificador: "CI-CAT-1" });
    const filaCv = requisitos.find((r: { codigo: string }) => r.codigo === "cv")!;
    expect(filaCv.requiereConteoHojas).toBe(true);

    // Y de vuelta a digital.
    h.ok("documentacion.catalogo.guardar", {
      catalogo: [{ codigo: "cv", presentacion_fisica: "NO", presentacion_digital: "SI" }],
    });
    cv = h.ok("documentacion.catalogo").documentos.find((d: { codigo: string }) => d.codigo === "cv");
    expect(cv.requiereConteoHojas).toBe(false);
  });

  it("no acepta un requisito sin ninguna forma de presentación", () => {
    const h = loadInstalledBackend();
    const res = h.ok("documentacion.catalogo.guardar", {
      catalogo: [{ codigo: "cv", presentacion_fisica: "NO", presentacion_digital: "NO" }],
    });
    expect(res.rechazados.length).toBe(1);
    expect(res.rechazados[0].motivo).toContain("físico, en digital o en ambos");
  });

  it("el conteo de hojas se DERIVA: la combinación imposible no es representable", () => {
    const h = loadInstalledBackend();
    /* Se intenta guardar «solo digital CON contador», que es exactamente la
       combinación que produce un 0 en la columna «Hojas físicas» de un documento
       que no tiene hojas. El campo se ignora y la derivación manda. */
    h.ok("documentacion.catalogo.guardar", {
      catalogo: [
        {
          codigo: "cv",
          presentacion_fisica: "NO",
          presentacion_digital: "SI",
          requiere_conteo_hojas: true,
        },
      ],
    });
    const cv = h.ok("documentacion.catalogo").documentos.find((d: { codigo: string }) => d.codigo === "cv");
    expect(cv.presentacionFisica).toBe("NO");
    expect(cv.requiereConteoHojas).toBe(false);
  });

  it("cambiar la presentación del catálogo llega al reporte, no solo a la pantalla", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h, { identificador: "CI-CAT-2" });
    const cv = requisitos.find((r: { codigo: string }) => r.codigo === "cv")!;

    // Con el CV en digital, el reporte deja su celda de hojas vacía.
    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: cv.expedienteDocumentoId,
      cambios: { observaciones: "Pendiente de recibir." },
    });
    const columnaHojas = (tipo: string) => {
      const reporte = h.ok("documentacion.reporte", { tipo, filtros: {} });
      const iHojas = reporte.columnas.indexOf("Hojas físicas");
      const iRequisito = reporte.columnas.indexOf("Requisito");
      const fila = reporte.filas.find((f: unknown[]) => String(f[iRequisito]).includes("Curriculum"));
      return fila ? fila[iHojas] : undefined;
    };
    expect(columnaHojas("pendientes")).toBe("");

    // Se marca como físico desde la configuración…
    h.ok("documentacion.catalogo.guardar", {
      catalogo: [{ codigo: "cv", presentacion_fisica: "SI", presentacion_digital: "SI" }],
    });
    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: cv.expedienteDocumentoId,
      cambios: { hojasFisicas: 7 },
    });

    /* …y el mismo reporte trae el número. Es la comprobación que importa: el
       cambio del catálogo no se queda en la pantalla del alta, alcanza a lo que
       el área imprime y cruza contra el archivador. */
    expect(columnaHojas("pendientes")).toBe(7);
    expect(
      h
        .ok("documentacion.expediente.obtener", { expedienteId })
        .requisitos.find((r: { codigo: string }) => r.codigo === "cv").requiereConteoHojas,
    ).toBe(true);
  });
});

describe("estabilidad · la migración del legajo administrativo", () => {
  it("simula sin escribir y dice exactamente qué haría", () => {
    const h = loadBackend();
    h.pedir("documentacion.instalar", { conRespaldo: false });
    const res = h.ok("documentacion.migrar", { simular: true, version: "4.2.0-legajo-administrativo" });
    const ejecutada = res.ejecutadas.find((e: { version: string }) => e.version === "4.2.0-legajo-administrativo");
    expect(ejecutada).toBeTruthy();
    expect(res.simulado).toBe(true);
  });

  it("siembra los requisitos nuevos en los expedientes que ya existían", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h, { identificador: "CI-MIG-1" });

    /* Se simula un expediente «de antes»: se le quitan los cuatro requisitos
       nuevos, que es como estaría un expediente creado con el catálogo v3. */
    const hoja = h.spreadsheet.getSheetByName("ExpedienteDocumentos")!;
    const cabeceras = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
    const iCodigo = cabeceras.indexOf("codigo_documento");
    const nuevos = ["manual-funciones", "memorandum-designacion", "comunicacion-interna", "otros-documento"];
    for (let fila = hoja.getLastRow(); fila >= 2; fila--) {
      const codigo = String(hoja.getRange(fila, iCodigo + 1, 1, 1).getValue());
      if (nuevos.includes(codigo)) hoja.deleteRow(fila);
    }
    expect(h.ok("documentacion.expediente.obtener", { expedienteId }).requisitos.length).toBe(16);

    // Y la migración los devuelve.
    const res = h.ok("documentacion.migrar", { version: "4.2.0-legajo-administrativo" });
    expect(res.ejecutadas[0].ok).toBe(true);

    const despues = h.ok("documentacion.expediente.obtener", { expedienteId });
    expect(despues.requisitos.length).toBe(20);
    const codigos = despues.requisitos.map((r: { codigo: string }) => r.codigo);
    for (const codigo of nuevos) expect(codigos).toContain(codigo);
    // Ningún conteo inventado.
    expect(despues.requisitos.every((r: { hojasFisicas: number }) => r.hojasFisicas === 0)).toBe(true);
  });

  it("no toca un expediente aprobado ni archivado", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h, { identificador: "CI-MIG-2" });

    // Se completa y se aprueba.
    h.ok("documentacion.requisitos.guardar", {
      expedienteId,
      cambios: requisitos
        .filter((r: { codigo: string }) => r.codigo !== "otros-documento")
        .map((r: { expedienteDocumentoId: string }) => ({ expedienteDocumentoId: r.expedienteDocumentoId, estado: "ENTREGADO" })),
    });
    h.ok("documentacion.expediente.estado", { expedienteId, estado: "APROBADO" });

    const hoja = h.spreadsheet.getSheetByName("ExpedienteDocumentos")!;
    const cabeceras = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
    const iCodigo = cabeceras.indexOf("codigo_documento");
    for (let fila = hoja.getLastRow(); fila >= 2; fila--) {
      if (String(hoja.getRange(fila, iCodigo + 1, 1, 1).getValue()) === "manual-funciones") hoja.deleteRow(fila);
    }

    h.ok("documentacion.migrar", { version: "4.2.0-legajo-administrativo" });

    const despues = h.ok("documentacion.expediente.obtener", { expedienteId });
    /* Sigue aprobado y sigue sin el requisito nuevo: sembrarlo lo dejaría
       incompleto y cambiaría un estado que una persona decidió. */
    expect(despues.expediente.estado).toBe("APROBADO");
    expect(despues.requisitos.map((r: { codigo: string }) => r.codigo)).not.toContain("manual-funciones");
  });
});
