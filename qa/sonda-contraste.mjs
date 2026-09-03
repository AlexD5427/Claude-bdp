/**
 * Sonda de CONTRASTE en un navegador real.
 *
 * ── Qué mide, y por qué hace falta además de la prueba unitaria ─────────────
 * `features/documentacion/__tests__/contraste.test.ts` mide los TOKENS: lee el
 * CSS, compone las capas y calcula la relación. Es rápido y preciso, pero mide lo
 * que el CSS declara, no lo que el navegador pinta. Entre las dos cosas hay
 * varias oportunidades de equivocarse: una superficie que se apila tres veces, un
 * `opacity` heredado, un color escrito a mano en un `style` inline, un chip sobre
 * un tinte de categoría.
 *
 * Esta sonda recorre las pantallas clave en los DOS temas y mide el contraste
 * EFECTIVO de cada texto visible: coge su `color` calculado y el fondo real
 * —subiendo por los ancestros hasta encontrar uno opaco y componiendo las capas
 * translúcidas del camino— y calcula la relación.
 *
 * ── Umbrales ────────────────────────────────────────────────────────────────
 * WCAG 2.1 AA: 4.5:1 en texto normal y 3:1 en texto grande (>= 24 px, o >= 18.66
 * px en negrita). Se ignoran los elementos sin texto, los invisibles y los que
 * están fuera de la ventana: medir un contraste de algo que nadie ve no dice
 * nada.
 *
 *     node qa/sonda-contraste.mjs
 */

import { chromium } from "playwright";
import {
  abrirDocumentacion,
  abrirExpedientes,
  arrancarServidor,
  comprobar,
  dato,
  nuevaPagina,
  nuevoRegistro,
  seccion,
  sembrarLibro,
  terminar,
} from "./arnes-documentacion.mjs";

const PUERTO = 5231;

/**
 * Función que se inyecta en la página para medir.
 *
 * Va como cadena porque tiene que evaluarse en el contexto del navegador. Compone
 * las capas translúcidas igual que `domain/contraste.ts`: es la misma matemática
 * y el mismo criterio, para que las dos comprobaciones no puedan discrepar.
 */
const MEDIDOR = `(() => {
  const leer = (valor) => {
    const m = String(valor).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(/[,/\\s]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const componer = (encima, debajo) => {
    const a = encima.a + debajo.a * (1 - encima.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    const mez = (x, y) => (x * encima.a + y * debajo.a * (1 - encima.a)) / a;
    return { r: mez(encima.r, debajo.r), g: mez(encima.g, debajo.g), b: mez(encima.b, debajo.b), a };
  };
  const lum = (c) => {
    const ch = (v) => { const s = Math.min(1, Math.max(0, v / 255)); return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  };
  const ratio = (texto, fondo) => {
    const efectivo = texto.a >= 1 ? texto : componer(texto, fondo);
    const l1 = lum(efectivo), l2 = lum(fondo);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  /**
   * Fondo real: se sube por los ancestros apilando lo translúcido.
   *
   * Devuelve nulo cuando por el camino hay un GRADIENTE o una imagen: ahí el
   * color de fondo no se puede deducir del CSS y cualquier número que se diera
   * sería inventado. Esos casos se cuentan aparte como «no medibles» en lugar de
   * reportarse como fallos, que es lo que convierte una sonda en ruido.
   */
  const fondoDe = (el) => {
    const capas = [];
    let n = el;
    while (n) {
      const s = getComputedStyle(n);
      const conImagen = s.backgroundImage && s.backgroundImage !== "none";
      /* El lavado de la página (un gradiente radial de muy baja opacidad sobre
         «--app-base») se ignora: es decorativo y su efecto en la luminancia es
         despreciable. Un gradiente en un elemento INTERIOR sí es un relleno de
         verdad y ahí no se puede deducir el color: se cuenta como no medible. */
      if (conImagen && n !== document.body && n !== document.documentElement) return null;
      const c = leer(s.backgroundColor);
      if (c && c.a > 0) {
        capas.unshift(c);
        if (c.a >= 0.999) break;
      }
      n = n.parentElement;
    }
    let fondo = { r: 255, g: 255, b: 255, a: 1 };
    for (const capa of capas) fondo = componer(capa, fondo);
    return fondo;
  };

  const problemas = [];
  let medidos = 0;
  let noMedibles = 0;
  /* Se recorren TODAS las superficies del módulo: el armazón y también los
     portales —la ventana del expediente y el asistente se pintan fuera de él—.
     Cada una lleva la clase «doc-console«, que es lo que las identifica. */
  const raices = [...document.querySelectorAll(".doc-console")];
  const vistos = new Set();
  for (const raiz of raices) for (const el of raiz.querySelectorAll("*")) {
    if (vistos.has(el)) continue;
    vistos.add(el);
    // Solo elementos con texto PROPIO: si se midiera el contenedor, se mediría
    // el mismo texto una vez por cada ancestro.
    const propio = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(" ");
    if (!propio) continue;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.bottom < 0 || r.top > window.innerHeight) continue;
    const texto = leer(s.color);
    if (!texto || texto.a === 0) continue;

    const fondo = fondoDe(el);
    if (!fondo) { noMedibles += 1; continue; }

    const px = parseFloat(s.fontSize) || 16;
    const peso = Number(s.fontWeight) || 400;
    const grande = px >= 24 || (px >= 18.66 && peso >= 700);
    const umbral = grande ? 3 : 4.5;
    const valor = ratio(texto, fondo);
    medidos += 1;
    if (valor < umbral - 0.01) {
      problemas.push({
        texto: propio.slice(0, 60),
        etiqueta: el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 2).join(".") : ""),
        ratio: Math.round(valor * 100) / 100,
        umbral,
        px: Math.round(px),
        color: s.color,
        fondo: "rgb(" + Math.round(fondo.r) + ", " + Math.round(fondo.g) + ", " + Math.round(fondo.b) + ")",
        cadena: (() => { const c = []; let n = el; while (n && c.length < 5) { c.push(n.tagName.toLowerCase() + (typeof n.className === "string" && n.className ? "." + n.className.split(" ").slice(0,2).join(".") : "")); n = n.parentElement; } return c.join(" < "); })(),
      });
    }
  }
  return { medidos, noMedibles, problemas };
})()`;

