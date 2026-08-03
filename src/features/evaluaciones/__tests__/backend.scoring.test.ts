import { describe, it, expect } from "vitest";
import { loadInstalledBackend } from "../../../../scripts/evaluaciones-backend.mjs";
import type { EvHarness } from "../../../../scripts/evaluaciones-backend.mjs";

/**
 * Calificación, tipo por tipo.
 *
 * El módulo anterior declaraba decenas de tipos de pregunta en el navegador y el
 * servidor solo sabía calificar unos pocos: el resto quedaba en cero o en
 * «pendiente» sin explicación. Aquí cada tipo con clave tiene su prueba, y el
 * catálogo del frontend y del backend se comparan en `typeParity.test.ts`.
 *
 * Nota sobre los identificadores: el backend exige ids de al menos tres
 * caracteres (`evIsId_`), porque un id demasiado corto es indistinguible de un
 * valor de opción y facilita colisiones. Las pruebas usan `pr_…` y `op_…`.
 */

function texto(x: string) {
  return { v: 1, b: [{ t: "p", s: [{ x }] }] };
}

/** Opción simple: identificador, texto y bandera de correcta. */
function opcion(id: string, label: string, extra: Record<string, unknown> = {}) {
  return { id, texto: texto(label), valor: id.replace(/^op_/, ""), ...extra };
}

/** Publica una evaluación con las preguntas dadas y devuelve su código. */
function conPreguntas(h: EvHarness, preguntas: Record<string, any>[], aplicacion: Record<string, any> = {}) {
  const creada = h.admin("createEvaluation", { titulo: "Calificación" });
  const id = creada.datos.evaluacion.id as string;
  const seccionId = creada.datos.secciones[0].id as string;
  const guardada = h.admin("saveEvaluation", {
    id,
    evaluacion: {
      titulo: "Calificación",
      aplicacion: { duracionMinutos: 30, puntajeAprobacion: 60, intentosMaximos: 9, ...aplicacion },
      participante: { visibilidadResultado: "nota_y_detalle" },
    },
    secciones: [{ id: seccionId, titulo: "Sección", preguntas }],
  });
  expect(guardada.ok, JSON.stringify(guardada.error)).toBe(true);
  const pub = h.admin("publishEvaluation", { id });
  expect(pub.ok, JSON.stringify(pub.error)).toBe(true);
  return { id, seccionId, codigo: creada.datos.evaluacion.codigo as string };
}

let contador = 0;

/** Responde y devuelve el detalle administrativo del intento. */
function responder(h: EvHarness, codigo: string, respuestas: Record<string, any>[]) {
  contador += 1;
  const inicio = h.publico("startAttempt", {
    codigo,
    participante: { nombre: "Ana", documento: `DOC-${contador}` },
  });
  expect(inicio.ok, JSON.stringify(inicio.error)).toBe(true);
  const envio = h.publico("submitAttempt", {
    intentoId: inicio.datos.intentoId,
    token: inicio.datos.token,
    respuestas,
  });
  expect(envio.ok, JSON.stringify(envio.error)).toBe(true);
  const detalle = h.admin("getAttempt", { intentoId: inicio.datos.intentoId });
  expect(detalle.ok, JSON.stringify(detalle.error)).toBe(true);
  return { intento: detalle.datos.intento, respuestas: detalle.datos.respuestas, resultado: envio.datos };
}

/** Puntos otorgados a una pregunta concreta. */
function puntos(h: EvHarness, codigo: string, respuestas: Record<string, any>[], preguntaId: string) {
  const detalle = responder(h, codigo, respuestas);
  const encontrada = detalle.respuestas.find((r: { preguntaId: string }) => r.preguntaId === preguntaId);
  return encontrada ? encontrada.puntosObtenidos : null;
}

