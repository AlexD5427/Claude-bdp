# Importación de evaluaciones — cómo se lee un documento y cómo marcar las claves

Este documento explica, con el detalle suficiente para que otra persona (u otra IA)
pueda reproducirlo o ampliarlo, cómo el módulo de Evaluaciones convierte un
archivo en un borrador de evaluación.

Archivos implicados:

| Archivo | Responsabilidad |
| --- | --- |
| `src/features/evaluaciones/imports/pdfTexto.ts` | Extrae texto de un `.pdf`. |
| `src/features/evaluaciones/imports/docxTexto.ts` | Extrae texto **con formato** de un `.docx`. |
| `src/features/evaluaciones/imports/questionParser.ts` | Convierte líneas en preguntas. |
| `src/features/evaluaciones/imports/parse.ts` | Detección de formato, tablas (`.xlsx`, `.csv`). |
| `src/features/evaluaciones/imports/ImportPanel.tsx` | Los tres pasos de la interfaz. |
| `src/features/evaluaciones/__tests__/importacion.parser.test.ts` | 23 pruebas sobre el formato real. |

Todo ocurre **en el navegador**. Ningún archivo se sube a ningún servidor, y la
única dependencia usada es `fflate`, que ya estaba en el proyecto.

---

## 1 · El formato que se reconoce

El importador está calibrado sobre las pruebas que usa el equipo. Este es el
formato de referencia (`PRUEBA AUDITOR PARA REV 1.docx`):

```
1. Según las NOGAI, el propósito principal de la auditoría interna es:
A) Elaborar estados financieros.
B) Detectar únicamente hechos de fraude.
C) Evaluar y mejorar los procesos de control, gestión de riesgos y gobierno.   ← subrayada
D) Sustituir los controles operativos.

2. De acuerdo con el Reglamento de Control Interno y Auditores Internos de la
ASFI, la Unidad de Auditoría Interna debe depender:
A) Del Gerente General.
…
```

### Reglas, una por una

| Se reconoce | Regla exacta | Notas |
| --- | --- | --- |
| **Sección** | Una línea que empieza por `Sección`, `Bloque`, `Módulo`, `Parte`, `Área` o `Tema`, seguida de `:`, `-` o `.` | También un párrafo con estilo *Título* de Word |
| **Pregunta** | `^(\d{1,3})\s*[).\-–:]\s*texto` — y el número **debe avanzar** | `Pregunta 5.` y `P5.` también valen |
| **Opción** | `^\(?([a-hA-H])\)?\s*[).\-–:]\s*texto` — y la letra debe ser la que toca | `A)`, `A.`, `a)`, `(A)`, `A -` |
| **Viñeta** | `^[•·▪◦*\-–—+]\s+texto`, o un párrafo de lista de Word | |
| **Continuación** | Cualquier otra línea | Se une a lo último abierto |
| **Tabla de respuestas** | Una línea que sea solo `Respuestas`, `Clave`, `Solucionario`, `Hoja de respuestas` | Todo lo que venga después se lee como claves |
| **Puntaje** | `(5 puntos)`, `[2 pts]` al final del enunciado | Se saca del enunciado y pasa a ser el puntaje |

### Las cuatro decisiones que hacen que funcione

1. **El número tiene que avanzar.** Después de la pregunta 16, un `1.` no abre
   pregunta: es una enumeración dentro del enunciado. Al empezar una sección
   nueva el contador se reinicia, así que una prueba numerada por secciones
   (1–10, luego 1–8) también se lee bien.
2. **La letra tiene que ser la que toca.** Tras `A)` viene `B)`. Así una línea
   como «A partir de la norma…» no se convierte en la opción A. Y una `A)` cuando
   la pregunta ya tenía dos opciones abre **otra pregunta**: son dos preguntas
   pegadas a las que no se les detectó el número.
3. **Una línea suelta continúa lo anterior.** El PDF corta el enunciado donde
   acaba el renglón; unir por continuación es lo que recompone «…la Unidad de» +
   «Auditoría Interna debe depender:» en una sola frase. La señal: la línea
   anterior no termina en `.`, `:`, `;`, `?` o `!`.
4. **Las viñetas dependen del contexto.** Si la pregunta tiene opciones con
   letra, las viñetas son parte del caso que plantea el enunciado. Si **no** las
   tiene, las viñetas *son* las opciones (hay bancos escritos así).

Una consecuencia deliberada: una línea que acaba en `?` dentro de una pregunta que
todavía no tiene opciones es el **remate del enunciado**, no una pregunta nueva.
Es el caso de «¿Cuál es la conclusión técnicamente más adecuada?» al final de un
caso con viñetas.

---

## 2 · De dónde sale la respuesta correcta

Tres vías, en este orden de confianza:

### a) El formato del documento — solo `.docx`

**Es la mejor y no exige escribir nada.** Si en el Word la opción correcta va
<u>subrayada</u> o resaltada, el importador la marca sola. Basta con que el 60 %
del texto de la opción lleve la marca, así que subrayar «C) Evaluar y mejorar…»
completa o solo la frase funciona igual.

> El subrayado **no** se traslada como formato a la opción: en estos documentos
> significa «esta es la correcta», y arrastrarlo dejaría la respuesta correcta
> subrayada delante del candidato. La negrita y la cursiva sí se conservan.

### b) Un marcador escrito a mano — cualquier origen

Al final del texto de la opción:

