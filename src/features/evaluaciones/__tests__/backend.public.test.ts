import { describe, it, expect } from "vitest";
import { loadInstalledBackend, sampleDocument } from "../../../../scripts/evaluaciones-backend.mjs";
import type { EvHarness } from "../../../../scripts/evaluaciones-backend.mjs";

/**
 * Superficie pública y seguridad del candidato.
 *
 * La prueba más importante del archivo es la de fugas: serializa el payload que
 * recibe el navegador del candidato y comprueba que NINGUNA palabra relacionada
 * con la clave de respuestas aparece en él. Es la única forma de que un campo
 * nuevo en el esquema no se filtre por descuido.
 */

/** Palabras que jamás pueden viajar al candidato. */
const PROHIBIDAS = [
  "correcta",
  "claveEmparejamiento",
  "clave_emparejamiento",
  "respuestaEsperada",
  "puntajeAprobacion",
  "criterioAprobacion",
  "notasInternas",
  "notas_internas",
  "modoPuntaje",
  "retroalimentacion",
  "preguntasCalificables",
  "puntosTotales",
  "creadoPor",
  "actualizadoPor",
  "revision",
  "Atrasos-correcto",
];

function publicada(h: EvHarness, ajustes: (doc: Record<string, any>) => void = () => {}) {
  const creada = h.admin("createEvaluation", { titulo: "Analista de riesgo crediticio" });
  const id = creada.datos.evaluacion.id as string;
  const seccionId = creada.datos.secciones[0].id as string;
  const doc = sampleDocument(id, seccionId);
  ajustes(doc);
  const guardada = h.admin("saveEvaluation", doc);
  expect(guardada.ok, JSON.stringify(guardada.error)).toBe(true);
  const pub = h.admin("publishEvaluation", { id });
  expect(pub.ok, JSON.stringify(pub.error)).toBe(true);
  return { id, seccionId, codigo: creada.datos.evaluacion.codigo as string };
}

