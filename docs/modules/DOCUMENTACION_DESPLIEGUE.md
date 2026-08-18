# Documentación · despliegue, reversión y aceptación

Guía operativa para poner en marcha el módulo refactorizado sobre un libro que ya
tiene datos. Está escrita para seguirse de arriba abajo sin conocimientos de
programación: cada paso dice qué hacer y qué se debe ver.

Se puede parar en cualquier punto antes del paso 21 sin consecuencias: hasta ahí
nada ha modificado los datos de trabajo.

---

## Antes de empezar

Necesita tres cosas:

- Acceso de edición al libro de Google Sheets del área.
- Acceso al repositorio para copiar el contenido de los archivos.
- Media hora sin interrupciones, en un momento de poca actividad.

> **Una sola persona a la vez**
> Durante la migración nadie más debería estar escribiendo en el libro. No es que
> se corrompa —hay bloqueo y control de versión— pero un cambio hecho a mano en
> medio del proceso complica leer el informe final.

---

## Parte 1 · Preparación (pasos 1–8)

**1.** Abra el libro del área y compruebe en la esquina inferior que aparecen las
pestañas `CONTROL INGRESOS <año>` que espera encontrar. Apunte cuántas filas
tiene la pestaña del año en curso: la va a necesitar en el paso 27.

**2.** Menú `Archivo > Crear una copia`. Nómbrela
`REGISTRO INGRESOS — respaldo previo <fecha>`. Este es su seguro; el sistema hace
sus propios respaldos, pero una copia completa fuera del libro no cuesta nada.

**3.** Copie el ID del libro desde la barra de direcciones: es el trozo largo
entre `/d/` y `/edit`.

**4.** En el libro, `Extensiones > Apps Script`. Se abre el editor en otra
pestaña.

**5.** En el editor, `Configuración del proyecto` (el engranaje) y active
**Mostrar el archivo de manifiesto `appsscript.json`**.

**6.** Abra `appsscript.json` y pegue el contenido de
`apps-script/documentacion/appsscript.json`. Guarde con `Ctrl+S`.

**7.** Cree o actualice los 22 archivos `.gs`. Para cada archivo de
`apps-script/documentacion/`, en el orden en que están numerados: si ya existe en
el editor, reemplace todo su contenido; si no existe, `Archivo > Nuevo > Script`
y póngale **exactamente** el mismo nombre sin la extensión (`11_Domain`, no
`11_Domain.gs`).

> **El orden de los nombres no es cosmético**
> Apps Script junta todos los archivos en uno solo antes de ejecutar, en orden
> alfabético. Las constantes del `11_Domain` tienen que existir antes de que el
> `15_Expedientes` las use. Si renombra un archivo y pierde el número, el módulo
> deja de arrancar con un error de variable no definida.

**8.** Guarde todo (`Ctrl+S`) y confirme que el editor no marca ningún archivo con
un punto naranja de «sin guardar».

---

## Parte 2 · Configuración (pasos 9–14)

**9.** `Configuración del proyecto > Propiedades del script > Añadir propiedad`.
Nombre `DOC_SPREADSHEET_ID`, valor el ID del paso 3. Guarde.

**10.** Añada una segunda propiedad `DOC_ADMIN_KEY` con una frase larga que no use
en otro sitio. Guárdela también en su gestor de contraseñas: es lo que protegerá
migrar, reparar y cambiar configuración cuando lo active en el paso 33.

**11.** Vuelva a la pestaña del libro y recárguela (`F5`). Debe aparecer un menú
nuevo llamado **Documentación** junto a `Ayuda`.

**12.** `Documentación > Instalar o reparar`. Google pedirá permisos: revise que
son para su propia cuenta y acepte. Puede aparecer una advertencia de «aplicación
no verificada»; es normal en un script propio, entre por «Configuración
avanzada».

**13.** Espere el aviso de fin. Este paso sólo asegura la estructura heredada del
libro anual; todavía no ha cambiado nada del modelo nuevo.

**14.** `Documentación > Instalar o actualizar (modelo normalizado)`. Al terminar,
compruebe abajo que existen las hojas `Expedientes`, `ExpedienteDocumentos`,
`CatalogoDocumentos` y las demás. Están vacías: eso es lo correcto.

---

## Parte 3 · Simulación (pasos 15–20)

**15.** `Documentación > Simular migración (no escribe nada)`. Tarda según el
tamaño del libro.

**16.** Lea el informe. Debe decirle cuántos expedientes crearía, cuántos
requisitos, y cuántas filas no puede interpretar.

**17.** Compare el número de expedientes con el número de filas que apuntó en el
paso 1. Si difieren mucho, no siga: hay filas que la migración no reconoce y
conviene mirarlas antes.

