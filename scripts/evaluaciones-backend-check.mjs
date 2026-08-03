#!/usr/bin/env node
/**
 * Comprobación rápida del backend de Evaluaciones, fuera de Vitest.
 *
 * Recorre el camino completo (instalar → crear → guardar → publicar → responder →
 * calificar → revisar) contra el arnés de Node y además ejecuta la suite interna
 * del propio backend. Sirve para verificar en un segundo que los archivos `.gs`
 * están coherentes antes de copiarlos a Apps Script.
 *
 *   npm run backend:check
 */

import { loadBackend, listUndeclaredGsFiles, sampleDocument } from "./evaluaciones-backend.mjs";

let fallos = 0;

function comprobar(nombre, condicion, detalle = "") {
  if (condicion) {
    console.log(`  ✅ ${nombre}`);
    return;
  }
  fallos += 1;
  console.log(`  ❌ ${nombre}${detalle ? `\n     ${detalle}` : ""}`);
}

console.log("\nBackend de Evaluaciones · comprobación\n");

const sinDeclarar = listUndeclaredGsFiles();
comprobar("todos los .gs están declarados en el arnés", sinDeclarar.length === 0, sinDeclarar.join(", "));

const h = loadBackend();

const instalacion = h.admin("install");
comprobar("instalación del esquema", instalacion.ok, instalacion.ok ? "" : instalacion.error.mensaje);

const ping = h.admin("ping");
comprobar("ping responde e informa la instalación", ping.ok && ping.datos.instalado === true);
console.log(`     backend ${ping.datos?.version} · esquema ${ping.datos?.esquema} · ${ping.datos?.tiposSoportados} tipos`);

const creada = h.admin("createEvaluation", { titulo: "Comprobación automática" });
comprobar("crear evaluación", creada.ok, creada.ok ? "" : creada.error.mensaje);

if (creada.ok) {
  const id = creada.datos.evaluacion.id;
  const codigo = creada.datos.evaluacion.codigo;
  const documento = sampleDocument(id, creada.datos.secciones[0].id);
  const guardada = h.admin("saveEvaluation", documento);
  comprobar("guardar el documento completo", guardada.ok, guardada.ok ? "" : guardada.error.mensaje);

  const repetida = h.admin("saveEvaluation", { ...documento, revisionBase: 1 });
  comprobar("guardar con revisión desfasada desde el mismo cliente NO da conflicto", repetida.ok);

  const ajena = h.admin("saveEvaluation", { ...documento, revisionBase: 1 }, { clientId: "otro-navegador" });
  comprobar("otro cliente con revisión vieja SÍ recibe conflicto", !ajena.ok && ajena.error.codigo === "CONFLICT");

  const publicada = h.admin("publishEvaluation", { id });
  comprobar("publicar", publicada.ok, publicada.ok ? "" : JSON.stringify(publicada.error.detalle));
  if (publicada.ok) console.log(`     versión ${publicada.datos.version.etiqueta} · ${publicada.datos.version.bloques} bloque(s)`);

  const inicio = h.publico("startAttempt", { codigo, participante: { nombre: "Ana", documento: "1234567" } });
  comprobar("iniciar intento", inicio.ok, inicio.ok ? "" : inicio.error.mensaje);

  if (inicio.ok) {
    const json = JSON.stringify(inicio.datos.prueba);
    const prohibidas = ["correcta", "claveEmparejamiento", "respuestaEsperada", "puntajeAprobacion", "notasInternas"];
    const filtradas = prohibidas.filter((palabra) => json.includes(palabra));
    comprobar("el payload público no filtra la clave de respuestas", filtradas.length === 0, filtradas.join(", "));
    comprobar("el temporizador viene del servidor", inicio.datos.segundosRestantes > 0);

    const envio = h.publico("submitAttempt", {
      intentoId: inicio.datos.intentoId,
      token: inicio.datos.token,
      respuestas: [
        { preguntaId: "pr_unica", opciones: ["op_u1"], puntosObtenidos: 999 },
        { preguntaId: "pr_multiple", opciones: ["op_m1", "op_m2"] },
        { preguntaId: "pr_numero", valor: 1250.5 },
        { preguntaId: "pr_abierta", valor: "Una justificación." },
      ],
      eventos: [{ tipo: "pegar", secuencia: 1, detalle: { caracteres: 800 } }],
    });
    comprobar("enviar intento", envio.ok, envio.ok ? "" : envio.error.mensaje);

    const detalle = h.admin("getAttempt", { intentoId: inicio.datos.intentoId });
    comprobar("leer el intento con su detalle", detalle.ok);
    if (detalle.ok) {
      const cerrada = detalle.datos.respuestas.find((r) => r.preguntaId === "pr_unica");
      comprobar("el puntaje inventado por el cliente se descarta", cerrada?.puntosObtenidos === 2);
      comprobar("la pregunta abierta queda pendiente", detalle.datos.intento.pendientesRevision === 1);
      comprobar("el pegado suma riesgo de integridad", detalle.datos.intento.riesgoIntegridad > 0);
    }

    const calificada = h.admin("gradeAnswer", { intentoId: inicio.datos.intentoId, preguntaId: "pr_abierta", puntos: 3 });
    comprobar("calificación manual recompone la nota", calificada.ok && calificada.datos.nota === 100);
  }
}

const diagnostico = h.admin("diagnose", { profundo: true });
comprobar("diagnóstico profundo", diagnostico.ok);
if (diagnostico.ok) {
  const sinRemedio = diagnostico.datos.hallazgos.filter((x) => !x.remedio);
  comprobar("todo hallazgo trae su remedio", sinRemedio.length === 0);
  console.log(`     estado ${diagnostico.datos.estado} · ${diagnostico.datos.hallazgos.length} hallazgo(s)`);
}

const suite = h.call("evRunTests_");
comprobar(`suite interna del backend (${suite.pasadas}/${suite.total})`, suite.fallidas === 0);
for (const prueba of suite.resultados.filter((r) => !r.ok)) {
  console.log(`     ❌ ${prueba.nombre}: ${prueba.motivo}`);
}

console.log(fallos === 0 ? "\n✅ Todo en orden.\n" : `\n❌ ${fallos} comprobación(es) fallaron.\n`);
process.exit(fallos === 0 ? 0 : 1);
