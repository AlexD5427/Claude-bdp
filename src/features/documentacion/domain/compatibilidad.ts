/**
 * Compatibilidad entre este frontend y el backend que hay desplegado.
 *
 * ── El problema, contado como ocurre ────────────────────────────────────────
 * El módulo tiene dos mitades que se despliegan por separado y a mano distinta:
 * el frontend lo publica Vercel al fusionar, y el backend lo pega una persona en
 * el editor de Apps Script. Entre las dos cosas hay un paso que se olvida
 * siempre: **publicar una VERSIÓN NUEVA de la implementación**. Sin él, el
 * enlace `/exec` sigue sirviendo el código anterior aunque el editor muestre el
 * nuevo.
 *
 * El resultado es el peor de los posibles para quien usa el módulo: casi todo
 * funciona. El estado responde, la lista se pinta, el panel calcula. Y falla
 * justo lo que se acaba de añadir, con un error que dice «la acción X no existe
 * en este backend» en medio de una pantalla que no habla de acciones. De ahí
 * salen los «se conecta mal» y los «dejó de funcionar» que no se pueden
 * reproducir.
 *
 * ── Qué hace este módulo ────────────────────────────────────────────────────
 * Compara tres cosas que el backend declara —arquitectura, versión de esquema y
 * lista de acciones— contra lo que este frontend necesita, y devuelve un
 * diagnóstico con el nombre del problema y el paso que lo arregla. Nada más: es
 * una función pura sobre la respuesta de `documentacion.estado`.
 *
 * ── Por qué no bloquea ──────────────────────────────────────────────────────
 * Un backend por detrás sigue siendo utilizable para casi todo, y bloquear el
 * módulo por una incompatibilidad parcial dejaría al área sin poder trabajar por
 * algo que se arregla en dos minutos… cuando alguien sepa que hay que
 * arreglarlo. Se avisa, se explica y se sigue.
 */

import type { EstadoModulo } from "../api/acciones";

/**
 * Versión de esquema contra la que se construyó este frontend.
 *
 * Tiene que subir junto con `DOC2_SCHEMA_VERSION` del backend. La prueba
 * `dominio.test.ts` compara las dos: si alguien sube una y no la otra, falla ahí
 * y no en producción.
 */
export const ESQUEMA_ESPERADO = 6;

/** Versión de catálogo contra la que se construyó este frontend. */
export const CATALOGO_ESPERADO = 4;

/**
 * Acciones que este frontend necesita y que no existían en backends anteriores.
 *
 * Solo las NUEVAS: comprobar las ochenta no aporta nada y haría que cualquier
 * renombrado interno del backend se leyera como una incompatibilidad.
 */
export const ACCIONES_REQUERIDAS = [
  "documentacion.arranque",
  "documentacion.expedientes.detalle",
] as const;

export type SeveridadCompatibilidad = "ok" | "aviso" | "importante" | "critico";

export interface HallazgoCompatibilidad {
  codigo: string;
  severidad: SeveridadCompatibilidad;
  titulo: string;
  /** Qué está pasando, en una frase que se pueda leer por teléfono. */
  detalle: string;
  /** Qué hacer. Siempre una instrucción concreta, nunca «revise la configuración». */
  queHacer: string;
}

export interface Compatibilidad {
  /** `true` cuando no hay ningún hallazgo por encima de «aviso». */
  compatible: boolean;
  severidad: SeveridadCompatibilidad;
  hallazgos: HallazgoCompatibilidad[];
}

const ORDEN: SeveridadCompatibilidad[] = ["ok", "aviso", "importante", "critico"];

/**
 * Diagnostica el backend desplegado.
 *
 * @param estado Lo que devolvió `documentacion.estado` o `documentacion.arranque`.
 */
