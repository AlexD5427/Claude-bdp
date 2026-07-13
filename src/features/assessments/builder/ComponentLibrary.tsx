import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { L } from "../../../content/locale";
import { allPlugins, type PluginCategory, type QuestionPlugin } from "../question-types";
import { pluginIcon } from "./pluginIcons";

interface LibraryProps {
  onAdd: (blockType: string) => void;
}

const GROUP_ORDER: { category: PluginCategory; label: string }[] = [
  { category: "content", label: L.builder.groups.content },
  { category: "answer", label: L.builder.groups.questions },
  { category: "media", label: L.builder.groups.media },
  { category: "simulation", label: L.builder.groups.simulations },
];

/** Left panel: searchable component library grouped by category. */
export function ComponentLibrary({ onAdd }: LibraryProps) {
  const [query, setQuery] = useState("");
  const plugins = useMemo(() => allPlugins(), []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return plugins.filter((p) => !q || p.label.toLowerCase().includes(q));
  }, [plugins, query]);

  const groups = GROUP_ORDER.map((g) => ({
    ...g,
    items: filtered.filter((p) => p.category === g.category),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex h-full flex-col">
      <div className="relative p-3">
        <Search className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={L.builder.library}
          aria-label={L.builder.library}
          className="w-full rounded-full fill-soft py-2 pl-9 pr-3 text-sm text-ink outline-none ring-1 ring-[color:var(--hairline)] focus-visible:ring-2 focus-visible:ring-cyan-300"
        />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {groups.map((g) => (
          <section key={g.category} className="mb-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">{g.label}</h3>
            <div className="flex flex-col gap-1.5">
              {g.items.map((p) => (
                <LibraryItem key={p.type} plugin={p} onAdd={() => onAdd(p.type)} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function LibraryItem({ plugin, onAdd }: { plugin: QuestionPlugin; onAdd: () => void }) {
  const Icon = pluginIcon(plugin.icon);
  return (
    <button
      type="button"
      onClick={onAdd}
      className="group flex items-center gap-2.5 rounded-xl fill-soft px-3 py-2 text-left text-sm text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:-translate-y-0.5 hover:fill-softer"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#00b0d8]/80 to-[#005baa]/80 text-white">
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1 truncate font-medium">{plugin.label}</span>
      {plugin.status !== "stable" && (
        <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[0.6rem] font-bold text-amber-200">
          {plugin.status === "contract" ? "contrato" : "beta"}
        </span>
      )}
    </button>
  );
}
