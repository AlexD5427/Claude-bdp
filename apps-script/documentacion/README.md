# Backend de Documentacion (Google Apps Script)

Base de datos del modulo de Documentacion sobre una hoja de calculo de Google.

Hay dos capas. Debajo, **19 hojas normalizadas** con una fila por hecho:
expedientes, documentos, solicitudes, revisiones, aprobaciones, tareas. Encima,
el libro anual `CONTROL INGRESOS <ano>` que replica `registro_ingresos.xlsx` con
sus mismas columnas y colores, escrito desde el modelo normalizado.

Quien prefiera trabajar en Sheets puede seguir haciendolo: el libro se mantiene
al dia solo. Lo que cambia es de donde sale el dato.

## Archivos

| Archivo | Que hace |
|---|---|
| `appsscript.json` | Manifiesto: zona horaria, permisos y publicacion web |
| `00_Manifest.gs` | Catalogo de columnas, colores, listas y semillas del libro |
| `01_Core.gs` | Errores con pista, utilidades, bitacora interna |
| `02_Store.gs` | Lectura y escritura por lotes con reversion |
| `03_Schema.gs` | Instalacion, verificacion y formato de las hojas del libro |
| `04_Year.gs` | Pestanas anuales, mapeo de filas y pintado |
| `05_Audit.gs` | Auditoria campo a campo y metricas |
| `06_Dossiers.gs` | Altas, ediciones, bajas e importacion (heredado) |
| `07_Maintenance.gs` | Diagnostico, autorreparacion, respaldos (heredado) |
| `08_Router.gs` | `doGet` / `doPost`, bloqueo e idempotencia |
| `09_Menu.gs` | Menu del libro y tarea diaria |
| `10_Tests.gs` | Pruebas sobre un libro temporal |
| `11_Domain.gs` | Vocabulario: estados, transiciones, catalogo, roles, limites |
| `12_Data.gs` | Hojas normalizadas, repositorio, version de registro, cache |
| `13_Catalog.gs` | Catalogo unico y motor de aplicabilidad |
| `14_Auth.gs` | Identidad, roles, capacidades, modo arranque |
| `15_Expedientes.gs` | Servicio de expedientes, requisitos y resumenes |
| `16_Workflow.gs` | Prorrogas, solicitudes, revisiones, aprobaciones, tareas |
| `17_Automation.gs` | Bus de eventos, automatizaciones, proceso diario |
| `18_Reports.gs` | Panel, reportes, exportaciones por lotes, filtros |
| `19_Governance.gs` | Consentimientos, retencion, diagnostico, reparacion |
| `20_Migrations.gs` | Motor de migraciones con simulacion y reanudacion |
| `21_Api.gs` | Registro de acciones `documentacion.*` |

El orden del prefijo numerico importa: Apps Script concatena los archivos y las
constantes de nivel superior deben existir antes de usarse. Por el mismo motivo
**dos funciones con el mismo nombre en archivos distintos se pisan en silencio**;
`npm run doc:check` lo detecta desde el repositorio.

## Estructura del libro

**Hojas normalizadas** (la verdad del sistema):

```
Expedientes              ExpedienteDocumentos      ExpedienteProrrogas
CatalogoDocumentos       SolicitudesDocumentales   SolicitudDocumentos
RevisionesDocumentales   AprobacionesDocumentales  ComentariosDocumentacion
TareasDocumentales       NotificacionesDocumentales HistorialDocumentacion
AuditoriaDocumentacion   ConsentimientosDocumentacion  PoliticasRetencion
ExportacionesDocumentacion  FiltrosDocumentacion   ConfiguracionDocumentacion
MigracionesDocumentacion
```

Mas `Auxiliar`, con los catalogos sueltos —`agencia_bdp`, `gerencia_bdp` y
`cargo_bdp`— que crecen solos y de los que **nunca se quita un valor** aunque
deje de usarse.

Tres detalles de esa hoja que costaron datos y que ahora estan resueltos:

- la cabecera se reconoce **normalizada**: `Cargo_BDP`, `cargo bdp ` o un espacio
  al final apuntan a la misma columna, en lugar de dejar el desplegable vacio y
  crear una columna duplicada al lado;
- se lee la **columna entera**, con sus huecos, y se devuelve ordenada y sin
  repetidos (`localeCompare('es')`), sin tope de filas;