**18.** Revise la lista de filas problemáticas del informe. Lo habitual es una
fecha de ingreso vacía o escrita como texto libre.

**19.** Corrija esas filas a mano en la pestaña anual. La migración es
conservadora a propósito: prefiere no inventar antes que adivinar mal.

**20.** Repita el paso 15 hasta que el informe no reporte filas problemáticas, o
hasta que las que queden sean casos que usted acepta perder de vista.

---

## Parte 4 · Migración (pasos 21–26)

**21.** Avise al área de que no escriba en el libro durante los próximos minutos.
Desde aquí sí se modifican datos.

**22.** `Documentación > Migrar al modelo normalizado`. El sistema guarda un
respaldo propio antes de empezar.

**23.** Si el proceso termina diciendo que se agotó el tiempo, **no es un
error**: Apps Script corta a los seis minutos. Vuelva a ejecutar el mismo menú;
continúa donde quedó. Repita hasta que informe que terminó.

**24.** Abra la hoja `MigracionesDocumentacion`. Debe ver cuatro filas
—`4.0.0-estructura`, `4.0.1-catalogos`, `4.0.2-expedientes`,
`4.0.3-resumenes`— todas en estado completado.

**25.** Abra `Expedientes` y revise cinco filas al azar contra la pestaña anual:
nombre, fecha de ingreso, oficina y avance deben coincidir.

**26.** Ejecute el paso 22 **otra vez**. Debe informar que no hay nada que hacer y
el número de filas de `Expedientes` no debe cambiar. Esto confirma en su propio
libro la idempotencia que las pruebas comprueban en el repositorio.

---

## Parte 5 · Publicación (pasos 27–32)

**27.** `Documentación > Diagnosticar modelo normalizado`. Anote los hallazgos.
`INFO` y `ADVERTENCIA` pueden esperar; `IMPORTANTE` y `CRÍTICO` conviene
resolverlos con `Documentación > Reparar modelo normalizado` antes de dar acceso
a nadie.

**28.** En el editor de Apps Script, `Implementar > Gestionar implementaciones`.
Si ya había una, edítela y suba la versión a **Nueva versión**; si no, use
`Implementar > Nueva implementación > Aplicación web`.

**29.** Configure la implementación así: descripción con la fecha, **Ejecutar
como: Yo**, **Quién tiene acceso: Cualquier usuario**. Implemente y copie la URL
que termina en `/exec`.

> **Por qué «cualquier usuario»**
> No significa que los datos queden públicos: la URL es secreta y el script
> comprueba rol y capacidades en cada llamada. Significa que el navegador no
> tiene que autenticarse contra Google en cada petición, que es lo que hace
> fallar la llamada desde la web.

**30.** La URL vive en el código, en `SCRIPT_URL` de `src/constants.ts`. Si la
implementación es nueva o cambió de URL, actualice esa constante y publique el
frontend; si sólo publicó una versión nueva sobre la misma implementación, la URL
no cambia y no hay nada que tocar.

**31.** Abra la aplicación del banco, entre a **Documentación** y luego a
`Configuración > Conexión y esquema`. Debe mostrar la versión del backend, el
esquema instalado y las migraciones aplicadas. Si en su lugar aparece la pantalla
de «sin conexión», use `Reintentar`: casi siempre es que falta publicar una
versión nueva en el paso 28.

**32.** Recorra el menú lateral: `Panel`, `Expedientes`, las cuatro pantallas de
trabajo (`Solicitudes`, `Revisión`, `Aprobaciones`, `Prórrogas`, `Tareas`), las
de información (`Reportes`, `Exportaciones`, `Notificaciones`, `Auditoría`) y
`Configuración`. El panel debe mostrar cifras reales, no ceros; el listado debe
mostrar sus expedientes.

---

## Parte 6 · Cierre (pasos 33–35)

**33.** En `Configuración > Permisos`, asigne rol a cada persona del área por su
cuenta de correo. Deje `admin` sólo para quien administre el módulo. Con eso se
cierra el modo de arranque, y a partir de ahí nadie entra con permisos amplios
por defecto.

**34.** En `Configuración > Plazos y SLA`, revise los plazos por defecto y
ajústelos a lo que el área usa de verdad. Si quiere proteger las operaciones
sensibles, ponga además la clave `exigir_llave_admin` en `TRUE`: desde ese momento
migrar, reparar y cambiar configuración piden la llave del paso 10.

**35.** `Documentación > Activar tarea diaria` en el libro. Al día siguiente,
compruebe en la sección de reportes que hay notificaciones generadas: eso
confirma que el proceso diario corre solo.

---

## Plan de reversión

