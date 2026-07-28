# Despliegue

## 1 · Qué se despliega y dónde

| Artefacto | Destino | Cómo |
| --- | --- | --- |
| Frontend | El hosting actual del panel (Vercel) | `npm run build` → `dist/` |
| Backend intermedio | Funciones serverless del mismo proyecto de Vercel | `api/evaluations/*.ts` (se despliegan con el frontend) |
| Backend de Evaluaciones | Proyecto propio de Google Apps Script | Copiar los 19 `.gs` + `appsscript.json` |
| Esquema de datos | Google Sheets | `configurarEvaluaciones()` |

Los tres son independientes: se puede desplegar el frontend con el proveedor de
demostración antes de tener el backend, y actualizar el backend sin volver a
desplegar el frontend.

## 2 · Orden recomendado (rollout por etapas)

```
Etapa 0  Frontend con datos de demostración   (hoy, sin backend)
           VITE_ASSESSMENTS_PROVIDER ausente o = mock
              ↓
Etapa 1  Backend en una hoja de PRUEBAS
           configurarEvaluaciones + ejecutarPruebasEvaluaciones
           Frontend local apuntando ahí
              ↓
Etapa 2  Backend en la hoja de PRODUCCIÓN, solo lectura verificada
           configurarEvaluaciones + verificarEsquemaEvaluaciones
           (opcional) migrarDesdeHojaEvaluaciones y revisar el informe
              ↓
Etapa 3  Frontend de producción con VITE_ASSESSMENTS_PROVIDER=google-apps-script
              ↓
Etapa 4  Portal de candidatos (fase siguiente)
           Cambiar «Quién tiene acceso» a «Cualquier persona»
```

La bandera `VITE_ASSESSMENTS_PROVIDER` es lo que hace posible este orden: solo
afecta al módulo de Evaluaciones, así que Procesos y el resto del sistema siguen
con su configuración actual.

## 3 · Variables de entorno del frontend

Solo `VITE_*` llega al navegador. **Ninguna es un secreto.**

| Variable | Valores | Por omisión | Efecto |
| --- | --- | --- | --- |
| `VITE_DATA_PROVIDER` | `mock` \| `google-apps-script` \| `supabase` | `mock` | Proveedor de todo el sistema (Procesos incluido). |
| `VITE_ASSESSMENTS_PROVIDER` | ídem | hereda el anterior | Proveedor **solo** de Evaluaciones. |
| `VITE_EVALUATIONS_API_URL` | URL `…/exec` | `SCRIPT_URL` de `constants.ts` | Web App de Evaluaciones. Endpoint público, no secreto. |
| `VITE_EVALUATIONS_ADMIN_API_URL` | URL \| `direct` | `/api/evaluations/admin` con el proveedor Apps Script | Endpoint que firma las operaciones administrativas. `direct` solo es válido con `EVALUATIONS_AUTH_MODE=google_identity`. |
| `VITE_FLAG_ASSESSMENTS_AUTOSAVE` | `true` \| `false` | `false` | Autoguardado complementario con debounce. Nunca publica. |
| `VITE_FLAG_ADVANCED_SIMULATIONS` | `true` \| `false` | `false` | Registra los contratos de simulación (editor pendiente). |
| `VITE_FLAG_CODE_QUESTIONS` | `true` \| `false` | `false` | `q_code`, `q_sql`. |
| `VITE_FLAG_SPREADSHEET_SIM` | `true` \| `false` | `false` | `q_spreadsheet_sim`. |
| `VITE_FLAG_INTERACTIVE_VIDEO` | `true` \| `false` | `false` | `q_interactive_video`. |
| `VITE_FLAG_CANDIDATE_PORTAL` | `true` \| `false` | `false` | Reservada para el portal. |

`.env.example` documenta todas. **Nunca** pongas claves de servicio, credenciales
de Supabase ni tokens con prefijo `VITE_`: irían al bundle.

### Cómo activar los datos de demostración

Quita `VITE_ASSESSMENTS_PROVIDER` (o ponlo en `mock`) y reinicia. El módulo mostrará
«Datos de demostración (local)» y un aviso explicativo. Los datos viven en
`localStorage` (`bdp-mock-assessments`) y se reinician con `resetMockData()`.

### Cómo activar la API real

```bash
VITE_ASSESSMENTS_PROVIDER=google-apps-script
VITE_EVALUATIONS_API_URL=https://script.google.com/macros/s/AKfycb…/exec
```

El indicador pasará a «Google Apps Script». Si la URL es incorrecta, el listado
muestra el error con botón de reintento en lugar de quedarse en blanco.

## 4 · Script Properties del backend

Se configuran en el proyecto de Apps Script, **no en el frontend**. Detalle en
`APPS_SCRIPT_SETUP.md §4`.

