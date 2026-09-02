/**
 * Sonda de CONTRASTE en navegador real.
 *
 * ── Qué añade sobre la prueba de tokens ─────────────────────────────────────
 * `__tests__/contraste.test.ts` mide los TOKENS: garantiza que el valor declarado
 * en `documentacion.css` cumple 4,5:1 sobre el fondo de referencia. Es necesario y
 * no es suficiente, porque en la pantalla real puede pasar otra cosa:
 *
 *   · un componente que ignora el token y escribe un color a mano;
 *   · un texto sobre una superficie translúcida distinta de la de referencia;
 *   · una clase de Tailwind heredada de la época en que el módulo pintaba con
 *     `text-cyan-200`, pensada solo para fondo oscuro.
 *
 * Esta sonda abre la consola en Chromium, recorre el texto REAL de las pantallas
 * clave en los dos temas, resuelve el color efectivo y el fondo efectivo con
 * `getComputedStyle`, y calcula la relación de contraste de WCAG 2.1 sobre lo que
 * se ve. Es la diferencia entre «el token está bien» y «el texto se lee».
 *
 * Uso:
 *   node qa/sonda-contraste.mjs
 *
 * Requiere Playwright (fuera de las dependencias del proyecto, a propósito):
 *   npm i -D playwright && npx playwright install chromium --with-deps
 */
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { crearExpediente, loadInstalledBackend } from "../scripts/documentacion-backend.mjs";

const PUERTO = 5231;
const RAIZ = new URL("..", import.meta.url).pathname;

/* Umbrales de WCAG 2.1 nivel AA. */
const AA_NORMAL = 4.5;
const AA_GRANDE = 3;

/**
 * Cuántas incidencias se toleran: NINGUNA.
 *
 * La tentación al escribir una sonda así es dejar un margen «para los casos
 * raros». El problema es que los casos raros son precisamente el texto de ayuda
 * y los recuentos, que es donde el contraste falla y donde más se necesita.
 */
const TOLERANCIA = 0;

function sembrar() {
  const h = loadInstalledBackend();
  const nombres = ["Ana Quiroga Vargas", "Luis Fernando Mamani", "Rocío Casas Peña", "Jorge Ariel Salazar"];
  nombres.forEach((nombre, i) => {
    const creado = crearExpediente(h, {
      identificador: `900000${i}`,
      nombre,
      cargo: "OFICIAL DE NEGOCIOS",
      agencia: i % 2 ? "LA PAZ" : "SANTA CRUZ",
      gerencia: "GERENCIA DE RIESGOS",
      fechaIngreso: h.read("doc2Hoy_()"),
      tipoFuncionario: i === 0 ? "COMERCIAL" : "GENERAL",
      tipoGarantia: i === 0 ? "COMERCIAL_2" : "NINGUNA",
    });
    // Datos suficientes para que se pinten chips de todos los estados.
    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId: creado.expedienteId });
    const cambios = detalle.requisitos.slice(0, 6).map((r, k) => ({
      expedienteDocumentoId: r.expedienteDocumentoId,
      estado: ["ENTREGADO", "NO_ENTREGADO", "PENDIENTE"][k % 3],
      ...(r.requiereConteoHojas ? { hojasFisicas: k + 1 } : {}),
      ...(k === 0 ? { observaciones: "Recibida en físico y digital." } : {}),
    }));
    h.ok("documentacion.requisitos.guardar", { expedienteId: creado.expedienteId, cambios });
  });
  return h;
}

/**
 * Script que corre DENTRO de la página.
 *
 * Se pasa como texto y no como función importada porque tiene que evaluarse en el
 * contexto del navegador, donde `getComputedStyle` existe. Sube por los ancestros
 * buscando el primer fondo opaco, que es lo que de verdad hay detrás del texto:
 * `background-color: transparent` es lo normal en la mayoría de los elementos y
 * quedarse en el primero daría un contraste inventado.
 */
