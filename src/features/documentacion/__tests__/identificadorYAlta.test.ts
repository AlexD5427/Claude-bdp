/**
 * El carnet de identidad como identificador libre.
 *
 * ── Qué cambió y por qué hay que vigilarlo ──────────────────────────────────
 * El primer campo del alta exigía «CI - número de proceso - año». Los carnets
 * reales no caben en ese molde: hay complementos alfanuméricos («1234567-1A»),
 * extensiones de departamento, puntos de millar y espacios sobrantes de un
 * copiado. El único efecto de la validación era que quien registraba escribía
 * cualquier cosa que la pasara para poder continuar, y el dato quedaba PEOR que
 * sin validar.
 *
 * Quitar una validación es fácil; quitarla sin romper lo que dependía de ella no.
 * De la normalización del identificador cuelgan la detección de duplicados, la
 * búsqueda, la escritura en el libro anual y los informes. Esta suite recorre esa
 * cadena con los formatos que el área usa de verdad.
 */

import { describe, expect, it } from "vitest";
import { loadInstalledBackend } from "../../../../scripts/documentacion-backend.mjs";

/** Formatos de carnet que aparecen en el libro del área. */
const CARNETS = [
  "1234567",
  "1234567-1A",
  "8.765.432",
  "  4567890 LP  ",
  "CI 999888 Cbba",
  "1234567 - 45 - 2026",
  "12345678",
];

