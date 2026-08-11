/**
 * DocMotion.tsx — primitivas de movimiento del módulo de Documentación.
 *
 * Todo el movimiento del módulo pasa por aquí. La razón es que una animación
 * suelta en un componente acaba ignorando `prefers-reduced-motion`, y este
 * módulo lo usa gente durante horas seguidas: el mareo por movimiento es un
 * problema real, no una preferencia estética.
 *
 * Hay tres niveles —completas, suaves, mínimas— y el sistema operativo tiene la
 * última palabra: si pide movimiento reducido, se aplica sin importar lo
 * configurado.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, type Transition, type Variants } from "framer-motion";
import { useDocStore } from "../../lib/docStore";
import "./doc-motion.css";

/* ------------------------------------------------------------------ */
/* Preferencias                                                        */
/* ------------------------------------------------------------------ */

function usePrefiereMenosMovimiento(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduce(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduce;
}

export interface DocMotionConfig {
  activo: boolean;
  nivel: "completas" | "suaves" | "minimas";
  /** Duración base en segundos. */
  dur: number;
  spring: Transition;
  suave: Transition;
  /** Desplazamiento en píxeles de las entradas. */
  desplazamiento: number;
}

export function useDocMotion(): DocMotionConfig {
  const { settings } = useDocStore();
  const sistemaReduce = usePrefiereMenosMovimiento();

  return useMemo(() => {
    const nivel = sistemaReduce ? "minimas" : settings.animaciones;
    const activo = nivel !== "minimas";
    const dur = nivel === "completas" ? 0.42 : nivel === "suaves" ? 0.26 : 0;

    return {
      activo,
      nivel,
      dur,
      spring: activo
        ? { type: "spring", stiffness: 320, damping: 30, mass: 0.8 }
        : { duration: 0 },
      suave: activo ? { duration: dur, ease: [0.22, 1, 0.36, 1] } : { duration: 0 },
      desplazamiento: nivel === "completas" ? 14 : nivel === "suaves" ? 8 : 0,
    };
  }, [settings.animaciones, sistemaReduce]);
}

/* ------------------------------------------------------------------ */
/* Variantes reutilizables                                             */
/* ------------------------------------------------------------------ */

export function variantesEntrada(desplazamiento: number, dur: number): Variants {
  return {
    oculto: { opacity: 0, y: desplazamiento },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: dur, ease: [0.22, 1, 0.36, 1] },
    },
    salida: { opacity: 0, y: -desplazamiento / 2, transition: { duration: dur * 0.6 } },
  };
}

/**
 * Variantes de lista con aparición escalonada.
 *
 * El retardo se recorta cuando hay muchos elementos: con cien expedientes, 40 ms
 * cada uno son cuatro segundos hasta ver el último. Se reparte el escalonado
 * dentro de un presupuesto fijo.
 */
export function variantesLista(total: number, dur: number): Variants {
  const presupuesto = 0.45;
  const paso = total > 0 ? Math.min(0.04, presupuesto / total) : 0.04;
  return {
    oculto: {},
    visible: {
      transition: { staggerChildren: paso, delayChildren: dur * 0.15 },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Componentes                                                         */
/* ------------------------------------------------------------------ */

/** Entrada al aparecer en pantalla. Se anima una sola vez. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const m = useDocMotion();

  if (!m.activo) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: m.desplazamiento }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: m.dur, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Micro-interacción de pulsación. Envuelve cualquier elemento interactivo. */
export function Tap({
  children,
  className,
  onClick,
  disabled,
  title,
  type = "button",
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  const m = useDocMotion();

  return (
    <motion.button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={className}
      whileHover={m.activo && !disabled ? { scale: 1.02 } : undefined}
      whileTap={m.activo && !disabled ? { scale: 0.97 } : undefined}
      transition={m.spring}
    >
      {children}
    </motion.button>
  );
}

/** Cifra que cuenta hasta su valor. Cae a texto plano sin animaciones. */
export function CountUp({
  value,
  duracion = 700,
  sufijo = "",
}: {
  value: number;
  duracion?: number;
  sufijo?: string;
}) {
  const m = useDocMotion();
  const [mostrado, setMostrado] = useState(m.activo ? 0 : value);
  const anterior = useRef(m.activo ? 0 : value);

  useEffect(() => {
    if (!m.activo) {
      setMostrado(value);
      anterior.current = value;
      return;
    }

    const desde = anterior.current;
    const delta = value - desde;
    if (delta === 0) return;

    let raf = 0;
    const inicio = performance.now();

    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / duracion);
      // easeOutCubic: rápido al principio, calmado al final.
      const e = 1 - Math.pow(1 - t, 3);
      setMostrado(Math.round(desde + delta * e));
      if (t < 1) raf = requestAnimationFrame(paso);
      else anterior.current = value;
    };

    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [value, duracion, m.activo]);

  return (
    <>
      {mostrado}
      {sufijo}
    </>
  );
}

/** Bloque de carga con brillo. */
export function Skeleton({
  className = "",
  rounded = "rounded-xl",
}: {
  className?: string;
  rounded?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden fill-soft ${rounded} ${className}`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 doc-shimmer" />
    </div>
  );
}

/** Barra de progreso indeterminada o con porcentaje. */
export function ProgressBar({
  value,
  indeterminado = false,
  className = "",
}: {
  value?: number;
  indeterminado?: boolean;
  className?: string;
}) {
  const m = useDocMotion();
  const pct = Math.max(0, Math.min(100, value ?? 0));

  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full fill-soft ${className}`}
      role="progressbar"
      aria-valuenow={indeterminado ? undefined : pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {indeterminado ? (
        <motion.div
          className="h-full w-1/3 rounded-full bg-gradient-to-r from-[#00b0d8] to-[#005baa]"
          animate={m.activo ? { x: ["-100%", "320%"] } : { x: "0%" }}
          transition={
            m.activo
              ? { duration: 1.1, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0 }
          }
        />
      ) : (
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[#00b0d8] to-[#005baa]"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={m.suave}
        />
      )}
    </div>
  );
}

/**
 * Contenedor con desplazamiento suave.
 *
 * Usa `scroll-behavior` nativo en lugar de una biblioteca de scroll virtual:
 * en móviles de gama baja, interceptar la rueda cuesta más de lo que aporta y
 * rompe el gesto del sistema.
 */
export function SmoothScroll({
  children,
  className = "",
  activo = true,
}: {
  children: ReactNode;
  className?: string;
  activo?: boolean;
}) {
  const m = useDocMotion();
  const suave = activo && m.activo;
  return (
    <div
      className={`${className} ${suave ? "doc-scroll-suave" : ""}`}
      style={{ scrollBehavior: suave ? "smooth" : "auto" }}
    >
      {children}
    </div>
  );
}

/** Desplaza un elemento a la vista respetando la preferencia de movimiento. */
export function desplazarA(elemento: HTMLElement | null, suave = true) {
  if (!elemento) return;
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  elemento.scrollIntoView({
    behavior: suave && !reduce ? "smooth" : "auto",
    block: "nearest",
  });
}
