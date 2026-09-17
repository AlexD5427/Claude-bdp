# Módulo de Documentación

Seguimiento de la documentación que debe entregar cada persona que ingresa al
banco: qué falta, a quién se le pidió, quién lo revisó, quién lo aprobó y qué se
puede archivar.

Este documento describe el módulo tal como queda después de la refactorización
integral. Si busca el procedimiento de instalación paso a paso, está en
[DOCUMENTACION_DESPLIEGUE.md](./DOCUMENTACION_DESPLIEGUE.md).

---

## 1. Las dos capas de datos

La primera versión del módulo tomó una decisión razonable: **la hoja de cálculo
es la base de datos**. El área llevaba años trabajando sobre el libro
`REGISTRO INGRESOS`, con sus colores memorizados, y un sistema que guardara los
datos en otro sitio habría convertido cualquier corrección manual en un cambio
que se pierde en la siguiente sincronización.

Esa decisión sigue en pie, pero ahora tiene una capa debajo. El libro anual
`CONTROL INGRESOS <año>` es una **vista de presentación**, no el almacén; el
almacén son 19 hojas normalizadas con una fila por hecho.

```
                 ┌──────────────────────────────┐
   Web  ───────► │  19 hojas normalizadas       │  ← la verdad
                 │  Expedientes, Documentos,    │
   Libro ◄────── │  Solicitudes, Revisiones...  │
   (espejo)      └──────────────────────────────┘
```

El motivo del cambio es concreto. Todo el estado de un expediente vivía en una
celda `DETALLE JSON` de hasta 50.000 caracteres. Para saber cuántas personas
tenían el REJAP pendiente había que leer y deserializar las 941 filas del libro.
Para saber quién había pedido un documento, no había dónde mirarlo: la petición
no se guardaba en ninguna parte. Y dos personas editando expedientes distintos
del mismo año competían por la misma fila de escritura.

> **Por qué normalizar sin abandonar el libro**
> Una tabla por concepto permite consultar, filtrar y contar sin deserializar
> nada, y permite escribir en `SolicitudesDocumentales` sin tocar
> `Expedientes`. Pero el área no puede perder su libro: sigue siendo la
> herramienta con la que se trabaja los días de mucho ingreso. Por eso el libro
> se mantiene, con las mismas 39 columnas y los mismos colores, escrito desde el
> modelo normalizado cada vez que un expediente cambia.

Las tres reglas heredadas siguen vigentes:

1. **Lo escrito a mano gana.** Si una celda de documento tiene un valor puesto
   por una persona, el sistema no lo recalcula.
2. **El formato es información, no decoración.** Los colores codifican estado;
   se reproducen exactamente y se vuelven a aplicar tras cada escritura.
3. **Ninguna operación asume que el libro está bien.** Cada escritura verifica la
   estructura y la repara si hace falta.

Y se añade una cuarta:

4. **Nada se borra.** Retención, anonimización y archivo mueven estados y
   marcan filas; ninguna acción del módulo elimina datos de una hoja.

---

## 2. Modelo de datos

### 2.1 Las 19 hojas

| Hoja | Una fila por | Notas |
|---|---|---|
| `Expedientes` | expediente | resúmenes materializados: avance, presentados, pendientes, observados |
| `ExpedienteDocumentos` | requisito de un expediente | estado, páginas, observación, fechas |
| `ExpedienteProrrogas` | prórroga concedida | la nueva sustituye a la vigente |
| `CatalogoDocumentos` | documento exigible | 38 filas semilla; editable sin tocar código |
| `SolicitudesDocumentales` | petición enviada | canal, destinatario, plazo, estado |
| `SolicitudDocumentos` | documento dentro de una petición | permite cierre parcial |
| `RevisionesDocumentales` | revisión de un documento | append-only, con motivo tipificado |
| `AprobacionesDocumentales` | nivel de aprobación | multinivel, en orden |
| `ComentariosDocumentacion` | comentario | visibilidad INTERNA / FORMAL / OPERATIVA |
| `TareasDocumentales` | tarea | responsable, vencimiento, origen |
| `NotificacionesDocumentales` | aviso generado | bandeja interna; el correo es opcional |
| `HistorialDocumentacion` | cambio de campo | qué, quién, cuándo, antes y después |
| `AuditoriaDocumentacion` | acceso o acción sensible | lectura de datos personales incluida |
| `ConsentimientosDocumentacion` | consentimiento firmado | versionado, con hash del texto |
| `PoliticasRetencion` | política aplicada | marca, nunca borra |
| `ExportacionesDocumentacion` | exportación | con punto de control para reanudar |
| `FiltrosDocumentacion` | filtro guardado | por persona o compartido |
| `ConfiguracionDocumentacion` | clave de configuración | lista blanca de claves |
| `MigracionesDocumentacion` | migración ejecutada | versión, lote, resultado |

Más `Auxiliar`, la hoja de catálogos sueltos (agencias y gerencias) que crece
sola: cuando aparece un valor nuevo se añade, y **nunca se quita uno existente**
aunque ningún expediente lo use.

### 2.2 El libro anual, ahora espejo

`CONTROL INGRESOS <año>` conserva las columnas A–W del Excel original —incluidos
el espacio final de `Tipo de Empleado ` y las dos columnas `CONTRATO DE FIANZA`,
porque cambiarlos rompería las fórmulas de las copias que la gente tiene en su
Drive— y las columnas X–AM de gestión.

La diferencia es de dirección: antes la web escribía en el libro, ahora el
servicio de expedientes escribe el modelo normalizado y **de ahí** deriva la
fila. Si el libro se estropea, se regenera; si el modelo se estropea, hay un
problema, y para eso está el diagnóstico.

### 2.3 Ramas de aplicabilidad

