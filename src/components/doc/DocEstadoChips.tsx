/**
 * Chips de estado documental.
 *
 * Se implementa como un `radiogroup` real con tabulacion movil (roving
 * tabindex): el grupo recibe un solo tab-stop y las flechas mueven la seleccion,
 * que es el comportamiento que un lector de pantalla anuncia correctamente.
 * El estado nunca se comunica solo con color: siempre hay icono, texto y
 * `aria-checked`.
 */

import { useRef, type KeyboardEvent } from "react";
import {
  DOC_ESTADO_LABEL,
  DOC_ESTADO_TONO,
  type DocEstado,
} from "../../lib/doc/docCatalog";
import { IconoCheck, IconoEquis, IconoGuion, IconoReloj } from "./DocIconos";

function iconoDe(estado: DocEstado) {
  switch (estado) {
    case "ENTREGADO":
      return <IconoCheck className="doc-chip__icono" />;
    case "PENDIENTE":
      return <IconoReloj className="doc-chip__icono" />;
    case "NO_ENTREGADO":
      return <IconoEquis className="doc-chip__icono" />;
    case "NO_APLICA":
      return <IconoGuion className="doc-chip__icono" />;
    default:
      return null;
  }
}

export interface DocEstadoChipsProps {
  /** Nombre accesible del grupo; normalmente la etiqueta del requisito. */
  etiquetaGrupo: string;
  /** Estados ofrecidos, en el orden del catalogo. N/A siempre va al final. */
  estados: readonly DocEstado[];
  valor: DocEstado | null;
  onChange: (estado: DocEstado) => void;
  deshabilitado?: boolean;
  /** Id del texto que describe el grupo, si existe. */
  descripcionId?: string;
}

export function DocEstadoChips({
  etiquetaGrupo,
  estados,
  valor,
  onChange,
  deshabilitado = false,
  descripcionId,
}: DocEstadoChipsProps) {
  const botones = useRef<Array<HTMLButtonElement | null>>([]);
  const indiceSeleccionado = estados.findIndex((e) => e === valor);
  // Sin seleccion, el primer chip es el unico tab-stop del grupo.
  const indiceActivo = indiceSeleccionado >= 0 ? indiceSeleccionado : 0;

  function seleccionar(indice: number) {
    const destino = estados[indice];
    if (!destino) return;
    onChange(destino);
    const nodo = botones.current[indice];
    if (nodo) nodo.focus();
  }

  function alTeclado(evento: KeyboardEvent<HTMLButtonElement>) {
    if (deshabilitado || estados.length === 0) return;
    const ultimo = estados.length - 1;
    switch (evento.key) {
      case "ArrowRight":
      case "ArrowDown":
        evento.preventDefault();
        seleccionar((indiceActivo + 1) % estados.length);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        evento.preventDefault();
        seleccionar((indiceActivo - 1 + estados.length) % estados.length);
        break;
      case "Home":
        evento.preventDefault();
        seleccionar(0);
        break;
      case "End":
        evento.preventDefault();
        seleccionar(ultimo);
        break;
      default:
        break;
    }
  }

  return (
    <div
      className="doc-chips"
      role="radiogroup"
      aria-label={`Estado de: ${etiquetaGrupo}`}
      aria-describedby={descripcionId}
    >
      {estados.map((estado, indice) => {
        const activo = estado === valor;
        const clases = [
          "doc-chip",
          `doc-chip--${DOC_ESTADO_TONO[estado]}`,
          activo ? "is-activa" : "",
        ]
          .filter((c) => c.length > 0)
          .join(" ");

        return (
          <button
            key={estado}
            ref={(nodo: HTMLButtonElement | null) => {
              botones.current[indice] = nodo;
            }}
            type="button"
            role="radio"
            aria-checked={activo}
            tabIndex={indice === indiceActivo ? 0 : -1}
            disabled={deshabilitado}
            className={clases}
            onClick={() => onChange(estado)}
            onKeyDown={alTeclado}
          >
            {iconoDe(estado)}
            <span className="doc-chip__texto">{DOC_ESTADO_LABEL[estado]}</span>
          </button>
        );
      })}
    </div>
  );
}

export default DocEstadoChips;
