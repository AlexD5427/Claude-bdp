/**
 * Cola de salida: escrituras que sobreviven a un recargado.
 *
 * ── Qué problema resuelve ───────────────────────────────────────────────────
 * Marcar seis requisitos y perder la conexión —o cerrar la pestaña sin querer—
 * significaba perder los seis. Peor: la interfaz podía haber dicho «guardado»
 * antes de que el backend confirmara, y entonces la persona se iba tranquila con
 * el trabajo sin escribir.
 *
 * La cola de salida guarda cada intento de escritura en este equipo ANTES de
 * enviarlo, lo reintenta con espera creciente, lo agrupa cuando se puede y solo
 * lo da por guardado cuando el backend lo confirma. Si queda pendiente, se dice
 * que está pendiente.
 *
 * ── El guardado no miente. Nunca ────────────────────────────────────────────
 * Esta es la regla dura del módulo. Un cambio pasa por tres estados y ninguno se
 * salta:
 *
 *   `pendiente`   está en la cola, todavía no se ha enviado o falló y espera;
 *   `enviando`    está en vuelo;
 *   `confirmado`  el backend respondió que sí. Solo entonces se dice «guardado».
 *
 * Si algo queda en `pendiente`, el indicador lo muestra y hay un botón para
 * reintentar. Nunca se pinta un visto bueno sobre una promesa.
 *
 * ── Idempotencia ────────────────────────────────────────────────────────────
 * Cada entrada nace con su `solicitudId` y lo conserva entre reintentos: el
 * backend reconoce la repetición y devuelve el resultado original en lugar de
 * aplicar el cambio dos veces. Un reintento después de un tiempo de espera
 * agotado —el caso peligroso, porque la operación pudo haberse completado— es
 * seguro por eso.
 */

import { docApi } from "../api/acciones";
import { nuevoRequestId } from "../api/client";
import { createStore } from "../../../shared/store";

/* ------------------------------------------------------------------ */
/* Tipos                                                              */
/* ------------------------------------------------------------------ */

export type EstadoEntrada = "pendiente" | "enviando" | "confirmado" | "rechazado";

/** Cambio de un requisito. Es la única escritura que se encola hoy. */
export interface CambioRequisito {
  expedienteDocumentoId: string;
  version?: number;
  estado?: string;
  observaciones?: string;
  hojasFisicas?: number;
}

export interface EntradaSalida {
  id: string;
  /** Identificador de solicitud: se conserva entre reintentos (idempotencia). */
  solicitudId: string;
  expedienteId: string;
  /** Etiqueta legible, para la vista de «cambios pendientes». */
  descripcion: string;
  cambios: CambioRequisito[];
  estado: EstadoEntrada;
  intentos: number;
  creadoEn: string;
  ultimoIntento: string;
  ultimoError: string;
}

export interface EstadoSalida {
  entradas: EntradaSalida[];
  /** ¿Hay conexión, según el navegador? */
  enLinea: boolean;
  /** Momento en que se confirmó la última entrada. */
  ultimaConfirmacion: string;
}

const CLAVE = "bdp-documentacion-salida";
const VERSION = 2;

/** Tope de reintentos automáticos. Después espera a que alguien pulse. */
const MAX_INTENTOS = 5;

/** Espera creciente: 1 s, 2 s, 4 s, 8 s, 16 s. */
function esperaDe(intentos: number): number {
  return Math.min(1000 * 2 ** Math.max(0, intentos - 1), 16000);
}

const INICIAL: EstadoSalida = {
  entradas: [],
  enLinea: typeof navigator === "undefined" ? true : navigator.onLine !== false,
  ultimaConfirmacion: "",
};

/**
 * Solo se persisten las entradas NO confirmadas.
 *
 * Guardar las confirmadas haría crecer la clave sin límite y no sirve para
 * nada: lo que ya está en el libro no hay que volver a enviarlo. Las que estaban
 * `enviando` cuando se cerró la pestaña vuelven a `pendiente`: no sabemos si
 * llegaron, y su `solicitudId` hace que reenviarlas sea seguro.
 */
