/**
 * Conecta el asistente de expedientes con el almacen del modulo.
 *
 * El asistente es deliberadamente ignorante de donde se guardan los datos: solo
 * entrega un borrador validado. Este componente es quien traduce ese borrador
 * al formato del almacen y lo persiste, de modo que cambiar la persistencia no
 * obligue a tocar la interfaz.
 */

import { useMemo, useRef } from "react";
import { DocExpedienteWizard } from "./DocExpedienteWizard";
import { idHeredado } from "../../lib/docTemplate";
import { requisitosAplicables, type DocEstado } from "../../lib/doc/docCatalog";
import { valorDe, type BorradorExpediente } from "../../lib/doc/docBorrador";
import { claveIdentificador } from "../../lib/doc/docIdentificador";
import { createDossier, updateItem, useDocStore, type DocStatus } from "../../lib/docStore";

/**
 * Los estados canonicos del catalogo nuevo y los del almacen heredado son los
 * mismos conceptos con otro nombre. La correspondencia vive aqui, en un solo
 * sitio, en vez de repartida por la interfaz.
 */
const ESTADO_A_STATUS: Record<DocEstado, DocStatus> = {
  ENTREGADO: "presentado",
  PENDIENTE: "pendiente",
  NO_ENTREGADO: "observado",
  NO_APLICA: "no_aplica",
};

export interface DocExpedienteNuevoProps {
  open: boolean;
  onClose: () => void;
  /** Recibe el identificador guardado para abrir la vista detallada. */
  onCreated: (identificador: string) => void;
}

export function DocExpedienteNuevo({ open, onClose, onCreated }: DocExpedienteNuevoProps) {
  const { dossiers } = useDocStore();

  // Las claves ya procesadas evitan que un reintento tras un fallo de red
  // termine creando dos expedientes con el mismo contenido.
  const procesadas = useRef<Set<string>>(new Set());

  /** Identificadores existentes, comparados sin depender de los espacios. */
  const indice = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const clave of Object.keys(dossiers)) mapa.set(claveIdentificador(clave), clave);
    return mapa;
  }, [dossiers]);

  function existente(identificador: string): string | null {
    return indice.get(claveIdentificador(identificador)) ?? null;
  }

  async function guardar(borrador: BorradorExpediente, clave: string): Promise<void> {
    const identificador = borrador.identificador.trim();

    // Reintento de una peticion que ya se completo: abrir en vez de duplicar.
    if (procesadas.current.has(clave)) {
      onCreated(identificador);
      onClose();
      return;
    }

    const tipo = borrador.tipoFuncionario;
    if (!tipo) {
      throw new Error("Elija el tipo de funcionario antes de guardar.");
    }

    const yaEsta = existente(identificador);
    if (yaEsta) {
      throw new Error(
        "Ya existe un expediente con este identificador. Abralo desde la lista para editarlo.",
      );
    }

    const aplicables = requisitosAplicables(tipo, borrador.tipoGarantia ?? undefined);

    // Los grupos de la semilla se deducen de los requisitos que realmente
    // aplican a la rama, en vez de codificar a mano que rama lleva que grupo.
    createDossier({
      identificador,
      nombre: borrador.nombre.trim(),
      cargo: borrador.cargo.trim(),
      agencia: borrador.agencia,
      gerencia: borrador.gerencia,
      correo: "",
      fechaIngreso: borrador.fechaIngreso,
      seed: {
        includeGarantia: aplicables.some((req) => req.grupo === "garantia"),
        includeCumplimiento: aplicables.some((req) => req.grupo === "cumplimiento"),
      },
    });

    // El expediente nace con todo en pendiente, asi que solo se escriben los
    // requisitos que la persona toco. Son bastantes menos escrituras.
    for (const req of aplicables) {
      const valor = valorDe(borrador, req.codigo);
      const sinTocar = valor.estado === "PENDIENTE" && valor.observacion.trim() === "";
      if (sinTocar) continue;

      updateItem(identificador, idHeredado(req), {
        status: ESTADO_A_STATUS[valor.estado],
        observation: valor.observacion,
      });
    }

    procesadas.current.add(clave);
    onCreated(identificador);
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[color:var(--app-base)]/85 p-4 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Registrar expediente documental"
    >
      <div className="mx-auto max-w-4xl">
        <DocExpedienteWizard
          onGuardar={guardar}
          onCancelar={onClose}
          identificadorExistente={(id) => existente(id) !== null}
          onAbrirExistente={(id) => {
            const real = existente(id);
            if (!real) return;
            onClose();
            onCreated(real);
          }}
        />
      </div>
    </div>
  );
}

export default DocExpedienteNuevo;
