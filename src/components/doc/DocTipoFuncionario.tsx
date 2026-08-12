/**
 * Seleccion del tipo de funcionario: cuatro tarjetas a pantalla completa.
 *
 * Es un `radiogroup` con tabulacion movil. La tarjeta no disponible sigue
 * visible y anunciada como deshabilitada (`aria-disabled`) en lugar de
 * ocultarse, porque el area quiere tenerla a la vista; no permite continuar ni
 * guardar y muestra la leyenda exacta acordada.
 */

import { useRef, type KeyboardEvent } from "react";
import {
  DOC_LEYENDA_EN_CONSTRUCCION,
  TIPOS_FUNCIONARIO,
  type TipoFuncionario,
  type TipoFuncionarioDef,
} from "../../lib/doc/docCatalog";
import {
  IconoAlerta,
  IconoAuditoria,
  IconoComercial,
  IconoCumplimiento,
  IconoEjecutivo,
} from "./DocIconos";

function iconoDe(def: TipoFuncionarioDef) {
  switch (def.icono) {
    case "comercial":
      return <IconoComercial className="doc-tarjeta__icono" />;
    case "auditoria":
      return <IconoAuditoria className="doc-tarjeta__icono" />;
    case "cumplimiento":
      return <IconoCumplimiento className="doc-tarjeta__icono" />;
    case "ejecutivo":
      return <IconoEjecutivo className="doc-tarjeta__icono" />;
    default:
      return null;
  }
}

export interface DocTipoFuncionarioProps {
  valor: TipoFuncionario | null;
  onChange: (tipo: TipoFuncionario) => void;
  /** Mensaje de error de la seccion, si el paso se intento saltar. */
  error?: string;
}

export function DocTipoFuncionario({ valor, onChange, error }: DocTipoFuncionarioProps) {
  const botones = useRef<Array<HTMLButtonElement | null>>([]);
  const disponibles = TIPOS_FUNCIONARIO.filter((t) => t.disponible);
  const indiceSeleccionado = TIPOS_FUNCIONARIO.findIndex((t) => t.codigo === valor);
  const indiceActivo =
    indiceSeleccionado >= 0
      ? indiceSeleccionado
      : TIPOS_FUNCIONARIO.findIndex((t) => t.disponible);

  function moverA(indice: number) {
    const def = TIPOS_FUNCIONARIO[indice];
    if (!def || !def.disponible) return;
    onChange(def.codigo);
    const nodo = botones.current[indice];
    if (nodo) nodo.focus();
  }

  /** Las flechas recorren solo las tarjetas habilitadas. */
  function mover(desde: number, paso: number) {
    if (disponibles.length === 0) return;
    let indice = desde;
    for (let intento = 0; intento < TIPOS_FUNCIONARIO.length; intento += 1) {
      indice = (indice + paso + TIPOS_FUNCIONARIO.length) % TIPOS_FUNCIONARIO.length;
      const def = TIPOS_FUNCIONARIO[indice];
      if (def && def.disponible) {
        moverA(indice);
        return;
      }
    }
  }

  function alTeclado(evento: KeyboardEvent<HTMLButtonElement>, indice: number) {
    switch (evento.key) {
      case "ArrowRight":
      case "ArrowDown":
        evento.preventDefault();
        mover(indice, 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        evento.preventDefault();
        mover(indice, -1);
        break;
      default:
        break;
    }
  }

  return (
    <div className="doc-seccion-plena">
      <div
        className="doc-tarjetas"
        role="radiogroup"
        aria-label="Tipo de funcionario"
        aria-describedby={error ? "doc-tipo-error" : undefined}
      >
        {TIPOS_FUNCIONARIO.map((def, indice) => {
          const activo = def.codigo === valor;
          const bloqueada = !def.disponible;
          const clases = [
            "doc-tarjeta",
            activo ? "is-activa" : "",
            bloqueada ? "is-bloqueada" : "",
          ]
            .filter((c) => c.length > 0)
            .join(" ");

          return (
            <button
              key={def.codigo}
              ref={(nodo: HTMLButtonElement | null) => {
                botones.current[indice] = nodo;
              }}
              type="button"
              role="radio"
              aria-checked={activo}
              aria-disabled={bloqueada}
              tabIndex={indice === indiceActivo ? 0 : -1}
              className={clases}
              onClick={() => {
                if (!bloqueada) onChange(def.codigo);
              }}
              onKeyDown={(evento: KeyboardEvent<HTMLButtonElement>) =>
                alTeclado(evento, indice)
              }
            >
              <span className="doc-tarjeta__marco">{iconoDe(def)}</span>
              <span className="doc-tarjeta__titulo">{def.etiqueta}</span>
              <span className="doc-tarjeta__descripcion">{def.descripcion}</span>

              {bloqueada ? (
                <span className="doc-tarjeta__aviso">
                  <IconoAlerta className="doc-tarjeta__aviso-icono" />
                  <span>{def.nota ?? DOC_LEYENDA_EN_CONSTRUCCION}</span>
                </span>
              ) : (
                <span className="doc-tarjeta__estado">
                  {activo ? "Seleccionado" : "Disponible"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="doc-error" id="doc-tipo-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default DocTipoFuncionario;