Qué documentos exige un expediente sale de dos ejes:

| Tipo de funcionario | Garantía | Documentos |
|---|---|---|
| GENERAL | NINGUNA | 20 |
| ADMINISTRATIVO | NINGUNA | 20 |
| COMERCIAL | COMERCIAL_1 | 25 |
| COMERCIAL | COMERCIAL_2 | 29 |
| COMERCIAL | COMERCIAL_3 | 25 |
| AUDITORIA | NINGUNA | 21 |
| CUMPLIMIENTO | NINGUNA | 23 |

> Los recuentos subieron cuatro en todas las ramas con el **catálogo v4**: el
> legajo administrativo añade el manual de funciones, el memorándum de
> designación, la comunicación interna y el hueco de «Otros». Antes habían bajado
> dos al retirar el certificado de trabajo y el RC-IVA, que el área dejó de pedir.
> **Los retirados no se borraron del catálogo**: llevan `retirado: true`, así que
> no se siembran en expedientes nuevos pero los existentes los conservan con su
> estado y su historia. El catálogo canónico tiene 43 entradas: 41 vigentes y esas 2.

> **`ADMINISTRATIVO` es la rama que no pide nada.** Exige exactamente los mismos
> veinte generales que `GENERAL`, y existe como rama propia porque el reporte por
> categoría tiene que poder distinguir al personal administrativo de quien se
> registró sin clasificar. El asistente lo sabe por el catálogo —el mapa de
> aplicabilidad devuelve `propios: 0`— y **salta el paso de requisitos
> específicos**: el indicador pasa a «Paso 3 de 4» y «Continuar» lleva a la
> revisión. No hay ninguna comparación con el nombre de la rama en la interfaz.

Los 17 documentos de garantía cuelgan del tipo `COMERCIAL`: poner una garantía a
un funcionario `GENERAL` no los añade, porque en el proceso real la fianza
acompaña al cargo comercial, no al nivel de garantía por sí solo. Y las tres ramas
comerciales son **mutuamente excluyentes**: un expediente de tipo 1 no ve ni un
documento del tipo 2.

`AUDITORIA` exige solo la declaración de impedimento; `CUMPLIMIENTO`, la
acreditación LGI/FT y el examen de la UIF. Antes compartían `lgi-ft` y mezclaban
requisitos de dos áreas distintas.

`EJECUTIVO` y `DIRECTORIO` están declarados pero inactivos: la web los muestra
como «en construcción» en lugar de ofrecer una rama a medio definir.

Al cambiar la rama de un expediente los requisitos se sincronizan, y aquí hay
una decisión deliberada: **un requisito que ya tiene datos no se elimina**. Si
alguien marcó como entregado el contrato de fianza y luego corrige la garantía a
`NINGUNA`, el requisito se conserva marcado como no aplicable en lugar de
desaparecer con su historia.

### 2.4 Subsecciones: de quién es cada documento

Un expediente Comercial Tipo 2 tiene **dos garantes**, y varios documentos se
piden por duplicado: título de propiedad, folio real, boleta de servicio. Sin más
información, eso son filas indistinguibles.

Cada documento del catálogo declara su **subsección**, y puede hacerlo de dos
formas: con un texto único, o con un mapa por tipo de garantía cuando el mismo
documento pertenece a bloques distintos según la rama.

| Documento | Tipo 2 | Tipo 3 |
|---|---|---|
| `garante-inmueble` | 1 Garante con Bien Inmueble | Postulante con inmueble propio |
| `garante-folio` | 1 Garante con Bien Inmueble | Postulante con inmueble propio |

La resolución vive en una sola función del backend
(`doc2ResolverSubseccion_`), que usan el asistente, la vista del expediente, los
reportes y las exportaciones. Si cada uno lo resolviera a su manera, el mismo
documento acabaría bajo dos títulos distintos.

La subsección se **materializa al crear el expediente**, no se calcula al leer. Es
deliberado: un expediente cerrado hace ocho meses no debería cambiar de forma
porque alguien renombre un bloque hoy.

### 2.5 Presentación y hojas físicas

Cada documento declara cómo se entrega:

| Campo | Valores | Para qué |
|---|---|---|
| `presentacionFisica` | `SI` · `NO` · `CONDICIONAL` | ¿Se archiva en papel? |
| `presentacionDigital` | `SI` · `NO` · `CONDICIONAL` | ¿Se manda por correo o WhatsApp? |
| `requiereConteoHojas` | `true` · `false` | ¿Lleva contador de hojas? |

`CONDICIONAL` existe porque hay documentos que dependen del caso —una constancia
que en algunas agencias llega escaneada y en otras en original—, y forzarlos a
`SI`/`NO` obligaba a elegir una mentira.

**Nueve documentos** llevan contador de hojas: antecedentes FELCC, REJAP, título
legalizado, seguro de accidentes, seguro de vida, impedimento de auditor,
declaración jurada de prohibiciones, LGI-FT y examen de la UIF. Es el dato que
permite cuadrar el archivador de papel con el sistema.

> **Tres estados, no dos.** *No lleva conteo* (es digital), *lleva conteo y está en
> cero* (falta contarlo) y *lleva conteo con un número* son cosas distintas, y la
> diferencia entre las dos primeras es la que decide si alguien tiene que ir al
> archivador. Por eso en los reportes y en el Excel la celda queda **vacía** —no en
> cero— cuando el documento no lleva conteo, y en el informe impreso un entregado
> con conteo en cero sale marcado «sin contar».

El tope es de 999 hojas, validado en el backend (`doc2ValidarHojasFisicas_`). No es
arbitrario: un dedo pegado en el teclado que escriba 99 999 hojas contamina los
totales del libro anual con cifras que nadie puede explicar.

