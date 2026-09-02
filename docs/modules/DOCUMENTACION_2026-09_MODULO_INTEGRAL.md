# Módulo de Documentación — catálogo v3, conteo de hojas y la hoja `Auxiliar` que sí traía todo

> Documento explicativo de esta iteración. Está escrito para dos lectores: quien
> nunca tocó el módulo y necesita el mapa, y quien ya lo conoce y quiere ir a lo
> que cambió. Las secciones marcadas **Fondo** pueden saltarse si se domina el
> sistema.
>
> Si solo vienes a poner esto en marcha, salta a **[PASOS MANUALES](#pasos-manuales)**.

---

## PASOS MANUALES

Nada de esto lo puede hacer el código. Son cinco cosas, en este orden.

### 1 · Pegar los archivos `.gs` en Apps Script

Abre el proyecto de Apps Script del módulo de Documentación y pega **los 22
archivos** de `apps-script/documentacion/`, cada uno con su nombre exacto.

> **Por qué los 22 y no solo los que cambiaron.** Apps Script no tiene módulos:
> todos los `.gs` comparten un único espacio global y **el orden del prefijo
> numérico decide qué se declara antes**. Si pegas cinco archivos y dejas los
> otros diecisiete en una versión anterior, puede que una constante que ahora vive
> en `11_Domain.gs` se lea desde `13_Catalog.gs` antes de existir, y el síntoma no
> es un error claro: es un `undefined` silencioso a mitad de una operación. Pegar
> los 22 cuesta cinco minutos y elimina la clase entera de problema.

Los que cambiaron en esta iteración, para tu referencia: `00_Manifest.gs`,
`10_Tests.gs`, `11_Domain.gs`, `12_Data.gs`, `13_Catalog.gs`, `15_Expedientes.gs`,
`20_Migrations.gs` y `21_Api.gs`.

### 2 · Ejecutar el menú **Documentación** del libro, en este orden

| Orden | Opción del menú | Qué hace | Qué esperar |
|---|---|---|---|
| 1 | **Respaldar** | Copia los expedientes antes de tocar nada | Un aviso con el identificador del respaldo |
| 2 | **Instalar o actualizar (modelo normalizado)** | Crea las columnas nuevas y siembra el catálogo v3 | «columnas añadidas» en `Expedientes`, `ExpedienteDocumentos`, `CatalogoDocumentos` y `Auxiliar` |
| 3 | **Simular migración** | Recorre todo y cuenta lo que haría, **sin escribir una celda** | Tres migraciones nuevas: `5.0.0-hojas-fisicas`, `5.0.1-catalogo-v3`, `5.0.2-identificadores` |
| 4 | **Migrar** | Aplica lo que la simulación anunció | «Catálogo v3: N creado(s), M actualizado(s), 2 retirado(s)» |

> **Lee el resultado de la simulación antes de migrar.** Si `5.0.2-identificadores`
> avisa de **parejas con la misma clave**, hay dos expedientes que hasta ahora eran
> distintos y ahora comparten carnet (por ejemplo `1234567` y `1.234.567`). La
> migración **no los fusiona** —eso es una decisión humana— y te los nombra. Míralos
> antes o después, pero míralos.

### 3 · Publicar una VERSIÓN NUEVA de la implementación

**Guardar el archivo no basta.** La aplicación web sirve la última *versión
publicada*, no lo último guardado en el editor. Si te saltas este paso, el
frontend nuevo hablará con el backend viejo y no verás ni el conteo de hojas ni
la columna `cargo_bdp`.

En Apps Script:

1. **Implementar › Gestionar implementaciones**
2. En la implementación existente, el lápiz de **Editar**
3. **Versión** → **Versión nueva**
4. **Ejecutar como:** *Yo*
5. **Quién tiene acceso:** *Cualquier usuario*
6. **Implementar**

### 4 · Pegar la URL en el módulo

Copia la URL que termina en `/exec` y pégala en:

**Documentación › Configuración › Conexión y esquema › Guardar y probar**

Debe responder «conectado» y nombrar el libro.

### 5 · Lo que tienes que escribir TÚ en la hoja de cálculo

Abre la hoja **`Auxiliar`**. El backend ya creó la cabecera que faltaba, pero los
valores los pones tú.

- **`cargo_bdp`** — la columna es nueva. El backend la crea y la siembra con los
  cargos que ya aparecen en los expedientes existentes, para que el desplegable no
  nazca vacío. **Pega debajo la lista de cargos del banco.** Son cientos y no están
  en ningún sitio que el backend pueda leer.
- **`agencia_bdp`** y **`gerencia_bdp`** — compruébalas. Ahora se leen enteras
  (antes se recortaban, ver [El fallo de la hoja `Auxiliar`](#2--el-fallo-de-la-hoja-auxiliar)),
  así que puede que aparezcan valores que llevaban tiempo sin salir en el
  desplegable. Es lo correcto: estaban escritos y no se mostraban.

Un valor por celda, hacia abajo, sin filas en blanco intercaladas —aunque si las
hay, ya no rompen nada—. **Nunca borres un valor**: una agencia que cerró sigue
siendo necesaria para leer los expedientes antiguos.

### Lista de comprobación posterior

Cuando termines, esto es lo que tiene que verse:

- [ ] **Nuevo expediente › Documentos generales** muestra **16** requisitos, no 18.
      Los dos que faltan (*Certificados de trabajo* y *RC-IVA*) son los retirados.
- [ ] En esos 16, **exactamente 5** tienen contador de hojas al lado: antecedentes
      FELCC, REJAP, título legalizado, seguro de accidentes y seguro de vida.
      Ninguno más. Los demás son digitales y no lo llevan **ni oculto**.
- [ ] Los antecedentes FELCC y el REJAP muestran **«Papel: Sí\*»** y al pie de la
      sección aparece la leyenda que explica el asterisco.
- [ ] El primer campo se llama **«Carnet de identidad»** y acepta `1234567-1A`,
      `8.765.432` o `CI 999888 Cbba` sin quejarse.
- [ ] Escribir un carnet que ya existe muestra el nombre de esa persona y un botón
      **«Abrir el expediente existente»**; lo que llevabas escrito sigue ahí.
- [ ] **Cargo** filtra la lista mientras escribes y dice cuántas coincidencias hay
      («12 de 187»). Las flechas y Enter funcionan.
- [ ] **Comercial › Tipo 2** muestra dos subsecciones con título, y dentro de la
      segunda, dos bloques: *Garante familiar 1* y *Garante familiar 2*.
- [ ] **Comercial › Tipo 3** muestra *«Postulante con inmueble propio»* (no
      *«1 Garante con Bien Inmueble»*, que es el título del Tipo 1).
- [ ] Los recuentos por rama son: **General 16 · T1 21 · T2 25 · T3 21 ·
      Auditoría 17 · Cumplimiento 19**.
- [ ] Un **expediente antiguo** sigue mostrando sus datos. Si tenía *Certificados
      de trabajo* con una prórroga concedida, ahora aparece bajo *«Requisito
      heredado (ya no se exige)»*, con su plazo.
- [ ] El **informe mensual** del mes en curso se descarga e incluye una columna de
      hojas físicas.
- [ ] En el libro anual, la columna **`PAGINAS`** deja de estar siempre a cero.
- [ ] Las columnas **A a W** del libro anual están intactas y en el mismo orden.

### Plan de reversión — dos palancas independientes

Se pueden accionar en cualquier orden, y por separado.

**Palanca 1 · el backend.** Apps Script › *Implementar › Gestionar
implementaciones › Editar › Versión* → elige la versión anterior. Efecto
inmediato, sin tocar datos. Las columnas nuevas se quedan en la hoja (vacías y
sin molestar: el código anterior no las lee) y el catálogo se queda en la v3, que
el código anterior sabe leer porque solo añade campos.

**Palanca 2 · el frontend.** Revertir el PR en GitHub; Vercel republica solo. La
interfaz anterior contra el backend nuevo funciona: el catálogo v3 le da 16
generales en vez de 18, que es lo que el área pidió, y los campos que no conoce
los ignora.

> **Variables de entorno en Vercel: ninguna nueva.** Nada de esto necesita
> configuración de despliegue. La URL del backend vive en los ajustes locales del
> módulo (`bdp-documentacion`), en el navegador de cada persona.

---

## Fondo

### El sistema, en una frase

Una consola web que persigue el papeleo de incorporación de cada persona que
entra al Banco de Desarrollo Productivo. No hay base de datos relacional: hay
**una hoja de cálculo de Google** y un proyecto de **Apps Script** que la lee y la
escribe. El frontend (React + Vite + TypeScript) habla con ese Apps Script por
HTTP.

> **Concepto clave — dos capas sobre una hoja.** Debajo, 19 hojas *normalizadas*
> (una fila por hecho: un expediente, un documento, una prórroga). Encima, el libro
> anual `CONTROL INGRESOS <año>` que el área reconoce, con sus mismas columnas
> A–W. El modelo normalizado es la verdad; el libro anual es el espejo.

### El catálogo manda

La pieza central es `CatalogoDocumentos` y su motor de aplicabilidad,
`doc2Aplicables_`. Cada documento declara a qué `tipo_funcionario` y a qué
`tipo_garantia` aplica. Al crear un expediente, el backend recorre el catálogo y
genera **solo** los requisitos de esa rama. El formulario, la vista, los reportes
y las exportaciones preguntan todos a la misma función: por eso no pueden
discrepar.

> **Regla que esta iteración respeta hasta el final.** Un requisito nuevo se
> **declara en el catálogo**, nunca se cablea en la interfaz. Cuando más adelante
> se lee que el contador de hojas «se deduce», es por esto.

### La hoja `Auxiliar`

Guarda **un catálogo por COLUMNA**, no por fila: una columna por lista, un valor
por celda. Es la convención que el resto de la aplicación ya usa. Y tiene una
regla dura: **nunca se quita un valor**. Una agencia que cerró sigue siendo
necesaria para leer los expedientes antiguos.

---

## Intuición

Esta iteración hace ocho cosas. Cada una cabe en un párrafo.

**1 · La lista de documentos del área, tal como es.** Los generales pasan de 18 a
**16**, con el texto literal de la hoja de papel que usa el área. Los dos que
sobraban no se borran: se **retiran**. Un requisito retirado es como una agencia
cerrada — ya no se ofrece, pero sigue explicando el pasado.

**2 · El papel se cuenta.** Nueve requisitos se entregan en papel y el área
necesita saber cuántas hojas tiene cada uno. Ahora hay un contador al lado, y
**solo al lado de esos nueve**. La lista no está escrita en ningún componente: el
catálogo dice si el documento es de papel, y de ahí se **deduce** el contador. Un
documento digital con contador es imposible por construcción.

**3 · El asterisco es un dato.** La tabla del área marca «SÍ», «SÍ\*» y «N/A» en
la columna *Física*. El asterisco significa «sí, pero solo en los casos que el
área indique». Antes eso habría sido un comentario en el código; ahora es el valor
`CONDICIONAL`, que se pinta con su asterisco y su leyenda al pie.

**4 · Un documento, dos sitios.** `garante-inmueble` aplica al Tipo 1 y al Tipo 3.
En el Tipo 1 es del **garante**; en el Tipo 3 es del **propio postulante**. Es la
misma fila del catálogo con dos significados, así que la subsección no puede ser
un texto: es un **mapa por rama**.

**5 · El carnet, como está en el documento.** Se exigía «CI - proceso - año». Los
carnets reales no caben en ese molde. El único efecto de la validación era que
quien registraba escribía cualquier cosa que la pasara. Se quita el formato y se
refuerza lo que de verdad importaba: que dos formas de escribir el mismo carnet
sean la misma persona.

**6 · La hoja `Auxiliar` tenía tres agujeros.** Uno hacía que una cabecera
`Agencia_BDP` devolviera lista vacía sin un solo error. Otro cortaba la columna en
el primer hueco. El tercero —el peor— **pisaba una agencia existente** al añadir
una nueva.

**7 · Cuatro llamadas se convierten en una.** El alta hacía `crear` → `obtener` →
`guardar` → N × `prorroga`. Con veinticinco requisitos eran seis viajes de red y el
botón se quedaba «guardando» ocho segundos, tiempo suficiente para que alguien lo
volviera a pulsar.

**8 · Se puede guardar una copia, si no se miente.** El módulo se negaba a
guardar expedientes en el navegador con un argumento correcto: «una copia envejece
en segundos». La conclusión no lo era. De «una copia envejece» se sigue «la copia
no puede presentarse como fresca», no «no hay copia».

---

## El código, área por área

### 1 · Catálogo versión 3

**Dónde:** `11_Domain.gs` (la semilla), `13_Catalog.gs` (la siembra y el motor).

La semilla pasa a 39 filas: 16 generales vigentes, 2 retirados, 17 de garantía y
4 de cumplimiento. Cada definición gana cuatro campos:

```javascript
{
  codigo: 'rejap', orden: 3,
  nombre: 'Registro Judicial de Antecedentes Penales REJAP (vigente).',
  nombreAnterior: 'Registro Judicial de Antecedentes Penales (REJAP)',
  seccion: 'generales', grupo: 'personal', obligatorio: true, columna: 'rejap',
  fisica: 'CONDICIONAL', digital: 'SI'
}
```

`fisica` y `digital` son la tabla del área. **`conteoHojas` no aparece**: se
deduce.

```javascript
/** ¿Se entrega en papel? `CONDICIONAL` cuenta como sí: puede llegar en papel. */
function doc2EsFisico_(presentacion) {
  var valor = docKey_(presentacion);
  return valor === DOC2_PRESENTACION.SI || valor === DOC2_PRESENTACION.CONDICIONAL;
}
```

> **Por qué deducirlo y no declararlo.** Si `requiere_conteo_hojas` se declarara a
> mano, nada impediría un documento digital con contador («¿cuántas hojas tiene una
> fotografía enviada por WhatsApp?») ni un documento de papel sin él. Derivándolo,
> las dos incoherencias son imposibles. Hay una prueba que recorre el catálogo
> entero comprobando esa equivalencia documento a documento.

#### El renombrado sin pisar el trabajo ajeno

La versión 3 renombra los 16 generales. Pero el área puede haber editado un
nombre a mano, y esa edición no se puede perder. Para eso está `nombreAnterior`:

```javascript
function doc2NombreSinEditar_(guardado, def) {
  var actual = docKey_(guardado || '');
  if (!actual) return true;
  if (actual === docKey_(def.nombre || '')) return true;
  if (def.nombreAnterior && actual === docKey_(def.nombreAnterior)) return true;
  return false;   // hay otro texto: alguien lo escribió, y gana
}
```

Si en la hoja sigue estando lo que puso la semilla anterior, nadie lo ha tocado y
se puede actualizar. Si hay otra cosa, es una decisión humana y se respeta.

#### La retirada

`retirado: true` no borra nada. Deja `activo = FALSE` y una fecha de fin de
vigencia. Las tres consecuencias son buscadas:

- `doc2Aplicables_` solo mira los activos → un expediente **nuevo** ya no los pide;
- los expedientes **antiguos** conservan su fila con su estado y su observación;
- la sincronización los conserva porque tienen datos, no los archiva.

### 2 · El fallo de la hoja `Auxiliar`

**Dónde:** `12_Data.gs`.

Tres fallos independientes, en la misma función de veinte líneas.

**El primero: la cabecera.** Se comparaba `String(cabecera).trim() === columna`.

```javascript
// Antes
if (String(cabeceras[i] || '').trim() === columna) { indice = i + 1; break; }
```

Eso falla con todo lo que una hoja escrita a mano tiene de verdad: `Agencia_BDP`,
`agencia bdp`, un espacio duro (`\u00a0`) pegado al copiar de un correo, un
acento. Y cuando fallaba, la función devolvía `[]`: **el desplegable aparecía
vacío sin un solo error en ningún sitio**. El síntoma que reportaba el área era
«Agencia no trae los valores», y no había nada en la consola.

```javascript
// Después
function doc2ClaveCabecera_(valor) {
  var texto = String(valor === null || valor === undefined ? '' : valor);
  return docKey_(texto.replace(/\u00a0/g, ' ')).replace(/[\s_\-.]+/g, '');
}
```

**El segundo: el fin de la columna.** Las columnas de `Auxiliar` tienen distinta
longitud y **huecos** —alguien borró un valor del medio y dejó la fila—. Pararse
en el primer hueco recortaba la lista a la mitad. Ahora se lee el rango completo y
se filtra después: es una sola llamada a la hoja, así que no cuesta más que la
versión rota.

**El tercero, y el que destruía datos.** Al añadir un valor:

```javascript
// Antes
var desde = 2 + actuales.length;   // ← `actuales` está DEDUPLICADO Y ORDENADO
```

Con una columna que tiene un hueco, o dos valores que solo se diferencian por un
espacio, esa cuenta apunta a una fila **ocupada**. Añadir «POTOSÍ» **pisaba** una
agencia existente. Ahora se busca la última fila con contenido real de esa
columna y se escribe debajo.

> **Verificado con 300 valores.** Una columna de 300 cargos con un hueco en el
> medio devuelve **299**. Otra de 6 agencias con `la paz` y `LA PAZ` devuelve 6,
> conservando el texto tal como se escribió, y `Ñuflo de Chávez` ordena entre
> `LA PAZ` y `POTOSÍ`, que es donde el español lo pone.

### 3 · Subsecciones, y el documento compartido

**Dónde:** `11_Domain.gs`, `13_Catalog.gs`, `domain/progreso.ts`.

`subseccion` admite las dos formas:

```javascript
// Texto único: la misma subsección en cualquier rama.
subseccion: '1 Garante que demuestre ingresos'

// Mapa por rama: la MISMA fila del catálogo, dos significados.
subseccion: {
  COMERCIAL_1: '1 Garante con Bien Inmueble',
  COMERCIAL_3: 'Postulante con inmueble propio'
}
```

Y se resuelve al calcular la aplicabilidad. Aquí hay un detalle que costaría
depurar:

```javascript
function doc2ResolverParaRama_(def, tipoGarantia) {
  var copia = {};
  for (var k in def) {
    if (Object.prototype.hasOwnProperty.call(def, k)) copia[k] = def[k];
  }
  copia.subseccion = doc2SubseccionDe_(doc2SubseccionParsear_(def.subseccion), tipoGarantia);
  return copia;
}
```

> **Por qué es una copia y no una mutación.** `doc2Catalogo_` guarda las filas en
> una caché por petición y las devuelve **por referencia**. Escribir la subsección
> resuelta sobre la fila cacheada envenenaría la siguiente consulta:
> `garante-inmueble` acabaría con la subsección del Tipo 1 al preguntar por el Tipo
> 3. Y el error solo se vería en la *segunda* llamada de la misma petición, que es
> el peor sitio donde buscar.

En el frontend hay **una sola** función de agrupación
(`agruparPorSubseccion`) que usan el asistente, el visor, el informe y las
exportaciones. Cuatro copias del mismo `if` acabarían discrepando justo en el caso
del Tipo 2, que es el que importa.

### 4 · Conteo de hojas, de la interfaz a la hoja

**Dónde:** `11_Domain.gs`, `15_Expedientes.gs`, `20_Migrations.gs`,
`ui/ContadorHojas.tsx`.

Columna nueva `hojas_fisicas` en `ExpedienteDocumentos`, con validación en el
backend: entero, 0–999, y **solo** en requisitos con contador.

```javascript
if (!admite) {
  throw docError_(DOC_CODE.VALIDATION_ERROR,
    'El requisito "' + doc2NombreRequisito_(fila) + '" no se entrega en papel: no lleva conteo de hojas.',
    { details: { fields: doc2Campo_('hojas_fisicas', 'Este documento no lleva conteo de hojas.') } });
}
```

> **Por qué rechazar y no ignorar.** Un contador enviado sobre un requisito
> digital significa una de dos cosas: el cliente está desincronizado con el
> catálogo, o alguien está llamando a la API a mano. Guardarlo en silencio deja un
> dato que nadie sabe interpretar; descartarlo en silencio hace creer que se
> guardó. Se rechaza con `campos`, y el formulario marca el control que sobra.

#### Vacío y cero son dos hechos distintos

`null` es «nadie lo ha contado». `0` es «se contó y no había hojas». El informe
los cuenta aparte, así que la conversión tiene que respetar el cero — y ahí había
un fallo real:

```javascript
// Antes: en JavaScript el cero es FALSO.
hojasFisicas: String(r.hojas_fisicas || '').trim() === '' ? null : docInt_(...)
//                                  ↑ un conteo de CERO hojas se volvía «sin contar»
```

La comparación ahora es explícita contra `null`, `undefined` y cadena vacía. Es
exactamente la misma clase de error que hacía que la auditoría volviera con un
evento cuando se pedían cero (`docInt_(0, 40)`), y las dos se arreglaron.

#### El libro anual, sin tocar las columnas del área

La columna `PAGINAS` **ya existía** en el bloque de gestión (a partir de la X) y
estaba siempre a cero, porque el espejo escribía `pages: 0`. Ahora lleva el
conteo. Las columnas **A–W** no se tocan ni se renumeran, y el `DETALLE JSON`
mantiene el detalle por documento.

#### El control, y tres decisiones que parecen detalles

**No es un `type="number"`.** El control nativo cambia el valor cuando la rueda
del ratón pasa por encima. En una lista de veinticinco requisitos que se recorre
desplazándose, eso significa **alterar en silencio** un dato que alguien ya había
anotado, sin rastro de que se tocó.

**Al marcar `N/A` se deshabilita pero no se borra.** Marcar «no aplica» por error
y revertirlo es habitual; perder el conteo en el intermedio obliga a volver a
contar las hojas de un documento que ya está en la carpeta.

**El texto local se sincroniza solo cuando el valor cambia desde fuera.** Es el
invariante de campo controlado del módulo: reescribirlo en cada pulsación haría
imposible escribir «12», porque el «1» se normalizaría antes del «2».

### 5 · El carnet libre, y la cadena que colgaba de él

**Dónde:** `12_Data.gs`, `15_Expedientes.gs`, `ui/AltaExpedienteWizard.tsx`,
`20_Migrations.gs`.

Quitar la validación es una línea. Lo interesante es lo que dependía de ella.

Sin patrón que los uniforme, la misma persona se puede escribir de seis maneras.
La normalización solo quitaba espacios:

```javascript
// Antes
return docKey_(valor).replace(/\s+/g, '');
```

`9 876 543` y `9876543` colapsaban; `9.876.543` y `9-876-543` **no**. El módulo
aceptaba varios expedientes de la misma persona y el informe mensual contaba
varias incorporaciones donde hubo una. Con la validación de formato eso quedaba
tapado; sin ella, quedaba a la vista.

```javascript
// Después: solo letras y dígitos.
return docKey_(valor).replace(/[^0-9A-Z]/g, '');
```

Se conservan las letras porque los complementos alfanuméricos (`1234567-1A`)
distinguen carnets de verdad. Lo que se descarta es la puntuación, que nunca
distingue nada.

> **La unicidad no depende de la migración.** Endurecer la regla deja las filas
> antiguas con la clave vieja. `doc2BuscarPorIdentificador_` **recalcula desde el
> texto original**, que es inmutable, en vez de fiarse de la columna. Así la
> detección de duplicados funciona aunque nadie haya migrado todavía; la migración
> `5.0.2-identificadores` solo pone al día lo que sí lee la columna (los filtros y
> el orden), y **reporta las colisiones sin fusionarlas**.

El buscador de la lista también tuvo que aprender: buscar `7654321` no encontraba
`7.654.321-2B`. Ahora el pajar incluye la forma normalizada además de la original,
y se busca en las dos direcciones.

Y el duplicado dejó de ser un callejón sin salida:

```javascript
details: {
  duplicado: {
    expedienteId: existente.expediente_id,
    identificador: existente.identificador,
    nombre: existente.nombre || '',
    cargo: existente.cargo || '',
    /* … */
  }
}
```

> Un duplicado casi nunca es «has escrito algo mal»: es «esta persona ya estaba
> registrada». Lo útil es **abrir** el expediente que existe, y para eso el error
> tiene que traer con qué. El formulario no se limpia: lo que se llevaba escrito
> sigue ahí, por si el carnet estaba mal.

### 6 · El alta en una sola ida y vuelta

**Dónde:** `15_Expedientes.gs`, `21_Api.gs`, `ui/AltaExpedienteWizard.tsx`.

`documentacion.expediente.crear` acepta ahora los estados, las observaciones, las
hojas y las prórrogas en la **misma** llamada, y devuelve el expediente ya montado
para que el visor lo abra sin una quinta petición.

Aquí hay una asimetría deliberada:

```javascript
if (lote.fallidos.length) {
  throw docError_(DOC_CODE.VALIDATION_ERROR, /* … */,
    { hint: 'Corrige ese requisito y vuelve a guardar. El expediente no se creó.' });
}
```

> **Editar es tolerante; crear es estricto.** `doc2ActualizarRequisitosEnLote_`
> valida cada cambio por separado y devuelve los que fallan sin tumbar los que
> valían — es lo correcto cuando alguien edita un expediente que ya existe: un
> cambio rechazado no debe hacerle perder los otros cinco. En un **alta** no: la
> persona todavía no tiene el expediente delante, y uno creado al que le falta la
> mitad de lo que marcó es peor que uno que no se creó, porque nadie sabe qué quedó
> fuera.

La reversión, además, es gratis: el enrutador llama a `docRollback_()` cuando la
acción lanza y el motor de almacenamiento descarta las escrituras pendientes de
esa petición. `doc2RevertirAltaFallida_` queda como red de seguridad para los
caminos que fuerzan un `docCommit_` en medio (crear una hoja, una migración), y
marca el expediente como eliminado lógico en lugar de borrar la fila: el
`idempotency_key_creacion` tiene que seguir ahí para que un reintento con la misma
clave encuentre el mismo expediente y no cree un tercero.

#### La ventana entre los dos despliegues

Vercel publica el frontend al fusionar. Apps Script solo cambia cuando una persona
publica una versión nueva. Hay una ventana —a veces de días— en la que la interfaz
nueva habla con el backend viejo.

```javascript
soporta: {
  altaCompleta: true,
  detalleMultiple: true,
  hojasFisicas: true,
  subsecciones: true,
  cargoAuxiliar: true
}
```

El frontend **pregunta** en vez de suponer. Sin `altaCompleta`, recorre la ruta
antigua de cuatro pasos y nadie se entera. Esa ruta se conserva completa a
propósito: **no es código muerto**, es la que se ejecuta el día del despliegue,
antes de que alguien publique el `.gs`.

### 7 · Caché con revalidación y cola de salida

**Dónde:** `state/cacheExpedientes.ts`, `state/colaSalida.ts`.

La caché es de **revalidación**, no ciega: al elegir un expediente se pinta al
instante lo guardado, se pregunta al backend en paralelo, y si la versión cambió se
reconcilia. Con una excepción que es la que hace usable todo lo demás:

```typescript
if (editando) {
  return { tipo: "conflicto", detalle: remoto, versionLocal: local.version, versionRemota };
}
```

> Sin esa rama, escribir una observación larga mientras llega una revalidación
> borraría la frase a medias. Es el mismo tipo de fallo por el que en este módulo
> antes «entraba una sola letra».

Son **datos personales**, así que: TTL de media hora, tope de 60 entradas con
desalojo del menos usado, sin auditoría ni historial largo, y **borrado al cambiar
de perfil**. Está en `docs/modules/SECURITY.md`.

La cola de salida tiene cuatro propiedades, y la tercera tiene un matiz:

**Coalescencia.** Marcar un requisito tres veces es **una** escritura, la última.

**Idempotencia.** El `solicitudId` viaja con la petición y el enrutador descarta
una repetida. Reintentar es gratis.

**El `solicitudId` cambia al FUSIONAR.** Parece que conviene conservarlo, y es lo
contrario: si el primero ya salió y volvió a la cola por un tiempo agotado,
reutilizar su clave haría que el backend lo tratara como repetido y devolviera la
respuesta del primer envío, **descartando el cambio fusionado en silencio**.

**No se reintenta lo que un reintento no arregla.** Un permiso insuficiente o una
fecha imposible se quedan en `fallido` con su mensaje, visibles, fuera de la rueda
de reintentos.

Y lo que quedó «enviando» al recargar vuelve a `pendiente`, no a «guardado»: no se
sabe si llegó, y darlo por bueno sería exactamente mentir.

### 8 · Contraste AA en los dos temas

**Dónde:** `ui/documentacion.css`, `__tests__/contraste.test.ts`,
`qa/sonda-contraste.mjs`.

`--doc-text-faint` heredaba la escala global (`--ink-faint`). Medido sobre las
superficies reales del módulo:

| Token | Tema | Antes | Después | Umbral |
|---|---|---|---|---|
| `--doc-text-faint` | claro | **2,99:1** | 6,21:1 | 4,5:1 |
| `--doc-text-faint` | oscuro | **4,42:1** | 6,11:1 | 4,5:1 |
| `--doc-text-muted` | claro | 5,67:1 | 8,34:1 | 4,5:1 |

Y no es texto decorativo: ahí van las ayudas de los campos, los marcadores de
posición, las etiquetas de los gráficos y los recuentos.

> **Por qué el módulo declara su propia escala.** La global sigue intacta —la usa
> el resto de la aplicación—. El módulo declara la suya, por tema, con valores
> medidos, y el CSS declara además `--doc-medicion-fondo`: el color contra el que
> se midió, para que la prueba automática no tenga que adivinarlo.

La prueba lee el **CSS real** (no una copia de los valores en un objeto de
prueba, que se desincronizaría el primer día), recorre la cascada como la recorre
el navegador y falla por debajo del umbral con el número medido en el mensaje.
Hay además una regresión específica que impide volver a escribir `var(--ink-*)`
en esos dos tokens: es tentador —parece coherencia— y es justo lo que los rompía.

### 9 · Dos fallos de conservación de datos, encontrados por el camino

Ninguno de los dos estaba en el encargo. Los dos destruían información.

**`tieneDatos` no miraba las prórrogas.** Al recalcular la aplicabilidad, un
requisito se archiva si no tiene datos. Se consideraba «datos» el estado, la
observación y la revisión — pero no el plazo concedido. Así que un requisito
todavía pendiente al que alguien había dado hasta el 31 de marzo se consideraba
vacío y **se archivaba**: la fila de la prórroga seguía en su hoja, pero el
requisito desaparecía de la vista y con él el plazo. Nadie volvía a perseguirlo.

**La migración perdía los requisitos retirados con historia.** Un expediente que
venía del libro con `rc-iva` en «no aplica» no recibía fila para ese documento,
porque el catálogo v3 ya no lo exige. El dato de 2024 se habría perdido — justo lo
que la retirada del catálogo prometió no hacer. Ahora se **rescatan** los que
tienen estado, observación **o prórroga**, marcados como *«Requisito heredado (ya
no se exige)»*.

> Lo de la prórroga se me pasó en el primer intento: mirar solo el estado
> descartaba un `cert-trabajo` «pendiente **con un plazo concedido**», que no es la
> ausencia de información sino una decisión que alguien tomó y que hay que poder
> auditar.

---

## Alternativas consideradas

### Para el contador de hojas: ¿campo del catálogo o lista en la interfaz?

| Deducirlo del catálogo (elegido) | Declarar la lista en la interfaz |
|---|---|
| ✅ Un requisito de papel nuevo tiene su contador sin tocar código | ✅ Se ve de un vistazo qué documentos lo llevan |
| ✅ Imposible un digital con contador o un físico sin él | ❌ Dos fuentes: el catálogo dice una cosa y la interfaz otra |
| ✅ El área puede cambiar la forma de entrega sin un despliegue | ❌ Cambiar la forma de entrega exige fusionar y publicar |
| ❌ Hay que leer el catálogo para saber cuáles son | ❌ El primer olvido produce un contador que no se guarda |

### Para las subsecciones: ¿mapa por rama o duplicar el documento?

| Mapa por rama (elegido) | Un código por rama |
|---|---|
| ✅ Una fila, un código: los expedientes guardados siguen valiendo | ✅ Cada fila tiene un solo significado, sin mapas |
| ✅ Sin migración de datos | ❌ Renombrar códigos está prohibido: los expedientes los referencian |
| ✅ El motor de aplicabilidad no cambia | ❌ Dos filas que son el mismo documento se editan por separado y divergen |
| ❌ `subseccion` guarda JSON en una celda | ❌ Migración de datos a cambio de nada |

### Para la caché: ¿revalidación o no guardar nada?

| Caché con revalidación (elegido) | No guardar expedientes (como estaba) |
|---|---|
| ✅ Abrir un expediente precargado es instantáneo | ✅ Imposible mostrar un dato viejo |
| ✅ Se puede consultar y exportar sin conexión | ✅ Cero datos personales en el navegador |
| ✅ Nunca se presenta como fresco lo que no lo es | ❌ Cada apertura es un viaje de red completo |
| ❌ Datos personales en el equipo: obliga a TTL, tope y borrado al cambiar de perfil | ❌ Sin conexión, el módulo no sirve para nada |

---

## Verificación

| Comprobación | Antes | Después |
|---|---|---|
| `npm run typecheck` | limpio | limpio |
| `npm test` | 627 pruebas / 49 archivos | **697 pruebas / 53 archivos** |
| `npm run doc:check` | 20 comprobaciones | **25 comprobaciones** |
| `npm run build` | 13,2 s | 12,3 s |
| Chunk del módulo (gzip) | 97,80 kB | 100,57 kB |
| CSS del módulo (gzip) | 3,09 kB | 3,57 kB |

Pruebas nuevas, por área:

- **contraste** (25) — cada token de tinta y de estado, en los dos temas, medido
  sobre el CSS real, más la regresión que impide volver a la escala global;
- **hojas y subsecciones** (16) — que el contador se deduzca documento a
  documento, la equivalencia `presentacionFisica ⇔ requiereConteoHojas`, el
  asterisco, el cero frente al vacío, la validación, el `N/A` que conserva, la
  llegada a `PAGINAS` y al `DETALLE JSON`, y el documento compartido T1/T3;
- **identificador y alta** (13) — siete formatos reales de carnet, la
  obligatoriedad, el duplicado con sus datos, la búsqueda por el carnet escrito de
  otra forma, la idempotencia, el alta en una llamada, la reversión y los topes de
  la lectura por lotes;
- **caché y cola** (15) — coalescencia, idempotencia en el reintento, lo que no se
  reintenta, la supervivencia al recargado, el desalojo, el borrado, la precarga
  que no repite lo fresco y la reconciliación que no pisa lo que se escribe.

Sondas en navegador real (Chromium):

| Sonda | Resultado |
|---|---|
| `qa/sonda-congelamiento.mjs` | ✓ 7 escenarios, el candado se libera siempre |
| `qa/sonda-foco-expediente.mjs` | ✓ se escribe una frase larga completa sin perder el foco |
| `qa/sonda-salida-perfil.mjs` | ✓ la confirmación de salida se puede pulsar |
| `qa/visual-documentacion.mjs` | ✓ 10 capturas, 22 llamadas, **0 fallidas, 0 errores de consola** |
| `qa/documentacion-app.mjs` | ✓ congelamiento y alta completa, con las comprobaciones nuevas |
| `qa/sonda-contraste.mjs` | nueva: mide el contraste **efectivo** del texto real |

---

## Limitaciones y notas honestas

**El chunk del módulo creció 2,8 kB comprimidos** (+2,8 %). Es el coste de la
caché, la cola de salida, la pantalla de carga y el contador. Se compensó en parte
sustituyendo el `motion.li` por fila por una animación CSS —veinticinco resortes
de framer-motion por lista era además el problema de rendimiento real en equipos
modestos—, pero no hasta llegar a cero. Preferí decirlo a esconderlo.

**La lista de cargos la pega una persona.** El backend siembra `cargo_bdp` con lo
que ya hay en los expedientes para que no nazca vacía, pero los cientos de cargos
del banco no están en ningún sitio que pueda leer.

**Las colisiones de carnet no se resuelven solas.** Si dos expedientes comparten
clave tras endurecer la normalización, la migración los nombra y no los toca.
Fusionarlos es decidir que son la misma persona, y eso no lo puede decidir una
migración.

**`EJECUTIVO` y `DIRECTORIO` siguen en construcción.** Se muestran a propósito:
esconder una rama que existe hace que alguien registre el expediente como
`GENERAL` y quede mal clasificado para siempre.

**La forma de entrega de los cuatro requisitos de cumplimiento.** El área
especificó que son físicos y llevan contador. Se les puso además
`presentacionDigital: 'SI'`, por coherencia con el resto del expediente, donde
siempre se admite el escaneado. Si el área quiere que sean solo papel, es un
cambio de un campo en la semilla.

---

## Cuestionario

<details>
<summary><strong>1.</strong> ¿Por qué <code>requiere_conteo_hojas</code> no se declara a mano en la semilla del catálogo?</summary>

- **a)** Para ahorrar una columna en la hoja.
- **b)** Porque derivarlo de `presentacion_fisica` hace imposible por
  construcción un documento digital con contador o uno de papel sin él, y evita
  que la interfaz tenga su propia lista de códigos. ✅
- **c)** Porque Apps Script no admite booleanos en la semilla.
- **d)** Porque el área puede cambiarlo desde la interfaz.

