# Evaluaciones · el modelo de seguridad, en una página

Este documento existe porque el código lo cita: `api/connection.ts` remite aquí
para justificar dónde vive la llave de administración. Es el sitio donde están
escritas las decisiones y, sobre todo, **por qué** son estas.

## Dos superficies, una puerta

El mismo `…/exec` atiende a los dos públicos. La diferencia no es la dirección:
es lo que se envía con la petición.

| | Administración (el ATS) | Postulante (el enlace) |
| --- | --- | --- |
| Quién | el área de personal, con perfil y contraseña del ATS | cualquiera con el enlace, sin cuenta |
| Credencial | **llave de administración** (`EV_ADMIN_KEY`) | ninguna, y un **token de intento** después de empezar |
| Acciones | las 23 de gestión | 5: `openAssessment`, `startAttempt`, `saveProgress`, `heartbeat`, `submitAttempt` |
| Si falta la credencial | `FORBIDDEN` con la pista de dónde configurarla | no aplica |

`06_Security.gs` decide esto en un único sitio y el enrutador no tiene otro
camino: no hay ninguna acción que se autorice de dos maneras distintas.

## Lo que protege al postulante (y a la evaluación de él)

- **Solo se sirve lo publicado**, y solo el *snapshot* saneado de la versión
  vigente. Un borrador no se puede abrir con un enlace.
- **La clave de respuestas nunca sale del servidor.** `13_Public.gs` construye la
  proyección pública campo por campo, con lista blanca: una columna nueva del
  esquema no puede filtrarse por descuido, porque si no se nombra ahí, no sale.
  Hay una prueba que serializa el payload del candidato y comprueba que ninguna
  palabra relacionada con la clave aparezca en el JSON.
- **Empezar un intento devuelve un token firmado (HMAC)** ligado a ese intento.
  Sin token no se puede leer ni escribir nada de él, y el token no sirve para otro
  intento ni para otra evaluación.
- **El reloj es del servidor.** El navegador solo cuenta hacia atrás entre
  latidos; cambiar la hora del equipo o recargar la página no regala tiempo.
- **La calificación es del servidor.** Cualquier `nota`, `puntosObtenidos` o
  `correcta` que llegue del cliente se descarta.
- **Límite de inicios por enlace y minuto** (40) para que nadie cree miles de
  intentos. Cuando lo toca gente legítima, el cliente espera y reintenta solo.

## El enlace público

El enlace es la única credencial del postulante, y desde el arreglo de
[`ENLACE_PUBLICO.md`](./ENLACE_PUBLICO.md) lleva dentro la referencia del
despliegue al que pertenece:

```
https://…/#/evaluacion/EV-ANAL-E7AV?b=AKfycbz…
```

Tres decisiones de seguridad sobre ese parámetro:

1. **No es una URL, es un identificador.** La dirección se reconstruye en el
   código y siempre queda en `script.google.com`. Un parámetro manipulado solo
   puede señalar otro despliegue de Apps Script; no existe forma de que la página
   del ATS envíe los datos de un postulante a un servidor arbitrario.
2. **No se persiste.** Vive en memoria mientras esa pestaña está abierta. Si se
   guardara, un enlace manipulado dejaría al reclutador —en ese mismo navegador—
   hablando con un despliegue ajeno al volver al ATS.
3. **La llave no viaja con él.** La conexión que impone un enlace nace sin llave y
   el transporte además la suprime. Si un reclutador abre en su navegador el
   enlace de otra instalación, se comporta como lo que es: una visita anónima.

El parámetro no es un secreto: la URL de un Web App publicado con acceso
«cualquier usuario» es pública por definición —es la dirección que abre el
postulante—. El secreto es la llave, y no está ahí.

## La llave de administración, y por qué en `localStorage`

Es un secreto **de despliegue**, no de persona: quien puede entrar al ATS puede
administrar evaluaciones. Guardarla en el navegador de un equipo de trabajo es el
nivel de protección que este sistema necesita, y es una decisión consciente:

- **no** se incrusta en el paquete que se publica;
- **no** se envía a ningún tercero;
- **no** viaja en las acciones del postulante ni a destinos impuestos por un
  enlace;
- si el script no tiene llave, el backend opera en modo **abierto** y lo grita:
  `ping` lo devuelve, el diagnóstico lo marca como hallazgo alto y el módulo
  muestra un aviso permanente. Nunca hay un modo insegura y silencioso.

Para rotarla: `EV_ADMIN_KEY_NEXT` acepta la siguiente y las dos valen durante la
transición (la respuesta trae el aviso `LLAVE_EN_ROTACION`).

## El despliegue, bien configurado

| Ajuste | Valor | Qué pasa si no |
| --- | --- | --- |
| Ejecutar como | **Yo** | un postulante anónimo no puede ejecutar el script: Google le devuelve su pantalla de inicio de sesión en lugar de la evaluación |
| Quién tiene acceso | **Cualquier usuario** | el navegador del postulante recibe un 401/403 antes de llegar al script |

«Cualquier usuario» no hace público el libro: la autorización la sigue decidiendo
el script en cada llamada. Lo que permite es que alguien sin cuenta de Google
pueda llamar.

## Lo que queda en el navegador del postulante

Nada del módulo: ni configuración, ni llave, ni copia de la evaluación. La sonda
`qa/sonda-enlace-publico.mjs` lo comprueba enumerando las claves de
almacenamiento al terminar la prueba; la única que aparece es la del tema visual
(`bdp-theme`).
