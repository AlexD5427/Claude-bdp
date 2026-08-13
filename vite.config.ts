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
         * Las dependencias que nunca cambian viajan en su propio archivo.
         *
         * Antes todo el proveedor iba dentro del bundle de entrada, así que
         * cualquier cambio de una línea nuestra invalidaba ~1 MB de caché del
         * navegador y el analista volvía a descargar React entero. Separarlos
         * también adelanta el primer dibujado: se piden en paralelo.
         *
         * `lucide-react` NO entra aquí a propósito: nombrar el paquete completo
         * obliga a Rollup a incluir sus ~1.500 iconos, y el sistema usa unas
         * pocas docenas. Dejarlo fuera conserva el sacudido del árbol.
         */
        manualChunks: {
          react: ["react", "react-dom"],
          motion: ["framer-motion"],
        },
      },
    },
  },
});