- al anadir un valor se escribe **despues de la ultima fila con contenido de esa
  columna**. La version anterior calculaba la fila con la lista ya deduplicada
  (`2 + actuales.length`) y, en una columna con duplicados o huecos, **pisaba
  valores reales del area**.

**Pestanas anuales** `CONTROL INGRESOS <ano>`. Columnas A-W identicas al Excel
original (incluidos el espacio final de `Tipo de Empleado ` y las dos columnas
`CONTRATO DE FIANZA`), mas 16 columnas de gestion a partir de la X: identificador,
correo, avance, recuento de documentos, estado, prorroga, avisos, `DETALLE JSON`
y sello de auditoria.

`DETALLE JSON` se sigue escribiendo por compatibilidad, pero ya no es la fuente:
el checklist real vive en `ExpedienteDocumentos`, una fila por requisito.

**Hojas de sistema heredadas** `AUDITORIA`, `ENTREGA COM+SEGUROS`, `_CATALOGO`,
`_CONFIG`, `_RESPALDOS`, `_DIARIO`, `_SOLICITUDES`, `_META`. Las que empiezan por
guion bajo se ocultan. `_CATALOGO` se mantiene como espejo derivado del catalogo
canonico.

## Colores

Tomados del libro real, no inventados:

| Color | Significado |
|---|---|
| Verde `#92D050` | Expediente completo |
| Celeste `#73DCF5` | Ingreso nuevo sin documentos |
| Durazno `#F8CBAD` | En gestion con observaciones |
| Ambar `#FFC000` | Prorroga vigente |
| Rojo `#FF0000` | Critico o desvinculado |

Mas formato condicional sobre `FALTA`, `COMPLETO`, `NO TIENE` y `PRORROGA`.

## Instalacion

El procedimiento completo, con verificaciones y plan de reversion, esta en
`docs/modules/DOCUMENTACION_DESPLIEGUE.md`. Resumen:

1. Crear la hoja de calculo (o abrir la existente) y copiar su ID de la URL.
2. `Extensiones > Apps Script`. Un archivo por cada `.gs`, con el mismo nombre.
3. Pegar el manifiesto en `appsscript.json`.
4. Propiedades del script: `DOC_SPREADSHEET_ID` y, si se quiere proteger las
   operaciones sensibles, `DOC_ADMIN_KEY`.
5. `Documentacion > Instalar o actualizar modelo`.
6. `Documentacion > Simular migracion` y leer el informe.
7. `Documentacion > Migrar al modelo normalizado`.
8. Publicar como aplicacion web (ejecutar como uno mismo, acceso a cualquier
   usuario) y pegar la URL en Configuracion > Conexion del modulo.

Al cambiar el codigo hay que publicar una **version nueva** de la implementacion;
guardar el archivo no basta.

## Migracion

`doc2Migrar_` va por versiones, cada una idempotente:

| Version | Que hace |
|---|---|
| `4.0.0-estructura` | Crea las 19 hojas con sus cabeceras |
| `4.0.1-catalogos` | Siembra el catalogo y los auxiliares desde el libro |
| `4.0.2-expedientes` | Convierte cada fila anual en expediente + requisitos |
| `4.0.3-resumenes` | Recalcula avances, estados y colores |
| `5.0.0-hojas-fisicas` | Crea `hojas_fisicas` en `ExpedienteDocumentos` y las columnas de subseccion y presentacion en `CatalogoDocumentos`; siembra el catalogo v3 (39 filas); crea y siembra `cargo_bdp`; recupera los conteos de hojas del `DETALLE JSON` sin pisar lo escrito a mano |

Tres garantias:

- **Simulacion primero.** `documentacion.migrar` con `simular: true` no escribe
  nada y devuelve el informe de lo que haria.
- **Idempotente.** Los identificadores son deterministas, asi que volver a
  ejecutarla no duplica; y **no degrada estados resueltos**: un documento ya
  aprobado no vuelve a pendiente.
- **Por lotes con reanudacion.** Si se agota el tiempo de ejecucion, la
  siguiente llamada sigue donde quedo.

Se guarda un respaldo antes de empezar.

## Catalogo