### 2.6 La hoja `Auxiliar`

Tres columnas alimentan los desplegables del alta: `agencia_bdp`, `gerencia_bdp` y
`cargo_bdp`. La lectura tiene tres reglas que salieron de tres fallos reales:

1. **La cabecera se localiza normalizada.** «Agencia BDP», «agencia_bdp» y
   «AGENCIA  BDP» son la misma columna.
2. **Se lee hasta la última fila del libro, sin detenerse en huecos.** Una fila
   vacía en medio de la lista no es el final de la lista.
3. **Se escribe debajo de la última fila realmente ocupada de esa columna.** Antes
   se usaba el alto de la hoja, así que añadir una agencia podía **pisar** un valor
   existente.

El backend crea la cabecera `cargo_bdp` al instalar el modelo, pero **no puede
inventar los cargos**: los pega el área. Ver `DOCUMENTACION_DESPLIEGUE.md`.

Un cargo que no esté en la lista genera un hallazgo de gobernanza
(`cargo-fuera-catalogo`) que es **siempre una advertencia, nunca un bloqueo**: es
un dato que hay que revisar, no un motivo para impedir que se registre a alguien
que ya empezó a trabajar.

---

## 3. Backend (Apps Script)

`apps-script/documentacion/` — 22 archivos. Los diez primeros son los heredados,
intactos salvo una corrección de un fallo real de escritura; del `11` al `21` es
el modelo nuevo.

| Archivo | Responsabilidad |
|---|---|
| `00_Manifest.gs` … `10_Tests.gs` | libro anual heredado: columnas, colores, router, menú, pruebas |
| `11_Domain.gs` | vocabulario: estados, transiciones, catálogo semilla, roles, límites, errores |
| `12_Data.gs` | infraestructura: hojas, repositorio genérico, versión de registro, caché, historial |
| `13_Catalog.gs` | catálogo único, espejo al `_CATALOGO` heredado, motor de aplicabilidad |
| `14_Auth.gs` | identidad, roles, capacidades, modo arranque |
| `15_Expedientes.gs` | alta, edición, máquina de estados, requisitos, resúmenes, espejo al libro |
| `16_Workflow.gs` | prórrogas, solicitudes, revisiones, aprobaciones, comentarios, tareas |
| `17_Automation.gs` | bus de eventos, automatizaciones, notificaciones, proceso diario |
| `18_Reports.gs` | panel, 14 reportes, exportaciones por lotes, filtros guardados |
| `19_Governance.gs` | consentimientos, retención, anonimización, diagnóstico, reparación |
| `20_Migrations.gs` | motor de migraciones con simulación, lotes y reanudación |
| `21_Api.gs` | registro de las 76 acciones `documentacion.*` |

El orden del prefijo numérico importa: Apps Script concatena los archivos en un
único espacio global y las constantes de nivel superior deben existir antes de
usarse. Por el mismo motivo **una función repetida en dos archivos se pisa en
silencio**, y por eso `npm run doc:check` busca duplicados.

### 3.1 Contrato de la API

Todas las acciones nuevas se llaman `documentacion.<recurso>.<verbo>`:

```
expediente.crear | actualizar | obtener | estado | sincronizar | recalcular
expediente.archivar | restaurar | conservacion | laboral | expedientes.listar
requisito.actualizar | requisitos.guardar
prorroga.crear | actualizar | estado | prorrogas.listar
solicitud.crear | estado | seguimiento
solicitudes.listar | impacto | masiva
revision.decidir | cola | aprobacion.solicitar | resolver | aprobaciones.listar
comentario.crear | editar | resolver | comentarios.listar
tarea.crear | actualizar | estado | tareas.listar
panel | reporte | reportes.disponibles
exportacion.iniciar | lote | cancelar | exportaciones.listar
filtro.guardar | eliminar | filtros.listar
consentimiento.presentar | responder | consentimientos.listar
retencion.politicas | aplicar | planAnonimizacion | anonimizar
notificaciones.listar | leerTodas | notificacion.leer
historial.consultar | auditoria.consultar
catalogo | catalogo.guardar | auxiliares | auxiliares.agregar
permisos.obtener | guardar | configuracion.obtener | guardar | vocabulario
instalar | migraciones.estado | migrar | diagnostico | reparar
inconsistencias | proceso.diario | respaldo
```

Las 23 acciones heredadas (`estado`, `expediente.guardar`, `mantenimiento.*`…)
siguen atendidas por el mismo router. Ninguna cambió de forma: hay una prueba de
regresión que las recorre una por una.

El sobre de respuesta añade campos sin quitar ninguno, para que un cliente
antiguo siga funcionando:

```json
{
  "ok": true,
  "accion": "documentacion.expediente.crear",
  "solicitudId": "req_...",
  "datos": {},            "data": {},
  "avisos": [],
  "meta": { "requestId": "req_...", "timestamp": "...", "version": "4.0.0" }
}
```

Cuando `ok` es falso, `error` trae `codigo` (y su alias `code`), `mensaje`,
`pista` y `campos`. La `pista` es lo que el frontend convierte en botón de
solución; los `campos` son lo que pinta el error junto al campo del formulario.

### 3.2 Concurrencia

Tres mecanismos, cada uno para un problema distinto:

- **Bloqueo de escritura** (`LockService`) para que dos guardados simultáneos no
  se pisen al escribir.
- **`version_registro`** por fila: quien guarda declara la versión que leyó, y
  si no coincide se rechaza con `CONFLICTO` en lugar de sobrescribir el trabajo
  de otra persona.
- **`solicitudId`** en cada escritura: si la misma petición llega dos veces
  —reintento, doble clic, cola sin conexión— se devuelve el resultado guardado
  en lugar de ejecutarla otra vez.