Nada de lo anterior destruye información, así que la vuelta atrás es sencilla.
Elija el escenario según dónde esté el problema.

### A. La web no funciona, el libro sí

El caso más común, y el menos grave. En la pantalla de conexión que aparece
cuando el backend no responde, pulse `Abrir la vista local`; si la consola
funciona pero prefiere no usarla, entre por `Vista local` en el menú lateral. Es
la versión anterior del módulo, que trabaja contra el almacén de este equipo y el
libro heredado. El área sigue trabajando mientras se investiga.

Alternativa igual de válida: trabajar directamente en la pestaña anual del libro,
que sigue teniendo sus 39 columnas y sus colores.

### B. Los datos migrados están mal

1. `Documentación > Diagnosticar modelo normalizado` y guarde el informe.
2. `Documentación > Reparar modelo normalizado`. Corrige lo que puede sin
   inventar, y le dice qué queda para resolver a mano.
3. Si prefiere empezar de cero con el modelo nuevo: borre a mano las 19 hojas
   normalizadas y `MigracionesDocumentacion`, y repita desde el paso 14. Las
   pestañas anuales no se tocan, así que no se pierde nada.

### C. El script no arranca

Síntoma: el menú `Documentación` no aparece o toda acción devuelve error de
variable no definida. Es un archivo mal nombrado o pegado a medias. Repita el
paso 7 comparando la lista de archivos del editor con la del repositorio.

### D. Volver al código anterior por completo

1. En el editor, `Implementar > Gestionar implementaciones` y vuelva a la versión
   anterior de la implementación. La web deja de ver el modelo nuevo.
2. Revierta el despliegue del frontend a la versión previa del repositorio.
3. Las hojas normalizadas pueden quedarse donde están: el código heredado no las
   lee ni las escribe, y así conserva la migración por si se retoma.

> **Lo que no hay que hacer**
> No borre las pestañas `CONTROL INGRESOS <año>` en ningún escenario. Son las
> únicas hojas con datos que no se pueden reconstruir desde otra parte.

---

## Checklist de aceptación

Para firmar que el módulo quedó bien. Cada línea es comprobable por una persona
del área sin ayuda técnica.

### Datos

- [ ] El número de expedientes coincide con el de filas del libro, año por año.
- [ ] Cinco expedientes al azar tienen nombre, fecha, oficina y avance iguales a
      su fila.
- [ ] Un expediente con prórroga en el libro sigue apareciendo con prórroga.
- [ ] Un expediente completo sigue en verde en la pestaña anual.
- [ ] La hoja `Auxiliar` incluye todas las agencias y gerencias que el área usa.
- [ ] El catálogo tiene 38 documentos (18 generales, 17 de garantía por rama y 3 de cumplimiento) y los códigos heredados se conservan.

### Trabajo diario

- [ ] Dar de alta un ingreso genera su fila en la pestaña del año correcto.
- [ ] Pasar un expediente a tipo `COMERCIAL` con garantía `COMERCIAL_1` añade los
      cuatro documentos de garantía y no borra lo ya cargado.
- [ ] Marcar un documento como entregado sube el avance y repinta la fila.
- [ ] Pedir documentos a una persona deja registro de qué se pidió y cuándo.
- [ ] Observar un documento devuelve el expediente a `OBSERVADO` con su motivo.
- [ ] Conceder una prórroga sustituye la anterior, no las acumula.
- [ ] Una solicitud masiva muestra el impacto antes de enviarse.

### Robustez

- [ ] Dos personas editando dos expedientes distintos no se estorban.
- [ ] Dos personas editando el mismo expediente: la segunda recibe aviso de
      conflicto y no pierde lo escrito.
- [ ] Pulsar `Guardar` dos veces seguidas no duplica nada.
- [ ] Cortar la conexión a mitad de una operación deja un mensaje claro y no
      datos a medias.
- [ ] Exportar 500 expedientes termina y el archivo abre en Excel.
- [ ] Un valor que empiece por `=` en una observación llega al Excel como texto,
      no como fórmula.

### Permisos

- [ ] Un `invitado` no ve la configuración ni puede escribir.
- [ ] Un `auxiliar` puede cargar documentos pero no aprobar.
- [ ] Nadie puede darse a sí mismo un rol mayor desde la web.
- [ ] La auditoría registra quién consultó datos personales.

### Experiencia

- [ ] La consola se usa completa desde un teléfono.
- [ ] Con el sistema en «reducir movimiento», nada se anima.
- [ ] Toda acción destructiva pide confirmación y explica el impacto.
- [ ] Los errores dicen qué hacer, no sólo qué falló.
- [ ] Las secciones no disponibles se anuncian como «en construcción» en lugar de
      fallar.
