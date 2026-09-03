/**
 * Comprobación del enlace público, desde el navegador del reclutador.
 *
 * ── Por qué esto merece un archivo ──────────────────────────────────────────
 * El fallo que motivó este cambio era invisible desde el ATS: publicar
 * funcionaba, el enlace se copiaba, y quien lo abría al otro lado recibía
 * «No existe ninguna evaluación con ese código». Nadie se enteraba hasta que un
 * postulante lo decía, y para entonces ya se había enviado a diez personas.
 *
 * Esta comprobación reproduce EXACTAMENTE lo que hará el postulante:
 *
 *   · resuelve el despliegue leyéndolo del propio enlace, no de la configuración
 *     de este navegador —que es lo que el postulante no tiene—;
 *   · llama a `openAssessment` **sin llave de administración**, como una visita
 *     anónima;
 *   · comprueba que el código responda y que la evaluación esté disponible.
 *
 * Así, «el enlace funciona» deja de ser una suposición y pasa a ser un hecho que
 * se ve en pantalla en el momento de publicar.
 */

import { leer } from "./transport";
import { despliegueEnEnlace, diagnosticoEnlace, urlDeDespliegue, type DiagnosticoEnlace } from "./connection";
import type { PortadaPublica } from "../domain/model";

export interface ComprobacionEnlace extends DiagnosticoEnlace {
  /** ¿El enlace abre la evaluación para alguien de fuera? */
  ok: boolean;
  /** Estado legible para la interfaz. */
  estado: "correcto" | "no_portatil" | "no_disponible" | "error";
  mensaje: string;
  /** Título que verá el postulante, cuando la comprobación salió bien. */
  titulo: string;
}

export async function comprobarEnlacePublico(codigo: string): Promise<ComprobacionEnlace> {
  const diagnostico = diagnosticoEnlace(codigo);
  const base = { ...diagnostico, titulo: "" };

  if (!diagnostico.portatil) {
    return {
      ...base,
      ok: false,
      estado: "no_portatil",
      mensaje: diagnostico.motivo,
    };
  }

  const referencia = despliegueEnEnlace(diagnostico.enlace);
  const url = referencia ? urlDeDespliegue(referencia) : "";
  if (!url) {
    return {
      ...base,
      ok: false,
      estado: "no_portatil",
      mensaje: "El enlace no lleva dentro una referencia de despliegue válida.",
    };
  }

  const res = await leer<PortadaPublica>("openAssessment", { codigo }, { conLlave: false, destino: { url } });
  if (!res.ok) {
    return {
      ...base,
      ok: false,
      estado: "error",
      mensaje: res.error.message,
      remedio: res.error.pista ?? diagnostico.remedio,
    };
  }
  if (!res.value.disponible) {
    return {
      ...base,
      ok: false,
      estado: "no_disponible",
      mensaje: res.value.mensaje || "La evaluación existe pero todavía no admite intentos.",
      titulo: res.value.titulo ?? "",
      remedio:
        "Revisa el estado (debe estar publicada, no pausada ni cerrada) y la ventana de fechas de aplicación.",
    };
  }
  return {
    ...base,
    ok: true,
    estado: "correcto",
    mensaje: `Responde correctamente: «${res.value.titulo}», ${res.value.totalPreguntas} pregunta(s).`,
    titulo: res.value.titulo ?? "",
  };
}