`DOC2_CATALOGO_SEMILLA` tiene **39 filas**: 37 vigentes y 2 retiradas
(`cert-trabajo`, `rc-iva`, con `activo: false` y `retirado: true`). Los retirados
**no se borran** porque los expedientes de anos anteriores tienen requisitos que
apuntan a esos codigos; simplemente no se piden nunca mas.

Recuentos por rama, comprobados por `npm run doc:check` y por `10_Tests.gs`:

| Rama | Requisitos |
|---|---|
| General | 16 |
| Comercial garantia tipo 1 | 21 |
| Comercial garantia tipo 2 | 25 |
| Comercial garantia tipo 3 | 21 |
| Auditoria | 17 |
| Cumplimiento | 19 |

Campos nuevos por documento:

- `subseccion` — los 17 documentos de garantia se agrupan como en la hoja del
  area. `garante-inmueble` y `garante-folio` cambian de subseccion segun la rama,
  asi que la subseccion se resuelve **por rama** (`doc2SubseccionMapa_`), no por
  documento.
- `fisica` / `digital` — `SI`, `NO` o `CONDICIONAL`. El condicional se pinta
  «Fisico*» con su leyenda: la copia fisica se pide solo en algunos casos.
- `requiere_conteo_hojas` — los **9** documentos que se archivan en papel piden el
  numero de hojas, que se guarda en `ExpedienteDocumentos.hojas_fisicas` y se
  escribe en la columna `PAGINAS` del libro anual.
- `persona`, `plazo_dias`, `hojas` — de quien es el documento, el plazo por
  omision y el numero de hojas esperado.

## Acciones

Todas por `POST` con cuerpo JSON enviado como `text/plain` y `redirect: "follow"`.

Modelo nuevo, `documentacion.<recurso>.<verbo>`:

