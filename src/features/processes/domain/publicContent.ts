/**
 * Schema-driven public content blocks for a process's candidate-facing page.
 *
 * SECURITY: content is stored as plain text / structured data — never raw HTML,
 * CSS, or JavaScript. The renderer builds React elements from this data and lets
 * React escape everything. URLs are constrained to http(s). This keeps the
 * future Candidate Portal safe from injected markup and scripts.
 */

import { z } from "zod";

/** Only http(s) URLs are accepted (no javascript:, data:, etc.). */
export const safeUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .refine((u) => /^https?:\/\//i.test(u), "La URL debe iniciar con http:// o https://");

const blockBase = { id: z.string() };

export const publicContentBlockSchema = z.discriminatedUnion("type", [
  z.object({
    ...blockBase,
    type: z.literal("hero"),
    title: z.string().max(200),
    subtitle: z.string().max(400).default(""),
    imageUrl: safeUrlSchema.nullable().default(null),
  }),
  z.object({ ...blockBase, type: z.literal("summary"), text: z.string().max(2000) }),
  z.object({ ...blockBase, type: z.literal("richText"), text: z.string().max(20000) }),
  z.object({
    ...blockBase,
    type: z.literal("responsibilities"),
    items: z.array(z.string().max(500)).max(50).default([]),
  }),
  z.object({
    ...blockBase,
    type: z.literal("requirements"),
    items: z.array(z.string().max(500)).max(50).default([]),
  }),
  z.object({
    ...blockBase,
    type: z.literal("benefits"),
    items: z.array(z.string().max(500)).max(50).default([]),
  }),
  z.object({
    ...blockBase,
    type: z.literal("location"),
    label: z.string().max(300),
    mapUrl: safeUrlSchema.nullable().default(null),
  }),
  z.object({
    ...blockBase,
    type: z.literal("image"),
    url: safeUrlSchema,
    alt: z.string().max(300).default(""),
  }),
  z.object({
    ...blockBase,
    type: z.literal("gallery"),
    images: z
      .array(z.object({ url: safeUrlSchema, alt: z.string().max(300).default("") }))
      .max(20)
      .default([]),
  }),
  z.object({
    ...blockBase,
    type: z.literal("video"),
    url: safeUrlSchema,
    caption: z.string().max(300).default(""),
  }),
  z.object({
    ...blockBase,
    type: z.literal("faq"),
    items: z
      .array(z.object({ q: z.string().max(300), a: z.string().max(2000) }))
      .max(30)
      .default([]),
  }),
  z.object({
    ...blockBase,
    type: z.literal("applicationInstructions"),
    text: z.string().max(4000),
  }),
  z.object({
    ...blockBase,
    type: z.literal("assessmentInformation"),
    text: z.string().max(4000),
  }),
  z.object({ ...blockBase, type: z.literal("privacyNotice"), text: z.string().max(8000) }),
  z.object({
    ...blockBase,
    type: z.literal("contactHelp"),
    email: z.string().email().max(320).nullable().default(null),
    text: z.string().max(2000).default(""),
  }),
]);

export type PublicContentBlock = z.infer<typeof publicContentBlockSchema>;
export type PublicContentBlockType = PublicContentBlock["type"];

export const PUBLIC_BLOCK_LABELS: Record<PublicContentBlockType, string> = {
  hero: "Portada",
  summary: "Resumen",
  richText: "Texto enriquecido",
  responsibilities: "Responsabilidades",
  requirements: "Requisitos",
  benefits: "Beneficios",
  location: "Ubicación",
  image: "Imagen",
  gallery: "Galería",
  video: "Video",
  faq: "Preguntas frecuentes",
  applicationInstructions: "Instrucciones de postulación",
  assessmentInformation: "Información de evaluaciones",
  privacyNotice: "Aviso de privacidad",
  contactHelp: "Contacto / ayuda",
};