const MEDIDOR = () => {
  const canal = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminancia = ([r, g, b]) => 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
  const leer = (texto) => {
    const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/.exec(texto || "");
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
  };
  const componer = (frente, fondo) => [
    frente[0] * frente[3] + fondo[0] * (1 - frente[3]),
    frente[1] * frente[3] + fondo[1] * (1 - frente[3]),
    frente[2] * frente[3] + fondo[2] * (1 - frente[3]),
    1,
  ];

  /** Primer fondo OPACO subiendo por los ancestros, componiendo los translúcidos. */
  const fondoEfectivo = (nodo) => {
    const capas = [];
    let actual = nodo;
    while (actual && actual !== document.documentElement) {
      const color = leer(getComputedStyle(actual).backgroundColor);
      if (color && color[3] > 0.01) {
        capas.unshift(color);
        if (color[3] >= 0.995) break;
      }
      actual = actual.parentElement;
    }
    // Base: el fondo del documento, o blanco/negro según el tema.
    const raiz = leer(getComputedStyle(document.body).backgroundColor);
    let base = raiz && raiz[3] >= 0.995 ? raiz : document.documentElement.classList.contains("light") ? [255, 255, 255, 1] : [8, 18, 33, 1];
    for (const capa of capas) base = componer(capa, base);
    return base;
  };

  const incidencias = [];
  let medidos = 0;

  const candidatos = document.querySelectorAll(
    ".doc-console p, .doc-console span, .doc-console h1, .doc-console h2, .doc-console h3, .doc-console h4, " +
      ".doc-console dt, .doc-console dd, .doc-console td, .doc-console th, .doc-console li, .doc-console label, .doc-console button",
  );

  for (const nodo of candidatos) {
    // Solo texto propio y visible: un contenedor sin texto no tiene contraste.
    const propio = [...nodo.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    if (!propio) continue;

    const caja = nodo.getBoundingClientRect();
    if (caja.width < 2 || caja.height < 2) continue;
    const estilo = getComputedStyle(nodo);
    if (estilo.visibility === "hidden" || Number(estilo.opacity) < 0.15) continue;

    const color = leer(estilo.color);
    if (!color) continue;

    const fondo = fondoEfectivo(nodo);
    const frente = componer(color, fondo);
    const a = luminancia(frente);
    const b = luminancia(fondo);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

    // Texto «grande» según WCAG: >= 24 px, o >= 18,66 px en negrita.
    const px = parseFloat(estilo.fontSize);
    const peso = Number(estilo.fontWeight) || 400;
    const grande = px >= 24 || (px >= 18.66 && peso >= 700);
    const umbral = grande ? 3 : 4.5;

    medidos += 1;
    if (ratio + 0.005 < umbral) {
      incidencias.push({
        texto: propio.slice(0, 70),
        ratio: Number(ratio.toFixed(2)),
        umbral,
        px: Number(px.toFixed(1)),
        peso,
        color: estilo.color,
        fondo: `rgb(${fondo.slice(0, 3).map(Math.round).join(", ")})`,
        clase: String(nodo.className || "").slice(0, 70),
      });
    }
  }

  return { medidos, incidencias, candidatos: candidatos.length, consolas: document.querySelectorAll('.doc-console').length };
};

async function main() {
  const backend = sembrar();

  const vite = spawn("npx", ["vite", "--port", String(PUERTO), "--strictPort"], {
    cwd: RAIZ,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolver, rechazar) => {
    const t = setTimeout(() => rechazar(new Error("Vite no arrancó")), 90000);
    vite.stdout.on("data", (d) => {
      if (String(d).includes("ready in") || String(d).includes("Local:")) {
        clearTimeout(t);
        setTimeout(resolver, 900);
      }
    });
  });

  const navegador = await chromium.launch();
  const contexto = await navegador.newContext({ viewport: { width: 1500, height: 950 } });
  const pagina = await contexto.newPage();

  await pagina.route((url) => url.hostname.endsWith("script.google.com"), async (ruta) => {
    if (ruta.request().method() !== "POST") {
      return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidatos: [], competencias: [] }) });
    }
    const cuerpo = JSON.parse(ruta.request().postData() ?? "{}");
    const salida = backend.call("doPost", { postData: { contents: JSON.stringify(cuerpo) } });
    await ruta.fulfill({ status: 200, contentType: "application/json", body: salida.getContent() });
  });

  await pagina.goto(`http://localhost:${PUERTO}/qa/documentacion.html`, { waitUntil: "networkidle" });
  await pagina.waitForTimeout(2600);

  const PANTALLAS = [
    ["Panel", "panel"],
    ["Expedientes", "expedientes"],
    ["Solicitudes", "solicitudes"],
    ["Prórrogas", "prorrogas"],
    ["Reportes", "reportes"],
    ["Configuración", "configuracion"],
  ];

  let totalIncidencias = 0;
  let totalMedidos = 0;

  for (const tema of ["oscuro", "claro"]) {
    // El tema se conmuta con la clase `light` en la raíz, igual que el dock.
    await pagina.evaluate((t) => {
      document.documentElement.classList.toggle("light", t === "claro");
    }, tema);
    await pagina.waitForTimeout(500);

    console.log(`\n▸ Tema ${tema}`);

    for (const [etiqueta, seccion] of PANTALLAS) {
      const boton = pagina.locator(`.doc-console button:has-text("${etiqueta}")`).first();
      if (await boton.count()) {
        await boton.click({ timeout: 4000 }).catch(() => {});
        await pagina.waitForTimeout(900);
      }

      const { medidos, incidencias, candidatos, consolas } = await pagina.evaluate(MEDIDOR);
      totalMedidos += medidos;
      totalIncidencias += incidencias.length;

      if (incidencias.length === 0) {
        console.log(`  ✓ ${etiqueta.padEnd(16)} ${String(medidos).padStart(4)} textos medidos de ${candidatos} candidatos (${consolas} consolas), todos por encima del umbral`);
      } else {
        console.log(`  ✗ ${etiqueta.padEnd(16)} ${String(medidos).padStart(4)} textos medidos, ${incidencias.length} por debajo:`);
        for (const i of incidencias.slice(0, 8)) {
          console.log(
            `      ${i.ratio}:1 (hace falta ${i.umbral}:1) · ${i.px}px/${i.peso} · «${i.texto}»\n` +
              `        color ${i.color} sobre ${i.fondo}${i.clase ? `\n        clase: ${i.clase}` : ""}`,
          );
        }
        if (incidencias.length > 8) console.log(`      … y ${incidencias.length - 8} más`);
      }
    }

    /* El asistente de alta se mide aparte: es la superficie con más texto de
       ayuda del módulo, y la ayuda es justo lo que solía quedarse corto. */
    const nuevo = pagina.locator('.doc-console button:has-text("Nuevo expediente")').first();
    if (await nuevo.count()) {
      await nuevo.click({ timeout: 4000 }).catch(() => {});
      await pagina.waitForTimeout(1100);
      const { medidos, incidencias } = await pagina.evaluate(MEDIDOR);
      totalMedidos += medidos;
      totalIncidencias += incidencias.length;
      if (incidencias.length === 0) {
        console.log(`  ✓ ${"Alta (asistente)".padEnd(16)} ${String(medidos).padStart(4)} textos medidos, todos por encima del umbral`);
      } else {
        console.log(`  ✗ ${"Alta (asistente)".padEnd(16)} ${incidencias.length} por debajo del umbral:`);
        for (const i of incidencias.slice(0, 8)) {
          console.log(`      ${i.ratio}:1 (hace falta ${i.umbral}:1) · «${i.texto}»`);
        }
      }
      /*
       * Cerrar el asistente de verdad, no «intentarlo».
       *
       * Si queda abierto, las secciones del tema siguiente no se pueden pulsar
       * —la hoja las tapa— y la sonda mide siete veces la misma pantalla creyendo
       * que recorrió seis. Se insiste hasta que el diálogo desaparece.
       */
      for (let intento = 0; intento < 4; intento++) {
        if (!(await pagina.locator('[aria-label="Nuevo expediente documental"]').count())) break;
        await pagina.keyboard.press("Escape").catch(() => {});
        await pagina.waitForTimeout(450);
        const confirmar = pagina.locator('button:has-text("Cerrar")').first();
        if (await confirmar.count()) await confirmar.click({ timeout: 2500 }).catch(() => {});
        await pagina.waitForTimeout(450);
      }
      const sigueAbierto = await pagina.locator('[aria-label="Nuevo expediente documental"]').count();
      if (sigueAbierto) console.log("  ! el asistente no se cerró: las medidas siguientes pueden repetirse");
    }
  }

  console.log(
    `\n${totalMedidos} textos medidos en los dos temas · ${totalIncidencias} por debajo de AA (umbral ${AA_NORMAL}:1 normal / ${AA_GRANDE}:1 grande).`,
  );

  await navegador.close();
  vite.kill("SIGTERM");

  if (totalIncidencias > TOLERANCIA) {
    console.log("\n✗ Hay texto que no cumple WCAG AA. Corrige el token o el color del componente, no el umbral.");
    process.exitCode = 1;
  } else {
    console.log("\n✓ Todo el texto medido cumple WCAG AA en los dos temas.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
