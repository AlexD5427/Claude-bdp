import { describe, it, expect } from "vitest";
import { loadInstalledBackend, sampleDocument } from "../../../../scripts/evaluaciones-backend.mjs";
import type { EvHarness } from "../../../../scripts/evaluaciones-backend.mjs";

/**
 * Intentos: el reloj del servidor, la reanudación, el autoenvío y la seguridad
 * del token.
 *
 * El requisito era claro: «un temporizador a la hora del servidor», «que se envíe
 * automáticamente si se supera» y que nada de eso se pueda burlar desde el
 * navegador. Este archivo lo fija.
 */

function preparar(h: EvHarness, ajustes: (doc: Record<string, any>) => void = () => {}) {
  const creada = h.admin("createEvaluation", { titulo: "Analista de riesgo crediticio" });
  const id = creada.datos.evaluacion.id as string;
  const seccionId = creada.datos.secciones[0].id as string;
  const doc = sampleDocument(id, seccionId);
  ajustes(doc);
  expect(h.admin("saveEvaluation", doc).ok).toBe(true);
  expect(h.admin("publishEvaluation", { id }).ok).toBe(true);
  return { id, seccionId, codigo: creada.datos.evaluacion.codigo as string };
}

function iniciar(h: EvHarness, codigo: string, documento = "1234567", nombre = "Ana Pérez") {
  const res = h.publico("startAttempt", { codigo, participante: { nombre, documento } });
  expect(res.ok, JSON.stringify(res.error)).toBe(true);
  return { intentoId: res.datos.intentoId as string, token: res.datos.token as string, datos: res.datos };
}

