/**
 * Sonda de contraste, en un navegador real.
 *
 * ── Qué mide y por qué hace falta un navegador ──────────────────────────────
 * `src/design-system/__tests__/contraste.test.ts` comprueba los tokens uno a
 * uno: es rápido y no necesita navegador, pero mira los valores DECLARADOS. Lo
 * que se pinta puede ser otra cosa: una superficie translúcida sobre otra
 * translúcida, un `opacity` heredado, un `color` que en realidad viene de una
 * variable que no resolvió. Esta sonda mide el contraste EFECTIVO de cada nodo
 * de texto ya pintado, con el CSS de verdad aplicado, en los dos temas.
 *
 *   node qa/sonda-contraste.mjs
 *
 * Recorre las pantallas donde el área trabaja de verdad: el panel, la lista de
 * expedientes, el asistente de alta y la ventana del expediente.
 */
import {
  abrirDocumentacion,
  arrancarVite,
  chromium,
  comprobar,
  irASeccion,
  nuevaPagina,
  nuevoRegistro,
  sembrar,
  terminar,
} from "./doc-arnes.mjs";

const PUERTO = 5231;

/**
 * Medición del contraste dentro del navegador.
 *
 * Se ejecuta EN LA PÁGINA porque hace falta `getComputedStyle` y recorrer los
 * ancestros para encontrar el primer fondo opaco: el contraste de un texto sobre
 * `rgba(255,255,255,0.04)` depende de lo que haya debajo, y eso solo lo sabe el
 * navegador.
 */
