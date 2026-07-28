/**
 * Réplica del lanzador de funciones de Vercel (runtime Node.js).
 *
 * Las pruebas del backend intermedio llamaban antes al `export default` de cada
 * archivo de `api/`. Eso comprobaba la lógica, pero no el CONTRATO con la
 * plataforma, y ahí estaba el fallo de producción: Vercel no invoca esas
 * funciones como nosotros las llamábamos.
 *
 * La decisión real está en
 * `vercel/vercel · packages/node/src/serverless-functions/serverless-handler.mts`:
 *
 * ```js
 * let listener = await import(id);
 * for (let i = 0; i < 5; i++) { if (listener.default) listener = listener.default; }
 * const shouldUseWebHandlers =
 *   options.isMiddleware ||
 *   HTTP_METHODS.some(method => typeof listener[method] === 'function') ||
 *   typeof listener.fetch === 'function';
 * ```
 *
 * Dos consecuencias que este archivo hace visibles en las pruebas:
 *
 *  1. Solo las exportaciones con nombre de método HTTP (o `fetch`) reciben la API web
 *     `(Request) => Response`. Un `export default` se invoca al estilo Node,
 *     `(req, res)`, y nuestro código estallaría al llamar `headers.get(...)`.
 *  2. Si existe `default`, el lanzador lo desenvuelve ANTES de buscar los
 *     métodos, así que un `export default` residual dejaría inertes a `GET` y
 *     `POST`. Por eso `api/evaluations/*.ts` no exporta `default`.
 *
 * Los métodos que el módulo no exporta responden `405` sin cuerpo, igual que el
 * `defaultHttpHandler` de la plataforma.
 */

export type WebHandler = (request: Request) => Promise<Response> | Response;

/** Métodos que el lanzador de Vercel busca, en su mismo orden. */
export const HTTP_METHODS = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "DELETE", "PATCH"] as const;

export type VercelFunctionModule = Record<string, unknown>;

/** ¿Vercel tratará este módulo como handler web? */
export function usesWebHandlers(module: VercelFunctionModule): boolean {
  let listener: unknown = module;
  for (let i = 0; i < 5; i++) {
    const candidate = (listener as Record<string, unknown> | null)?.default;
    if (candidate) listener = candidate;
  }
  const exported = listener as Record<string, unknown>;
  return (
    HTTP_METHODS.some((method) => typeof exported[method] === "function") ||
    typeof exported.fetch === "function"
  );
}

/** Handlers web por método, tal como los resolvería la plataforma. */
export function webHandlersOf(module: VercelFunctionModule): Partial<Record<string, WebHandler>> {
  if (!usesWebHandlers(module)) return {};
  const handlers: Partial<Record<string, WebHandler>> = {};
  for (const method of HTTP_METHODS) {
    const candidate = module[method];
    if (typeof candidate === "function") handlers[method] = candidate as WebHandler;
  }
  return handlers;
}

/**
 * Invoca la función como lo haría Vercel: despachando por método HTTP.
 *
 * Si el módulo no expone handlers web, se lanza un error explícito: en
 * producción ese caso es el `FUNCTION_INVOCATION_FAILED` que originó esta
 * reparación, y una prueba debe verlo como fallo, no como respuesta vacía.
 */
export async function invokeVercelFunction(
  module: VercelFunctionModule,
  request: Request,
): Promise<Response> {
  if (!usesWebHandlers(module)) {
    throw new Error(
      "El módulo no exporta handlers web (GET/POST/…): Vercel lo invocaría como handler de Node y fallaría.",
    );
  }
  const handler = webHandlersOf(module)[request.method];
  if (!handler) return new Response(null, { status: 405 });
  return handler(request);
}