describe("backend · intentos", () => {
  it("iniciar devuelve token, límite calculado por el servidor y la prueba completa", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const { datos } = iniciar(h, ev.codigo);
    expect(datos.token).toMatch(/^v1\./);
    expect(datos.segundosRestantes).toBe(20 * 60);
    expect(datos.limiteEn).toBeTruthy();
    expect(datos.prueba.secciones[0].preguntas).toHaveLength(4);
    expect(datos.respuestasPrevias).toEqual([]);
  });

  it("faltan datos obligatorios del participante → hallazgos por campo", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const res = h.publico("startAttempt", { codigo: ev.codigo, participante: { nombre: "Solo nombre" } });
    expect(res.ok).toBe(false);
    expect(res.error.codigo).toBe("VALIDATION_ERROR");
    const rutas = res.error.detalle.issues.map((i: { path: string }) => i.path);
    expect(rutas).toContain("participante.documento");
  });

  it("un correo mal formado se rechaza señalando el campo", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h, (doc) => {
      doc.evaluacion.participante = {
        campos: [
          { clave: "nombre", obligatorio: true, activo: true },
          { clave: "documento", obligatorio: true, activo: true },
          { clave: "correo", obligatorio: true, activo: true },
        ],
      };
    });
    const res = h.publico("startAttempt", {
      codigo: ev.codigo,
      participante: { nombre: "Ana", documento: "1", correo: "ana@" },
    });
    expect(res.ok).toBe(false);
    expect(res.error.detalle.issues[0].path).toBe("participante.correo");
  });

  it("el consentimiento obligatorio bloquea el inicio hasta que se acepta", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h, (doc) => {
      doc.evaluacion.participante = {
        requiereConsentimiento: true,
        textoConsentimiento: "Autorizo el tratamiento de mis datos.",
      };
    });
    const sin = h.publico("startAttempt", { codigo: ev.codigo, participante: { nombre: "A", documento: "1" } });
    expect(sin.ok).toBe(false);
    expect(sin.error.detalle.campo).toBe("consentimiento");

    const con = h.publico("startAttempt", {
      codigo: ev.codigo,
      participante: { nombre: "A", documento: "1" },
      consentimiento: true,
    });
    expect(con.ok).toBe(true);
  });

  it("volver a abrir el enlace retoma el intento con su tiempo real y sus respuestas", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const primero = iniciar(h, ev.codigo);
    h.publico("saveProgress", {
      intentoId: primero.intentoId,
      token: primero.token,
      respuestas: [{ preguntaId: "pr_unica", opciones: ["op_u1"] }],
    });

    h.advanceClock(5 * 60 * 1000);
    const segundo = h.publico("startAttempt", {
      codigo: ev.codigo,
      participante: { nombre: "Ana Pérez", documento: "1234567" },
    });
    expect(segundo.datos.retomado).toBe(true);
    expect(segundo.datos.intentoId).toBe(primero.intentoId);
    // El reloj NO se reinicia: recargar la página no regala tiempo.
    expect(segundo.datos.segundosRestantes).toBeLessThanOrEqual(15 * 60);
    expect(segundo.datos.segundosRestantes).toBeGreaterThan(14 * 60);
    expect(segundo.datos.respuestasPrevias).toHaveLength(1);
    expect(segundo.datos.respuestasPrevias[0].opciones).toEqual(["op_u1"]);
  });

  it("el latido sincroniza el reloj y avisa de la expiración sin cerrar nada", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h, (doc) => {
      doc.evaluacion.aplicacion.duracionMinutos = 1;
    });
    const intento = iniciar(h, ev.codigo);

    const antes = h.publico("heartbeat", { intentoId: intento.intentoId, token: intento.token });
    expect(antes.datos.expirado).toBe(false);
    expect(antes.datos.segundosRestantes).toBe(60);

    h.advanceClock(61 * 1000);
    const despues = h.publico("heartbeat", { intentoId: intento.intentoId, token: intento.token });
    expect(despues.datos.expirado).toBe(true);
    expect(despues.datos.segundosRestantes).toBe(0);
    // Sigue «en curso»: cerrar es competencia del envío, no del latido.
    expect(despues.datos.estado).toBe("en_curso");
  });

  it("enviar pasado el límite se acepta pero queda marcado como expirado y automático", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h, (doc) => {
      doc.evaluacion.aplicacion.duracionMinutos = 1;
    });
    const intento = iniciar(h, ev.codigo);
    h.advanceClock(90 * 1000);

    const res = h.publico("submitAttempt", {
      intentoId: intento.intentoId,
      token: intento.token,
      respuestas: [{ preguntaId: "pr_unica", opciones: ["op_u1"] }],
    });
    expect(res.ok).toBe(true);
    expect(res.datos.estado).toBe("expirado");
    expect(res.datos.envioAutomatico).toBe(true);
    // El tiempo usado se acota al límite: no se contabiliza el tiempo de más.
    expect(res.datos.segundosUsados).toBe(60);
  });

  it("la ventana de aplicación recorta el temporizador si cierra antes", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h, (doc) => {
      doc.evaluacion.aplicacion.duracionMinutos = 60;
      doc.evaluacion.aplicacion.ventanaFin = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    });
    const intento = iniciar(h, ev.codigo);
    expect(intento.datos.segundosRestantes).toBeLessThanOrEqual(5 * 60);
    expect(intento.datos.segundosRestantes).toBeGreaterThan(4 * 60);
  });

  it("sin duración no hay temporizador y el latido no expira nunca", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h, (doc) => {
      doc.evaluacion.aplicacion.duracionMinutos = null;
    });
    const intento = iniciar(h, ev.codigo);
    expect(intento.datos.segundosRestantes).toBeNull();
    h.advanceClock(10 * 3600 * 1000);
    const hb = h.publico("heartbeat", { intentoId: intento.intentoId, token: intento.token });
    expect(hb.datos.expirado).toBe(false);
  });

  it("un token inventado, vacío o de otro intento se rechaza", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h, (doc) => {
      doc.evaluacion.aplicacion.intentosMaximos = 3;
    });
    const uno = iniciar(h, ev.codigo, "A1", "Ana");
    const dos = iniciar(h, ev.codigo, "B1", "Bruno");

    for (const token of ["", "v1.falso", dos.token]) {
      const res = h.publico("saveProgress", { intentoId: uno.intentoId, token, respuestas: [] });
      expect(res.ok, `el token «${token}» debía rechazarse`).toBe(false);
      expect(res.error.codigo).toBe("FORBIDDEN");
    }
    // Y el propio sí funciona.
    expect(h.publico("saveProgress", { intentoId: uno.intentoId, token: uno.token, respuestas: [] }).ok).toBe(true);
  });

  it("el límite de intentos por documento se respeta y explica cuántos quedaban", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const primero = iniciar(h, ev.codigo);
    h.publico("submitAttempt", { intentoId: primero.intentoId, token: primero.token, respuestas: [] });

    const segundo = h.publico("startAttempt", {
      codigo: ev.codigo,
      participante: { nombre: "Ana Pérez", documento: "1234567" },
    });
    expect(segundo.ok).toBe(false);
    expect(segundo.error.codigo).toBe("FORBIDDEN");
    expect(segundo.error.detalle.intentosMaximos).toBe(1);
    expect(segundo.error.detalle.intentosRealizados).toBe(1);
  });

  it("con varios intentos permitidos el segundo se crea de cero", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h, (doc) => {
      doc.evaluacion.aplicacion.intentosMaximos = 2;
    });
    const primero = iniciar(h, ev.codigo);
    h.publico("submitAttempt", { intentoId: primero.intentoId, token: primero.token, respuestas: [] });
    const segundo = iniciar(h, ev.codigo);
    expect(segundo.intentoId).not.toBe(primero.intentoId);
    expect(segundo.datos.retomado).toBe(false);
  });

  it("guardar progreso es idempotente por pregunta: no duplica filas", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const intento = iniciar(h, ev.codigo);
    for (let i = 0; i < 4; i++) {
      const res = h.publico("saveProgress", {
        intentoId: intento.intentoId,
        token: intento.token,
        respuestas: [
          { preguntaId: "pr_unica", opciones: ["op_u1"] },
          { preguntaId: "pr_numero", valor: 1250.5 },
        ],
      });
      expect(res.ok).toBe(true);
      expect(res.datos.respuestasGuardadas).toBe(2);
    }
    expect(h.rowsOf("Respuestas")).toHaveLength(2);
  });

  it("guardar progreso NO califica: la nota solo existe tras el envío", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const intento = iniciar(h, ev.codigo);
    h.publico("saveProgress", {
      intentoId: intento.intentoId,
      token: intento.token,
      respuestas: [{ preguntaId: "pr_unica", opciones: ["op_u1"] }],
    });
    const filas = h.rowsOf("Respuestas");
    expect(String(filas[0].correcta)).toBe("");
    expect(String(filas[0].puntos_obtenidos)).toBe("");

    const cola = h.admin("listAttempts", { evaluacionId: ev.id });
    expect(cola.datos.intentos[0].nota).toBeNull();
    expect(cola.datos.intentos[0].estado).toBe("en_curso");
  });

  it("las respuestas guardadas se combinan con las del envío", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const intento = iniciar(h, ev.codigo);
    h.publico("saveProgress", {
      intentoId: intento.intentoId,
      token: intento.token,
      respuestas: [{ preguntaId: "pr_unica", opciones: ["op_u1"] }],
    });
    const res = h.publico("submitAttempt", {
      intentoId: intento.intentoId,
      token: intento.token,
      respuestas: [{ preguntaId: "pr_numero", valor: 1250.5 }],
    });
    expect(res.ok).toBe(true);
    const detalle = h.admin("getAttempt", { intentoId: intento.intentoId });
    const respondidas = detalle.datos.respuestas.filter((r: { respondida: boolean }) => r.respondida);
    expect(respondidas).toHaveLength(2);
  });

  it("no se puede guardar ni volver a enviar un intento ya enviado", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const intento = iniciar(h, ev.codigo);
    h.publico("submitAttempt", { intentoId: intento.intentoId, token: intento.token, respuestas: [] });

    const guardar = h.publico("saveProgress", { intentoId: intento.intentoId, token: intento.token, respuestas: [] });
    expect(guardar.ok).toBe(false);
    expect(guardar.error.codigo).toBe("CONFLICT");

    // Reenviar sí responde bien (una desconexión no debe asustar al candidato)
    // pero no recalcula: devuelve el resultado original marcado como repetido.
    const reenviar = h.publico("submitAttempt", { intentoId: intento.intentoId, token: intento.token, respuestas: [] });
    expect(reenviar.ok).toBe(true);
    expect(reenviar.datos.repetido).toBe(true);
  });

  it("el candidato ve solo lo que la visibilidad configurada permite", () => {
    const h = loadInstalledBackend();

    const soloEnvio = preparar(h, (doc) => {
      doc.evaluacion.participante = { visibilidadResultado: "solo_envio" };
      doc.secciones[0].preguntas = doc.secciones[0].preguntas.slice(0, 1);
    });
    const a = iniciar(h, soloEnvio.codigo, "S1");
    const rA = h.publico("submitAttempt", {
      intentoId: a.intentoId,
      token: a.token,
      respuestas: [{ preguntaId: "pr_unica", opciones: ["op_u1"] }],
    });
    expect(rA.datos.nota).toBeUndefined();
    expect(rA.datos.estado).toBe("enviado");

    const conDetalle = preparar(h, (doc) => {
      doc.evaluacion.participante = { visibilidadResultado: "nota_y_detalle" };
      doc.secciones[0].preguntas = doc.secciones[0].preguntas.slice(0, 1);
    });
    const b = iniciar(h, conDetalle.codigo, "S2");
    const rB = h.publico("submitAttempt", {
      intentoId: b.intentoId,
      token: b.token,
      respuestas: [{ preguntaId: "pr_unica", opciones: ["op_u1"] }],
    });
    expect(rB.datos.nota).toBe(100);
    expect(rB.datos.aprobado).toBe(true);
    expect(rB.datos.correctas).toBe(1);
    // Ni con el detalle máximo se filtra el desglose por pregunta.
    expect(rB.datos.respuestas).toBeUndefined();
  });

  it("una respuesta que apunta a otra evaluación se rechaza al enviar", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const intento = iniciar(h, ev.codigo);
    const res = h.publico("submitAttempt", {
      intentoId: intento.intentoId,
      token: intento.token,
      respuestas: [{ preguntaId: "pr_de_otra_evaluacion", valor: "x" }],
    });
    expect(res.ok).toBe(false);
    expect(res.error.codigo).toBe("VALIDATION_ERROR");
    expect(res.error.detalle.issues[0].code).toBe("PREGUNTA_AJENA");
  });

  it("una opción que no pertenece a su pregunta se rechaza al enviar", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const intento = iniciar(h, ev.codigo);
    const res = h.publico("submitAttempt", {
      intentoId: intento.intentoId,
      token: intento.token,
      respuestas: [{ preguntaId: "pr_unica", opciones: ["op_m1"] }],
    });
    expect(res.ok).toBe(false);
    expect(res.error.detalle.issues[0].code).toBe("OPCION_AJENA");
  });

  it("el límite de frecuencia protege el enlace de una avalancha", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h, (doc) => {
      doc.evaluacion.aplicacion.intentosMaximos = 20;
    });
    let limitado = false;
    for (let i = 0; i < 20; i++) {
      const res = h.publico("startAttempt", {
        codigo: ev.codigo,
        participante: { nombre: `P${i}`, documento: `DOC${i}` },
      });
      if (!res.ok && res.error.codigo === "RATE_LIMITED") {
        limitado = true;
        expect(res.error.detalle.limite).toBeGreaterThan(0);
        break;
      }
    }
    expect(limitado).toBe(true);
  });

  it("sin caché disponible el límite de frecuencia no bloquea la prueba", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h, (doc) => {
      doc.evaluacion.aplicacion.intentosMaximos = 20;
    });
    h.state.cacheAvailable = false;
    for (let i = 0; i < 15; i++) {
      const res = h.publico("startAttempt", {
        codigo: ev.codigo,
        participante: { nombre: `P${i}`, documento: `SC${i}` },
      });
      expect(res.ok, `intento ${i}: ${JSON.stringify(res.error)}`).toBe(true);
    }
  });

  it("el barrido cierra los intentos vencidos calificando lo que había", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h, (doc) => {
      doc.evaluacion.aplicacion.duracionMinutos = 1;
      doc.evaluacion.aplicacion.intentosMaximos = 5;
    });
    const intento = iniciar(h, ev.codigo);
    h.publico("saveProgress", {
      intentoId: intento.intentoId,
      token: intento.token,
      respuestas: [{ preguntaId: "pr_unica", opciones: ["op_u1"] }],
    });
    h.advanceClock(10 * 60 * 1000);

    const resultado = h.call("evCloseExpiredAttempts_", "prueba");
    expect(resultado.cerrados).toContain(intento.intentoId);
    expect(resultado.fallidos).toEqual([]);

    const detalle = h.admin("getAttempt", { intentoId: intento.intentoId });
    expect(detalle.datos.intento.estado).toBe("expirado");
    expect(detalle.datos.intento.envioAutomatico).toBe(true);
    // Lo que alcanzó a responder se conserva y se califica.
    const unica = detalle.datos.respuestas.find((r: { preguntaId: string }) => r.preguntaId === "pr_unica");
    expect(unica.puntosObtenidos).toBe(2);
  });
});
