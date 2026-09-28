# Inventario · qué vive en la cuenta de Google

Lista completa de lo que hay que mover para cambiar de cuenta. Está escrita para
usarse como hoja de control: cada fila se marca cuando queda hecha y verificada.

El procedimiento está en
[`MIGRACION_CUENTA_GOOGLE.md`](MIGRACION_CUENTA_GOOGLE.md). Aquí solo está el
*qué*, no el *cómo*.

---

## 1 · Lo que sostiene el sistema

El sistema no tiene servidor propio. Su base de datos son **libros de Google
Sheets** y su servidor son **proyectos de Google Apps Script** publicados como
aplicación web. Son tres backends independientes, cada uno con su libro, su
proyecto y su despliegue:

| # | Backend | Qué guarda | Dónde está su código |
|---|---|---|---|
| 1 | **Talento** («general») | Postulantes, competencias, arquetipos DISC, catálogos auxiliares, perfiles de acceso, perfiles de cargo, procesos, referencias laborales, histórico de indicadores | ⚠️ **No está en el repositorio.** Solo existe dentro de la cuenta de Google |
| 2 | **Documentación** | Expedientes de incorporación: 19 hojas normalizadas + el libro anual `CONTROL INGRESOS <año>` | [`apps-script/documentacion/`](../../apps-script/documentacion/) (22 archivos) |
| 3 | **Evaluaciones** | Evaluaciones, versiones publicadas, intentos, resultados, auditoría (13 hojas) | [`apps-script/evaluaciones/`](../../apps-script/evaluaciones/) (24 archivos) |

> **El primero es el riesgo real de esta migración.** El código de los backends 2
> y 3 está versionado: si se pierde la cuenta, se vuelve a pegar y se reinstala.
> El del talento **solo existe en la cuenta que se quiere abandonar**. El paso 2
> de la guía lo extrae y lo guarda en `apps-script/talento/`; hasta que eso esté
> hecho, perder el acceso a la cuenta antigua significa reescribirlo desde el
> contrato documentado en [`apps-script/talento/README.md`](../../apps-script/talento/README.md).

---

## 2 · Archivos de Drive

| Archivo | Tipo | Cómo se localiza | Marcado |
|---|---|---|---|
| Libro del talento | Hoja de cálculo | Es el libro del proyecto de Apps Script que responde en `SCRIPT_URL` | ☐ |
| Libro de Documentación | Hoja de cálculo | `documentacion.estado` devuelve su nombre y su URL; también la propiedad `DOC_SPREADSHEET_ID` | ☐ |
| Libro de Evaluaciones | Hoja de cálculo | El `ping` devuelve su nombre y su id; también la propiedad `EV_SPREADSHEET_ID` | ☐ |
| `REGISTRO DE INGRESOS.xlsx` | Origen histórico | El Excel del área del que salió el libro anual. Si sigue en uso, va con el resto | ☐ |
| Sitio de Reclutamiento | Google Sites | `sites.google.com/view/mireclutamiento` | ☐ |
| Formulario · Seguimiento de Procesos | Google Forms | Panel «Herramientas» | ☐ |
| Formulario · Registro de Lista Negra | Google Forms | Panel «Herramientas» | ☐ |
| Web App · Registro de Postulantes | Apps Script | Panel «Herramientas» | ☐ |
| Web App · Buscador de perfiles | Apps Script | Panel «Herramientas» | ☐ |
| Web App · Buscador de funcionarios | Apps Script | Panel «Herramientas» | ☐ |

Las tres últimas son aplicaciones web **con su propio código y su propio libro**,
independientes de los tres backends. Cada una es una migración pequeña con los
mismos pasos.

> Los dos formularios pueden tener **hoja de respuestas** propia. Un formulario
> copiado NO conserva las respuestas ya recibidas: hay que llevarse la hoja
> aparte y decidir si el formulario nuevo escribe en una hoja nueva.

---

## 3 · Propiedades del script