La **b**. Es la misma razón por la que el catálogo es único: dos fuentes para el
mismo hecho acaban discrepando. La **a** es falsa (la columna existe igual, solo
que la escribe el código); la **c** es falsa; la **d** describe otra cosa.
</details>

<details>
<summary><strong>2.</strong> <code>garante-inmueble</code> aplica al Tipo 1 y al Tipo 3. ¿Por qué <code>doc2ResolverParaRama_</code> devuelve una copia en vez de escribir la subsección sobre la fila?</summary>

- **a)** Porque las filas del catálogo son inmutables en Apps Script.
- **b)** Para poder guardar las dos subsecciones a la vez.
- **c)** Porque `doc2Catalogo_` devuelve las filas por referencia desde una caché
  por petición: mutarlas envenenaría la siguiente consulta de la misma petición. ✅
- **d)** Por rendimiento: copiar es más rápido que escribir.

La **c**. `garante-inmueble` acabaría con la subsección del Tipo 1 al preguntar
por el Tipo 3, y el fallo solo aparecería en la *segunda* consulta de la misma
petición. La **d** es al revés; la **a** es falsa.
</details>

<details>
<summary><strong>3.</strong> Se endurece la normalización del carnet. ¿Por qué la detección de duplicados sigue funcionando sin ejecutar <code>5.0.2-identificadores</code>?</summary>