### 3.3 Autorización

Seis roles (`admin`, `supervisor`, `auxiliar`, `analista`, `pasante`,
`invitado`) sobre 16 capacidades. El rol se resuelve, en este orden: llave de
administrador, modo arranque, mapa de roles por cuenta, rol declarado, rol por
defecto. Un cliente **no puede subirse el rol**: el rol declarado sólo se
acepta si el mapa lo confirma.

El modo arranque existe porque en una instalación nueva no hay nadie con
permisos todavía; se cierra solo en cuanto hay un mapa de roles o un expediente.

Migrar, reparar y configurar pueden exigir además la llave de administrador
guardada en las propiedades del script: se activa con la clave
`exigir_llave_admin`, que viene apagada para que una instalación nueva no quede
bloqueada y conviene encender en cuanto el libro tenga datos reales.

---

## 4. Frontend

```
src/features/documentacion/
  domain/     vocabulario.ts   estados, etiquetas, transiciones, ramas, capacidades
              progreso.ts      agrupación, totales, plazos en lenguaje llano
  api/        client.ts        transporte: requestId, unión de peticiones, reintentos
              acciones.ts      docApi: una función tipada por acción
  state/      consola.ts       estado de la consola, persistencia de preferencias
  export/     xlsx.ts          generador .xlsx real, sin dependencias de servidor
  ui/         DocumentacionConsola.tsx   composición del módulo y capacidades
              DocShell.tsx               armazón: cabecera, navegación agrupada
              DocSyncIndicator.tsx       conexión, frescura del dato y guardado
              DocAttentionPanel.tsx      bandeja de atención, salud, actividad
              DocExpedienteHeader.tsx    identidad, situación y trazabilidad
              DocStates.tsx              vacíos, errores, offline, modo degradado
              DocSkeletons.tsx           esqueletos con la forma del contenido
              DocMotion.ts               duraciones, curvas y preferencia de movimiento
              DocViewTransitions.ts      View Transitions con detección y fallback
              documentacion.css          tokens del módulo (`--doc-*`)
              documentacion-motion.css   animaciones con propósito
              SeccionPanel.tsx           qué mirar hoy
              SeccionExpedientes.tsx     listado, filtros, alta, solicitud masiva
              ExpedienteLateral.tsx      expediente completo en nueve pestañas
              SeccionTrabajo.tsx         solicitudes, revisión, aprobaciones, tareas
              SeccionReportes.tsx        reportes, exportaciones, avisos, auditoría
              SeccionConfiguracion.tsx   catálogo, plazos, permisos, mantenimiento
              piezas.tsx                 tabla responsive, lateral, confirmaciones
              VistaLocal.tsx             el módulo anterior, como red de seguridad
```

`src/modules/Documentacion.tsx` queda como un reexport de una línea, así que las
rutas y los menús de la aplicación no cambian.

### 4.1 El cliente

Un solo punto de entrada para todas las llamadas, con cuatro cosas que antes
estaban repartidas o no existían:

- **Unión de peticiones idénticas.** Dos componentes que piden el mismo listado
  a la vez comparten una única llamada.
- **Reintento sólo de lo recuperable.** `LIBRO_OCUPADO` o un fallo de red se
  reintentan con espera creciente; `VALIDACION` no, porque reintentar un dato
  mal escrito sólo hace perder tiempo.
- **Respuestas obsoletas descartadas.** Si el usuario cambia de filtro mientras
  la petición anterior viaja, la respuesta que llega tarde se ignora.
- **Errores normalizados.** `DocError` con `codigo`, `mensaje`, `pista`,
  `campos` y `red`, de modo que la interfaz decide qué mostrar sin adivinar.

Sigue enviando `text/plain` con `redirect: "follow"`: con `application/json` el
navegador manda una petición `OPTIONS` previa que Apps Script no responde, y
Apps Script contesta con una redirección 302 que hay que seguir a mano.

### 4.2 La consola

Trece entradas de menú sobre seis pantallas, y el menú **sólo muestra lo que el
rol puede hacer**: un `invitado` no ve la sección de configuración en gris, no la
ve.

La navegación está **agrupada por lo que se está haciendo** —Operación,
Expedientes, Trabajo, Reportes y control, Configuración, Contingencia— en lugar de
ser una lista plana de trece entradas al mismo nivel. El grupo es una etiqueta, no
un desplegable: en una consola de trabajo, esconder la navegación detrás de un
clic cuesta más de lo que ahorra. «Vista local» vive bajo *Contingencia* porque no
es una pantalla más del proceso: es la salida cuando no hay backend.

La cabecera del módulo responde el contexto global de un vistazo: módulo y
sección (con miga de pan), rol resuelto por el backend, estado del enlace, libro
contra el que se opera, antigüedad de los datos, avisos sin leer y la acción
principal («Nuevo expediente»).

### 4.3 El panel: qué necesita atención ahora

El panel se lee de arriba abajo en el orden en que se trabaja:

1. **Indicadores de urgencia.** Ocho cifras agregadas del backend, cada una con
   severidad visible (borde e icono, no sólo color), su periodo y la acción que
   abre la lista ya filtrada.
2. **Bandeja de atención.** Los expedientes que hay que mirar hoy, ordenados por
   urgencia real: plazo agotado manda sobre observación, y observación sobre
   requisito que aún no ha llegado. Cada fila trae persona, identificador, tipo de
   incidencia, avance, responsable, plazo, antigüedad y un botón que abre el
   expediente. Sale de la **misma acción de listado** que usa la sección de
   expedientes, pedida con orden por fecha crítica y página corta.
3. **Actividad reciente**, tal como la registra el backend en sus avisos.
4. **Salud del módulo**: enlace, libro, esquema, migraciones pendientes, hojas
   faltantes y frescura del cálculo.
