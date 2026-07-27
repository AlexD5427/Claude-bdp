# Arquitectura de experiencia

## 1 · El problema que resuelve este rediseño

El constructor anterior editaba el *contenido* de una evaluación y nada más. Un
reclutador podía crear una evaluación, llenarla de preguntas… y no tenía forma de
ponerle título, duración ni nota mínima. Al intentar publicar recibía un contador
de errores sin manera de saber cuál era el problema ni dónde. Con veinte preguntas
el lienzo era una lista plana.

Las tres preguntas que la nueva experiencia contesta siempre:

1. **¿Dónde estoy?** Barra superior fija con nombre, código, estado y versión, más
   una navegación de cuatro pasos con contador de errores por paso.
2. **¿Qué pasa con mis cambios?** Un indicador de guardado con siete estados,
   etiqueta, icono y `aria-live`.
3. **¿Qué me falta para publicar?** Un panel de revisión que agrupa los hallazgos
   y lleva de cada uno al campo exacto.

## 2 · Navegación

Cuatro pasos, **libremente navegables**. No es un asistente lineal: el usuario
puede saltar a cualquier paso, guardar en cualquier momento y volver atrás.

| Paso | Contiene | Por qué está separado |
| --- | --- | --- |
| **Configuración general** | Título, descripción, propósito, instrucciones públicas e internas, categoría, etiquetas, metadatos. | Es lo que define *qué* es la evaluación. Se hace una vez. |
| **Preguntas** | Índice + editor de la pregunta activa + propiedades. | Es donde se pasa el 90 % del tiempo, así que es el paso inicial al abrir. |
| **Configuración de evaluación** | Duración, nota mínima, tipo de acceso y explicación de cómo se califica. | Decisiones de aplicación que no deben estorbar mientras se redactan preguntas. |
| **Revisión** | Hallazgos + resumen completo. | Es el paso previo a publicar, y también el destino al que se llega cuando la publicación se bloquea. |

Cada paso muestra su propio contador de errores bloqueantes, así que nunca hay que
adivinar en qué pantalla está el problema. A la derecha, una barra de progreso de
configuración (título + instrucciones + preguntas + validez).

## 3 · El paso de preguntas

```
┌─ Índice (16rem, contraíble) ─┬─ Pregunta activa (flexible) ─┬─ Propiedades (18rem) ─┐
│ Búsqueda                      │ Encabezado: nº, tipo,        │ Modo de puntaje       │
│ Filtros (≥8 preguntas)        │   calificación, duplicar,    │ Puntos y peso         │
│                               │   eliminar                   │ Competencia           │
│ Sección 1 · 12 pregunta(s)    │ Enunciado                    │ Cómo se calificará    │
│  ① Pregunta uno      ✔        │ Tipo · Texto de ayuda        │ Código                │
│  ② Pregunta dos      ⚠        │ Obligatoria                  │                       │
│  ③ Pregunta tres     👤       │ Opciones (una correcta)      │                       │
│  ▸ Agregar pregunta           │ Valor esperado / tolerancia  │                       │
│                               │ ▸ Configuración avanzada     │                       │
│                               │ Vista previa del bloque      │                       │
└───────────────────────────────┴──────────────────────────────┴───────────────────────┘
```

### El índice

- **Número continuo** que ignora los bloques de contenido (un separador no es la
  pregunta 4).
- **Resumen del enunciado** truncado, con el tipo debajo.
- **Estado con icono e etiqueta accesible**: ✔ Completa, ⚠ Incompleta,
  👤 La califica una persona.
- **Etiqueta «Obligatoria»** cuando corresponde.
- **Búsqueda** por enunciado, código o nombre del tipo.
- **Filtros** (`Todas` / `Incompletas` / `Obligatorias` / `Revisión manual`) que
  **solo aparecen a partir de ocho preguntas**: en una evaluación corta serían
  ruido.
- **Reordenamiento** con botones «mover arriba / abajo» que aparecen al pasar el
  cursor o al enfocar con el teclado. No depende de arrastrar y soltar.
- **Contraíble**, para dar todo el ancho al editor.

### La pregunta activa

Se monta **solo la pregunta seleccionada**. Es lo que permite trabajar con
cientos de preguntas sin que editar una opción vuelva a renderizar el documento.
Cuando no hay ninguna seleccionada, el área central muestra el gestor de secciones
(crear, renombrar, mover, eliminar, añadir bloque), de modo que esa capacidad no
ocupa espacio permanente.

