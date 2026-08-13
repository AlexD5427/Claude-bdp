import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  ClipboardCheck,
  Loader2,
  Play,
  XCircle,
} from "lucide-react";
import { useTalentData } from "../context/TalentDataContext";
import { useConfig } from "../lib/configStore";
import { leerDeHoja } from "../lib/appsScript";
import { useComparator, COMPARATOR_SECTION_IDS } from "../lib/comparatorStore";
import { cookiesDisponibles, storageDisponible } from "../shared/storage";
import type { TalentPayload } from "../types";

/**
 * Diagnóstico del sistema.
 *
 * ## Por qué existe
 *
 * El reporte más difícil de atender en esta plataforma no es «hay un error»,
 * sino **«a mí no me funciona y a los demás sí»**. Quien lo recibe no tiene forma
 * de saber si el problema está en el código, en la red del edificio, en la
 * configuración que esa persona dejó guardada en su navegador o en la propia
 * hoja de cálculo. Sin evidencia, se revisa todo el sistema a ciegas —y a veces
 * no había nada que revisar.
 *
 * Este panel produce esa evidencia en un clic. Comprueba, **en el equipo de quien
 * lo ejecuta**, las cuatro cosas que hacen que la aplicación se comporte distinto
 * de una máquina a otra:
 *
 *   1. **El almacenamiento del navegador.** El tema, la configuración, la sesión
 *      del perfil y la comparación en curso viven ahí. Bloqueado —política de
 *      cookies, navegación privada— la aplicación se degrada de formas que
 *      parecen bugs.
 *   2. **La llegada al backend.** Si `script.google.com` está filtrado por el
 *      proxy, o el despliegue pide iniciar sesión, la aplicación sigue mostrando
 *      la caché local y aparenta funcionar mientras nada se guarda.
 *   3. **La calidad de los datos.** Un identificador repetido en la hoja hace que
 *      una persona no se pueda comparar; eso no es un fallo del navegador.
 *   4. **Los ajustes que esa persona dejó puestos.** Un límite de columnas bajo o
 *      todas las filas apagadas en la sesión del Comparador se ven exactamente
 *      igual que un módulo roto.
 *
 * El informe se copia como texto plano para pegarlo en un correo o un ticket, con
 * lo justo para actuar y sin ningún dato personal de los postulantes.
 */

type Estado = "ok" | "aviso" | "fallo";

interface Chequeo {
  id: string;
  titulo: string;
  estado: Estado;
  detalle: string;
  /** Qué hacer cuando no está en verde. */
  accion?: string;
}

const ICONO: Record<Estado, typeof CheckCircle2> = {
  ok: CheckCircle2,
  aviso: AlertTriangle,
  fallo: XCircle,
};

const TONO: Record<Estado, string> = {
  ok: "text-emerald-500 ring-emerald-400/30 bg-emerald-500/10",
  aviso: "text-amber-500 ring-amber-400/40 bg-amber-500/10",
  fallo: "text-rose-500 ring-rose-400/40 bg-rose-500/10",
};

/** Navegador y sistema, leídos del agente de usuario (sólo para el informe). */
function navegador(): string {
  if (typeof navigator === "undefined") return "desconocido";
  const ua = navigator.userAgent;
  const motor =
    /Edg\/([\d.]+)/.exec(ua)?.[0] ??
    /OPR\/([\d.]+)/.exec(ua)?.[0] ??
    /Chrome\/([\d.]+)/.exec(ua)?.[0] ??
    /Firefox\/([\d.]+)/.exec(ua)?.[0] ??
    /Version\/([\d.]+).*Safari/.exec(ua)?.[0] ??
    "navegador desconocido";
  const so = /Windows NT ([\d.]+)/.exec(ua)
    ? `Windows NT ${/Windows NT ([\d.]+)/.exec(ua)?.[1]}`
    : /Mac OS X ([\d_.]+)/.exec(ua)
      ? `macOS ${/Mac OS X ([\d_.]+)/.exec(ua)?.[1].replace(/_/g, ".")}`
      : /Android ([\d.]+)/.exec(ua)
        ? `Android ${/Android ([\d.]+)/.exec(ua)?.[1]}`
        : /iPhone OS ([\d_]+)/.exec(ua)
          ? `iOS ${/iPhone OS ([\d_]+)/.exec(ua)?.[1].replace(/_/g, ".")}`
          : /Linux/.test(ua)
            ? "Linux"
            : "sistema desconocido";
  return `${motor} · ${so}`;
}