const almacen = createStore<EstadoSalida>(INICIAL, {
  persistKey: CLAVE,
  serialize: (estado) =>
    JSON.stringify({
      version: VERSION,
      entradas: estado.entradas.filter((e) => e.estado !== "confirmado"),
    }),
  deserialize: (raw) => {
    const guardado = JSON.parse(raw) as { version?: number; entradas?: EntradaSalida[] };
    if (guardado?.version !== VERSION || !Array.isArray(guardado.entradas)) return { ...INICIAL };
    const entradas = guardado.entradas
      .filter((e) => e && typeof e.id === "string" && Array.isArray(e.cambios))
      .map((e) => ({ ...e, estado: e.estado === "enviando" ? ("pendiente" as const) : e.estado }));
    return { ...INICIAL, entradas };
  },
});

export const useSalida = almacen.use;
export const obtenerSalida = almacen.get;

/* ------------------------------------------------------------------ */
/* Encolar                                                            */
/* ------------------------------------------------------------------ */

/**
 * Fusiona dos listas de cambios sobre los mismos requisitos.
 *
 * ── Por qué coalescer ──────────────────────────────────────────────────────
 * Marcar un requisito «entregado», escribir su observación y luego corregir el
 * estado a «no entregado» son tres eventos y UN cambio: el último. Enviar los
 * tres es triplicar el coste y, peor, dejar en el historial dos estados que
 * nunca fueron ciertos más de un segundo.
 *
 * Se fusiona por `expedienteDocumentoId` y gana el valor más reciente de cada
 * campo. La versión que viaja es la de la entrada MÁS ANTIGUA: es la que la
 * persona tenía delante cuando empezó a editar, y es la que tiene que provocar
 * el conflicto si alguien se adelantó.
 */
function fusionar(previos: CambioRequisito[], nuevos: CambioRequisito[]): CambioRequisito[] {
  const porId = new Map<string, CambioRequisito>();
  for (const cambio of previos) porId.set(cambio.expedienteDocumentoId, { ...cambio });
  for (const cambio of nuevos) {
    const anterior = porId.get(cambio.expedienteDocumentoId);
    if (!anterior) {
      porId.set(cambio.expedienteDocumentoId, { ...cambio });
      continue;
    }
    porId.set(cambio.expedienteDocumentoId, {
      ...anterior,
      ...cambio,
      version: anterior.version ?? cambio.version,
    });
  }
  return [...porId.values()];
}