describe("backend · superficie pública", () => {
  it("el payload del candidato no contiene ninguna clave de respuesta", () => {
    const h = loadInstalledBackend();
    const ev = publicada(h, (doc) => {
      // Se añaden todos los tipos con clave para que la prueba cubra el peor caso.
      doc.secciones[0].preguntas.push(
        {
          id: "pr_empareja",
          tipo: "emparejar",
          enunciado: { v: 1, b: [{ t: "p", s: [{ x: "Relaciona." }] }] },
          modoPuntaje: "parcial",
          puntos: 2,
          opciones: [
            { id: "op_e1", texto: { v: 1, b: [{ t: "p", s: [{ x: "Mora" }] }] }, valor: "a", claveEmparejamiento: "Atrasos-correcto" },
            { id: "op_e2", texto: { v: 1, b: [{ t: "p", s: [{ x: "ROE" }] }] }, valor: "b", claveEmparejamiento: "Rentabilidad" },
          ],
        },
        {
          id: "pr_huecos",
          tipo: "rellenar_huecos",
          enunciado: { v: 1, b: [{ t: "p", s: [{ x: "La razón corriente es ___." }] }] },
          modoPuntaje: "parcial",
          puntos: 1,
          respuestaEsperada: { huecos: [{ clave: "1", respuestas: ["activo sobre pasivo"] }] },
          opciones: [],
        },
      );
    });

    const inicio = h.publico("startAttempt", {
      codigo: ev.codigo,
      participante: { nombre: "Ana Pérez", documento: "1234567" },
    });
    expect(inicio.ok, JSON.stringify(inicio.error)).toBe(true);

    const json = JSON.stringify(inicio.datos.prueba);
    for (const palabra of PROHIBIDAS) {
      expect(json, `el payload público filtra «${palabra}»`).not.toContain(palabra);
    }
    // Y sí lleva lo que el runner necesita.
    expect(inicio.datos.prueba.secciones[0].preguntas[0].opciones[0].texto).toBeTruthy();
    expect(inicio.datos.prueba.aplicacion.duracionMinutos).toBe(20);
  });

  it("los puntos por pregunta SÍ se muestran: son el peso, no la clave", () => {
    const h = loadInstalledBackend();
    const ev = publicada(h);
    const inicio = h.publico("startAttempt", {
      codigo: ev.codigo,
      participante: { nombre: "Ana", documento: "1" },
    });
    const primera = inicio.datos.prueba.secciones[0].preguntas[0];
    expect(primera.puntos).toBe(2);
  });

  it("abrir el enlace no revela las preguntas", () => {
    const h = loadInstalledBackend();
    const ev = publicada(h);
    const abierta = h.publico("openAssessment", { codigo: ev.codigo });
    expect(abierta.ok).toBe(true);
    expect(abierta.datos.disponible).toBe(true);
    expect(abierta.datos.totalPreguntas).toBe(4);
    // Sin secciones: para leer la prueba hay que iniciar el intento, y eso deja
    // rastro. Es lo que impide «mirar» una evaluación sin hacerla.
    expect(abierta.datos.secciones).toBeUndefined();
  });

  it("cada estado no publicable produce su propio motivo", () => {
    const h = loadInstalledBackend();
    const ev = publicada(h);

    h.admin("transitionEvaluation", { id: ev.id, transicion: "pausar" });
    expect(h.publico("openAssessment", { codigo: ev.codigo }).datos.motivo).toBe("pausada");

    h.admin("transitionEvaluation", { id: ev.id, transicion: "reanudar" });
    h.admin("transitionEvaluation", { id: ev.id, transicion: "cerrar" });
    expect(h.publico("openAssessment", { codigo: ev.codigo }).datos.motivo).toBe("cerrada");

    h.admin("transitionEvaluation", { id: ev.id, transicion: "archivar" });
    expect(h.publico("openAssessment", { codigo: ev.codigo }).datos.motivo).toBe("no_disponible");

    const borrador = h.admin("createEvaluation", { titulo: "Sin publicar" });
    const abierta = h.publico("openAssessment", { codigo: borrador.datos.evaluacion.codigo });
    expect(abierta.datos.motivo).toBe("no_publicada");
    expect(abierta.datos.mensaje).toBeTruthy();
  });

  it("la ventana de aplicación cierra el acceso antes y después", () => {
    const h = loadInstalledBackend();
    const futuro = new Date(Date.now() + 86400000).toISOString();
    const ev = publicada(h, (doc) => {
      doc.evaluacion.aplicacion.ventanaInicio = futuro;
    });
    expect(h.publico("openAssessment", { codigo: ev.codigo }).datos.motivo).toBe("aun_no_abre");

    const pasado = new Date(Date.now() - 86400000).toISOString();
    h.admin("saveEvaluation", {
      ...sampleDocument(ev.id, ev.seccionId),
      evaluacion: {
        ...sampleDocument(ev.id, ev.seccionId).evaluacion,
        aplicacion: {
          duracionMinutos: 20,
          puntajeAprobacion: 70,
          ventanaInicio: new Date(Date.now() - 172800000).toISOString(),
          ventanaFin: pasado,
        },
      },
    });
    h.admin("publishEvaluation", { id: ev.id });
    expect(h.publico("openAssessment", { codigo: ev.codigo }).datos.motivo).toBe("ventana_cerrada");
  });

  it("un código inexistente responde NOT_FOUND sin revelar nada", () => {
    const h = loadInstalledBackend();
    const res = h.publico("openAssessment", { codigo: "EV-NADA-9999" });
    expect(res.ok).toBe(false);
    expect(res.error.codigo).toBe("NOT_FOUND");
    expect(res.error.detalle.motivo).toBe("codigo_inexistente");
  });

  it("el código se normaliza: minúsculas y espacios no impiden abrir el enlace", () => {
    const h = loadInstalledBackend();
    const ev = publicada(h);
    const res = h.publico("openAssessment", { codigo: `  ${ev.codigo.toLowerCase()} ` });
    expect(res.ok).toBe(true);
    expect(res.datos.disponible).toBe(true);
  });

  it("la mezcla es estable por intento: recargar no cambia el orden", () => {
    const h = loadInstalledBackend();
    const ev = publicada(h, (doc) => {
      doc.evaluacion.aplicacion.mezclarOpciones = true;
      doc.evaluacion.aplicacion.mezclarPreguntas = true;
    });
    const primera = h.publico("startAttempt", {
      codigo: ev.codigo,
      participante: { nombre: "Ana", documento: "1" },
    });
    const orden = primera.datos.prueba.secciones[0].preguntas.map((p: { id: string }) => p.id);

    // Reabrir el mismo intento (retomar) devuelve exactamente el mismo orden.
    const segunda = h.publico("startAttempt", {
      codigo: ev.codigo,
      participante: { nombre: "Ana", documento: "1" },
    });
    expect(segunda.datos.retomado).toBe(true);
    expect(segunda.datos.prueba.secciones[0].preguntas.map((p: { id: string }) => p.id)).toEqual(orden);
  });

  it("dos candidatos distintos reciben órdenes distintos", () => {
    const h = loadInstalledBackend();
    const ev = publicada(h, (doc) => {
      doc.evaluacion.aplicacion.mezclarOpciones = true;
      doc.evaluacion.aplicacion.intentosMaximos = 5;
      // Se añaden opciones para que la probabilidad de coincidencia sea baja.
      doc.secciones[0].preguntas[1].opciones.push(
        { id: "op_m4", texto: { v: 1, b: [{ t: "p", s: [{ x: "Capital de trabajo" }] }] }, valor: "d" },
        { id: "op_m5", texto: { v: 1, b: [{ t: "p", s: [{ x: "EBITDA" }] }] }, valor: "e" },
      );
    });
    const uno = h.publico("startAttempt", { codigo: ev.codigo, participante: { nombre: "A", documento: "A1" } });
    const dos = h.publico("startAttempt", { codigo: ev.codigo, participante: { nombre: "B", documento: "B1" } });
    const ordenUno = uno.datos.prueba.secciones[0].preguntas[1].opciones.map((o: { id: string }) => o.id);
    const ordenDos = dos.datos.prueba.secciones[0].preguntas[1].opciones.map((o: { id: string }) => o.id);
    expect(ordenUno.slice().sort()).toEqual(ordenDos.slice().sort());
    expect(ordenUno.join()).not.toBe(ordenDos.join());
  });

  it("emparejar y clasificar se mezclan siempre, aunque el autor no lo pida", () => {
    const h = loadInstalledBackend();
    const ev = publicada(h, (doc) => {
      doc.secciones[0].preguntas = [
        {
          id: "pr_empareja",
          tipo: "emparejar",
          enunciado: { v: 1, b: [{ t: "p", s: [{ x: "Relaciona." }] }] },
          modoPuntaje: "parcial",
          puntos: 4,
          opciones: Array.from({ length: 8 }, (_, i) => ({
            id: `op_e${i}`,
            texto: { v: 1, b: [{ t: "p", s: [{ x: `Concepto ${i}` }] }] },
            valor: `v${i}`,
            claveEmparejamiento: `clave-${i}`,
          })),
        },
      ];
    });
    const inicio = h.publico("startAttempt", { codigo: ev.codigo, participante: { nombre: "A", documento: "A1" } });
    const orden = inicio.datos.prueba.secciones[0].preguntas[0].opciones.map((o: { id: string }) => o.id);
    const natural = Array.from({ length: 8 }, (_, i) => `op_e${i}`);
    expect(orden.slice().sort()).toEqual(natural.slice().sort());
    expect(orden.join()).not.toBe(natural.join());
  });

  it("«tomar N» sirve un subconjunto estable de un banco de preguntas", () => {
    const h = loadInstalledBackend();
    const ev = publicada(h, (doc) => {
      doc.secciones[0].tomarN = 2;
      doc.secciones[0].preguntas = Array.from({ length: 6 }, (_, i) => ({
        id: `pr_pool${i}`,
        tipo: "opcion_unica",
        enunciado: { v: 1, b: [{ t: "p", s: [{ x: `Pregunta ${i}` }] }] },
        modoPuntaje: "exacto",
        puntos: 1,
        opciones: [
          { id: `op_p${i}a`, texto: { v: 1, b: [{ t: "p", s: [{ x: "Sí" }] }] }, valor: "a", correcta: true },
          { id: `op_p${i}b`, texto: { v: 1, b: [{ t: "p", s: [{ x: "No" }] }] }, valor: "b" },
        ],
      }));
      doc.evaluacion.aplicacion.intentosMaximos = 5;
    });
    const inicio = h.publico("startAttempt", { codigo: ev.codigo, participante: { nombre: "A", documento: "A1" } });
    expect(inicio.datos.prueba.secciones[0].preguntas).toHaveLength(2);
    expect(inicio.datos.prueba.totalPreguntas).toBe(2);

    const retomado = h.publico("startAttempt", { codigo: ev.codigo, participante: { nombre: "A", documento: "A1" } });
    expect(retomado.datos.prueba.secciones[0].preguntas.map((p: { id: string }) => p.id))
      .toEqual(inicio.datos.prueba.secciones[0].preguntas.map((p: { id: string }) => p.id));
  });

  it("los enlaces peligrosos del contenido no llegan al candidato", () => {
    const h = loadInstalledBackend();
    const ev = publicada(h, (doc) => {
      doc.secciones[0].preguntas[0].enunciado = {
        v: 1,
        b: [
          {
            t: "p",
            s: [
              { x: "Consulta ", m: [] },
              { x: "esta norma", l: "javascript:alert(document.cookie)" },
              { x: " y ", m: [] },
              { x: "esta otra", l: "https://banco.example/norma" },
            ],
          },
        ],
      };
      doc.secciones[0].preguntas[0].configuracion = { imagenUrl: "data:text/html;base64,PHNjcmlwdD4=" };
    });
    const inicio = h.publico("startAttempt", { codigo: ev.codigo, participante: { nombre: "A", documento: "A1" } });
    const json = JSON.stringify(inicio.datos.prueba);
    expect(json).not.toContain("javascript:");
    expect(json).not.toContain("data:text/html");
    expect(json).toContain("https://banco.example/norma");
  });

  it("las acciones administrativas exigen llave y lo explican con precisión", () => {
    const h = loadInstalledBackend();
    const sinLlave = h.publico("listEvaluations");
    expect(sinLlave.ok).toBe(false);
    expect(sinLlave.error.codigo).toBe("FORBIDDEN");
    expect(sinLlave.error.detalle.motivo).toBe("llave_ausente");
    expect(sinLlave.error.pista).toMatch(/EV_ADMIN_KEY/);

    const llaveMala = h.admin("listEvaluations", {}, { llaveAdmin: "no-es-la-llave-pero-es-larga-igual" });
    expect(llaveMala.ok).toBe(false);
    expect(llaveMala.error.detalle.motivo).toBe("llave_incorrecta");
    // Nunca se revela la llave esperada ni cuánto se acercó la enviada.
    expect(JSON.stringify(llaveMala)).not.toContain(h.adminKey as string);
  });

  it("sin llave configurada el backend opera en modo abierto pero lo grita", () => {
    const h = loadInstalledBackend({ adminKey: null });
    const res = h.publico("listEvaluations");
    expect(res.ok).toBe(true);
    expect(res.avisos).toContain("ADMIN_SIN_LLAVE");
    expect(res.meta.modoAuth).toBe("abierto");

    const diag = h.publico("diagnose");
    const hallazgo = diag.datos.hallazgos.find((x: { codigo: string }) => x.codigo === "ADMIN_SIN_LLAVE");
    expect(hallazgo).toBeTruthy();
    expect(hallazgo.severidad).toBe("alto");
    expect(hallazgo.remedio).toMatch(/Propiedades del script/);
  });

  it("la llave siguiente permite rotar sin cortar el servicio", () => {
    const h = loadInstalledBackend({ properties: { EV_ADMIN_KEY_NEXT: "llave-nueva-larga-0123456789abcdef" } });
    const conVieja = h.admin("listEvaluations");
    expect(conVieja.ok).toBe(true);
    const conNueva = h.admin("listEvaluations", {}, { llaveAdmin: "llave-nueva-larga-0123456789abcdef" });
    expect(conNueva.ok).toBe(true);
    expect(conNueva.avisos).toContain("LLAVE_EN_ROTACION");
  });

  it("una acción inexistente responde UNSUPPORTED_ACTION con la lista de válidas", () => {
    const h = loadInstalledBackend();
    const res = h.admin("hacerMagia");
    expect(res.ok).toBe(false);
    expect(res.error.codigo).toBe("UNSUPPORTED_ACTION");
  });

  it("una petición sin acción explica qué enviar", () => {
    const h = loadInstalledBackend();
    const res = h.call("evHandle_", {});
    expect(res.ok).toBe(false);
    expect(res.error.pista).toMatch(/ping/);
  });
});