5. **El conjunto en detalle**: agencias, gerencias, embudo, distribución por
   estado, requisitos que más se atascan y evolución mensual.

Ninguna cifra se calcula en el cliente, y cuando el backend sirve el panel desde
su caché se dice —con la fecha del cálculo, no un «desde caché» sin contexto.

### 4.4 La lista de expedientes

- **Los filtros se ven.** Cada filtro aplicado es un chip con su valor y su aspa.
  Antes había un botón «Filtros (3)» y para saber cuáles había que abrirlo.
- **Dos lecturas de la misma lista.** El modo *operativo* prioriza lo que hay que
  hacer (estado, avance, faltantes, plazo, responsable); el modo *auditoría*, lo
  que hay que poder demostrar (identificador, versión, autoría, apertura, cierre,
  estado de operación, año del libro). Son las mismas filas con otras columnas:
  nadie tiene que exportar a Excel para ver la versión de un registro.
- **Tres densidades y dos disposiciones.** Tabla para comparar, tarjetas para
  leer; compacta, cómoda o amplia. La preferencia se guarda en el equipo.
- **El recuento es del servidor.** «16 expedientes en la consulta · 16 en esta
  página · avance promedio 81 %» sale del total y del resumen que devuelve la
  consulta, no de las filas de la página.
- En pantalla estrecha, los filtros avanzados se abren en un cajón y la tabla se
  convierte en tarjetas estructuradas.

### 4.5 El expediente

Vive en `ui/ExpedienteVentana.tsx` (antes `ExpedienteLateral.tsx`; el cambio de
nombre viene de que dejó de ser un cajón lateral). La superficie es `HojaCentral`:
una ventana **central** con aire a los dos lados, en lugar de un panel pegado al
borde. El motivo es que el expediente es el trabajo, no un detalle del trabajo, y
un cajón de 480 px obligaba a leer veinticinco documentos en una columna estrecha.

`HojaCentral` cumple los invariantes de las superposiciones del sistema: candado
de scroll con recuento, foco atrapado y devuelto, cierre con Escape, `aria-modal`,
apilamiento por debajo de `Z.dialog` —para que una confirmación pueda montarse
encima— y confirmación propia, nunca `window.confirm`.

Dos detalles que salieron de fallos medidos en un navegador real:

- **El foco inicial va al campo marcado con `data-foco-inicial`**, y se comprueba
  el marcador **antes** que el resto: `querySelector` con una lista separada por
  comas devuelve el primer elemento en *orden de documento*, así que el botón de
  cerrar de la cabecera le robaba el foco al formulario y quien escribía de
  inmediato perdía los primeros caracteres.
- **La devolución del foco al cerrar comprueba a dónde va.** Si lo capturado es
  `document.body` —porque la hoja se montó ya abierta y nadie tenía el foco— o un
  nodo que ya no está en el documento, no se toca nada: enfocar el `body` **borra**
  el foco activo, y la rama pensada para no perder el sitio era la que lo perdía.

La ventana se pinta en **dos tiempos**: primero el armazón (cabecera, identidad,
pestañas, avance) y en el fotograma siguiente el cuerpo, con el esqueleto
ocupando su sitio mientras. Junto con la memoización del árbol de secciones y el
paso de la animación de las filas a CSS, eso bajó la apertura de 1 336 ms a 691 ms
con CPU estrangulada 4x.

La cabecera del expediente tiene tres franjas con jerarquía deliberada:
**situación** (estado, rama, avance y desglose), **qué desbloquea el expediente**
(el siguiente requisito que el backend señala, con el motivo y un salto directo) y
**trazabilidad** (última modificación, autor, versión y estado del guardado). Las
nueve pestañas llevan su total y, cuando hay algo que atender, una marca con su
explicación; se recorren con las flechas y quedan pegadas al borde superior al
bajar por los requisitos.

La cabecera lleva además el **distintivo de la categoría** (icono SVG y color
propios), una franja del mismo color, y los datos que el área consulta a diario:
**Cargo, Agencia, Gerencia, Ingreso** con su antigüedad, **Próximo plazo** y
**Responsable**.

La pestaña de requisitos (`ui/RequisitosExpediente.tsx`) tiene buscador —ignora
acentos—, filtro de obligatorios y cinco filtros por situación con su recuento:
todos, por conseguir, observados, en prórroga, entregados. Los recuentos se
calculan sobre el estado **efectivo**, con los cambios sin guardar aplicados; si no,
marcar un documento no movería el contador y parecería que el clic no hizo nada.
Cada fila lleva chips de un toque en el orden del área —entregado, pendiente, no
entregado, no aplica— con verde, ámbar, rojo y gris, una cinta lateral del color
del estado para leer la lista de un barrido, y la prórroga con su cuenta regresiva.

Los requisitos llegan **agrupados por subsección** cuando la rama las tiene, con
el título del bloque encima: en un Tipo 2 se ve «1 Garante con Bien Inmueble» y
«2 Garante Familiar», y ya no hay dos «Título de propiedad» sin dueño.

Los trece documentos que se archivan en papel llevan su **contador de hojas**
(`ui/ContadorHojas.tsx`), y hay un filtro «Hojas sin contar» para encontrarlos.

> **Dos cambios de presentación del catálogo v4.** El **seguro de accidentes**
> dejó de llevar contador: pasó a solo digital porque el formulario se remite a
> la aseguradora por correo y al legajo físico no llega nada que archivar. El
> **folio real del bien inmueble** lo ganó: es un documento de Derechos Reales que
> sí se archiva. Este segundo caso es el mejor argumento de que el catálogo sea
> una sola fuente: es la MISMA fila en Comercial Tipo 1 y Tipo 3, así que el
> cambio alcanzó a las dos ramas, a la vista, a los reportes y al informe mensual
> con una línea.

