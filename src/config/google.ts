/**
 * Inventario de todo lo que vive en la cuenta de Google.
 *
 * ── Por qué existe este archivo ─────────────────────────────────────────────
 * El sistema no tiene un backend propio: su base de datos son libros de Google
 * Sheets y su servidor son proyectos de Google Apps Script publicados como
 * aplicación web. Eso significa que **el sistema entero está atado a la cuenta
 * de Google que creó esos archivos**, y que migrarlo a otra cuenta no es
 * desplegar de nuevo: es mover archivos, volver a publicar y volver a apuntar.
 *
 * Antes de este archivo, las direcciones estaban repartidas por el código: el
 * endpoint del talento en `constants.ts`, el respaldo de Evaluaciones en
 * `features/evaluaciones/api/despliegue.ts` y las seis utilidades externas
 * incrustadas en el panel de Herramientas. Para migrar había que *acordarse* de
 * los tres sitios, y el que se olvidaba seguía apuntando a la cuenta antigua sin
 * que nada lo dijera: la pantalla no falla, simplemente lee del libro que ya no
 * es el bueno.
 *
 * Aquí están todas, una sola vez. La regla es corta y la verifica
 * `npm run migracion:verificar`:
 *
 *   **ninguna dirección de Google se escribe fuera de este archivo.**
 *
 * ── Cómo se cambia de cuenta ────────────────────────────────────────────────
 * Dos vías, y las dos se pueden usar a la vez:
 *
 *   1. **Variables de compilación** (`VITE_…`). Es lo que se usa cuando el mismo
 *      código sirve a dos cuentas —el ensayo y la definitiva— sin tocar el
 *      repositorio. Se definen en Vercel, o en un `.env.local` para probar.
 *   2. **Editar los valores por omisión de abajo.** Es un cambio de una línea
 *      por recurso, queda en el historial de Git y es lo que conviene cuando la
 *      cuenta nueva ya es la definitiva.
 *
 * La variable manda sobre el valor del repositorio. Y una variable con una
 * dirección que no es de Apps Script **se ignora y se avisa** en lugar de
 * usarse: pegar una ruta interna en una de estas variables ya dejó el módulo de
 * Evaluaciones inservible una vez, y aceptarla solo retrasa el diagnóstico.
 *
 * ── Qué NO está aquí ────────────────────────────────────────────────────────
 * Ningún secreto. Las URL `…/exec` de una aplicación web publicada con acceso
 * «cualquier usuario» son públicas por definición: son la dirección que abre el
 * postulante. Los secretos —la llave de administración de Evaluaciones, la de
 * Documentación— viven en las propiedades del proyecto de Apps Script y en el
 * navegador de quien administra, y no pueden estar en el paquete del navegador.
 *
 * Tampoco está el identificador de los libros de Sheets: el frontend nunca lo
 * usa. Cada backend sabe cuál es su libro por su propiedad de script
 * (`DOC_SPREADSHEET_ID`, `EV_SPREADSHEET_ID`) o porque el proyecto está creado
 * desde el propio libro. Ese es el dato que hay que actualizar en la cuenta
 * nueva, no aquí; está inventariado en `docs/migracion/INVENTARIO.md`.
 */

/** Forma de una dirección `…/exec` de aplicación web de Apps Script. */
const RE_EXEC = /^https:\/\/script\.google\.com\/(a\/macros\/[A-Za-z0-9.-]+\/s|macros\/s)\/[A-Za-z0-9_-]+\/exec$/;

/** Identificador de despliegue (`AKfycb…`), sin URL alrededor. */
const RE_DESPLIEGUE = /^[A-Za-z0-9_-]{20,200}$/;

function variable(clave: string): string {
  const entorno = import.meta.env as Record<string, string | undefined>;
  return String(entorno[clave] ?? "").trim();
}

/** Avisos de configuración acumulados al resolver el inventario. */
const avisos: string[] = [];

