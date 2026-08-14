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
| `CatalogoDocumentos` | documento exigible | 31 filas semilla; editable sin tocar código |
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
| GENERAL | NINGUNA | 18 |
| COMERCIAL | COMERCIAL_1 / 2 / 3 | 22 |
| AUDITORIA | NINGUNA | 20 |
| CUMPLIMIENTO | NINGUNA | 20 |

Los cuatro documentos de garantía cuelgan del tipo `COMERCIAL`: poner una
garantía a un funcionario `GENERAL` no los añade, porque en el proceso real la
fianza acompaña al cargo comercial, no al nivel de garantía por sí solo.

`EJECUTIVO` y `DIRECTORIO` están declarados pero inactivos: la web los muestra
como «en construcción» en lugar de ofrecer una rama a medio definir.

Al cambiar la rama de un expediente los requisitos se sincronizan, y aquí hay
una decisión deliberada: **un requisito que ya tiene datos no se elimina**. Si
alguien marcó como entregado el contrato de fianza y luego corrige la garantía a
`NINGUNA`, el requisito se conserva marcado como no aplicable en lugar de
desaparecer con su historia.

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
  ui/         DocumentacionConsola.tsx   armazón y menú por capacidades
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

El panel responde a «qué mirar hoy»: vencimientos, observaciones sin resolver,
aprobaciones esperando, tareas propias. El listado permite filtrar y guardar el
filtro. El lateral de expediente reúne en nueve pestañas lo que antes había que
buscar en tres sitios, y guarda por bloque —con su versión— en lugar de mandar
el expediente entero.

### 4.3 Movimiento y accesibilidad

Todo el movimiento pasa por las primitivas heredadas y respeta
`prefers-reduced-motion` del sistema por encima de lo configurado: este módulo
se usa durante horas seguidas y el mareo por movimiento es un problema real. Las
tablas se convierten en tarjetas en pantalla estrecha, el lateral atrapa el foco
y cierra con `Escape`, y toda acción destructiva pide confirmación mostrando el
impacto que va a tener.

---

## 5. Verificación

```bash
npm run doc:check    # 20 comprobaciones de coherencia
npm run typecheck    # tipos
npx vitest run       # 519 pruebas
npm run build        # compilación
```

`doc:check` comprueba lo que un compilador no puede ver en Apps Script:
funciones duplicadas en el espacio global, acciones que el frontend llama y el
backend no atiende **y al revés**, escrituras declaradas distinto en las dos
partes, acciones heredadas que hayan desaparecido, el catálogo con sus 31
documentos y sus códigos originales, y el vocabulario compartido.

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

### 5.1 Verificación visual

Las pruebas en jsdom no ven lo que ve un ojo, y tampoco detectan un HTML mal
anidado que el navegador sí denuncia. Para eso está `npm run doc:qa`
(`qa/visual-documentacion.mjs`): arranca Vite, abre la consola en un Chromium de
verdad y **desvía todas sus llamadas al backend cargado en memoria**, de modo que
las pantallas muestran datos que salieron del `doPost` real.

Al terminar informa de las llamadas fallidas y de los errores de la consola del
navegador, y deja las capturas en `docs/modules/img/documentacion/`. La última
ejecución: 20 llamadas al backend, ninguna fallida, cero errores de consola.

> **Lo que encontró esta comprobación**
> En la vista de tarjetas del móvil, la fila era un `<button>` y dentro se
> pintaban los botones de acción de cada celda: un botón dentro de otro botón, que
> no es HTML válido y deja los controles internos fuera del alcance del teclado.
> Ninguna prueba lo había visto; el navegador lo dijo en la primera pasada. Ahora
> la tarjeta es un contenedor con su botón «Abrir» explícito.

Playwright no está en las dependencias del proyecto para no arrastrar 100 MB de
navegador en cada instalación; el propio guion explica cómo instalarlo.

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