| Propiedad | Ejemplo | Nota |
| --- | --- | --- |
| `EVALUATIONS_SPREADSHEET_ID` | `1AbCdEf…XyZ` | Obligatoria en proyectos independientes. |
| `EVALUATIONS_ADMIN_SHARED_SECRET` | 32+ caracteres aleatorios | **Obligatoria** en el modo por omisión. Igual que la variable homónima de Vercel. |
| `EVALUATIONS_ADMIN_SHARED_SECRET_NEXT` | 32+ caracteres | Solo durante una rotación. |
| `EVALUATIONS_ADMIN_EMAILS` | `ana@banco.com, luis@banco.com` | Lista blanca de actores. |
| `EVALUATIONS_AUTH_MODE` | `server_secret` | O `google_identity`; `open_admin` solo para pruebas. |
| `EVALUATIONS_ALLOW_ANONYMOUS_ADMIN` | `false` | Debe ser exactamente `true` para habilitar `open_admin`. |
| `EVALUATIONS_AUDIT_ENABLED` | `true` | — |

## 4 bis · Variables del backend intermedio (Vercel)

Se configuran en `Vercel → Settings → Environment Variables`, **sin** prefijo
`VITE_`, y exigen un redespliegue para tomar efecto. Son secretos de servidor:
nunca aparecen en el bundle ni en los registros.

| Variable | Nota |
| --- | --- |
| `EVALUATIONS_APPS_SCRIPT_URL` | La misma `…/exec`. |
| `EVALUATIONS_ADMIN_SHARED_SECRET` | Debe coincidir con la Script Property homónima. |
| `EVALUATIONS_PANEL_PASSPHRASE` | 12+ caracteres. Es lo que teclea el reclutador. |
| `EVALUATIONS_SESSION_SECRET` | 32+ caracteres. Firma la cookie de sesión. |
| `EVALUATIONS_ALLOWED_ORIGINS` | Opcional, separada por comas. |

Si falta cualquiera, el panel recibe un error que **nombra la variable** (nunca su
valor) y ninguna operación administrativa se ejecuta.

## 5 · Lista de comprobación previa al despliegue

```
[ ] npx tsc -b --noEmit          → sin errores
[ ] npm test                     → 312/312
[ ] npm run check                → «Sin hallazgos»
[ ] npm run build                → correcto
[ ] git diff --stat              → sin archivos inesperados
[ ] Respaldo de la hoja de cálculo hecho
[ ] verificarEsquemaEvaluaciones() → ok: true
[ ] ejecutarPruebasEvaluaciones()  → todo «OK»
[ ] curl ?action=ping             → ok:true y adminAuth.configured:true
[ ] Secreto administrativo idéntico en Apps Script y en Vercel
[ ] /api/evaluations/admin sin sesión → adminSession:"required"
[ ] Con la frase de acceso, el listado administrativo carga
[ ] grep de fugas en el detalle público → «sin fugas»
[ ] Recorrido manual de los demás módulos sin cambios
```

## 6 · Después del despliegue (primeras 24 horas)

1. **`AuditLog`**: revisar que hay entradas y que ninguna tiene `status=error`
   repetido.
2. **`ProcessedRequests`**: si crece mucho más rápido que `AuditLog`, hay
   reintentos del cliente que conviene investigar.
3. **Ejecuciones de Apps Script** (`Ver → Ejecuciones`): buscar
   `LOCK_TIMEOUT` y errores de cuota.
4. **`Attempts`** con `grading_status=pending_manual_review`: si aparecen antes de
   que exista la interfaz de revisión, avisar al equipo de que esos resultados
   quedan pendientes por diseño.
5. **Consola del navegador** en el panel: no debe haber errores nuevos.

## 7 · Actualizar el backend

Apps Script **no sirve el código nuevo hasta que se crea una versión**:

```
Implementar → Administrar implementaciones → ✏️ → Versión: Nueva versión → Implementar
```

La URL `/exec` no cambia. Si el cambio toca encabezados, ejecuta después
`configurarEvaluaciones()` y `verificarEsquemaEvaluaciones()`.

## 8 · Actualizar el frontend

Despliegue normal del panel. Recuerda que el navegador puede tener el bundle
anterior en caché: un despliegue con hash de contenido lo resuelve, pero si un
usuario reporta comportamiento antiguo, pídele una recarga forzada.

## 9 · Compatibilidad con el Web App existente

`docs/backend/Code.gs` (postulantes, KPIs, documentación, perfiles de cargo,
Procesos y la hoja `Evaluaciones` heredada) **no se modificó**. Sigue sirviendo su
protocolo `{ status, message }` y su handler `type:"evaluacion"`. El módulo de
Evaluaciones ya no lo usa, pero cualquier integración externa que dependa de él
sigue funcionando.

Consecuencia práctica: **este despliegue no puede romper los demás módulos**,
porque no comparte proyecto de Apps Script, ni despliegue, ni versión.
