import { createRoot } from "react-dom/client";
import { DocumentacionConsola } from "../src/features/documentacion/ui/DocumentacionConsola";
import "../src/index.css";

createRoot(document.getElementById("root")!).render(
  <div className="min-h-screen px-4 py-6">
    <DocumentacionConsola />
  </div>,
);