- **a)** Porque la migración se ejecuta sola al instalar.
- **b)** Porque `doc2BuscarPorIdentificador_` recalcula la clave desde el texto
  original, que es inmutable, en vez de comparar contra la columna guardada. ✅
- **c)** Porque la columna `identificador_normalizado` se recalcula al leer cada
  fila.
- **d)** Porque no funciona: hay que migrar antes de crear expedientes.

La **b**. La columna conserva la clave de la regla vigente el día en que se
escribió la fila; el texto original no cambia nunca. La migración pone al día lo
que sí lee la columna (filtros y orden). La **c** describiría una escritura en
cada lectura, que no ocurre.
</details>

<details>
<summary><strong>4.</strong> Al fusionar dos cambios en la cola de salida se genera un <code>solicitudId</code> nuevo. ¿Qué pasaría si se conservara el del primero?</summary>

- **a)** Nada: es lo que haría cualquier implementación razonable.
- **b)** Se duplicaría el cambio en el backend.
- **c)** Si el primero ya salió y volvió a la cola por un tiempo agotado, el
  backend lo trataría como repetido y devolvería la respuesta del primer envío,
  descartando el cambio fusionado en silencio. ✅
- **d)** El backend rechazaría la petición por clave repetida.

La **c**. Es contraintuitivo: la idempotencia protege de repetir una petición, y
un cambio fusionado ya **no es** la misma petición. La **b** es lo contrario de lo
que hace el `solicitudId`; la **d** describe un rechazo que no ocurre (se devuelve
la respuesta anterior, que es peor porque parece un éxito).
</details>

