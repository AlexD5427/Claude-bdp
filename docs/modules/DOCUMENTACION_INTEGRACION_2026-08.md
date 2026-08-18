# Módulo de Documentación — integración, arreglos y rediseño del alta

> Documento explicativo del trabajo de esta iteración. Está escrito para dos
> lectores: quien nunca tocó el módulo y necesita el mapa completo, y quien ya lo
> conoce y quiere ir directo a lo que cambió. Las secciones marcadas como **Fondo**
> pueden saltarse si ya se domina el sistema.

## Fondo

### El sistema, en una frase

El módulo de Documentación es una consola web que persigue el papeleo de
incorporación de cada persona que entra al Banco de Desarrollo Productivo. No hay
base de datos relacional detrás: hay **una hoja de cálculo de Google** y un
proyecto de **Google Apps Script** que la lee y la escribe. El frontend (React)
habla con ese Apps Script por HTTP.

> **Concepto clave — dos capas sobre una hoja.** Debajo hay 19 hojas
> «normalizadas» (una fila por hecho: un expediente, un documento, una prórroga).
> Encima, el libro anual `CONTROL INGRESOS <año>` que el área reconoce, con sus
> mismas columnas y colores. El modelo normalizado es la verdad; el libro anual es
> el espejo. Quien prefiere trabajar en Sheets sigue pudiendo.

### Cómo decide el sistema qué documentos pedir

La pieza central es el **catálogo** (`CatalogoDocumentos`) y su **motor de
aplicabilidad** (`doc2Aplicables_`). Cada documento del catálogo declara a qué
`tipo_funcionario` y a qué `tipo_garantia` aplica. Cuando se crea un expediente
con una rama concreta, el backend recorre el catálogo y genera **solo** los
requisitos que aplican a esa rama. El formulario, la vista, los reportes y las
exportaciones preguntan todos a la misma función: por eso no pueden discrepar.

### El punto ciego que arrastraba el módulo

El sistema son en realidad **tres backends distintos** desplegados por separado:
el del talento (`SCRIPT_URL`), el de Evaluaciones y el de Documentación. Cada uno
es un proyecto de Apps Script con su propia URL `…/exec`. El detalle que importa
para esta iteración: **la consola nueva de Documentación no estaba usando la URL
de su propio backend**; usaba, por defecto, la URL general del talento. Hablarle a
la puerta equivocada es exactamente lo que producía el «no se conecta».

## Intuición

Esta iteración hace cinco cosas. Cada una tiene una intuición corta.

**1 · Cada puerta tiene su llave.** El módulo ahora guarda la URL de *su* backend
y la usa desde la primera llamada; si no hay ninguna, lo dice con claridad en vez
de tocar la puerta de al lado.

**2 · El alta es un camino con un cruce.**

1. **¿Quién ingresa?** — identidad (identificador, nombre, cargo, agencia,
   gerencia, fecha de ingreso).
2. **Lo que todos deben traer** — los 18 documentos generales.
3. **El cruce** — el *tipo de funcionario*. Aquí el camino se bifurca:
   - **Comercial** pide, además, una **garantía** (Tipo 1, 2 o 3), y cada tipo
     tiene su propia lista.
   - **Auditoría** pide una sola declaración.
   - **Cumplimiento** pide dos acreditaciones.
   - **Ejecutivo / Directorio** todavía no tiene lista: se muestra, pero
     «en construcción».
4. **Solo lo de tu rama** — a partir del cruce, el expediente muestra únicamente
   sus documentos, de principio a fin.
5. **Confirmar y abrir.**

**3 · Un solo candado con contador.** Imagina dos personas cerrando con llave la
misma puerta. Si cada una recuerda «cómo estaba antes» y la última en salir
restaura ese estado, cerrar en distinto orden deja la puerta **trancada**. La
solución es un único candado con contador: la puerta se abre solo cuando el último
suelta.

**4 · Un efecto que se remonta es un efecto que se ejecuta.** Este es el hallazgo
más importante de la iteración y merece su propio bloque.

> **Concepto clave — dependencias inestables.** Un `useEffect` cuyas dependencias
> incluyen una función creada en cada renderizado **se desmonta y se vuelve a
> montar en cada renderizado**. Si su limpieza hace algo visible —mover el foco,
> cancelar una petición, restaurar un estilo—, ese algo ocurre en cada tecla que
> se pulsa. En el panel del expediente, la limpieza devolvía el foco al elemento
> que estaba enfocado antes de abrir el panel. Resultado medido: al escribir una
> observación entraba **una sola letra** y el foco saltaba a un botón.

