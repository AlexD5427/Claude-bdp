# Guía para el frontend de postulantes — leer y responder una prueba publicada

Este documento es para quien construya (o continúe) **la página de postulantes**:
la que abre el candidato con el enlace público y en la que responde la prueba. Los
resultados aparecen automáticamente en el módulo de Evaluaciones del ATS.

Está pensado para leerse solo. El contrato exhaustivo de las 24 acciones está en
[`CONTRATO_FRONTEND.md`](./CONTRATO_FRONTEND.md); aquí está el camino concreto,
en orden, con el código mínimo y los errores que hay que tratar.

La implementación de referencia, que se puede copiar tal cual, es
`src/features/evaluaciones/runner/Runner.tsx` (802 líneas, sin dependencias más
allá de React y framer-motion).

---

## 0 · El modelo mental en cinco frases

1. Una evaluación **publicada** congela su contenido en una **versión inmutable**.
   El candidato siempre recibe la versión vigente en el momento de empezar.
2. La prueba **no se lee sin iniciar un intento**. `openAssessment` da la portada;
   `startAttempt` da las preguntas. Es lo que impide que alguien descargue el
   cuestionario sin dejar rastro.
3. **El reloj es del servidor.** El navegador cuenta hacia atrás entre latidos;
   cada latido y cada guardado devuelven los segundos restantes reales.
4. Las respuestas correctas **nunca** viajan al navegador del candidato. La
   proyección pública las quita en el servidor.
5. La calificación es del servidor. Cualquier `nota`, `puntosObtenidos` o
   `correcta` que envíe el cliente **se descarta**.

---

## 1 · Configuración

Un solo dato: la URL del Web App de Apps Script, la que termina en `/exec`.

```js
const URL_BACKEND = "https://script.google.com/macros/s/AKfycb…/exec";
```

Las acciones del candidato **no llevan llave de administración**. Si tu página
envía `llaveAdmin`, quítala: no la necesita y es un secreto de despliegue.

## 2 · Cómo se llama al backend

Tres reglas que Apps Script impone. Si falla una, la llamada falla de una forma
desconcertante:

```js
async function llamar(accion, payload) {
  const respuesta = await fetch(URL_BACKEND, {
    method: "POST",
    redirect: "follow",                                  // 1
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // 2
    body: JSON.stringify({ accion, payload, solicitudId: crypto.randomUUID(), cliente: idDeEsteNavegador }),
  });
  const texto = await respuesta.text();
  const sobre = JSON.parse(texto);       // si esto lanza, mira la nota de abajo
  if (!sobre.ok) throw Object.assign(new Error(sobre.error.mensaje), sobre.error);
  return sobre.datos;
}
```

1. **`redirect: "follow"`.** Google contesta 302 al Web App; sin seguirlo da un 404.
2. **`text/plain`.** Un Web App no puede contestar el *preflight* de CORS que
   dispara `application/json`. Con `text/plain` la petición es «simple» y el
   navegador no lo pide.
3. **`solicitudId` único por intención**, y el **mismo** si reintentas a mano: es
   lo que hace la operación idempotente. Un reintento con el mismo identificador
   devuelve el resultado original con el aviso `SOLICITUD_REPETIDA` en lugar de
   duplicar el intento.

> Si `JSON.parse` lanza, casi siempre significa que la URL apunta a una pantalla
> de inicio de sesión de Google: el despliegue tiene que permitir acceso anónimo
> («Cualquier usuario»). Muéstralo como tal en lugar de «error inesperado».

## 3 · El recorrido, paso a paso

### 3.1 · Portada — `openAssessment`

```js
const portada = await llamar("openAssessment", { codigo: "EV-PRUE-38U5" });
```

