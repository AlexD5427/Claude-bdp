# Arnés de QA — navegador real + backend simulado

Este arnés levanta el **build de producción** de la aplicación, intercepta todas
las llamadas a `script.google.com` y recorre la interfaz con un navegador de
verdad. Sirve para lo que una prueba unitaria no alcanza: comprobar qué **ve** y
qué **puede hacer** quien opera el sistema, incluidos los casos que sólo ocurren
«en la computadora de una persona».

> El libro real **nunca** se toca: las lecturas y escrituras se responden dentro
> del navegador (ver `backend.mjs`). Se puede correr sin credenciales y sin red.

## Requisitos

```bash
npm i -D playwright          # una vez
npx playwright install chromium
```

## Uso

```bash
node scripts/qa/run.mjs                    # toda la batería (genera dist si falta)
node scripts/qa/run.mjs --build            # forzar un build nuevo antes de probar
node scripts/qa/run.mjs --filter=postul    # sólo los escenarios que coincidan
node scripts/qa/run.mjs --headed           # con navegador visible
node scripts/qa/run.mjs --shots=/tmp/qa    # dónde dejar capturas y reporte.json
```

Cada escenario corre en un contexto limpio, con su propio almacenamiento y su
propio backend simulado. La salida marca cada comprobación y el proceso termina
con código `1` si alguna falla, así que se puede colgar de un CI tal cual.

## Piezas

| Archivo | Qué hace |
| --- | --- |
| `run.mjs` | Corredor y catálogo de escenarios. |
| `backend.mjs` | Backend de Apps Script simulado, con modos de avería. |
| `fixtures.mjs` | Datos de prueba con los casos límite de la hoja real. |
| `server.mjs` | Servidor estático mínimo para `dist/`. |

## Modos de avería del backend

Se eligen por escenario (`seed.backend`) o en caliente (`backend.setMode`):

| Modo | Reproduce |
| --- | --- |
| `ok` | Todo bien: la escritura se acepta y la lectura siguiente la trae. |
| `stale:N` | La hoja acepta la escritura pero tarda N lecturas en devolverla (caché de Apps Script). |
| `rejected` | HTTP 200 con `{status:"error"}` — validación del backend. |
| `http500` | Despliegue caído: HTML de error. |
| `offline` | La petición no sale (proxy corporativo, sin red). |
| `timeout` | La petición se queda colgada para siempre. |

Además, la semilla de cada escenario puede reproducir «el equipo de esa
persona»: `session` y `local` siembran el almacenamiento (una sesión del
comparador con identificadores huérfanos, una configuración heredada corrupta),
`blockStorage` simula un navegador con el almacenamiento del sitio bloqueado, y
`perfil: null` obliga a pasar por la pantalla de acceso —la única vía por la que
se aplica la configuración personal guardada en la hoja—.

## Escenarios

| Escenario | Qué vigila |
| --- | --- |
| `smoke-modulos` | Los diez módulos abren sin errores de consola. |
| `comparador-agregar` | Agregar candidatos, ranking por mérito y aviso de desempate. |
| `comparador-sesion` | La comparación sobrevive al cambio de módulo. |
| `comparador-ids-huerfanos` | Sesión con identificadores que la hoja ya no tiene. |
| `comparador-config-corrupta` | Configuración local con un tope de columnas imposible. |
| `comparador-duplicados` | Dos filas de la hoja con el mismo identificador. |
| `comparador-graficos` | Los cinco tipos de gráfico se dibujan. |
| `comparador-config` | Apagar y volver a mostrar filas de la comparativa. |
| `comparador-lleno` | Diez columnas: tira congelada, d-pad y vaciado. |
| `comparador-movil` | 390 × 844 sin desborde horizontal. |
| `impresion-comparador` | En papel no queda texto recortado. |
| `impresion-ambito` | Dos impresiones seguidas no se contaminan. |
| `procesos-movil` | Procesos no desborda a lo ancho en un teléfono. |
| `postulantes-alta-ok` | Alta aceptada: una sola escritura y aparece en la lista. |
| `postulantes-alta-rechazada` | Rechazo del servidor: el cuestionario no se cierra. |
| `postulantes-alta-sin-red` | Sin red: no queda fila fantasma. |
| `postulantes-base-rezagada` | La ficha se sostiene mientras la hoja se pone al día. |
| `postulantes-intro` | Intro no envía la ficha a medio llenar. |
| `postulantes-editar` | Edición: bloqueo del identificador y una sola escritura. |
| `postulantes-duplicado-aviso` | Aviso de identificador repetido y edición detenida. |
| `postulantes-borrador` | Recuperación del borrador tras recargar. |
| `velocimetro` | Escribir una nota y **dejarla sin evaluar**. |
| `login-config-heredada` | Configuración personal corrupta guardada en la hoja. |
| `almacenamiento-bloqueado` | Navegador con el almacenamiento del sitio bloqueado. |
| `datos-sucios` | JSON corrupto, filas sin nombre, identificadores repetidos. |
| `rendimiento` | Mide el dibujado con 10 columnas y el tecleo en el cuestionario. |

## Añadir un escenario

```js
scenario(
  "nombre-corto",
  "Qué se está vigilando",
  async ({ page, checks, backend, problems, shot }) => {
    await goModule(page, "Comparador");
    check(checks, condicion, "Lo que debe cumplirse", "detalle si falla");
    await shot("captura");
  },
  { session: { /* … */ }, viewport: { width: 390, height: 844 } },
);
```