**5 · El color tiene que significar.** En la lista de requisitos, el estado
elegido se teñía de azul —el color de «información»— tanto si el documento estaba
entregado como si no había llegado. Ahora es verde, ámbar, rojo y gris, en el
orden que usa el área, igual que en el asistente y que en el libro.

## Cómo se investigó: un navegador de verdad

Nada de lo anterior se puede ver en `jsdom`. Para esta iteración se construyó un
banco de pruebas con Chromium real (Playwright), **deliberadamente fuera de las
dependencias del proyecto** para no añadir 150 MB al `npm ci` de Vercel:

```bash
npm i -D playwright && npx playwright install chromium --with-deps
```

| Arnés | Qué contesta |
| --- | --- |
| `qa/documentacion-app.mjs` | Monta la **aplicación completa** (acceso, dock, superposiciones globales) con el backend `.gs` real en memoria. Recorre el alta y comprueba que la página siga respondiendo tras abrir y cerrar paneles. |
| `qa/sonda-foco-expediente.mjs` | Escribe una observación letra a letra en el panel del expediente y compara lo escrito con lo que llegó. |
| `qa/sonda-congelamiento.mjs` | Abre y cierra superposiciones de tres módulos y mira una sola cosa: si el `body` quedó con `overflow: hidden`. |
| `qa/sonda-salida-perfil.mjs` | Pide salir del formulario de perfil de cargo y comprueba que la confirmación queda **encima** y se puede pulsar. |
| `qa/visual-documentacion.mjs` | Recorre las diez pantallas y saca las capturas de esta documentación. |

La sonda del foco es la que clavó el fallo:

```
✗ se puede escribir en las observaciones del expediente
   esperado: "Falta la ultima pagina del certificado"
   escrito:  "F"
   foco tras escribir: <button>
```

Y con el arreglo:

```
✓ se puede escribir en las observaciones del expediente
   escrito:  "Falta la ultima pagina del certificado"
   foco tras escribir: <textarea>
```

## El código, sección por sección

### 1 · El catálogo, redefinido por rama (backend)

En `11_Domain.gs` se reescribió la sección de garantías del catálogo semilla para
que coincida con el proceso real del área, con **17 documentos de garantía** en el
orden exacto en que se presentan por rama:

```js
/* Tipo 1 · garante con bien inmueble + garante familiar */
{ codigo: 'garante-ci', ... garantia: ['COMERCIAL_1'] },
{ codigo: 'garante-inmueble', ... garantia: ['COMERCIAL_1', 'COMERCIAL_3'] },
{ codigo: 'garante-folio', ... garantia: ['COMERCIAL_1', 'COMERCIAL_3'] },
{ codigo: 'garante-t1-fam-ci', ... garantia: ['COMERCIAL_1'] },
{ codigo: 'garante-t1-fam-croquis', ... garantia: ['COMERCIAL_1'] },
/* Tipo 2 · garante con ingresos + dos garantes familiares (9 docs) */
/* Tipo 3 · inmueble propio + garante familiar (reusa inmueble y folio) */
```

Auditoría y Cumplimiento dejaron de compartir el documento `lgi-ft`: ahora cada
rama ve solo lo suyo. Se subió `DOC2_CATALOGO_VERSION` a `2` para que reinstalar
refresque la aplicabilidad **sin tocar** los expedientes ya creados. El catálogo
heredado (`00_Manifest.gs`) recibió los 7 códigos nuevos para que ambas listas
sigan describiendo los mismos documentos.

> **Recuentos que cambian:** el catálogo pasa de 31 a **38** documentos. Las ramas
> ahora exigen: General 18 · Comercial T1 23 · T2 27 · T3 23 · Auditoría 19 ·
> Cumplimiento 20. Las pruebas y el verificador de coherencia se actualizaron a
> estos números.

### 2 · Identidad de categorías (frontend)