```
B) Independencia y objetividad. *
B) Independencia y objetividad. (correcta)
B) Independencia y objetividad. ✔
B) [X] Independencia y objetividad.
B) Independencia y objetividad. <--
```

El marcador se quita del texto: nunca llega al candidato.

### c) Una tabla de respuestas al final — cualquier origen

```
Respuestas
1-C, 2-C, 3-B, 4-D
5. A   6) b   7: C
```

Se admiten `1-C`, `1. C`, `1) c`, `1: C` y varias en la misma línea.

### Y si no hay ninguna

El panel de importación **lo dice** y pide las claves con una cuadrícula de
letras: un clic por pregunta. Nunca se inventa una clave, porque una clave
equivocada es mucho peor que una clave ausente.

**Un PDF no puede traer la clave por formato.** En un PDF el subrayado es un
rectángulo dibujado, no un atributo del texto: no hay nada que leer. Si tienes el
Word original, súbelo.

---

## 3 · Qué tipo de pregunta se crea

| Situación | Tipo | Puntaje |
| --- | --- | --- |
| 2 o más opciones | `opcion_unica` | Automático |
| 2 opciones y son Verdadero/Falso, Sí/No | `verdadero_falso` | Automático |
| Sin opciones | `texto_largo` | **Revisión manual** |

El puntaje total del borrador es **100 puntos repartidos** entre las preguntas que
puntúan (ver `src/features/evaluaciones/domain/puntaje.ts`). Una anotación
`(5 puntos)` en el enunciado tiene prioridad sobre el reparto.

---

## 4 · Excel y CSV

Es otra ruta: se detectan los encabezados por su nombre, sin acentos y sin
distinguir mayúsculas, con sinónimos. Los campos reconocidos son `enunciado`,
`tipo`, `seccion`, `puntos`, `obligatoria`, `ayuda`, `competencia`, `correcta` y
`opcion1`…`opcion6`. La columna `correcta` admite la letra (`B`), el número (`2`)
o el texto completo de la opción. Si la detección falla, el mapeo se corrige a
mano en el panel.

---

## 5 · Cómo se lee un PDF (y por qué era necesario reescribirlo)

El lector anterior buscaba literales entre `BT` y `ET` sobre los bytes crudos.
Con un PDF real eso no puede funcionar:

1. El flujo de contenido viene **comprimido** (`/FlateDecode`).
2. Los códigos de `(…)` y `<…>` no son caracteres: son **índices de glifo** de una
   fuente incrustada en subconjunto. Sin el `/ToUnicode` de esa fuente, «Según»
   sale como `\x03\x1f\x0b\x02`.

El lector nuevo:

- recorre los objetos del archivo y descomprime los flujos, incluidos los
  **flujos de objetos** (`/Type /ObjStm`), donde los PDF modernos esconden los
  diccionarios de fuente;
- construye un decodificador por fuente: `/ToUnicode` si lo hay, `WinAnsi` con
  sus `/Differences` si no, latin1 como último recurso;
- interpreta `Tj`, `TJ`, `'`, `"`, `Td`, `TD`, `T*`, `TL`, `Tm` y `Tf` llevando la
  cuenta de la posición, y **agrupa los fragmentos por coordenada vertical**.

Lo último es lo que hace el resultado utilizable: un generador puede partir una
línea en veinte operadores (uno por glifo, como hace Chromium), y quien lee línea
a línea necesita la línea.

Dos detalles que costaron su ajuste y conviene no deshacer:

- El **eje Y** de un PDF crece hacia arriba, pero un generador puede voltearlo con
  la matriz de texto (`1 0 0 -1 x y Tm`). El orden de lectura se guarda ya
  orientado en cada fragmento.
- Los **espacios entre fragmentos** se deciden contra el TAMAÑO de la fuente, no
  contra una distancia absoluta. Con un umbral absoluto salía un espacio entre
  cada letra («E l a b o r a r»), y con un ancho medio demasiado corto salían
  espacios dentro de las palabras («únicam ente»), que rompen la detección.

Lo que **no** hace: OCR. Un PDF escaneado es una imagen; en ese caso el panel lo
dice y sugiere el Word original o un OCR previo.

---

## 6 · Probar un archivo nuevo sin abrir el navegador

Las pruebas del analizador usan listas de líneas, así que reproducir un formato
nuevo es añadir un caso a `importacion.parser.test.ts`:

```ts
const { informe, secciones } = analizarPreguntas(comoLineasDocumento([
  "1. ¿Enunciado?",
  "A) Una",
  "B) Otra *",
]));
expect(informe[0].correcta).toBe(1);
```

Para un `.docx` con formato, `conFormato([{ texto: "B) Otra", subrayado: true }])`.

---

## 7 · Qué falta y cómo se añadiría

- **Formatos de Excel propios del equipo.** Están pendientes de recibir. El punto
  de entrada es `convertirTabla` en `parse.ts`; añadir un formato es añadir
  sinónimos a `SINONIMOS` o una función de conversión propia y elegirla por la
  forma de los encabezados.
- **Imágenes dentro de las preguntas.** El modelo ya tiene `medios` y
  `opcion.imagenUrl`; el importador no las extrae todavía (habría que subir el
  recurso a algún sitio y poner la URL).
- **Cuadrículas y emparejamientos.** El modelo los admite; la detección desde
  prosa no está hecha porque en los documentos del equipo no aparecen.
