import { useState } from "react";
import {
  CheckCircle2,
  ClipboardCopy,
  Loader2,
  RefreshCcw,
  XCircle,
  AlertTriangle,
  Stethoscope,
} from "lucide-react";
import { SCRIPT_URL } from "../../constants";
import { getConfig } from "../../lib/configStore";

/**
 * Diagnóstico de conectividad de la base de datos.
 *
 * ## Para qué existe
 *
 * Cuando alguien reporta «no puedo registrar postulantes» o «el comparador no
 * funciona» hay tres explicaciones posibles y hasta ahora no había forma de
 * distinguirlas sin sentarse en su equipo:
 *
 *   1. **La aplicación**: un fallo de código (para eso están las pruebas).
 *   2. **La red de esa persona**: un antivirus, una extensión o el proxy de la
 *      institución bloquean `script.google.com`. La lectura suele ir por caché,
 *      así que la aplicación «se ve bien» pero ninguna escritura llega.
 *   3. **El despliegue de Apps Script**: si deja de estar publicado como
 *      «Cualquiera con el enlace», Google devuelve su pantalla de acceso en
 *      lugar de JSON.
 *
 * El diagnóstico prueba los tres caminos por separado —leer, escribir y guardar
 * preferencias en el navegador— y produce un resumen copiable. Con eso, quien
 * atiende el reporte sabe en un minuto de qué lado está el problema.
 *
 * ## Por qué la prueba de escritura no escribe nada
 *
 * El backend enruta los POST por su campo `type` y responde `ignored` a
 * `kpi_snapshot` sin tocar ninguna hoja (ver el enrutador de `doPost`). Es el
 * único sondeo que recorre el camino completo —CORS, redirección 302, permisos
 * del despliegue— sin dejar rastro en el libro. Un `type` desconocido caería en
 * el caso por omisión, que da de alta un postulante: exactamente lo que un
 * diagnóstico no debe hacer.
 */

type Verdict = "ok" | "warn" | "fail";

interface CheckResult {
  label: string;
  verdict: Verdict;
  detail: string;
  ms?: number;
}

const TONE: Record<Verdict, string> = {
  ok: "text-emerald-500",
  warn: "text-amber-500",
  fail: "text-rose-500",
};

function Icon({ verdict }: { verdict: Verdict }) {
  if (verdict === "ok") return <CheckCircle2 className="h-4 w-4" />;
  if (verdict === "warn") return <AlertTriangle className="h-4 w-4" />;
  return <XCircle className="h-4 w-4" />;
}

/** Lectura: el GET que alimenta toda la aplicación. */
async function checkRead(): Promise<CheckResult> {
  const started = Date.now();
  try {
    const res = await fetch(SCRIPT_URL, {
      method: "GET",
      redirect: "follow",
      headers: { Accept: "application/json" },
    });
    const ms = Date.now() - started;
    if (!res.ok) {
      return { label: "Lectura de la base", verdict: "fail", ms, detail: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { candidatos?: unknown[] };
    if (!Array.isArray(data.candidatos)) {
      return {
        label: "Lectura de la base",
        verdict: "fail",
        ms,
        detail: "La respuesta no tiene la forma esperada (¿el despliegue pide iniciar sesión?)",
      };
    }
    return {
      label: "Lectura de la base",
      verdict: "ok",
      ms,
      detail: `${data.candidatos.length} postulante(s) recibidos`,
    };
  } catch {
    return {
      label: "Lectura de la base",
      verdict: "fail",
      ms: Date.now() - started,
      detail: "La petición no llegó (red, proxy, antivirus o extensión del navegador)",
    };
  }
}

/** Escritura: el mismo camino que usa un registro, pero sin escribir nada. */
async function checkWrite(): Promise<CheckResult> {
  const started = Date.now();
  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      // El backend responde `ignored` a este tipo sin tocar ninguna hoja.
      body: JSON.stringify({ type: "kpi_snapshot", month: "diagnostico", values: {} }),
    });
    const ms = Date.now() - started;
    if (!res.ok) {
      return { label: "Escritura en la base", verdict: "fail", ms, detail: `HTTP ${res.status}` };
    }
    try {
      const data = (await res.json()) as { status?: string };
      return {
        label: "Escritura en la base",
        verdict: "ok",
        ms,
        detail: `El script respondió «${data.status ?? "sin estado"}»`,
      };
    } catch {
      return {
        label: "Escritura en la base",
        verdict: "fail",
        ms,
        detail: "La respuesta no es JSON: el despliegue probablemente no está publicado para «Cualquiera con el enlace»",
      };
    }
  } catch {
    return {
      label: "Escritura en la base",
      verdict: "fail",
      ms: Date.now() - started,
      detail: "La petición no llegó. Es el síntoma típico de un bloqueo local: se puede leer (por caché) pero no guardar",
    };
  }
}

