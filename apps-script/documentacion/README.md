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

Mas `Auxiliar`, con los catalogos sueltos (`agencia_bdp`, `gerencia_bdp`,
`cargo_bdp`) que crecen solos y de los que **nunca se quita un valor** aunque deje
de usarse.

Tres reglas de lectura y escritura de `Auxiliar`, cada una nacida de un fallo real:

1. **La cabecera se localiza normalizada.** «Agencia BDP», `agencia_bdp` y
   «AGENCIA  BDP» son la misma columna: se comparan sin acentos, sin mayusculas y
   sin espacios repetidos.
2. **Se lee hasta `getMaxRows()`, sin detenerse en el primer hueco.** Una fila
   vacia en medio de la lista no es el final de la lista.
3. **Se escribe debajo de la ultima fila realmente ocupada de esa columna**
   (`doc2UltimaFilaDeColumna_`). Antes se usaba el alto de la hoja, asi que anadir
   una agencia podia **pisar** un valor existente.

`cargo_bdp` la crea la instalacion, pero los valores los pega el area: el backend
no puede inventar el catalogo de cargos del banco. Un cargo fuera de la lista
genera el hallazgo `cargo-fuera-catalogo`, que es **siempre advertencia y nunca
bloqueo**: es un dato que hay que revisar, no un motivo para impedir que se
registre a alguien que ya empezo a trabajar.

**Pestanas anuales** `CONTROL INGRESOS <ano>`. Columnas A-W identicas al Excel
original (incluidos el espacio final de `Tipo de Empleado ` y las dos columnas
`CONTRATO DE FIANZA`), mas 16 columnas de gestion a partir de la X: identificador,
correo, avance, recuento de documentos, estado, prorroga, avisos, `DETALLE JSON`
y sello de auditoria.

`DETALLE JSON` se sigue escribiendo por compatibilidad, pero ya no es la fuente:
el checklist real vive en `ExpedienteDocumentos`, una fila por requisito.

La columna de gestion `HOJAS POR DOCUMENTO` (`hojas_detalle`) se anade **despues de
la ultima existente**; las columnas A-W del Excel original quedan intactas.

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
| `4.1.0-hojas-fisicas` | Anade `subseccion` y `hojas_fisicas` a `ExpedienteDocumentos` y materializa la subseccion por rama |

Tres garantias:

- **Simulacion primero.** `documentacion.migrar` con `simular: true` no escribe
  nada y devuelve el informe de lo que haria.
- **Idempotente.** Los identificadores son deterministas, asi que volver a
  ejecutarla no duplica; y **no degrada estados resueltos**: un documento ya
  aprobado no vuelve a pendiente.
- **Por lotes con reanudacion.** Si se agota el tiempo de ejecucion, la
  siguiente llamada sigue donde quedo.

Se guarda un respaldo antes de empezar.

> **`4.1.0-hojas-fisicas` no inventa ningun conteo.** Todos los `hojas_fisicas`
> quedan en cero, que significa «sin contar». Rellenarlos con una estimacion seria
> fabricar el dato que el area necesita que sea real. Consecuencia practica: tras
> migrar, todos los documentos fisicos ya entregados apareceran como «sin contar»
> hasta que alguien los cuente.

> **Los requisitos retirados se conservan.** `cert-trabajo` y `rc-iva` llevan
> `retirado: true` en el catalogo: no se siembran en expedientes nuevos, pero
> `doc2AportaDato_` protege los que un expediente antiguo si tenia, con su estado y
> su historia. Borrarlos convertiria la historia de esos expedientes en huecos.

## Acciones

Todas por `POST` con cuerpo JSON enviado como `text/plain` y `redirect: "follow"`.

Modelo nuevo, `documentacion.<recurso>.<verbo>`:

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

## Catalogo, presentacion y hojas fisicas

`DOC2_CATALOGO_VERSION = 3`. El catalogo canonico tiene **39 entradas**: 37
vigentes y 2 retiradas. Cada documento declara, ademas de su aplicabilidad por
rama:

| Campo | Valores | Para que |
|---|---|---|
| `presentacionFisica` | `SI` / `NO` / `CONDICIONAL` | Se archiva en papel |
| `presentacionDigital` | `SI` / `NO` / `CONDICIONAL` | Llega por correo o WhatsApp |
| `requiereConteoHojas` | `true` / `false` | Lleva contador de hojas |
| `subseccion` | texto, o mapa por tipo de garantia | De quien es el documento |
| `retirado` | `true` | El area dejo de pedirlo |

`CONDICIONAL` existe porque hay documentos que dependen del caso, y forzarlos a
`SI`/`NO` obligaba a elegir una mentira.

**Nueve** documentos llevan contador de hojas. La validacion esta en
`doc2ValidarHojasFisicas_`: entero, sin signos ni decimales, maximo
`DOC2_LIMITS.MAX_HOJAS_FISICAS` = 999. El tope no es decorativo: un dedo pegado en
el teclado que escriba 99.999 hojas contamina los totales del libro anual con
cifras que nadie puede explicar.

**La subseccion se resuelve en un solo sitio.** `doc2ResolverSubseccion_` acepta
las dos formas —texto unico o mapa por rama— y la usan el asistente, la vista del
expediente, los reportes y las exportaciones. Si cada uno lo resolviera a su
manera, el mismo documento acabaria bajo dos titulos distintos.

**Quien pide conteo lo dice el catalogo, no la semilla.**
`doc2PideConteoDeHojas_` lee `CatalogoDocumentos`, que es editable desde la
configuracion. Consultar la semilla daria la respuesta correcta el dia de la
instalacion y una respuesta obsoleta a partir del primer cambio.

Recuentos por rama: General **16** · Comercial T1 **21** · T2 **25** · T3 **21** ·
Auditoria **17** · Cumplimiento **19**. `npm run doc:check` los verifica contra las
tres capas.

## Alta en una sola llamada

`documentacion.expediente.crear` acepta el expediente, sus requisitos ya marcados
y sus prorrogas juntos, y devuelve el detalle completo si se pide
(`devolverDetalle: true`). Antes eran cuatro viajes; con Apps Script y una red de
agencia eso son entre cuatro y doce segundos, y cualquiera de los tres ultimos
podia fallar dejando un expediente a medias.

Si algo falla a mitad, `doc2RevertirAltaFallida_` deshace el expediente: es mejor
no tener nada que tener un expediente sin sus requisitos.

`documentacion.expedientes.detalle` lee **varios** expedientes en una llamada. La
usa la precarga en segundo plano del frontend, en lotes, con su propio tope y
devolviendo en `omitidos` lo que no cupo.

## Limites

Apps Script permite 6 minutos por ejecucion y 50.000 caracteres por celda. Por
eso las importaciones, las migraciones y las exportaciones van por lotes con
punto de control, y los respaldos que no caben en una celda se recortan avisando.
Las cuotas diarias de Google aplican al correo, no a la lectura y escritura de la
hoja; el correo esta apagado por defecto.
