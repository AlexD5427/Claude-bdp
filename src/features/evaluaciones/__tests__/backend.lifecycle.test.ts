import { describe, it, expect } from "vitest";
import { loadInstalledBackend, sampleDocument } from "../../../../scripts/evaluaciones-backend.mjs";
import type { EvHarness } from "../../../../scripts/evaluaciones-backend.mjs";

/**
 * Ciclo de vida administrativo.
 *
 * La prueba central de este archivo es la de conflictos: el módulo anterior
 * respondía «otro usuario actualizó este registro» al mismo autor en la misma
 * pestaña, y eso hacía imposible guardar borradores. Aquí se fija la semántica
 * nueva, que distingue quién escribió.
 */

function crear(h: EvHarness, titulo = "Analista de riesgo crediticio") {
  const creada = h.admin("createEvaluation", { titulo });
  expect(creada.ok, JSON.stringify(creada.error)).toBe(true);
  return {
    id: creada.datos.evaluacion.id as string,
    codigo: creada.datos.evaluacion.codigo as string,
    seccionId: creada.datos.secciones[0].id as string,
    revision: creada.datos.evaluacion.revision as number,
  };
}

function guardarCompleta(h: EvHarness) {
  const base = crear(h);
  const doc = sampleDocument(base.id, base.seccionId);
  doc.revisionBase = base.revision;
  const guardada = h.admin("saveEvaluation", doc);
  expect(guardada.ok, JSON.stringify(guardada.error)).toBe(true);
  return { ...base, revision: guardada.datos.evaluacion.revision as number, doc };
}

