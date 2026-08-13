/**
 * Servidor estático mínimo para servir `dist/` durante el QA.
 *
 * No se usa `vite preview` para que el arnés no dependa de la configuración de
 * Vite ni de su puerto: aquí sólo hace falta devolver los archivos del build y
 * caer en `index.html` para cualquier ruta (la aplicación resuelve el hash).
 */

import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

export function serveDist(root, port = 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let file = join(root, normalize(decodeURIComponent(url.pathname)));
    if (!file.startsWith(root)) file = join(root, "index.html");
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html");
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    createReadStream(file).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const { port: actual } = server.address();
      resolve({
        url: `http://127.0.0.1:${actual}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}