```jsonc
{
  "codigo": "EV-PRUE-38U5",
  "disponible": true,
  "motivo": "",                 // por qué no está disponible, si no lo está
  "mensaje": "",                // texto listo para mostrar
  "titulo": "Prueba Auditor Interno",
  "descripcion": "…",
  "instrucciones": { "v": 1, "b": [ … ] },   // texto enriquecido, ver §4
  "versionEtiqueta": "v1.0",
  "totalPreguntas": 20,
  "duracionMinutos": 30,        // null = sin límite
  "intentosMaximos": 1,
  "participante": { "campos": [ … ], "requiereConsentimiento": false, "textoConsentimiento": "" },
  "integridad": { … },          // qué se va a registrar: hay que anunciarlo
  "tema": { "acento": "cian", "logoUrl": "", "mostrarNumeracion": true },
  "horaServidor": "2026-08-10T03:05:00.000Z"
}
```

Si `disponible` es `false`, muestra `mensaje` y **para**. Los motivos posibles:

| `motivo` | Qué decirle al candidato |
| --- | --- |
| `no_publicada` | La evaluación todavía no está disponible. |
| `pausada` | Está pausada temporalmente. |
| `cerrada` | La convocatoria cerró. |
| `aun_no_abre` | Abre el <fecha>. |
| `ventana_cerrada` | El plazo terminó el <fecha>. |
| `sin_version` | Problema de configuración: avisar al equipo. |
| `no_disponible` | Genérico. |

Los campos de `participante.campos` son los que hay que pedir: cada uno trae
`clave`, `etiqueta` y `obligatorio`. `nombre` y `documento` **siempre** están y
siempre son obligatorios: sin ellos el resultado no se puede atribuir a nadie ni
salir en el acta.

**Anuncia el registro de integridad antes de empezar.** No es opcional: una
vigilancia silenciosa no es aceptable y, además, no sirve como evidencia.

### 3.2 · Empezar — `startAttempt`

```js
const inicio = await llamar("startAttempt", {
  codigo: "EV-PRUE-38U5",
  participante: { nombre: "María Quispe Rojas", documento: "7654321" },
  consentimiento: true,           // solo si la portada lo exige
});
```

```jsonc
{
  "intentoId": "it_b047a277-…",
  "token": "…",                  // hay que enviarlo en TODAS las llamadas siguientes
  "retomado": false,
  "horaServidor": "…", "iniciadoEn": "…", "limiteEn": "…",
  "segundosRestantes": 1800,      // null = sin límite
  "respuestasPrevias": [ { "preguntaId": "pr_x", "opciones": ["op_y"], "valor": null } ],
  "prueba": {
    "codigo": "…", "titulo": "…", "instrucciones": { … }, "versionEtiqueta": "v1.0",
    "totalPreguntas": 20,
    "aplicacion": { "duracionMinutos": 30, "navegacion": "libre", "permitirRetroceso": true,
                    "mostrarProgreso": true, "autoenviarAlExpirar": true, "guardadoAutomaticoSegundos": 20 },
    "secciones": [
      { "id": "sc_1", "titulo": "Auditoría interna", "descripcion": { … }, "limiteSegundos": null,
        "preguntas": [
          { "id": "pr_1", "tipo": "opcion_unica", "enunciado": { … }, "ayuda": { … },
            "obligatoria": true, "puntos": 25, "configuracion": { … },
            "opciones": [ { "id": "op_1", "valor": "a", "texto": { … } } ] }
        ] }
    ]
  }
}
```

Guarda `intentoId` y `token` en `sessionStorage`: si el candidato recarga, vuelve a
llamar a `startAttempt` con los mismos datos y recibirá `retomado: true`, el MISMO
`intentoId`, su tiempo restante real y sus `respuestasPrevias`. **Recargar no
reinicia nada y no regala tiempo.**

`navegacion` decide la paginación: `libre` (todo en una página), `secuencial` (una
sección por página) o `una_por_pagina`.

### 3.3 · Mientras responde — `heartbeat` y `saveProgress`