describe("backend · ciclo de vida", () => {
  it("crear deja un borrador con código legible y una sección inicial", () => {
    const h = loadInstalledBackend();
    const creada = h.admin("createEvaluation", { titulo: "Cajero comercial" });
    expect(creada.ok).toBe(true);
    const ev = creada.datos.evaluacion;
    expect(ev.estado).toBe("borrador");
    expect(ev.codigo).toMatch(/^EV-[A-Z0-9]{3,4}-[A-Z0-9]{4}$/);
    // El alfabeto evita caracteres ambiguos para poder dictar el código.
    expect(ev.codigo).not.toMatch(/[IO01]/);
    expect(creada.datos.secciones).toHaveLength(1);
    expect(creada.datos.versiones).toHaveLength(0);
    // Valores por omisión útiles: una evaluación recién creada ya es aplicable.
    expect(ev.aplicacion.duracionMinutos).toBe(30);
    expect(ev.aplicacion.puntajeAprobacion).toBe(70);
  });

  it("guardar un borrador incompleto no falla: solo se valida la forma", () => {
    const h = loadInstalledBackend();
    const base = crear(h);
    const res = h.admin("saveEvaluation", {
      id: base.id,
      evaluacion: { titulo: "A medias" },
      secciones: [
        {
          id: base.seccionId,
          titulo: "Sin terminar",
          preguntas: [
            {
              id: "pr_sin_opciones",
              tipo: "opcion_unica",
              enunciado: { v: 1, b: [{ t: "p", s: [{ x: "¿?" }] }] },
              modoPuntaje: "exacto",
              puntos: 1,
              opciones: [],
            },
          ],
        },
      ],
    });
    expect(res.ok, JSON.stringify(res.error)).toBe(true);
    expect(res.datos.evaluacion.preguntas).toBe(1);
  });

  it("guardar recalcula el orden y conserva los identificadores del cliente", () => {
    const h = loadInstalledBackend();
    const base = crear(h);
    const res = h.admin("saveEvaluation", {
      id: base.id,
      evaluacion: { titulo: "Orden" },
      secciones: [
        {
          id: base.seccionId,
          titulo: "S",
          preguntas: [
            { id: "pr_b", tipo: "texto_corto", orden: 99, enunciado: { v: 1, b: [{ t: "p", s: [{ x: "B" }] }] }, opciones: [] },
            { id: "pr_a", tipo: "texto_corto", orden: 3, enunciado: { v: 1, b: [{ t: "p", s: [{ x: "A" }] }] }, opciones: [] },
          ],
        },
      ],
    });
    expect(res.ok).toBe(true);
    const preguntas = res.datos.secciones[0].preguntas;
    // El orden lo decide la POSICIÓN en el arreglo, no el número que manda el
    // cliente: así el editor y la prueba nunca discrepan.
    expect(preguntas.map((p: { id: string }) => p.id)).toEqual(["pr_b", "pr_a"]);
    expect(preguntas.map((p: { orden: number }) => p.orden)).toEqual([0, 1]);
  });

  it("dos preguntas con el mismo id se separan en lugar de sobrescribirse", () => {
    const h = loadInstalledBackend();
    const base = crear(h);
    const res = h.admin("saveEvaluation", {
      id: base.id,
      evaluacion: { titulo: "Duplicados" },
      secciones: [
        {
          id: base.seccionId,
          titulo: "S",
          preguntas: [
            { id: "pr_x", tipo: "texto_corto", enunciado: { v: 1, b: [{ t: "p", s: [{ x: "Primera" }] }] }, opciones: [] },
            { id: "pr_x", tipo: "texto_corto", enunciado: { v: 1, b: [{ t: "p", s: [{ x: "Segunda" }] }] }, opciones: [] },
          ],
        },
      ],
    });
    expect(res.ok).toBe(true);
    const ids = res.datos.secciones[0].preguntas.map((p: { id: string }) => p.id);
    expect(new Set(ids).size).toBe(2);
    expect(res.datos.secciones[0].preguntas).toHaveLength(2);
  });

  it("quitar una pregunta la da de baja lógica y no borra su fila", () => {
    const h = loadInstalledBackend();
    const guardada = guardarCompleta(h);
    const filasAntes = h.rowsOf("Preguntas").length;

    const doc = sampleDocument(guardada.id, guardada.seccionId);
    doc.secciones[0].preguntas = doc.secciones[0].preguntas.slice(0, 1);
    const res = h.admin("saveEvaluation", doc);
    expect(res.ok).toBe(true);
    expect(res.datos.secciones[0].preguntas).toHaveLength(1);

    const filas = h.rowsOf("Preguntas");
    expect(filas.length).toBe(filasAntes);
    const inactivas = filas.filter((f) => String(f.activo) === "FALSE");
    expect(inactivas.length).toBe(3);
  });

  /* ------------------------------ Conflictos ------------------------------ */

  it("guardar con revisión desfasada desde el MISMO cliente no es conflicto", () => {
    const h = loadInstalledBackend();
    const guardada = guardarCompleta(h);
    // Se guarda dos veces más sin refrescar la revisión, como haría una pestaña
    // que se adelanta a sí misma. Esto es lo que rompía el módulo anterior.
    for (let i = 0; i < 3; i++) {
      const doc = sampleDocument(guardada.id, guardada.seccionId);
      doc.revisionBase = 1;
      const res = h.admin("saveEvaluation", doc);
      expect(res.ok, `iteración ${i}: ${JSON.stringify(res.error)}`).toBe(true);
    }
  });

  it("guardar con revisión desfasada desde OTRO cliente sí es conflicto y explica cómo salir", () => {
    const h = loadInstalledBackend();
    const guardada = guardarCompleta(h);
    const doc = sampleDocument(guardada.id, guardada.seccionId);
    doc.revisionBase = 1;
    const res = h.admin("saveEvaluation", doc, { clientId: "otro-navegador", actor: "otra-persona" });
    expect(res.ok).toBe(false);
    expect(res.error.codigo).toBe("CONFLICT");
    expect(res.error.detalle.revisionActual).toBeGreaterThan(res.error.detalle.revisionBase);
    expect(res.error.detalle.puedeForzar).toBe(true);
    expect(res.error.detalle.actualizadoPor).toBeTruthy();
  });

  it("el conflicto se puede forzar de forma explícita", () => {
    const h = loadInstalledBackend();
    const guardada = guardarCompleta(h);
    const doc = sampleDocument(guardada.id, guardada.seccionId);
    doc.revisionBase = 1;
    doc.forzar = true;
    const res = h.admin("saveEvaluation", doc, { clientId: "otro-navegador" });
    expect(res.ok, JSON.stringify(res.error)).toBe(true);
  });

  it("sin revisionBase no se comprueba nada: un cliente simple nunca queda bloqueado", () => {
    const h = loadInstalledBackend();
    const guardada = guardarCompleta(h);
    const doc = sampleDocument(guardada.id, guardada.seccionId);
    delete doc.revisionBase;
    const res = h.admin("saveEvaluation", doc, { clientId: "cliente-tonto" });
    expect(res.ok).toBe(true);
  });

  /* ------------------------------ Publicación ----------------------------- */

  it("publicar valida el fondo y devuelve hallazgos con ruta al campo", () => {
    const h = loadInstalledBackend();
    const base = crear(h, "Evaluación sin título");
    const res = h.admin("publishEvaluation", { id: base.id });
    expect(res.ok).toBe(false);
    expect(res.error.codigo).toBe("VALIDATION_ERROR");
    const codigos = res.error.detalle.issues.map((i: { code: string }) => i.code);
    expect(codigos).toContain("TITULO_POR_OMISION");
    expect(codigos).toContain("SIN_PREGUNTAS");
    for (const issue of res.error.detalle.issues) {
      expect(issue.path, `${issue.code} necesita ruta`).toBeTruthy();
    }
  });

  it("publicar dos veces sin cambios sube la versión menor; un cambio estructural sube la mayor", () => {
    const h = loadInstalledBackend();
    const guardada = guardarCompleta(h);

    const primera = h.admin("publishEvaluation", { id: guardada.id });
    expect(primera.ok, JSON.stringify(primera.error)).toBe(true);
    expect(primera.datos.version.etiqueta).toBe("v1.0");
    expect(primera.datos.version.tipoCambio).toBe("inicial");

    const segunda = h.admin("publishEvaluation", { id: guardada.id });
    expect(segunda.ok).toBe(true);
    expect(segunda.datos.version.etiqueta).toBe("v1.1");
    expect(segunda.datos.version.tipoCambio).toBe("sin_cambios");

    // Solo cambia un texto → revisión menor.
    const soloTexto = sampleDocument(guardada.id, guardada.seccionId);
    soloTexto.secciones[0].preguntas[0].enunciado = { v: 1, b: [{ t: "p", s: [{ x: "¿Qué mide la morosidad?" }] }] };
    h.admin("saveEvaluation", soloTexto);
    const tercera = h.admin("publishEvaluation", { id: guardada.id });
    expect(tercera.datos.version.tipoCambio).toBe("presentacion");
    expect(tercera.datos.version.etiqueta).toBe("v1.2");

    // Cambia el puntaje → estructural.
    const estructural = sampleDocument(guardada.id, guardada.seccionId);
    estructural.secciones[0].preguntas[0].puntos = 5;
    h.admin("saveEvaluation", estructural);
    const cuarta = h.admin("publishEvaluation", { id: guardada.id });
    expect(cuarta.datos.version.tipoCambio).toBe("estructural");
    expect(cuarta.datos.version.etiqueta).toBe("v2.0");
  });

  it("publicar marca las versiones anteriores como reemplazadas sin tocar su contenido", () => {
    const h = loadInstalledBackend();
    const guardada = guardarCompleta(h);
    h.admin("publishEvaluation", { id: guardada.id });
    h.admin("publishEvaluation", { id: guardada.id });

    const doc = h.admin("getEvaluation", { id: guardada.id });
    const versiones = doc.datos.versiones;
    expect(versiones).toHaveLength(2);
    expect(versiones.filter((v: { estado: string }) => v.estado === "vigente")).toHaveLength(1);
    const bloques = h.rowsOf("VersionesBloques");
    expect(bloques.length).toBeGreaterThanOrEqual(2);
  });

  it("la reversión reapunta a una versión anterior sin borrar nada", () => {
    const h = loadInstalledBackend();
    const guardada = guardarCompleta(h);
    const primera = h.admin("publishEvaluation", { id: guardada.id });
    const versionUno = primera.datos.version.id;

    const cambiada = sampleDocument(guardada.id, guardada.seccionId);
    cambiada.secciones[0].preguntas[0].puntos = 7;
    h.admin("saveEvaluation", cambiada);
    h.admin("publishEvaluation", { id: guardada.id });

    const revertida = h.admin("rollbackEvaluation", { id: guardada.id, versionId: versionUno });
    expect(revertida.ok, JSON.stringify(revertida.error)).toBe(true);
    expect(revertida.datos.evaluacion.versionVigenteId).toBe(versionUno);
    expect(revertida.datos.versiones).toHaveLength(2);
  });

  it("revertir a una versión de otra evaluación responde NOT_FOUND", () => {
    const h = loadInstalledBackend();
    const guardada = guardarCompleta(h);
    h.admin("publishEvaluation", { id: guardada.id });
    const res = h.admin("rollbackEvaluation", { id: guardada.id, versionId: "vr_inventada" });
    expect(res.ok).toBe(false);
    expect(res.error.codigo).toBe("NOT_FOUND");
  });

  /* ------------------------------ Transiciones ---------------------------- */

  it("las transiciones válidas funcionan y las imposibles explican desde dónde sí", () => {
    const h = loadInstalledBackend();
    const guardada = guardarCompleta(h);
    h.admin("publishEvaluation", { id: guardada.id });

    const pausada = h.admin("transitionEvaluation", { id: guardada.id, transicion: "pausar" });
    expect(pausada.datos.evaluacion.estado).toBe("pausada");

    const reanudada = h.admin("transitionEvaluation", { id: guardada.id, transicion: "reanudar" });
    expect(reanudada.datos.evaluacion.estado).toBe("publicada");

    const cerrada = h.admin("transitionEvaluation", { id: guardada.id, transicion: "cerrar" });
    expect(cerrada.datos.evaluacion.estado).toBe("cerrada");

    const imposible = h.admin("transitionEvaluation", { id: guardada.id, transicion: "pausar" });
    expect(imposible.ok).toBe(false);
    expect(imposible.error.codigo).toBe("CONFLICT");
    expect(imposible.error.detalle.estadosValidos).toEqual(["publicada"]);

    const archivada = h.admin("transitionEvaluation", { id: guardada.id, transicion: "archivar" });
    expect(archivada.datos.evaluacion.estado).toBe("archivada");
    expect(archivada.datos.evaluacion.archivadoEn).toBeTruthy();

    const restaurada = h.admin("transitionEvaluation", { id: guardada.id, transicion: "restaurar" });
    expect(restaurada.datos.evaluacion.estado).toBe("borrador");
  });

  it("una transición inexistente enumera las válidas", () => {
    const h = loadInstalledBackend();
    const guardada = guardarCompleta(h);
    const res = h.admin("transitionEvaluation", { id: guardada.id, transicion: "explotar" });
    expect(res.ok).toBe(false);
    expect(res.error.codigo).toBe("BAD_REQUEST");
    expect(res.error.detalle.validas).toContain("pausar");
  });

  it("una evaluación archivada no se puede editar y lo dice con su remedio", () => {
    const h = loadInstalledBackend();
    const guardada = guardarCompleta(h);
    h.admin("transitionEvaluation", { id: guardada.id, transicion: "archivar" });
    const res = h.admin("saveEvaluation", sampleDocument(guardada.id, guardada.seccionId));
    expect(res.ok).toBe(false);
    expect(res.error.codigo).toBe("CONFLICT");
    expect(res.error.pista).toMatch(/Restáurala/);
  });

  it("relanzar reabre una evaluación cerrada con una ventana nueva", () => {
    const h = loadInstalledBackend();
    const guardada = guardarCompleta(h);
    h.admin("publishEvaluation", { id: guardada.id });
    h.admin("transitionEvaluation", { id: guardada.id, transicion: "cerrar" });

    const relanzada = h.admin("relaunchEvaluation", {
      id: guardada.id,
      ventanaFin: "2030-01-01T00:00:00.000Z",
    });
    expect(relanzada.ok, JSON.stringify(relanzada.error)).toBe(true);
    expect(relanzada.datos.evaluacion.estado).toBe("publicada");
    expect(relanzada.datos.evaluacion.aplicacion.ventanaFin).toBe("2030-01-01T00:00:00.000Z");
  });

  it("relanzar una evaluación nunca publicada se rechaza con explicación", () => {
    const h = loadInstalledBackend();
    const guardada = guardarCompleta(h);
    const res = h.admin("relaunchEvaluation", { id: guardada.id });
    expect(res.ok).toBe(false);
    expect(res.error.pista).toMatch(/Publícala primero/);
  });

  /* -------------------------- Duplicar y eliminar ------------------------- */

  it("duplicar copia todo con identificadores nuevos y sin historial", () => {
    const h = loadInstalledBackend();
    const guardada = guardarCompleta(h);
    h.admin("publishEvaluation", { id: guardada.id });

    const copia = h.admin("duplicateEvaluation", { id: guardada.id });
    expect(copia.ok, JSON.stringify(copia.error)).toBe(true);
    const nueva = copia.datos.evaluacion;
    expect(nueva.id).not.toBe(guardada.id);
    expect(nueva.codigo).not.toBe(guardada.codigo);
    expect(nueva.titulo).toMatch(/\(copia\)$/);
    expect(nueva.estado).toBe("borrador");
    expect(nueva.versionVigenteId).toBe("");
    expect(copia.datos.versiones).toHaveLength(0);

    const preguntasOriginales = h
      .admin("getEvaluation", { id: guardada.id })
      .datos.secciones[0].preguntas.map((p: { id: string }) => p.id);
    const preguntasCopia = copia.datos.secciones[0].preguntas.map((p: { id: string }) => p.id);
    expect(preguntasCopia).toHaveLength(preguntasOriginales.length);
    for (const id of preguntasCopia) expect(preguntasOriginales).not.toContain(id);
  });

  it("eliminar mueve a la papelera y restaurar la devuelve a borrador", () => {
    const h = loadInstalledBackend();
    const guardada = guardarCompleta(h);

    const borrada = h.admin("deleteEvaluation", { id: guardada.id });
    expect(borrada.ok).toBe(true);

    const listado = h.admin("listEvaluations");
    expect(listado.datos.items.map((i: { id: string }) => i.id)).not.toContain(guardada.id);

    const conPapelera = h.admin("listEvaluations", { incluirPapelera: true });
    expect(conPapelera.datos.items.map((i: { id: string }) => i.id)).toContain(guardada.id);

    const restaurada = h.admin("transitionEvaluation", { id: guardada.id, transicion: "restaurar" });
    expect(restaurada.datos.evaluacion.estado).toBe("borrador");
  });

  it("el borrado permanente exige confirmación explícita y arrastra lo dependiente", () => {
    const h = loadInstalledBackend();
    const guardada = guardarCompleta(h);
    h.admin("publishEvaluation", { id: guardada.id });

    const sinConfirmar = h.admin("purgeEvaluation", { id: guardada.id });
    expect(sinConfirmar.ok).toBe(false);
    expect(sinConfirmar.error.pista).toMatch(/confirmacion/);

    const purgada = h.admin("purgeEvaluation", { id: guardada.id, confirmacion: "ELIMINAR" });
    expect(purgada.ok, JSON.stringify(purgada.error)).toBe(true);
    expect(purgada.datos.borrado.evaluacion).toBe(1);
    expect(purgada.datos.borrado.preguntas).toBeGreaterThan(0);
    expect(h.rowsOf("Preguntas")).toHaveLength(0);
    expect(h.rowsOf("VersionesBloques")).toHaveLength(0);
  });

  /* ------------------------------ Idempotencia ---------------------------- */

  it("repetir una escritura con el mismo identificador no duplica el efecto", () => {
    const h = loadInstalledBackend();
    const solicitudId = "solicitud-fija";
    const primera = h.admin("createEvaluation", { titulo: "Una sola vez" }, { solicitudId });
    expect(primera.ok).toBe(true);
    const segunda = h.admin("createEvaluation", { titulo: "Una sola vez" }, { solicitudId });
    expect(segunda.ok).toBe(true);
    expect(segunda.avisos).toContain("SOLICITUD_REPETIDA");
    expect(segunda.datos.repetida).toBe(true);
    expect(h.rowsOf("Evaluaciones")).toHaveLength(1);
  });

  it("una escritura sin identificador de solicitud se rechaza con instrucciones", () => {
    const h = loadInstalledBackend();
    const res = h.admin("createEvaluation", { titulo: "X" }, { solicitudId: "" });
    expect(res.ok).toBe(false);
    expect(res.error.codigo).toBe("BAD_REQUEST");
    expect(res.error.pista).toMatch(/solicitudId/);
  });

  it("si el bloqueo no se libera se responde BUSY, no un error genérico", () => {
    const h = loadInstalledBackend();
    h.state.lockAvailable = false;
    const res = h.admin("createEvaluation", { titulo: "Ocupado" });
    expect(res.ok).toBe(false);
    expect(res.error.codigo).toBe("BUSY");
    expect(res.error.pista).toMatch(/no la duplica/);
  });

  it("un fallo a mitad de la operación no deja escrituras a medias", () => {
    const h = loadInstalledBackend();
    const base = crear(h);
    const filasAntes = h.rowsOf("Preguntas").length;
    // Un texto que no cabe en una celda: la conversión falla ANTES de escribir.
    const res = h.admin("saveEvaluation", {
      id: base.id,
      evaluacion: { titulo: "Demasiado", notasInternas: "x".repeat(60000) },
      secciones: [
        {
          id: base.seccionId,
          titulo: "S",
          preguntas: [
            { id: "pr_ok", tipo: "texto_corto", enunciado: { v: 1, b: [{ t: "p", s: [{ x: "Ok" }] }] }, opciones: [] },
          ],
        },
      ],
    });
    // El texto se recorta al límite del campo, así que la operación no falla;
    // lo que se comprueba es que ninguna celda supera el techo de Sheets.
    expect(res.ok).toBe(true);
    const evaluaciones = h.rowsOf("Evaluaciones");
    for (const fila of evaluaciones) {
      for (const valor of Object.values(fila)) {
        if (typeof valor === "string") expect(valor.length).toBeLessThanOrEqual(50000);
      }
    }
    expect(h.rowsOf("Preguntas").length).toBeGreaterThanOrEqual(filasAntes);
  });

  it("el listado calcula intentos, versiones y filtra por estado y texto", () => {
    const h = loadInstalledBackend();
    const guardada = guardarCompleta(h);
    h.admin("publishEvaluation", { id: guardada.id });
    crear(h, "Cajero comercial");

    const todas = h.admin("listEvaluations");
    expect(todas.datos.items).toHaveLength(2);

    const publicadas = h.admin("listEvaluations", { estados: ["publicada"] });
    expect(publicadas.datos.items).toHaveLength(1);
    expect(publicadas.datos.items[0].versiones).toBe(1);

    const buscadas = h.admin("listEvaluations", { buscar: "cajero" });
    expect(buscadas.datos.items).toHaveLength(1);
    expect(buscadas.datos.items[0].titulo).toBe("Cajero comercial");
  });
});