```
expediente.crear | actualizar | obtener | estado | sincronizar | recalcular
expediente.archivar | restaurar | conservacion | laboral | expedientes.listar
expediente.porCarnet | expedientes.detalle
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

Heredadas, todas siguen atendidas sin cambio de forma:

```
estado | diagnostico | verificar | instalar | reparar | crear-anio
expedientes.listar | expediente.obtener | expediente.guardar | expediente.borrar
expedientes.importar | expedientes.exportar | aviso.registrar
configuracion.obtener | configuracion.guardar | catalogo.guardar
auditoria.consultar | auditoria.metricas
mantenimiento.autoreparar | mantenimiento.respaldar | mantenimiento.respaldos
mantenimiento.restaurar | mantenimiento.deduplicar | mantenimiento.recalcular
mantenimiento.recolorear | mantenimiento.compactar
entregas.listar | entrega.registrar
```

Respuesta siempre con la misma forma, con alias para no romper clientes viejos:

```json
{
  "ok": true,
  "accion": "documentacion.expediente.crear",
  "solicitudId": "req_...",
  "datos": {}, "data": {},
  "avisos": [],
  "meta": { "requestId": "req_...", "timestamp": "...", "version": "4.0.0" }
}
```

Cuando `ok` es falso llega `error` con `codigo` (y `code`), `mensaje`, `pista`,
`detalle` y `campos`. La `pista` es lo que el frontend convierte en boton de
solucion; `campos` es lo que se pinta junto a cada campo del formulario.

### Tres acciones que merecen explicacion

- **`expediente.crear` hace todo el alta.** Acepta, ademas de la identidad y la
  rama, las listas `requisitos` (estado, observaciones y hojas fisicas) y
  `prorrogas`, y lo aplica todo en una escritura idempotente. Antes eran cuatro
  llamadas y un corte a mitad dejaba un expediente creado y sin marcar. Responde
  `completa: true` con `aplicados`, `prorrogasCreadas` y `fallidos`; un frontend
  nuevo contra un backend viejo detecta la ausencia de `completa` y recae en la
  ruta antigua.
- **`expedientes.detalle`** devuelve el detalle ligero de hasta 12 expedientes en
  una llamada (`DOC2_MAX_DETALLE_LOTE`). Es lo que usa la precarga del frontend:
  veinticinco expedientes se traen en tres llamadas y no en veinticinco.
- **`expediente.porCarnet`** dice si un carnet ya tiene expediente, comparando por
  **clave de identidad** (solo digitos y letras, `doc2ClaveIdentidad_`). En el
  libro el mismo documento vive como «1234567 LP», «1234567 - 45 - 2026» y
  «1234567-lp»; una busqueda por texto no reconoce ninguna de las otras dos. Es
  lo que permite avisar del duplicado mientras se escribe.

> `doc2ClaveIdentidad_` es una funcion **aparte** de
> `doc2NormalizarIdentificador_`, que alimenta `doc2StableId_`. Tocar esa otra
> habria cambiado el identificador estable de todos los expedientes existentes.

`documentacion.catalogo` y `documentacion.auxiliares` aceptan `refrescar: true`,
que invalida la cache del servidor: es lo que hace falta cuando el area acaba de
pegar cargos o agencias a mano y no quiere esperar diez minutos.

## Por que `text/plain`

Con `application/json` el navegador envia una peticion `OPTIONS` previa que Apps
Script no responde, y la llamada falla por CORS. Con `text/plain` no hay
preflight. Ademas Apps Script responde con una redireccion 302, asi que todo
`fetch` necesita `redirect: "follow"`.

## Concurrencia

Tres mecanismos para tres problemas distintos:

- **Bloqueo** (`LockService`): dos escrituras simultaneas no se pisan.
- **`version_registro`**: quien guarda declara la version que leyo. Si no
  coincide, se responde `CONFLICTO` en lugar de sobrescribir a otra persona.
- **`solicitudId`**: si la misma escritura llega repetida -reintento, doble clic,
  cola sin conexion- se devuelve el resultado guardado. Sin esto, una conexion
  inestable duplica expedientes.

## Permisos

Seis roles (`admin`, `supervisor`, `auxiliar`, `analista`, `pasante`,
`invitado`) sobre 16 capacidades. El rol se resuelve en este orden: llave de
administrador, modo arranque, mapa de roles por cuenta, rol declarado, rol por
defecto. **El rol declarado por el cliente solo vale si el mapa lo confirma**: no
hay forma de subirse los permisos desde el navegador.

El modo arranque existe porque una instalacion nueva no tiene todavia a nadie con
permisos; se cierra solo en cuanto hay mapa de roles o algun expediente.

Migrar, reparar y guardar configuracion pueden exigir ademas la llave
`DOC_ADMIN_KEY` de las propiedades del script: se activa poniendo la clave de
configuracion `exigir_llave_admin` en `TRUE`. Viene apagada para que una
instalacion nueva no se quede bloqueada, y conviene encenderla en cuanto el libro
tenga datos reales.

## Mantenimiento

Desde el menu `Documentacion` del libro o desde Configuracion > Mantenimiento:

- **Diagnosticar**: hallazgos con gravedad (INFO, ADVERTENCIA, IMPORTANTE,
  CRITICO) y la accion que los corrige. Solo lectura.
- **Reparar**: separa lo que se arregla solo, lo que necesita confirmacion y lo
  que hay que resolver a mano. Informe antes y despues.
- **Inconsistencias**: unas 28 comprobaciones cruzadas entre hojas.
- **Respaldar / Restaurar**: copias completas dentro del propio libro.
- **Recalcular / Repintar**: rehace avances, estados y colores.
- **Proceso diario**: vencimientos, avisos y tareas. Idempotente: si se ejecuta
  dos veces el mismo dia, no avisa dos veces.

Toda operacion destructiva saca un respaldo antes. Y nada borra filas: la
retencion marca `PENDIENTE_ELIMINACION` y la anonimizacion sustituye valores.

## Pruebas

Dos niveles.

Desde el editor, `docEjecutarPruebas()` o `Documentacion > Ejecutar pruebas`:
crea un libro temporal, prueba contra el y lo borra. Nunca toca datos reales.
`docEjecutarPruebas(true)` salta la parte lenta.

Desde el repositorio, `npx vitest run`: el arnes
`scripts/documentacion-backend.mjs` carga estos mismos archivos `.gs` en Node con
dobles de `SpreadsheetApp`, `LockService`, `CacheService` y compania, de modo que
la instalacion, la migracion y los flujos se ejecutan de verdad en cada
`git push`.

## Limites

Apps Script permite 6 minutos por ejecucion y 50.000 caracteres por celda. Por
eso las importaciones, las migraciones y las exportaciones van por lotes con
punto de control, y los respaldos que no caben en una celda se recortan avisando.
Las cuotas diarias de Google aplican al correo, no a la lectura y escritura de la
hoja; el correo esta apagado por defecto.
