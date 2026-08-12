import { useEffect, useRef, useState } from "react";
import { useTalentData } from "../context/TalentDataContext";
import { useCandidateEdit, closeEdit } from "../lib/candidateEditStore";
import { RegistrationForm } from "../modules/RegistrationForm";
import type { Candidate } from "../types";

/**
 * Global edit modal. Mounted once at the app root, it listens on
 * {@link ../lib/candidateEditStore} and opens the intake form in EDIT mode for
 * whichever candidate was requested — so the "Editar" affordance works
 * identically everywhere a postulante appears.
 *
 * El cuestionario sólo se monta cuando hay alguien a quien editar. Antes vivía
 * montado siempre (cerrado), de modo que cada refresco de la base en segundo
 * plano reconstruía el árbol completo del formulario para nada, y esa copia
 * «vacía» compartía la clave del borrador con el cuestionario de alta. Se
 * mantiene montado unos milisegundos extra tras cerrar para que la animación de
 * salida del modal se vea completa.
 */
export function CandidateEditModal() {
  const editingId = useCandidateEdit();
  const { candidatos } = useTalentData();
  const candidate = editingId ? candidatos.find((c) => c.id === editingId) ?? null : null;
  const visible = candidate !== null;

  // Durante la animación de cierre ya no hay candidato en el store: conservamos
  // el último para que el modal no cambie de título mientras se va.
  const last = useRef<Candidate | null>(null);
  if (candidate) last.current = candidate;

  const mounted = useDelayedUnmount(visible, 420);
  if (!mounted) return null;

  return (
    <RegistrationForm open={visible} editing={last.current} onClose={closeEdit} />
  );
}

/** Mantiene algo montado `ms` milisegundos después de dejar de ser visible. */
function useDelayedUnmount(visible: boolean, ms: number): boolean {
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), ms);
    return () => window.clearTimeout(timer);
  }, [visible, ms]);
  return mounted;
}
