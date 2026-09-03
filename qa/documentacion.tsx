import { createRoot } from "react-dom/client";
import { ThemeProvider } from "../src/context/ThemeContext";
import { DocumentacionConsola } from "../src/features/documentacion/ui/DocumentacionConsola";
import "../src/index.css";

/**
 * Punto de entrada de las sondas: el módulo solo, sin el resto de la aplicación.
 *
 * `ThemeProvider` sí va: es el que aplica la clase de tema en `<html>` y con ella
 * todas las variables de color. Sin él las capturas saldrían con los valores de
 * reserva y las sondas de contraste medirían un tema que nadie ve.
 */
createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <div className="min-h-screen px-4 py-6">
      <DocumentacionConsola />
    </div>
  </ThemeProvider>,
);
