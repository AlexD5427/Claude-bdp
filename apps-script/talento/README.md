# Backend del talento · contrato y rescate del código

> **Esta carpeta está vacía a propósito, y no debería seguir estándolo.**
>
> El backend del talento es el que atiende postulantes, comparador, perfiles de
> acceso, perfiles de cargo, procesos, referencias laborales e indicadores. Es el
> único de los tres backends del sistema cuyo código **no está en el
> repositorio**: vive únicamente dentro de la cuenta de Google que lo creó.
>
> Mientras eso siga así, perder el acceso a esa cuenta significa reescribirlo. El
> paso 9 de [`docs/migracion/MIGRACION_CUENTA_GOOGLE.md`](../../docs/migracion/MIGRACION_CUENTA_GOOGLE.md)
> lo extrae del editor de Apps Script y lo guarda aquí. Hágalo antes de tocar
> nada más.

## Qué guardar aquí

| Archivo | De dónde sale |
|---|---|
| `Code.gs` (o el nombre que tenga cada archivo del proyecto) | Editor de Apps Script del libro del talento, un archivo por archivo, con el mismo nombre |
| `appsscript.json` | `⚙️ Configuración del proyecto → Mostrar el archivo de manifiesto` |

**Las propiedades del script no se guardan aquí.** Sus nombres sí se pueden
documentar; sus valores van al gestor de contraseñas del área. Nada de lo que
haya en este repositorio debe ser un secreto.

---

## El contrato, tal como lo usa el frontend

Esto no es una especulación sobre lo que el backend hace: es lo que el frontend
**exige** que haga, leído de su propio código. Sirve para tres cosas: comprobar
que la copia migrada está completa, entender qué se rompe si falta una pieza y
—en el peor caso— reescribirlo.

La implementación de referencia de este mismo contrato, en Node, está en
[`qa/mock-backend.mjs`](../../qa/mock-backend.mjs): es la que usa el arnés de QA
para ejecutar la aplicación entera sin tocar Google.

### Reglas de transporte

Tres, y las tres tienen una razón:

1. **`redirect: "follow"` en toda llamada.** Google contesta `302` hacia
   `script.googleusercontent.com`; sin seguir la redirección, la aplicación falla
   con un `404` desconcertante en producción.
2. **Las escrituras van con `Content-Type: text/plain;charset=utf-8`.** Con
   `application/json` el navegador dispara una petición `OPTIONS` previa que un
   despliegue de Apps Script no sabe contestar, y la llamada falla por CORS. Con
   `text/plain` la petición es «simple» y no hay *preflight*. El cuerpo sigue
   siendo JSON.
3. **La respuesta de una escritura tiene que ser JSON con `status`.** El frontend
   valida `{ status: "success" | "ok" }` y trata cualquier otra cosa como un
   rechazo. Un cuerpo vacío se acepta (la escritura ocurrió, no hay sobre que
   leer), pero **una página HTML se rechaza siempre**: es la respuesta de Apps
   Script cuando el despliegue perdió permisos, y llega con código `200`.

### Lectura · `GET`

Una sola llamada sin parámetros devuelve el libro completo:

```json
{
  "candidatos": [ { "identificador": "8456872-105-2026", "nombres": "…", "…": "…" } ],
  "competencias": [ "Liderazgo,Bajo,Medio,Alto,Capacidad de guiar equipos" ],
  "arquetipos_disc": [ "D - Dominante|Directo, decidido y orientado al resultado." ],
  "auxiliares": {
    "cargos_bdp": [], "gerencias_bdp": [], "agencias_bdp": [],
    "modalidad_reclutamiento": [], "estado_proceso": []
  },
  "perfiles": [],
  "perfiles_cargo": [],
  "espejo_base": [],
  "espejo_ultimo": []
}
```

| Clave | Hoja de origen | Formato | Si falta |
|---|---|---|---|
| `candidatos` | La hoja de postulantes | Una fila por persona, cabeceras como nombres de campo. `conocimientos_tecnicos`, `herramientas` y `competencias` viajan como **JSON dentro de la celda** | No hay postulantes: el sistema arranca vacío |
| `competencias` | `Auxiliar`, columna de competencias | Texto `Nombre,Bajo,Medio,Alto,"Descripción"` | El comparador no puede explicar cada competencia |
| `arquetipos_disc` | `Auxiliar`, columna `arquetipo_disc` | Texto `Código - Nombre\|Descripción` | Se usa el catálogo interno de respaldo |
| `auxiliares` | `Auxiliar`, una columna por catálogo | Listas de texto | Los desplegables se quedan sin sugerencias (el texto libre sigue permitido) |
| `perfiles` | `perfiles` | Perfiles de acceso, con contraseña y `config_personal_perfil` | Solo quedan los perfiles internos, sin contraseña |
| `perfiles_cargo` | `perfil_cargo_bdp` | 22 columnas de texto plano; viñetas separadas por `" \| "`; diez ranuras `link_img_1…10` | El módulo de Perfiles de Cargo se queda vacío |
| `espejo_base`, `espejo_ultimo` | Hojas espejo | Filas para los filtros por gerencia/agencia/modalidad/estado | Esos filtros no se activan |

