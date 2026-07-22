import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  Reorder,
  useDragControls,
} from "framer-motion";
import {
  ImagePlus,
  Images,
  Trash2,
  GripVertical,
  Loader2,
  ImageOff,
  Eye,
  Check,
  X,
  Plus,
} from "lucide-react";
import { MAX_IMAGENES, isLikelyUrl } from "../../lib/perfilCargo";
import { toast } from "../../design-system/liquid-glass/toast";
import { newId } from "../../shared/ids";

interface Item {
  id: string;
  url: string;
}

/**
 * The image board for a job profile. Up to ten links live in ordered slots; the
 * read-only frontend cycles them in a flat carousel, so this editor mirrors that
 * intent in miniature:
 *
 *   · An inviting empty state, then a live "add" panel that loads the pasted URL
 *     and only accepts it once the image actually renders.
 *   · Each confirmed image is a labelled thumbnail ("Imagen N") with an editable
 *     link, drag-to-reorder (a handle keeps typing and dragging separate) and a
 *     remove control.
 *   · A "Vista previa" switch that plays the cyclic carousel and freezes the
 *     rest of the controls while it's on.
 *
 * Reordering here only rewrites the in-memory order; the parent serialises it
 * into `link_img_1…N` on save, which is what moves the links on the backend.
 */
