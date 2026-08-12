/**
 * Panel de prorroga de un requisito.
 *
 * La fecha se guarda como campo consultable en formato ISO `yyyy-MM-dd`, no como
 * texto decorativo, para poder filtrar por vencimiento. El color acompania al
 * texto pero nunca es el unico portador del significado: siempre hay etiqueta y
 * dias restantes.
 */

import { useState, type ChangeEvent } from "react";
import {
  diasRestantes,
  estadoProrroga,
  type EstadoProrroga,
} from "../../lib/doc/docCatalog";
import { fechaLegible } from "../../lib/doc/docBorrador";
import { IconoAlerta, IconoCalendario, IconoMas, IconoPapelera } from "./DocIconos";

const TONO: Record<EstadoProrroga, string> = {
  sin_prorroga: "neutro",
  vigente: "ok",
  por_vencer: "warn",
  vencida: "danger",
  invalida: "danger",
};

function leyenda(estado: EstadoProrroga, dias: number | null): string {
  switch (estado) {
    case "vigente":
      return dias === null ? "Vigente" : `Vigente, faltan ${dias} dias`;
    case "por_vencer":
      if (dias === 0) return "Vence hoy";
      return dias === 1 ? "Vence maniana" : `Por vencer en ${dias} dias`;
    case "vencida": {
      const pasados = dias === null ? null : Math.abs(dias);
      if (pasados === null) return "Vencida";
      return pasados === 1 ? "Vencida hace 1 dia" : `Vencida hace ${pasados} dias`;
    }
    case "invalida":
      return "Fecha no valida";
    default:
      return "Sin prorroga";
  }
}

export interface DocProrrogaProps {
  /** Texto exacto pedido por el area, p. ej. «Fecha de prorroga para entrega de…». */
  etiqueta: string;
  campoId: string;
  fecha: string | null;
  motivo: string;
  onCambiarFecha: (fecha: string | null) => void;
  onCambiarMotivo: (motivo: string) => void;
  registradaEn?: string;
  registradaPor?: string;
  soloLectura?: boolean;
  /** Inyectable para poder fijar el dia en las pruebas. */
  hoy?: Date;
}

export function DocProrroga({
  etiqueta,
  campoId,
  fecha,
  motivo,
  onCambiarFecha,
  onCambiarMotivo,
  registradaEn,
  registradaPor,
  soloLectura = false,
  hoy,
}: DocProrrogaProps) {
  const [confirmando, setConfirmando] = useState(false);
  const referencia = hoy ?? new Date();
  const estado = estadoProrroga(fecha ?? undefined, referencia);
  const dias = fecha ? diasRestantes(fecha, referencia) : null;

  if (!fecha) {
    return (
      <div className="doc-prorroga doc-prorroga--vacia">
        <button
          type="button"
          className="doc-boton doc-boton--suave doc-prorroga__agregar"
          disabled={soloLectura}
          onClick={() => onCambiarFecha("")}
        >
          <IconoMas className="doc-boton__icono" />
          Agregar prorroga
        </button>
        <p className="doc-prorroga__ayuda">
          Este requisito admite prorroga. Registrela solo si el area la concedio.
        </p>
      </div>
    );
  }

  return (
    <div className={`doc-prorroga doc-prorroga--${TONO[estado]}`}>
      <div className="doc-prorroga__fila">
        <label className="doc-prorroga__etiqueta" htmlFor={campoId}>
          <IconoCalendario className="doc-prorroga__icono" />
          {etiqueta}
        </label>

        <input
          id={campoId}
          className="doc-campo doc-campo--fecha"
          type="date"
          value={fecha}
          disabled={soloLectura}
          aria-describedby={`${campoId}-estado`}
          onChange={(evento: ChangeEvent<HTMLInputElement>) =>
            onCambiarFecha(evento.target.value)
          }
        />

        {!soloLectura ? (
          <button
            type="button"
            className="doc-boton-icono"
            aria-label={`Quitar la prorroga de ${etiqueta}`}
            onClick={() => setConfirmando(true)}
          >
            <IconoPapelera className="doc-boton__icono" />
          </button>
        ) : null}
      </div>

      <p className="doc-prorroga__estado" id={`${campoId}-estado`}>
        <span className={`doc-insignia doc-insignia--${TONO[estado]}`}>
          {leyenda(estado, dias)}
        </span>
        {fecha && estado !== "invalida" ? (
          <span className="doc-prorroga__fecha">{fechaLegible(fecha)}</span>
        ) : null}
      </p>

      {estado === "vencida" ? (
        <p className="doc-prorroga__alerta" role="status">
          <IconoAlerta className="doc-prorroga__icono" />
          El plazo concedido ya paso. Actualice la fecha o cambie el estado del requisito.
        </p>
      ) : null}

      <label className="doc-etiqueta" htmlFor={`${campoId}-motivo`}>
        Motivo de la prorroga (opcional)
      </label>
      <textarea
        id={`${campoId}-motivo`}
        className="doc-campo doc-campo--texto"
        rows={2}
        maxLength={1000}
        value={motivo}
        disabled={soloLectura}
        placeholder="Por ejemplo: el empleador anterior emitira el certificado el proximo mes."
        onChange={(evento: ChangeEvent<HTMLTextAreaElement>) =>
          onCambiarMotivo(evento.target.value)
        }
      />

      {registradaEn || registradaPor ? (
        <p className="doc-prorroga__meta">
          Registrada{registradaPor ? ` por ${registradaPor}` : ""}
          {registradaEn ? ` el ${registradaEn}` : ""}.
        </p>
      ) : null}

      {confirmando ? (
        <div className="doc-confirmar" role="alertdialog" aria-label="Quitar prorroga">
          <p className="doc-confirmar__texto">
            Se quitara la fecha de prorroga y su motivo. El movimiento queda en el historial.
          </p>
          <div className="doc-confirmar__acciones">
            <button
              type="button"
              className="doc-boton doc-boton--suave"
              onClick={() => setConfirmando(false)}
            >
              Conservar
            </button>
            <button
              type="button"
              className="doc-boton doc-boton--peligro"
              onClick={() => {
                onCambiarFecha(null);
                onCambiarMotivo("");
                setConfirmando(false);
              }}
            >
              Quitar prorroga
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default DocProrroga;