async function medir(pagina, etiqueta) {
  const { medidos, noMedibles, problemas } = await pagina.evaluate(MEDIDOR);
  const ok = problemas.length === 0;
  comprobar(
    ok,
    `${etiqueta} · ${medidos} texto(s) medido(s)${noMedibles ? `, ${noMedibles} sobre gradiente (no medible)` : ""}`,
    ok
      ? undefined
      : problemas
          .slice(0, 8)
          .map((p) => `${p.ratio}:1 (mínimo ${p.umbral}) · ${p.px}px · «${p.texto}» · texto ${p.color} sobre ${p.fondo}\n        ${p.cadena}`)
          .join("\n"),
  );
  return { medidos, problemas: problemas.length };
}

/** Cambia el tema poniendo la clase que usa la aplicación en `<html>`. */
async function ponerTema(pagina, tema) {
  await pagina.evaluate((t) => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(t);
  }, tema);
  await pagina.waitForTimeout(500);
}

async function main() {
  const { backend } = sembrarLibro();
  const servidor = await arrancarServidor(PUERTO);
  const navegador = await chromium.launch();
  const registro = nuevoRegistro();
  const pagina = await nuevaPagina(navegador, backend, registro, { puerto: PUERTO });
  await pagina.waitForTimeout(2500);

  let totalMedidos = 0;

  for (const tema of ["dark", "light"]) {
    seccion(`Contraste efectivo · tema ${tema === "light" ? "claro" : "oscuro"}`);
    await abrirDocumentacion(pagina);
    await ponerTema(pagina, tema);

    // 1. Panel: tarjetas, cifras, etiquetas de gráfico. Se navega
    // explícitamente porque la sección abierta se persiste entre visitas.
    await pagina.getByRole("button", { name: "Panel", exact: true }).last().click();
    await pagina.waitForTimeout(1600);
    await ponerTema(pagina, tema);
    let r = await medir(pagina, "panel de indicadores");
    totalMedidos += r.medidos;

    // 2. Lista de expedientes: tabla densa, chips de estado, paginación.
    await abrirExpedientes(pagina);
    await ponerTema(pagina, tema);
    r = await medir(pagina, "lista de expedientes");
    totalMedidos += r.medidos;

    // 3. Ventana del expediente: cabecera, bloques, contadores, observaciones.
    await pagina.locator("table tbody tr").first().click();
    await pagina.getByRole("dialog").first().waitFor({ timeout: 20000 });
    await pagina.waitForTimeout(900);
    await ponerTema(pagina, tema);
    r = await medir(pagina, "ventana del expediente");
    totalMedidos += r.medidos;
    await pagina.keyboard.press("Escape");
    await pagina.waitForTimeout(700);

    // 4. Asistente de alta: los cinco pasos, que es donde más texto de ayuda hay.
    await pagina.getByRole("button", { name: /Nuevo expediente/ }).first().click();
    const alta = pagina.getByRole("dialog", { name: "Nuevo expediente documental" });
    await alta.waitFor({ timeout: 20000 });
    await pagina.waitForTimeout(900);
    // La identidad es obligatoria: sin ella el asistente no avanza, y medir el
    // paso siguiente sería medir el mismo.
    await alta.getByPlaceholder("Ej. 1234567 LP").fill(`5550${tema === "light" ? "1" : "2"}00 LP`);
    await alta.getByPlaceholder("Nombres y apellidos").fill("Contraste De Prueba");
    await ponerTema(pagina, tema);
    r = await medir(pagina, "asistente · identidad");
    totalMedidos += r.medidos;

    const continuar = async () => {
      // `exact` es imprescindible: la cinta del borrador trae un «Continuar
      // donde lo dejé» que también coincide con /Continuar/.
      await alta.getByRole("button", { name: "Continuar", exact: true }).click();
      await pagina.waitForTimeout(900);
    };

    await continuar();
    r = await medir(pagina, "asistente · documentos generales");
    totalMedidos += r.medidos;

    await continuar();
    await alta.getByRole("radio", { name: /Funcionario área comercial/i }).click();
    await pagina.waitForTimeout(500);
    await alta.getByRole("radio", { name: /Tipo 2/ }).click();
    await pagina.waitForTimeout(700);
    r = await medir(pagina, "asistente · tipo de funcionario");
    totalMedidos += r.medidos;

    await continuar();
    r = await medir(pagina, "asistente · requisitos de la categoría");
    totalMedidos += r.medidos;

    await continuar();
    r = await medir(pagina, "asistente · revisión");
    totalMedidos += r.medidos;

    // Cerrar el asistente: hay datos escritos, así que pide confirmación.
    await alta.getByRole("button", { name: "Cerrar" }).click();
    await pagina.waitForTimeout(700);
    const confirmacion = pagina.getByRole("dialog", { name: "¿Cerrar el asistente?" });
    if (await confirmacion.count()) {
      await confirmacion.getByRole("button", { name: "Cerrar" }).click();
      await pagina.waitForTimeout(900);
    }
  }

  seccion("Resumen");
  dato("textos medidos en total", totalMedidos);
  comprobar(totalMedidos > 300, "se midió una muestra representativa (más de 300 textos)");

  terminar(registro, navegador, servidor);
}

await main();
