import { useLayoutEffect, useRef } from "react";
import { animate } from "framer-motion";
import { useCalmMotion } from "../hooks/useCalmMotion";

/**
 * Prefijo · signo · entero · (separador · 1–2 decimales) · sufijo.
 * Acepta «128», «72.5%», «-0.35», «4,2 pts». Lo que no encaja (texto, «N/A»,
 * más de dos decimales) se muestra tal cual, sin animar.
 */
const PATRON = /^([^\d-]*)(-?)(\d+)(?:([.,])(\d{1,2}))?(\D*)$/;

interface Partes {
  prefijo: string;
  numero: number;
  decimales: number;
  separador: string;
  sufijo: string;
}

function analizar(valor: string): Partes | null {
  const m = PATRON.exec(valor.trim());
  if (!m) return null;
  const prefijo = m[1] ?? "";
  const signo = m[2] ?? "";
  const entero = m[3] ?? "0";
  const separador = m[4] ?? ".";
  const fraccion = m[5] ?? "";
  const sufijo = m[6] ?? "";
  const numero = Number(`${signo}${entero}${fraccion ? `.${fraccion}` : ""}`);
  if (!Number.isFinite(numero)) return null;
  return { prefijo, numero, decimales: fraccion.length, separador, sufijo };
}

function formatear(partes: Partes, valor: number): string {
  let texto = valor.toFixed(partes.decimales);
  // Nunca «-0» ni «-0.0» a mitad de la cuenta.
  if (/^-0(?:\.0+)?$/.test(texto)) texto = texto.slice(1);
  if (partes.separador === ",") texto = texto.replace(".", ",");
  return `${partes.prefijo}${texto}${partes.sufijo}`;
}

/**
 * Cifra que cuenta hasta su valor al aparecer y al cambiar (los filtros, una
 * recarga), con una curva que frena al final.
 *
 * El número se escribe directamente en el nodo dentro del fotograma de
 * animación —sin pasar por el estado de React—, así que contar no provoca
 * ningún renderizado. Los lectores de pantalla leen siempre el valor final (el
 * texto que cuenta es `aria-hidden`). Con movimiento reducido se muestra el
 * valor final sin animar.
 */
export function AnimatedValue({ value }: { value: string }) {
  const calm = useCalmMotion();
  const nodo = useRef<HTMLSpanElement>(null);
  const actual = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = nodo.current;
    if (!el) return;
    const partes = analizar(value);
    if (calm || !partes) {
      el.textContent = value;
      actual.current = partes ? partes.numero : null;
      return;
    }
    const desde = actual.current ?? 0;
    if (desde === partes.numero) {
      el.textContent = value;
      return;
    }
    el.textContent = formatear(partes, desde);
    const control = animate(desde, partes.numero, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v: number) => {
        actual.current = v;
        el.textContent = formatear(partes, v);
      },
      onComplete: () => {
        actual.current = partes.numero;
        el.textContent = value;
      },
    });
    return () => control.stop();
  }, [value, calm]);

  return (
    <>
      <span className="sr-only">{value}</span>
      <span ref={nodo} aria-hidden />
    </>
  );
}