function hayWebgl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function DiagnosticoPanel() {
  const { candidatos, duplicados, lastSyncedAt, stale, syncError, status } = useTalentData();
  const config = useConfig();
  const cmp = useComparator();
  const [corriendo, setCorriendo] = useState(false);
  const [chequeos, setChequeos] = useState<Chequeo[] | null>(null);
  const [copiado, setCopiado] = useState(false);

  const ejecutar = useCallback(async () => {
    setCorriendo(true);
    setCopiado(false);
    const out: Chequeo[] = [];

    out.push({
      id: "navegador",
      titulo: "Navegador y sistema",
      estado: "ok",
      detalle: navegador(),
    });

    const local = storageDisponible("local");
    out.push({
      id: "local",
      titulo: "Almacenamiento local",
      estado: local ? "ok" : "fallo",
      detalle: local
        ? "Disponible: se pueden guardar tema, configuración y borradores."
        : "Bloqueado. El navegador no permite guardar datos de este sitio.",
      accion: local
        ? undefined
        : "Permita cookies y datos del sitio para esta dirección (Configuración del navegador → Privacidad → Datos de sitios) y recargue.",
    });

    const sesion = storageDisponible("session");
    out.push({
      id: "sesion",
      titulo: "Almacenamiento de sesión",
      estado: sesion ? "ok" : "fallo",
      detalle: sesion
        ? "Disponible: el Comparador conserva la comparación al cambiar de módulo."
        : "Bloqueado. El Comparador olvidará los postulantes agregados al cambiar de módulo.",
      accion: sesion ? undefined : "Misma solución que el almacenamiento local.",
    });

    const cookies = cookiesDisponibles();
    out.push({
      id: "cookies",
      titulo: "Cookies",
      estado: cookies ? "ok" : "aviso",
      detalle: cookies
        ? "Disponibles: la sesión del perfil se recuerda."
        : "Bloqueadas: habrá que iniciar sesión con el perfil en cada visita.",
      accion: cookies ? undefined : "Permita cookies para esta dirección.",
    });

    // Lectura real del backend, midiendo cuánto tarda.
    const t0 = performance.now();
    const lectura = await leerDeHoja<Partial<TalentPayload>>();
    const ms = Math.round(performance.now() - t0);
    if (lectura.ok) {
      const filas = Array.isArray(lectura.datos?.candidatos) ? lectura.datos.candidatos.length : 0;
      out.push({
        id: "backend",
        titulo: "Conexión con la hoja de cálculo",
        estado: ms > 8000 ? "aviso" : "ok",
        detalle: `Respondió en ${ms} ms con ${filas} postulante(s).`,
        accion:
          ms > 8000
            ? "La respuesta es lenta: con muchas filas conviene revisar la hoja o la red del equipo."
            : undefined,
      });
    } else {
      out.push({
        id: "backend",
        titulo: "Conexión con la hoja de cálculo",
        estado: "fallo",
        detalle: `${lectura.message} (${ms} ms)`,
        accion:
          lectura.tipo === "sin_red"
            ? "Este equipo no alcanza script.google.com. Suele ser el proxy o el antivirus de la red: pruebe con otra red para confirmarlo."
            : "El despliegue del Apps Script está respondiendo algo que no son datos. Revise su publicación (acceso «Cualquier persona»).",
      });
    }

    out.push({
      id: "frescura",
      titulo: "Datos en pantalla",
      estado: stale ? "fallo" : status === "success" ? "ok" : "aviso",
      detalle: stale
        ? `Se está mostrando la copia local. Último dato del servidor: ${
            lastSyncedAt ? new Date(lastSyncedAt).toLocaleString("es-BO") : "nunca"
          }. ${syncError ?? ""}`
        : lastSyncedAt
          ? `Sincronizados el ${new Date(lastSyncedAt).toLocaleString("es-BO")}.`
          : "Todavía no se ha completado ninguna sincronización.",
      accion: stale ? "Pulse «Actualizar datos» y, si sigue en rojo, revise el chequeo anterior." : undefined,
    });

    out.push({
      id: "duplicados",
      titulo: "Identificadores de la hoja",
      estado: duplicados.length ? "fallo" : "ok",
      detalle: duplicados.length
        ? `${duplicados.length} identificador(es) repetido(s): ${duplicados.join(", ")}.`
        : `${candidatos.length} ficha(s) con identificador único.`,
      accion: duplicados.length
        ? "Corrija las claves repetidas en la hoja: mientras existan, editar esas fichas escribe en una fila indeterminada."
        : undefined,
    });

    const ocultas = Object.keys(cmp.rowHidden).length;
    const seccionesApagadas = COMPARATOR_SECTION_IDS.filter((id) => !cmp.sectionVisible[id]);
    const vistaTocada = ocultas > 0 || seccionesApagadas.length > 0;
    out.push({
      id: "vista-comparador",
      titulo: "Vista del Comparador (esta sesión)",
      estado: vistaTocada ? "aviso" : "ok",
      detalle: vistaTocada
        ? `${ocultas} fila(s) oculta(s) y ${seccionesApagadas.length} sección(es) apagada(s).`
        : "Todas las secciones y filas están visibles.",
      accion: vistaTocada
        ? "Si la comparativa se ve incompleta, use «Configuración → Restablecer vista» dentro del Comparador."
        : undefined,
    });

    out.push({
      id: "limites",
      titulo: "Límite de columnas del Comparador",
      estado: config.maxComparador < 4 ? "aviso" : "ok",
      detalle: `Máximo configurado: ${config.maxComparador} postulantes.`,
      accion:
        config.maxComparador < 4
          ? "El buscador se bloquea al llegar a ese número. Súbalo en Configuración → Evaluación y comparador."
          : undefined,
    });

    const webgl = hayWebgl();
    out.push({
      id: "grafico",
      titulo: "Motor gráfico",
      estado: webgl ? "ok" : "aviso",
      detalle: webgl
        ? `WebGL disponible${config.enableThree ? " y activado" : " (desactivado en Configuración)"}.`
        : "Sin WebGL: el fondo animado usa el respaldo CSS.",
      accion: webgl ? undefined : "No afecta a los datos; si el equipo va lento, desactive el motor 3D.",
    });

    setChequeos(out);
    setCorriendo(false);
  }, [candidatos.length, duplicados, lastSyncedAt, stale, syncError, status, cmp, config]);

  const informe = useCallback(() => {
    if (!chequeos) return "";
    const lineas = [
      "DIAGNÓSTICO · BDP Evaluación de Talento",
      `Fecha: ${new Date().toLocaleString("es-BO")}`,
      "",
      ...chequeos.map(
        (c) =>
          `[${c.estado.toUpperCase()}] ${c.titulo}: ${c.detalle}${c.accion ? ` → ${c.accion}` : ""}`,
      ),
    ];
    return lineas.join("\n");
  }, [chequeos]);

  const copiar = useCallback(async () => {
    try {
      await navigator.clipboard?.writeText(informe());
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2400);
    } catch {
      setCopiado(false);
    }
  }, [informe]);

  const problemas = chequeos?.filter((c) => c.estado !== "ok").length ?? 0;

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">
        Comprueba en <strong className="text-ink">este equipo</strong> lo que hace que la aplicación
        se comporte distinto de una máquina a otra: almacenamiento del navegador, llegada a la hoja
        de cálculo, calidad de los identificadores y ajustes guardados. Útil cuando alguien reporta
        que «a mí no me funciona»: el informe dice dónde está el problema.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={ejecutar}
          disabled={corriendo}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-4 py-2 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-60"
        >
          {corriendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {corriendo ? "Ejecutando…" : "Ejecutar diagnóstico"}
        </button>
        {chequeos && (
          <>
            <button
              type="button"
              onClick={copiar}
              className="inline-flex items-center gap-2 rounded-full fill-softer px-4 py-2 text-sm font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95"
            >
              {copiado ? (
                <ClipboardCheck className="h-4 w-4 text-emerald-500" />
              ) : (
                <Clipboard className="h-4 w-4" />
              )}
              {copiado ? "Informe copiado" : "Copiar informe"}
            </button>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${
                problemas === 0 ? TONO.ok : TONO.aviso
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              {problemas === 0
                ? "Todo en verde en este equipo"
                : `${problemas} punto(s) a revisar`}
            </span>
          </>
        )}
      </div>

      <AnimatePresence initial={false}>
        {chequeos && (
          <motion.ul
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-2"
          >
            {chequeos.map((c, i) => {
              const Icono = ICONO[c.estado];
              return (
                <motion.li
                  key={c.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.3) }}
                  className={`flex items-start gap-3 rounded-2xl px-3.5 py-3 ring-1 ${TONO[c.estado]}`}
                >
                  <Icono className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink">{c.titulo}</p>
                    <p className="text-xs text-ink-soft">{c.detalle}</p>
                    {c.accion && (
                      <p className="mt-1 text-xs font-semibold text-ink">→ {c.accion}</p>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