/**
 * Valor efectivo de un recurso: la variable si es válida, y si no el del repositorio.
 *
 * Cuando la variable existe pero no tiene la forma de una dirección de Apps
 * Script se descarta y se deja un aviso. Es deliberado que el sistema siga
 * arrancando: un aviso visible en Configuración se arregla en dos minutos,
 * mientras que una pantalla en blanco al desplegar un viernes no.
 */
function resolverExec(clave: string, porOmision: string): string {
  const desdeVariable = variable(clave);
  if (!desdeVariable) return porOmision;
  if (!RE_EXEC.test(desdeVariable)) {
    avisos.push(
      `La variable ${clave} vale «${desdeVariable}», que no es la dirección de una aplicación web de Apps Script (debe empezar por https://script.google.com/ y terminar en /exec). Se ignoró y se usa el valor del repositorio.`,
    );
    return porOmision;
  }
  return desdeVariable;
}

/* ------------------------------------------------------------------ */
/* 1 · Base de datos del talento (el backend «general»)                */
/* ------------------------------------------------------------------ */

/**
 * Único endpoint del backend del talento: postulantes, competencias, perfiles,
 * perfiles de cargo, procesos, referencias y la bitácora de los perfiles.
 *
 * Toda llamada a esta URL **tiene que** pasar `{ redirect: "follow" }`: Google
 * responde con un 302 hacia `script.googleusercontent.com` y sin seguirlo la
 * aplicación falla con un 404 desconcertante en producción.
 *
 * Variable de compilación: `VITE_SCRIPT_URL`.
 */
export const SCRIPT_URL = resolverExec(
  "VITE_SCRIPT_URL",
  "https://script.google.com/macros/s/AKfycby5iqFsfvuL6movHAfZ46CZZuND22M1J-R-D3BLv2mx-a8lmRa_AePbmV59jPRTA-hczQ/exec",
);

/* ------------------------------------------------------------------ */
/* 2 · Backend de Documentación                                        */
/* ------------------------------------------------------------------ */

/**
 * Aplicación web del proyecto de Apps Script de Documentación.
 *
 * Es un proyecto **aparte** del talento, con su propio libro. Cada navegador
 * puede guardar la suya desde «Documentación → Configuración → Conexión», y esa
 * gana; este valor es el que usa un equipo que nunca la configuró.
 *
 * Vacío significa «no hay»: entonces el módulo recae en `SCRIPT_URL`, que no
 * conoce las acciones `documentacion.*`, y la consola lo dice con estas
 * palabras: «Estás usando el backend general del sistema». Poner aquí la
 * dirección correcta es lo que evita que cada persona del área tenga que
 * pegarla a mano en su equipo.
 *
 * Variable de compilación: `VITE_DOCUMENTACION_URL`.
 */
export const URL_DOCUMENTACION = resolverExec("VITE_DOCUMENTACION_URL", "");

/* ------------------------------------------------------------------ */
/* 3 · Backend de Evaluaciones                                         */
/* ------------------------------------------------------------------ */

/**
 * Despliegue de Evaluaciones por omisión — y el respaldo de los enlaces viejos.
 *
 * Cada enlace público que se envía a un postulante lleva dentro la referencia
 * del despliegue al que pertenece (`#/evaluacion/EV-…?b=AKfycb…`), así que abre
 * en cualquier teléfono sin configurar nada. Los enlaces compartidos ANTES de
 * que eso existiera no la llevan, y para ellos este valor es lo único que
 * permite resolver a qué libro pertenecen.
 *
 * De la URL del despliegue se pega solo el trozo del medio:
 *
 *     https://script.google.com/macros/s/AKfycbz…UNA_CADENA_LARGA…/exec
 *                                        └────────── esto ──────────┘
 *
 * Y si el despliegue es de un dominio de Workspace
 * (`https://script.google.com/a/macros/MI-DOMINIO/s/AKfycb…/exec`), también el
 * dominio en `DOMINIO_EVALUACIONES`.
 *
 * Dejarlo vacío es válido: los enlaces nuevos siguen siendo portátiles solos.
 *
 * > **Al migrar, esto es lo que decide si los enlaces ya enviados siguen
 * > abriendo.** Apuntan al despliegue ANTIGUO por su identificador. Mientras ese
 * > despliegue exista y la cuenta antigua siga activa, funcionan; el día que se
 * > borre o se cierre la cuenta, dejan de abrir y hay que volver a copiar y
 * > reenviar el enlace de cada evaluación. El módulo tiene un botón «Comprobar»
 * > que lo verifica en el momento.
 */
