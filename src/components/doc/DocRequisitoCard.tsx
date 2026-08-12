/**
 * Tarjeta de un requisito documental.
 *
 * Se dibuja a partir de la definicion del catalogo, nunca con HTML copiado: la
 * etiqueta, el texto del cuadro de observaciones, los estados ofrecidos y la
 * existencia de prorroga salen de `RequisitoDef`. Anadir un requisito al
 * catalogo lo hace aparecer aqui sin tocar este archivo.
 */

import { useId, type ChangeEvent } from "react";
import type { RequisitoDef } from "../../lib/doc/docCatalog";
import { DOC_ESTADO_TONO } from "../../lib/doc/docCatalog";
import type { ValorRequisito } from "../../lib/doc/docBorrador";
import { DocEstadoChips } from "./DocEstadoChips";
import { DocProrroga } from "./DocProrroga";

const LIMITE_OBSERVACION = 1000;

export interface DocRequisitoCardProps {
  requisito: RequisitoDef;
  /** Numero visible dentro de su bloque, empezando en 1. */
  numero: number;
  valor: ValorRequisito;
  onChange: (parcial: Partial<ValorRequisito>) => void;
  soloLectura?: boolean;
  hoy?: Date;
}

export function DocRequisitoCard({
  requisito,
  numero,
  valor,
  onChange,
  soloLectura = false,
  hoy,
}: DocRequisitoCardProps) {
  const base = useId();
  const idDescripcion = `${base}-desc`;
  const idObservacion = `${base}-obs`;
  const restantes = LIMITE_OBSERVACION - valor.observacion.length;

  return (
    <article
      className={`doc-requisito doc-requisito--${DOC_ESTADO_TONO[valor.estado]}`}
      aria-labelledby={`${base}-titulo`}
    >
      <header className="doc-requisito__cabecera">
        <span className="doc-requisito__numero" aria-hidden="true">
          {numero}
        </span>
        <div className="doc-requisito__textos">
          <h4 className="doc-requisito__titulo" id={`${base}-titulo`}>
            {requisito.etiqueta}
          </h4>
          {requisito.descripcion ? (
            <p className="doc-requisito__descripcion" id={idDescripcion}>
              {requisito.descripcion}
            </p>
          ) : null}
        </div>
      </header>

      <DocEstadoChips
        etiquetaGrupo={requisito.etiqueta}
        estados={requisito.estados}
        valor={valor.estado}
        onChange={(estado) => onChange({ estado })}
        deshabilitado={soloLectura}
        descripcionId={requisito.descripcion ? idDescripcion : undefined}
      />

      <div className="doc-requisito__observacion">
        <label className="doc-etiqueta" htmlFor={idObservacion}>
          {requisito.observacionEtiqueta}
        </label>
        <textarea
          id={idObservacion}
          className="doc-campo doc-campo--texto"
          rows={2}
          maxLength={LIMITE_OBSERVACION}
          value={valor.observacion}
          disabled={soloLectura}
          onChange={(evento: ChangeEvent<HTMLTextAreaElement>) =>
            onChange({ observacion: evento.target.value })
          }
        />
        {restantes <= 120 ? (
          <p className="doc-contador" aria-live="polite">
            Quedan {restantes} caracteres.
          </p>
        ) : null}
      </div>

      {requisito.permiteProrroga ? (
        <DocProrroga
          etiqueta={requisito.prorrogaEtiqueta ?? "Fecha de prorroga"}
          campoId={`${base}-prorroga`}
          fecha={valor.prorroga}
          motivo={valor.prorrogaMotivo}
          onCambiarFecha={(prorroga) => onChange({ prorroga })}
          onCambiarMotivo={(prorrogaMotivo) => onChange({ prorrogaMotivo })}
          soloLectura={soloLectura}
          hoy={hoy}
        />
      ) : null}
    </article>
  );
}

export default DocRequisitoCard;