La configuración poco frecuente (descripción, etiqueta accesible, descripción
larga, texto alternativo de la multimedia) vive en un `<details>` de
«Configuración avanzada»: revelación progresiva, no ocultación.

### Estados imposibles, imposibles

- En los tipos de respuesta única las opciones correctas son **radios**: marcar una
  desmarca las demás. Lo garantiza el reducer, no el componente.
- Verdadero/Falso usa opciones fijas: no se pueden agregar, quitar ni renombrar;
  solo elegir la correcta y restaurarlas si se dañaron por una importación.
- El botón «Agregar opción» se deshabilita al llegar al máximo del tipo.
- Cambiar de tipo conserva el enunciado y aplica las opciones por omisión del tipo
  nuevo, avisando de que la configuración específica se restablece.

## 4 · Flujo de creación guiada

```
Crear  →  «Empieza por el título en Configuración general»  (mensaje al crear)
       →  General:      título, instrucciones
       →  Preguntas:    agregar desde la biblioteca, editar, ordenar
       →  Configuración: duración (con estimación sugerida), nota mínima
       →  Revisión:     corregir hallazgos
       →  Publicar:     confirmación con resumen y notas de versión
```

Ningún paso es obligatorio para guardar. Un borrador puede estar incompleto por
diseño: solo la publicación exige completitud. Las ayudas son breves
(`hint` bajo cada campo, dos recuadros informativos en el paso de configuración) y
no permanentes.

## 5 · Manejo de evaluaciones extensas

| Técnica | Efecto |
| --- | --- |
| Un solo editor montado | Editar una opción no re-renderiza 150 preguntas. |
| Índice de filas ligeras | Cada entrada es un botón con dos líneas de texto y un icono. |
| Búsqueda + filtros en el índice | Llegar a la pregunta 87 sin desplazarse. |
| Validación memorizada | `buildPublishChecklist` se recalcula solo al cambiar el contenido. |
| Panel contraíble | El editor puede ocupar todo el ancho. |
| Contadores por paso | Se sabe dónde están los problemas sin recorrerlos. |

Prueba de humo incluida: `abre una evaluación extensa sin montar todos los
editores` monta 150 preguntas y comprueba que el índice las lista y que no hay
ningún editor montado.

## 6 · Flujo de revisión

Los hallazgos se agrupan por severidad y cada uno declara su destino:

```
{ severity, code, message, hint, target: { area, sectionId, questionId, optionId, field } }
```

Al pulsar un hallazgo el constructor:

1. cambia al paso correspondiente (`general`, `questions` o `settings`);
2. selecciona la pregunta afectada y abre el índice si estaba contraído;
3. marca el campo con `focusField`, que aplica `autoFocus` y un anillo cian.

El resumen lateral muestra título, código público, versión, estado, duración, nota
mínima, preguntas totales / válidas / incompletas / obligatorias, cuántas se
calificarán automáticamente, cuántas requieren revisión humana, los tipos
utilizados y las instrucciones. Los valores ausentes se muestran como «Sin límite
de tiempo» o «Sin nota mínima», **nunca como cero**.

Si el servidor rechaza la publicación, sus hallazgos aparecen en el mismo panel en
una sección propia («El servidor rechazó la publicación»), con el código de error.
Los códigos coinciden con los locales a propósito.

## 7 · Flujo de publicación

1. «Publicar» comprueba la lista local. Con errores: lleva a Revisión y avisa.
2. Sin errores: diálogo de confirmación con el resumen de lo que se publicará
   (preguntas, automáticas, manuales, duración, nota mínima), aviso de si el
   cambio creará una versión mayor, y campo de notas de versión.
3. Al confirmar: se guarda el borrador y luego se publica. Si el servidor
   rechaza, se muestran sus hallazgos.
4. El botón «Publicar» es el único con degradado esmeralda; cuando está bloqueado
   pasa a gris y expone la razón con `aria-describedby`.

## 8 · Vista previa

- Trabaja con el **borrador local**, incluso sin guardar.
- **No crea un intento**, no guarda respuestas y no calcula ninguna nota oficial.
- Pasa por el **mismo saneador público** que usará el portal de candidatos.
- Un aviso permanente lo dice con palabras: «Vista previa con datos locales sin
  publicar. No crea un intento ni guarda respuestas».
- Simula escritorio, tableta y móvil cambiando el ancho del panel.
- Interruptor administrativo «Mostrar respuestas correctas» que cambia a una vista
  aparte (contenido local, no el DTO) y avisa: «Las respuestas correctas nunca
  forman parte del DTO público».