No viajan con una copia del libro **ni** con una transferencia de propiedad: se
vuelven a escribir a mano en el proyecto de la cuenta nueva.

### Documentación

| Propiedad | Obligatoria | Qué es |
|---|---|---|
| `DOC_SPREADSHEET_ID` | Sí, si el proyecto no está creado desde el libro | Id del libro **nuevo**. Es el error más frecuente: se copia el valor viejo y todo funciona… contra el libro de la cuenta antigua |
| `DOC_ADMIN_KEY` | No | Llave que protege migrar, reparar y guardar configuración. Conviene generarla nueva, no reutilizar la anterior |
| `DOC_AUTH_MODE` | No | Modo de arranque de permisos |
| `DOC_INSTALLED_AT` | La escribe el sistema | Sello de instalación |

### Evaluaciones

| Propiedad | Obligatoria | Qué es |
|---|---|---|
| `EV_SPREADSHEET_ID` | Sí, si el proyecto no está creado desde el libro | Id del libro **nuevo** |
| `EV_ADMIN_KEY` | Recomendada | Llave de administración. Sin ella el backend opera en modo abierto **y lo anuncia**: cualquiera con la URL puede administrar evaluaciones |
| `EV_ADMIN_KEY_NEXT` | No | Llave siguiente, para rotar sin cortar el servicio |
| `EV_ATTEMPT_SECRET` | La genera la instalación | Firma los tokens de intento. **Si cambia, los intentos en curso se invalidan** |
| `EV_LOG_LEVEL` | No | `debug` · `info` · `warn` · `error` |
| `EV_METRICS_ENABLED` | No | `false` para no escribir métricas |

### Talento

Las que use su `Code.gs`. Se leen del proyecto viejo antes de migrar: `⚙️
Configuración del proyecto → Propiedades del script`. Si la lista está vacía, no
hay ninguna que copiar.

---

## 4 · Despliegues (aplicación web)

Cada backend se publica por separado, y **la URL `…/exec` depende del
despliegue**, no del libro.

| Backend | Ejecutar como | Quién tiene acceso | Por qué |
|---|---|---|---|
| Talento | Yo | Cualquier usuario | El navegador del área llama sin cuenta de Google |
| Documentación | Yo (`USER_DEPLOYING`) | Cualquier usuario (`ANYONE_ANONYMOUS`) | Ídem. Lo fija `appsscript.json` |
| Evaluaciones | Yo (`USER_DEPLOYING`) | Cualquier usuario (`ANYONE_ANONYMOUS`) | **Un postulante anónimo tiene que poder abrir la prueba.** Con «usuario que accede», Google le devuelve su pantalla de inicio de sesión |

> **«Ejecutar como: Yo» significa la cuenta que publicó el despliegue.** Es lo
> que hace que el sistema siga funcionando sin que cada persona autorice nada; y
> también lo que hace que, si el despliegue lo publicó la cuenta antigua, el
> sistema siga ejecutándose **con los permisos de esa cuenta** aunque el archivo
> ya sea de otra. La verificación del paso 26 de la guía existe para eso.

---

## 5 · Disparadores por tiempo

Un disparador pertenece a **la cuenta que lo creó**, no al proyecto. Una copia
del libro llega sin ninguno, y el sistema no avisa: simplemente deja de haber
proceso diario.

| Backend | Función | Cuándo | Cómo se instala |
|---|---|---|---|
| Documentación | `docTareaDiaria` | Cada día a las 03:00 | Menú `Documentacion → Tarea diaria` |
| Evaluaciones | `tareaDiariaEvaluaciones` | Cada día a las 03:00 | Menú `⚙️ Evaluaciones → Instalar disparador diario` |

Qué se pierde si no se instalan: el respaldo diario, el recálculo de avances, la
compactación de bitácoras, los avisos de prórroga y el cierre de intentos
vencidos.

---

## 6 · Correo

Documentación puede enviar recordatorios con `MailApp`, y eso tiene tres
consecuencias al cambiar de cuenta:

- **El remitente pasa a ser la cuenta nueva.** Quien reciba el aviso verá otra
  dirección.
- **La cuota diaria es la de la cuenta nueva** (una cuenta gratuita tiene mucho
  menos margen que una de Workspace).
- La hoja `_CONFIG` del libro guarda `cuenta_remitente` y `correo_copia` con
  valores de la cuenta anterior: hay que revisarlos.

El envío automático viene **apagado** (`avisos_automaticos = FALSE`). Conviene
dejarlo apagado durante la migración y encenderlo al final, para que un
recálculo no dispare una tanda de correos reales.

---

## 7 · Lo que hay en el repositorio

Todas las direcciones están en un solo archivo:
[`src/config/google.ts`](../../src/config/google.ts).

| Valor | Variable del despliegue | Si se queda apuntando a la cuenta antigua |
|---|---|---|
| `SCRIPT_URL` | `VITE_SCRIPT_URL` | El sistema entero sigue leyendo y escribiendo en el libro viejo |
| `URL_DOCUMENTACION` | `VITE_DOCUMENTACION_URL` | Cada equipo tiene que pegar la URL a mano en Documentación → Configuración → Conexión |
| `DESPLIEGUE_EVALUACIONES` | `VITE_EVALUACIONES_DESPLIEGUE` | Los enlaces de evaluación antiguos dejan de resolver cuando el despliegue viejo desaparezca |
| `DOMINIO_EVALUACIONES` | `VITE_EVALUACIONES_DOMINIO` | Solo aplica a despliegues de dominio de Workspace |
| `UTILIDADES` (6 enlaces) | — | Los seis accesos del panel «Herramientas» dejan de abrir |

Se pueden ver desde la propia aplicación: **Configuración → Integraciones →
Recursos en la cuenta de Google**, que dice de dónde salió cada valor.

---

## 8 · Lo que vive en el navegador de cada persona

Esto **no** está en el repositorio ni en Google: está en el `localStorage` del
equipo de cada una de las personas del área. Es el motivo más común de «a mí me
sigue funcionando raro» después de una migración.

| Clave | Qué guarda | Qué hacer al migrar |
|---|---|---|
| `bdp-documentacion` | La URL `…/exec` de Documentación que esa persona configuró | **Tiene prioridad sobre el repositorio.** Si no se actualiza, ese equipo sigue hablando con el backend viejo |
| `bdp-evaluaciones-conexion` | URL y llave de Evaluaciones | Volver a pegar URL y llave nuevas |
| `bdp-talent-cache` | Copia de la última lectura del libro | Se refresca sola; puede mostrar datos viejos unos minutos |
| `bdp-doc-expedientes` | Caché de expedientes | Se refresca sola |

La forma rápida y segura de dejar un equipo limpio: abrir la aplicación,
`F12 → Application → Local Storage`, borrar las claves que empiezan por `bdp-`, y
recargar. Se pierden preferencias locales (tema, disposición del tablero), nunca
datos: los datos están en las hojas.

---

## 9 · Fuera de Google

| Integración | Dónde se configura | Afecta a la migración |
|---|---|---|
| Vercel (alojamiento del frontend) | Proyecto de Vercel · variables de entorno | Solo si se usan las variables `VITE_…`. La cuenta de Vercel no cambia |
| Evaluar.com | Configuración → Integraciones | No depende de Google |
| GenomaWork | Enlaces dentro de los perfiles de cargo | No depende de Google |

---

## Verificación

```bash
npm run migracion:verificar -- \
  --talento=https://script.google.com/macros/s/…/exec \
  --documentacion=https://script.google.com/macros/s/…/exec \
  --evaluaciones=https://script.google.com/macros/s/…/exec
```

Solo lee: no escribe ninguna fila ni publica nada, así que se puede ejecutar
contra producción. Comprueba las tres formas silenciosas de fallar —la página de
autorización disfrazada de éxito, el despliegue sin publicar versión nueva y el
script apuntando al libro antiguo— y devuelve código de salida 1 si algo queda
pendiente.
