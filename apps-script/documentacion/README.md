# Backend de Documentacion (Google Apps Script)

Base de datos del modulo de Documentacion sobre una hoja de calculo de Google.
Replica el libro `registro_ingresos.xlsx` que ya usa el area: mismas pestanas,
mismas cabeceras, mismos colores. Quien prefiera trabajar en Sheets puede
seguir haciendolo; la web y el libro son dos vistas del mismo dato.

## Archivos

| Archivo | Que hace |
|---|---|
| `appsscript.json` | Manifiesto: zona horaria, permisos y publicacion web |
| `00_Manifest.gs` | Catalogo de columnas, colores, listas y semillas |
| `01_Core.gs` | Errores con pista, utilidades, bitacora interna |
| `02_Store.gs` | Lectura y escritura por lotes con reversion |
| `03_Schema.gs` | Instalacion, verificacion y formato de las hojas |
| `04_Year.gs` | Pestanas anuales, mapeo de filas y pintado |
| `05_Audit.gs` | Auditoria campo a campo y metricas |
| `06_Dossiers.gs` | Altas, ediciones, bajas e importacion |
| `07_Maintenance.gs` | Diagnostico, autorreparacion, respaldos |
| `08_Router.gs` | `doGet` / `doPost`, bloqueo e idempotencia |
| `09_Menu.gs` | Menu del libro y tarea diaria |
| `10_Tests.gs` | Pruebas sobre un libro temporal |

El orden del prefijo numerico importa: Apps Script concatena los archivos y las
constantes de nivel superior deben existir antes de usarse.

## Estructura del libro

**Pestanas anuales** `CONTROL INGRESOS <ano>`. Columnas A-W identicas al Excel
original (incluidos el espacio final de `Tipo de Empleado ` y las dos columnas
`CONTRATO DE FIANZA`), mas 16 columnas de gestion a partir de la X: identificador,
correo, avance, recuento de documentos, estado, prorroga, avisos, `DETALLE JSON`
y sello de auditoria.

`DETALLE JSON` guarda el checklist completo. Es lo que permite que la web
reconstruya el expediente exacto sin perder observaciones ni numero de paginas.

**Hojas de sistema** `AUDITORIA`, `ENTREGA COM+SEGUROS`, `_CATALOGO`, `_CONFIG`,
`_RESPALDOS`, `_DIARIO`, `_SOLICITUDES`, `_META`. Las que empiezan por guion bajo
se ocultan.

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

1. Crear una hoja de calculo en blanco y copiar su ID de la URL.
2. `Extensiones > Apps Script`. Crear un archivo por cada `.gs` con el mismo
   nombre y pegar su contenido.
3. Mostrar `appsscript.json` con `Configuracion del proyecto > Mostrar
   appsscript.json` y pegar el manifiesto.
4. `Configuracion del proyecto > Propiedades del script`: anadir
   `DOC_SPREADSHEET_ID` con el ID del paso 1.
5. Ejecutar `docMenuInstalar` una vez y aceptar los permisos.
6. `Implementar > Nueva implementacion > Aplicacion web`, ejecutar como uno
   mismo, acceso a cualquier usuario. Copiar la URL.
7. Pegar esa URL en `SCRIPT_URL` de `src/constants.ts`.

Al cambiar el codigo hay que publicar una **version nueva** de la implementacion;
guardar el archivo no basta.

## Acciones

Todas por `POST` con cuerpo JSON enviado como `text/plain` y `redirect: "follow"`.

```
estado | diagnostico | verificar
instalar | reparar | crear-anio
expedientes.listar | expediente.obtener | expediente.guardar | expediente.borrar
expedientes.importar | expedientes.exportar | aviso.registrar
configuracion.obtener | configuracion.guardar | catalogo.guardar
auditoria.consultar | auditoria.metricas
mantenimiento.autoreparar | mantenimiento.respaldar | mantenimiento.respaldos
mantenimiento.restaurar | mantenimiento.deduplicar | mantenimiento.recalcular
mantenimiento.recolorear | mantenimiento.compactar
entregas.listar | entrega.registrar
```

Respuesta siempre con la misma forma:

```json
{
  "ok": true,
  "accion": "expediente.guardar",
  "solicitudId": "req_...",
  "datos": {},
  "avisos": [],
  "meta": { "traza": "...", "backend": "1.0.0", "instalado": true }
}
```

Cuando `ok` es falso llega `error` con `codigo`, `mensaje`, `pista` y `detalle`.
La `pista` es lo que el frontend convierte en boton de solucion.

## Por que `text/plain`

Con `application/json` el navegador envia una peticion `OPTIONS` previa que Apps
Script no responde, y la llamada falla por CORS. Con `text/plain` no hay
preflight. Ademas Apps Script responde con una redireccion 302, asi que todo
`fetch` necesita `redirect: "follow"`.

## Idempotencia

Cada escritura viaja con un `solicitudId`. Si llega repetida -reintento, doble
clic, cola sin conexion- no se ejecuta otra vez: se devuelve el resultado
guardado. Sin esto, una conexion inestable duplica expedientes.

## Mantenimiento

Desde el menu `Documentacion` del libro o desde la pestana Mantenimiento de la
configuracion del modulo:

- **Diagnosticar**: lista los problemas con su gravedad y la accion que los corrige.
- **Reparar automaticamente**: aplica lo que se puede arreglar solo.
- **Respaldar / Restaurar**: copias completas dentro del propio libro.
- **Buscar duplicados**: informa; nunca fusiona sin confirmacion.
- **Recalcular / Repintar**: rehace avances y colores.
- **Compactar**: recorta bitacoras antiguas.

Toda operacion destructiva saca un respaldo antes.

## Pruebas

`docEjecutarPruebas()` desde el editor o `Documentacion > Ejecutar pruebas`.
Crea un libro temporal, prueba contra el y lo borra. Nunca toca datos reales.
`docEjecutarPruebas(true)` salta la parte lenta.

## Limites

Apps Script permite 6 minutos por ejecucion y 50.000 caracteres por celda. Por
eso las importaciones grandes van por lotes y los respaldos que no caben en una
celda se recortan avisando. Las cuotas diarias de Google aplican al correo, no a
la lectura y escritura de la hoja.