```js
// cada 30 s: sincroniza el reloj del servidor
const latido = await llamar("heartbeat", { intentoId, token });
if (latido.expirado) enviar({ automatico: true });

// cada `guardadoAutomaticoSegundos`: guarda lo respondido
await llamar("saveProgress", { intentoId, token, respuestas, eventos });
```

El formato de cada respuesta según el tipo está en la tabla de
[`CONTRATO_FRONTEND.md` §5](./CONTRATO_FRONTEND.md). Lo esencial:

```js
{ preguntaId: "pr_1", opciones: ["op_3"] }                    // opción única / múltiple
{ preguntaId: "pr_2", valor: "texto libre" }                  // texto
{ preguntaId: "pr_3", valor: 4 }                              // número y escala
{ preguntaId: "pr_4", valor: { "op_fila1": "Alto" } }         // cuadrícula
{ preguntaId: "pr_5", valor: ["op_3","op_1","op_2"] }         // ordenar
{ preguntaId: "pr_6", valor: { "h1": "liquidez" } }           // rellenar huecos
```

Y, opcionalmente, `segundos`, `visitas` y `cambios` por pregunta: alimentan el
informe de integridad y los tiempos por pregunta del acta.

### 3.4 · Terminar — `submitAttempt`

```js
const resultado = await llamar("submitAttempt", {
  intentoId, token, respuestas, eventos, automatico: false,
});
```

Lo que devuelve depende de `participante.visibilidadResultado`, que decide el
autor de la evaluación:

| Visibilidad | Qué llega |
| --- | --- |
| `nada` | Solo `intentoId` y `estado`. |
| `solo_envio` | Confirmación del envío. |
| `nota` | Además `nota` y `aprobado`. |
| `nota_y_detalle` | Además `puntosObtenidos`, `puntosPosibles`, `correctas`, `incorrectas`, `sinResponder`. |

Se aplica **en el servidor**: lo que el autor oculta no viaja al navegador. Y si la
prueba tiene preguntas abiertas, `calificacionPendiente` viene en `true`: la nota
final la pone una persona desde el ATS. Dilo así, no muestres un cero.

## 4 · Cómo se renderiza el texto (importante)

Los enunciados, las opciones y las instrucciones **no son cadenas**: son documentos
de texto enriquecido con esta forma:

```jsonc
{ "v": 1, "b": [ { "t": "p", "s": [ { "x": "El principio de ", },
                                    { "x": "independencia", "m": ["b"] } ] } ] }
```

- `b` son **bloques**: `p`, `h1`, `h2`, `h3`, `ul`, `ol`, `quote`, `code`.
- `s` son **fragmentos**: `x` es el texto, `m` las marcas (`b` negrita, `i`
  cursiva, `u` subrayado, `s` tachado, `c` monoespaciado) y `l` un enlace.

**La regla de oro: no interpretes HTML.** No hay HTML que interpretar; hay textos y
cinco marcas. Renderízalo recorriendo bloques y fragmentos, sin `innerHTML` y sin
`dangerouslySetInnerHTML`. Así es seguro por construcción y no hace falta sanear
nada. El renderizador de referencia son 150 líneas:
`src/features/evaluaciones/richtext/RichText.tsx`.

Agrupa los bloques `ul`/`ol` consecutivos en una sola lista: si no, cada elemento
es su propia lista y los lectores de pantalla anuncian «lista de un elemento»
cinco veces.

## 5 · Integridad — qué registrar y cómo

`integridad` en la portada dice qué está activado. Los eventos se envían con
`saveProgress` y `submitAttempt`:

```js
{ tipo: "pestana_oculta", secuencia: 7, segundosDesdeInicio: 252, duracionMs: 38000 }
{ tipo: "pegar", secuencia: 8, preguntaId: "pr_4", detalle: { caracteres: 812 } }
```

Tipos habituales: `inicio`, `pestana_oculta`, `pestana_visible`, `foco_perdido`,
`foco_recuperado`, `copiar`, `pegar`, `menu_contextual`, `impresion`,
`pantalla_completa`, `recarga`, `inactividad`, `pregunta_abierta`,
`pregunta_respondida`, `envio`.

