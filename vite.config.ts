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
         * Un solo paquete de casi 1 MB obligaba a descargar, analizar y compilar
         * las bibliotecas grandes antes de pintar el primer píxel — el peor
         * escenario para el equipo más modesto del área, que es justo donde se
         * reportaban los problemas. Separar React y Framer Motion permite al
         * navegador cachearlos entre despliegues (cambian mucho menos que
         * nuestro código) y descargarlos en paralelo.
         *
         * `lucide-react` NO se separa a propósito: al nombrarlo aquí, Rollup deja
         * de sacudir el árbol y empaqueta los ~1.500 iconos de la biblioteca
         * (777 kB) en lugar de los que realmente se usan.
         */
        manualChunks: {
          react: ["react", "react-dom"],
          motion: ["framer-motion"],
        },
      },
    },
  },
});
