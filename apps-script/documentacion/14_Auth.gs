/**
 * 14_Auth.gs — identidad, roles y autorización.
 *
 * ── Ninguna autenticación nueva ──────────────────────────────────────────────
 * El sistema ya tiene usuarios: los perfiles de la aplicación
 * (`src/lib/profilesStore.ts`) con sus cinco roles. Este archivo NO crea otro. Lo
 * que hace es resolver, para cada petición, qué rol tiene quien la envía y qué
 * puede hacer con él.
 *
 * ── De dónde sale la identidad, en orden ────────────────────────────────────
 *   1. la llave de administración (`DOC_ADMIN_KEY`), que solo conocen el menú del
 *      libro y las tareas programadas: rol `admin`;
 *   2. la cuenta de Google que ejecuta la petición, cuando Apps Script la expone;
 *   3. el actor declarado por el cliente, únicamente como etiqueta para mostrar.
 *
 * El rol se resuelve SIEMPRE en el servidor, contra el mapa `roles_por_actor` de
 * la configuración. El rol que declare el navegador se acepta solo si es igual o
 * MENOR que el resuelto: sirve para que una sesión de pasante no pueda usar por
 * accidente los permisos del administrador que dejó el libro abierto, pero nunca
 * para escalar privilegios.
 *
 * ── Por qué ocultar botones no es seguridad ─────────────────────────────────
 * Porque la petición se puede enviar a mano. Cada acción pública pasa por
 * `doc2Autorizar_`, y esa comprobación ocurre en el backend, con el rol que el
 * backend resolvió. La interfaz oculta lo que no corresponde por comodidad, no
 * por seguridad.
 */

/** Contexto de la petición en curso. Lo llena el controlador. */
var DOC2_CTX = null;

/**
 * Límite honesto de este modelo de despliegue.
 *
 * La aplicación web se publica con `executeAs: USER_DEPLOYING` y acceso anónimo:
 * TODAS las peticiones llegan con la misma cuenta de Google (la de quien
 * desplegó). Es decir: el backend no puede distinguir por sí mismo a dos
 * personas del equipo. Quien las distingue es el frontend, con el perfil y su
 * contraseña (`src/lib/profilesStore.ts`), y viaja en `params.actor`.
 *
 * Eso significa que el rol del actor declarado se acepta porque el frontend ya lo
 * autenticó, no porque el backend lo haya verificado. Se documenta aquí porque es
 * la clase de suposición que conviene tener escrita:
 *
 *   · lo que el backend SÍ garantiza es que un rol no puede escalar por encima de
 *     lo que su mapa dice, que cada acción comprueba su capacidad y que todo queda
 *     auditado con el actor declarado;
 *   · para blindar las operaciones sensibles (migrar, reparar, configurar) existe
 *     `exigir_llave_admin`: con esa clave en TRUE, esas acciones exigen además la
 *     llave de administración, que solo está en las propiedades del script.
 *
 * El tutorial de despliegue recomienda activarla en producción.
 */

/** Capacidades que la llave de administración protege cuando está exigida. */
var DOC2_CAPACIDADES_SENSIBLES = ['migrar', 'reparar', 'configurar'];

/**
 * ¿Estamos en el arranque?
 *
 * Un libro sin el modelo instalado y sin mapa de roles no tiene administrador: si
 * nadie pudiera instalar, el módulo no podría empezar a existir. En ese estado
 * —y solo en ese— el primer actor opera como administrador, y la instalación lo
 * registra en el mapa de roles para que el arranque se cierre solo.
 */
function doc2ModoBootstrap_() {
  var mapa = doc2ConfigJson_('roles_por_actor', {}) || {};
  if (Object.keys(mapa).length > 0) return false;
  try {
    var ss = docSpreadsheet_();
    if (!ss.getSheetByName(DOC2_SHEET.EXPEDIENTES)) return true;
    // La hoja puede existir a medio instalar (una migración interrumpida, por
    // ejemplo). Mientras no haya ni un expediente ni un rol asignado, el módulo
    // sigue en arranque: dejarlo cerrado obligaría a editar propiedades de Apps
    // Script para poder terminar de instalarlo.
    return doc2Count_(DOC2_SHEET.EXPEDIENTES) === 0;
  } catch (e) {
    return true;
  }
}

/**
 * Resuelve la identidad y el rol de quien envía la petición.
 *
 * `params.actor` y `params.rol` son pistas del cliente, no verdades. El rol
 * efectivo es el menor entre lo resuelto en el servidor y lo declarado.
 */
