import { useMemo } from "react";
import { History, Workflow } from "lucide-react";
import type { Candidate } from "../../types";
import { useTalentData } from "../../context/TalentDataContext";
import { useDocStore } from "../../lib/docStore";
import { useReferences } from "../../lib/referencesStore";
import { useHiring } from "../../lib/hiringStore";
import { indexEspejo, candidateAttrs } from "../../lib/procesos";
import { buildTimeline } from "../../lib/profileData";
import { extractProceso } from "../../lib/candidates";
import { SectionCard, InfoRow, Timeline } from "./parts";

/**
 * The "Historial" tab — a unified, chronological timeline of everything the
 * system knows about a candidate: their process, evaluation, hiring lifecycle,
 * documentation and labor references. Also surfaces the linked process
 * attributes (gerencia, agencia, modalidad, estado) from the mirror sheets.
 */
export function HistorialTab({ candidate }: { candidate: Candidate }) {
  const { espejoBase, espejoUltimo } = useTalentData();
  const { dossiers } = useDocStore();
  const refsMap = useReferences();
  const hiring = useHiring();

  const id = candidate.identificador ?? candidate.id;
  const proceso = useMemo(() => {
    const idx = indexEspejo(espejoUltimo, espejoBase);
    return candidateAttrs(candidate, idx.byProceso);
  }, [candidate, espejoBase, espejoUltimo]);

  const events = useMemo(
    () =>
      buildTimeline(candidate, {
        hiring: hiring[candidate.id],
        proceso,
        dossier: dossiers[id],
        references: refsMap[id],
      }),
    [candidate, hiring, proceso, dossiers, refsMap, id],
  );

  return (
    <div className="space-y-4">
      {proceso && (proceso.gerencia || proceso.agencia || proceso.modalidad || proceso.estado) && (
        <SectionCard icon={<Workflow className="h-5 w-5" />} title="Proceso vinculado" sub={`Proceso ${extractProceso(candidate.identificador)}`}>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <InfoRow icon={<Workflow className="h-4 w-4" />} label="Gerencia / Unidad" value={proceso.gerencia} />
            <InfoRow icon={<Workflow className="h-4 w-4" />} label="Agencia / Regional" value={proceso.agencia} />
            <InfoRow icon={<Workflow className="h-4 w-4" />} label="Modalidad" value={proceso.modalidad} />
            <InfoRow icon={<Workflow className="h-4 w-4" />} label="Estado" value={proceso.estado} />
          </div>
        </SectionCard>
      )}

      <SectionCard icon={<History className="h-5 w-5" />} title="Línea de tiempo" sub="Hitos del postulante, del más reciente al más antiguo">
        <Timeline events={events} />
      </SectionCard>
    </div>
  );
}
