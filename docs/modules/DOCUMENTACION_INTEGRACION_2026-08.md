# Módulo de Documentación — Integración, arreglos y rediseño del alta

> Documento explicativo del trabajo de esta iteración. Está escrito para dos
> lectores: quien nunca tocó el módulo y necesita el mapa completo, y quien ya lo
> conoce y quiere ir directo a lo que cambió. Las secciones de **Fondo** pueden
> saltarse si ya se domina el sistema.

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

El módulo son en realidad **tres backends distintos** desplegados por separado:
el del talento (`SCRIPT_URL`), el de Evaluaciones y el de Documentación. Cada uno
es un proyecto de Apps Script con su propia URL `…/exec`. El detalle que importa
para esta iteración: **la consola nueva de Documentación no estaba usando la URL
de su propio backend**; usaba, por defecto, la URL general del talento. Hablarle a
la puerta equivocada es exactamente lo que producía el «no se conecta».

## Intuición

Piensa en el alta de un expediente como en un **camino con un cruce**:

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

La intuición del arreglo de conexión es igual de simple: **cada puerta tiene su
llave**. El módulo ahora guarda la URL de *su* backend y la usa desde la primera
llamada; si no hay ninguna, lo dice con claridad en vez de tocar la puerta de al
lado.

Y la del congelamiento: imagina dos personas cerrando con llave la misma puerta.
Si cada una recuerda «cómo estaba antes» y la última en salir restaura ese
estado, cerrar en distinto orden deja la puerta **trancada**. La solución es un
**único candado con contador**: la puerta se abre solo cuando el último suelta.

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
garantía. Lo consumen el asistente y la cabecera del expediente, así que la misma
rama se ve igual en todas partes.

### 3 · La conexión, arreglada (frontend)

El cliente (`api/client.ts`) ahora **lee al arrancar** la URL propia del módulo,
guardada en los ajustes locales (`bdp-documentacion`), con recaída elegante a la
URL general:

```ts
let urlActiva = urlPersistidaDoc() || SCRIPT_URL;
```

La consola (`DocumentacionConsola.tsx`) pasa esa URL a `comprobarConexion`, y
Configuración › Estado estrena un **editor de conexión de primera clase** con
diagnóstico honesto: distingue «sin URL», «responde pero es otro backend» y
«conectado», y avisa si sigues apuntando al backend general.

### 4 · El candado de scroll (frontend, transversal)

`src/lib/scrollLock.ts` implementa un bloqueo con **recuento de referencias**.
Todas las superficies (el `Modal`, los visores de Perfiles y Postulantes, el
detalle heredado de Documentación) lo usan ahora, y el armazón de la aplicación lo
**reinicia al cambiar de módulo** como red de seguridad. Es lo que elimina la
pantalla congelada al salir de Configuración o de Perfiles.

### 5 · El asistente de nuevo expediente (frontend)

`ui/AltaExpedienteWizard.tsx` es el corazón de la iteración: un asistente a
pantalla completa de cinco pasos, **guiado por el catálogo del backend**. Guarda
en tres pasos idempotentes:

```
crearExpediente(identidad + rama)        → el backend genera los requisitos
obtenerExpediente(id)                     → para conocer el id de cada requisito
guardarRequisitos(id, cambios)            → aplica estados y observaciones
crearProrroga(...) por cada prórroga      → registra los plazos
```

Los chips (verde/amarillo/rojo), las observaciones, las prórrogas con cuenta
regresiva, las tarjetas de categoría con su icono y las de garantía viven aquí.

### 6 · La cabecera del expediente (frontend)

`ui/DocExpedienteHeader.tsx` estrena un distintivo de categoría (icono + color) y
una franja de color, e incorpora el **Cargo** junto a Agencia y Fecha de ingreso.

### 7 · El informe mensual (frontend)

`export/informeMensual.ts` reúne los ingresos de un mes, los agrupa
**categoría → persona → documento**, y produce tres entregables **sin
dependencias nuevas**: Excel (reusa el generador de `.xlsx`), Word (`.doc` como
HTML con el tipo MIME de Word) y PDF (mediante la impresión del navegador). La UI
vive en `SeccionReportes.tsx` con progreso real por expediente.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| `npm run typecheck` | limpio |
| `npm run build` | compila (11,9 s) — el chunk de Documentación se carga aparte |
| `npm test` | 591 pruebas en 43 archivos, todas pasan |
| `npm run doc:check` | 20 comprobaciones superadas |