const MEDIDOR = () => {
  const parse = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c || "");
    if (!m) return null;
    const p = m[1].split(",").map((x) => parseFloat(x.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
  };
  const mezclar = (frente, fondo) => ({
    r: frente.r * frente.a + fondo.r * (1 - frente.a),
    g: frente.g * frente.a + fondo.g * (1 - frente.a),
    b: frente.b * frente.a + fondo.b * (1 - frente.a),
    a: 1,
  });
  const lum = (c) => {
    const ch = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a);
    const l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  /** Fondo efectivo de un nodo: se apilan los ancestros hasta el primer opaco. */
  const fondoDe = (nodo) => {
    const capas = [];
    let n = nodo;
    while (n && n !== document.documentElement) {
      const bg = parse(getComputedStyle(n).backgroundColor);
      if (bg && bg.a > 0) {
        capas.push(bg);
        if (bg.a >= 0.999) break;
      }
      n = n.parentElement;
    }
    let base = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
    if (base.a < 1) base = { r: 255, g: 255, b: 255, a: 1 };
    let acumulado = base;
    for (let i = capas.length - 1; i >= 0; i--) acumulado = mezclar(capas[i], acumulado);
    return acumulado;
  };

  const problemas = [];
  let medidos = 0;
  const nodos = document.querySelectorAll(".doc-console *");
  for (const nodo of nodos) {
    // Solo nodos con texto propio y visible: medir un contenedor mide su
    // color heredado, no lo que se lee.
    const texto = [...nodo.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    if (texto.length < 2) continue;
    const estilo = getComputedStyle(nodo);
    if (estilo.visibility === "hidden" || estilo.display === "none") continue;
    if (Number(estilo.opacity) < 0.5) continue;
    const caja = nodo.getBoundingClientRect();
    if (caja.width < 4 || caja.height < 4) continue;

    const color = parse(estilo.color);
    if (!color) continue;
    const fondo = fondoDe(nodo);
    const efectivo = color.a < 1 ? mezclar(color, fondo) : color;
    const r = ratio(efectivo, fondo);

    // Umbral de WCAG AA: 3:1 para texto grande (>= 24 px, o >= 18.66 px en
    // negrita) y 4.5:1 para el resto.
    const px = parseFloat(estilo.fontSize);
    const peso = parseInt(estilo.fontWeight, 10) || 400;
    const grande = px >= 24 || (px >= 18.66 && peso >= 700);
    const minimo = grande ? 3 : 4.5;
    medidos += 1;
    if (r < minimo) {
      problemas.push({
        texto: texto.slice(0, 60),
        ratio: Number(r.toFixed(2)),
        minimo,
        px: Number(px.toFixed(1)),
        peso,
        clase: String(nodo.className).slice(0, 60),
        color: estilo.color,
        fondo: `rgb(${Math.round(fondo.r)}, ${Math.round(fondo.g)}, ${Math.round(fondo.b)})`,
      });
    }
  }
  return { medidos, problemas };
};

async function medir(pagina, etiqueta) {
  const { medidos, problemas } = await pagina.evaluate(MEDIDOR);
  const ok = problemas.length === 0;
  comprobar(`${etiqueta} — ${medidos} nodo(s) de texto medido(s)`, ok, ok ? "" : `${problemas.length} por debajo del umbral`);
  if (!ok) {
    for (const p of problemas.slice(0, 10)) {
      console.log(`      ${p.ratio}:1 (mínimo ${p.minimo}) · ${p.px}px/${p.peso} · ${p.color} sobre ${p.fondo} · «${p.texto}»`);
    }
  }
  return ok ? 0 : 1;
}

async function main() {
  const vite = await arrancarVite(PUERTO);
  const { backend } = sembrar({ cuantos: 8 });
  const registro = nuevoRegistro();
  const navegador = await chromium.launch();

  let fallos = 0;

  /**
   * Una página POR TEMA, con el tema puesto ANTES de cargar.
   *
   * ── Por qué no basta con cambiar la clase del `<html>` ────────────────────
   * El fondo de la aplicación no lo pinta el CSS: lo pinta React
   * (`MeshBackground`) según el estado del tema. Si se fuerza la clase `light`
   * sin cambiar ese estado, el módulo se vuelve claro sobre un fondo que sigue
   * siendo oscuro, y el contraste medido no corresponde a nada que exista: es un
   * gris intermedio inventado por la mezcla. Así que el tema se escribe en su
   * clave de almacenamiento y se carga la página desde cero.
   */
  for (const tema of ["dark", "light"]) {
    console.log(`\n▸ Tema ${tema === "dark" ? "oscuro" : "claro"}`);
    const pagina = await nuevaPagina(navegador, backend, registro, {
      puerto: PUERTO,
      almacenamiento: { "bdp-theme": tema },
    });
    await abrirDocumentacion(pagina);

    fallos += await medir(pagina, "panel del módulo");

    await irASeccion(pagina, "Expedientes");
    fallos += await medir(pagina, "lista de expedientes");

    // Asistente de alta: la superficie con más texto secundario del módulo.
    await pagina.getByRole("button", { name: /Nuevo expediente/ }).first().click();
    await pagina.waitForTimeout(1200);
    fallos += await medir(pagina, "asistente de alta · identidad");
    await pagina.getByRole("button", { name: /Continuar/ }).first().click();
    await pagina.waitForTimeout(900);
    fallos += await medir(pagina, "asistente de alta · documentos generales");
    await pagina.getByRole("button", { name: /Continuar/ }).first().click();
    await pagina.waitForTimeout(900);
    fallos += await medir(pagina, "asistente de alta · tipo de funcionario");
    await pagina.keyboard.press("Escape");
    await pagina.waitForTimeout(600);
    const cerrar = pagina.getByRole("button", { name: "Cerrar", exact: true }).first();
    if (await cerrar.count()) await cerrar.click().catch(() => {});
    await pagina.waitForTimeout(900);

    // Ventana del expediente.
    await irASeccion(pagina, "Expedientes");
    await pagina.getByRole("button", { name: /^Abrir el expediente/ }).first().click();
    await pagina.waitForTimeout(1600);
    fallos += await medir(pagina, "ventana del expediente");
    await pagina.keyboard.press("Escape");
    await pagina.waitForTimeout(900);

    /* Autodiagnóstico y preferencias.
       Va incluido porque es la pantalla a la que llega alguien cuando algo se
       rompió, y porque es la que más texto secundario tiene por centímetro: los
       botones grandes llevan una explicación en gris debajo del título y la tabla
       de datos técnicos es toda etiqueta atenuada. Es justo donde un token de
       tinta demasiado suave se cuela sin que nadie lo note. */
    await irASeccion(pagina, "Configuración");
    await pagina.getByRole("tab", { name: "Esta pantalla" }).click();
    await pagina.waitForTimeout(1200);
    fallos += await medir(pagina, "autodiagnóstico y preferencias");

    await pagina.context().close();
  }

  await terminar({ vite, navegador, fallos, registro });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
