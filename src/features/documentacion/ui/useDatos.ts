/**
 * Enganche de carga de datos para las secciones.
 *
 * ── Qué resuelve ────────────────────────────────────────────────────────────
 * Las trece secciones hacen lo mismo: piden datos, muestran un esqueleto, pintan
 * el resultado o el error, y ofrecen recargar. Escrito trece veces, eso son trece
 * sitios donde olvidarse de cancelar una petición o de ignorar una respuesta que
 * llegó tarde.
 *
 * Dos detalles que este enganche sí hace bien:
 *
 *   · **respuestas obsoletas**: cada carga incrementa un contador; si al volver ya
 *     hay otra carga en marcha, el resultado se descarta. Sin eso, cambiar de
 *     filtro dos veces seguidas puede dejar en pantalla el resultado del primero;
 *   · **desmontaje**: si el componente ya no está, no se llama a `setState`. Es la
 *     causa del clásico aviso de React sobre actualizar un componente desmontado.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { mensajeDeError } from "../api/client";

export interface EstadoDatos<T> {
  datos: T | null;
  cargando: boolean;
  error: { mensaje: string; pista: string; codigo: string } | null;
  recargar: () => void;
  /** Reemplaza los datos en memoria, para reflejar un cambio ya confirmado. */
  poner: (datos: T | null) => void;
}

export function useDatos<T>(
  cargar: () => Promise<T>,
  dependencias: unknown[],
  opciones: { activo?: boolean } = {},
): EstadoDatos<T> {
  const activo = opciones.activo !== false;
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(activo);
  const [error, setError] = useState<{ mensaje: string; pista: string; codigo: string } | null>(null);
  const [ciclo, setCiclo] = useState(0);
  const secuencia = useRef(0);
  const montado = useRef(true);
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  useEffect(() => {
    if (!activo) {
      setCargando(false);
      return;
    }
    secuencia.current += 1;
    const mia = secuencia.current;
    setCargando(true);
    setError(null);

    cargarRef
      .current()
      .then((resultado) => {
        if (!montado.current || mia !== secuencia.current) return;
        setDatos(resultado);
      })
      .catch((e) => {
        if (!montado.current || mia !== secuencia.current) return;
        setError(mensajeDeError(e));
      })
      .finally(() => {
        if (!montado.current || mia !== secuencia.current) return;
        setCargando(false);
      });
    // Las dependencias las declara quien usa el enganche: son los filtros de esa
    // sección. `ciclo` fuerza la recarga manual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, ciclo, ...dependencias]);

  const recargar = useCallback(() => setCiclo((n) => n + 1), []);
  const poner = useCallback((siguiente: T | null) => setDatos(siguiente), []);

  return { datos, cargando, error, recargar, poner };
}
