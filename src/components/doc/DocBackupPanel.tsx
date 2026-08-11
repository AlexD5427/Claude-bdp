/**
 * DocBackupPanel.tsx — sacar los datos y volver a meterlos.
 *
 * El orden de los botones no es casual. El primero es «rescatar del navegador»
 * porque es el caso que hay que resolver hoy: la persona trabajó meses con el
 * módulo sin backend y todo eso vive en el `localStorage` de su equipo. Pedirle
 * que exporte un archivo para volver a subirlo acto seguido sería un rodeo
 * absurdo teniendo el dato al alcance.
 *
 * La importación nunca aplica nada sin enseñar antes el recuento. Sobrescribir
 * expedientes por accidente es justo lo que este panel debe evitar.
 */

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Database,
  Download,
  FileSpreadsheet,
  HardDrive,
  Loader2,
  Upload,
} from "lucide-react";
import {
  analizarArchivo,
  aplicarImportacion,
  exportarCsv,
  exportarEspejo,
  rescatarDeLocalStorage,
  type AnalisisImportacion,
} from "../../lib/doc/docBackup";
import { useDocStore, type ModoImportacion } from "../../lib/docStore";
import { ProgressBar, useDocMotion } from "./DocMotion";

const MODOS: { id: ModoImportacion; titulo: string; detalle: string }[] = [
  {
    id: "fusionar",
    titulo: "Fusionar",
    detalle: "Añade los nuevos y actualiza los que ya existen.",
  },
  {
    id: "solo_nuevos",
    titulo: "Solo nuevos",
    detalle: "No toca ningún expediente existente.",
  },
  {
    id: "reemplazar",
    titulo: "Reemplazar todo",
    detalle: "Borra lo actual y deja solo el contenido del archivo.",
  },
];

type Resultado = {
  tono: "ok" | "error";
  titulo: string;
  detalle: string;
};

