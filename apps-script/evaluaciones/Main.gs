/**
 * Main.gs — puntos de entrada HTTP del Web App.
 *
 * A propósito es un archivo mínimo: parsear, delegar en `evHandle_()` y
 * serializar. Toda la lógica, la autorización y el registro viven en el
 * enrutador, así que GET y POST no pueden comportarse de forma distinta.
 *
 * ── Lo que el cliente TIENE que hacer ────────────────────────────────────────
 *  · `redirect: "follow"` — Google responde 302 al Web App y sin seguirlo la
 *    llamada falla con un 404 desconcertante.
 *  · Escrituras con `Content-Type: text/plain;charset=utf-8` — un Web App de Apps
 *    Script no puede contestar el *preflight* de CORS que dispara
 *    `application/json`. Con `text/plain` la petición es «simple» y el navegador
 *    no lo pide.
 *  · Un `solicitudId` único por intención del usuario en cada escritura.
 *
 * Estas tres reglas están documentadas en `docs/evaluaciones/API.md` y las
 * implementa el transporte del frontend en un solo sitio.
 */

/**
 * Lecturas por GET.
 *
 * Se admiten los parámetros sueltos (`?accion=openAssessment&codigo=EV-XXXX-1234`)
 * porque así el enlace de una evaluación se puede abrir desde cualquier sitio,
 * incluido un navegador a pelo para comprobar que el despliegue responde.
 */
function doGet(e) {
  try {
    var request = evParseQuery_(e);
    if (!EV_READ_ACTIONS[request.accion]) {
      return evJson_(evFail_(request.accion, request.solicitudId,
        evError_(EV_CODE.BAD_REQUEST,
          'La acción "' + request.accion + '" modifica datos y solo se admite por POST.',
          {
            hint: 'Envíala como POST con Content-Type text/plain;charset=utf-8 y un solicitudId único.',
            details: { accion: request.accion, lecturasPermitidas: Object.keys(EV_READ_ACTIONS) }
          }),
        [], null, {}));
    }
    return evJson_(evHandle_(request));
  } catch (error) {
    return evJson_(evFail_('', '', error, [], null, {}));
  }
}

/** Escrituras (y cualquier lectura que prefiera POST). */
function doPost(e) {
  try {
    return evJson_(evHandle_(evParseBody_(e)));
  } catch (error) {
    return evJson_(evFail_('', '', error, [], null, {}));
  }
}

/** Parseo seguro del cuerpo POST. */
function evParseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw evError_(EV_CODE.BAD_REQUEST, 'La solicitud POST llegó sin cuerpo.', {
      hint: 'Envía un JSON con al menos `{ "accion": "ping" }`.', details: {}
    });
  }
  var text = String(e.postData.contents);
  if (text.length > EV_LIMITS.BODY_CHARS) {
    throw evError_(EV_CODE.BAD_REQUEST,
      'La solicitud pesa ' + text.length + ' caracteres y el máximo es ' + EV_LIMITS.BODY_CHARS + '.',
      {
        hint: 'Suele indicar una evaluación con demasiado contenido en una sola operación. Divídela en secciones.',
        details: { caracteres: text.length, maximo: EV_LIMITS.BODY_CHARS }
      });
  }
  var parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw evError_(EV_CODE.BAD_REQUEST, 'El cuerpo de la solicitud no es JSON válido.', {
      hint: 'Comprueba que el cliente serializa con JSON.stringify y que no añade texto alrededor.',
      details: { caracteres: text.length }
    });
  }
  if (!parsed || typeof parsed !== 'object') {
    throw evError_(EV_CODE.BAD_REQUEST, 'El cuerpo de la solicitud no es un objeto.', { details: {} });
  }
  return parsed;
}

/** Parseo de los parámetros GET. */
function evParseQuery_(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var request = {
    accion: String(params.accion || params.action || ''),
    solicitudId: String(params.solicitudId || params.requestId || ''),
    llaveAdmin: params.llaveAdmin || params.adminKey || '',
    clientId: params.cliente || params.clientId || '',
    actor: params.actor || ''
  };
  if (params.payload) {
    var parsed = evParseJson_(params.payload, null);
    if (!parsed || typeof parsed !== 'object') {
      throw evError_(EV_CODE.BAD_REQUEST, 'El parámetro `payload` no es JSON válido.', {
        hint: 'O envías `payload` con un JSON codificado, o pasas los campos sueltos como parámetros.',
        details: {}
      });
    }
    request.payload = parsed;
    return request;
  }
  var payload = {};
  var keys = Object.keys(params);
  var reservados = { accion: 1, action: 1, solicitudId: 1, requestId: 1, payload: 1, llaveAdmin: 1, adminKey: 1, cliente: 1, clientId: 1, actor: 1 };
  for (var i = 0; i < keys.length; i++) {
    if (reservados[keys[i]]) continue;
    payload[keys[i]] = params[keys[i]];
  }
  request.payload = payload;
  return request;
}

/** Serializa la respuesta como JSON. */
function evJson_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