> **El contador es un `input type="text"`, no `type="number"`.** Un
> `type="number"` cambia de valor al hacer scroll con el puntero encima, y en una
> lista de veinticinco documentos eso es una forma silenciosa de corromper datos.
> Usa `inputMode="numeric"` para que el teclado del móvil salga numérico; la
> validación de que es un entero entre 0 y 999 vive en el backend, que es donde
> tiene que estar.

### Requisitos personalizables: «Otros»

`otros-documento` es el primer requisito cuyo contenido lo define el EXPEDIENTE y
no el catálogo. Tres cosas lo distinguen:

1. **Nombre libre.** Se escribe en la fila y se guarda en
   `ExpedienteDocumentos.nombre_personalizado`, no en el catálogo: dos
   expedientes pueden usar «Otros» para documentos distintos sin pisarse. En los
   reportes, la columna `Requisito` trae el nombre escrito y la columna `Código`
   trae `otros-documento`, que es por donde se agrupa.
2. **Presentación elegible** con un segmentado de tres opciones —FÍSICO, DIGITAL,
   AMBOS— y `AMBOS` por defecto. De ahí se **deriva** si lleva contador de hojas,
   así que el estado imposible «solo digital con doce hojas de papel» no es
   representable. Es un segmentado y no dos casillas porque dos casillas
   permiten desmarcar las dos.
3. **Nace `NO_APLICA`** (`CatalogoDocumentos.estado_inicial`), fuera del cálculo
   de avance. Si naciera pendiente, todos los expedientes del banco arrastrarían
   un requisito que nadie va a entregar. Escribir el nombre lo promueve a
   `PENDIENTE` solo, y borrarlo lo devuelve a `NO_APLICA` **únicamente** si no hay
   nada que perder: con hojas contadas, observación o estado marcado, el requisito
   se queda.

La pregunta «¿lleva conteo de hojas?» vive en una sola función del backend
(`doc2PresentacionEfectiva_`), que es la que consultan la validación, la vista
del expediente, los reportes y el informe mensual.

### El módulo diagnostica su propio despliegue

El backend declara en `documentacion.estado` su versión de esquema, su versión de
catálogo y **la lista de acciones que sabe atender**.
`domain/compatibilidad.ts` las compara con lo que este frontend necesita y
produce hallazgos con nombre y con instrucción:

| Hallazgo | Qué significa |
|---|---|
| `backend-ajeno` | La URL configurada es de otro proyecto de Apps Script (casi siempre el del talento) |
| `esquema-anterior` | Los `.gs` no se pegaron, o se pegaron y no se publicó una **versión nueva** de la implementación |
| `acciones-faltantes` | El backend no conoce una acción concreta; hay recaída para todas, así que solo va más lento |
| `catalogo-anterior` | Falta ejecutar Instalar o actualizar modelo y Migrar |
| `migraciones-pendientes` | Los datos son correctos pero las columnas nuevas están vacías |
| `hojas-faltantes` | Al libro le faltan hojas del modelo |

Los dos primeros son el mismo síntoma con arreglos opuestos, y por eso se
distinguen. El diagnóstico aparece en la cinta superior del módulo y, con todo el
detalle, en **Configuración › Esta pantalla**, junto a la **salud del backend**:
media, última, peor y fallos de las últimas veinte llamadas, con una frase que
dice qué hacer con ese número.

El guardado por bloque se mantiene, y ahora se **nombra**: sin cambios, cambios
por escribir, guardando, guardado en el servidor, conflicto de versión. El panel
no se cierra por accidente mientras escribe, y si hay cambios sin guardar pide
confirmación **en la propia interfaz** —no con `window.confirm`, que bloquea el
hilo y se puede silenciar desde el navegador—.

### 4.5 bis Caché, precarga y cola de salida

Tres almacenes en `state/` que son la razón de que el módulo se sienta rápido y
no pierda trabajo.

**`cacheExpedientes.ts`** — LRU de 40 entradas en memoria, persistida en IndexedDB
con recaída a `localStorage`. Dos plazos con propósitos distintos: **60 segundos**
para considerar la copia fresca y no revalidar, **24 horas** para seguir sirviendo
sin backend. `VERSION_CACHE` descarta lo guardado cuando cambia la forma del dato,
y `vaciarCache()` se ejecuta al cambiar de perfil: son datos personales.

La revalidación silenciosa compara un sello que incluye **la suma de las versiones
de los requisitos**, no solo `version_registro` de la cabecera. El motivo es
concreto: marcar un documento como entregado bumpea la versión del requisito, no
la de la cabecera, así que la comparación original no saltaba nunca en el caso que
ocurre todos los días.

**`precarga.ts`** — trae los expedientes de la lista visible antes de que nadie
los pida, con cuatro reglas: nunca compite con lo que la persona pide ahora
(se pausa **en el clic**, no cuando empieza la lectura), concurrencia limitada a
dos, en lotes de ocho en **una** llamada, y cancelable al navegar.

**`salida.ts`** — cola de escritura persistente con **identificador de solicitud**
estable que sobrevive a los reintentos, así que reenviar es seguro. Encolar **no**
envía: quien encola decide cuándo, porque quiere esperar la confirmación para poder
decir la verdad en pantalla en lugar de un «se está guardando» permanente.

### 4.5 ter «Esta pantalla»: autodiagnóstico y preferencias

`ui/PestanaEstaPantalla.tsx`, dentro de Configuración. Responde a una pregunta
concreta: qué hace alguien en una agencia cuando algo no funciona, sin consola de
JavaScript y sin acceso a Apps Script.