export const DESPLIEGUE_EVALUACIONES = ((): string => {
  const desdeVariable = variable("VITE_EVALUACIONES_DESPLIEGUE");
  if (!desdeVariable) return "";
  if (!RE_DESPLIEGUE.test(desdeVariable)) {
    avisos.push(
      `La variable VITE_EVALUACIONES_DESPLIEGUE vale «${desdeVariable}», que no parece un identificador de despliegue (el trozo «AKfycb…» de la URL, sin https:// ni /exec). Se ignoró.`,
    );
    return "";
  }
  return desdeVariable;
})();

/** Dominio de Workspace del despliegue de Evaluaciones, si lo tiene. */
export const DOMINIO_EVALUACIONES = variable("VITE_EVALUACIONES_DOMINIO");

/* ------------------------------------------------------------------ */
/* 4 · Utilidades externas del panel «Herramientas»                    */
/* ------------------------------------------------------------------ */

/**
 * Las seis utilidades que abre el panel «Herramientas» del dock.
 *
 * No son parte del sistema: son un sitio de Google, dos formularios y tres
 * aplicaciones web de Apps Script que el área ya usaba, y que **también viven en
 * la cuenta de Google**. Se inventarían aquí porque son exactamente el tipo de
 * cosa que una migración olvida: el día que la cuenta antigua se cierre, estos
 * seis enlaces dejan de abrir y el panel no tiene forma de saberlo.
 *
 * Cada uno lleva `cuenta: true` cuando su dirección depende de la cuenta que lo
 * creó, que es la señal de que hay que migrarlo o volver a crearlo.
 */
export interface Utilidad {
  /** Clave estable; la usa el inventario y las pruebas. */
  clave: string;
  etiqueta: string;
  url: string;
  /** `true` si la dirección pertenece a la cuenta de Google que hay que migrar. */
  cuenta: boolean;
}

export const UTILIDADES: Utilidad[] = [
  {
    clave: "sitio",
    etiqueta: "Página Principal de Reclutamiento",
    url: "https://sites.google.com/view/mireclutamiento/p%C3%A1gina-principal",
    cuenta: true,
  },
  {
    clave: "registro-postulantes",
    etiqueta: "Registro de Postulantes",
    url: "https://script.google.com/macros/s/AKfycbwzX-rgRuE9BXWUIdONNw2iiiUZBc7of4IEwv8UZhFUBlmFbRhBG7w2_6JwQcVi7II6QQ/exec",
    cuenta: true,
  },
  {
    clave: "seguimiento-procesos",
    etiqueta: "Seguimiento de Procesos",
    url: "https://docs.google.com/forms/d/e/1FAIpQLSekw8uI4n-LPPFYN4o5JqYHHhDK98BKYfATN68Dhq8iIkvm3g/viewform",
    cuenta: true,
  },
  {
    clave: "buscador-perfiles",
    etiqueta: "Buscador · Perfiles de Evaluar.com y GenomaWork",
    url: "https://script.google.com/macros/s/AKfycbwuF7dmipp-5L3-ZOHqJxoRY-MKg8zRPREgRkPPaqneMPjG-rIc6pfnZ2FCFInQlxw2Mg/exec",
    cuenta: true,
  },
  {
    clave: "buscador-funcionarios",
    etiqueta: "Buscador · Datos de Funcionarios",
    url: "https://script.google.com/macros/s/AKfycbzDk_133xWJqFH0jDtR07x002gUScHvOLQI7ubmX_yo1IxMiQzjG-OZdamFgURjQnhg/exec",
    cuenta: true,
  },
  {
    clave: "lista-negra",
    etiqueta: "Registro de Lista Negra",
    url: "https://docs.google.com/forms/d/e/1FAIpQLSdo58qB0CAH-p0SNCfnGnDjBfwtdRCYWpzcDH0h6Zt9Vwu9nQ/viewform",
    cuenta: true,
  },
];