Pruebas nuevas de esta iteración:

- `src/lib/__tests__/scrollLock.test.ts` — 6 pruebas del candado con recuento.
- `src/features/documentacion/__tests__/wizard.test.tsx` — 2 pruebas de
  integración que recorren el asistente completo contra el backend real y
  verifican la rama, los requisitos (23 para Comercial Tipo 1, 19 para Auditoría)
  y los estados aplicados.
- `src/features/documentacion/__tests__/informeMensual.test.ts` — 6 pruebas de la
  agregación y de los tres formatos.
- Se actualizaron las pruebas y el verificador de coherencia a los recuentos del
  catálogo nuevo.

### Cómo probarlo a mano

1. `npm install && npm run dev`.
2. Abre **Documentación**. Si dice «no se conecta», ve a **Configuración › Estado**
   y pega la URL de la aplicación web del proyecto de Apps Script de Documentación
   (termina en `/exec`). Pulsa **Guardar y probar**.
3. Pulsa **Nuevo expediente** y recorre el asistente: elige **Comercial → Tipo 1**
   y observa que solo aparecen los cinco documentos de esa rama.
4. Marca chips (verde/amarillo/rojo), añade una observación y una prórroga con
   fecha; fíjate en la cuenta regresiva. Pulsa **Guardar y abrir expediente**.
5. En **Reportes › Informe de avance mensual**, elige el mes y genera; descarga en
   Excel, Word y PDF.
6. Entra a **Configuración**, abre **Ajustes locales**, cierra con **Listo**: la
   página sigue respondiendo (antes se congelaba).

## Puesta en marcha (pasos manuales)

> **Importante:** el frontend se despliega solo en Vercel al fusionar. El
> **backend** (Apps Script) requiere pasos manuales porque cambió el catálogo.

### A · Frontend (automático)

Al fusionar el PR, Vercel construye y publica. No hay variables nuevas que
configurar.

### B · Backend de Apps Script (manual)

1. Abre el proyecto de Apps Script de **Documentación** (el que corresponde a la
   hoja del área). `Extensiones › Apps Script` desde la hoja, o su URL directa.
2. Reemplaza el contenido de **`11_Domain.gs`** y **`00_Manifest.gs`** con la
   versión de este PR (`apps-script/documentacion/`). Si mantienes el resto igual,
   estos dos archivos son los únicos con cambios funcionales del catálogo; aun así
   conviene pegar los 22 archivos para evitar desajustes.
3. Guarda. Desde el menú **Documentación** del libro:
   1. **Respaldar** (saca una copia dentro del propio libro).
   2. **Instalar o actualizar modelo** — resiembra el catálogo a la versión 2:
      añade los documentos nuevos y refresca la aplicabilidad de los existentes.
      Es idempotente y **no toca** los expedientes ya creados.
4. **Publica una versión NUEVA de la implementación** (`Implementar › Gestionar
   implementaciones › Editar › Versión nueva`). Guardar el archivo **no basta**:
   la URL `/exec` sigue sirviendo la versión anterior hasta que publicas una nueva.
   Mantén el acceso en **«Cualquier usuario»** y ejecución **«Como yo»**.
5. Copia la URL `…/exec` y pégala en la app: **Documentación › Configuración ›
   Estado › Guardar y probar**.

### C · Verificación posterior

- El editor de conexión debe decir **«Conectado»** y mostrar el nombre del libro.
- Crea un expediente **Comercial Tipo 2** y confirma que pide sus **9** documentos
  de garantía; uno **Auditoría** y confirma que pide **solo** la declaración de
  impedimento.
- Los expedientes antiguos siguen intactos; si quieres que un expediente comercial
  antiguo adopte la lista nueva, cambia y vuelve a fijar su tipo de garantía (eso
  dispara el recálculo, conservando lo que ya tenía datos).

### Reversión

Si algo no convence: revertir la versión de la implementación de Apps Script
devuelve el catálogo anterior; las hojas nuevas quedan inertes. En el frontend,
revertir el PR restablece el alta anterior. La **vista local** sigue disponible
como contingencia en todo momento.