`src/features/documentacion/domain/categorias.tsx` es una fuente única con el
**color** y el **icono SVG** propio de cada categoría, más las tarjetas de
garantía. Lo consumen el asistente, la cabecera del expediente y el informe
mensual, así que la misma rama se ve igual en todas partes. Añadir una categoría
nueva es agregar una entrada al arreglo: el resto del módulo la recoge sin más
cambios.

### 3 · La conexión, arreglada (frontend)

El cliente (`api/client.ts`) ahora **lee al arrancar** la URL propia del módulo,
guardada en los ajustes locales (`bdp-documentacion`), con recaída elegante a la
URL general:

```ts
let urlActiva = urlPersistidaDoc() || SCRIPT_URL;
```

La consola (`DocumentacionConsola.tsx`) pasa esa URL a `comprobarConexion`, y
**Configuración › Conexión y esquema** estrena un editor de primera clase con
diagnóstico honesto: distingue «sin URL», «responde pero es otro backend» y
«conectado», y avisa si sigue apuntando al backend general.

### 4 · El panel del expediente ya deja escribir (frontend, crítico)

En `ui/piezas.tsx`, el componente `Lateral`:

```ts
// Antes: el efecto se remontaba en cada renderizado y su limpieza movía el foco.
const intentarCerrar = useCallback(() => { … }, [bloqueado, confirmarCierre, onCerrar]);
useEffect(() => { …; return () => { …; anterior.current?.focus?.(); }; }, [abierto, intentarCerrar]);

// Ahora: los manejadores viven en referencias y el efecto solo depende de `abierto`.
const cerrarRef = useRef(onCerrar);   cerrarRef.current = onCerrar;
const intentarCerrar = useCallback(() => { …; cerrarRef.current(); }, []);
useEffect(() => { … }, [abierto, intentarCerrar]);
```

Tres cambios más en la misma pieza:

- el panel **bloquea el scroll del fondo** con el candado con recuento;
- los cambios sin guardar se confirman con la pieza del módulo, no con
  `window.confirm` —el diálogo nativo bloquea el hilo y Chrome permite
  silenciarlo, y entonces el panel dejaba de poder cerrarse—;
- `Confirmacion` recibió el mismo tratamiento de referencias.

### 5 · El candado de scroll, completo (frontend, transversal)

`src/lib/scrollLock.ts` implementa el bloqueo con **recuento de referencias**.
Esta iteración lo termina: ya no queda **ninguna** superficie manipulando
`document.body.style.overflow` a mano. Se convirtieron las cuatro que faltaban —el
panel de Herramientas de Perfiles, la celda ampliada del Comparador, el cajón del
sistema de diseño y el visor de Evaluaciones—, y el armazón de la aplicación lo
reinicia al cambiar de módulo como red de seguridad.

### 5 bis · La confirmación que quedaba enterrada (frontend, transversal)

Investigando el congelamiento apareció un segundo fallo, de la misma familia y
peor: **quien entraba a modificar un perfil de cargo se quedaba atrapado**.

`GlassDialog` —la confirmación de «¿salir sin guardar?» del sistema de diseño—
valía `z-index: 110`. El formulario que la abre vive en `z-[115]`. La confirmación
se montaba **por detrás** del formulario: el botón «Descartar y salir» no se podía
pulsar, Escape solo la cancelaba, y la única salida era guardar o recargar la
página. Medido con `qa/sonda-salida-perfil.mjs`:

```
main:                                     con el arreglo:
✓ aparece la confirmación de salida       ✓ aparece la confirmación de salida
✗ el botón se puede pulsar                ✓ el botón se puede pulsar
✗ el formulario se cierra                 ✓ el formulario se cierra
```

La escala del sistema de diseño (`design-system/tokens.ts`) sube el diálogo a
`165` y el aviso flotante a `170`. Y como el problema de fondo es que esa escala
convive con valores escritos a mano por toda la aplicación (`z-[115]`, `z-[150]`,
`z-[160]`…), se añadió una **prueba de invariante**: recorre el código, encuentra
todas las superficies a pantalla completa (`inset-0` + `z-[NNN]`) y falla si alguna
supera al diálogo. Con el valor antiguo dice exactamente qué la tapaba:

```
Z.dialog (110) tiene que superar a la superficie más alta:
components/CompetencyInfoButton.tsx usa 160.
```

### 6 · Nunca más una sección en blanco