Cinco botones grandes —probar conexión, volver a sincronizar, vaciar caché local,
descargar respaldo, recuperar borrador— más la cola de salida con nombre,
antigüedad, intentos y el **error exacto** del backend, con dos salidas por
entrada: reintentar o descartar sabiendo qué se pierde.

Debajo, las preferencias locales: tema, densidad, tamaño de letra, modo ligero,
animaciones, precarga, orden por defecto y columnas visibles. **Sin condición de
permiso**, a propósito: pedir un rol para agrandar la letra es la clase de detalle
que hace que la gente trabaje incómoda durante años sin decir nada.

> **Dónde vive cada ajuste.** La densidad, la vista y el modo de la lista ya vivían
> en `state/consola.ts`; el panel las lee de allí y no de `state/preferencias.ts`.
> Dos claves persistidas para el mismo ajuste dan el resultado clásico de que la
> pantalla y el panel muestran valores distintos.

### 4.6 Sistema visual del módulo

`documentacion.css` declara el vocabulario visual como variables CSS acotadas a
`.doc-console`: superficies (fondo, superficie, elevada, hundida), tinta, estados
semánticos, foco, radios, sombras y duraciones. Cada tema —oscuro, claro, alto
contraste, transparencia reducida e **impresión**— elige sus valores; los
componentes piden el token, nunca el color.

La semántica institucional se conserva y se afina: verde completo, celeste nuevo o
inicial, durazno observación o gestión, **ámbar prórroga** (antes compartía color
con la observación, y son dos cosas distintas: «hay algo mal» y «hay más plazo»),
rojo crítico o desvinculado. La intención que manda el backend no cambia; lo que
cambia es el tono con el que se pinta.

En papel las superficies se aplanan, el armazón desaparece, los encabezados de
tabla dejan de ser flotantes, las filas no se cortan entre páginas y los nombres
recortados se muestran completos.

### 4.7 Movimiento y accesibilidad

El movimiento tiene una escala con nombre —120 ms para hover y foco, 240 ms para
chips, filas y menús, 420 ms para paneles y cambios de sección— y las salidas usan
la duración corta: al cerrar algo, la decisión ya está tomada. Toda animación
explica algo (de dónde vino un panel, qué cifra acaba de cambiar, qué se está
escribiendo); nada se mueve en bucle ni mientras se lee un dato crítico.

La preferencia de movimiento se lee de **dos** sitios: `prefers-reduced-motion` del
sistema y el interruptor «Reducir movimiento» de la aplicación (la clase
`reduce-motion` del `<html>`), que antes este módulo ignoraba.

Las transiciones de vista (lista → expediente, cambio de sección) usan la View
Transitions API cuando existe, con detección de soporte y respeto por la
reducción de movimiento; donde no hay soporte, el cambio es el instantáneo de
siempre.

Accesibilidad: navegación por teclado con foco visible propio del módulo, tablas
con `caption` y `scope` y una acción explícita por fila —el clic en la fila es del
ratón—, panel lateral con trampa de foco real (Tab cicla dentro) y devolución del
foco, `role="alert"` para los errores y `role="status"` para el resto, cambio de
sección anunciado en una región `aria-live`, estados con etiqueta e icono además
de color, y controles táctiles de 44 × 44 px en punteros gruesos.

### 4.8 Carga del módulo

La consola documental se carga **aparte** del paquete inicial, como ya hacían
Procesos y Evaluaciones: arrastra el cliente del backend, el vocabulario del
modelo, el exportador a Excel y trece pantallas, y quien sólo entra al tablero no
tiene por qué descargarla. El paquete inicial baja de 248 kB a 175 kB
comprimidos; el módulo son 78 kB de JavaScript y 3 kB de CSS que se piden al
abrirlo.

---

## 5. Verificación

```bash
npm run doc:check    # 30 comprobaciones de coherencia
npm run typecheck    # tipos
npx vitest run       # 743 pruebas
npm run build        # compilación
```

`doc:check` comprueba lo que un compilador no puede ver en Apps Script:
funciones duplicadas en el espacio global, acciones que el frontend llama y el
backend no atiende **y al revés**, escrituras declaradas distinto en las dos
partes, acciones heredadas que hayan desaparecido, el catálogo con sus 43
entradas y sus códigos originales, y el vocabulario compartido.

Las comprobaciones añadidas en la reforma integral vigilan cosas que se rompen en
silencio: que los 20 documentos generales estén en el orden de la lista del área,
que los retirados sigan presentes y marcados, los recuentos exactos por rama, que
la subsección cambie de valor entre Tipo 2 y Tipo 3, que el contador de hojas solo
aparezca donde la presentación es física, que la hoja `Auxiliar` declare sus tres
columnas y el selector del frontend las conozca, que las hojas físicas y la
subsección lleguen a los reportes y al informe mensual, y que el modo ligero apague
de verdad los desenfoques y las sombras proyectadas del armazón.

Las pruebas del backend no son simulaciones: `scripts/documentacion-backend.mjs`
carga los 22 archivos `.gs` reales en una máquina virtual de Node con dobles de
`SpreadsheetApp`, `LockService`, `CacheService` y compañía. Cuando una prueba
dice que la migración es idempotente, ha ejecutado la migración de verdad dos
veces sobre un libro sembrado con datos heredados.