/** Almacenamiento del navegador: de él dependen sesión y preferencias. */
function checkStorage(): CheckResult {
  const probe = (store: Storage | undefined, name: string): string | null => {
    try {
      if (!store) return `${name} no disponible`;
      const key = "__bdp_diag__";
      store.setItem(key, "1");
      store.removeItem(key);
      return null;
    } catch {
      return `${name} bloqueado`;
    }
  };
  const problems = [
    probe(window.localStorage, "localStorage"),
    probe(window.sessionStorage, "sessionStorage"),
  ].filter((p): p is string => p !== null);

  if (problems.length === 0) {
    return {
      label: "Almacenamiento del navegador",
      verdict: "ok",
      detail: "Preferencias y sesión se pueden guardar",
    };
  }
  return {
    label: "Almacenamiento del navegador",
    verdict: "warn",
    detail: `${problems.join(" · ")}. En modo incógnito o con las cookies de sitio bloqueadas se pierden las preferencias y la comparación en curso`,
  };
}

export function ConnectionDiagnostics() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [copied, setCopied] = useState(false);

  async function run() {
    setRunning(true);
    setCopied(false);
    const storage = checkStorage();
    const [read, write] = await Promise.all([checkRead(), checkWrite()]);
    setResults([read, write, storage]);
    setRunning(false);
  }

  const summary = () => {
    const cfg = getConfig();
    const lines = [
      "Diagnóstico BDP · Reclutamiento y Selección",
      new Date().toLocaleString("es-BO"),
      `Navegador: ${navigator.userAgent}`,
      `Máx. candidatos a comparar: ${cfg.maxComparador}`,
      `Actualización automática: ${cfg.autoRefresh ? `cada ${cfg.autoRefreshSeconds} s` : "desactivada"}`,
      "",
      ...(results ?? []).map(
        (r) =>
          `${r.verdict === "ok" ? "[OK]" : r.verdict === "warn" ? "[AVISO]" : "[FALLA]"} ${r.label}: ${r.detail}${r.ms !== undefined ? ` (${r.ms} ms)` : ""}`,
      ),
    ];
    return lines.join("\n");
  };

  async function copy() {
    try {
      await navigator.clipboard?.writeText(summary());
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-4 py-2 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-60"
        >
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Stethoscope className="h-4 w-4" />
          )}
          Diagnosticar conexión
        </button>
        {results && (
          <>
            <button
              type="button"
              onClick={run}
              className="inline-flex items-center gap-2 rounded-full fill-softer px-3.5 py-2 text-sm font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95"
            >
              <RefreshCcw className="h-4 w-4" />
              Repetir
            </button>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-2 rounded-full fill-softer px-3.5 py-2 text-sm font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95"
            >
              <ClipboardCopy className="h-4 w-4" />
              {copied ? "Copiado" : "Copiar informe"}
            </button>
          </>
        )}
      </div>

      {results && (
        <ul className="mt-3 space-y-1.5">
          {results.map((r) => (
            <li key={r.label} className="flex items-start gap-2 text-sm">
              <span className={`mt-0.5 shrink-0 ${TONE[r.verdict]}`}>
                <Icon verdict={r.verdict} />
              </span>
              <span className="min-w-0">
                <strong className="text-ink">{r.label}</strong>
                {r.ms !== undefined && (
                  <span className="text-ink-faint"> · {r.ms} ms</span>
                )}
                <span className="block text-ink-soft">{r.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
