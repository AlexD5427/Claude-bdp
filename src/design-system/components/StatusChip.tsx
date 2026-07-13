import type { StatusMeta } from "../../features/processes/statuses";

/**
 * A small status pill driven by the shared status metadata (label + semantic
 * colour tokens). Status is communicated by both a coloured dot and text — never
 * colour alone — to satisfy the accessibility requirement.
 */
export function StatusChip({ meta, className = "" }: { meta: StatusMeta; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[0.7rem] font-semibold ring-1 ${meta.chip} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden />
      {meta.label}
    </span>
  );
}