/** Identificador local de la entrada en la cola. Distinto del `solicitudId`. */
function nuevoId(): string {
  return `sal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Encola un bloque de cambios de requisitos.
 *
 * Si ya hay una entrada PENDIENTE para el mismo expediente, se fusiona en ella
 * en lugar de crear otra: dos escrituras seguidas sobre el mismo expediente son
 * dos viajes de red donde bastaba uno, y además pueden llegar desordenadas.
 * Las que ya están `enviando` no se tocan.
 */
export function encolarRequisitos(expedienteId: string, cambios: CambioRequisito[], descripcion: string): string {
  if (!cambios.length) return "";
  let id = "";
  almacen.set((prev) => {
    const indice = prev.entradas.findIndex((e) => e.expedienteId === expedienteId && e.estado === "pendiente");
    if (indice >= 0) {
      const entradas = [...prev.entradas];
      const existente = entradas[indice];
      id = existente.id;
      entradas[indice] = {
        ...existente,
        cambios: fusionar(existente.cambios, cambios),
        descripcion,
        // Se renueva el identificador de solicitud porque el CONTENIDO cambió:
        // reusar el anterior haría que el backend devolviera el resultado de la
        // petición vieja y descartara los cambios nuevos.
        solicitudId: nuevoRequestId(),
        intentos: 0,
        ultimoError: "",
      };
      return { ...prev, entradas };
    }
    const entrada: EntradaSalida = {
      id: nuevoId(),
      solicitudId: nuevoRequestId(),
      expedienteId,
      descripcion,
      cambios,
      estado: "pendiente",
      intentos: 0,
      creadoEn: new Date().toISOString(),
      ultimoIntento: "",
      ultimoError: "",
    };
    id = entrada.id;
    return { ...prev, entradas: [...prev.entradas, entrada] };
  });
  /**
   * Encolar NO envía.
   *
   * Es deliberado: quien encola decide cuándo enviar y quiere ESPERAR la
   * confirmación para poder decir la verdad en pantalla. Un envío automático
   * aquí haría que la pantalla no supiera si su cambio se confirmó o si lo
   * confirmó otro bombeo, y entonces solo podría decir «se está guardando», que
   * es justo la información que no sirve. El bombeo automático existe, pero para
   * lo que quedó pendiente: al arrancar el módulo y al volver la conexión.
   */
  return id;
}

/* ------------------------------------------------------------------ */
/* Envío                                                              */
/* ------------------------------------------------------------------ */

let bombeando = false;
let temporizador: ReturnType<typeof setTimeout> | null = null;

/**
 * Envía lo pendiente, de una en una y en orden.
 *
 * En orden a propósito: dos entradas del mismo expediente se fusionan al
 * encolar, pero dos de expedientes distintos podrían enviarse en paralelo. No se
 * hace: Apps Script serializa por libro con `LockService`, así que el paralelismo
 * no acelera nada y sí complica el diagnóstico cuando algo falla.
 */
export async function bombearSalida(): Promise<void> {
  if (bombeando) return;
  const enLinea = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  if (!enLinea) {
    almacen.set((prev) => (prev.enLinea === false ? prev : { ...prev, enLinea: false }));
    return;
  }
  almacen.set((prev) => (prev.enLinea === true ? prev : { ...prev, enLinea: true }));

  bombeando = true;
  try {
    for (;;) {
      const siguiente = almacen.get().entradas.find((e) => e.estado === "pendiente" && e.intentos < MAX_INTENTOS);
      if (!siguiente) break;
      const exito = await enviar(siguiente);
      if (!exito) break;
    }
  } finally {
    bombeando = false;
  }

  // Si queda algo pendiente por un fallo recuperable, se reintenta solo.
  const pendiente = almacen.get().entradas.find((e) => e.estado === "pendiente" && e.intentos < MAX_INTENTOS);
  if (pendiente && !temporizador) {
    temporizador = setTimeout(() => {
      temporizador = null;
      void bombearSalida();
    }, esperaDe(pendiente.intentos + 1));
  }
}

function marcar(id: string, patch: Partial<EntradaSalida>): void {
  almacen.set((prev) => ({
    ...prev,
    entradas: prev.entradas.map((e) => (e.id === id ? { ...e, ...patch } : e)),
  }));
}

/** Envía UNA entrada. Devuelve `true` si se puede seguir con la siguiente. */
async function enviar(entrada: EntradaSalida): Promise<boolean> {
  marcar(entrada.id, { estado: "enviando", ultimoIntento: new Date().toISOString() });
  try {
    const res = await docApi.guardarRequisitos(
      entrada.expedienteId,
      entrada.cambios as unknown as Record<string, unknown>[],
      { requestId: entrada.solicitudId, reintentos: 1 },
    );
    /**
     * Verificación real antes de decir «guardado».
     *
     * El backend devuelve cuántos cambios aplicó y cuáles rechazó. Si rechazó
     * alguno, la entrada NO se confirma: pasa a `rechazado` con el motivo, y la
     * vista de cambios pendientes lo muestra. Decir «guardado» porque la
     * llamada no lanzó excepción sería exactamente el guardado que miente.
     */
    if (res.fallidos?.length) {
      marcar(entrada.id, {
        estado: "rechazado",
        intentos: entrada.intentos + 1,
        ultimoError: res.fallidos[0]?.motivo ?? "El backend rechazó parte del cambio.",
      });
      return true;
    }
    almacen.set((prev) => ({
      ...prev,
      ultimaConfirmacion: new Date().toISOString(),
      entradas: prev.entradas.filter((e) => e.id !== entrada.id),
    }));
    return true;
  } catch (error) {
    const fallo = error as { message?: string; codigo?: string; red?: boolean };
    const recuperable = fallo.red === true || fallo.codigo === "SIN_RED" || fallo.codigo === "TIMEOUT" || fallo.codigo === "LIBRO_OCUPADO";
    marcar(entrada.id, {
      estado: recuperable ? "pendiente" : "rechazado",
      intentos: entrada.intentos + 1,
      ultimoError: fallo.message ?? "No se pudo enviar.",
    });
    // Un fallo recuperable detiene la tanda: si la red se cayó, insistir con las
    // siguientes solo suma esperas.
    return !recuperable;
  }
}

/**
 * Envía UNA entrada concreta y espera su resultado.
 *
 * Es lo que usa la ventana del expediente después de encolar: necesita saber si
 * el backend confirmó para decidir entre «guardado» y «pendiente de
 * sincronizar». Devolver el estado real —y no una promesa que se resuelve
 * siempre— es lo que hace que el indicador no mienta.
 */
export async function enviarEntrada(id: string): Promise<{ confirmado: boolean; motivo: string }> {
  const entrada = almacen.get().entradas.find((e) => e.id === id);
  if (!entrada) return { confirmado: true, motivo: "" };
  const enLinea = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  if (!enLinea) {
    almacen.set((prev) => (prev.enLinea === false ? prev : { ...prev, enLinea: false }));
    return { confirmado: false, motivo: "Sin conexión: el cambio quedó en la cola." };
  }
  await enviar(entrada);
  const despues = almacen.get().entradas.find((e) => e.id === id);
  // Si ya no está en la cola, es que se confirmó y se retiró.
  if (!despues) return { confirmado: true, motivo: "" };
  return { confirmado: false, motivo: despues.ultimoError || "El cambio quedó pendiente de sincronizar." };
}

/**
 * Vuelve a poner en la cola una entrada que se había respaldado.
 *
 * Lo usa «Recuperar borrador» del autodiagnóstico. Conserva el `solicitudId`
 * original, y eso es justamente lo que hace que la operación sea segura: si el
 * cambio SÍ había llegado al libro, el backend reconoce la solicitud y no la
 * aplica dos veces. Sin esa garantía, «recuperar» sería «duplicar».
 *
 * Se reinsertan como `pendiente` con los intentos a cero: lo que se sabe de la
 * entrada es su contenido, no en qué punto de su historia de fallos quedó.
 */
export function reponerEntrada(entrada: EntradaSalida): void {
  if (!entrada?.solicitudId || !Array.isArray(entrada.cambios) || !entrada.cambios.length) return;
  almacen.set((prev) => {
    if (prev.entradas.some((e) => e.solicitudId === entrada.solicitudId)) return prev;
    return {
      ...prev,
      entradas: [
        ...prev.entradas,
        { ...entrada, id: nuevoId(), estado: "pendiente", intentos: 0, ultimoError: "", ultimoIntento: "" },
      ],
    };
  });
  void bombearSalida();
}

/** Vuelve a intentar una entrada rechazada o agotada. Lo pulsa la persona. */
export function reintentarEntrada(id: string): void {
  marcar(id, { estado: "pendiente", intentos: 0, ultimoError: "" });
  void bombearSalida();
}

export function reintentarTodo(): void {
  almacen.set((prev) => ({
    ...prev,
    entradas: prev.entradas.map((e) => (e.estado === "confirmado" ? e : { ...e, estado: "pendiente", intentos: 0, ultimoError: "" })),
  }));
  void bombearSalida();
}

/**
 * Descarta una entrada.
 *
 * Existe porque hay un caso sin salida: un cambio que el backend rechaza siempre
 * —el expediente se archivó, el requisito ya no aplica— se quedaría en la cola
 * para siempre. Descartar es una decisión de la persona y se le dice qué pierde.
 */
export function descartarEntrada(id: string): void {
  almacen.set((prev) => ({ ...prev, entradas: prev.entradas.filter((e) => e.id !== id) }));
}

/** Cuántos cambios hay sin confirmar. Alimenta el indicador de sincronización. */
export function pendientesDeSincronizar(estado = almacen.get()): number {
  return estado.entradas
    .filter((e) => e.estado !== "confirmado")
    .reduce((n, e) => n + e.cambios.length, 0);
}

/* ------------------------------------------------------------------ */
/* Conexión                                                           */
/* ------------------------------------------------------------------ */

let escuchando = false;

/**
 * Empieza a vigilar la conexión.
 *
 * Al volver la red se bombea la cola sola: es lo que hace que cerrar el portátil
 * en una agencia sin señal y abrirlo en la oficina «simplemente funcione».
 */
export function vigilarConexion(): () => void {
  if (typeof window === "undefined" || escuchando) return () => undefined;
  escuchando = true;
  const alConectar = () => {
    almacen.set((prev) => ({ ...prev, enLinea: true }));
    void bombearSalida();
  };
  const alDesconectar = () => almacen.set((prev) => ({ ...prev, enLinea: false }));
  window.addEventListener("online", alConectar);
  window.addEventListener("offline", alDesconectar);
  return () => {
    window.removeEventListener("online", alConectar);
    window.removeEventListener("offline", alDesconectar);
    escuchando = false;
  };
}

/** Solo para pruebas: cola vacía y sin temporizadores. */
export function __reiniciarSalidaParaPruebas(): void {
  if (temporizador) {
    clearTimeout(temporizador);
    temporizador = null;
  }
  bombeando = false;
  almacen.set(() => ({ ...INICIAL, entradas: [] }));
}