export function ImageManager({
  images,
  onChange,
  previewMode,
  onPreviewModeChange,
}: {
  images: string[];
  onChange: (next: string[]) => void;
  previewMode: boolean;
  onPreviewModeChange: (on: boolean) => void;
}) {
  // Keep stable ids across renders so drag + inputs never lose focus.
  const idsRef = useRef<string[]>([]);
  const items = useMemo<Item[]>(() => {
    while (idsRef.current.length < images.length) idsRef.current.push(newId("img"));
    idsRef.current.length = images.length;
    return images.map((url, i) => ({ id: idsRef.current[i], url }));
  }, [images]);

  const [adding, setAdding] = useState(false);
  const full = images.length >= MAX_IMAGENES;

  const setOrder = (next: Item[]) => {
    idsRef.current = next.map((i) => i.id);
    onChange(next.map((i) => i.url));
  };
  const editAt = (i: number, url: string) => {
    const next = images.slice();
    next[i] = url;
    onChange(next);
  };
  const removeAt = (i: number) => {
    idsRef.current.splice(i, 1);
    onChange(images.filter((_, idx) => idx !== i));
  };
  const commitNew = (url: string) => {
    if (images.length >= MAX_IMAGENES) return;
    idsRef.current.push(newId("img"));
    onChange([...images, url]);
    setAdding(false);
  };

  /* ---- Preview carousel ---- */
  if (previewMode) {
    return (
      <PreviewCarousel images={images} onExit={() => onPreviewModeChange(false)} />
    );
  }

  /* ---- Empty invitation ---- */
  if (images.length === 0 && !adding) {
    return (
      <motion.button
        type="button"
        onClick={() => setAdding(true)}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="group relative flex w-full flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-[color:var(--hairline)] fill-soft px-6 py-12 text-center transition-all duration-500 ease-spring hover:-translate-y-0.5 hover:border-cyan-300/50 hover:fill-softer"
      >
        <motion.span
          className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white shadow-glow-cyan ring-1 ring-white/30"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <ImagePlus className="h-8 w-8" />
        </motion.span>
        <div>
          <p className="text-sm font-bold text-ink">Añade imágenes del perfil de cargo</p>
          <p className="mt-1 text-xs text-ink-soft">
            Haz clic para pegar el enlace de una imagen. Puedes agregar hasta {MAX_IMAGENES}.
          </p>
        </div>
      </motion.button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-soft">
          <Images className="h-4 w-4 text-cyan-400" />
          {images.length} / {MAX_IMAGENES} imágenes
        </span>
        <button
          type="button"
          onClick={() => onPreviewModeChange(true)}
          disabled={images.length === 0}
          className="inline-flex items-center gap-2 rounded-full fill-softer px-3.5 py-2 text-xs font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95 disabled:opacity-40"
        >
          <Eye className="h-3.5 w-3.5 text-cyan-400" />
          Vista previa
        </button>
      </div>

      <Reorder.Group axis="y" values={items} onReorder={setOrder} className="flex flex-col gap-3">
        {items.map((item, i) => (
          <ImageRow
            key={item.id}
            item={item}
            index={i}
            onEdit={(url) => editAt(i, url)}
            onRemove={() => removeAt(i)}
          />
        ))}
      </Reorder.Group>

      <AnimatePresence>
        {adding && (
          <AddPanel
            key="add"
            onCancel={() => setAdding(false)}
            onConfirm={commitNew}
          />
        )}
      </AnimatePresence>

      {!adding && !full && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 self-start rounded-full fill-softer px-3.5 py-2 text-xs font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all duration-300 hover:-translate-y-0.5 hover:fill-soft active:scale-95"
        >
          <Plus className="h-3.5 w-3.5 text-cyan-400" />
          Agregar otra imagen
        </button>
      )}
      {full && <p className="text-xs text-ink-faint">Alcanzaste el máximo de {MAX_IMAGENES} imágenes.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* A single reorderable image card                                     */
/* ------------------------------------------------------------------ */

function ImageRow({
  item,
  index,
  onEdit,
  onRemove,
}: {
  item: Item;
  index: number;
  onEdit: (url: string) => void;
  onRemove: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      className="glass flex items-center gap-3 rounded-2xl p-2.5"
      whileDrag={{ scale: 1.02, boxShadow: "0 18px 40px rgba(0,0,0,0.35)" }}
    >
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        aria-label={`Reordenar imagen ${index + 1}`}
        className="grid h-9 w-7 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-ink-faint transition-colors hover:text-ink active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <ImgThumb url={item.url} />

      <div className="min-w-0 flex-1">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#00b0d8]/25 to-[#005baa]/25 px-2.5 py-0.5 text-[0.65rem] font-bold text-cyan-300 ring-1 ring-cyan-400/30">
          Imagen {index + 1}
        </span>
        <input
          type="url"
          value={item.url}
          onChange={(e) => onEdit(e.target.value)}
          placeholder="https://…"
          className="mt-1.5 w-full truncate rounded-xl fill-soft px-3 py-2 text-xs text-ink outline-none ring-1 ring-[color:var(--hairline)] focus-visible:ring-2 focus-visible:ring-cyan-300"
        />
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar imagen ${index + 1}`}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-faint transition-all hover:bg-rose-500/80 hover:text-white active:scale-90"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </Reorder.Item>
  );
}

/** A 56px thumbnail that shows a spinner while loading and a broken-state icon
 *  when the URL can't be rendered. */
function ImgThumb({ url }: { url: string }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  useEffect(() => {
    setState(url.trim() ? "loading" : "error");
  }, [url]);
  return (
    <span className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl fill-softer ring-1 ring-[color:var(--hairline)]">
      {state === "loading" && <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />}
      {state === "error" && <ImageOff className="h-5 w-5 text-ink-faint" />}
      {url.trim() && (
        <img
          src={url}
          alt=""
          onLoad={() => setState("ok")}
          onError={() => setState("error")}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
            state === "ok" ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* The live "add image" panel                                          */
/* ------------------------------------------------------------------ */

function AddPanel({
  onConfirm,
  onCancel,
}: {
  onConfirm: (url: string) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const trimmed = url.trim();

  useEffect(() => {
    if (!trimmed) return setStatus("idle");
    if (!isLikelyUrl(trimmed)) return setStatus("error");
    setStatus("loading");
    const img = new Image();
    img.onload = () => setStatus("ok");
    img.onerror = () => setStatus("error");
    img.src = trimmed;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [trimmed]);

  const confirm = () => {
    if (status !== "ok") {
      toast.error("La imagen no se pudo cargar. Verifica el enlace.");
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: -8, height: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className="glass-heavy flex flex-col gap-3 rounded-2xl p-4"
    >
      <div className="flex items-center gap-4">
        <span className="relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl fill-softer ring-1 ring-[color:var(--hairline)]">
          {status === "loading" && <Loader2 className="h-7 w-7 animate-spin text-cyan-300" />}
          {(status === "idle" || status === "error") && (
            <span className="flex flex-col items-center gap-1 text-ink-faint">
              {status === "error" ? <ImageOff className="h-7 w-7" /> : <ImagePlus className="h-7 w-7" />}
            </span>
          )}
          {trimmed && (
            <img
              src={trimmed}
              alt=""
              onLoad={() => setStatus("ok")}
              onError={() => setStatus("error")}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                status === "ok" ? "opacity-100" : "opacity-0"
              }`}
            />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <label className="text-xs font-bold uppercase tracking-wide text-ink-soft">Enlace de la imagen</label>
          <input
            autoFocus
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…/imagen.jpg"
            className="mt-1.5 w-full rounded-xl fill-soft px-3.5 py-2.5 text-sm text-ink outline-none ring-1 ring-[color:var(--hairline)] focus-visible:ring-2 focus-visible:ring-cyan-300"
          />
          <p className="mt-1.5 text-xs">
            {status === "loading" && <span className="text-cyan-300">Cargando imagen…</span>}
            {status === "ok" && <span className="text-emerald-300">Imagen cargada correctamente.</span>}
            {status === "error" && <span className="text-rose-300">No se pudo cargar la imagen desde ese enlace.</span>}
            {status === "idle" && <span className="text-ink-faint">Pega la URL pública de una imagen.</span>}
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-full fill-softer px-3.5 py-2 text-xs font-semibold text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft"
        >
          <X className="h-3.5 w-3.5" />
          Cancelar
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={status !== "ok"}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 px-4 py-2 text-xs font-bold text-white shadow-glass ring-1 ring-white/30 transition-all duration-300 hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" />
          Agregar imagen
        </button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Preview carousel                                                    */
/* ------------------------------------------------------------------ */

function PreviewCarousel({ images, onExit }: { images: string[]; onExit: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (images.length <= 1) return;
    const t = window.setInterval(() => setI((v) => (v + 1) % images.length), 2600);
    return () => window.clearInterval(t);
  }, [images.length]);
  const current = images[i] ?? images[0];

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#04122a] to-[#0a2747] p-4 ring-1 ring-white/10">
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[0.7rem] font-bold uppercase tracking-[0.16em] text-white ring-1 ring-white/20">
          <Eye className="h-3.5 w-3.5" /> Vista previa
        </span>
        <button
          type="button"
          onClick={onExit}
          className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 transition-all hover:bg-white/20 active:scale-90"
          aria-label="Salir de la vista previa"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="relative mx-auto flex aspect-video max-w-lg items-center justify-center overflow-hidden rounded-2xl bg-black/40">
        <AnimatePresence mode="popLayout">
          <motion.img
            key={`${current}-${i}`}
            src={current}
            alt={`Imagen ${i + 1}`}
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </AnimatePresence>
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[0.7rem] font-bold text-white ring-1 ring-white/20">
          Imagen {i + 1} de {images.length}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-center gap-1.5">
        {images.map((_, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setI(idx)}
            aria-label={`Ver imagen ${idx + 1}`}
            className={`h-1.5 rounded-full transition-all ${idx === i ? "w-6 bg-cyan-300" : "w-1.5 bg-white/40"}`}
          />
        ))}
      </div>
    </div>
  );
}
