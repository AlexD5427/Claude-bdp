/**
 * Estado de la sesión administrativa, para la interfaz.
 *
 * El transporte no sabe pintar diálogos y la interfaz no debería adivinar por qué
 * falló una llamada. Este store minúsculo es el puente: cuando el backend
 * intermedio responde «falta sesión», el módulo lo ve y pide la frase de acceso.
 *
 * No guarda ningún secreto: solo si la sesión está activa, es requerida o se
 * desconoce. La credencial real es una cookie `HttpOnly` que este código no puede
 * leer.
 */

import { createStore } from "../../../shared/store";

export type AdminSessionStatus = "unknown" | "required" | "active";

export interface AdminSessionUiState {
  status: AdminSessionStatus;
  /** Etiqueta del actor de la sesión, cuando el backend la informa. */
  actor: string;
  /**
   * Número de veces que el servidor ha pedido sesión. La interfaz lo compara con
   * el último aviso que el usuario descartó, para no reabrir el diálogo que
   * acaba de cerrar y sí reabrirlo cuando vuelva a hacer falta.
   */
  promptCount: number;
}

const store = createStore<AdminSessionUiState>({ status: "unknown", actor: "", promptCount: 0 });

export const adminSessionState = {
  use: store.use,
  get: store.get,
  /** El transporte informa de lo que observó en la última respuesta del proxy. */
  observe(status: AdminSessionStatus): void {
    if (status === "unknown") return;
    if (status === "required") {
      store.set((state) => ({ ...state, status, actor: "", promptCount: state.promptCount + 1 }));
      return;
    }
    if (store.get().status === status) return;
    store.set((state) => ({ ...state, status }));
  },
  /** La interfaz confirma que hay sesión (tras validar la frase de acceso). */
  activate(actor: string): void {
    store.set((state) => ({ ...state, status: "active", actor }));
  },
  /** La sesión se cerró a petición del usuario. */
  clear(): void {
    store.set((state) => ({ ...state, status: "required", actor: "" }));
  },
};
