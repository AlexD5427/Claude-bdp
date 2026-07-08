import { useTalentData } from "../context/TalentDataContext";
import { useCandidateEdit, closeEdit } from "../lib/candidateEditStore";
import { RegistrationForm } from "../modules/RegistrationForm";

/**
 * Global edit modal. Mounted once at the app root, it listens on
 * {@link ../lib/candidateEditStore} and opens the intake form in EDIT mode for
 * whichever candidate was requested — so the "Editar" affordance works
 * identically everywhere a postulante appears.
 */
export function CandidateEditModal() {
  const editingId = useCandidateEdit();
  const { candidatos } = useTalentData();
  const candidate = editingId ? candidatos.find((c) => c.id === editingId) ?? null : null;

  return (
    <RegistrationForm
      open={Boolean(editingId)}
      editing={candidate}
      onClose={closeEdit}
    />
  );
}