describe("identificador · el carnet se acepta tal como está en el documento", () => {
  it("acepta todos los formatos reales sin imponer ninguno", () => {
    const h = loadInstalledBackend();
    for (const [i, carnet] of CARNETS.entries()) {
      const res = h.pedir("documentacion.expediente.crear", {
        expediente: { identificador: carnet, nombre: `Persona ${i}`, tipoFuncionario: "GENERAL" },
      });
      expect(res.ok, `el carnet ${JSON.stringify(carnet)} debería aceptarse: ${res.error?.mensaje}`).toBe(true);
      expect(res.data.requisitos).toBe(16);
    }
  });

  it("sigue siendo obligatorio: un carnet vacío o de solo espacios se rechaza", () => {
    const h = loadInstalledBackend();
    for (const vacio of ["", "   ", "\t"]) {
      const res = h.pedir("documentacion.expediente.crear", {
        expediente: { identificador: vacio, nombre: "Sin Carnet", tipoFuncionario: "GENERAL" },
      });
      expect(res.ok).toBe(false);
      expect(res.error.fields.identificador).toBeTruthy();
      // El mensaje dice qué hacer, no cómo se llama el campo en la hoja.
      expect(res.error.mensaje + res.error.pista).toMatch(/carnet/i);
    }
  });

  it("un carnet que solo se diferencia en espacios, puntos o mayúsculas es el MISMO", () => {
    const h = loadInstalledBackend();
    h.ok("documentacion.expediente.crear", {
      expediente: { identificador: "9 876 543", nombre: "Primera Persona", tipoFuncionario: "GENERAL" },
    });

    /*
     * Esta es la parte que la validación de formato ocultaba.
     *
     * Sin patrón que los uniforme, la MISMA persona se puede escribir de seis
     * maneras. Si la normalización no las colapsara, el módulo aceptaría seis
     * expedientes de la misma persona y el informe mensual contaría seis
     * incorporaciones donde hubo una.
     */
    for (const variante of ["9876543", "9.876.543", "  9876543  ", "9-876-543"]) {
      const res = h.pedir("documentacion.expediente.crear", {
        expediente: { identificador: variante, nombre: "Duplicada", tipoFuncionario: "GENERAL" },
      });
      expect(res.ok, `${variante} debería detectarse como duplicado`).toBe(false);
      expect(res.error.codigo).toBe("CONFLICTO");
    }
  });

  it("el duplicado trae los datos del expediente existente para poder abrirlo", () => {
    const h = loadInstalledBackend();
    const primero = h.ok("documentacion.expediente.crear", {
      expediente: {
        identificador: "5551234",
        nombre: "Marta Existente",
        cargo: "OFICIAL DE NEGOCIOS",
        agencia: "LA PAZ",
        fechaIngreso: "2026-03-02",
        tipoFuncionario: "GENERAL",
      },
    });

    const res = h.pedir("documentacion.expediente.crear", {
      expediente: { identificador: "5551234", nombre: "Otra Persona", tipoFuncionario: "GENERAL" },
    });

    expect(res.ok).toBe(false);
    /*
     * Un duplicado no es «has escrito algo mal»: casi siempre es «esta persona ya
     * estaba registrada». Lo útil es abrir el expediente que existe, y para eso
     * el error tiene que traer con qué. Sin estos datos, quien registra se queda
     * con un formulario de veinte decisiones y un mensaje que no lleva a ninguna
     * parte.
     */
    const duplicado = res.error.detalle.duplicado;
    expect(duplicado.expedienteId).toBe(primero.expedienteId);
    expect(duplicado.nombre).toBe("Marta Existente");
    expect(duplicado.cargo).toBe("OFICIAL DE NEGOCIOS");
    expect(duplicado.agencia).toBe("LA PAZ");
    expect(duplicado.fechaIngreso).toBe("2026-03-02");
    // Y el mensaje nombra a la persona, no repite el número.
    expect(res.error.mensaje).toMatch(/Marta Existente/);
  });

  it("se puede buscar y abrir por el carnet escrito de otra forma", () => {
    const h = loadInstalledBackend();
    h.ok("documentacion.expediente.crear", {
      expediente: { identificador: "7.654.321-2B", nombre: "Buscable Uno", tipoFuncionario: "GENERAL" },
    });

    // Abrir por el identificador humano, escrito distinto.
    const detalle = h.ok("documentacion.expediente.obtener", { identificador: "76543212B" });
    expect(detalle.expediente.nombre).toBe("Buscable Uno");
    // Y el texto original se conserva TAL CUAL: es el que la persona reconoce.
    expect(detalle.expediente.identificador).toBe("7.654.321-2B");

    // El buscador de la lista también lo encuentra.
    const lista = h.ok("documentacion.expedientes.listar", { filtros: { texto: "7654321" } });
    expect(lista.expedientes.map((e: { nombre: string }) => e.nombre)).toContain("Buscable Uno");
  });

  it("un carnet con letras y símbolos llega intacto al libro anual", () => {
    const h = loadInstalledBackend();
    const anio = new Date().getFullYear();
    h.ok("documentacion.expediente.crear", {
      expediente: {
        identificador: "CI 4-321-987 Pot",
        nombre: "Libro Anual Uno",
        tipoFuncionario: "GENERAL",
        fechaIngreso: h.read<string>("doc2Hoy_()"),
      },
    });

    const filas = h.rowsOf(`CONTROL INGRESOS ${anio}`);
    const fila = filas.find((f) => String(f["Nombre"]).indexOf("Libro Anual Uno") >= 0);
    expect(fila, "el expediente debería estar en la pestaña anual").toBeTruthy();
    // El JSON de compatibilidad conserva el carnet sin tocar: si lo normalizara,
    // el área vería un número que no es el del documento.
    const json = JSON.parse(String(fila!["DETALLE JSON"]));
    expect(json.identificador).toBe("CI 4-321-987 Pot");
  });

  it("la clave de idempotencia sigue evitando el alta doble por doble clic", () => {
    const h = loadInstalledBackend();
    const uno = h.ok("documentacion.expediente.crear", {
      expediente: {
        identificador: "3216549",
        nombre: "Doble Clic",
        tipoFuncionario: "GENERAL",
        idempotencyKey: "clave-doble-clic",
      },
    });
    const dos = h.ok("documentacion.expediente.crear", {
      expediente: {
        identificador: "3216549",
        nombre: "Doble Clic",
        tipoFuncionario: "GENERAL",
        idempotencyKey: "clave-doble-clic",
      },
    });

    // El segundo devuelve el MISMO expediente, no un conflicto ni un duplicado.
    expect(dos.expedienteId).toBe(uno.expedienteId);
    expect(dos.creado).toBe(false);
    expect(dos.repetido).toBe(true);
    expect(h.rowsOf("Expedientes").length).toBe(1);
  });
});