export default function DocBackupPanel() {
  const { dossiers, settings } = useDocStore();
  const m = useDocMotion();
  const inputRef = useRef<HTMLInputElement>(null);

  const [analisis, setAnalisis] = useState<AnalisisImportacion | null>(null);
  const [modo, setModo] = useState<ModoImportacion>("fusionar");
  const [subir, setSubir] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const total = Object.keys(dossiers).length;

  const exportarJson = () => {
    const r = exportarEspejo(true);
    setResultado({
      tono: "ok",
      titulo: "Copia descargada",
      detalle: `${r.total} expediente(s) en ${r.nombre}`,
    });
  };

  const exportarHoja = () => {
    const r = exportarCsv(settings.intervalDays);
    setResultado({
      tono: "ok",
      titulo: "CSV descargado",
      detalle: `${r.total} fila(s) en ${r.nombre}. Se abre en Excel con las columnas del libro.`,
    });
  };

  const rescatar = () => {
    const a = rescatarDeLocalStorage();
    if (!a) {
      setResultado({
        tono: "error",
        titulo: "No se encontraron datos antiguos",
        detalle:
          "No hay nada guardado con las claves conocidas en este navegador. Si trabajaste en otro equipo, exporta allí el archivo y súbelo aquí.",
      });
      return;
    }
    setAnalisis(a);
    setResultado(null);
  };

  const elegirArchivo = async (file: File | undefined) => {
    if (!file) return;
    setTrabajando(true);
    setResultado(null);
    try {
      const a = await analizarArchivo(file);
      setAnalisis(a);
      if (!a.ok) {
        setResultado({
          tono: "error",
          titulo: "No se pudo leer",
          detalle: a.error || "Formato no reconocido.",
        });
      }
    } finally {
      setTrabajando(false);
    }
  };

  const confirmar = async () => {
    if (!analisis) return;
    setTrabajando(true);
    try {
      const r = await aplicarImportacion(analisis, modo, subir);
      setResultado({
        tono: r.error ? "error" : "ok",
        titulo: r.error ? "Importado solo aquí" : "Importación completada",
        detalle: r.error
          ? `${r.aplicados} expediente(s) guardados en este equipo, pero no se pudieron subir: ${r.error}`
          : `${r.aplicados} aplicado(s)${r.omitidos ? `, ${r.omitidos} omitido(s)` : ""}${
              r.subidos ? `, ${r.subidos} subido(s) al libro` : ""
            }.`,
      });
      setAnalisis(null);
      if (inputRef.current) inputRef.current.value = "";
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Exportar ------------------------------------------------------ */}
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Descargar una copia
        </h4>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          Copia exacta de los {total} expediente(s) que hay ahora mismo en este equipo.
        </p>

        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
          <motion.button
            type="button"
            onClick={exportarJson}
            disabled={!total}
            whileHover={m.activo && total ? { scale: 1.01 } : undefined}
            whileTap={m.activo && total ? { scale: 0.985 } : undefined}
            className="flex items-center gap-2.5 rounded-xl fill-soft px-3 py-2.5 text-left ring-1 ring-[color:var(--hairline)] transition hover:fill-softer disabled:opacity-40"
          >
            <Download size={15} className="shrink-0 text-[#00b0d8]" />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-ink">Espejo completo (.json)</span>
              <span className="block text-[11px] text-ink-faint">
                Incluye checklist, observaciones y avisos.
              </span>
            </span>
          </motion.button>

          <motion.button
            type="button"
            onClick={exportarHoja}
            disabled={!total}
            whileHover={m.activo && total ? { scale: 1.01 } : undefined}
            whileTap={m.activo && total ? { scale: 0.985 } : undefined}
            className="flex items-center gap-2.5 rounded-xl fill-soft px-3 py-2.5 text-left ring-1 ring-[color:var(--hairline)] transition hover:fill-softer disabled:opacity-40"
          >
            <FileSpreadsheet size={15} className="shrink-0 text-emerald-500" />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-ink">Planilla (.csv)</span>
              <span className="block text-[11px] text-ink-faint">
                Mismas columnas que el libro, para Excel.
              </span>
            </span>
          </motion.button>
        </div>
      </section>

      <div className="h-px bg-[color:var(--hairline)]" />

      {/* Importar ------------------------------------------------------ */}
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Traer datos
        </h4>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          Recupera lo registrado antes de conectar el libro, o restaura una copia descargada.
        </p>

        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
          <motion.button
            type="button"
            onClick={rescatar}
            whileHover={m.activo ? { scale: 1.01 } : undefined}
            whileTap={m.activo ? { scale: 0.985 } : undefined}
            className="flex items-center gap-2.5 rounded-xl fill-soft px-3 py-2.5 text-left ring-1 ring-[color:var(--hairline)] transition hover:fill-softer"
          >
            <HardDrive size={15} className="shrink-0 text-amber-500" />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-ink">Rescatar de este navegador</span>
              <span className="block text-[11px] text-ink-faint">
                Busca el trabajo previo sin conexión.
              </span>
            </span>
          </motion.button>

          <motion.button
            type="button"
            onClick={() => inputRef.current?.click()}
            whileHover={m.activo ? { scale: 1.01 } : undefined}
            whileTap={m.activo ? { scale: 0.985 } : undefined}
            className="flex items-center gap-2.5 rounded-xl fill-soft px-3 py-2.5 text-left ring-1 ring-[color:var(--hairline)] transition hover:fill-softer"
          >
            <Upload size={15} className="shrink-0 text-[#00b0d8]" />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-ink">Subir archivo</span>
              <span className="block text-[11px] text-ink-faint">Espejo .json descargado.</span>
            </span>
          </motion.button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json,.txt"
          className="hidden"
          onChange={(e) => void elegirArchivo(e.target.files?.[0])}
        />
      </section>

      {/* Previsualizacion --------------------------------------------- */}
      <AnimatePresence initial={false}>
        {analisis && analisis.ok && (
          <motion.section
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={m.suave}
            className="overflow-hidden"
          >
            <div className="rounded-2xl fill-soft p-3 ring-1 ring-[color:var(--hairline)]">
              <div className="flex items-center gap-2">
                <Database size={14} className="text-[#00b0d8]" />
                <p className="text-xs font-semibold text-ink">Se encontraron datos</p>
              </div>

              <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl fill-softer px-2 py-2">
                  <p className="text-base font-semibold text-ink">{analisis.validos.length}</p>
                  <p className="text-[10px] uppercase tracking-wide text-ink-faint">Legibles</p>
                </div>
                <div className="rounded-xl fill-softer px-2 py-2">
                  <p className="text-base font-semibold text-emerald-500">
                    {analisis.nuevos.length}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-ink-faint">Nuevos</p>
                </div>
                <div className="rounded-xl fill-softer px-2 py-2">
                  <p className="text-base font-semibold text-amber-500">
                    {analisis.existentes.length}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-ink-faint">Ya existen</p>
                </div>
              </div>

              <p className="mt-2 text-[11px] text-ink-faint">
                Origen:{" "}
                {analisis.formatoDetectado === "localStorage"
                  ? "almacenamiento del navegador"
                  : analisis.formatoDetectado === "espejo"
                    ? "espejo descargado"
                    : "lista de expedientes"}
                {analisis.anios.length ? ` · años ${analisis.anios.join(", ")}` : ""}
              </p>

              {analisis.descartados.length > 0 && (
                <p className="mt-1 text-[11px] text-amber-500">
                  {analisis.descartados.length} registro(s) se descartaron por estar incompletos.
                </p>
              )}

              {/* Modo */}
              <div className="mt-3 space-y-1.5">
                {MODOS.map((op) => (
                  <label
                    key={op.id}
                    className={`flex cursor-pointer items-start gap-2 rounded-xl px-2.5 py-2 ring-1 transition ${
                      modo === op.id
                        ? "fill-softer ring-[#00b0d8]/40"
                        : "ring-[color:var(--hairline)] hover:fill-softer"
                    }`}
                  >
                    <input
                      type="radio"
                      name="doc-import-modo"
                      className="mt-0.5"
                      checked={modo === op.id}
                      onChange={() => setModo(op.id)}
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-ink">{op.titulo}</span>
                      <span className="block text-[11px] text-ink-faint">{op.detalle}</span>
                    </span>
                  </label>
                ))}
              </div>

              {modo === "reemplazar" && (
                <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-rose-500/10 px-2.5 py-2 text-[11px] text-rose-400">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span>
                    Se eliminarán los {total} expediente(s) actuales de este equipo. Descarga
                    antes una copia si no estás seguro.
                  </span>
                </p>
              )}

              <label className="mt-2.5 flex items-center gap-2 text-[11px] text-ink-soft">
                <input
                  type="checkbox"
                  checked={subir}
                  onChange={(e) => setSubir(e.target.checked)}
                />
                Subir también al libro de Google
              </label>

              {trabajando && <ProgressBar indeterminado className="mt-2.5" />}

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void confirmar()}
                  disabled={trabajando}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#00b0d8] to-[#005baa] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {trabajando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Importar {analisis.validos.length}
                </button>
                <button
                  type="button"
                  onClick={() => setAnalisis(null)}
                  disabled={trabajando}
                  className="rounded-xl px-3 py-1.5 text-xs text-ink-soft transition hover:text-ink"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Resultado ----------------------------------------------------- */}
      <AnimatePresence initial={false}>
        {resultado && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={m.suave}
            className={`rounded-xl px-3 py-2.5 text-xs ${
              resultado.tono === "ok"
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-rose-500/10 text-rose-400"
            }`}
          >
            <p className="font-medium">{resultado.titulo}</p>
            <p className="mt-0.5 leading-relaxed opacity-90 wrap-words">{resultado.detalle}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