function doc2ResolverActor_(params) {
  var p = params || {};
  var declarado = docRaw_(p.actor || '', 240);
  var correo = '';
  try {
    correo = Session.getEffectiveUser().getEmail() || '';
  } catch (e) {
    correo = '';
  }

  var llave = docRaw_(p.llaveAdmin || p.adminKey || '', 200);
  var llaveEsperada = String(docProp_(DOC_PROP.ADMIN_KEY, '') || '');
  var esAdminPorLlave = !!(llave && llaveEsperada && llave === llaveEsperada);

  // El identificador del actor prefiere el perfil declarado por el frontend: con
  // la aplicación web anónima el correo es siempre el de quien desplegó y no
  // distingue a una persona de otra. El correo se conserva aparte, para auditar.
  var actorId = declarado || correo || 'anonimo';
  var display = declarado || correo || 'anónimo';

  var mapa = doc2ConfigJson_('roles_por_actor', {}) || {};
  var rolResuelto = '';
  var fuente = 'por_defecto';

  if (esAdminPorLlave) {
    rolResuelto = 'admin';
    fuente = 'llave';
  } else if (doc2ModoBootstrap_()) {
    rolResuelto = 'admin';
    fuente = 'bootstrap';
  } else {
    var claves = Object.keys(mapa);
    for (var i = 0; i < claves.length; i++) {
      var clave = docKey_(claves[i]);
      var coincideCorreo = correo && clave === docKey_(correo);
      var coincideDeclarado = declarado && clave === docKey_(declarado);
      if (clave === docKey_(actorId) || coincideCorreo || coincideDeclarado) {
        rolResuelto = String(mapa[claves[i]] || '').toLowerCase();
        fuente = coincideDeclarado && !coincideCorreo ? 'actor_declarado' : 'cuenta';
        break;
      }
    }
    if (!rolResuelto) rolResuelto = String(doc2Config_('rol_por_defecto', DOC2_ROL_POR_DEFECTO)).toLowerCase();
  }
  if (DOC2_ROLES.indexOf(rolResuelto) < 0) rolResuelto = 'invitado';

  // Descenso voluntario de privilegios: si el cliente dice ser un rol con menos
  // capacidades que el resuelto, se le cree.
  var rolFinal = rolResuelto;
  var pedido = String(p.rol || p.actorRol || '').toLowerCase();
  if (pedido && DOC2_ROLES.indexOf(pedido) >= 0) {
    if (doc2CapacidadesDe_(pedido).length < doc2CapacidadesDe_(rolResuelto).length) rolFinal = pedido;
  }

  return {
    actorId: actorId,
    actorDisplay: display,
    correo: correo,
    rol: rolFinal,
    rolResuelto: rolResuelto,
    fuenteRol: fuente,
    porLlave: esAdminPorLlave,
    capacidades: doc2CapacidadesDe_(rolFinal)
  };
}

/**
 * Construye el contexto de la petición.
 *
 * Todo lo que los servicios necesitan saber de «quién y desde dónde» viaja en un
 * único objeto: así ninguna función tiene que volver a preguntárselo a la
 * plataforma, y las pruebas pueden inyectar un contexto sin simular una sesión.
 */
function doc2Contexto_(params, opciones) {
  var p = params || {};
  var o = opciones || {};
  var identidad = doc2ResolverActor_(p);
  var ctx = {
    requestId: docRaw_(p.solicitudId || p.requestId || '', 200) || docTraceId_(),
    accion: String(o.accion || p.accion || ''),
    actor: identidad.actorDisplay,
    actorId: identidad.actorId,
    actorDisplay: identidad.actorDisplay,
    rol: identidad.rol,
    rolFuente: identidad.fuenteRol,
    correo: identidad.correo,
    capacidades: identidad.capacidades,
    porLlave: identidad.porLlave,
    llaveAdmin: docRaw_(p.llaveAdmin || p.adminKey || '', 200),
    origen: docRaw_(p.origen || o.origen || 'web', 40),
    metodo: String(o.metodo || 'POST'),
    ahora: docNow_()
  };
  DOC2_CTX = ctx;
  return ctx;
}

/** El contexto en curso, o uno mínimo de sistema (tareas programadas, menú). */
function doc2CtxActual_(actor) {
  if (DOC2_CTX) return DOC2_CTX;
  return {
    requestId: docTraceId_(),
    accion: 'sistema',
    actor: actor || 'sistema',
    actorId: actor || 'sistema',
    actorDisplay: actor || 'sistema',
    rol: 'admin',
    capacidades: doc2CapacidadesDe_('admin'),
    porLlave: true,
    origen: 'sistema',
    metodo: 'INTERNO',
    ahora: docNow_()
  };
}