| Suite | Qué demuestra |
|---|---|
| `backend.instalacion` | instalación limpia, hojas, semillas, modo arranque |
| `backend.migracion` | simulación sin escribir, idempotencia, lotes, inferencia de rama |
| `backend.expedientes` | estados, requisitos, resúmenes, espejo al libro |
| `backend.workflow` | prórrogas, solicitudes, revisiones, aprobaciones, tareas |
| `backend.reportes` | panel, 14 reportes, exportaciones reanudables |
| `backend.gobernanza` | consentimientos, retención, anonimización, reparación |
| `backend.concurrencia` | versión de registro, idempotencia, bloqueo |
| `backend.volumen` | 1 000 expedientes: hojas leídas y tamaño de respuesta |
| `backend.regresion` | 23 acciones heredadas, 39 columnas, colores, menú |
| `consola` | la interfaz contra el backend real, no contra datos falsos |
| `backend.auxiliares` | las tres columnas de la hoja `Auxiliar`: lectura completa, sin pisar valores |
| `backend.hojasFisicas` | validación del conteo, tope de 999, solo donde el catálogo lo pide |
| `backend.identificador` | carnet sin formato impuesto, duplicados, normalización |
| `cacheYSalida` | caché con revalidación, cola de salida idempotente, preferencias a prueba de `localStorage` editado |
| `superficies` | hoja central: candado de scroll, foco, apilamiento, contador de hojas |
| `panelPantalla` | autodiagnóstico, cambios pendientes y preferencias escribiendo donde el módulo lee |

### 5.1 Verificación visual

Las pruebas en jsdom no ven lo que ve un ojo, y tampoco detectan un HTML mal
anidado que el navegador sí denuncia. Para eso está `npm run doc:qa`
(`qa/visual-documentacion.mjs`): arranca Vite, abre la consola en un Chromium de
verdad y **desvía todas sus llamadas al backend cargado en memoria**, de modo que
las pantallas muestran datos que salieron del `doPost` real.

Al terminar informa de las llamadas fallidas y de los errores de la consola del
navegador, y deja las capturas en `docs/modules/img/documentacion/`. La última
ejecución, ya con la consola rediseñada: 22 llamadas al backend, ninguna fallida,
cero errores de consola.

> **Lo que encontró esta comprobación**
> En la vista de tarjetas del móvil, la fila era un `<button>` y dentro se
> pintaban los botones de acción de cada celda: un botón dentro de otro botón, que
> no es HTML válido y deja los controles internos fuera del alcance del teclado.
> Ninguna prueba lo había visto; el navegador lo dijo en la primera pasada. Ahora
> la tarjeta es un contenedor con su botón «Abrir» explícito.

Playwright no está en las dependencias del proyecto para no arrastrar 100 MB de
navegador en cada instalación; el propio guion explica cómo instalarlo.

### 5.2 Sondas de medición

Además de las capturas, hay cinco sondas que **afirman** en lugar de mostrar. Se
apoyan en un arnés compartido (`qa/doc-arnes.mjs`) y están documentadas una por una
en `qa/README.md`.

| Sonda | Qué afirma |
|---|---|
| `sonda-contraste.mjs` | ~2 800 nodos de texto, 7 pantallas × 2 temas, contra WCAG AA |
| `sonda-rendimiento.mjs` | Con CPU 4x: interactivo, desplazamiento, apertura, ms por tecla, tareas largas por fase, fugas |
| `sonda-alta-expediente.mjs` | El alta de punta a punta, comprobada en el libro y contando llamadas |
| `sonda-modal-expediente.mjs` | Foco atrapado y devuelto, apilamiento, 20 ciclos sin basura, el guardado no miente |
| `sonda-cache-expedientes.mjs` | Precarga en lote, apertura instantánea, conflicto de versión, backend caído |

> **Lo que encontraron estas sondas.** El foco robado por el botón de cerrar al
> abrir una superficie; la confirmación enterrada bajo la hoja del expediente
> (`z-index` 110 contra 120); la apertura del expediente en 1 336 ms; el modo
> ligero que no ahorraba nada porque dejaba las sombras y no cubría la cabecera
> pegajosa de la tabla; la reconciliación de versión que no se disparaba nunca en
> el caso real; el módulo cayéndose sin `ThemeProvider`; y la devolución de foco al
> `body`, que lo borraba. Ninguna prueba en jsdom había visto ninguno.

> **Una advertencia sobre medir en un navegador sin ventana.** El
> `requestAnimationFrame` de un Chromium headless va a 4-5 Hz **aunque no se
> estrangule nada**. Los fotogramas por segundo no son un criterio válido allí, y
> la sonda de rendimiento no afirma sobre ellos: solo los informa. Sus
> afirmaciones son sobre trabajo (milisegundos de tarea) y sobre proporciones.

---

## 6. Qué queda fuera

Dicho de frente, para que nadie lo descubra en producción:

- **`EJECUTIVO` y `DIRECTORIO`** no tienen rama definida. La web lo dice.
- **La aprobación multinivel** funciona con un nivel. El orden entre niveles
  está implementado y probado, pero no hay pantalla para diseñar flujos.
- **El correo está apagado** por defecto. Las notificaciones se generan en la
  bandeja interna; enviarlas por correo es una casilla de configuración.
- **El expediente laboral** se prepara con un contrato documentado, pero no hay
  destino real al que enviarlo.
- **Sin IA.** El resumen del expediente es una plantilla determinista.
- **La migración no rellena los conteos de hojas.** Todos quedan en cero, que
  significa «sin contar». Inventarlos sería fabricar el dato que el área necesita
  que sea real. Consecuencia práctica: tras migrar, todos los documentos físicos ya
  entregados aparecen como «sin contar» hasta que alguien los cuente.
- **El modo auditoría no respeta las columnas ocultas.** Es deliberado: es la vista
  que se imprime para demostrar algo, y poder ocultarle columnas sería poder
  producir una prueba incompleta sin darse cuenta.
- **La cola de salida solo cubre los cambios de requisitos.** Es la escritura que
  ocurre cien veces al día; el resto sigue siendo síncrona con su propio manejo de
  error.