## 9 · Prevención de pérdida de datos

| Riesgo | Protección |
| --- | --- |
| Recargar o cerrar la pestaña | `beforeunload` mientras haya cambios pendientes. |
| Pulsar «Volver» | Diálogo «¿Salir sin guardar?» con «Seguir editando» como salida segura. |
| Caída del navegador | Copia del documento en `localStorage` con debounce de 600 ms; al volver se ofrece recuperarla, indicando cuándo se guardó. |
| Doble clic en «Guardar» | Token de petición en vuelo: la segunda llamada se ignora. |
| Guardado simultáneo de dos personas | Concurrencia optimista: el servidor responde `CONFLICT` y el indicador pasa a «Conflicto de versión» con botón de reintento. |
| Reintento manual duplicando el efecto | El `requestId` se reutiliza; el servidor detecta la repetición y no repite la escritura. |

El borrador local **no es la base de datos**: se borra en cuanto el guardado real
tiene éxito, y solo se ofrece recuperar si pertenece a la misma evaluación y a la
misma versión de entidad.

## 10 · Listado

- Encabezado con la acción principal «Nueva evaluación» (degradado corporativo).
- Búsqueda por nombre, código público y categoría, con debounce.
- Panel de filtros por estado, publicación y categoría, con contador y «Limpiar
  filtros».
- Ordenamiento: actualización reciente (por omisión), más antigua, nombre,
  más preguntas.
- Tres vistas: tarjetas, tabla y resumen (`Segmented`, patrón de Procesos).
- Estadísticas calculadas sobre los datos cargados: total, publicadas, borradores,
  archivadas. **Ninguna métrica inventada.**
- **Origen de datos visible siempre**: «Datos de demostración (local)» o «Google
  Apps Script», más un aviso explicativo en modo demostración.
- Acción primaria contextual por tarjeta: «Editar borrador», «Reanudar borrador»,
  «Ver evaluación publicada» o «Detalles» según el estado.
- Menú de acciones **en tarjetas y en tabla**, filtrado por permiso **y por
  estado**: no se ofrece pausar algo que no está publicado.
- Confirmación explícita para archivar y duplicar, aclarando que archivar no borra
  datos ni intentos.
- Panel de resultados de solo lectura, que dice con claridad cuándo el proveedor
  no tiene intentos en lugar de mostrar ceros.

## 11 · Accesibilidad

| Requisito | Cómo se cumple |
| --- | --- |
| Etiquetas | Todos los campos usan `Field` + `htmlFor`, o `aria-label` cuando el control es un icono. |
| Errores asociados | `Field error` renderiza el mensaje bajo el campo; los hallazgos de opciones usan `role="alert"`. |
| Gestión del foco | `focusField` aplica `autoFocus` al llegar desde la revisión; `GlassDialog` enfoca el botón de confirmación. |
| Teclado | Toda acción es un `<button>` real. Reordenar tiene botones dedicados. Los diálogos cierran con `Escape`. |
| Anuncios | `SaveStatus` usa `role="status"` + `aria-live="polite"`; los toasts viven en una región `aria-live`. |
| Estados de alternancia | `aria-pressed` en los conmutadores de viewport y del modo administrativo; `aria-expanded` en el panel de filtros, el índice y las secciones desplegables. |
| Paso actual | `aria-current="step"` en la navegación. |
| Progreso | `role="progressbar"` con `aria-valuenow`. |
| Sin color solo | Todo estado lleva etiqueta e icono (regla del sistema de diseño). |
| Nombres únicos | Se corrigió la duplicación: la acción del encabezado se llama «Revisar» y el paso «Revisión». |
| Movimiento reducido | Ver `MOTION_SYSTEM.md`. |

## 12 · Responsive

| Ancho | Comportamiento |
| --- | --- |
| ≥ 1024 px | Tres columnas: índice, editor, propiedades. |
| 768–1023 px | El índice se apila sobre el editor; el panel de propiedades se oculta y su contenido sigue accesible en «Configuración avanzada». |
| < 768 px | Una columna. La barra superior envuelve en dos filas; las etiquetas de texto de los botones se ocultan y quedan sus iconos con `aria-label`. |

La barra superior es `sticky top-2` y envuelve con `flex-wrap`, así que no se
recorta cuando el dock está arriba. Se eliminó la altura fija
`h-[calc(100vh-8rem)]` del diseño anterior, que no tenía en cuenta que el dock
puede estar en cualquier borde.
