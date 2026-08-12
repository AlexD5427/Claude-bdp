/**
 * Desplegable alimentado por la pestania `Auxiliar` (agencia_bdp / gerencia_bdp).
 *
 * Se apoya en un `<select>` nativo a proposito: es el control mas accesible y el
 * unico que en movil abre el selector del sistema, con areas tactiles correctas
 * y sin depender del hover. Cuando el catalogo es largo aparece un buscador
 * encima que filtra las opciones.
 *
 * Un valor guardado que ya no figura en el catalogo NO se borra: se muestra
 * marcado como fuera de catalogo y se advierte, porque puede tratarse de una
 * agencia cerrada o renombrada.
 */

import { useMemo, useState, type ChangeEvent } from "react";
import {
  esValorHistorico,
  filtrarOpciones,
  opcionesConHistorico,
  type EstadoAuxiliar,
} from "../../lib/doc/docAuxiliar";
import { IconoAlerta } from "./DocIconos";

/** A partir de este numero de opciones se ofrece el buscador. */
const UMBRAL_BUSQUEDA = 8;

export interface DocSelectorCatalogoProps {
  id: string;
  etiqueta: string;
  valor: string;
  opciones: string[];
  estado: EstadoAuxiliar;
  onChange: (valor: string) => void;
  onReintentar: () => void;
  error?: string;
  requerido?: boolean;
  deshabilitado?: boolean;
}

export function DocSelectorCatalogo({
  id,
  etiqueta,
  valor,
  opciones,
  estado,
  onChange,
  onReintentar,
  error,
  requerido = false,
  deshabilitado = false,
}: DocSelectorCatalogoProps) {
  const [consulta, setConsulta] = useState("");

  const todas = useMemo(() => opcionesConHistorico(opciones, valor), [opciones, valor]);
  const visibles = useMemo(() => filtrarOpciones(todas, consulta), [todas, consulta]);
  const historico = esValorHistorico(opciones, valor);
  const conBuscador = todas.length >= UMBRAL_BUSQUEDA;

  const idError = `${id}-error`;
  const idAviso = `${id}-aviso`;
  const idEstado = `${id}-estado`;
  const descripcion = [error ? idError : "", historico ? idAviso : "", idEstado]
    .filter((t) => t.length > 0)
    .join(" ");

  if (estado === "cargando") {
    return (
      <div className="doc-grupo">
        <span className="doc-etiqueta">{etiqueta}</span>
        <div className="doc-campo doc-campo--cargando doc-shimmer" aria-hidden="true" />
        <p className="doc-ayuda" role="status">
          Cargando el catalogo desde la hoja Auxiliar…
        </p>
      </div>
    );
  }

  if (estado === "error" || estado === "vacio" || estado === "inicial") {
    const mensaje =
      estado === "vacio"
        ? `La cabecera del catalogo existe pero no tiene valores debajo. Cargue las opciones en la hoja Auxiliar y vuelva a intentarlo.`
        : `No se pudo leer el catalogo de la hoja Auxiliar.`;
    return (
      <div className="doc-grupo">
        <label className="doc-etiqueta" htmlFor={id}>
          {etiqueta}
        </label>
        <div className="doc-aviso doc-aviso--warn" role="status">
          <IconoAlerta className="doc-aviso__icono" />
          <span>{mensaje}</span>
          <button type="button" className="doc-boton doc-boton--suave" onClick={onReintentar}>
            Reintentar
          </button>
        </div>
        {/* El campo sigue disponible para no bloquear la captura del expediente. */}
        <input
          id={id}
          className="doc-campo"
          type="text"
          value={valor}
          disabled={deshabilitado}
          placeholder="Escriba el valor mientras se resuelve el catalogo"
          onChange={(evento: ChangeEvent<HTMLInputElement>) => onChange(evento.target.value)}
        />
        {error ? (
          <p className="doc-error" id={idError} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="doc-grupo">
      <label className="doc-etiqueta" htmlFor={id}>
        {etiqueta}
        {requerido ? <span className="doc-obligatorio" aria-hidden="true"> *</span> : null}
      </label>

      {conBuscador ? (
        <input
          className="doc-campo doc-campo--buscador"
          type="search"
          value={consulta}
          disabled={deshabilitado}
          aria-label={`Buscar en ${etiqueta}`}
          placeholder={`Buscar entre ${todas.length} opciones…`}
          onChange={(evento: ChangeEvent<HTMLInputElement>) => setConsulta(evento.target.value)}
        />
      ) : null}

      <select
        id={id}
        className="doc-campo doc-campo--select"
        value={valor}
        required={requerido}
        disabled={deshabilitado}
        aria-invalid={error ? true : undefined}
        aria-describedby={descripcion}
        onChange={(evento: ChangeEvent<HTMLSelectElement>) => onChange(evento.target.value)}
      >
        <option value="">Seleccione…</option>
        {visibles.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.etiqueta}
          </option>
        ))}
      </select>

      <p className="doc-ayuda" id={idEstado}>
        {consulta.trim()
          ? `${visibles.length} de ${todas.length} opciones coinciden.`
          : `${todas.length} opciones en el catalogo.`}
      </p>

      {historico ? (
        <p className="doc-aviso doc-aviso--warn" id={idAviso} role="status">
          <IconoAlerta className="doc-aviso__icono" />
          <span>
            «{valor}» ya no figura en el catalogo actual. Se conserva tal cual; cambielo solo si
            corresponde.
          </span>
        </p>
      ) : null}

      {error ? (
        <p className="doc-error" id={idError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default DocSelectorCatalogo;