**De un pegado se guarda solo la LONGITUD, nunca el contenido.** No se toman
capturas de pantalla ni se accede a la cámara. Está dicho así al candidato en la
portada y tiene que seguir siendo verdad.

## 6 · Errores que hay que tratar

| Código | Qué pasó | Qué hacer |
| --- | --- | --- |
| `NOT_FOUND` | El código no existe | «Revisa el enlace» |
| `CONFLICT` | El intento ya se envió, o la evaluación se cerró | Mostrar el estado, no reintentar |
| `FORBIDDEN` | `token` inválido o intento de otro | Volver a la portada |
| `RATE_LIMIT` | Demasiadas llamadas | Esperar y reintentar con el MISMO `solicitudId` |
| `VALIDATION` | Falta un campo obligatorio | Señalar el campo con `error.issues[].path` |
| `INTERNAL_ERROR` | Fallo del servidor | Mensaje + `error.traza` para soporte |

Todo error trae `codigo`, `mensaje`, y muchas veces `pista` (qué hacer) y
`detalle`. Muestra `mensaje` y, si viene, `pista`: están escritas para leerse.

## 7 · Y en el ATS, ¿qué se ve?

Nada que la página de postulantes tenga que hacer. En cuanto se envía el intento:

- aparece en **Evaluaciones → Resultados** de esa evaluación, con su nota, sus
  aciertos, su duración y su riesgo de integridad;
- entra en los **KPIs** de la convocatoria (media, mediana, dispersión,
  distribución, tasa de aprobación, finalistas);
- se puede abrir su **acta individual**: la prueba tal como se le presentó, con lo
  que respondió, la clave, sus puntos y el veredicto, lista para imprimir o
  descargar en PDF.

Si la prueba tiene preguntas abiertas, quedan **pendientes de revisión** hasta que
un analista las califique; entonces la nota se recompone sola.

## 8 · Lista de comprobación antes de dar por hecho el frontend

- [ ] La portada muestra `mensaje` cuando `disponible` es `false`, con su motivo.
- [ ] Se piden exactamente los campos de `participante.campos`.
- [ ] El registro de integridad se anuncia **antes** de empezar.
- [ ] `intentoId` y `token` sobreviven a una recarga y se retoma el intento.
- [ ] El temporizador se corrige con `heartbeat`, no con el reloj del equipo.
- [ ] Autoguardado cada `guardadoAutomaticoSegundos`.
- [ ] Autoenvío cuando `expirado` es `true`, marcado como `automatico: true`.
- [ ] El texto enriquecido se renderiza sin HTML.
- [ ] La pantalla final respeta `visibilidadResultado` y explica lo pendiente.
- [ ] Ningún `llaveAdmin` en las llamadas del candidato.
- [ ] Funciona con teclado y con lector de pantalla (los controles son nativos).

---

## Apéndice · Dónde vive cada cosa en el libro

Por si hace falta mirar los datos a mano. No hace falta para implementar el
frontend: se accede siempre por las acciones.

| Hoja | Contenido |
| --- | --- |
| `Evaluaciones` | Una fila por evaluación, con su estado y su configuración en JSON. |
| `Secciones`, `Preguntas`, `Opciones` | El contenido del borrador que se edita. |
| `Versiones` | Una fila por publicación, con su huella y su etiqueta. |
| `VersionesBloques` | El contenido congelado, **troceado** en filas de 40 000 caracteres. |
| `Intentos` | Un intento por fila, con su nota y su resumen de integridad. |
| `Respuestas` | Una respuesta por fila. |
| `Eventos` | El rastro de integridad. |
| `Registro` | Traza de operaciones, correlacionada con `error.traza`. |

Una versión publicada **no se reescribe nunca**. Si la evaluación se edita después,
los intentos ya iniciados siguen viendo su versión: eso es lo que hace que un acta
sea un acta y no una reconstrucción aproximada.
