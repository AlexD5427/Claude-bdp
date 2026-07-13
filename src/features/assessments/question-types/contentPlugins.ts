/**
 * Content plugins — non-scored blocks that present information: titles,
 * paragraphs, instructions, callouts, dividers, page breaks, and media.
 */

import { makeBlock, noScore } from "./helpers";
import { type QuestionPlugin } from "./registry";

function contentPlugin(
  type: string,
  label: string,
  icon: string,
  defaults: Parameters<typeof makeBlock>[2] = {},
): QuestionPlugin {
  return {
    type,
    label,
    category: "content",
    icon,
    isQuestion: false,
    status: "stable",
    createDefault: (id) => makeBlock(id, type, defaults),
    validate: () => ({ valid: true }),
    score: noScore,
    a11y: { role: "group", needsGroup: false },
  };
}

export const contentPlugins: QuestionPlugin[] = [
  contentPlugin("c_title", "Título", "Heading1", { label: "Título de sección" }),
  contentPlugin("c_subtitle", "Subtítulo", "Heading2", { label: "Subtítulo" }),
  contentPlugin("c_paragraph", "Párrafo", "Text", {
    label: "",
    description: "Escribe el contenido del párrafo.",
  }),
  contentPlugin("c_rich_text", "Texto enriquecido", "AlignLeft", {
    description: "Texto con formato básico (se sanitiza al guardar).",
  }),
  contentPlugin("c_instructions", "Instrucciones", "Info", {
    label: "Instrucciones",
    description: "Lee con atención antes de continuar.",
  }),
  contentPlugin("c_callout", "Aviso destacado", "Megaphone", {
    label: "Aviso",
    config: { tone: "info" },
  }),
  contentPlugin("c_divider", "Separador", "Minus"),
  contentPlugin("c_page_break", "Salto de página", "SeparatorHorizontal"),
  contentPlugin("c_image", "Imagen", "Image", {
    media: { kind: "image", url: "", alt: "" },
  }),
  contentPlugin("c_video", "Video accesible", "Video", {
    media: { kind: "video", url: "", alt: "" },
  }),
  contentPlugin("c_audio", "Audio accesible", "Volume2", {
    media: { kind: "audio", url: "", alt: "" },
  }),
  contentPlugin("c_resource", "PDF / recurso", "FileText", {
    media: { kind: "resource", url: "", alt: "" },
  }),
];