export function diagnosticarCompatibilidad(estado: EstadoModulo | null): Compatibilidad {
  const hallazgos: HallazgoCompatibilidad[] = [];

  if (!estado) {
    return { compatible: false, severidad: "critico", hallazgos: [] };
  }

  /**
   * 1 · ¿Es este el backend de Documentación?
   *
   * El módulo de Documentación es un proyecto de Apps Script APARTE del backend
   * del talento (postulantes, comparador). Pegar la URL equivocada en la
   * configuración es el error más fácil de cometer y el más difícil de ver: la
   * URL responde, devuelve JSON con la misma forma, y todas las acciones
   * `documentacion.*` fallan una por una.
   */
  if (estado.arquitectura && estado.arquitectura !== "documentacion-normalizada") {
    hallazgos.push({
      codigo: "backend-ajeno",
      severidad: "critico",
      titulo: "Esa URL no es la del backend de Documentación",
      detalle: `El enlace responde, pero dice ser «${estado.arquitectura}». El módulo de Documentación tiene su propio proyecto de Apps Script, distinto del del talento.`,
      queHacer:
        "Abra el proyecto de Apps Script DE DOCUMENTACIÓN, copie su URL «…/exec» y péguela en Configuración › Conexión y esquema.",
    });
  }

  /**
   * 2 · ¿Está publicada la versión que se pegó?
   *
   * Es el paso 4 de la puesta en marcha y el que se olvida. Se detecta por la
   * versión de esquema: el editor puede tener el código nuevo y el enlace
   * `/exec` servir el anterior, y entonces el número que llega es el viejo.
   */
  const esquema = Number(estado.esquema ?? 0);
  if (esquema > 0 && esquema < ESQUEMA_ESPERADO) {
    hallazgos.push({
      codigo: "esquema-anterior",
      severidad: "critico",
      titulo: `El backend desplegado es de una versión anterior (esquema ${esquema}, hace falta ${ESQUEMA_ESPERADO})`,
      detalle:
        "Casi todo va a funcionar y fallará justo lo nuevo, que es lo que hace que parezca «que se conecta mal». Suele significar una de dos cosas: los archivos .gs no se pegaron, o se pegaron y no se publicó una VERSIÓN NUEVA de la implementación.",
      queHacer:
        "En Apps Script: pegue los .gs de apps-script/documentacion/, guarde y después Implementar › Gestionar implementaciones › ✎ Editar › Versión: «Versión nueva» › Implementar. El enlace /exec no cambia.",
    });
  } else if (esquema > ESQUEMA_ESPERADO) {
    hallazgos.push({
      codigo: "esquema-posterior",
      severidad: "aviso",
      titulo: `El backend es más nuevo que esta pantalla (esquema ${esquema} contra ${ESQUEMA_ESPERADO})`,
      detalle:
        "No es un problema: el backend mantiene el contrato antiguo a propósito. Lo que no se verá son las funciones que la pantalla todavía no conoce.",
      queHacer: "Recargue la página con Ctrl+Shift+R. Si sigue igual, es que Vercel aún no publicó la versión nueva del frontend.",
    });
  }

  /** 3 · Acciones que hacen falta y no están. Nombra la que falta. */
  const disponibles = new Set(estado.acciones ?? []);
  if (disponibles.size > 0) {
    const faltan = ACCIONES_REQUERIDAS.filter((accion) => !disponibles.has(accion));
    if (faltan.length) {
      hallazgos.push({
        codigo: "acciones-faltantes",
        severidad: "importante",
        titulo: `El backend no conoce ${faltan.length} acción(es) que esta pantalla usa`,
        detalle: `Falta: ${faltan.join(", ")}. El módulo tiene recaída automática para todas, así que sigue funcionando; solo va más lento, porque hace varias llamadas donde bastaba una.`,
        queHacer: "Publique una versión nueva de la implementación de Apps Script con los .gs al día.",
      });
    }
  }

  /** 4 · Catálogo por detrás: los documentos nuevos no se van a pedir. */
  const catalogo = Number(estado.catalogoVersion ?? 0);
  if (catalogo > 0 && catalogo < CATALOGO_ESPERADO) {
    hallazgos.push({
      codigo: "catalogo-anterior",
      severidad: "importante",
      titulo: `El catálogo del libro es la versión ${catalogo} y esta pantalla espera la ${CATALOGO_ESPERADO}`,
      detalle:
        "Los expedientes nuevos no van a pedir los requisitos añadidos, y los recuentos por rama no cuadrarán con los del informe.",
      queHacer:
        "En el libro: menú Documentación › Respaldar, después › Instalar o actualizar modelo, y por último › Migrar.",
    });
  }

  /** 5 · Migraciones declaradas y sin aplicar. */
  const pendientes = estado.migraciones?.pendientes ?? [];
  if (pendientes.length) {
    hallazgos.push({
      codigo: "migraciones-pendientes",
      severidad: "aviso",
      titulo: `Hay ${pendientes.length} migración(es) del modelo sin aplicar`,
      detalle: `Pendientes: ${pendientes.join(", ")}. Los datos actuales son correctos, pero las columnas nuevas están vacías y los expedientes antiguos no tienen los requisitos añadidos.`,
      queHacer: "En el libro: menú Documentación › Simular migración (para leer qué va a cambiar) y después › Migrar.",
    });
  }

  /** 6 · Hojas del modelo que faltan. */
  const hojasFaltantes = estado.hojasFaltantes ?? [];
  if (estado.instalado === false && hojasFaltantes.length) {
    hallazgos.push({
      codigo: "hojas-faltantes",
      severidad: "critico",
      titulo: `Al libro le faltan ${hojasFaltantes.length} hoja(s) del modelo`,
      detalle: `Sin ellas no hay dónde guardar. Falta: ${hojasFaltantes.slice(0, 4).join(", ")}${hojasFaltantes.length > 4 ? "…" : ""}.`,
      queHacer: "Pulse «Instalar el modelo» aquí mismo, o en el libro: menú Documentación › Instalar o actualizar modelo. No borra nada.",
    });
  }

  const severidad = hallazgos.reduce<SeveridadCompatibilidad>(
    (peor, h) => (ORDEN.indexOf(h.severidad) > ORDEN.indexOf(peor) ? h.severidad : peor),
    "ok",
  );

  return {
    compatible: ORDEN.indexOf(severidad) <= ORDEN.indexOf("aviso"),
    severidad,
    hallazgos,
  };
}

/** Intención visual de una severidad, para los avisos del módulo. */
export function intencionDeSeveridad(s: SeveridadCompatibilidad): "exito" | "info" | "aviso" | "peligro" {
  if (s === "critico") return "peligro";
  if (s === "importante") return "aviso";
  if (s === "aviso") return "info";
  return "exito";
}
