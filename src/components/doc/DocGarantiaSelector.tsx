/**
 * Eleccion del tipo de garantia (solo rama comercial).
 *
 * Las tres modalidades son mutuamente excluyentes. Si ya hay datos capturados en
 * la modalidad vigente, el cambio NO se aplica en silencio: se pide
 * confirmacion explicita indicando cuantos requisitos quedarian archivados.
 */

import { useState } from "react";
import {
  TIPOS_GARANTIA,
  type TipoGarantia,
} from "../../lib/doc/docCatalog";
import { IconoAlerta, IconoCheck } from "./DocIconos";

export interface DocGarantiaSelectorProps {
  valor: TipoGarantia | null;
  onChange: (tipo: TipoGarantia) => void;
  /**
   * Cuantos requisitos con datos se archivarian al cambiar a `destino`.
   * Devolver 0 aplica el cambio sin preguntar.
   */
  contarArchivables: (destino: TipoGarantia) => number;
  error?: string;
}

export function DocGarantiaSelector({
  valor,
  onChange,
  contarArchivables,
  error,
}: DocGarantiaSelectorProps) {
  const [pendiente, setPendiente] = useState<TipoGarantia | null>(null);
  const [afectados, setAfectados] = useState(0);

  function intentar(destino: TipoGarantia) {
    if (destino === valor) return;
    const cuantos = contarArchivables(destino);
    if (cuantos > 0) {
      setAfectados(cuantos);
      setPendiente(destino);
      return;
    }
    onChange(destino);
  }

  function confirmar() {
    if (pendiente) onChange(pendiente);
    setPendiente(null);
    setAfectados(0);
  }

  function cancelar() {
    setPendiente(null);
    setAfectados(0);
  }

  return (
    <div className="doc-garantias">
      <h3 className="doc-garantias__titulo" id="doc-garantia-titulo">
        Seleccione tipo de garantia
      </h3>

      <div
        className="doc-garantias__lista"
        role="radiogroup"
        aria-labelledby="doc-garantia-titulo"
        aria-describedby={error ? "doc-garantia-error" : undefined}
      >
        {TIPOS_GARANTIA.map((def) => {
          const activo = def.codigo === valor;
          return (
            <button
              key={def.codigo}
              type="button"
              role="radio"
              aria-checked={activo}
              tabIndex={activo || (valor === null && def.codigo === "TIPO_1") ? 0 : -1}
              className={`doc-garantia${activo ? " is-activa" : ""}`}
              onClick={() => intentar(def.codigo)}
            >
              <span className="doc-garantia__cabecera">
                <span className="doc-garantia__etiqueta">{def.etiqueta}</span>
                {activo ? <IconoCheck className="doc-garantia__check" /> : null}
              </span>
              <span className="doc-garantia__titulo">{def.titulo}</span>
              <ul className="doc-garantia__lista">
                {def.caracteristicas.map((texto) => (
                  <li key={texto}>{texto}</li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="doc-error" id="doc-garantia-error" role="alert">
          {error}
        </p>
      ) : null}

      {pendiente ? (
        <div className="doc-confirmar" role="alertdialog" aria-labelledby="doc-confirmar-titulo">
          <p className="doc-confirmar__titulo" id="doc-confirmar-titulo">
            <IconoAlerta className="doc-confirmar__icono" />
            Cambiar el tipo de garantia
          </p>
          <p className="doc-confirmar__texto">
            Ya hay {afectados} {afectados === 1 ? "requisito" : "requisitos"} con datos en la
            modalidad actual. Al cambiar dejan de aplicarse y se archivan: no apareceran en el
            expediente ni contaran para el avance. Si el expediente ya estaba guardado, el cambio
            queda registrado en auditoria.
          </p>
          <div className="doc-confirmar__acciones">
            <button type="button" className="doc-boton doc-boton--suave" onClick={cancelar}>
              Conservar la actual
            </button>
            <button type="button" className="doc-boton doc-boton--peligro" onClick={confirmar}>
              Cambiar y archivar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default DocGarantiaSelector;