<details>
<summary><strong>5.</strong> Editar un expediente tolera cambios fallidos y devuelve los que fallaron; crear uno lanza y revierte. ¿Por qué la asimetría?</summary>

- **a)** Porque crear escribe más filas y el riesgo es mayor.
- **b)** Porque al editar la persona tiene el expediente delante y ve qué quedó
  fuera; al crear no lo tiene, y uno creado al que le falta la mitad de lo marcado
  es peor que uno que no se creó, porque nadie sabe qué falta. ✅
- **c)** Porque Apps Script no permite transacciones parciales al insertar.
- **d)** Porque el alta usa `LockService` y la edición no.

La **b**. Es una decisión de producto, no técnica: en los dos casos el backend
podría hacer lo mismo. La **c** es falsa —el rollback del enrutador funciona igual
en los dos casos— y la **d** también.
</details>

<details>
<summary><strong>6.</strong> <code>tieneDatos</code> no miraba las prórrogas. ¿Cuál era el síntoma?</summary>

- **a)** El expediente perdía su porcentaje de avance.
- **b)** Un requisito pendiente con un plazo concedido se archivaba al recalcular
  la aplicabilidad: la prórroga seguía en su hoja pero el requisito desaparecía de
  la vista, y con él el plazo que nadie volvía a perseguir. ✅
- **c)** Las prórrogas se borraban de `ExpedienteProrrogas`.
- **d)** El estado del expediente no pasaba nunca a `CON_PRORROGA`.

La **b**. Y es peor de lo que parece porque el dato **no se borra**: sigue en la
hoja, así que una auditoría lo encuentra, pero la persona que tenía que perseguir
el documento no lo ve. La **c** es falsa: en este módulo no se borra nada.
</details>
