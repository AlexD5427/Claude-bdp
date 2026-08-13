# Backend principal (Google Apps Script)

Este es el **script del libro compartido**: el que atiende la dirección de
`SCRIPT_URL` (`src/constants.ts`) y del que dependen todos los módulos que **no
tienen hoja propia** — Postulantes, Comparador, Dashboard, Tablero, Cara a Cara,
Perfiles de Cargo, Procesos, el acceso por perfiles y la persistencia de
Documentación.

> [!IMPORTANT]
> `Code.gs` estuvo un tiempo fuera del repositorio (vivía en `docs/backend/`, se
> borró al añadir el backend de Evaluaciones y el README seguía enlazándolo).
> Se restaura aquí, sin cambios de lógica, porque es la pieza de la que depende
> todo el sistema: sin ella versionada no se puede razonar sobre un fallo de
> guardado ni reproducir el contrato en pruebas.

Los otros dos backends —cada uno con **su propio libro y su propio proyecto**—
viven en [`../documentacion/`](../documentacion/) y
[`../evaluaciones/`](../evaluaciones/).

## Contrato

```
GET  /exec                → { candidatos, competencias, arquetipos_disc,
                              auxiliares:{ cargos_bdp, gerencias_bdp, agencias_bdp,
                                           modalidad_reclutamiento, estado_proceso },
                              perfiles, perfiles_cargo,
                              espejo_base, espejo_ultimo, sincronizado_en }
GET  /exec?nocache=1      → ignora la caché de 45 s y relee las hojas
GET  /exec?part=ligero    → omite espejo_base / espejo_ultimo
GET  /exec?action=…       → lecturas de Procesos / Evaluaciones ({ status, rows|row })

POST /exec                → enrutado por el campo `type` del cuerpo JSON
```

| `type` | Efecto |
|---|---|
| *(ausente)* | **Alta / edición / baja de postulante** (`action`: `update`, `delete`, o alta si falta) |
| `perfil_cargo` | CRUD de `perfil_cargo_bdp` por número de fila |
| `documentacion`, `documentacion_email` | Expedientes y bitácora de avisos |
| `referencia_laboral` | Panel de referencias del perfil |
| `perfil_login`, `perfil_config`, `perfil_log` | Acceso, preferencias y bitácora por perfil |
| `proceso`, `evaluacion` | Hojas `Procesos` / `Evaluaciones` con control de versión |
| `hiring_status`, `kpi_snapshot` | **Se ignoran** (`{status:"ignored"}`): reservados, no escriben nada |

Toda respuesta es `{ status: "success" | "error" | "ignored", message? }`. El
frontend **interpreta ese estado**: ver `postToSheet` en
`src/context/TalentDataContext.tsx`. Un `error` ya no se muestra como éxito.

### Dos reglas que no se pueden romper desde el frontend

1. **`redirect: "follow"` en cada `fetch`.** Google responde con un `302`; sin
   seguirlo, en producción (Vercel) la llamada termina en `404`.
2. **`Content-Type: text/plain;charset=utf-8` en los POST.** Con
   `application/json` el navegador manda una petición de comprobación previa
   (preflight) que un despliegue estándar de Apps Script no sabe responder.

El sondeo de escritura del diagnóstico
(`src/components/config/ConnectionDiagnostics.tsx`) usa `type:"kpi_snapshot"`
justamente porque es el único que recorre todo ese camino **sin escribir nada**.
Un `type` desconocido caería en el caso por omisión, que **da de alta un
postulante**: nunca lo use para probar la conexión.

## Despliegue

1. Libro de cálculo → **Extensiones → Apps Script**.
2. Pegue **todo** `Code.gs` (reemplaza por completo el script anterior).
3. **Implementar → Administrar implementaciones → Editar → Nueva versión**, con
   acceso «**Cualquiera con el enlace**».
4. Una sola vez, para los recordatorios de documentación:
   ejecute `instalarTriggersDocumentacion()`.

Si el paso 3 se hace mal, el síntoma es característico y el diagnóstico de
Configuración lo nombra: la lectura funciona pero la escritura devuelve la
página de acceso de Google en lugar de JSON.

## Hojas que espera

| Hoja | Para qué |
|---|---|
| `Registro_Postulantes` (o la 1.ª pestaña) | Postulantes. La cabecera manda: el alta mapea por nombre de columna |
| `Auxiliar` | Catálogos: `competencias`, `arquetipo_disc`, `cargos_bdp`, `gerencias_bdp`, `agencias_bdp`, `modalidad_reclutamiento`, `estado_proceso` |
| `Perfiles_y_Configuracion` | Acceso, preferencias por perfil y bitácora |
| `perfil_cargo_bdp` | Perfiles de cargo (22 columnas; se crea si falta) |
| `Espejo_Base`, `Espejo_Ultimo_Registro` | Historial y último estado de cada proceso |
| `Documentación`, `Avisos Documentación` | Expedientes y avisos enviados |
| `Referencias_Laborales` | Referencias laborales del perfil |
| `Procesos`, `Evaluaciones` | ProcessOS / AssessmentOS (se crean si faltan) |

## Riesgo conocido: identificadores repetidos

`handlePostulante_` localiza la fila a editar (`action:"update"`) por su
identificador y actúa sobre **la primera coincidencia**. Si la hoja tiene dos
filas con el mismo identificador, editar a la segunda persona sobrescribe a la
primera, y el script no tiene forma de distinguirlas.

El frontend ya no colabora con ese error: desambigua las filas para poder
compararlas y verlas por separado, marca la clave repetida en la lista de
Postulantes y en el buscador del Comparador, y avisa en el cuestionario de
edición antes de guardar (ver `src/lib/candidates.ts`). **La corrección
definitiva es de datos**: el identificador debe ser único en la hoja.

## Caché

El `GET` completo se guarda en `CacheService` por tramos de 90 KB durante 45 s, y
se invalida en cada escritura que cambia lo que el `GET` devuelve. Por eso, tras
registrar a alguien, el refresco inmediato del frontend ya trae la fila nueva.
