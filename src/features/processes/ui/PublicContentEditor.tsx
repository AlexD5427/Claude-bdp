import { useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { newId } from "../../../shared/ids";
import { sanitizeText, sanitizeMultiline } from "../../../shared/sanitize";
import { Select, TextInput, TextArea } from "../../../design-system/liquid-glass/fields";
import { PUBLIC_BLOCK_LABELS, type PublicContentBlock, type PublicContentBlockType } from "../domain/publicContent";

interface EditorProps {
  blocks: PublicContentBlock[];
  onChange: (blocks: PublicContentBlock[]) => void;
}

const ADDABLE: PublicContentBlockType[] = [
  "hero", "summary", "richText", "responsibilities", "requirements", "benefits",
  "location", "applicationInstructions", "assessmentInformation", "privacyNotice", "contactHelp",
];

function createBlock(type: PublicContentBlockType): PublicContentBlock {
  const id = newId("blk");
  switch (type) {
    case "hero": return { id, type, title: "", subtitle: "", imageUrl: null };
    case "summary": return { id, type, text: "" };
    case "richText": return { id, type, text: "" };
    case "responsibilities": return { id, type, items: [] };
    case "requirements": return { id, type, items: [] };
    case "benefits": return { id, type, items: [] };
    case "location": return { id, type, label: "", mapUrl: null };
    case "applicationInstructions": return { id, type, text: "" };
    case "assessmentInformation": return { id, type, text: "" };
    case "privacyNotice": return { id, type, text: "" };
    case "contactHelp": return { id, type, email: null, text: "" };
    default: return { id, type: "summary", text: "" };
  }
}

/**
 * Schema-driven public content editor.
 *
 * Content is stored as structured, sanitized plain text — never raw HTML/CSS/JS.
 * The candidate portal renders these blocks with React (auto-escaped), so no
 * backend-provided markup is ever executed.
 */
export function PublicContentEditor({ blocks, onChange }: EditorProps) {
  const [adding, setAdding] = useState<PublicContentBlockType>("summary");

  const update = (id: string, patch: Partial<PublicContentBlock>) =>
    onChange(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as PublicContentBlock) : b)));
  const remove = (id: string) => onChange(blocks.filter((b) => b.id !== id));
  const move = (index: number, dir: -1 | 1) => {
    const next = [...blocks];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block, i) => (
        <div key={block.id} className="rounded-2xl fill-soft p-3 ring-1 ring-[color:var(--hairline)]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-soft">{PUBLIC_BLOCK_LABELS[block.type]}</span>
            <div className="flex items-center gap-1">
              <button type="button" aria-label={`Mover arriba`} onClick={() => move(i, -1)} disabled={i === 0} className="grid h-7 w-7 place-items-center rounded-full text-ink-soft hover:fill-softer disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
              <button type="button" aria-label={`Mover abajo`} onClick={() => move(i, 1)} disabled={i === blocks.length - 1} className="grid h-7 w-7 place-items-center rounded-full text-ink-soft hover:fill-softer disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
              <button type="button" aria-label="Eliminar bloque" onClick={() => remove(block.id)} className="grid h-7 w-7 place-items-center rounded-full text-ink-soft hover:bg-rose-500/70 hover:text-white"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
          <BlockFields block={block} onPatch={(p) => update(block.id, p)} />
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Select value={adding} onChange={(e) => setAdding(e.target.value as PublicContentBlockType)} className="max-w-[14rem]">
          {ADDABLE.map((t) => <option key={t} value={t}>{PUBLIC_BLOCK_LABELS[t]}</option>)}
        </Select>
        <button
          type="button"
          onClick={() => onChange([...blocks, createBlock(adding)])}
          className="inline-flex items-center gap-1.5 rounded-full fill-softer px-3 py-2 text-xs font-semibold text-ink ring-1 ring-[color:var(--hairline)] hover:fill-soft"
        >
          <Plus className="h-4 w-4" /> Agregar bloque
        </button>
      </div>
    </div>
  );
}

function BlockFields({ block, onPatch }: { block: PublicContentBlock; onPatch: (p: Partial<PublicContentBlock>) => void }) {
  const listBlocks = ["responsibilities", "requirements", "benefits"] as const;
  if ((listBlocks as readonly string[]).includes(block.type)) {
    const items = (block as { items: string[] }).items;
    return (
      <TextArea
        value={items.join("\n")}
        placeholder="Un elemento por línea"
        onChange={(e) => onPatch({ items: e.target.value.split("\n").map((s) => sanitizeText(s, 500)).filter(Boolean) } as Partial<PublicContentBlock>)}
      />
    );
  }
  switch (block.type) {
    case "hero":
      return (
        <div className="flex flex-col gap-2">
          <TextInput placeholder="Título" value={block.title} onChange={(e) => onPatch({ title: sanitizeText(e.target.value, 200) } as Partial<PublicContentBlock>)} />
          <TextInput placeholder="Subtítulo" value={block.subtitle} onChange={(e) => onPatch({ subtitle: sanitizeText(e.target.value, 400) } as Partial<PublicContentBlock>)} />
        </div>
      );
    case "location":
      return <TextInput placeholder="Ubicación" value={block.label} onChange={(e) => onPatch({ label: sanitizeText(e.target.value, 300) } as Partial<PublicContentBlock>)} />;
    case "contactHelp":
      return (
        <div className="flex flex-col gap-2">
          <TextInput type="email" placeholder="correo@dominio.com" value={block.email ?? ""} onChange={(e) => onPatch({ email: e.target.value || null } as Partial<PublicContentBlock>)} />
          <TextArea placeholder="Texto de ayuda" value={block.text} onChange={(e) => onPatch({ text: sanitizeMultiline(e.target.value, 2000) } as Partial<PublicContentBlock>)} />
        </div>
      );
    default: {
      const text = (block as { text?: string }).text ?? "";
      return <TextArea value={text} onChange={(e) => onPatch({ text: sanitizeMultiline(e.target.value, 8000) } as Partial<PublicContentBlock>)} />;
    }
  }
}