/**
 * Exige una capacidad. Lanza `PERMISO_INSUFICIENTE` si no la tiene.
 *
 * El mensaje dice qué rol tiene y qué rol haría falta, porque «no autorizado» a
 * secas obliga a abrir un ticket para averiguar algo que el sistema ya sabe.
 */
function doc2Autorizar_(ctx, capacidad) {
  var contexto = ctx || doc2CtxActual_();

  // Segunda llave para lo sensible, si el libro lo exige.
  if (DOC2_CAPACIDADES_SENSIBLES.indexOf(capacidad) >= 0 &&
      doc2ConfigBool_('exigir_llave_admin', false) &&
      contexto.porLlave !== true) {
    throw docError_(DOC2_CODE.PERMISO_INSUFICIENTE,
      'Esta operación exige la llave de administración.',
      {
        hint: 'Este libro está configurado para pedir la llave en operaciones sensibles. Pídesela a quien administra el módulo o desactiva "exigir_llave_admin".',
        details: { capacidad: capacidad, requiereLlave: true }
      });
  }

  if (doc2RolPuede_(contexto.rol, capacidad)) return true;

  var rolesQuePueden = [];
  for (var i = 0; i < DOC2_ROLES.length; i++) {
    if (doc2RolPuede_(DOC2_ROLES[i], capacidad)) rolesQuePueden.push(DOC2_ROLES[i]);
  }

  throw docError_(DOC2_CODE.PERMISO_INSUFICIENTE,
    'Tu rol (' + contexto.rol + ') no puede ' + capacidad + '.',
    {
      hint: rolesQuePueden.length
        ? ('Esta acción está reservada a: ' + rolesQuePueden.join(', ') + '. Pide acceso al administrador del módulo.')
        : 'Esta acción no está habilitada.',
      details: { rol: contexto.rol, capacidad: capacidad, rolesPermitidos: rolesQuePueden }
    });
}

/** ¿Puede? Sin lanzar. Lo usan las respuestas para decirle a la interfaz qué mostrar. */
function doc2Puede_(ctx, capacidad) {
  return doc2RolPuede_((ctx || doc2CtxActual_()).rol, capacidad);
}

/** Mapa de capacidades del actor, para que el frontend oculte lo que no aplica. */
function doc2CapacidadesMapa_(ctx) {
  var contexto = ctx || doc2CtxActual_();
  var salida = {};
  for (var clave in DOC2_CAPACIDAD) {
    if (!Object.prototype.hasOwnProperty.call(DOC2_CAPACIDAD, clave)) continue;
    var capacidad = DOC2_CAPACIDAD[clave];
    salida[capacidad] = doc2RolPuede_(contexto.rol, capacidad);
  }
  return salida;
}

/**
 * ¿Puede ver comentarios internos?
 *
 * Un comentario `interno` es una nota entre quienes gestionan el expediente
 * («la persona dice que el título llega la semana que viene, insistir»). No debe
 * salir del equipo. Los `formal` y `operativa` sí los ve cualquiera con acceso de
 * lectura.
 */
function doc2VeComentariosInternos_(ctx) {
  var contexto = ctx || doc2CtxActual_();
  return doc2RolPuede_(contexto.rol, DOC2_CAPACIDAD.REVISAR) || doc2RolPuede_(contexto.rol, DOC2_CAPACIDAD.EDITAR);
}

/**
 * Guarda el mapa de roles.
 *
 * Es la única forma de conceder permisos, y solo la puede ejecutar quien tenga
 * la capacidad `configurar`. Se valida que cada rol exista: un rol mal escrito
 * dejaría a esa persona como invitada sin que nadie entendiera por qué.
 */
function doc2GuardarRoles_(mapa, ctx) {
  doc2Autorizar_(ctx, DOC2_CAPACIDAD.CONFIGURAR);
  var entrada = mapa || {};
  var limpio = {};
  var rechazados = [];
  var claves = Object.keys(entrada);
  for (var i = 0; i < claves.length; i++) {
    var actor = docRaw_(claves[i], 240).trim();
    var rol = String(entrada[claves[i]] || '').toLowerCase();
    if (!actor) continue;
    if (DOC2_ROLES.indexOf(rol) < 0) {
      rechazados.push({ actor: actor, rol: rol, motivo: 'Rol desconocido.' });
      continue;
    }
    limpio[actor] = rol;
  }
  doc2ConfigSet_('roles_por_actor', limpio, ctx);
  doc2Audit_({
    tipo: 'permisos.actualizados', entidadTipo: 'sistema', actor: ctx.actor, origen: ctx.origen,
    resultado: rechazados.length ? 'parcial' : 'ok',
    metadata: { actores: Object.keys(limpio).length, rechazados: rechazados.length }
  });
  return { roles: limpio, rechazados: rechazados };
}
