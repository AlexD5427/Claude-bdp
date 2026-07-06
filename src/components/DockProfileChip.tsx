import { useRef, useState } from "react";
import { LogOut, MonitorSmartphone, ScrollText } from "lucide-react";
import { PortalDropdown } from "./PortalDropdown";
import { ProfileAvatar } from "./login/ProfileAvatar";
import { useConfig, setConfig } from "../lib/configStore";
import {
  logout,
  readLocalLog,
  ROLE_LABEL,
  useProfiles,
} from "../lib/profilesStore";

/**
 * The circular profile chip that lives in the dock once someone is logged in.
 * It shows the person's animated avatar (idle animation, respecting the static
 * setting) and opens a small popover with their role, the static-mode switch,
 * a peek at their recent activity, and a "cerrar sesión" action.
 */
export function DockProfileChip({ plate }: { plate: string }) {
  const { current } = useProfiles();
  const { staticAvatars } = useConfig();
  const [open, setOpen] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  if (!current) return null;
  const log = showLog ? readLocalLog(current.id).slice(-8).reverse() : [];

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Perfil de ${current.nombre}`}
        title={current.nombre}
        className={`grid ${plate} shrink-0 place-items-center rounded-2xl transition-transform duration-300 hover:-translate-y-0.5 active:scale-95`}
      >
        <ProfileAvatar
          nombre={current.nombre}
          avatar={current.avatar}
          size="sm"
          staticMode={staticAvatars}
        />
      </button>

      <PortalDropdown open={open} anchorRef={wrapRef} onClose={() => setOpen(false)} maxHeight={420}>
        <div className="glass-heavy w-72 rounded-2xl p-3">
          <div className="flex items-center gap-3 rounded-xl fill-softer p-3 ring-1 ring-[color:var(--hairline)]">
            <ProfileAvatar nombre={current.nombre} avatar={current.avatar} size="sm" staticMode={staticAvatars} />
            <div className="min-w-0">
              <div className="truncate text-sm font-black text-ink">{current.nombre}</div>
              <div className="truncate text-[0.7rem] text-ink-soft">{current.cargo}</div>
              <span className="mt-1 inline-flex rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-2 py-0.5 text-[0.6rem] font-bold text-white">
                {ROLE_LABEL[current.role]}
              </span>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={staticAvatars}
            onClick={() => setConfig({ staticAvatars: !staticAvatars })}
            className="mt-2 flex w-full items-center gap-2 rounded-xl fill-softer px-3 py-2.5 text-left text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft"
          >
            <MonitorSmartphone className="h-4 w-4 text-cyan-400" />
            <span className="flex-1">Modo estático</span>
            <span
              className={[
                "relative h-5 w-9 rounded-full transition-colors",
                staticAvatars ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa]" : "fill-soft ring-1 ring-[color:var(--hairline)]",
              ].join(" ")}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${staticAvatars ? "left-[1.2rem]" : "left-0.5"}`} />
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowLog((v) => !v)}
            className="mt-1.5 flex w-full items-center gap-2 rounded-xl fill-softer px-3 py-2.5 text-left text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft"
          >
            <ScrollText className="h-4 w-4 text-cyan-400" />
            <span className="flex-1">Mi actividad reciente</span>
          </button>

          {showLog && (
            <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto rounded-xl fill-soft p-2 ring-1 ring-[color:var(--hairline)]">
              {log.length === 0 ? (
                <p className="px-1 py-2 text-center text-xs text-ink-faint">Sin actividad registrada aún.</p>
              ) : (
                log.map((e, i) => (
                  <div key={i} className="rounded-lg px-2 py-1 text-[0.7rem] text-ink-soft">
                    <span className="font-semibold text-ink">{e.accion}</span>
                    {e.modulo && <span className="text-ink-faint"> · {e.modulo}</span>}
                    <span className="block text-ink-faint">{e.fecha} {e.hora}</span>
                  </div>
                ))
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              logout();
              setOpen(false);
            }}
            className="mt-2 flex w-full items-center gap-2 rounded-xl bg-rose-500/15 px-3 py-2.5 text-left text-sm font-bold text-rose-500 ring-1 ring-rose-400/40 transition-all hover:bg-rose-500/25"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </PortalDropdown>
    </div>
  );
}
