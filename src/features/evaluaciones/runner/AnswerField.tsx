/**
 * Campos de respuesta del candidato.
 *
 * Un componente por FORMA de respuesta (no por tipo): los treinta y nueve tipos
 * del catálogo se reducen a diez formas, y agrupar por forma evita treinta y nueve
 * ramas casi idénticas. El contrato del valor está documentado en
 * `docs/evaluaciones/CONTRATO_FRONTEND.md` y es el mismo que el calificador del
 * servidor espera.
 */

import { useId } from "react";
import { motion } from "framer-motion";
import { GripVertical, Star } from "lucide-react";
import { RichText } from "../richtext/RichText";
import { tipoSpec } from "../domain/questionTypes";
import type { PreguntaPublica } from "../domain/model";

export interface ValorRespuesta {
  opciones?: string[];
  valor?: unknown;
}

interface Props {
  pregunta: PreguntaPublica;
  valor: ValorRespuesta | undefined;
  onChange: (valor: ValorRespuesta) => void;
  bloquearPegado: boolean;
  onPegar: (caracteres: number) => void;
  onCopiar: () => void;
}

export function AnswerField({ pregunta, valor, onChange, bloquearPegado, onPegar, onCopiar }: Props) {
  const spec = tipoSpec(pregunta.tipo);
  if (!spec || spec.kind !== "pregunta") return null;

  const config = pregunta.configuracion;
  const seleccionadas = valor?.opciones ?? [];

  /** Eventos de portapapeles comunes a todos los campos de texto. */
  const manejadores = {
    onPaste: (evento: React.ClipboardEvent) => {
      const texto = evento.clipboardData.getData("text");
      onPegar(texto.length);
      if (bloquearPegado) evento.preventDefault();
    },
    onCopy: () => onCopiar(),
  };

  switch (spec.expects) {
    case "opcion":
    case "opciones": {
      const multiple = spec.expects === "opciones";
      const maximo = Number(config.maximoSelecciones ?? 0);
      if (pregunta.tipo === "desplegable") {
        return (
          <select
            value={seleccionadas[0] ?? ""}
            onChange={(e) => onChange({ opciones: e.target.value ? [e.target.value] : [] })}
            className="w-full rounded-2xl fill-soft px-3.5 py-2.5 text-sm text-ink outline-none ring-1 ring-[color:var(--hairline)] focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <option value="">Elige una opción…</option>
            {pregunta.opciones.map((opcion) => (
              <option key={opcion.id} value={opcion.id}>
                {textoPlano(opcion.texto)}
              </option>
            ))}
          </select>
        );
      }
      const conImagen = pregunta.tipo === "opcion_imagen";
      return (
        <div className={conImagen ? "grid gap-2 sm:grid-cols-3" : "flex flex-col gap-1.5"}>
          {pregunta.opciones.map((opcion) => {
            const activa = seleccionadas.includes(opcion.id);
            return (
              <motion.button
                key={opcion.id}
                type="button"
                whileTap={{ scale: 0.985 }}
                onClick={() => {
                  if (!multiple) {
                    onChange({ opciones: activa ? [] : [opcion.id] });
                    return;
                  }
                  const siguiente = activa
                    ? seleccionadas.filter((id) => id !== opcion.id)
                    : [...seleccionadas, opcion.id];
                  if (!activa && maximo > 0 && siguiente.length > maximo) return;
                  onChange({ opciones: siguiente });
                }}
                aria-pressed={activa}
                className={`flex items-start gap-2.5 rounded-2xl px-3.5 py-2.5 text-left ring-1 transition-all duration-200 ${
                  activa
                    ? "bg-cyan-500/15 ring-cyan-400/50"
                    : "fill-soft ring-[color:var(--hairline)] hover:bg-cyan-500/5 hover:ring-cyan-400/30"
                }`}
              >
                <span
                  className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center border transition-all ${
                    multiple ? "rounded" : "rounded-full"
                  } ${activa ? "border-cyan-400 bg-cyan-500" : "border-[color:var(--hairline)] bg-[color:var(--fill-2)]"}`}
                >
                  {activa && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                <span className="min-w-0 flex-1">
                  {opcion.imagenUrl && (
                    <img
                      src={opcion.imagenUrl}
                      alt=""
                      className="mb-1.5 h-28 w-full rounded-xl object-cover ring-1 ring-[color:var(--hairline)]"
                    />
                  )}
                  <RichText doc={opcion.texto} compacto />
                </span>
              </motion.button>
            );
          })}
          {multiple && maximo > 0 && (
            <p className="text-[0.7rem] text-ink-faint">Puedes elegir hasta {maximo} opciones.</p>
          )}
        </div>
      );
    }

    case "escala": {
      if (pregunta.tipo === "estrellas") {
        const total = Number(config.estrellas ?? 5);
        const actual = Number(valor?.valor ?? 0);
        return (
          <div className="flex items-center gap-1">
            {Array.from({ length: total }, (_, i) => i + 1).map((punto) => (
              <button
                key={punto}
                type="button"
                onClick={() => onChange({ valor: punto })}
                aria-label={`${punto} de ${total}`}
                className="transition-transform hover:scale-110"
              >
                <Star
                  className={`h-7 w-7 ${punto <= actual ? "fill-amber-400 text-amber-400" : "text-ink-faint"}`}
                />
              </button>
            ))}
          </div>
        );
      }
      const minimo = Number(config.minimo ?? 1);
      const maximo = Number(config.maximo ?? 5);
      const paso = Number(config.paso ?? 1);
      if (pregunta.tipo === "deslizador") {
        const actual = Number(valor?.valor ?? minimo);
        return (
          <div className="flex flex-col gap-1.5">
            <input
              type="range"
              min={minimo}
              max={maximo}
              step={paso}
              value={actual}
              onChange={(e) => onChange({ valor: Number(e.target.value) })}
              className="w-full accent-cyan-500"
            />
            <div className="flex justify-between text-xs text-ink-faint">
              <span>{String(config.etiquetaMinimo ?? minimo)}</span>
              <span className="font-black text-ink">{actual}</span>
              <span>{String(config.etiquetaMaximo ?? maximo)}</span>
            </div>
          </div>
        );
      }
      const puntos: number[] = [];
      for (let p = minimo; p <= maximo && puntos.length < 21; p += paso) puntos.push(p);
      return (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            {puntos.map((punto) => {
              const activo = Number(valor?.valor) === punto;
              return (
                <button
                  key={punto}
                  type="button"
                  onClick={() => onChange({ valor: punto })}
                  aria-pressed={activo}
                  className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold ring-1 transition-all ${
                    activo
                      ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white ring-white/25"
                      : "fill-soft text-ink-soft ring-[color:var(--hairline)] hover:ring-cyan-400/40"
                  }`}
                >
                  {punto}
                </button>
              );
            })}
          </div>
          {Boolean(config.etiquetaMinimo || config.etiquetaMaximo) && (
            <div className="flex justify-between text-[0.7rem] text-ink-faint">
              <span>{String(config.etiquetaMinimo ?? "")}</span>
              <span>{String(config.etiquetaMaximo ?? "")}</span>
            </div>
          )}
        </div>
      );
    }

    case "matriz": {
      const columnas = (config.columnasMatriz as string[] | undefined) ?? [];
      const multiple = spec.multiple === true;
      const mapa = (valor?.valor ?? {}) as Record<string, string | string[]>;
      return (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-sm">
            <thead>
              <tr>
                <th />
                {columnas.map((columna) => (
                  <th key={columna} className="px-2 pb-2 text-center text-[0.7rem] font-bold text-ink-soft">
                    {columna}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pregunta.opciones.map((fila) => (
                <tr key={fila.id} className="border-t border-[color:var(--hairline)]">
                  <td className="py-2 pr-3">
                    <RichText doc={fila.texto} compacto />
                  </td>
                  {columnas.map((columna) => {
                    const actual = mapa[fila.id];
                    const activa = multiple
                      ? Array.isArray(actual) && actual.includes(columna)
                      : actual === columna;
                    return (
                      <td key={columna} className="px-2 py-2 text-center">
                        <button
                          type="button"
                          aria-pressed={activa}
                          aria-label={`${textoPlano(fila.texto)}: ${columna}`}
                          onClick={() => {
                            const siguiente = { ...mapa };
                            if (multiple) {
                              const lista = Array.isArray(actual) ? [...actual] : [];
                              siguiente[fila.id] = activa
                                ? lista.filter((c) => c !== columna)
                                : [...lista, columna];
                            } else {
                              siguiente[fila.id] = activa ? "" : columna;
                            }
                            onChange({ valor: siguiente });
                          }}
                          className={`h-4 w-4 border transition-all ${multiple ? "rounded" : "rounded-full"} ${
                            activa
                              ? "border-cyan-400 bg-cyan-500"
                              : "border-[color:var(--hairline)] bg-[color:var(--fill-2)] hover:border-cyan-400/60"
                          }`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "orden": {
      const orden: string[] = Array.isArray(valor?.valor)
        ? (valor?.valor as string[])
        : pregunta.opciones.map((opcion) => opcion.id);
      const mover = (desde: number, hacia: number) => {
        if (hacia < 0 || hacia >= orden.length) return;
        const siguiente = [...orden];
        const [movido] = siguiente.splice(desde, 1);
        siguiente.splice(hacia, 0, movido);
        onChange({ valor: siguiente });
      };
      return (
        <ol className="flex flex-col gap-1.5">
          {orden.map((id, indice) => {
            const opcion = pregunta.opciones.find((o) => o.id === id);
            if (!opcion) return null;
            return (
              <li
                key={id}
                className="flex items-center gap-2 rounded-2xl fill-soft px-3 py-2 ring-1 ring-[color:var(--hairline)]"
              >
                <GripVertical className="h-4 w-4 shrink-0 text-ink-faint" />
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-cyan-500/15 text-xs font-black text-accent">
                  {indice + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <RichText doc={opcion.texto} compacto />
                </span>
                <span className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    onClick={() => mover(indice, indice - 1)}
                    disabled={indice === 0}
                    aria-label="Subir"
                    className="px-1 text-ink-soft disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => mover(indice, indice + 1)}
                    disabled={indice === orden.length - 1}
                    aria-label="Bajar"
                    className="px-1 text-ink-soft disabled:opacity-30"
                  >
                    ▼
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      );
    }

    case "emparejamiento":
    case "clasificacion": {
      const mapa = (valor?.valor ?? {}) as Record<string, string>;
      const destinos: string[] =
        spec.expects === "clasificacion"
          ? ((config.grupos as string[] | undefined) ?? [])
          : // En emparejar, las parejas posibles son las claves del propio banco,
            // que el servidor no revela. Se piden por texto libre.
            [];
      return (
        <ul className="flex flex-col gap-1.5">
          {pregunta.opciones.map((opcion) => (
            <li key={opcion.id} className="flex flex-wrap items-center gap-2 rounded-2xl fill-soft px-3 py-2 ring-1 ring-[color:var(--hairline)]">
              <span className="min-w-0 flex-1">
                <RichText doc={opcion.texto} compacto />
              </span>
              {destinos.length > 0 ? (
                <select
                  value={mapa[opcion.id] ?? ""}
                  onChange={(e) => onChange({ valor: { ...mapa, [opcion.id]: e.target.value } })}
                  className="rounded-xl fill-softer px-2.5 py-1.5 text-xs text-ink ring-1 ring-[color:var(--hairline)]"
                >
                  <option value="">Elige…</option>
                  {destinos.map((destino) => (
                    <option key={destino} value={destino}>
                      {destino}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={mapa[opcion.id] ?? ""}
                  onChange={(e) => onChange({ valor: { ...mapa, [opcion.id]: e.target.value } })}
                  {...manejadores}
                  placeholder="Su pareja"
                  className="w-40 rounded-xl fill-softer px-2.5 py-1.5 text-xs text-ink ring-1 ring-[color:var(--hairline)]"
                />
              )}
            </li>
          ))}
        </ul>
      );
    }

    case "huecos": {
      const textoBase = (config.huecosTexto as string | undefined) ?? "";
      const mapa = (valor?.valor ?? {}) as Record<string, string>;
      // Los huecos se detectan por el texto del enunciado: tantos campos como
      // grupos de «___» haya. Las claves las decide el autor y el servidor solo
      // compara las que él definió.
      const total = Math.max(1, (textoBase.match(/_{2,}/g) ?? []).length || contarHuecos(pregunta));
      return (
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: total }, (_, i) => `h${i + 1}`).map((clave, indice) => (
            <label key={clave} className="flex items-center gap-2 text-sm">
              <span className="w-16 shrink-0 text-xs font-bold text-ink-faint">Hueco {indice + 1}</span>
              <input
                value={mapa[clave] ?? ""}
                onChange={(e) => onChange({ valor: { ...mapa, [clave]: e.target.value } })}
                {...manejadores}
                className="flex-1 rounded-2xl fill-soft px-3 py-2 text-sm text-ink outline-none ring-1 ring-[color:var(--hairline)] focus-visible:ring-2 focus-visible:ring-cyan-300"
              />
            </label>
          ))}
        </div>
      );
    }

    case "numero": {
      return (
        <div className="flex items-center gap-2">
          {Boolean(config.prefijo) && <span className="text-sm text-ink-soft">{String(config.prefijo)}</span>}
          <input
            type="number"
            inputMode="decimal"
            min={config.minimo === undefined ? undefined : Number(config.minimo)}
            max={config.maximo === undefined ? undefined : Number(config.maximo)}
            step={config.paso === undefined ? "any" : Number(config.paso)}
            value={valor?.valor === undefined || valor?.valor === null ? "" : String(valor.valor)}
            onChange={(e) => onChange({ valor: e.target.value === "" ? null : Number(e.target.value) })}
            {...manejadores}
            className="w-48 rounded-2xl fill-soft px-3.5 py-2.5 text-sm text-ink outline-none ring-1 ring-[color:var(--hairline)] focus-visible:ring-2 focus-visible:ring-cyan-300"
          />
          {Boolean(config.sufijo || config.moneda) && (
            <span className="text-sm text-ink-soft">{String(config.sufijo ?? config.moneda)}</span>
          )}
        </div>
      );
    }

    case "fecha":
    case "hora": {
      const tipoInput =
        pregunta.tipo === "hora" ? "time" : pregunta.tipo === "fecha_hora" ? "datetime-local" : "date";
      return (
        <input
          type={tipoInput}
          value={String(valor?.valor ?? "")}
          onChange={(e) => onChange({ valor: e.target.value })}
          className="w-56 rounded-2xl fill-soft px-3.5 py-2.5 text-sm text-ink outline-none ring-1 ring-[color:var(--hairline)] focus-visible:ring-2 focus-visible:ring-cyan-300"
        />
      );
    }

    case "archivo": {
      return (
        <div className="flex flex-col gap-1.5">
          <input
            type="url"
            value={String(valor?.valor ?? "")}
            onChange={(e) => onChange({ valor: e.target.value })}
            {...manejadores}
            placeholder="https://… (enlace a tu archivo)"
            className="w-full rounded-2xl fill-soft px-3.5 py-2.5 text-sm text-ink outline-none ring-1 ring-[color:var(--hairline)] focus-visible:ring-2 focus-visible:ring-cyan-300"
          />
          <p className="text-[0.7rem] text-ink-faint">
            {String(config.ayudaArchivo ?? "Comparte el enlace con permiso de lectura.")}
          </p>
        </div>
      );
    }

    case "texto":
    default: {
      const filas = pregunta.tipo === "codigo" ? Number(config.lineasCodigo ?? 10) : Number(config.lineas ?? 0);
      if (pregunta.tipo === "texto_largo" || pregunta.tipo === "codigo" || filas > 1) {
        return (
          <TextoLargo
            valor={String(valor?.valor ?? "")}
            filas={filas || 5}
            mono={pregunta.tipo === "codigo"}
            marcador={String(config.marcador ?? "")}
            maximo={config.maximoCaracteres === undefined ? undefined : Number(config.maximoCaracteres)}
            onChange={(texto) => onChange({ valor: texto })}
            manejadores={manejadores}
          />
        );
      }
      const tipoInput = pregunta.tipo === "correo" ? "email" : pregunta.tipo === "telefono" ? "tel" : pregunta.tipo === "enlace" ? "url" : "text";
      return (
        <input
          type={tipoInput}
          value={String(valor?.valor ?? "")}
          onChange={(e) => onChange({ valor: e.target.value })}
          {...manejadores}
          placeholder={String(config.marcador ?? "")}
          maxLength={config.maximoCaracteres === undefined ? undefined : Number(config.maximoCaracteres)}
          className="w-full rounded-2xl fill-soft px-3.5 py-2.5 text-sm text-ink outline-none ring-1 ring-[color:var(--hairline)] focus-visible:ring-2 focus-visible:ring-cyan-300"
        />
      );
    }
  }
}

function TextoLargo({
  valor,
  filas,
  mono,
  marcador,
  maximo,
  onChange,
  manejadores,
}: {
  valor: string;
  filas: number;
  mono: boolean;
  marcador: string;
  maximo?: number;
  onChange: (texto: string) => void;
  manejadores: { onPaste: (e: React.ClipboardEvent) => void; onCopy: () => void };
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <textarea
        id={id}
        value={valor}
        rows={filas}
        maxLength={maximo}
        placeholder={marcador}
        onChange={(e) => onChange(e.target.value)}
        {...manejadores}
        className={`w-full resize-y rounded-2xl fill-soft px-3.5 py-2.5 text-sm text-ink outline-none ring-1 ring-[color:var(--hairline)] focus-visible:ring-2 focus-visible:ring-cyan-300 ${
          mono ? "font-mono text-xs" : ""
        }`}
      />
      <div className="flex justify-end text-[0.65rem] text-ink-faint">
        {valor.length} caracteres{maximo ? ` de ${maximo}` : ""}
      </div>
    </div>
  );
}

function contarHuecos(pregunta: PreguntaPublica): number {
  let total = 0;
  for (const bloque of pregunta.enunciado.b ?? []) {
    for (const span of bloque.s ?? []) {
      total += (span.x.match(/_{2,}/g) ?? []).length;
    }
  }
  return total || 1;
}

function textoPlano(doc: unknown): string {
  const documento = doc as { b?: { s?: { x: string }[] }[] };
  return (documento.b ?? []).map((bloque) => (bloque.s ?? []).map((span) => span.x).join("")).join(" ");
}