`App.tsx` documenta desde hace tiempo por qué el cambio de módulo **no** usa
`AnimatePresence mode="wait"`: el apretón de manos «primero sale la anterior, luego
entra la nueva» se bloquea si la saliente no reporta que terminó, y entonces la
nueva no se monta nunca. La consola de Documentación sí lo usaba para cambiar de
sección, y el asistente para cambiar de paso. Los dos pasan a una pieza con
`key`: el intercambio ocurre en el mismo fotograma y la entrada se sigue animando.

### 7 · El asistente de nuevo expediente (frontend)

`ui/AltaExpedienteWizard.tsx` es un asistente a pantalla completa de cinco pasos,
**guiado por el catálogo del backend**. Guarda en tres pasos idempotentes:

```
crearExpediente(identidad + rama)        → el backend genera los requisitos
obtenerExpediente(id)                     → para conocer el id de cada requisito
guardarRequisitos(id, cambios)            → aplica estados y observaciones
crearProrroga(...) por cada prórroga      → registra los plazos
```

Los chips (verde/ámbar/rojo + N/A), las observaciones por documento, las prórrogas
con cuenta regresiva, las tarjetas de categoría con su icono y las tres de garantía
viven aquí. Se puede volver a cualquier paso desde la cinta superior.

### 8 · El calendario del módulo (frontend)

`ui/CampoFecha.tsx`. El campo nativo `<input type="date">` se pinta distinto en
cada navegador y no puede decir lo que aquí hace falta. El nuevo abre una rejilla
mensual con la semana empezando en lunes, marca hoy, atenúa los fines de semana,
navega por mes y por año, ofrece atajos **según el sentido del campo** (una fecha
de ingreso mira al pasado; un plazo de prórroga, al futuro), deshabilita de verdad
los días fuera de `min`/`max` y se maneja entero con el teclado.

Dos detalles costaron una prueba cada uno:

> **Aritmética de fechas sin husos.** Todas las fechas se construyen **a mediodía
> local** y se serializan a mano. `toISOString()` convierte a UTC: en Bolivia
> (UTC−4) eso desplaza un día completo cada fecha antes de mediodía, y un
> expediente registrado el 1 de agosto aparece el 31 de julio —en la pestaña anual
> equivocada si además cambia el año—.

> **Un campo controlado no puede reescribirse mientras se teclea.** El texto solo
> se sincroniza con el valor cuando el valor cambia **desde fuera** (un atajo, un
> borrador restaurado). Si se sincronizara siempre, al escribir `18/08/2026` el
> campo interpretaría `18/08/20` como el año 2020 y reescribiría lo tecleado. Por
> eso el año se exige de cuatro cifras.

### 9 · Agencia y gerencia: la hoja `Auxiliar` manda (frontend)

`ui/SelectorAuxiliar.tsx`. Las opciones salen de la hoja `Auxiliar` del libro
—columnas `agencia_bdp` y `gerencia_bdp`, que el backend crea y verifica—, con
búsqueda que ignora acentos. Y se puede **añadir un valor sin salir del
formulario**, porque el caso real existe: una agencia nueva un lunes a las ocho.
El valor se envía a `documentacion.auxiliares.agregar`, que lo escribe al final de
la columna y **nunca quita nada**. Si la escritura falla, el valor se usa igual en
ese expediente y se avisa: mejor un expediente con la agencia correcta y un
catálogo por completar que un expediente sin agencia.

### 10 · Redundancia: el borrador y la copia del catálogo

Dos redes de seguridad, ambas locales y sin datos de negocio de terceros:

- **Borrador del alta.** Llenar un expediente son entre veinte y treinta
  decisiones. Se guardan en este equipo mientras se escribe; al volver a abrir el
  asistente se ofrece continuar o empezar de cero, y al guardar con éxito se borra.
- **Catálogo en caché** (`state/consola.ts`). El catálogo decide qué documentos
  existen. Si la primera lectura falla, sin copia el asistente muestra pasos
  **vacíos** y parece roto. Ahora abre con la última lista conocida y la reemplaza
  en silencio cuando el backend contesta.

A eso se suman las que ya tenía el módulo: `solicitudId` en toda escritura (un
reintento no duplica), control de versión (`CONFLICTO_VERSION` en lugar de pisar el
trabajo de otra persona) y la **vista local** como contingencia completa.

### 11 · Los requisitos, rediseñados (frontend)