El frontend **tolera que falte cualquier clave** (`coercePayload` la sustituye por
una lista vacía), así que una migración incompleta no rompe la pantalla: la deja
sin datos. Por eso el verificador comprueba las claves una por una.

### Escrituras · `POST`

Todas al mismo endpoint, distinguidas por `type` o por `action`:

| Cuerpo | Qué hace | Quién lo envía |
|---|---|---|
| `{ …campos del postulante }` | Alta de postulante (sin `type` ni `action`) | Cuestionario de Postulantes |
| `{ action: "update", …campos }` | Edición por `identificador` | Botón «Editar» global |
| `{ type: "perfil_cargo", action: "create", row }` | Alta en `perfil_cargo_bdp` | Perfiles de Cargo |
| `{ type: "perfil_cargo", action: "update", fila, row }` | Edición por índice de fila (1 = primera fila de datos) | Perfiles de Cargo |
| `{ type: "perfil_cargo", action: "delete", fila }` | Baja por índice de fila | Perfiles de Cargo |
| `{ type: "perfil_login", nombre, contrasena }` | Acceso. Responde `{ status, perfil: { config_personal_perfil } }` | Pantalla de acceso |
| `{ type: "perfil_config", nombre, config }` | Guarda la configuración personal del perfil | Configuración y tablero |
| `{ type: "perfil_log", nombre, entrada }` | Añade una línea a la bitácora del perfil | Todo el sistema |
| `{ type: "hiring_status", identificador, …registro }` | Estado de contratación | Documentación y tablero |
| `{ type: "referencia_laboral", action: "upsert" \| "delete", identificador, referencia }` | Referencias laborales | Perfil del postulante |
| `{ type: "kpi_snapshot", month, values }` | Foto mensual de indicadores | Tablero |
| `{ type: "proceso", action: "create" \| "update" \| "publish" \| "duplicate" \| "delete", … }` | Ciclo de vida de un proceso, en la hoja `Procesos` | Módulo de Procesos |
| `{ action: "list_procesos" }` · `{ action: "get_proceso", id }` | Lecturas del módulo de Procesos, por `GET` con parámetros | Módulo de Procesos |

**Los perfiles de cargo se direccionan por número de fila, no por identificador.**
La hoja no tiene columna de id, así que el frontend usa el índice entre las filas
de datos y **vuelve a leer el libro completo después de cada escritura** para que
los índices no envejezcan: un borrado sube todas las filas siguientes.

### Lo que el frontend da por cierto

- **Cualquier `POST` que este backend no reconozca lo interpreta como un alta.**
  Comprobado contra el despliegue real: un cuerpo con una acción de otro backend
  responde `{"status":"success","message":"Agregado"}`. No tiene registro de
  acciones ni validación de entrada, así que **no se le envían pruebas**: una
  llamada de más deja una fila en la hoja de postulantes. Por eso el verificador
  de la migración solo hace `GET` contra él, y por eso la prueba de escritura del
  paso 57 de la guía se hace desde el cuestionario, con un identificador
  reconocible y borrando la fila después.
- **`identificador` es la identidad de una persona** en todo el sistema. Una fila
  sin identificador se muestra pero no se puede comparar ni editar con
  seguridad; dos filas con el mismo identificador rompen la identidad. El
  verificador de la migración cuenta las primeras.
- **El `doGet` sirve desde la caché de Apps Script**, así que la lectura que sigue
  a un alta suele llegar *sin* la fila nueva. El frontend superpone cada
  escritura confirmada durante cinco minutos para que el postulante recién dado
  de alta no desaparezca de la pantalla antes de que el analista lo vea (era el
  origen de los duplicados).
- **Una escritura nunca se reintenta automáticamente.** Un reintento automático
  sobre un backend sin idempotencia duplica filas.

---

## Cómo comprobar que la copia migrada está completa

```bash
npm run migracion:verificar -- --talento=https://script.google.com/macros/s/…/exec
```

Comprueba que responde JSON y no la página de autorización, que el payload trae
las cuatro claves imprescindibles, cuántos postulantes hay y cuántas filas están
sin identificador. Solo lee.

Y la única prueba que demuestra que la **escritura** funciona es la del paso 57
de la guía: registrar un postulante de prueba, verlo en la hoja nueva y borrarlo.
