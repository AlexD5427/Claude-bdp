import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    target: "es2020",
    sourcemap: false,
    rollupOptions: {
      output: {
        /**
         * Reparto de los paquetes de terceros.
         *
         * El paquete de entrada arrastraba React, Framer Motion y los iconos
         * junto a todo el código de la aplicación en un solo archivo de un mega.
         * Eso no sólo pesa: **invalida la caché del navegador en cada
         * despliegue**, porque cambiar una línea de un módulo obliga a volver a
         * descargar también las librerías, que no han cambiado en meses. Separar
         * los dos grupos que sí son estables deja que el navegador reutilice
         * ~85 kB comprimidos entre despliegues y que la aplicación descargue
         * sólo lo suyo.
         *
         * `lucide-react` queda deliberadamente FUERA de este reparto: agruparlo
         * anula su sacudida de árbol y el paquete pasa de unos pocos iconos a los
         * 777 kB de la biblioteca completa (medido). `three` tampoco se toca: ya
         * sale aparte por su propia importación diferida.
         */
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "vendor-react";
          if (id.includes("framer-motion") || id.includes("motion-dom") || id.includes("motion-utils")) {
            return "vendor-motion";
          }
        },
      },
    },
  },
});
