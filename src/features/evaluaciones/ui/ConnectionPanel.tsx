/**
 * Panel de conexión y diagnóstico.
 *
 * Es la pantalla que sustituye a las cinco variables de entorno y a la frase de
 * acceso. Hace tres cosas y ninguna más:
 *
 *   1. deja configurar el modo, la URL del Web App y la llave, y las prueba en
 *      el momento con `ping`;
 *   2. muestra el estado real del backend: versión, esquema, si está instalado y
 *      en qué modo de autorización opera;
 *   3. permite instalar o reparar la estructura del libro y ver el diagnóstico
 *      completo con sus hallazgos y sus remedios, sin salir del ATS.
 *
 * Que todo esto sea visible es el punto. La incidencia típica del módulo anterior
 * era «no funciona» sin manera de saber si faltaba una hoja, si la URL era otra o
 * si la llave no coincidía.
 */

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Info,
  Link as LinkIcon,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  Wrench,
  XCircle,
} from "lucide-react";
import { toast } from "../../../design-system/liquid-glass/toast";
import { Field, TextInput } from "../../../design-system/liquid-glass/fields";
import {
  AVISO_CONFIGURACION,
  conexionStore,
  guardarConexion,
  problemaDeConexion,
  type ModoBackend,
} from "../api/connection";
import { diagnosticar, instalar, ping } from "../api/client";
import type { Diagnostico, EstadoBackend, Hallazgo } from "../domain/model";
import {
  BotonPrimario,
  BotonSecundario,
  GlassPanel,
  Metrica,
  Pill,
  SectionTitle,
  formatearFecha,
} from "./pieces";

const ICONO_SEVERIDAD: Record<Hallazgo["severidad"], typeof Info> = {
  critico: XCircle,
  alto: ShieldAlert,
  medio: AlertTriangle,
  info: Info,
};

const TONO_SEVERIDAD: Record<Hallazgo["severidad"], string> = {
  critico: "border-rose-400/40 bg-rose-500/10 tone-text-peligro",
  alto: "border-amber-400/40 bg-amber-500/10 tone-text-aviso",
  medio: "border-cyan-400/30 bg-cyan-500/10 text-accent",
  info: "border-[color:var(--hairline)] bg-[color:var(--fill-1)] text-ink-soft",
};

const ETIQUETA_SEVERIDAD: Record<Hallazgo["severidad"], string> = {
  critico: "Crítico",
  alto: "Atención",
  medio: "Revisar",
  info: "Información",
};

