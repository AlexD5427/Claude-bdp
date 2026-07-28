# Rollback

> Para revertir el **despliegue de Vercel** (promover el anterior) y para **rotar
> el secreto compartido sin ventana de caída**, ver
> [`REPARACION_2026-07.md §6`](./REPARACION_2026-07.md#6--rollback-y-rotación).

Tres capas independientes, con tiempos de reversión muy distintos. Elige la más
barata que resuelva el problema.

## Resumen

| Síntoma | Capa a revertir | Tiempo | Pérdida de datos |
| --- | --- | --- | --- |
| El módulo falla o muestra datos raros, pero el resto del panel está bien. | **Frontend: volver al proveedor de demostración.** | Segundos | Ninguna (los datos siguen en Sheets). |
| El backend devuelve errores tras una actualización. | **Apps Script: versión anterior del despliegue.** | Segundos | Ninguna. |
| Se escribieron datos incorrectos en la hoja. | **Sheets: historial de versiones o la copia de respaldo.** | Minutos | Lo escrito después del punto de restauración. |
| Todo el cambio hay que retirarlo. | **Git: revertir la PR.** | Minutos | Ninguna en Sheets. |

## 1 · Revertir solo el módulo (más rápido y seguro)

```bash
# quitar del entorno del panel:
VITE_ASSESSMENTS_PROVIDER
```

Al desaparecer esa variable, Evaluaciones vuelve a `MockAssessmentService` (datos
de demostración locales) y **no toca la hoja de cálculo**. El resto del sistema no
cambia, porque `VITE_ASSESSMENTS_PROVIDER` solo afecta a este módulo.

Es la reversión adecuada cuando el problema es de interfaz o de integración y no
quieres tocar el backend.

## 2 · Revertir el despliegue de Apps Script

```
Apps Script → Implementar → Administrar implementaciones → ✏️ (editar)
  → Versión: seleccionar la versión ANTERIOR
  → Implementar
```

- La URL `/exec` **no cambia**, así que el frontend no necesita nada.
- Ninguna versión se borra: puedes ir y volver.
- Ejecuta después `verificarEsquemaEvaluaciones()`: si la versión anterior esperaba
  menos columnas, las de más aparecen como `extraHeaders`, que **no es un error**
  (el backend lee por nombre e ignora las columnas que no conoce).

## 3 · Revertir datos de la hoja de cálculo

### 3.1 · Historial de versiones (preferido)

```
Archivo → Historial de versiones → Ver historial de versiones
  → elegir el punto anterior al problema → Restaurar esta versión
```

Restaura **toda la hoja de cálculo**, así que también revierte lo que otros
módulos escribieron en ese intervalo (Procesos, Documentación, KPIs…). Antes de
restaurar, comprueba en el historial si hubo escrituras de otros módulos.

### 3.2 · Copia de respaldo

Si seguiste `GOOGLE_SHEETS_SETUP.md §2` tienes
`RESPALDO Evaluaciones AAAA-MM-DD`. Para volver a ella:

1. Abre la copia y verifica que contiene lo que esperas.
2. **No la renombres como la original.** En su lugar, apunta el backend a ella:
   cambia `EVALUATIONS_SPREADSHEET_ID` al id de la copia.
3. Comprueba con `verificarEsquemaEvaluaciones()` y con
   `curl ?action=listPublicAssessments`.
4. Cuando confirmes que todo funciona, decide si la copia pasa a ser la hoja
   oficial.

Esto evita el error clásico de sobrescribir la hoja buena con la copia.

### 3.3 · Deshacer solo lo del módulo Evaluaciones

Como todas las pestañas del módulo son **nuevas** (`Assessments`, `Sections`,
`Questions`, `Options`, `Versions`, `Attempts`, `Answers`,
`ProcessedRequests`, `AuditLog`), se pueden vaciar sin afectar a ningún otro
módulo:

1. Duplica cada pestaña (clic derecho → *Duplicar*) para conservar la evidencia.
2. En la pestaña original selecciona de la **fila 2** hacia abajo y borra las filas.
   **No borres la fila 1**: son los encabezados.
3. Ejecuta `verificarEsquemaEvaluaciones()` para confirmar que el esquema sigue
   intacto.

Si solo quieres retirar los datos de prueba:

```
limpiarDatosDePruebaEvaluaciones()
```

Borra únicamente lo que tiene el marcador `[PRUEBA]` en el título.

### 3.4 · Deshacer una migración desde la hoja heredada

`migrarDesdeHojaEvaluaciones()` **no modifica la hoja `Evaluaciones` original**, así
que deshacer la migración es borrar las filas creadas:

1. En `AuditLog`, filtra `action = migrateLegacyAssessment` y anota los
   `entity_id`.
2. Borra en `Assessments`, `Sections`, `Questions` y `Options` las filas con esos
   `assessment_id`.
3. La hoja `Evaluaciones` sigue siendo la fuente de verdad, intacta.

## 4 · Revertir el cambio de código

```bash
# Opción 1: revertir el merge de la PR (recomendada, conserva la historia)
git revert -m 1 <sha-del-merge>

# Opción 2: si la PR aún no se ha mergeado
# simplemente no la mergees; la rama queda para retomarla
```

Qué se recupera al revertir:

| Se recupera | No se recupera |
| --- | --- |
| El constructor anterior (`BuilderCanvas` + `BuilderInspector`). | Nada de la hoja de cálculo: los datos escritos se quedan ahí (inofensivos, en pestañas que el código anterior ignora). |
| El adaptador heredado `type:"evaluacion"` para Evaluaciones. | — |
| Las 89 pruebas originales (que también siguen pasando en esta rama). | — |

**No se necesita `git push --force` ni ningún comando destructivo.** Nunca los uses
en esta rama.

## 5 · Qué NO hay que hacer

- ❌ Borrar pestañas de la hoja de cálculo: el backend las recrea vacías y se
  pierde la evidencia. Vacía filas, no elimines pestañas.
- ❌ Renombrar o reordenar encabezados «para arreglarlo»: provoca `SCHEMA_ERROR`.
  Ejecuta `configurarEvaluaciones()`, que solo añade lo que falta.
- ❌ Modificar `snapshot_json` a mano: es un snapshot inmutable con `checksum`. Si
  hay que cambiar una evaluación publicada, publica una versión nueva.
- ❌ Activar `EVALUATIONS_ALLOW_ANONYMOUS_ADMIN=true` para «desbloquear» algo.
  Deja el backend abierto y todas las respuestas marcadas como insegura.
- ❌ `git push --force` sobre la rama de la PR.

## 6 · Verificación posterior a cualquier rollback

```
[ ] verificarEsquemaEvaluaciones() → ok: true
[ ] curl ?action=ping → ok:true
[ ] El módulo Evaluaciones carga y muestra el origen de datos esperado
[ ] Procesos, Postulantes, Perfiles y Documentación siguen funcionando
[ ] AuditLog tiene la entrada del último cambio
```