`ui/RequisitosExpediente.tsx`. Un expediente comercial de tipo 2 tiene
veintisiete requisitos. Ahora la pestaña estrena:

- **buscador** (ignora acentos) y filtro de **obligatorios**;
- **cinco filtros por situación con su recuento** —todos, por conseguir,
  observados, en prórroga, entregados— calculados sobre el estado *efectivo*, con
  los cambios sin guardar aplicados: si no, marcar un documento no movería el
  contador y parecería que el clic no hizo nada;
- **chips de un toque** en el orden del área y con su color; una **cinta lateral**
  del color del estado que permite leer la lista entera de un barrido;
- **prórroga con cuenta regresiva** y el sello de quién tocó el requisito.

La cabecera (`DocExpedienteHeader.tsx`) lleva el distintivo de categoría (icono +
color), una franja de color, y **Cargo, Agencia, Gerencia, Ingreso con antigüedad,
Próximo plazo y Responsable**.

### 12 · El informe de avance mensual (frontend)

`export/informeMensual.ts` reúne los ingresos de un mes —consultando al backend
por rango de fecha de ingreso—, los agrupa **categoría → persona → documento**
(cumplimiento + observaciones) y produce tres entregables **sin dependencias
nuevas**: Excel (reusa el generador de `.xlsx`), Word (`.doc` como HTML con el
tipo MIME de Word) y PDF (mediante la impresión del navegador). La pantalla vive
en `SeccionReportes.tsx` con progreso real por expediente y un tope prudente.

### 13 · El movimiento (frontend)

`ui/DocTexto.tsx` y `documentacion-motion.css`, con una regla: solo `opacity`,
`transform` y `filter` —nada que provoque recálculo de diseño— y todo se apaga
entero con `prefers-reduced-motion` o con el interruptor de la aplicación.

- **Texto revelado.** Los títulos aparecen palabra a palabra, con un desenfoque
  mínimo que se resuelve en 320 ms y 28 ms entre palabras. La frase completa se
  mantiene en una sola pieza accesible: un lector de pantalla no lee seis palabras
  sueltas.
- **Cifras interpoladas.** Un contador que pasa de 12 a 18 recorre los números
  intermedios. El dígito **no gira** —un número girando no se puede leer—: se
  interpola el valor, con un `requestAnimationFrame` propio en lugar de un resorte
  por contador, porque un panel pinta más de veinte.
- **Respuesta física.** `.doc-tap` se hunde un 2 % al pulsar con la curva de las
  hojas de iOS (`cubic-bezier(0.32, 0.72, 0, 1)`); `.doc-elevar` levanta las
  tarjetas 2 px al pasar el puntero, y **solo** en dispositivos con puntero fino,
  porque en una pantalla táctil el `hover` se queda pegado tras el toque.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| `npm run typecheck` | limpio |
| `npm run build` | compila en 8,2 s · el módulo se carga aparte (380 kB → 98 kB comprimido) |
| `npm test` | **627** pruebas en 49 archivos, todas pasan |
| `npm run doc:check` | 20 comprobaciones superadas |
| `node qa/visual-documentacion.mjs` | 10 pantallas, 22 llamadas al backend, **0** fallidas, **0** errores de consola |
| `node qa/sonda-foco-expediente.mjs` | se escribe la frase completa y el foco se queda en el área de texto |
| `node qa/documentacion-app.mjs` | 29 llamadas al backend, 0 fallidas; el alta termina y la página sigue respondiendo tras abrir y cerrar paneles |
| `node qa/sonda-salida-perfil.mjs` | la confirmación de salida se puede pulsar y el formulario se cierra |

Pruebas nuevas de esta iteración:

- `__tests__/panelLateral.test.tsx` — 4 pruebas. La primera **falla** si se
  restablece la dependencia inestable (`expected 'F' to be 'Falta la última
  página'`): es la red que impide que el fallo del foco vuelva.
- `__tests__/campoFecha.test.tsx` — 11 pruebas del calendario: aritmética sin
  husos, escritura a mano, rejilla, límites, atajos y teclado.
- `__tests__/altaRedundancia.test.tsx` — 6 pruebas de los catálogos auxiliares
  (incluido el caso en que el libro rechaza el alta), del borrador y de la caché
  del catálogo.