/* ------------------------------------------------------------------ */
/* El inventario, para mirarlo desde la aplicación                     */
/* ------------------------------------------------------------------ */

export type OrigenRecurso = "variable" | "repositorio" | "sin-configurar";

export interface RecursoGoogle {
  clave: string;
  etiqueta: string;
  /** Dirección efectiva, o cadena vacía si no hay ninguna. */
  url: string;
  /** De dónde salió el valor que se está usando. */
  origen: OrigenRecurso;
  /** Variable de compilación que lo sobreescribe, si tiene una. */
  variable: string;
  /** Qué deja de funcionar si este recurso se queda en la cuenta antigua. */
  impacto: string;
}

function origenDe(clave: string, url: string): OrigenRecurso {
  if (!url) return "sin-configurar";
  return variable(clave) === url ? "variable" : "repositorio";
}

/**
 * Todo lo que apunta a la cuenta de Google, en una sola lista.
 *
 * La usa la sección «Integraciones» de Configuración para que quien hace la
 * migración pueda comprobar **desde la propia aplicación** —sin abrir el
 * repositorio ni las herramientas del navegador— que ya no queda nada
 * apuntando a la cuenta antigua.
 */
export function inventarioGoogle(): RecursoGoogle[] {
  const evaluaciones = DESPLIEGUE_EVALUACIONES
    ? DOMINIO_EVALUACIONES
      ? `https://script.google.com/a/macros/${DOMINIO_EVALUACIONES}/s/${DESPLIEGUE_EVALUACIONES}/exec`
      : `https://script.google.com/macros/s/${DESPLIEGUE_EVALUACIONES}/exec`
    : "";

  return [
    {
      clave: "talento",
      etiqueta: "Base de datos del talento",
      url: SCRIPT_URL,
      origen: origenDe("VITE_SCRIPT_URL", SCRIPT_URL),
      variable: "VITE_SCRIPT_URL",
      impacto:
        "Postulantes, comparador, perfiles, perfiles de cargo, procesos y el acceso por perfil. Sin esto no arranca nada.",
    },
    {
      clave: "documentacion",
      etiqueta: "Backend de Documentación",
      url: URL_DOCUMENTACION,
      origen: origenDe("VITE_DOCUMENTACION_URL", URL_DOCUMENTACION),
      variable: "VITE_DOCUMENTACION_URL",
      impacto:
        "Expedientes de incorporación. Sin esto cada equipo tiene que pegar la URL a mano en Documentación → Configuración → Conexión.",
    },
    {
      clave: "evaluaciones",
      etiqueta: "Despliegue de Evaluaciones (respaldo de enlaces antiguos)",
      url: evaluaciones,
      origen: origenDe("VITE_EVALUACIONES_DESPLIEGUE", DESPLIEGUE_EVALUACIONES),
      variable: "VITE_EVALUACIONES_DESPLIEGUE",
      impacto:
        "Los enlaces de evaluación enviados antes de que el enlace llevara su despliegue dentro. La conexión de trabajo se configura en Evaluaciones → Conexión.",
    },
    ...UTILIDADES.map((u) => ({
      clave: `utilidad:${u.clave}`,
      etiqueta: `Herramientas · ${u.etiqueta}`,
      url: u.url,
      origen: "repositorio" as OrigenRecurso,
      variable: "",
      impacto: "Un enlace del panel «Herramientas». Deja de abrir si el archivo no se migra.",
    })),
  ];
}

/**
 * Problemas de configuración detectados al resolver el inventario.
 *
 * Se calculan una sola vez, al cargar el módulo, y se muestran en Configuración.
 * Lista vacía = no hay nada que decir.
 */
export function avisosDeConfiguracion(): string[] {
  return [...avisos];
}
