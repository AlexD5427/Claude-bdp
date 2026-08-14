import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  CheckCircle2,
  Clipboard,
  HardDrive,
  Loader2,
  ShieldAlert,
  Wifi,
  XCircle,
} from "lucide-react";
import { SCRIPT_URL } from "../../constants";
import { storageStatus } from "../../lib/safeStorage";
import { useTalentData } from "../../context/TalentDataContext";

/**
 * Diagnóstico de conexión.
 *
 * ## Por qué hacía falta
 *
 * Cuando un analista dice «el comparador no funciona» o «no puedo añadir
 * postulantes», la aplicación no daba ni un dato para saber si el problema era del
 * sistema o de su equipo. El comparador mostraba «No se pudieron cargar los datos ·
 * Failed to fetch» —un mensaje que no distingue entre un cortafuegos corporativo,
 * un despliegue de Apps Script sin permisos y una hoja vacía— y el resto de la
 * interfaz seguía en verde. Diagnosticar exigía sentarse frente a ese equipo.
 *
 * Este panel hace, desde el navegador del analista, las cuatro comprobaciones que
 * cubren prácticamente todos los casos reales, y **las separa** para que cada
 * resultado apunte a un culpable distinto:
 *
 * | Comprobación               | Qué descarta si sale bien                        |
 * | -------------------------- | ------------------------------------------------ |
 * | Internet (este mismo sitio)| «se le cayó la red»                              |
 * | Backend (Apps Script)      | «el bloqueo es de red/proxy o el despliegue»      |
 * | Formato de la respuesta    | «el script contesta pero devuelve HTML o basura»  |
 * | Almacenamiento del sitio   | «el navegador tiene bloqueados los datos del sitio» |
 *
 * El resultado se copia como texto al portapapeles: es lo que el analista puede
 * pegar en un correo sin tener que explicar nada.
 */

type Estado = "pendiente" | "corriendo" | "ok" | "aviso" | "fallo";

interface Prueba {
  id: string;
  titulo: string;
  estado: Estado;
  detalle: string;
  /** Qué hacer cuando falla. */
  remedio?: string;
}

const ICONO: Record<Estado, React.ReactNode> = {
  pendiente: <Activity className="h-4 w-4 text-ink-faint" />,
  corriendo: <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />,
  ok: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  aviso: <ShieldAlert className="h-4 w-4 text-amber-500" />,
  fallo: <XCircle className="h-4 w-4 text-rose-500" />,
};

const ANILLO: Record<Estado, string> = {
  pendiente: "ring-[color:var(--hairline)]",
  corriendo: "ring-cyan-400/40",
  ok: "ring-emerald-400/40",
  aviso: "ring-amber-400/45",
  fallo: "ring-rose-400/50",
};

/** Comprueba que el propio sitio responde: separa «no hay internet» de «bloquean Google». */
async function probarSitio(): Promise<Prueba> {
  const inicio = performance.now();
  try {
    const res = await fetch(`${window.location.origin}/logo.svg?d=${Date.now()}`, {
      cache: "no-store",
    });
    const ms = Math.round(performance.now() - inicio);
    if (!res.ok) {
      return {
        id: "sitio",
        titulo: "Este sitio responde",
        estado: "aviso",
        detalle: `HTTP ${res.status} en ${ms} ms`,
      };
    }
    return {
      id: "sitio",
      titulo: "Este sitio responde",
      estado: "ok",
      detalle: `${ms} ms · ${navigator.onLine ? "el navegador se declara en línea" : "el navegador se declara SIN conexión"}`,
    };
  } catch (err) {
    return {
      id: "sitio",
      titulo: "Este sitio responde",
      estado: "fallo",
      detalle: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      remedio:
        "Si ni el propio sitio responde, el problema es la conexión del equipo o del navegador, no la aplicación.",
    };
  }
}

/**
 * Comprueba el backend de verdad: alcanzabilidad **y** formato de la respuesta.
 *
 * Deliberadamente sólo hace un GET. Un POST de prueba correría el riesgo de
 * escribir una fila vacía en la hoja, y un diagnóstico que ensucia los datos que
 * pretende comprobar no sirve de nada.
 */