- `__tests__/informeMensual.backend.test.ts` — 6 pruebas del informe **contra el
  backend real**: el filtro por rango de ingreso deja fuera los meses vecinos, y
  cada persona llega con los documentos de su rama (23 / 27 / 19).
- `__tests__/docTexto.test.tsx` — 6 pruebas de que la animación no rompe el
  contenido accesible.
- `design-system/__tests__/apilamiento.test.ts` — 3 pruebas de la invariante de
  apilamiento; la primera falla con el valor antiguo del diálogo.
- `__tests__/wizard.test.tsx`, `lib/__tests__/scrollLock.test.ts`,
  `__tests__/informeMensual.test.ts` — del trabajo anterior de esta rama.

### Cómo probarlo a mano

1. `npm install && npm run dev`.
2. Abre **Documentación**. Si dice que no se conecta, ve a **Configuración ›
   Conexión y esquema** y pega la URL de la aplicación web del proyecto de Apps
   Script de Documentación (termina en `/exec`). Pulsa **Guardar y probar**.
3. Pulsa **Nuevo expediente** y recorre el asistente: elige **Comercial → Tipo 1**
   y comprueba que solo aparecen los cinco documentos de esa rama. Prueba el
   calendario de la fecha de ingreso (flechas, atajos, escribir `18/08/2026`).
4. En Agencia, escribe una que no exista y pulsa **Añadir … al catálogo**;
   compruébalo en la hoja `Auxiliar` del libro.
5. Cierra el asistente a media faena y vuelve a abrirlo: debe ofrecer
   **continuar donde lo dejaste**.
6. Guarda. En el expediente: escribe una observación larga —**debe entrar
   entera**—, filtra por «Por conseguir», marca un documento como Entregado y mira
   moverse el contador.
7. En **Reportes › Informe de avance mensual**, elige el mes y genera; descarga en
   Excel, Word y PDF.
8. Entra y sal de **Configuración › Ajustes locales** y de **Perfiles ›
   Herramientas**: la página sigue respondiendo y sigue scrolleando.
9. En **Perfiles**, abre un perfil, pulsa **Modificar** y luego **Salir sin
   guardar**: la confirmación aparece **encima** y el botón «Descartar y salir»
   funciona (antes quedaba enterrada y había que recargar).

## Puesta en marcha (pasos manuales, con todo el detalle)

> **Resumen para quien tiene prisa:** el frontend se despliega solo al fusionar.
> El backend exige **dos** cosas a mano: pegar los `.gs`, y **publicar una versión
> NUEVA de la implementación**. Guardar el archivo no basta.

### A · Frontend (automático)

Al fusionar el PR, Vercel construye y publica. No hay variables de entorno nuevas.
Si quieres comprobarlo antes, el propio PR trae una URL de vista previa.

### B · Backend de Apps Script (manual)

1. Abre el libro de Google Sheets del área y entra en **Extensiones › Apps
   Script**.
2. Copia el contenido de `apps-script/documentacion/` sobre los archivos del mismo
   nombre. Los cambios funcionales de esta iteración están en **`11_Domain.gs`** y
   **`00_Manifest.gs`**, pero conviene pegar los 22 para evitar desajustes: el
   orden del prefijo numérico importa, porque Apps Script concatena los archivos.
3. Comprueba que `appsscript.json` sea el del repositorio (menú **Configuración
   del proyecto → Mostrar «appsscript.json»** si no lo ves).
4. Guarda todo (`Ctrl+S`).
5. Vuelve al libro y usa el menú **Documentación** (si no aparece, recarga la
   página del libro):
   1. **Respaldar** — saca una copia dentro del propio libro. Hazlo siempre antes.
   2. **Instalar o actualizar modelo** — resiembra el catálogo a la versión 2:
      añade los 7 documentos nuevos y refresca la aplicabilidad de los existentes.
      Es idempotente y **no toca** los expedientes ya creados.
   3. *(Opcional, recomendado la primera vez)* **Simular migración** y leer el
      informe; después **Migrar al modelo normalizado**.
6. **Publica una versión NUEVA de la implementación**: `Implementar › Gestionar
   implementaciones › (lápiz de editar) › Versión: Nueva versión › Implementar`.
   Mantén **Ejecutar como: Yo** y **Quién tiene acceso: Cualquier usuario**.
   Este paso es el que más veces se olvida: la URL `/exec` sigue sirviendo la
   versión anterior hasta que publicas una nueva.
