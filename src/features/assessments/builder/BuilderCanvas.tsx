import { motion } from "framer-motion";
import { Plus, Trash2, ChevronUp, ChevronDown, Copy, GripVertical } from "lucide-react";
import { L } from "../../../content/locale";
import { TextInput } from "../../../design-system/liquid-glass/fields";
import { BlockRenderer } from "./BlockRenderer";
import type { AssessmentContent } from "../domain/assessment";
import type { BuilderAction } from "./builderState";

interface CanvasProps {
  content: AssessmentContent;
  selectedBlockId: string | null;
  dispatch: (action: BuilderAction) => void;
  onAddBlock: (sectionId: string) => void;
}

/** Center canvas: sections → blocks with selection, reorder, duplicate, delete. */
export function BuilderCanvas({ content, selectedBlockId, dispatch, onAddBlock }: CanvasProps) {
  if (content.sections.length === 0) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div>
          <p className="text-sm text-ink-soft">{L.builder.emptyCanvas}</p>
          <button
            type="button"
            onClick={() => dispatch({ type: "addSection" })}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-4 py-2 text-sm font-bold text-white shadow-glass ring-1 ring-white/30"
          >
            <Plus className="h-4 w-4" /> {L.builder.addSection}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {content.sections.map((section, sIdx) => (
        <section key={section.id} className="glass rounded-3xl p-4">
          <div className="mb-3 flex items-center gap-2">
            <TextInput
              value={section.title}
              onChange={(e) => dispatch({ type: "updateSection", sectionId: section.id, patch: { title: e.target.value } })}
              className="flex-1 !bg-transparent !text-base !font-black"
              aria-label="Título de sección"
            />
            <div className="flex items-center gap-1">
              <IconBtn label={L.builder.moveUp} disabled={sIdx === 0} onClick={() => dispatch({ type: "moveSection", sectionId: section.id, dir: -1 })}><ChevronUp className="h-4 w-4" /></IconBtn>
              <IconBtn label={L.builder.moveDown} disabled={sIdx === content.sections.length - 1} onClick={() => dispatch({ type: "moveSection", sectionId: section.id, dir: 1 })}><ChevronDown className="h-4 w-4" /></IconBtn>
              <IconBtn label={L.common.delete} danger onClick={() => dispatch({ type: "removeSection", sectionId: section.id })}><Trash2 className="h-4 w-4" /></IconBtn>
            </div>
          </div>

          {section.blocks.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[color:var(--hairline)] py-6 text-center text-xs text-ink-faint">
              {L.builder.emptySection}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {section.blocks.map((block, bIdx) => {
                const selected = block.id === selectedBlockId;
                return (
                  <motion.li
                    layout
                    key={block.id}
                    className={`rounded-2xl fill-soft p-3 ring-1 transition-colors ${selected ? "ring-cyan-400" : "ring-[color:var(--hairline)]"}`}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        aria-label={`${L.a11y.dragHandle}. ${L.a11y.moveWithKeyboard}`}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowUp") { e.preventDefault(); dispatch({ type: "moveBlock", blockId: block.id, dir: -1 }); }
                          if (e.key === "ArrowDown") { e.preventDefault(); dispatch({ type: "moveBlock", blockId: block.id, dir: 1 }); }
                        }}
                        className="mt-1 shrink-0 cursor-grab text-ink-faint hover:text-ink focus-visible:ring-2 focus-visible:ring-cyan-300"
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => dispatch({ type: "select", blockId: block.id, sectionId: section.id })}
                        className="min-w-0 flex-1 text-left"
                      >
                        <BlockRenderer block={block} />
                      </button>
                      <div className="flex shrink-0 flex-col gap-1">
                        <IconBtn label={L.builder.moveUp} disabled={bIdx === 0} onClick={() => dispatch({ type: "moveBlock", blockId: block.id, dir: -1 })}><ChevronUp className="h-3.5 w-3.5" /></IconBtn>
                        <IconBtn label={L.builder.moveDown} disabled={bIdx === section.blocks.length - 1} onClick={() => dispatch({ type: "moveBlock", blockId: block.id, dir: 1 })}><ChevronDown className="h-3.5 w-3.5" /></IconBtn>
                        <IconBtn label={L.common.duplicate} onClick={() => dispatch({ type: "duplicateBlock", blockId: block.id })}><Copy className="h-3.5 w-3.5" /></IconBtn>
                        <IconBtn label={L.common.delete} danger onClick={() => dispatch({ type: "removeBlock", blockId: block.id })}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          )}

          <button
            type="button"
            onClick={() => onAddBlock(section.id)}
            className="mt-3 inline-flex items-center gap-2 rounded-full fill-softer px-3 py-1.5 text-xs font-semibold text-ink ring-1 ring-[color:var(--hairline)] hover:fill-soft"
          >
            <Plus className="h-4 w-4" /> {L.builder.addBlock}
          </button>
        </section>
      ))}

      <button
        type="button"
        onClick={() => dispatch({ type: "addSection" })}
        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[color:var(--hairline)] py-3 text-sm font-semibold text-ink-soft hover:text-ink"
      >
        <Plus className="h-4 w-4" /> {L.builder.addSection}
      </button>
    </div>
  );
}

function IconBtn({ children, label, onClick, disabled, danger }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid h-7 w-7 place-items-center rounded-full text-ink-soft transition-colors disabled:opacity-30 ${danger ? "hover:bg-rose-500/70 hover:text-white" : "hover:fill-softer hover:text-ink"}`}
    >
      {children}
    </button>
  );
}
