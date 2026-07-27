# Revisión de código y seguridad

Se solicitó una revisión automatizada de la PR (`request_copilot_review` sobre
[#15](https://github.com/AlexD5427/Claude-bdp/pull/15)) y, tras esperar unos
minutos, no devolvió comentarios. El escaneo de secretos alojado tampoco está
disponible: la API responde *«Repository does not have GitHub Advanced Security
enabled»*.

Por eso la revisión se hizo **a mano sobre el diff completo** (108 archivos), con
tres focos: superficie de seguridad, correctitud de la concurrencia y
acoplamientos que el compilador no detecta. Los diez hallazgos confirmados están
abajo con su corrección. Todos están corregidos en esta rama; los dos primeros
llevan además una prueba de regresión propia.

## Hallazgos confirmados

### F1 · Dos acciones administrativas sin clasificar (seguridad · alta)

`rollbackAssessment` y `resumeAssessment` estaban enrutadas en
`EVAL_WRITE_ACTIONS` pero **no aparecían en `EVAL_ADMIN_ACTIONS` ni en
`EVAL_PUBLIC_ACTIONS`**. `evalAuthorize_` clasifica así:

```javascript
if (!evalIsAdminAction_(action)) {
  if (EVAL_PUBLIC_ACTIONS[String(action)] !== true) {
    throw evalError_('UNSUPPORTED_ACTION', 'La acción solicitada no existe.');
  }
  // …se trata como pública: SIN autorización
}
```

Consecuencias:

1. **Funcional**: las dos acciones eran inalcanzables. El botón «Revertir
   asignaciones futuras» habría respondido «La acción solicitada no existe».
2. **Seguridad**: el fallo es del tipo peligroso. Si alguien hubiera «arreglado»
   el síntoma añadiéndolas a la lista equivocada, dos escrituras administrativas
   habrían quedado ejecutables **de forma anónima**.

**Corrección.** Se añadieron a `EVAL_ADMIN_ACTIONS` y se introdujo
`evalClassifyActions_()`, que compara las acciones enrutadas con las clasificadas
y devuelve `unclassified`, `duplicated` y `orphan`.

**Regresión.** `appsScript.sanitization.test.ts › toda acción del enrutador está
clasificada en EXACTAMENTE una lista` exige los tres arreglos vacíos y además
verifica, nombre por nombre, que las dieciséis acciones administrativas están
marcadas como `admin`. Una segunda prueba comprueba que `rollbackAssessment` y
`resumeAssessment` responden `NOT_FOUND` (autorizadas y enrutadas) y no
`UNSUPPORTED_ACTION` ni `FORBIDDEN`.

### F2 · El listado público exponía el conteo de preguntas del borrador (seguridad · media)

`evalListPublicAssessments_` usaba `Assessments.question_count`, que cuenta las
preguntas activas del **borrador**. Dos problemas:

- **Exactitud**: si el reclutador publica una evaluación de 2 preguntas y luego
  agrega 5 al borrador, el portal habría anunciado 7 preguntas y servido 2.
- **Fuga**: revela el tamaño de trabajo no publicado.

**Corrección.** El conteo se toma de la fila de `Versions` apuntada por
`current_published_version_id`, mediante `evalPublishedQuestionCount_`.

**Regresión.** `› el listado público NO expone el conteo de preguntas del
borrador` publica con 2 preguntas, agrega una tercera al borrador y comprueba que
el listado público sigue informando 2.

### F3 · `shared/flags.ts` arrastraba componentes de React (arquitectura · media)

Para resolver la URL del Web App, `flags.ts` importaba `SCRIPT_URL` de
`src/constants.ts`… y `constants.ts` importa `lucide-react` y
`components/icons/CustomIcons.tsx`.

`flags.ts` lo importa lógica pura: los proveedores, `syncState`, el registro de
tipos. Con ese import, cualquiera de esos módulos arrastraba los iconos del dock.

**Corrección.** `flags.ts` expone `ASSESSMENTS_API_URL_OVERRIDE` (o `null`) y el
respaldo a `SCRIPT_URL` se resuelve en `api/transport.ts`, que es el único lugar
que necesita conocerlo y que ya vive dentro del módulo.

> Honestidad sobre el impacto: es una corrección de **acoplamiento**, no una
> victoria en bytes. Con los chunks actuales no se aprecia diferencia medible en
> el tamaño del bundle; el valor está en que `flags.ts` vuelve a ser importable
> desde lógica pura sin efectos colaterales.

### F4 · El servicio dependía de `this` (robustez · baja)

`AppsScriptAssessmentService.create` llamaba a `this.updateDraft(...)`. Funciona
porque el llamador hace `repo().create(...)`, pero se rompe en silencio si alguien
desestructura (`const { create } = getAssessmentRepository()`).

**Corrección.** Referencia explícita a `appsScriptAssessmentService.updateDraft`.

### F5 · Constante de retención declarada y nunca usada (claridad · baja)

`EVAL_CONFIG.LIMITS.AUDIT_RETENTION_ROWS: 20000` sugería una purga automática de
`AuditLog` que **no existe**. Una constante así es peor que no tenerla: hace
pensar que el problema está resuelto.

**Corrección.** Se eliminó. La rotación de la bitácora es manual y así queda
declarado en `DEPLOYMENT.md §6`.

### F6 · Las notas de versión sobrevivían al diálogo (UX · baja)

`PublishDialog` guardaba `notes` en estado y no lo limpiaba al cerrar: al abrirlo
de nuevo aparecían las notas de la publicación anterior, listas para adjuntarse a
una versión distinta.

**Corrección.** `useEffect` que limpia `notes` cuando `open` pasa a `false`.

### F7 · Etiqueta construida por concatenación (UX · baja)

`QuestionProperties` mostraba `L.builder.inspectorFields.label + " (código)"`, que
producía «Etiqueta (código)» — confuso y contrario a la regla del proyecto de no
inlinear texto visible.

**Corrección.** Claves propias `L.builder.editor.code` («Código de la pregunta») y
`codeHint` («Opcional. Debe ser único dentro de la evaluación.»).

### F8 · Tipos laxos en `SectionManager` (tipos · baja)

Estaba declarado con un tipo estructural improvisado
(`{ sections: { id, title, blocks: unknown[] }[] }`) y
`dispatch: (action: Parameters<typeof builderReducer>[1]) => void`.

**Corrección.** `content: AssessmentContent` y `dispatch: (action: BuilderAction) => void`.

### F9 · `async` sin `await` (claridad · baja)

`handlePublish` estaba marcada `async` sin esperar nada, lo que obligaba a
`onPublish={() => void handlePublish()}` en el llamador.

**Corrección.** Función síncrona y `onPublish={handlePublish}`.

### F10 · Publicar desde el listado no llevaba a los errores (UX · media)

El menú de fila permite publicar sin abrir el constructor. Si el servidor rechaza
la publicación, el usuario recibía un `toast` («La evaluación no puede publicarse
todavía») **sin ninguna forma de saber qué falta**: el panel de revisión está
dentro del constructor.

**Corrección.** Si el rechazo trae hallazgos, se abre la evaluación en el
constructor tras avisar, de modo que el usuario aterrice donde puede corregir.

## Revisión de seguridad · resultado

| Comprobación | Resultado |
| --- | --- |
| Secretos en el código, la documentación y `.env.example` | Sin hallazgos (`npm run check`, cinco patrones: clave de API de Google, clave privada, `sk-…`, JWT, credencial literal). |
| Claves de respuesta en la ruta pública | Sin hallazgos: regla estática + 12 pruebas de saneamiento en el servidor + 5 en el frontend. |
| Acciones sin clasificar o mal clasificadas | **F1 corregido**, con prueba de regresión. |
| Fuga de datos no publicados | **F2 corregido**, con prueba de regresión. |
| `fetch` fuera de la capa de transporte | Sin hallazgos. |
| `any` explícito o `@ts-ignore` | Sin hallazgos. |
| Mocks alcanzables desde producción | Sin hallazgos: solo por `MockAssessmentService` con configuración explícita. |
| Datos de calificación del cliente | Descartados antes de escribir; prueba con datos manipulados. |
| Contaminación de prototipo vía JSON | `evalPlainObject_` descarta `__proto__`, `constructor` y `prototype`. |
| Inyección de fórmulas | `guardCsvCell` / `csvField`; el backend nunca escribe JSON iniciado por `=`, `+`, `-` o `@`. |
| HTML del backend renderizado | Ninguno: no hay `dangerouslySetInnerHTML` en el módulo. |
| Datos personales en la bitácora | Lista negra explícita en `evalSafeMetadata_`. |
| Escaneo de secretos alojado (GHAS) | **No disponible** en el repositorio. Sustituido por la regla estática. |

## Verificación posterior a las correcciones

```
npx tsc -b --noEmit   → sin errores
npm run build         → correcto (2 232 módulos)
npm test              → 23 archivos, 265 pruebas, todas en verde
npm run check         → «Sin hallazgos»
```

Las tres pruebas nuevas (dos de F1, una de F2) elevan el total de **262 a 265**.