7. Copia la URL que termina en `…/exec` y pégala en la aplicación:
   **Documentación › Configuración › Conexión y esquema › Guardar y probar**.

### C · Verificación posterior (lista de comprobación)

- [ ] El editor de conexión dice **«Conectado»** y muestra el nombre del libro.
- [ ] La hoja `Auxiliar` tiene las cabeceras `agencia_bdp` y `gerencia_bdp` con
      sus valores, y el desplegable del asistente las muestra.
- [ ] Un expediente **Comercial Tipo 2** pide sus **9** documentos de garantía.
- [ ] Un expediente de **Auditoría** pide **solo** la declaración de impedimento.
- [ ] Los expedientes antiguos siguen intactos, con su avance y su color.
- [ ] El informe mensual del mes en curso lista a las personas que ingresaron.

Si quieres que un expediente comercial **antiguo** adopte la lista nueva, cambia y
vuelve a fijar su tipo de garantía: eso dispara el recálculo conservando todo lo
que ya tenía datos.

### D · Reversión

Si algo no convence, hay dos palancas independientes:

- **Backend:** `Implementar › Gestionar implementaciones` y volver a la versión
  anterior. El catálogo vuelve a la v1; las filas nuevas quedan inertes.
- **Frontend:** revertir el PR en GitHub. Vercel republica en minutos.

La **vista local** sigue disponible en todo momento como contingencia: guarda los
expedientes en el equipo y los sube cuando vuelve la conexión.

## Alternativas consideradas

### El catálogo, ¿en el frontend o en el backend?

| A favor de dirigir el formulario desde el backend (elegido) | En contra |
| --- | --- |
| Una sola fuente de verdad: el formulario no puede pedir algo que el backend no cree | Cambiar la lista exige volver a publicar el Apps Script |
| Reportes, vista y exportaciones coinciden sin esfuerzo | Un cambio de proceso no es «solo frontend» |
| Escalar a una categoría nueva es una fila del catálogo | Se necesita conexión para ver la lista (mitigado con la caché local) |

Mantener la lista en el cliente habría evitado el redespliegue, pero reabre justo
el problema que el módulo vino a cerrar: dos catálogos que se separan y un
formulario que pide documentos que el reporte no cuenta.

### El calendario, ¿propio o nativo?

| Calendario propio (elegido) | `<input type="date">` |
| --- | --- |
| Igual en todos los navegadores y coherente con el módulo | Cero código que mantener |
| Puede decir «faltan 12 días» y ofrecer atajos con sentido | El móvil abre una rueda ajena al sistema |
| Teclado y lectores de pantalla bajo control | Accesibilidad ya resuelta por el navegador |
| ~450 líneas y 11 pruebas | No admite límites explicados ni cuentas regresivas |

### El PDF, ¿con librería o con la impresión del navegador?

| Impresión del navegador (elegido) | Librería (p. ej. jsPDF) |
| --- | --- |
| Cero dependencias nuevas; nada que rompa el `npm ci` de Vercel | Descarga directa sin diálogo |
| Respeta estilos y saltos de página del HTML | +200 kB al paquete y otra pieza que mantener |
| El mismo HTML sirve para Word | Control fino de la maquetación |

## Personas con contexto

