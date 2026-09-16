# Módulo de Documentación — el legajo administrativo, «Otros» y el despliegue que se explica solo

> Documento explicativo de esta iteración. Está escrito para dos lectores: quien
> nunca tocó el módulo y necesita el mapa, y quien ya lo conoce y quiere ir
> directo a lo que cambió. Las secciones marcadas **Fondo** se pueden saltar si
> ya se domina el sistema.
>
> **Antes de fusionar, lea [Puesta en marcha](#puesta-en-marcha-pasos-manuales).**
> Hay pasos que no se pueden automatizar, y uno de ellos —publicar una versión
> nueva de la implementación— es la causa directa de que el módulo «deje de
> conectarse».

---

## Fondo

### El sistema, en una frase

El módulo de Documentación persigue el papeleo de incorporación de cada persona
que entra al Banco de Desarrollo Productivo. No hay base de datos relacional
detrás: hay **una hoja de cálculo de Google** y un proyecto de **Google Apps
Script** que la lee y la escribe. El frontend (React, desplegado en Vercel)
habla con ese Apps Script por HTTP.

> **Concepto clave — dos capas sobre una hoja.** Debajo hay 19 hojas
> «normalizadas» (una fila por hecho: un expediente, un documento, una prórroga).
> Encima, el libro anual `CONTROL INGRESOS <año>` que el área reconoce, con sus
> mismas columnas y colores. El modelo normalizado es la verdad; el libro anual
> es el espejo.

### Cómo decide el sistema qué documentos pedir

La pieza central es el **catálogo** (`CatalogoDocumentos`) y su **motor de
aplicabilidad** (`doc2Aplicables_`). Cada documento del catálogo declara a qué
`tipo_funcionario` y a qué `tipo_garantia` aplica. Al crear un expediente con una
rama concreta, el backend recorre el catálogo y genera **solo** los requisitos
que aplican. El formulario, la vista, los reportes y las exportaciones preguntan
todos a la misma función: por eso no pueden discrepar.

> **Concepto clave — rama.** Una rama es el par (tipo de funcionario, tipo de
> garantía). La rama se elige al crear el expediente y determina su contenido.

### De dónde viene este trabajo

La iteración anterior (PR #36) reescribió el catálogo con la lista literal del
área, añadió el conteo de hojas físicas y midió el contraste. Quedaron cuatro
cosas, y son las que motivan esta:

1. **El área administrativa no tenía rama.** Se registraba como «general», y eso
   funciona el primer día y arruina el reporte por categoría para siempre.
2. **Cuatro documentos del legajo no estaban en ninguna lista**: el manual de
   funciones, el memorándum de designación, la comunicación interna y el hueco
   para lo imprevisto.
3. **Dos documentos habían cambiado de forma de presentación** sin que el
   catálogo se enterara: el seguro de accidentes dejó de llegar en papel y el
   folio real del bien inmueble empezó a archivarse.
4. **«Se conecta mal.»** Con TIMEOUT frecuente y sin forma de saber si el
   problema era la red, el volumen del libro o un despliegue a medias.

---

## Intuición

Seis cosas. Cada una tiene una intuición corta.

**1 · La rama administrativa existe, no pide nada, y el asistente lo sabe por el
catálogo.** Al elegirla, el paso de requisitos específicos **desaparece del
camino**: el indicador pasa a decir «Paso 3 de 4» y «Continuar» lleva a la
revisión. No hay ningún `if (categoria === "ADMINISTRATIVO")` en la interfaz: el
backend devuelve cuántos requisitos propios tiene cada rama y el asistente actúa
sobre ese número. El día que el área defina los de Ejecutivo —o quite los de
Cumplimiento— el asistente se adapta sin que nadie recuerde que había una
comparación con un nombre de rama dentro.

**2 · Un cambio en el catálogo alcanza a todas las ramas a la vez.** El folio
real del bien inmueble es **la misma fila** del catálogo en Comercial Tipo 1 (como
documento del garante) y en Tipo 3 (como documento del postulante). Marcarlo
físico y digital con conteo de hojas lo cambia en las dos ramas, en la vista del
expediente, en los reportes, en el informe mensual y en la exportación. Ese es el
argumento de que el catálogo sea una sola fuente, y esta iteración lo cobra dos
veces: el seguro de accidentes hace el camino inverso —pasa a solo digital y
pierde su contador— con una línea.

**3 · «Otros» es el primer requisito que el expediente define.** Su nombre lo
escribe quien registra, y su presentación —físico, digital o ambos— se elige por
expediente. De ahí se **deriva** si lleva contador de hojas, así que el estado
imposible «solo digital con doce hojas de papel» no es representable ni en la
pantalla ni en el modelo.

**4 · El módulo diagnostica su propio despliegue.** El backend declara su versión
de esquema, su versión de catálogo y **la lista de acciones que sabe atender**. El
frontend las compara con lo que necesita y, si no cuadran, dice el nombre del
problema y el paso exacto que lo arregla. Es la respuesta a «se conecta mal».

**5 · Tres cosas que costaban tiempo en cada petición y ninguna hacía falta.** La
bitácora de idempotencia se leía entera en toda consulta; la hoja `Auxiliar` se
leía una vez por columna; el arranque del módulo eran dos llamadas encadenadas.

**6 · El tope de espera crece con el intento.** Apps Script en frío tarda entre 5
y 20 segundos. Con un tope único de 30 s y tres intentos, una llamada que iba a
contestar en el segundo 32 se abortaba tres veces —noventa segundos para decir
«el backend no responde», mientras el backend contestaba— y cada aborto dejaba su
ejecución compitiendo con el reintento.

---

## El código, sección por sección

### 1 · La rama administrativa (backend + frontend)

`11_Domain.gs` añade la rama al vocabulario y —esto es lo importante— **deriva de
él las listas de valores admitidos**:

```javascript
/**
 * Se deriva de `DOC2_TIPO_FUNCIONARIO` en lugar de repetirse a mano en los tres
 * `doc2Enum_` que lo necesitaban (crear, actualizar, filtrar). Esa repetición ya
 * costó un fallo real: añadir una rama al vocabulario sin añadirla a las listas
 * hacía que el asistente la ofreciera y el alta la rechazara con
 * «tipo de funcionario no existe», un mensaje imposible de interpretar desde la
 * pantalla.
 */
function doc2CodigosTipoFuncionario_() { … }
```

`13_Catalog.gs` añade `propios` al mapa de aplicabilidad: los requisitos que la
rama suma a los generales. Y `AltaExpedienteWizard.tsx` lo consulta en tres
niveles, por ese orden:

```tsx
const ramaSinRequisitosPropios = useMemo(() => {
  const rama = catalogo?.aplicabilidad.find(…);
  if (rama) {
    if (typeof rama.propios === "number") return rama.propios === 0;  // 1 · el backend
    return especificos.length === 0;                                   // 2 · backend anterior
  }
  return cat?.sinRequisitosPropios === true;                           // 3 · antes de la red
}, [ … ]);
```

El tercer nivel existe para poder decir «no pide más documentos» **en la tarjeta**
antes de que el catálogo haya llegado, que es justo cuando alguien está
eligiendo.

Los pasos del asistente pasan a ser derivados, y con ellos aparece un caso que
había que resolver:

```tsx
/**
 * Si alguien estaba en «requisitos de la categoría» y vuelve atrás a elegir el
 * área administrativa, ese paso deja de existir. Sin esta corrección el índice
 * sería −1 y «Continuar» devolvería al primer paso, que es el peor resultado
 * posible: parece que el formulario se reinició.
 */
const pasoVigente: PasoId = pasos.some((p) => p.id === paso) ? paso : "revision";
```

### 2 · El catálogo v4 (backend)

`DOC2_CATALOGO_VERSION` sube a 4 y `DOC2_SCHEMA_VERSION` a 6. Los cambios del
catálogo, con su razón:

| Documento | Antes | Ahora | Por qué |
| --- | --- | --- | --- |
| Seguro de Accidentes Personales | Físico + digital, con conteo | **Solo digital** | Dejó de entregarse en papel: el formulario se llena y se remite a la aseguradora por correo. Al legajo físico no llega nada que archivar, así que el contador pedía un dato que no existe — y un contador que nadie puede rellenar con la verdad se rellena con un cero, que se lee como «cero hojas». |
| Folio real del bien inmueble | Solo digital | **Físico + digital, con conteo** | Es un documento de Derechos Reales que se archiva en el legajo. Aplica a Tipo 1 y Tipo 3 desde la misma fila del catálogo: el cambio es uno. |
| Manual de Funciones | — | Nuevo, físico + digital + conteo | El área lo produce y lo archiva. |
| Memorándum de Designación | — | Nuevo, físico + digital + conteo | Idem. |
| Comunicación Interna | — | Nuevo, físico + digital + conteo | Idem. |
| Otros documentos (especificar) | — | Nuevo, personalizable | El papel que ninguna lista contempla. |

Los tres primeros entran **al final** de los generales a propósito: el `orden`
sale de la posición en la semilla, así que ponerlos al final es lo que hace que
aparezcan después de los dieciséis originales sin renumerar nada.

Recuentos nuevos, verificados en las tres capas (backend, `10_Tests.gs` y
`npm run doc:check`):

| Rama | Antes | Ahora |
| --- | --- | --- |
| General | 16 | **20** |
| Área administrativa | — | **20** |
| Comercial Tipo 1 | 21 | **25** |
| Comercial Tipo 2 | 25 | **29** |
| Comercial Tipo 3 | 21 | **25** |
| Auditoría | 17 | **21** |
| Cumplimiento | 19 | **23** |
| Catálogo total | 39 | **43** (41 vigentes + 2 retirados) |
| Con contador de hojas | 9 | **13** |

### 3 · «Otros»: el requisito que el expediente define

Tres columnas nuevas en `ExpedienteDocumentos` —`nombre_personalizado`,
`presentacion_fisica`, `presentacion_digital`— y tres en `CatalogoDocumentos`
—`permite_nombre_libre`, `presentacion_editable`, `estado_inicial`—.

La pregunta «¿lleva conteo de hojas?» deja de tener una respuesta trivial, y por
eso vive en **una** función:

```javascript
/**
 * ── El problema ─────────────────────────────────────────────────────────────
 * Hasta la versión 5 la respuesta era trivial: la presentación la decía el
 * catálogo y punto. Con `otros-documento` deja de serlo […]. Eso abre la puerta
 * al error clásico de tener la misma pregunta contestada en cuatro sitios: la
 * pantalla del alta, la vista del expediente, los reportes y el informe mensual.
 * Cuando uno de los cuatro se olvida de mirar el valor de la fila, el documento
 * aparece con contador de hojas en la pantalla y sin columna en el Excel.
 *
 * ── La regla, en tres líneas ────────────────────────────────────────────────
 *  1. si la fila trae una presentación propia, esa manda;
 *  2. si no, manda la del catálogo;
 *  3. el conteo de hojas se DERIVA.
 */
function doc2PresentacionEfectiva_(fila, def) { … }
```

Tres decisiones más que merecen texto:

**`estadoInicial: 'NO_APLICA'`.** «Otros» nace fuera del cálculo de avance. Si
naciera `PENDIENTE`, **todos** los expedientes del banco arrastrarían un
requisito que nadie va a entregar y ninguno llegaría al 100 %. Es la diferencia
entre ofrecer una herramienta y castigar a quien no la usa.

**Escribir el nombre lo pone en uso.** El «no aplica» con el que nace apaga los
chips y el contador, así que sin promoción automática la persona escribía el
nombre y se encontraba una fila muerta. La vuelta atrás solo ocurre cuando no hay
nada que perder:

```tsx
/**
 * La vuelta atrás es igual de importante y solo ocurre cuando no hay nada que
 * perder: si alguien ya marcó «Entregado», contó hojas o escribió una
 * observación, borrar el nombre NO saca el requisito del expediente. Sería
 * descontar trabajo hecho por una tecla de borrar.
 */
function escribirNombre(valor: string) { … }
```

**El orden dentro del servicio.** La personalización se aplica **antes** de
validar el conteo:

```javascript
/**
 * La persona marca «Ambos» y escribe tres hojas en el mismo guardado. Si el
 * conteo se validara primero, consultaría la presentación anterior —«solo
 * digital»— y rechazaría un cambio válido con el mensaje «este documento no
 * lleva conteo de hojas», que desde la pantalla es indistinguible de un fallo
 * del sistema.
 */
```

Y un documento que pasa a solo digital pierde sus hojas en la misma escritura:
dejarlas produciría el dato contradictorio que todo lo demás se esfuerza en
impedir.

### 4 · El chip deslizable, y por qué se mueve con `transform`

```css
/* ── Cómo se mueve el indicador ───────────────────────────────
   Con `translate3d` sobre un elemento de un tercio de ancho. No
   con `left`, no con `width`, no con `layoutId`: los tres obligan
   al navegador a recalcular el diseño en cada fotograma, y este
   control aparece en una lista de veinte filas. */
```

Y es un segmentado de tres opciones excluyentes y no dos casillas, porque dos
casillas permiten desmarcar las dos: «un documento que no se entrega de ninguna
forma no existe. El backend lo rechaza, pero rechazar algo que la interfaz dejó
construir es una mala conversación».

### 5 · El autodiagnóstico del despliegue (frontend + backend)

`21_Api.gs` añade a `documentacion.estado` tres datos:

```javascript
/**
 * ── Por qué viaja esta lista ───────────────────────────────────────────────
 * Es lo que convierte «el módulo no funciona» en una frase accionable. El
 * caso real: se pegan los `.gs` nuevos, se olvida publicar una VERSIÓN NUEVA
 * de la implementación, y el enlace `/exec` sigue sirviendo el código
 * anterior. Todo responde —el estado, el panel— y falla justo lo que se
 * añadió, con un `ACCION_NO_SOPORTADA` que la persona ve como un error
 * genérico en una pantalla cualquiera.
 */
acciones: doc2ApiAcciones_(),
```

`domain/compatibilidad.ts` los interpreta. Seis hallazgos, y cada uno termina en
una instrucción concreta:

| Hallazgo | Gravedad | Qué dice que hay que hacer |
| --- | --- | --- |
| `backend-ajeno` | crítico | «Abra el proyecto de Apps Script DE DOCUMENTACIÓN, copie su URL …/exec y péguela en Configuración» |
| `esquema-anterior` | crítico | «Implementar › Gestionar implementaciones › ✎ Editar › Versión: Versión nueva › Implementar» |
| `acciones-faltantes` | importante | Nombra las que faltan y aclara que hay recaída para todas |
| `catalogo-anterior` | importante | «Respaldar, Instalar o actualizar modelo, Migrar» |
| `migraciones-pendientes` | aviso | «Simular migración y después Migrar» |
| `hojas-faltantes` | crítico | «Instalar el modelo. No borra nada» |

Los dos primeros son el mismo síntoma con arreglos opuestos —uno se resuelve
republicando y el otro cambiando la URL— y confundirlos hace perder una tarde.

### 6 · Rendimiento: tres costes que nadie había pedido

**a · La bitácora de idempotencia.** `docReplay_` consultaba `_SOLICITUDES` en
**toda** petición, incluidas las de lectura:

```javascript
/**
 * Esa hoja crece una fila por escritura: en un libro con seis meses de uso son
 * varios miles de filas, y se leían para responder «¿has visto antes este
 * identificador?» a un identificador recién generado que, por definición, no
 * estaba.
 *
 * Coste medido en el arnés con 3 000 filas de bitácora: +180 ms y una lectura de
 * hoja extra en CADA llamada, incluidas las cuatro del arranque del módulo. Y
 * crecía solo.
 */
```

Ahora solo se consulta en las escrituras, la caché va primero y la hoja solo si
existe. `backend.rendimiento.test.ts` lo fija con 3 000 filas sembradas.

**b · La hoja `Auxiliar`.** Se leía una vez **por columna**, más su fila de
cabeceras: seis viajes al servicio de Sheets para traer un rectángulo que cabe en
uno. Ahora es una lectura memoizada por petición, con invalidación al escribir.

| Acción | Antes | Ahora |
| --- | --- | --- |
| `documentacion.auxiliares` | 4 hojas · 3 015 filas | **2 hojas · 1 017 filas** |
| `documentacion.catalogo` | 5 hojas · 3 054 filas | **3 hojas · 1 060 filas** |

**c · El arranque.** Eran dos llamadas encadenadas: `estado` y después
`catalogo`, que no podía empezar antes porque depende de la primera. En Apps
Script cada llamada paga el arranque del intérprete y la apertura del libro.
`documentacion.arranque` resuelve las dos en la misma ejecución, con el libro ya
abierto: el catálogo cuesta tres lecturas de hoja más, no otro viaje de red.

### 7 · El cliente, ante un backend lento

```ts
/**
 * ── De dónde salen estos números ────────────────────────────────────────────
 *   · **en caliente**, con la instancia ya arrancada, una lectura contesta en
 *     0,4–2 s;
 *   · **en frío** —la primera llamada del día, o la primera después de un
 *     despliegue— hay que sumar el arranque del intérprete y la apertura del
 *     libro: entre 5 y 20 s, y en una red de agencia más.
 */
const TIMEOUT_POR_INTENTO = [20000, 45000, 70000] as const;
```

Y la espera entre intentos pasa a ser exponencial con dispersión:

```ts
/**
 * La espera lineal (600 ms, 1 200 ms) tenía dos problemas. El primero es que no
 * da tiempo a que se libere un libro ocupado por una escritura ajena. El
 * segundo se ve con cinco pestañas abiertas en la misma agencia: si todas
 * reintentan al mismo intervalo exacto, vuelven a colisionar a la vez,
 * indefinidamente.
 */
```

El error original ya no se descarta: viaja en `detalle.causa`. «Antes “No se pudo
contactar con el backend” era todo lo que llegaba: un fallo de CORS, un DNS caído
y una implementación sin publicar producían el mismo mensaje.»

Y la **salud del backend** se mide en una ventana móvil de veinte llamadas —
media, última, peor, fallos y racha— que la pestaña «Esta pantalla» muestra con
una frase que dice qué hacer con ese número. Ventana pequeña a propósito: «un
módulo que estuvo lento esta mañana y va bien ahora no debe seguir diciendo que
va lento».

### 8 · Rendimiento de pintado, y cómo se vigila

Lo nuevo de la capa visual:

- **`content-visibility: auto`** en las listas de fichas del asistente y de
  expedientes, con su alto estimado propio (132 px y 280 px; el de la lista del
  expediente son 72 px y usarlo aquí hacía saltar la barra de desplazamiento).
  Un alta Tipo 2 monta 29 filas y en pantalla caben cuatro: el navegador se
  ahorra el diseño y el pintado de las otras 25.
- **`touch-action: manipulation`** en los controles táctiles. Quita el retardo de
  300 ms que el navegador móvil reserva para el doble toque de zoom; en una lista
  de veinte chips, ese retardo es lo que hace que «se sienta lenta» sin que nada
  tarde.
- **`overscroll-behavior: contain`** en los contenedores con desplazamiento
  propio: llegar al final de la lista seguía desplazando la página de detrás.
- **Filo especular, elevación al pasar el puntero, halo de foco, barras de
  desplazamiento propias e indicador de sección.** Todo con `transform`,
  `opacity` y degradados de pintado, y todo apagado en modo ligero.

El filo especular tiene una decisión que merece explicarse:

```css
/* ── Por qué NO es un `inset: 0` con `z-index: -1` ─────────────
   Porque `.doc-categoria` sí lo hace así y puede: declara
   `isolation: isolate`. `.doc-raised` está en sesenta sitios,
   algunos con desplegables y cabeceras pegajosas dentro, y aislar
   todos esos contextos de apilamiento para pintar una línea sería
   cambiar las reglas de superposición del módulo entero a cambio
   de un adorno. Una tira de 1 px no puede tapar nada. */
```

Y seis **invariantes automatizados** en `npm run doc:check`, todos verificados
rompiéndolos a mano uno por uno:

1. ninguna animación CSS del módulo anima una propiedad de diseño;
2. ninguna transición usa `all`;
3. todo `content-visibility: auto` declara su `contain-intrinsic-size`;
4. el modo ligero apaga **todos** los desenfoques del módulo;
5. todo `will-change` acompaña a una animación real;
6. los controles táctiles declaran `touch-action: manipulation`.

> **Por qué invariantes y no mediciones.** «Estas seis comprobaciones no miden
> nada: revisan reglas que, si se rompen, garantizan que el coste va a subir. Son
> las reglas que este módulo aprendió a base de medir, escritas de forma que un
> cambio futuro no las pueda deshacer sin que alguien se entere.»

### 9 · La migración `4.2.0-legajo-administrativo`

Hace tres cosas y **no** hace cuatro.

Hace: crea las columnas del esquema 6, sube el catálogo a la versión 4 y
**siembra los requisitos nuevos en los expedientes que ya existían**, por lotes.
Ese tercer paso es nuevo respecto a las migraciones anteriores: sin él, los
cuatro documentos solo aparecerían en las altas posteriores al despliegue y el
área acabaría con dos clases de expediente sin forma de distinguirlas.

No hace:

- **no inventa conteos de hojas** (todos en cero, que significa «sin contar»);
- **no borra el conteo del seguro de accidentes**: ese documento pasó a digital y
  su contador desaparece de la pantalla, pero si alguien había anotado cinco
  hojas mirando un papel, el número se conserva en la celda;
- **no toca el estado de ningún requisito existente**;
- **no toca los expedientes aprobados ni archivados.** Sembrar un requisito nuevo
  en un expediente aprobado lo dejaría incompleto y cambiaría un estado que una
  persona decidió. Se omiten y se informa de cuántos.

### 10 · Un fallo de datos que apareció migrando

`doc2SincronizarRequisitos_` archiva los requisitos que dejaron de aplicar y «no
tienen datos». La definición de «tener datos» miraba tres campos y le faltaban
dos:

```javascript
/**
 * ── Un fallo real que esto corrige ────────────────────────────────────────
 * Le faltaban dos, y la segunda apareció migrando el libro de verdad: un
 * requisito RETIRADO —`cert-trabajo`— que un expediente de 2023 tenía en
 * PENDIENTE **con una prórroga concedida** se archivaba, porque sus tres campos
 * estaban vacíos. La prórroga era el dato: alguien se sentó, decidió un plazo y
 * lo escribió. Archivar esa fila convertía esa decisión en un hueco.
 */
```

Las cinco señales son ahora: estado distinto de PENDIENTE, observación escrita,
decisión de revisión, **hojas contadas** (alguien fue al archivador) y **prórroga
registrada** (alguien concedió un plazo).

---

## Verificación

### Números medidos

| Métrica | Antes | Después |
| --- | --- | --- |
| Pruebas automatizadas | 743 en 56 archivos | **817 en 61 archivos** |
| Comprobaciones de `npm run doc:check` | 30 | **37** |
| Sondas de navegador | 10 | **11** |
| `npm run typecheck` | limpio | limpio |
| `npm run build` | correcto | correcto (6,6 s) |
| Chunk `Documentacion` (JS) | 427,0 kB / 111,5 kB gzip | 445,8 kB / 117,5 kB gzip |
| Chunk `Documentacion` (CSS) | 17,8 kB / 4,3 kB gzip | 23,4 kB / 5,2 kB gzip |

El chunk crece 19 kB (6 kB comprimidos): el chip deslizable, el anillo, el
autodiagnóstico de compatibilidad y la medición de salud. El CSS crece 5,6 kB
(0,9 comprimidos): la capa de pulido.

### Trabajo de hoja por petición

Medido con el arnés, que ejecuta los `.gs` reales:

| Petición | Antes | Ahora |
| --- | --- | --- |
| `documentacion.auxiliares` | 4 hojas · 3 015 filas | **2 hojas · 1 017 filas** |
| `documentacion.catalogo` | 5 hojas · 3 054 filas | **3 hojas · 1 060 filas** |
| una lectura con 3 000 filas de bitácora | +1 hoja · +3 000 filas | **sin coste** |
| arranque del módulo | 2 viajes de red | **1 viaje** |

### Cómo probarlo a mano

1. `npm run typecheck && npm test && npm run doc:check` — los tres limpios.
2. `npm run build`.
3. **Sondas de navegador** (Playwright se instala aparte, no está en
   `package.json`):
   ```
   npm i -D playwright && npx playwright install chromium
   node qa/sonda-administrativo.mjs
   node qa/sonda-contraste.mjs
   node qa/sonda-alta-expediente.mjs
   node qa/sonda-modal-expediente.mjs
   node qa/sonda-cache-expedientes.mjs
   npm run build && node qa/sonda-rendimiento.mjs 4
   ```
   Recuerde **quitar Playwright de `package.json`** antes de subir nada.
4. En el módulo, con el backend real:
   - Cree un expediente y elija **Funcionario área administrativa**: el indicador
     tiene que pasar a «Paso 3 de 4» en el momento de elegir, con el aviso verde,
     y «Continuar» tiene que llevar a la revisión.
   - En los documentos generales, escriba un nombre en **Otros**: el requisito
     pasa a «Pendiente» solo. Marque **Digital**: el contador de hojas
     desaparece. Marque **Ambos**: vuelve. Anote hojas y guarde.
   - Abra el expediente y compruebe que el nombre que escribió es el que se ve, y
     que se puede corregir desde ahí.
   - Cree un Comercial **Tipo 1**: el folio real del bien inmueble tiene que
     traer contador de hojas. Cree un **Tipo 3**: el mismo documento, el mismo
     contador, otra subsección.
   - Busque el **seguro de accidentes**: ya no tiene contador.
   - Vaya a **Configuración › Esta pantalla** y pulse «Probar conexión». Debajo
     aparecen los tiempos de las últimas llamadas con su lectura, y los dos
     números que delatan un despliegue a medias con el valor esperado al lado.

> **Limitación honesta de esta iteración.** Las sondas de navegador **no se
> pudieron ejecutar** en el entorno donde se escribió este trabajo: no hay
> Chromium disponible y la descarga está bloqueada. Todo lo demás —817 pruebas en
> jsdom y sobre el backend real, 37 comprobaciones de coherencia, comprobación de
> tipos y construcción— sí se ejecutó y está en verde. Las seis invariantes de
> pintado se añadieron precisamente para cubrir lo que una sonda habría medido, y
> se verificaron rompiéndolas una por una. **Conviene ejecutar
> `node qa/sonda-administrativo.mjs` y `node qa/sonda-contraste.mjs` antes de
> fusionar.**

---

## Puesta en marcha (pasos manuales)

> **Nada de esto es opcional.** El frontend se despliega solo; el backend de Apps
> Script y el libro, no.

### A · Frontend (automático)

Al fusionar, Vercel construye y publica. **No hay variables de entorno nuevas.**

### B · Backend de Apps Script (manual, en este orden)

1. Abra el proyecto de Apps Script **de Documentación** (no el del talento).
2. **Pegue los 22 archivos `.gs`** de `apps-script/documentacion/` sobre los
   existentes, uno por uno, respetando los nombres. Guarde.
   > Han cambiado ocho: `00_Manifest.gs`, `08_Router.gs`, `10_Tests.gs`,
   > `11_Domain.gs`, `12_Data.gs`, `13_Catalog.gs`, `15_Expedientes.gs`,
   > `16_Workflow.gs`, `18_Reports.gs`, `20_Migrations.gs` y `21_Api.gs`. Pegar
   > los 22 igualmente es más seguro que acertar con la lista.
3. Recargue la hoja de cálculo. En el menú **Documentación**, en este orden:
   1. **Respaldar** — primero, siempre. Es la marcha atrás.
   2. **Instalar o actualizar modelo** — crea las columnas nuevas
      (`nombre_personalizado`, `presentacion_fisica`, `presentacion_digital` en
      `ExpedienteDocumentos`; `permite_nombre_libre`, `presentacion_editable`,
      `estado_inicial` en `CatalogoDocumentos`).
   3. **Simular migración** — muestra qué va a cambiar sin cambiar nada. Léalo:
      dice cuántos expedientes se van a sincronizar y cuántos se omiten por estar
      aprobados o archivados.
   4. **Migrar** — aplica `4.2.0-legajo-administrativo`. Si tiene muchos
      expedientes, puede pedir varias pasadas: el propio resultado dice cuántos
      quedan y la migración se reanuda donde se quedó.
4. **Publique una VERSIÓN NUEVA de la implementación.** Este es EL paso que se
   olvida y el que hace que «pegué el código y sigue igual»:
   `Implementar › Gestionar implementaciones › ✎ Editar › Versión: Versión nueva › Implementar`.
   Ejecutar **«Como yo»**, acceso **«Cualquier usuario»**. La URL `…/exec` no
   cambia.
   > A partir de esta versión, si se olvida este paso el módulo lo dice solo: en
   > la cinta superior aparece «El backend desplegado es de una versión anterior
   > (esquema 5, hace falta 6)» con la instrucción exacta.
5. Copie la URL `…/exec` y péguela en **Documentación › Configuración › Conexión
   y esquema › Guardar y probar**.

### C · Lo que el área tiene que revisar (no se puede automatizar)

1. **El seguro de accidentes ya no cuenta hojas.** Si algún expediente tenía
   hojas anotadas ahí, el número **se conserva** en la hoja pero deja de verse.
   No hay nada que hacer; se dice para que nadie lo busque.
2. **Trece documentos llevan contador ahora.** Los cuatro nuevos —manual de
   funciones, memorándum, comunicación interna y el folio real— entran **en
   cero**, que significa «sin contar». El filtro **«Hojas sin contar»** de la
   ventana del expediente sirve exactamente para encontrarlos.
3. **Los expedientes aprobados y archivados NO reciben los requisitos nuevos.**
   Es deliberado. Si alguno tiene que completarlos, hay que reabrirlo
   (Expediente › Restaurar) y usar **Sincronizar requisitos**.
4. **El nombre de «Otros» es por expediente.** Dos expedientes pueden usar
   «Otros» para documentos distintos sin pisarse. En los reportes, la columna
   `Requisito` trae el nombre escrito; la columna `Código` trae
   `otros-documento`, que es por donde se agrupa.

### D · Lista de comprobación posterior

- [ ] Configuración › Conexión y esquema dice **Conectado** y muestra el libro.
- [ ] Configuración › Esta pantalla: «Esquema del libro» dice **6 (esta pantalla
      espera 6)** y «Versión del catálogo» dice **4 (espera 4)**.
- [ ] No hay ninguna cinta de aviso en la parte superior del módulo.
- [ ] `MigracionesDocumentacion` tiene **seis** filas completadas, la última
      `4.2.0-legajo-administrativo`.
- [ ] Un expediente nuevo General trae **20** requisitos; uno Administrativo,
      **20**; uno Comercial Tipo 2, **29**.
- [ ] El asistente, al elegir **Funcionario área administrativa**, pasa a «Paso 3
      de 4» y salta a la revisión.
- [ ] El **seguro de accidentes** ya no muestra contador de hojas.
- [ ] El **folio real del bien inmueble** sí lo muestra, tanto en Tipo 1 como en
      Tipo 3.
- [ ] En **Otros**: escribir un nombre lo pone en «Pendiente»; el chip
      FÍSICO/DIGITAL/AMBOS cambia el contador; el nombre escrito es el que
      aparece en el expediente y en el reporte de pendientes.
- [ ] Un expediente anterior a la migración tiene ahora **20** requisitos y los
      cuatro nuevos en cero.
- [ ] Un expediente **aprobado** sigue aprobado y **sin** los cuatro nuevos.

### E · Reversión, en dos palancas independientes

| Qué salió mal | Qué hacer |
| --- | --- |
| El backend responde mal o no responde | Apps Script › Gestionar implementaciones › Editar › **versión anterior** › Implementar. El frontend nuevo sigue funcionando con el backend viejo: el arranque, el alta y la personalización tienen recaída automática, y la cinta superior dirá que el backend es de una versión anterior. |
| La interfaz tiene un problema | Revierta esta solicitud de extracción. Vercel republica la anterior. El backend nuevo atiende también al frontend viejo: las columnas nuevas se ignoran y `estado_inicial` no cambia nada para quien no lo lee. |
| Los datos quedaron mal | Menú Documentación › **Restaurar respaldo** (el del paso B.3.1). |

**No hace falta revertir las dos cosas para arreglar una.** Es deliberado.

---

## Alternativas consideradas

### La rama administrativa: ¿rama propia o «general» con una etiqueta?

| Rama propia (elegido) | «General» con una marca |
| --- | --- |
| El reporte por categoría distingue administración de «sin clasificar» | Los dos casos son la misma fila y no se pueden separar nunca más |
| El asistente puede saltar el paso porque sabe que la rama no pide nada | Habría que decidir el salto con un campo secundario |
| Un `tipo_funcionario` más en el vocabulario y en el mapa de aplicabilidad | Cero cambios de esquema |
| Migrar los expedientes mal clasificados es un trabajo manual del área | Nada que migrar |

Pesó la primera fila. Clasificar bien es la mitad del trabajo del área, y el
reporte por categoría es la razón de que exista el campo.

### La presentación de «Otros»: ¿por expediente o un requisito por variante?

| Por expediente (elegido) | Tres requisitos: `otros-fisico`, `otros-digital`, `otros-ambos` |
| --- | --- |
| Un solo hueco en el formulario, que es como el área lo piensa | Tres filas de las que dos siempre están «no aplica» |
| Tres columnas nuevas y una función de presentación efectiva | Cero cambios de esquema |
| El cambio de presentación es una edición, no un cambio de requisito | Cambiar de opinión obliga a mover el nombre y las hojas de una fila a otra |
| Abre la puerta a que otros requisitos sean editables | Cada variante futura son tres filas más |

La tercera fila fue decisiva: alguien registra «Otros» como digital, llega el
papel, y con tres requisitos habría que rehacer el registro.

### El diagnóstico de compatibilidad: ¿lista de acciones o número de versión?

| Las dos cosas (elegido) | Solo el número de versión |
| --- | --- |
| Distingue «backend viejo» de «acción concreta que falta» | Un solo síntoma para dos causas |
| Nombra la acción en el mensaje, que es lo que se puede buscar | «Incompatible» y a investigar |
| ~3 kB más en la respuesta de arranque | Cero coste |
| Hay que mantener `ACCIONES_REQUERIDAS` al día | Nada que mantener |

Los 3 kB viajan en una respuesta que ya trae el catálogo completo. Y
`compatibilidad.test.ts` compara la lista con el backend real, así que
mantenerla al día no es un acto de disciplina: es una prueba que falla.

---

## Limitaciones conocidas

- **Las sondas de navegador no se ejecutaron en esta iteración.** No había
  Chromium disponible en el entorno de trabajo y la descarga estaba bloqueada.
  Están escritas y hay que correrlas antes de fusionar.
- **El revelado del contador de hojas anima `width`.** Es la única animación del
  módulo que toca una propiedad de diseño, y es consciente: ocurre una vez por
  clic sobre un elemento de 120 px, no de forma continua. La alternativa
  —`transform: scaleX`— deforma los dígitos mientras dura.
- **La migración no rellena los conteos de hojas.** Los cuatro documentos nuevos
  entran en cero, que significa «sin contar». Inventarlos sería fabricar el dato
  que el área necesita que sea real.
- **Los expedientes aprobados y archivados no reciben los requisitos nuevos.** Es
  deliberado, y la consecuencia práctica es que hay dos clases de expediente
  hasta que alguien decida reabrir los cerrados.
- **`color-mix` en el halo de foco.** Si el navegador no lo soporta, la
  declaración se descarta y queda el anillo de 2 px de siempre. No hay pérdida de
  accesibilidad, solo de suavidad.
- **La salud del backend no se persiste.** Al recargar la pestaña se pierde la
  ventana de veinte muestras. Es a propósito: describe el momento, y un historial
  guardado invitaría a diagnosticar con datos de ayer.

---

## Personas con contexto

- **AlexD5427** — dueño del repositorio; es quien pega los `.gs` en Apps Script y
  quien tiene que hacer los pasos manuales de este documento. Conoce el estado
  real del despliegue, que es el dato que más falta hace para interpretar
  cualquier «se conecta mal».
- **AlexanderBd** (`harley8@postmodule.com`) — co-autor de `11_Domain.gs`,
  `12_Data.gs`, `15_Expedientes.gs` y `08_Router.gs`, que son exactamente los
  cuatro archivos con más cambios en esta iteración. Es la persona a la que
  preguntar antes de tocar el catálogo, el motor de aplicabilidad, la
  idempotencia del enrutador o la lectura de la hoja `Auxiliar`: las cuatro cosas
  con más radio de impacto del módulo.
- **Alex Jhonson** (`reese.a@axisnimbus.com`) — participó en
  `design-system/tokens.ts` y en los almacenes de `src/lib`. Esta iteración añade
  una capa de pulido al CSS del módulo (filo especular, halo de foco, barras de
  desplazamiento) y seis invariantes de pintado al verificador; conviene revisar
  con él si alguna de esas reglas debería subir al sistema de diseño en lugar de
  quedarse en el módulo.
- **AlexRCM** (`shannonz@forgerapid.com`) — tocó la capa heredada del almacén
  local. Esta iteración añade cuatro documentos a `src/lib/docTemplate.ts` para
  que la vista local sin backend siga describiendo los mismos requisitos.

Si va a tocar el catálogo, la aplicabilidad por rama o la migración, hable con
los dos primeros.

---

## Cuestionario

<details>
<summary>1. ¿Por qué el requisito «Otros» nace con el estado <code>NO_APLICA</code> y no <code>PENDIENTE</code>?</summary>

- **A.** Porque no es obligatorio.
- **B.** Porque si naciera pendiente, **todos** los expedientes del banco
  arrastrarían un requisito que nadie va a entregar y ninguno llegaría al
  100 %. ✅
- **C.** Porque el backend no admite crear requisitos en estado pendiente sin
  nombre.

La obligatoriedad y el estado inicial son cosas distintas: hay requisitos
opcionales que sí nacen pendientes, como el carnet de heredero. Lo que decide
aquí es el cálculo de avance: los `NO_APLICA` salen del denominador, así que un
«Otros» sin usar no baja el porcentaje de nadie. Y para que la herramienta siga
siendo usable, escribir el nombre lo promueve a `PENDIENTE` automáticamente.
</details>

<details>
<summary>2. El asistente salta el paso de requisitos específicos en la rama administrativa. ¿Cómo lo sabe?</summary>

- **A.** Comparando el código de la categoría con `"ADMINISTRATIVO"`.
- **B.** Preguntando al catálogo del backend cuántos requisitos **propios** tiene
  la rama (`aplicabilidad[].propios`), con dos recaídas por si el backend es
  anterior o el catálogo aún no llegó. ✅
- **C.** Contando los requisitos del paso y saltándolo si está vacío.

La C es la segunda recaída y funcionaría, pero solo después de tener el catálogo.
La A es lo que había que evitar: el día que el área defina los requisitos de
Ejecutivo —o quite los de Cumplimiento— nadie va a recordar que había una
comparación con un nombre de rama dentro del asistente.
</details>

<details>
<summary>3. ¿Por qué la validación del conteo de hojas recibe el <code>patch</code> en curso?</summary>

- **A.** Para poder escribir el resultado dentro sin devolverlo.
- **B.** Porque en un requisito personalizable la respuesta a «¿lleva conteo?»
  puede estar cambiando **en esa misma escritura**: la persona marca «Ambos» y
  escribe tres hojas de golpe. ✅
- **C.** Para evitar una segunda lectura de la fila.

Mirando solo la fila guardada, la validación consultaría la presentación anterior
—«solo digital»— y rechazaría un cambio perfectamente válido con el mensaje «este
documento no lleva conteo de hojas», que desde la pantalla es indistinguible de
un fallo del sistema. Por eso, además, la personalización se aplica **antes** que
el conteo en los dos caminos del servicio.
</details>

<details>
<summary>4. ¿Qué hacía <code>docReplay_</code> que costaba tiempo en cada consulta, y por qué crecía?</summary>

- **A.** Escribía una fila de bitácora por cada lectura.
- **B.** Cargaba la hoja `_SOLICITUDES` entera —una fila por escritura, miles tras
  meses de uso— para preguntar si un identificador recién generado ya se había
  visto. ✅
- **C.** Consultaba la caché del script, que en Apps Script es lenta.

La reproducción de una lectura no tiene sentido: no hay efecto que evitar
repetir, y la respuesta guardada sería más vieja que la que se puede calcular
ahora mismo. Ahora solo se consulta en las escrituras, la caché va primero —un
reintento llega segundos después y la entrada vive una hora— y la hoja solo si
existe, sin crearla.
</details>

<details>
<summary>5. ¿Por qué el tope de espera del cliente CRECE con el número de intento?</summary>

- **A.** Para que el usuario perciba que el sistema «se esfuerza más».
- **B.** Porque Apps Script en frío tarda entre 5 y 20 s, y con un tope único de
  30 s una llamada que iba a contestar en el segundo 32 se abortaba tres veces:
  noventa segundos para decir «no responde» mientras el backend contestaba. ✅
- **C.** Porque el navegador limita las peticiones simultáneas.

Y hay un segundo efecto peor que la espera: cada aborto dejaba su ejecución en
curso en el servidor, así que el reintento competía con su propio antecesor por
el mismo libro. El primer intento sigue siendo corto (20 s) precisamente para
detectar rápido un backend caído.
</details>

<details>
<summary>6. El filo especular de las tarjetas es una tira de 1 px y no un <code>inset: 0</code> con <code>z-index: -1</code>. ¿Por qué?</summary>

- **A.** Porque `z-index: -1` no funciona en pseudoelementos.
- **B.** Porque el índice negativo necesita `isolation: isolate` en el
  contenedor, y `.doc-raised` está en sesenta sitios —algunos con desplegables y
  cabeceras pegajosas dentro—: aislar todos esos contextos de apilamiento para
  pintar una línea cambiaría las reglas de superposición del módulo entero. ✅
- **C.** Porque una tira de 1 px se pinta más rápido.

`.doc-categoria` sí usa `inset: 0` con índice negativo, y puede porque declara
`isolation: isolate` y es una tarjeta cerrada sin nada que superponer. Una tira de
1 px pegada al borde superior no puede tapar contenido, así que no necesita
índice y no obliga a tocar el apilamiento.
</details>

<details>
<summary>7. ¿Por qué un requisito que dejó de aplicar pero tiene una prórroga concedida NO se archiva?</summary>

- **A.** Porque las prórrogas apuntan a la fila y borrarla dejaría una referencia
  huérfana.
- **B.** Porque la prórroga **es** el dato: alguien se sentó, decidió un plazo y
  lo escribió. Archivar esa fila convierte esa decisión en un hueco. ✅
- **C.** Porque el backend no puede archivar filas con registros asociados.

La A es un efecto colateral real pero no es el motivo. Este fallo apareció
migrando el libro de verdad: un `cert-trabajo` de 2023 en PENDIENTE con prórroga
concedida se archivaba porque los tres campos que se miraban estaban vacíos. Las
señales son ahora cinco, y las dos nuevas —hojas contadas y prórroga registrada—
son las dos formas de «alguien tocó esto» que no dejan rastro en el estado
documental.
</details>
