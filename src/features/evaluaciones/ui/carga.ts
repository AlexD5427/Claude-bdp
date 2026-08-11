/**
 * Progreso de las cargas del módulo.
 *
 * ── El problema ──────────────────────────────────────────────────────────────
 * Todo lo que este módulo muestra sale de un libro de Google Sheets a través de
 * Apps Script. Una lectura tarda entre medio segundo y tres o cuatro, y hasta
 * ahora no se anunciaba: al abrir Evaluaciones —o los resultados, o una
 * evaluación concreta— la pantalla se quedaba igual durante segundos y solo al
 * final aparecía todo de golpe. Quien lo usa no puede distinguir eso de una
 * página colgada, así que vuelve a pulsar, y cada pulsación es otra lectura.
 *
 * ── Qué hace este archivo ────────────────────────────────────────────────────
 * Un contador de ETAPAS con nombre. Se declara cuántas lecturas componen la
 * carga («estado del backend», «listado de evaluaciones»), se marca cada una al
 * terminar, y el progreso es la fracción real de etapas cumplidas.
 *
 * Mientras una etapa está en vuelo el progreso AVANZA UN POCO, con incrementos
 * cada vez más pequeños que nunca llegan al siguiente hito. Es deliberado: una
 * barra parada durante tres segundos se lee como «se rompió», y una barra que
 * llega al 100 % antes de terminar miente. Así avanza sin prometer.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface EstadoCarga {
  activo: boolean;
  /** 0 a 1. */
  progreso: number;
  etiqueta: string;
}

const INACTIVO: EstadoCarga = { activo: false, progreso: 0, etiqueta: "" };

export function useCargaPorEtapas() {
  const [estado, setEstado] = useState<EstadoCarga>(INACTIVO);
  const control = useRef({ total: 1, hechas: 0 });
  const reloj = useRef<ReturnType<typeof setInterval> | null>(null);

  const detenerReloj = () => {
    if (reloj.current !== null) {
      clearInterval(reloj.current);
      reloj.current = null;
    }
  };

  useEffect(() => detenerReloj, []);

  /** Empieza una carga de `total` etapas. */
  const iniciar = useCallback((total: number, etiqueta: string) => {
    control.current = { total: Math.max(1, total), hechas: 0 };
    setEstado({ activo: true, progreso: 0.04, etiqueta });
    detenerReloj();
    reloj.current = setInterval(() => {
      setEstado((previo) => {
        if (!previo.activo) return previo;
        const { total: t, hechas } = control.current;
        const piso = hechas / t;
        const techo = (hechas + 1) / t;
        // Se acerca al siguiente hito por mitades: nunca lo alcanza.
        const siguiente = previo.progreso + (techo - previo.progreso) * 0.12;
        return { ...previo, progreso: Math.max(piso, Math.min(techo - 0.01, siguiente)) };
      });
    }, 220);
  }, []);

  /** Marca una etapa como cumplida y anuncia la siguiente. */
  const avanzar = useCallback((etiqueta?: string) => {
    control.current.hechas = Math.min(control.current.total, control.current.hechas + 1);
    setEstado((previo) => ({
      activo: true,
      progreso: control.current.hechas / control.current.total,
      etiqueta: etiqueta ?? previo.etiqueta,
    }));
  }, []);

  /** Cierra la carga. */
  const terminar = useCallback(() => {
    detenerReloj();
    setEstado({ activo: false, progreso: 1, etiqueta: "" });
  }, []);

  return { estado, iniciar, avanzar, terminar };
}