describe("alta completa · una llamada, transaccional, con recaída", () => {
  it("aplica identidad, estados, hojas y prórrogas en la misma llamada", () => {
    const h = loadInstalledBackend();
    const res = h.ok("documentacion.expediente.crear", {
      expediente: {
        identificador: "1020304",
        nombre: "Alta Completa",
        cargo: "OFICIAL DE CUMPLIMIENTO",
        agencia: "EL ALTO",
        gerencia: "GERENCIA DE CUMPLIMIENTO",
        fechaIngreso: h.read<string>("doc2Hoy_()"),
        tipoFuncionario: "CUMPLIMIENTO",
        requisitos: [
          { codigo: "rejap", estado: "ENTREGADO", hojasFisicas: 2, observaciones: "Vigente." },
          { codigo: "lgi-ft", estado: "ENTREGADO", hojasFisicas: 11 },
        ],
        prorrogas: [{ codigo: "examen-uif", fechaProrroga: h.read<string>("doc2FechaMasDias_(90)"), motivo: "Tres meses." }],
      },
    });

    expect(res.aplicado.requisitos).toBe(2);
    expect(res.aplicado.prorrogas).toBe(1);
    expect(res.aplicado.fallidos).toEqual([]);

    /*
     * El detalle viene en la MISMA respuesta.
     *
     * Es lo que permite abrir el expediente sin una quinta llamada. Antes eran
     * `crear` → `obtener` → `guardar` → N × `prorroga`, y con veinticinco
     * requisitos el botón se quedaba «guardando» ocho o diez segundos, tiempo
     * suficiente para que alguien lo volviera a pulsar.
     */
    expect(res.detalle).toBeTruthy();
    expect(res.detalle.expediente.totales.hojasFisicas).toBe(13);
    expect(res.detalle.prorrogas.length).toBe(1);
    expect(res.detalle.requisitos.find((r: { codigo: string }) => r.codigo === "rejap").observaciones).toBe("Vigente.");
    // Y el cargo aprendió: la lista de cargos crece con lo que se registra.
    expect(h.ok("documentacion.catalogo").auxiliares.cargo_bdp).toContain("OFICIAL DE CUMPLIMIENTO");
  });

  it("ignora en silencio los requisitos que no aplican a la rama elegida", () => {
    const h = loadInstalledBackend();
    /*
     * El asistente conserva lo que se marcó ANTES de cambiar de categoría: es una
     * comodidad deliberada. Así que puede mandar estados de documentos que la
     * rama final no tiene, y eso no es un error que haya que reportar.
     */
    const res = h.ok("documentacion.expediente.crear", {
      expediente: {
        identificador: "4050607",
        nombre: "Rama Cambiada",
        tipoFuncionario: "GENERAL",
        requisitos: [
          { codigo: "cv", estado: "ENTREGADO" },
          { codigo: "garante-inmueble", estado: "ENTREGADO" },
          { codigo: "cert-trabajo", estado: "ENTREGADO" },
        ],
      },
    });

    expect(res.aplicado.requisitos).toBe(1);
    expect(res.aplicado.fallidos).toEqual([]);
    expect(res.detalle.requisitos.length).toBe(16);
  });

  it("revierte el alta entera si algo falla a medias", () => {
    const h = loadInstalledBackend();
    const res = h.pedir("documentacion.expediente.crear", {
      expediente: {
        identificador: "8090100",
        nombre: "Alta Rota",
        tipoFuncionario: "GENERAL",
        // Un conteo de hojas en un documento DIGITAL: el backend lo rechaza, y lo
        // hace después de haber creado el expediente y sus dieciséis requisitos.
        requisitos: [{ codigo: "foto-4x4", hojasFisicas: 5 }],
      },
    });

    expect(res.ok).toBe(false);

    /*
     * ── No queda NADA a medias, y el mérito es del almacén ───────────────────
     * El enrutador llama a `docRollback_()` cuando la acción lanza, y el motor de
     * almacenamiento descarta las escrituras pendientes de esa petición. Así que
     * el expediente y sus dieciséis requisitos, creados unos milisegundos antes,
     * nunca llegan a la hoja.
     *
     * `doc2RevertirAltaFallida_` existe igualmente como red de seguridad: hay
     * caminos (crear una hoja, una migración) que fuerzan un `docCommit_` en
     * medio de la petición, y en ese caso el rollback ya no alcanza. Marca el
     * expediente como eliminado lógico en lugar de borrar la fila, porque en este
     * módulo no se borra nada y el `idempotency_key_creacion` tiene que seguir
     * ahí: si el cliente reintenta con la misma clave, tiene que encontrar el
     * mismo expediente y no crear un tercero.
     *
     * Lo que se comprueba es la propiedad observable: no hay expedientes a medio
     * crear, y el error dice qué requisito lo impidió.
     */
    const vivos = h.rowsOf("Expedientes").filter((f) => String(f.estado_expediente) !== "ELIMINADO_LOGICO");
    expect(vivos.length).toBe(0);
    expect(h.rowsOf("ExpedienteDocumentos").length).toBe(0);
    expect(res.error.mensaje).toMatch(/foto-4x4/);
    expect(res.error.pista).toMatch(/no se creó/i);
  });

  it("el backend declara que sabe hacer el alta completa, para que el cliente pregunte", () => {
    const h = loadInstalledBackend();
    const estado = h.ok("documentacion.estado");
    /*
     * Vercel despliega el frontend al fusionar; Apps Script solo cambia cuando
     * una persona publica una versión nueva de la implementación. Entre las dos
     * cosas hay una ventana en la que la interfaz nueva habla con el backend
     * viejo. Con este mapa el cliente PREGUNTA en vez de suponer, y si la
     * respuesta es no, recorre la ruta antigua de cuatro pasos sin que nadie se
     * entere.
     */
    expect(estado.soporta.altaCompleta).toBe(true);
    expect(estado.soporta.detalleMultiple).toBe(true);
    expect(estado.soporta.hojasFisicas).toBe(true);
    expect(estado.soporta.cargoAuxiliar).toBe(true);
    expect(estado.catalogoVersion).toBe(3);
  });

  it("el detalle múltiple trae varios expedientes y aísla los fallos", () => {
    const h = loadInstalledBackend();
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = h.ok("documentacion.expediente.crear", {
        expediente: { identificador: `600000${i}`, nombre: `Lote ${i}`, tipoFuncionario: "GENERAL" },
      });
      ids.push(r.expedienteId);
    }

    const res = h.ok("documentacion.expedientes.detalle", { expedienteIds: [...ids, "exp_no_existe"] });
    expect(res.devueltos).toBe(4);
    expect(res.fallidos.length).toBe(1);
    // Un id inexistente no tumba el lote: la precarga tiene que ser robusta.
    expect(res.fallidos[0].expedienteId).toBe("exp_no_existe");

    // Y viene recortado: sin auditoría, que es lo más pesado y lo menos útil
    // para pintar una ficha rápido.
    expect(res.expedientes[0].auditoria).toEqual([]);
  });

  it("el detalle múltiple tiene tope: una lista sin límite devolvería un tiempo agotado", () => {
    const h = loadInstalledBackend();
    const muchos = Array.from({ length: 200 }, (_, i) => `exp_${i}`);
    const res = h.pedir("documentacion.expedientes.detalle", { expedienteIds: muchos });
    expect(res.ok).toBe(false);
    expect(res.error.codigo).toBe("LIMITE_EXCEDIDO");
    expect(res.error.pista).toMatch(/máximo/i);
  });
});
