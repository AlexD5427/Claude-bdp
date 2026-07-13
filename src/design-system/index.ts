/**
 * Design-system barrel.
 *
 * Re-exports the Liquid Glass primitives (existing + new) plus tokens and motion
 * presets so feature modules import from a single, stable surface.
 */

export { GlassCard } from "../components/GlassCard";
export { LoadingState, ErrorState, EmptyState } from "../components/States";
export { Modal } from "../components/Modal";

export * from "./tokens";
export * from "./motion";
export { StatusPill } from "./liquid-glass/StatusPill";
export { Chip } from "./liquid-glass/Chip";
export { Segmented, type SegmentedOption } from "./liquid-glass/Segmented";
export { GlassDrawer } from "./liquid-glass/GlassDrawer";
export { GlassDialog } from "./liquid-glass/GlassDialog";
export { ToastViewport, toast, dismiss } from "./liquid-glass/toast";
export {
  Field,
  TextInput,
  TextArea,
  Select,
  NumberField,
  Switch,
} from "./liquid-glass/fields";
