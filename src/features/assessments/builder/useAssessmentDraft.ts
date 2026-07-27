/**
 * Borrador local, estado de guardado y protección contra pérdida de datos.
 *
 * Tres problemas distintos, resueltos aquí para que el constructor no los mezcle
 * con su renderizado:
 *
 *  1. **Cambios pendientes.** Se comparan el documento en edición y el último
 *     documento persistido. De ahí sale `dirty`, que alimenta el indicador de
 *     estado, la guardia de salida de la aplicación y el aviso del navegador.
 *
 *  2. **Recuperación tras una caída.** El documento se copia a `localStorage`
 *     con debounce. Al montar, si hay una copia de la MISMA evaluación y la
 *     MISMA versión de entidad que difiere de lo persistido, se ofrece
 *     recuperarla. `localStorage` es un salvavidas, nunca la base de datos.
 *
 *  3. **Autoguardado opcional.** Desactivado por omisión
 *     (`VITE_FLAG_ASSESSMENTS_AUTOSAVE`). Cuando está activo es complementario:
 *     tiene debounce, evita carreras con un token de petición, muestra su estado
 *     y **nunca publica**. El botón de guardado manual sigue siendo la acción
 *     principal.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FLAGS } from "../../../shared/flags";
import type { AssessmentContent } from "../domain/assessment";
import type { BuilderMeta } from "./builderState";
import type { SaveState } from "./SaveStatus";

const DRAFT_PREFIX = "bdp-assessment-draft:";
const PERSIST_DEBOUNCE_MS = 600;
const AUTOSAVE_DEBOUNCE_MS = 2500;

export interface DraftDocument {
  meta: BuilderMeta;
  content: AssessmentContent;
}

interface StoredDraft extends DraftDocument {
  assessmentId: string;
  entityVersion: number;
  savedAt: number;
}

export type SaveOutcome = "saved" | "error" | "conflict";

interface UseAssessmentDraftInput {
  assessmentId: string;
  entityVersion: number;
  /** Documento en edición. */
  document: DraftDocument;
  /** Último documento persistido (referencia para calcular `dirty`). */
  baseline: DraftDocument;
  /** Persiste el documento. Debe devolver el resultado real de la escritura. */
  onSave: () => Promise<SaveOutcome>;
}

export interface AssessmentDraftController {
  dirty: boolean;
  saveState: SaveState;
  lastSavedAt: string | null;
  /** Borrador recuperable encontrado en el almacenamiento local. */
  recovered: DraftDocument | null;
  recoveredAt: number | null;
  acceptRecovered: () => DraftDocument | null;
  discardRecovered: () => void;
  /** Guarda ahora. Es seguro llamarlo dos veces: la segunda se ignora. */
  save: () => Promise<SaveOutcome | "skipped">;
  clearDraft: () => void;
  autosaveEnabled: boolean;
}

function readStoredDraft(assessmentId: string): StoredDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_PREFIX + assessmentId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (!parsed || parsed.assessmentId !== assessmentId || !parsed.content || !parsed.meta) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function useAssessmentDraft({
  assessmentId,
  entityVersion,
  document: current,
  baseline,
  onSave,
}: UseAssessmentDraftInput): AssessmentDraftController {
  const autosaveEnabled = FLAGS.assessmentsAutosave;
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [discarded, setDiscarded] = useState(false);

  const currentJson = useMemo(() => JSON.stringify(current), [current]);
  const baselineJson = useMemo(() => JSON.stringify(baseline), [baseline]);
  const dirty = currentJson !== baselineJson;

  /** Se lee UNA sola vez, al montar: después el usuario decide. */
  const [stored] = useState<StoredDraft | null>(() => readStoredDraft(assessmentId));
  const recovered = useMemo(() => {
    if (discarded || !stored) return null;
    if (stored.entityVersion !== entityVersion) return null;
    if (JSON.stringify({ meta: stored.meta, content: stored.content }) === baselineJson) return null;
    return { meta: stored.meta, content: stored.content };
  }, [discarded, stored, entityVersion, baselineJson]);

  const clearDraft = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(DRAFT_PREFIX + assessmentId);
    } catch {
      /* almacenamiento no disponible: el borrador local es best-effort */
    }
  }, [assessmentId]);

  // Copia local con debounce. Solo se escribe cuando hay algo que perder.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!dirty) {
      clearDraft();
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        const payload: StoredDraft = {
          assessmentId,
          entityVersion,
          savedAt: Date.now(),
          meta: current.meta,
          content: current.content,
        };
        window.localStorage.setItem(DRAFT_PREFIX + assessmentId, JSON.stringify(payload));
      } catch {
        /* cuota agotada o modo privado */
      }
    }, PERSIST_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [assessmentId, entityVersion, current, dirty, clearDraft]);

  // Estado visible: los cambios pendientes tienen prioridad sobre «Guardado».
  useEffect(() => {
    setSaveState((previous) => {
      if (previous === "saving") return previous;
      if (dirty) return previous === "error" || previous === "conflict" ? previous : "dirty";
      return previous === "saved" ? "saved" : "idle";
    });
  }, [dirty]);

  /** Token que invalida los resultados de guardados obsoletos. */
  const saveToken = useRef(0);
  const inFlight = useRef(false);

  const save = useCallback(async (): Promise<SaveOutcome | "skipped"> => {
    // Prevención de doble clic y de carreras del autoguardado.
    if (inFlight.current) return "skipped";
    inFlight.current = true;
    const token = ++saveToken.current;
    setSaveState("saving");
    try {
      const outcome = await onSave();
      if (token !== saveToken.current) return "skipped";
      if (outcome === "saved") {
        setSaveState("saved");
        setLastSavedAt(new Date().toISOString());
        clearDraft();
      } else {
        setSaveState(outcome === "conflict" ? "conflict" : "error");
      }
      return outcome;
    } finally {
      inFlight.current = false;
    }
  }, [onSave, clearDraft]);

  // Autoguardado complementario, con debounce y sin publicar nunca.
  useEffect(() => {
    if (!autosaveEnabled || !dirty) return;
    if (saveState === "conflict") return;
    const timer = window.setTimeout(() => {
      void save();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [autosaveEnabled, dirty, currentJson, save, saveState]);

  // Aviso del navegador al recargar o cerrar con cambios pendientes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const acceptRecovered = useCallback((): DraftDocument | null => {
    if (!recovered) return null;
    setDiscarded(true);
    return recovered;
  }, [recovered]);

  const discardRecovered = useCallback(() => {
    setDiscarded(true);
    clearDraft();
  }, [clearDraft]);

  return {
    dirty,
    saveState,
    lastSavedAt,
    recovered,
    recoveredAt: stored?.savedAt ?? null,
    acceptRecovered,
    discardRecovered,
    save,
    clearDraft,
    autosaveEnabled,
  };
}