describe("backend · calificación por tipo", () => {
  it("opción única: exacta, sin puntos parciales", () => {
    const h = loadInstalledBackend();
    const ev = conPreguntas(h, [
      {
        id: "pr_unica",
        tipo: "opcion_unica",
        enunciado: texto("¿Cuánto es 2 + 2?"),
        modoPuntaje: "exacto",
        puntos: 4,
        opciones: [opcion("op_a", "4", { correcta: true }), opcion("op_b", "5")],
      },
    ]);
    expect(puntos(h, ev.codigo, [{ preguntaId: "pr_unica", opciones: ["op_a"] }], "pr_unica")).toBe(4);
    expect(puntos(h, ev.codigo, [{ preguntaId: "pr_unica", opciones: ["op_b"] }], "pr_unica")).toBe(0);
    expect(puntos(h, ev.codigo, [{ preguntaId: "pr_unica", opciones: [] }], "pr_unica")).toBe(0);
  });

  it("opción múltiple parcial: crédito proporcional castigando los falsos positivos", () => {
    const h = loadInstalledBackend();
    const ev = conPreguntas(h, [
      {
        id: "pr_multi",
        tipo: "opcion_multiple",
        enunciado: texto("Selecciona los indicadores de liquidez."),
        modoPuntaje: "parcial",
        puntos: 6,
        opciones: [
          opcion("op_a", "Razón corriente", { correcta: true }),
          opcion("op_b", "Prueba ácida", { correcta: true }),
          opcion("op_c", "Capital de trabajo", { correcta: true }),
          opcion("op_d", "ROE"),
        ],
      },
    ]);
    const p = (elegidas: string[]) =>
      puntos(h, ev.codigo, [{ preguntaId: "pr_multi", opciones: elegidas }], "pr_multi");
    expect(p(["op_a", "op_b", "op_c"])).toBe(6);
    expect(p(["op_a", "op_b"])).toBe(4);
    // Dos aciertos y un fallo: neto 1 sobre 3.
    expect(p(["op_a", "op_b", "op_d"])).toBe(2);
    // Marcar todo no garantiza la nota máxima.
    expect(p(["op_a", "op_b", "op_c", "op_d"])).toBe(4);
  });

  it("opción múltiple exacta: todo o nada", () => {
    const h = loadInstalledBackend();
    const ev = conPreguntas(h, [
      {
        id: "pr_multi",
        tipo: "opcion_multiple",
        enunciado: texto("Selecciona."),
        modoPuntaje: "exacto",
        puntos: 5,
        opciones: [
          opcion("op_a", "A", { correcta: true }),
          opcion("op_b", "B", { correcta: true }),
          opcion("op_c", "C"),
        ],
      },
    ]);
    const p = (elegidas: string[]) =>
      puntos(h, ev.codigo, [{ preguntaId: "pr_multi", opciones: elegidas }], "pr_multi");
    expect(p(["op_a", "op_b"])).toBe(5);
    expect(p(["op_a"])).toBe(0);
    expect(p(["op_a", "op_b", "op_c"])).toBe(0);
  });

  it("puntaje por opción: cada opción aporta lo suyo, acotado al máximo", () => {
    const h = loadInstalledBackend();
    const ev = conPreguntas(h, [
      {
        id: "pr_multi",
        tipo: "opcion_multiple",
        enunciado: texto("Selecciona."),
        modoPuntaje: "por_opcion",
        puntos: 5,
        opciones: [
          opcion("op_a", "A", { correcta: true, puntos: 3 }),
          opcion("op_b", "B", { correcta: true, puntos: 2 }),
          opcion("op_c", "C", { puntos: 0 }),
        ],
      },
    ]);
    const p = (elegidas: string[]) =>
      puntos(h, ev.codigo, [{ preguntaId: "pr_multi", opciones: elegidas }], "pr_multi");
    expect(p(["op_a"])).toBe(3);
    expect(p(["op_a", "op_b"])).toBe(5);
    expect(p(["op_c"])).toBe(0);
  });

  it("verdadero/falso y sí/no/NA se califican como opción única", () => {
    const h = loadInstalledBackend();
    const ev = conPreguntas(h, [
      {
        id: "pr_vf",
        tipo: "verdadero_falso",
        enunciado: texto("La mora mide atrasos."),
        modoPuntaje: "exacto",
        puntos: 1,
        opciones: [opcion("op_verdadero", "Verdadero", { correcta: true }), opcion("op_falso", "Falso")],
      },
      {
        id: "pr_sna",
        tipo: "si_no_na",
        enunciado: texto("¿Aplica la garantía?"),
        modoPuntaje: "exacto",
        puntos: 1,
        opciones: [opcion("op_si", "Sí"), opcion("op_no", "No", { correcta: true }), opcion("op_na", "N/A")],
      },
    ]);
    const detalle = responder(h, ev.codigo, [
      { preguntaId: "pr_vf", opciones: ["op_verdadero"] },
      { preguntaId: "pr_sna", opciones: ["op_no"] },
    ]);
    expect(detalle.intento.nota).toBe(100);
  });

  it("números: tolerancia configurable y rechazo del texto", () => {
    const h = loadInstalledBackend();
    const ev = conPreguntas(h, [
      {
        id: "pr_cuota",
        tipo: "decimal",
        enunciado: texto("Calcula la cuota mensual."),
        modoPuntaje: "exacto",
        puntos: 3,
        respuestaEsperada: { valor: 1250.5, tolerancia: 0.5 },
        opciones: [],
      },
    ]);
    const p = (valor: unknown) => puntos(h, ev.codigo, [{ preguntaId: "pr_cuota", valor }], "pr_cuota");
    expect(p(1250.5)).toBe(3);
    expect(p(1250.2)).toBe(3);
    expect(p(1249)).toBe(0);
    expect(p("mil doscientos")).toBe(0);
  });

  it("porcentaje y moneda usan la misma comparación numérica", () => {
    const h = loadInstalledBackend();
    const ev = conPreguntas(h, [
      {
        id: "pr_pct",
        tipo: "porcentaje",
        enunciado: texto("Margen"),
        modoPuntaje: "exacto",
        puntos: 1,
        respuestaEsperada: { valor: 12.5 },
        opciones: [],
      },
      {
        id: "pr_bs",
        tipo: "moneda",
        enunciado: texto("Monto en Bs"),
        modoPuntaje: "exacto",
        puntos: 1,
        respuestaEsperada: { valor: 3500 },
        opciones: [],
      },
    ]);
    const detalle = responder(h, ev.codigo, [
      { preguntaId: "pr_pct", valor: 12.5 },
      { preguntaId: "pr_bs", valor: 3500 },
    ]);
    expect(detalle.intento.nota).toBe(100);
  });

  it("texto corto: ignora mayúsculas y acentos, y admite alternativas", () => {
    const h = loadInstalledBackend();
    const ev = conPreguntas(h, [
      {
        id: "pr_capital",
        tipo: "texto_corto",
        enunciado: texto("Capital constitucional de Bolivia"),
        modoPuntaje: "exacto",
        puntos: 2,
        respuestaEsperada: { valor: "Sucre", alternativas: ["La ciudad de Sucre"] },
        opciones: [],
      },
    ]);
    const p = (valor: string) => puntos(h, ev.codigo, [{ preguntaId: "pr_capital", valor }], "pr_capital");
    expect(p("sucre")).toBe(2);
    expect(p("  SUCRE ")).toBe(2);
    expect(p("la ciudad de sucre")).toBe(2);
    expect(p("La Paz")).toBe(0);
  });

  it("la sensibilidad a mayúsculas se puede exigir", () => {
    const h = loadInstalledBackend();
    const ev = conPreguntas(h, [
      {
        id: "pr_simbolo",
        tipo: "texto_corto",
        enunciado: texto("Símbolo del kilogramo"),
        modoPuntaje: "exacto",
        puntos: 1,
        respuestaEsperada: { valor: "Kg", ignorarMayusculas: false },
        opciones: [],
      },
    ]);
    const p = (valor: string) => puntos(h, ev.codigo, [{ preguntaId: "pr_simbolo", valor }], "pr_simbolo");
    expect(p("Kg")).toBe(1);
    expect(p("kg")).toBe(0);
  });

  it("escala lineal se compara como número", () => {
    const h = loadInstalledBackend();
    const ev = conPreguntas(h, [
      {
        id: "pr_escala",
        tipo: "escala_lineal",
        enunciado: texto("Nivel de riesgo"),
        modoPuntaje: "exacto",
        puntos: 2,
        configuracion: { minimo: 1, maximo: 5 },
        respuestaEsperada: { valor: 4 },
        opciones: [],
      },
    ]);
    const p = (valor: number) => puntos(h, ev.codigo, [{ preguntaId: "pr_escala", valor }], "pr_escala");
    expect(p(4)).toBe(2);
    expect(p(3)).toBe(0);
  });

  it("ordenar: crédito por posición absoluta acertada", () => {
    const h = loadInstalledBackend();
    const ev = conPreguntas(h, [
      {
        id: "pr_orden",
        tipo: "ordenar",
        enunciado: texto("Ordena las etapas del proceso de crédito."),
        modoPuntaje: "parcial",
        puntos: 4,
        opciones: [
          opcion("op_paso1", "Solicitud"),
          opcion("op_paso2", "Análisis"),
          opcion("op_paso3", "Aprobación"),
          opcion("op_paso4", "Desembolso"),
        ],
      },
    ]);
    const p = (valor: string[]) => puntos(h, ev.codigo, [{ preguntaId: "pr_orden", valor }], "pr_orden");
    expect(p(["op_paso1", "op_paso2", "op_paso3", "op_paso4"])).toBe(4);
    // Dos en su sitio de cuatro.
    expect(p(["op_paso1", "op_paso2", "op_paso4", "op_paso3"])).toBe(2);
    expect(p(["op_paso4", "op_paso3", "op_paso2", "op_paso1"])).toBe(0);
  });

  it("ordenar con puntaje exacto es todo o nada", () => {
    const h = loadInstalledBackend();
    const ev = conPreguntas(h, [
      {
        id: "pr_orden",
        tipo: "ordenar",
        enunciado: texto("Ordena."),
        modoPuntaje: "exacto",
        puntos: 3,
        opciones: [opcion("op_uno", "Uno"), opcion("op_dos", "Dos"), opcion("op_tres", "Tres")],
      },
    ]);
    const p = (valor: string[]) => puntos(h, ev.codigo, [{ preguntaId: "pr_orden", valor }], "pr_orden");
    expect(p(["op_uno", "op_dos", "op_tres"])).toBe(3);
    expect(p(["op_uno", "op_tres", "op_dos"])).toBe(0);
  });

  it("emparejar: cada par acertado suma", () => {
    const h = loadInstalledBackend();
    const ev = conPreguntas(h, [
      {
        id: "pr_empareja",
        tipo: "emparejar",
        enunciado: texto("Relaciona el indicador con lo que mide."),
        modoPuntaje: "parcial",
        puntos: 6,
        opciones: [
          opcion("op_mora", "Mora", { claveEmparejamiento: "Atrasos" }),
          opcion("op_roe", "ROE", { claveEmparejamiento: "Rentabilidad" }),
          opcion("op_liq", "Razón corriente", { claveEmparejamiento: "Liquidez" }),
        ],
      },
    ]);
    const p = (valor: Record<string, string>) =>
      puntos(h, ev.codigo, [{ preguntaId: "pr_empareja", valor }], "pr_empareja");
    expect(p({ op_mora: "Atrasos", op_roe: "Rentabilidad", op_liq: "Liquidez" })).toBe(6);
    expect(p({ op_mora: "atrasos", op_roe: "Rentabilidad" })).toBe(4);
    expect(p({ op_mora: "Otra cosa" })).toBe(0);
  });

  it("clasificar: cada elemento en su grupo correcto suma", () => {
    const h = loadInstalledBackend();
    const ev = conPreguntas(h, [
      {
        id: "pr_clasifica",
        tipo: "clasificar",
        enunciado: texto("Clasifica las cuentas."),
        modoPuntaje: "parcial",
        puntos: 4,
        configuracion: { grupos: ["Activo", "Pasivo"] },
        opciones: [
          opcion("op_caja", "Caja", { claveEmparejamiento: "Activo" }),
          opcion("op_prestamo", "Préstamo bancario", { claveEmparejamiento: "Pasivo" }),
        ],
      },
    ]);
    const p = (valor: Record<string, string>) =>
      puntos(h, ev.codigo, [{ preguntaId: "pr_clasifica", valor }], "pr_clasifica");
    expect(p({ op_caja: "Activo", op_prestamo: "Pasivo" })).toBe(4);
    expect(p({ op_caja: "Activo", op_prestamo: "Activo" })).toBe(2);
  });

  it("cuadrícula de opción única: una columna correcta por fila", () => {
    const h = loadInstalledBackend();
    const ev = conPreguntas(h, [
      {
        id: "pr_grid",
        tipo: "cuadricula_opcion",
        enunciado: texto("Evalúa cada riesgo."),
        modoPuntaje: "parcial",
        puntos: 4,
        configuracion: { columnasMatriz: ["Bajo", "Medio", "Alto"] },
        opciones: [
          opcion("op_fila1", "Riesgo país", { claveEmparejamiento: "Alto" }),
          opcion("op_fila2", "Riesgo sector", { claveEmparejamiento: "Medio" }),
        ],
      },
    ]);
    const p = (valor: Record<string, string>) => puntos(h, ev.codigo, [{ preguntaId: "pr_grid", valor }], "pr_grid");
    expect(p({ op_fila1: "Alto", op_fila2: "Medio" })).toBe(4);
    expect(p({ op_fila1: "Alto", op_fila2: "Bajo" })).toBe(2);
    expect(p({ op_fila1: "Bajo", op_fila2: "Bajo" })).toBe(0);
  });

  it("cuadrícula de casillas: la fila acierta solo con el conjunto exacto", () => {
    const h = loadInstalledBackend();
    const ev = conPreguntas(h, [
      {
        id: "pr_grid",
        tipo: "cuadricula_casillas",
        enunciado: texto("Marca lo que aplica."),
        modoPuntaje: "parcial",
        puntos: 4,
        configuracion: { columnasMatriz: ["A", "B", "C"] },
        opciones: [
          opcion("op_fila1", "Fila 1", { claveEmparejamiento: "A,B" }),
          opcion("op_fila2", "Fila 2", { claveEmparejamiento: "C" }),
        ],
      },
    ]);
    const p = (valor: Record<string, string[]>) => puntos(h, ev.codigo, [{ preguntaId: "pr_grid", valor }], "pr_grid");
    expect(p({ op_fila1: ["A", "B"], op_fila2: ["C"] })).toBe(4);
    expect(p({ op_fila1: ["A"], op_fila2: ["C"] })).toBe(2);
    // Marcar de más también falla la fila.
    expect(p({ op_fila1: ["A", "B", "C"], op_fila2: ["C"] })).toBe(2);
  });

  it("rellenar huecos: cada hueco admite equivalentes", () => {
    const h = loadInstalledBackend();
    const ev = conPreguntas(h, [
      {
        id: "pr_huecos",
        tipo: "rellenar_huecos",
        enunciado: texto("La razón ___ mide la ___."),
        modoPuntaje: "parcial",
        puntos: 4,
        respuestaEsperada: {
          huecos: [
            { clave: "h1", respuestas: ["corriente"] },
            { clave: "h2", respuestas: ["liquidez", "solvencia de corto plazo"] },
          ],
        },
        opciones: [],
      },
    ]);
    const p = (valor: Record<string, string>) =>
      puntos(h, ev.codigo, [{ preguntaId: "pr_huecos", valor }], "pr_huecos");
    expect(p({ h1: "corriente", h2: "liquidez" })).toBe(4);
    expect(p({ h1: "Corriente", h2: "solvencia de corto plazo" })).toBe(4);
    expect(p({ h1: "corriente" })).toBe(2);
    expect(p({ h1: "ácida", h2: "rentabilidad" })).toBe(0);
  });

  it("la penalización resta pero nunca deja la pregunta en negativo", () => {
    const h = loadInstalledBackend();
    const ev = conPreguntas(h, [
      {
        id: "pr_unica",
        tipo: "opcion_unica",
        enunciado: texto("¿Cuál es?"),
        modoPuntaje: "exacto",
        puntos: 2,
        penalizacion: 5,
        opciones: [opcion("op_a", "A", { correcta: true }), opcion("op_b", "B")],
      },
    ]);
    expect(puntos(h, ev.codigo, [{ preguntaId: "pr_unica", opciones: ["op_b"] }], "pr_unica")).toBe(0);
    expect(puntos(h, ev.codigo, [{ preguntaId: "pr_unica", opciones: ["op_a"] }], "pr_unica")).toBe(2);
  });

  it("texto largo y código quedan pendientes de revisión, no en cero", () => {
    const h = loadInstalledBackend();
    const ev = conPreguntas(h, [
      {
        id: "pr_abierta",
        tipo: "texto_largo",
        enunciado: texto("Justifica tu recomendación."),
        modoPuntaje: "manual",
        puntos: 5,
        opciones: [],
      },
      {
        id: "pr_codigo",
        tipo: "codigo",
        enunciado: texto("Escribe la consulta SQL."),
        modoPuntaje: "manual",
        puntos: 5,
        opciones: [],
      },
    ], { puntajeAprobacion: null });
    const detalle = responder(h, ev.codigo, [
      { preguntaId: "pr_abierta", valor: "Recomiendo aprobar con garantía." },
      { preguntaId: "pr_codigo", valor: "SELECT 1" },
    ]);
    expect(detalle.intento.estadoCalificacion).toBe("pendiente_revision");
    expect(detalle.intento.nota).toBeNull();
    expect(detalle.intento.pendientesRevision).toBe(2);
    for (const r of detalle.respuestas) {
      expect(r.requiereRevision).toBe(true);
      expect(r.puntosObtenidos).toBeNull();
    }
  });

  it("una pregunta cerrada SIN clave no se puede publicar, y si llega se marca para revisión", () => {
    const h = loadInstalledBackend();
    const creada = h.admin("createEvaluation", { titulo: "Sin clave" });
    h.admin("saveEvaluation", {
      id: creada.datos.evaluacion.id,
      evaluacion: { titulo: "Sin clave", aplicacion: { duracionMinutos: 10, puntajeAprobacion: null } },
      secciones: [
        {
          id: creada.datos.secciones[0].id,
          titulo: "Sección",
          preguntas: [
            {
              id: "pr_sinclave",
              tipo: "opcion_unica",
              enunciado: texto("¿Cuál prefieres?"),
              modoPuntaje: "exacto",
              puntos: 3,
              opciones: [opcion("op_a", "A"), opcion("op_b", "B")],
            },
          ],
        },
      ],
    });
    const res = h.admin("publishEvaluation", { id: creada.datos.evaluacion.id });
    expect(res.ok).toBe(false);
    const hallazgo = res.error.detalle.issues.find((i: { code: string }) => i.code === "SIN_CLAVE");
    expect(hallazgo).toBeTruthy();
    expect(hallazgo.path).toContain("respuestaEsperada");

    // Y, por si una evaluación antigua llegara en ese estado, el calificador la
    // manda a revisión humana en lugar de otorgar cero.
    const rowLike = { tipo: "opcion_unica", modo_puntaje: "exacto", puntos: 3, respuesta_esperada: null };
    const sinCorrectas = [{ correcta: false, clave_emparejamiento: "", puntos: 0 }];
    expect(h.call("evIsAutoGradable_", rowLike, sinCorrectas)).toBe(false);
    expect(h.call("evRequiresManualReview_", rowLike, sinCorrectas)).toBe(true);
  });

  it("los bloques de contenido no puntúan ni cuentan como pregunta", () => {
    const h = loadInstalledBackend();
    const ev = conPreguntas(h, [
      { id: "pr_titulo", tipo: "contenido_titulo", enunciado: texto("Análisis de caso"), opciones: [] },
      { id: "pr_parrafo", tipo: "contenido_parrafo", enunciado: texto("Lee el caso siguiente."), opciones: [] },
      {
        id: "pr_unica",
        tipo: "opcion_unica",
        enunciado: texto("¿Aprobarías?"),
        modoPuntaje: "exacto",
        puntos: 1,
        opciones: [opcion("op_a", "Sí", { correcta: true }), opcion("op_b", "No")],
      },
    ]);
    const item = h.admin("listEvaluations").datos.items.find((i: { id: string }) => i.id === ev.id);
    expect(item.preguntas).toBe(1);
    expect(item.puntosTotales).toBe(1);

    const detalle = responder(h, ev.codigo, [{ preguntaId: "pr_unica", opciones: ["op_a"] }]);
    expect(detalle.intento.nota).toBe(100);
  });

  it("una pregunta sin responder cuenta en el denominador", () => {
    const h = loadInstalledBackend();
    const ev = conPreguntas(h, [
      {
        id: "pr_uno",
        tipo: "opcion_unica",
        enunciado: texto("Uno"),
        modoPuntaje: "exacto",
        puntos: 5,
        opciones: [opcion("op_a1", "A", { correcta: true }), opcion("op_b1", "B")],
      },
      {
        id: "pr_dos",
        tipo: "opcion_unica",
        enunciado: texto("Dos"),
        modoPuntaje: "exacto",
        puntos: 5,
        opciones: [opcion("op_a2", "A", { correcta: true }), opcion("op_b2", "B")],
      },
    ]);
    const detalle = responder(h, ev.codigo, [{ preguntaId: "pr_uno", opciones: ["op_a1"] }]);
    expect(detalle.intento.nota).toBe(50);
    expect(detalle.intento.sinResponder).toBe(1);
    expect(detalle.intento.puntosPosibles).toBe(10);
    expect(detalle.intento.puntosObtenidos).toBe(5);
  });

  it("el criterio de aprobación por puntos y por porcentaje dan veredictos distintos", () => {
    const h = loadInstalledBackend();
    const preguntas = [
      {
        id: "pr_uno",
        tipo: "opcion_unica",
        enunciado: texto("Uno"),
        modoPuntaje: "exacto",
        puntos: 10,
        opciones: [opcion("op_a1", "A", { correcta: true }), opcion("op_b1", "B")],
      },
      {
        id: "pr_dos",
        tipo: "opcion_unica",
        enunciado: texto("Dos"),
        modoPuntaje: "exacto",
        puntos: 10,
        opciones: [opcion("op_a2", "A", { correcta: true }), opcion("op_b2", "B")],
      },
    ];
    const porPorcentaje = conPreguntas(h, preguntas, { puntajeAprobacion: 60, criterioAprobacion: "porcentaje" });
    const conPorcentaje = responder(h, porPorcentaje.codigo, [{ preguntaId: "pr_uno", opciones: ["op_a1"] }]);
    expect(conPorcentaje.intento.nota).toBe(50);
    expect(conPorcentaje.intento.aprobado).toBe(false);

    const porPuntos = conPreguntas(h, preguntas, { puntajeAprobacion: 10, criterioAprobacion: "puntos" });
    const conPuntos = responder(h, porPuntos.codigo, [{ preguntaId: "pr_uno", opciones: ["op_a1"] }]);
    expect(conPuntos.intento.puntosObtenidos).toBe(10);
    expect(conPuntos.intento.aprobado).toBe(true);
  });

  it("un puntaje de aprobación imposible se detecta al publicar", () => {
    const h = loadInstalledBackend();
    const creada = h.admin("createEvaluation", { titulo: "Aprobación imposible" });
    h.admin("saveEvaluation", {
      id: creada.datos.evaluacion.id,
      evaluacion: {
        titulo: "Aprobación imposible",
        aplicacion: { duracionMinutos: 10, puntajeAprobacion: 50, criterioAprobacion: "puntos" },
      },
      secciones: [
        {
          id: creada.datos.secciones[0].id,
          titulo: "Sección",
          preguntas: [
            {
              id: "pr_unica",
              tipo: "opcion_unica",
              enunciado: texto("¿Cuál?"),
              modoPuntaje: "exacto",
              puntos: 5,
              opciones: [opcion("op_a", "A", { correcta: true }), opcion("op_b", "B")],
            },
          ],
        },
      ],
    });
    const res = h.admin("publishEvaluation", { id: creada.datos.evaluacion.id });
    expect(res.ok).toBe(false);
    const codigos = res.error.detalle.issues.map((i: { code: string }) => i.code);
    expect(codigos).toContain("APROBACION_IMPOSIBLE");
  });

  it("dos correctas en una pregunta de respuesta única se bloquea al publicar", () => {
    const h = loadInstalledBackend();
    const creada = h.admin("createEvaluation", { titulo: "Estado imposible" });
    h.admin("saveEvaluation", {
      id: creada.datos.evaluacion.id,
      evaluacion: { titulo: "Estado imposible", aplicacion: { duracionMinutos: 10 } },
      secciones: [
        {
          id: creada.datos.secciones[0].id,
          titulo: "Sección",
          preguntas: [
            {
              id: "pr_unica",
              tipo: "opcion_unica",
              enunciado: texto("¿Cuál?"),
              modoPuntaje: "exacto",
              puntos: 1,
              opciones: [opcion("op_a", "A", { correcta: true }), opcion("op_b", "B", { correcta: true })],
            },
          ],
        },
      ],
    });
    const res = h.admin("publishEvaluation", { id: creada.datos.evaluacion.id });
    expect(res.ok).toBe(false);
    const hallazgo = res.error.detalle.issues.find((i: { code: string }) => i.code === "VARIAS_CORRECTAS");
    expect(hallazgo).toBeTruthy();
    expect(hallazgo.details.correctas).toBe(2);
  });

  it("un puntaje enviado por el cliente se descarta siempre", () => {
    const h = loadInstalledBackend();
    const ev = conPreguntas(h, [
      {
        id: "pr_unica",
        tipo: "opcion_unica",
        enunciado: texto("¿Cuál?"),
        modoPuntaje: "exacto",
        puntos: 2,
        opciones: [opcion("op_a", "A", { correcta: true }), opcion("op_b", "B")],
      },
    ]);
    const detalle = responder(h, ev.codigo, [
      { preguntaId: "pr_unica", opciones: ["op_b"], correcta: true, puntosObtenidos: 999, nota: 100, aprobado: true },
    ]);
    const respuesta = detalle.respuestas.find((r: { preguntaId: string }) => r.preguntaId === "pr_unica");
    expect(respuesta.puntosObtenidos).toBe(0);
    expect(detalle.intento.nota).toBe(0);
    expect(detalle.intento.aprobado).toBe(false);
  });

  it("editar la pregunta después del intento no cambia la nota ya calculada", () => {
    const h = loadInstalledBackend();
    const ev = conPreguntas(h, [
      {
        id: "pr_unica",
        tipo: "opcion_unica",
        enunciado: texto("¿Cuál es la respuesta?"),
        modoPuntaje: "exacto",
        puntos: 2,
        opciones: [opcion("op_a", "A", { correcta: true }), opcion("op_b", "B")],
      },
    ]);
    const inicio = h.publico("startAttempt", {
      codigo: ev.codigo,
      participante: { nombre: "Ana", documento: "ANCLA-1" },
    });
    h.publico("submitAttempt", {
      intentoId: inicio.datos.intentoId,
      token: inicio.datos.token,
      respuestas: [{ preguntaId: "pr_unica", opciones: ["op_a"] }],
    });

    // El autor invierte la clave y vuelve a publicar.
    h.admin("saveEvaluation", {
      id: ev.id,
      evaluacion: { titulo: "Calificación", aplicacion: { duracionMinutos: 30, puntajeAprobacion: 60 } },
      secciones: [
        {
          id: ev.seccionId,
          titulo: "Sección",
          preguntas: [
            {
              id: "pr_unica",
              tipo: "opcion_unica",
              enunciado: texto("¿Cuál es la respuesta?"),
              modoPuntaje: "exacto",
              puntos: 2,
              opciones: [opcion("op_a", "A"), opcion("op_b", "B", { correcta: true })],
            },
          ],
        },
      ],
    });
    h.admin("publishEvaluation", { id: ev.id });

    const detalle = h.admin("getAttempt", { intentoId: inicio.datos.intentoId });
    expect(detalle.datos.intento.nota).toBe(100);
    // Y el enunciado y la clave que ve el revisor son los que el candidato vio.
    expect(detalle.datos.respuestas[0].claveTexto).toBe("A");
  });
});