## Alternativas consideradas

### Catálogo en el frontend vs. en el backend

| A favor de dirigir el formulario desde el backend (elegido) | En contra |
| --- | --- |
| Una sola fuente de verdad: el formulario no puede pedir algo que el backend no cree | Cambiar la lista exige redeploy del Apps Script |
| Reportes, vista y exportaciones coinciden sin esfuerzo | Un cambio de proceso no es «solo frontend» |

La alternativa —mantener la lista de documentos en el cliente— habría evitado el
redeploy, pero reabre justo el problema que el módulo vino a cerrar: dos catálogos
que se separan y un formulario que pide documentos que el reporte no cuenta.

### PDF con librería vs. impresión del navegador

| Impresión del navegador (elegido) | Librería (p. ej. jsPDF) |
| --- | --- |
| Cero dependencias nuevas; nada que rompa el build de Vercel | Descarga directa sin diálogo |
| Respeta estilos y saltos de página del HTML | +200 kB al bundle y otra pieza que mantener |

## Personas con contexto

- **AlexD5427** — dueño del repositorio y quien fusionó la arquitectura del módulo
  (PR #31) y su rediseño de interfaz (PR #32). Es la persona con la visión
  completa del modelo normalizado y del contrato con el libro anual.
- **AlexanderBd** (`harley8@postmodule.com`) — co-autor de la mayoría de los
  commits de la refactorización del backend: conoce el motor de aplicabilidad, la
  migración y el arnés de pruebas en Node.

Si vas a tocar el catálogo o la migración, habla con ellos antes: son los cambios
con más radio de impacto.

## Cuestionario

<details>
<summary>1. ¿Por qué la consola «no se conectaba» al backend?</summary>

- **A.** El backend estaba caído.
- **B.** El cliente de la consola usaba la URL general del sistema, no la del
  proyecto de Apps Script de Documentación. ✅
- **C.** Faltaba una variable de entorno en Vercel.

El módulo de Documentación es un Apps Script aparte; su cliente ahora lee y usa la
URL propia, guardada en los ajustes locales, con recaída a la general.
</details>

<details>
<summary>2. Tras cambiar el catálogo, ¿qué pasa con los expedientes ya creados?</summary>

- **A.** Se recalculan automáticamente y pueden perder datos.
- **B.** No se tocan; conservan sus requisitos hasta que se resincronizan a mano
  (por ejemplo, al cambiar su tipo de garantía). ✅
- **C.** Hay que migrarlos uno por uno obligatoriamente.

Subir la versión del catálogo refresca la aplicabilidad de las ramas para los
expedientes nuevos y el recálculo, pero la reinstalación es idempotente y no
degrada estados ya resueltos.
</details>

<details>
<summary>3. ¿Por qué un candado de scroll con recuento evita la pantalla congelada?</summary>

- **A.** Porque desactiva las animaciones.
- **B.** Porque solo el último en soltar restaura el `overflow` original, así que el
  orden de apertura y cierre de dos overlays deja de importar. ✅
- **C.** Porque recarga la página automáticamente.

El patrón anterior, con cada overlay guardando «cómo estaba antes», dejaba el
`body` en `hidden` si dos se cerraban en distinto orden.
</details>

<details>
<summary>4. ¿En qué orden guarda el asistente un expediente nuevo?</summary>

- **A.** Escribe todo de una vez en una sola llamada.
- **B.** Crea el expediente (el backend genera los requisitos), lo relee para
  conocer el id de cada requisito, aplica los estados en un lote y registra las
  prórrogas. ✅
- **C.** Guarda primero las prórrogas y luego el expediente.

Ese orden es el que permite que el formulario marque estados durante el alta sin
inventar identificadores que aún no existen.
</details>

<details>
<summary>5. ¿Cómo se genera el PDF del informe mensual sin añadir dependencias?</summary>

- **A.** Con una llamada al backend que crea un PDF en Drive.
- **B.** Construyendo un HTML autocontenido y enviándolo a la impresión del
  navegador (un `iframe` oculto) para «Guardar como PDF». ✅
- **C.** Con la librería jsPDF incluida en el bundle.

El mismo HTML sirve para Word (`.doc` con el tipo MIME de Word). El Excel reusa el
generador de `.xlsx` que ya existía.
</details>