async function probarBackend(): Promise<Prueba[]> {
  const inicio = performance.now();
  let res: Response;
  try {
    res = await fetch(SCRIPT_URL, {
      method: "GET",
      redirect: "follow",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch (err) {
    const detalle = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return [
      {
        id: "backend",
        titulo: "Base de datos (Google Apps Script)",
        estado: "fallo",
        detalle,
        remedio:
          "El navegador no llegó a script.google.com. Si el sitio de arriba sí responde, casi siempre es la red del banco (proxy, cortafuegos o filtro de DNS), una extensión del navegador o el antivirus. Pruebe con los datos del móvil o en una ventana de incógnito sin extensiones.",
      },
      {
        id: "formato",
        titulo: "La respuesta es JSON válido",
        estado: "pendiente",
        detalle: "No se pudo comprobar: no hubo respuesta.",
      },
    ];
  }

  const ms = Math.round(performance.now() - inicio);
  const contentType = res.headers.get("content-type") ?? "(sin content-type)";
  const alcanzable: Prueba = {
    id: "backend",
    titulo: "Base de datos (Google Apps Script)",
    estado: res.ok ? "ok" : "fallo",
    detalle: `HTTP ${res.status} en ${ms} ms · ${contentType}`,
    remedio: res.ok
      ? undefined
      : "El script respondió con un error. Revise el registro de ejecuciones en Apps Script.",
  };

  let texto = "";
  try {
    texto = await res.text();
  } catch {
    return [
      alcanzable,
      {
        id: "formato",
        titulo: "La respuesta es JSON válido",
        estado: "fallo",
        detalle: "No se pudo leer el cuerpo de la respuesta.",
      },
    ];
  }

  const cabeza = texto.trimStart().slice(0, 120).toLowerCase();
  if (cabeza.startsWith("<!doctype") || cabeza.startsWith("<html")) {
    return [
      alcanzable,
      {
        id: "formato",
        titulo: "La respuesta es JSON válido",
        estado: "fallo",
        detalle: `Llegó una página web (${texto.length} bytes) en lugar de datos.`,
        remedio:
          "El despliegue de Apps Script está pidiendo autorización. Vuelva a publicarlo (Implementar → Gestionar implementaciones) con «Ejecutar como: yo» y «Quién tiene acceso: cualquier persona». Mientras esto siga así, ningún registro se guardará aunque la aplicación no lo diga.",
      },
    ];
  }

  try {
    const data = JSON.parse(texto) as { candidatos?: unknown[]; competencias?: unknown[] };
    const n = Array.isArray(data.candidatos) ? data.candidatos.length : -1;
    if (n < 0) {
      return [
        alcanzable,
        {
          id: "formato",
          titulo: "La respuesta es JSON válido",
          estado: "aviso",
          detalle: "JSON correcto, pero sin el arreglo «candidatos».",
          remedio: "Revise que el `doGet` esté devolviendo el libro completo.",
        },
      ];
    }
    return [
      alcanzable,
      {
        id: "formato",
        titulo: "La respuesta es JSON válido",
        estado: n === 0 ? "aviso" : "ok",
        detalle:
          n === 0
            ? "JSON correcto, pero la hoja devolvió 0 postulantes."
            : `${n} postulante(s) y ${Array.isArray(data.competencias) ? data.competencias.length : 0} competencia(s) en el catálogo.`,
        remedio:
          n === 0
            ? "La conexión funciona: el comparador se ve vacío porque la hoja no está devolviendo filas."
            : undefined,
      },
    ];
  } catch {
    return [
      alcanzable,
      {
        id: "formato",
        titulo: "La respuesta es JSON válido",
        estado: "fallo",
        detalle: `No se pudo interpretar: ${texto.slice(0, 120)}`,
      },
    ];
  }
}

/** El almacenamiento del sitio: la causa de la pantalla en blanco. */
function probarAlmacenamiento(): Prueba {
  const { local, session } = storageStatus();
  const problema = local.availability !== "ok" || session.availability !== "ok";
  return {
    id: "almacenamiento",
    titulo: "Almacenamiento del sitio",
    estado: problema ? "fallo" : "ok",
    detalle: problema
      ? `local: ${local.availability}${local.reason ? ` (${local.reason})` : ""} · sesión: ${session.availability}${session.reason ? ` (${session.reason})` : ""}`
      : "Disponible: las preferencias, la caché y los borradores se guardan en este equipo.",
    remedio: problema
      ? "Este navegador tiene bloqueados los datos del sitio. Actívelos para este dominio (candado de la barra de direcciones → Cookies y datos del sitio → Permitir). Sin ellos no se conservan el tema, la caché ni los borradores del cuestionario."
      : undefined,
  };
}

const PRUEBAS_INICIALES: Prueba[] = [
  { id: "sitio", titulo: "Este sitio responde", estado: "pendiente", detalle: "Sin ejecutar." },
  {
    id: "backend",
    titulo: "Base de datos (Google Apps Script)",
    estado: "pendiente",
    detalle: "Sin ejecutar.",
  },
  {
    id: "formato",
    titulo: "La respuesta es JSON válido",
    estado: "pendiente",
    detalle: "Sin ejecutar.",
  },
  {
    id: "almacenamiento",
    titulo: "Almacenamiento del sitio",
    estado: "pendiente",
    detalle: "Sin ejecutar.",
  },
];

export function DiagnosticoConexion() {
  const { connection, connectionDetail, lastSyncedAt, candidatos } = useTalentData();
  const [pruebas, setPruebas] = useState<Prueba[]>(PRUEBAS_INICIALES);
  const [corriendo, setCorriendo] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const ejecutar = useCallback(async () => {
    setCorriendo(true);
    setCopiado(false);
    setPruebas((prev) => prev.map((p) => ({ ...p, estado: "corriendo", detalle: "Comprobando…" })));
    const sitio = await probarSitio();
    setPruebas((prev) => prev.map((p) => (p.id === sitio.id ? sitio : p)));
    const backend = await probarBackend();
    setPruebas((prev) => prev.map((p) => backend.find((b) => b.id === p.id) ?? p));
    const almacenamiento = probarAlmacenamiento();
    setPruebas((prev) => prev.map((p) => (p.id === almacenamiento.id ? almacenamiento : p)));
    setCorriendo(false);
  }, []);

  const copiar = useCallback(async () => {
    const lineas = [
      "DIAGNÓSTICO · BDP Reclutamiento y Selección",
      `Fecha del equipo: ${new Date().toISOString()}`,
      `Navegador: ${navigator.userAgent}`,
      `Pantalla: ${window.innerWidth}×${window.innerHeight}`,
      `navigator.onLine: ${navigator.onLine}`,
      `Origen: ${window.location.origin}`,
      `Endpoint: …${SCRIPT_URL.slice(-24)}`,
      `Estado de conexión de la app: ${connection}`,
      `Último detalle de red: ${connectionDetail ?? "—"}`,
      `Última sincronización correcta: ${lastSyncedAt ?? "nunca"}`,
      `Postulantes cargados en memoria: ${candidatos.length}`,
      "",
      ...pruebas.map(
        (p) => `[${p.estado.toUpperCase()}] ${p.titulo}: ${p.detalle}${p.remedio ? ` → ${p.remedio}` : ""}`,
      ),
    ];
    try {
      await navigator.clipboard.writeText(lineas.join("\n"));
      setCopiado(true);
    } catch {
      // Sin permiso de portapapeles: al menos queda en la consola para copiarlo.
      console.info(lineas.join("\n"));
      setCopiado(true);
    }
  }, [pruebas, connection, connectionDetail, lastSyncedAt, candidatos.length]);

  return (
    <div className="space-y-3">
      {connection === "sin-conexion" && (
        <p className="flex items-start gap-2 rounded-2xl bg-rose-500/10 px-4 py-3 text-xs text-ink ring-1 ring-rose-400/40">
          <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          <span>
            Ahora mismo la aplicación <strong>no puede hablar con la hoja de cálculo</strong>. Lo que
            ve en los módulos es la última copia guardada en este equipo y{" "}
            <strong>nada de lo que registre llegará a la base</strong> hasta que esto se resuelva.
          </span>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <motion.button
          type="button"
          onClick={ejecutar}
          disabled={corriendo}
          whileTap={{ scale: 0.96 }}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-2.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all hover:-translate-y-0.5 disabled:opacity-60"
        >
          {corriendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
          {corriendo ? "Comprobando…" : "Ejecutar diagnóstico"}
        </motion.button>
        <button
          type="button"
          onClick={copiar}
          className="inline-flex items-center gap-2 rounded-full fill-softer px-4 py-2.5 text-sm font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95"
        >
          <Clipboard className="h-4 w-4" />
          {copiado ? "Copiado" : "Copiar informe"}
        </button>
      </div>

      <ul className="space-y-2">
        {pruebas.map((p) => (
          <li
            key={p.id}
            className={`rounded-2xl fill-softer px-4 py-3 ring-1 transition-all ${ANILLO[p.estado]}`}
          >
            <div className="flex items-center gap-2">
              {p.id === "almacenamiento" ? (
                <HardDrive className="h-4 w-4 shrink-0 text-ink-soft" />
              ) : (
                <span className="shrink-0">{ICONO[p.estado]}</span>
              )}
              <span className="min-w-0 flex-1 text-sm font-bold text-ink">{p.titulo}</span>
              <span className="shrink-0">{ICONO[p.estado]}</span>
            </div>
            <p className="mt-1 break-words text-xs text-ink-soft">{p.detalle}</p>
            {p.remedio && (
              <p className="mt-1.5 rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-ink ring-1 ring-amber-400/30">
                {p.remedio}
              </p>
            )}
          </li>
        ))}
      </ul>

      <p className="text-[0.7rem] text-ink-faint">
        El diagnóstico sólo lee: nunca escribe una fila de prueba en la hoja. «Copiar informe» deja en
        el portapapeles un texto con el navegador, la red y los resultados, listo para pegar en un
        correo de soporte.
      </p>
    </div>
  );
}
