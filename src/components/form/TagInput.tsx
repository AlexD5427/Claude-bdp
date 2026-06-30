import { useState } from "react";
import { X } from "lucide-react";

interface TagInputProps {
  label: string;
  hint?: string;
  /** Comma / Enter separated values, kept as an array. */
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

/**
 * A chip / tag editor. Typing a comma (or Enter) commits the current token as
 * a tag; backspace on an empty field removes the last one. Used for
 * "Observaciones — separe por comas para generar etiquetas".
 */
export function TagInput({
  label,
  hint,
  tags,
  onChange,
  placeholder = "Escriba y separe por comas…",
}: TagInputProps) {
  const [draft, setDraft] = useState("");

  function commit(token: string) {
    const value = token.trim();
    if (!value) return;
    if (!tags.some((t) => t.toLowerCase() === value.toLowerCase())) {
      onChange([...tags, value]);
    }
    setDraft("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          {label}
        </span>
        {hint && <span className="text-[0.65rem] text-ink-faint">{hint}</span>}
      </span>
      <div className="glass flex flex-wrap items-center gap-1.5 rounded-xl px-2.5 py-2 focus-within:ring-2 focus-within:ring-cyan-400/70">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-[#00b0d8]/80 to-[#005baa]/80 px-2.5 py-1 text-xs font-semibold text-white ring-1 ring-white/30"
          >
            {tag}
            <button
              type="button"
              aria-label={`Quitar ${tag}`}
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="grid h-4 w-4 place-items-center rounded-full bg-white/20 transition-colors hover:bg-rose-500/80"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
          placeholder={tags.length ? "" : placeholder}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-ink placeholder:text-ink-faint outline-none"
        />
      </div>
    </div>
  );
}