- **AlexD5427** — dueño del repositorio; fusionó la arquitectura del módulo
  (PR #31) y su rediseño de interfaz (PR #32). Tiene la visión completa del modelo
  normalizado y del contrato con el libro anual. Es quien pegó los `.gs` a mano en
  el proyecto de Apps Script, así que conoce el estado real del despliegue.
- **AlexanderBd** (`harley8@postmodule.com`) — co-autor de la refactorización del
  backend: motor de aplicabilidad, migraciones y arnés de pruebas en Node. Es la
  persona a la que preguntar antes de tocar el catálogo o la migración.
- **Alex Jhonson** (`reese.a@axisnimbus.com`) — participó en las piezas
  compartidas del sistema de diseño y en los almacenes de `src/lib`, que es donde
  vive el candado de scroll que esta iteración terminó de generalizar.

Si vas a tocar el catálogo o la aplicabilidad por rama, habla con los dos primeros:
son los cambios con más radio de impacto del módulo.

## Cuestionario

<details>
<summary>1. ¿Por qué entraba una sola letra al escribir una observación en el panel del expediente?</summary>

- **A.** El backend tardaba y perdía las teclas siguientes.
- **B.** El efecto de teclado del panel dependía de una función nueva en cada
  renderizado, así que se remontaba con cada tecla y su limpieza devolvía el foco
  al elemento anterior. ✅
- **C.** El área de texto tenía `maxLength=1`.

La primera tecla provoca un renderizado; el renderizado remonta el efecto; la
limpieza ejecuta `anterior.current?.focus()` y el temporizador de 50 ms deja el
foco en el primer botón del panel. Con los manejadores en referencias, el efecto
solo se monta al abrir.
</details>

<details>
<summary>2. ¿Por qué la consola «no se conectaba» al backend?</summary>

- **A.** El backend estaba caído.
- **B.** El cliente de la consola usaba la URL general del sistema, no la del
  proyecto de Apps Script de Documentación. ✅
- **C.** Faltaba una variable de entorno en Vercel.

Documentación es un Apps Script aparte. El módulo heredado sí leía su URL de los
ajustes locales; la consola nueva no la recibía nunca y caía en `SCRIPT_URL`, que
no conoce las acciones `documentacion.*`.
</details>

<details>
<summary>3. ¿Por qué las fechas se construyen a mediodía y no con <code>toISOString()</code>?</summary>

- **A.** Por estética en los registros.
- **B.** Porque `toISOString()` convierte a UTC y en Bolivia (UTC−4) desplaza un
  día entero las fechas de la mañana, con lo que un ingreso del 1 de agosto se
  guardaría como 31 de julio. ✅
- **C.** Porque Apps Script solo acepta fechas a mediodía.

Y el desplazamiento no es cosmético: si además cruza el 1 de enero, el expediente
aterriza en la pestaña anual equivocada del libro.
</details>

<details>
<summary>4. Con el catálogo cambiado, ¿qué pasa con los expedientes ya creados?</summary>

- **A.** Se recalculan automáticamente y pueden perder datos.
- **B.** No se tocan; conservan sus requisitos hasta que se resincronizan a mano
  (por ejemplo, al cambiar y volver a fijar su tipo de garantía). ✅
- **C.** Hay que migrarlos uno por uno obligatoriamente.

Subir la versión del catálogo refresca la aplicabilidad para los expedientes
nuevos y para el recálculo. La reinstalación es idempotente y **no degrada estados
resueltos**: un documento aprobado no vuelve a pendiente.
</details>

<details>
<summary>5. ¿Por qué el cambio de sección dejó de usar <code>AnimatePresence mode="wait"</code>?</summary>

- **A.** Porque es más lento.
- **B.** Porque si la sección que sale no reporta el fin de su animación, la que
  entra no se monta nunca y la pantalla se queda en blanco hasta recargar. ✅
- **C.** Porque no funciona con portales.

`App.tsx` ya había aprendido esa lección a nivel de módulo y lo documenta en un
comentario; aquí se aplicó igual al cambio de sección y al cambio de paso del
asistente. De paso, el intercambio es más rápido: no hay que esperar la salida.
</details>

<details>
<summary>6. ¿Por qué quien modificaba un perfil de cargo no podía salir?</summary>

- **A.** El formulario esperaba una respuesta del backend.
- **B.** La confirmación de salida se montaba con `z-index: 110` y el formulario
  vive en `z-[115]`: quedaba por detrás y su botón no se podía pulsar. ✅
- **C.** El botón no tenía manejador.

Una confirmación tiene que estar por encima de cualquier superficie que la pueda
abrir. Ahora el diálogo vale 165 y una prueba de invariante recorre el código para
que ninguna superficie nueva vuelva a taparlo.
</details>

<details>
<summary>7. Si el libro rechaza añadir una agencia nueva, ¿qué hace el formulario?</summary>

- **A.** Cancela el alta del expediente.
- **B.** Usa igualmente el valor en ese expediente y avisa de que hay que añadirlo
  a la hoja `Auxiliar` a mano. ✅
- **C.** Deja el campo vacío.

Es una decisión deliberada: es mejor un expediente con la agencia correcta y un
catálogo por completar que un expediente sin agencia. El aviso dice exactamente
qué quedó pendiente.
</details>