export function ConnectionPanel({ onCambio }: { onCambio?: () => void }) {
  const conexion = conexionStore.use();
  const [modo, setModo] = useState<ModoBackend>(conexion.modo);
  const [url, setUrl] = useState(conexion.url);
  const [llave, setLlave] = useState(conexion.llave);
  const [probando, setProbando] = useState(false);
  const [estado, setEstado] = useState<EstadoBackend | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [errorPrueba, setErrorPrueba] = useState<{ mensaje: string; pista: string } | null>(null);
  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null);
  const [diagnosticando, setDiagnosticando] = useState(false);
  const [instalando, setInstalando] = useState(false);

  const problema = problemaDeConexion({ ...conexion, modo, url, llave });

  /** Guarda y prueba en un solo paso: separar las dos cosas solo añade un clic. */
  const probar = useCallback(
    async (silencioso = false) => {
      guardarConexion({ modo, url: url.trim(), llave: llave.trim() });
      setProbando(true);
      setErrorPrueba(null);
      const res = await ping();
      setProbando(false);
      if (!res.ok) {
        setEstado(null);
        setErrorPrueba({ mensaje: res.error.message, pista: res.error.pista ?? "" });
        if (!silencioso) toast.error(res.error.message);
        return;
      }
      setEstado(res.value.datos);
      setAvisos(res.value.avisos);
      guardarConexion({ verificadoEn: new Date().toISOString() });
      if (!silencioso) {
        toast.success(
          res.value.datos?.instalado
            ? `Conectado con ${res.value.datos.servicio} ${res.value.datos.version}.`
            : "El backend responde, pero el libro todavía no está instalado.",
        );
      }
      onCambio?.();
    },
    [llave, modo, onCambio, url],
  );

  // Una comprobación al abrir el panel evita que alguien mire una configuración
  // guardada sin saber si sigue siendo válida.
  useEffect(() => {
    void probar(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ejecutarInstalacion = async () => {
    setInstalando(true);
    const res = await instalar();
    setInstalando(false);
    if (!res.ok) {
      toast.error(res.error.message);
      setErrorPrueba({ mensaje: res.error.message, pista: res.error.pista ?? "" });
      return;
    }
    const creadas = res.value.acciones.filter((a) => a.action === "creada").length;
    const reparadas = res.value.acciones.filter((a) => a.action === "columnas añadidas").length;
    toast.success(
      creadas === 0 && reparadas === 0
        ? "La estructura ya estaba completa."
        : `Estructura lista: ${creadas} hoja(s) creada(s) y ${reparadas} reparada(s).`,
    );
    await probar(true);
    onCambio?.();
  };

  const ejecutarDiagnostico = async (profundo: boolean) => {
    setDiagnosticando(true);
    const res = await diagnosticar(profundo);
    setDiagnosticando(false);
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    setDiagnostico(res.value);
  };

  return (
    <div className="flex flex-col gap-4">
      {AVISO_CONFIGURACION && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-xs tone-text-aviso">
          {AVISO_CONFIGURACION}
        </div>
      )}

      <GlassPanel>
        <SectionTitle
          titulo="Origen de datos"
          descripcion="Se configura una vez y queda guardado en este navegador. No hay variables de entorno ni frases de acceso."
        />

        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          <OpcionModo
            activa={modo === "apps-script"}
            titulo="Backend de Apps Script"
            descripcion="El libro de cálculo real, con auditoría, resultados compartidos y todo el diagnóstico."
            icono={<Database className="h-4 w-4" />}
            onClick={() => setModo("apps-script")}
          />
          <OpcionModo
            activa={modo === "demostracion"}
            titulo="Demostración local"
            descripcion="Todo funciona en este navegador, sin desplegar nada. Los datos no se comparten."
            icono={<Info className="h-4 w-4" />}
            onClick={() => setModo("demostracion")}
          />
        </div>

        <AnimatePresence initial={false}>
          {modo === "apps-script" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="grid gap-3 pb-1">
                <Field
                  label="Dirección del Web App"
                  htmlFor="ev-url"
                  hint="La URL del despliegue, la que termina en /exec. No la del editor ni la que acaba en /dev."
                  error={problema || null}
                >
                  <TextInput
                    id="ev-url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/AKfycb…/exec"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </Field>
                <Field
                  label="Llave de administración"
                  htmlFor="ev-llave"
                  hint="El valor de la propiedad EV_ADMIN_KEY del script. Genérala desde el libro: Evaluaciones → Generar llave. Déjala vacía si el script aún no tiene llave."
                >
                  <TextInput
                    id="ev-llave"
                    value={llave}
                    onChange={(e) => setLlave(e.target.value)}
                    placeholder="Pega aquí la llave"
                    spellCheck={false}
                    autoComplete="off"
                    type="password"
                  />
                </Field>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <BotonPrimario onClick={() => void probar()} disabled={probando}>
            {probando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Guardar y probar
          </BotonPrimario>
          {modo === "apps-script" && (
            <>
              <BotonSecundario onClick={() => void ejecutarInstalacion()} disabled={instalando || probando}>
                {instalando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                Instalar o reparar
              </BotonSecundario>
              <BotonSecundario onClick={() => void ejecutarDiagnostico(false)} disabled={diagnosticando}>
                {diagnosticando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
                Diagnóstico
              </BotonSecundario>
              <BotonSecundario onClick={() => void ejecutarDiagnostico(true)} disabled={diagnosticando}>
                Diagnóstico profundo
              </BotonSecundario>
            </>
          )}
          {conexion.verificadoEn && (
            <span className="text-[0.7rem] text-ink-faint">
              Última comprobación correcta: {formatearFecha(conexion.verificadoEn)}
            </span>
          )}
        </div>
      </GlassPanel>

      {errorPrueba && (
        <GlassPanel className="border border-rose-400/40 bg-rose-500/5">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 tone-text-peligro" />
            <div>
              <p className="text-sm font-bold tone-text-peligro">{errorPrueba.mensaje}</p>
              {errorPrueba.pista && <p className="mt-1 text-xs text-rose-100/90">{errorPrueba.pista}</p>}
            </div>
          </div>
        </GlassPanel>
      )}

      {estado && (
        <GlassPanel>
          <SectionTitle
            titulo="Estado del backend"
            accion={
              estado.instalado ? (
                <Pill tono="exito">
                  <ShieldCheck className="h-3 w-3" /> Operativo
                </Pill>
              ) : (
                <Pill tono="aviso">Falta instalar la estructura</Pill>
              )
            }
          />
          <div className="flex flex-wrap gap-2">
            <Metrica etiqueta="Servicio" valor={estado.servicio} />
            <Metrica etiqueta="Versión" valor={estado.version} />
            <Metrica etiqueta="Esquema" valor={estado.esquema} />
            <Metrica etiqueta="Tipos de pregunta" valor={estado.tiposSoportados} />
            <Metrica etiqueta="Autorización" valor={estado.autorizacion.modo === "llave" ? "Con llave" : "Abierta"} />
            {estado.conteos && (
              <>
                <Metrica etiqueta="Evaluaciones" valor={estado.conteos.evaluaciones} />
                <Metrica etiqueta="Intentos" valor={estado.conteos.intentos} />
              </>
            )}
          </div>
          {estado.libro && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-soft">
              <LinkIcon className="h-3.5 w-3.5" />
              Libro: <strong className="font-semibold text-ink">{estado.libro.nombre}</strong>
            </p>
          )}
          {avisos.includes("ADMIN_SIN_LLAVE") && (
            <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs tone-text-aviso">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                La administración está abierta: cualquiera que conozca la URL puede crear y publicar evaluaciones.
                Genera la llave desde el libro (menú <strong>Evaluaciones → Generar llave de administración</strong>) y
                pégala arriba.
              </span>
            </div>
          )}
          {!estado.autorizacion.secretoIntentos && (
            <div className="mt-2 flex items-start gap-2 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs tone-text-peligro">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Falta el secreto de firma de intentos: ningún candidato podrá empezar una prueba. Pulsa
                <strong> Instalar o reparar</strong>, que lo genera solo.
              </span>
            </div>
          )}
        </GlassPanel>
      )}

      {diagnostico && <DiagnosticoDetalle diagnostico={diagnostico} />}
    </div>
  );
}

function OpcionModo({
  activa,
  titulo,
  descripcion,
  icono,
  onClick,
}: {
  activa: boolean;
  titulo: string;
  descripcion: string;
  icono: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={`flex flex-col gap-1 rounded-2xl px-4 py-3 text-left ring-1 transition-all duration-300 ${
        activa
          ? "bg-cyan-500/15 ring-cyan-400/40"
          : "fill-softer ring-[color:var(--hairline)] hover:fill-soft"
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-bold text-ink">
        {icono}
        {titulo}
        {activa && <CheckCircle2 className="ml-auto h-4 w-4 text-accent" />}
      </span>
      <span className="text-xs text-ink-soft">{descripcion}</span>
    </button>
  );
}

function DiagnosticoDetalle({ diagnostico }: { diagnostico: Diagnostico }) {
  const tono =
    diagnostico.estado === "critico"
      ? "peligro"
      : diagnostico.estado === "atencion"
        ? "aviso"
        : diagnostico.estado === "aceptable"
          ? "info"
          : "exito";
  return (
    <GlassPanel>
      <SectionTitle
        titulo="Diagnóstico"
        descripcion={`Generado el ${formatearFecha(diagnostico.generadoEn)}. Cada hallazgo incluye el paso concreto para resolverlo.`}
        accion={<Pill tono={tono as "peligro" | "aviso" | "info" | "exito"}>{diagnostico.estado.toUpperCase()}</Pill>}
      />

      {diagnostico.rendimiento && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Metrica etiqueta="Lectura de hojas" valor={diagnostico.rendimiento.lecturaMs} sufijo="ms" />
          <Metrica etiqueta="Filas leídas" valor={diagnostico.rendimiento.filasLeidas} />
          <Metrica
            etiqueta="Caché"
            valor={diagnostico.rendimiento.cacheDisponible ? "Disponible" : "No disponible"}
          />
        </div>
      )}

      {diagnostico.conteos && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {Object.entries(diagnostico.conteos).map(([hoja, filas]) => (
            <Pill key={hoja} tono="neutral" punto={false}>
              {hoja}: <strong className="ml-1 tabular-nums">{filas}</strong>
            </Pill>
          ))}
        </div>
      )}

      {diagnostico.hallazgos.length === 0 ? (
        <p className="flex items-center gap-2 text-sm tone-text-exito">
          <CheckCircle2 className="h-4 w-4" /> Sin hallazgos. Todo en orden.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {diagnostico.hallazgos.map((hallazgo) => {
            const Icono = ICONO_SEVERIDAD[hallazgo.severidad];
            return (
              <li
                key={hallazgo.codigo + hallazgo.titulo}
                className={`rounded-2xl border px-4 py-3 ${TONO_SEVERIDAD[hallazgo.severidad]}`}
              >
                <div className="flex items-start gap-2.5">
                  <Icono className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold">
                      <span className="mr-2 rounded-full bg-black/20 px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-wide">
                        {ETIQUETA_SEVERIDAD[hallazgo.severidad]}
                      </span>
                      {hallazgo.titulo}
                    </p>
                    <p className="mt-1 text-xs opacity-90">{hallazgo.detalle}</p>
                    <p className="mt-1.5 text-xs font-semibold">→ {hallazgo.remedio}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {diagnostico.esquema && diagnostico.esquema.sheets.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-ink-soft">
            Estructura del libro ({diagnostico.esquema.sheets.length} hojas)
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-ink-faint">
                <tr>
                  <th className="py-1 pr-3 font-bold">Hoja</th>
                  <th className="py-1 pr-3 font-bold">Filas</th>
                  <th className="py-1 pr-3 font-bold">Faltan</th>
                  <th className="py-1 font-bold">Para qué sirve</th>
                </tr>
              </thead>
              <tbody className="text-ink-soft">
                {diagnostico.esquema.sheets.map((hoja) => (
                  <tr key={hoja.sheet} className="border-t border-[color:var(--hairline)]">
                    <td className="py-1.5 pr-3 font-mono text-[0.7rem] text-ink">{hoja.sheet}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{hoja.dataRows}</td>
                    <td className="py-1.5 pr-3">
                      {hoja.missingColumns.length === 0 ? (
                        <span className="tone-text-exito">—</span>
                      ) : (
                        <span className="tone-text-peligro">{hoja.missingColumns.join(", ")}</span>
                      )}
                    </td>
                    <td className="py-1.5">{hoja.describe}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </GlassPanel>
  );
}
