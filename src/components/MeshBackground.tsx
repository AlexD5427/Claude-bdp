/**
 * The fluid mesh-gradient environment.
 *
 * Several large, heavily-blurred "blobs" drift slowly behind the UI. Because
 * they move, the Liquid Glass surfaces on top have rich, shifting colour to
 * refract — which is what sells the illusion of real glass.
 */
export function MeshBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#04122a]"
    >
      {/* Deep navy base wash */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#061a38] via-[#04122a] to-[#020b1c]" />

      {/* Cyan blob — top left */}
      <div className="absolute -left-24 -top-24 h-[42rem] w-[42rem] rounded-full bg-[#00b0d8]/30 blur-[120px] animate-blob" />
      {/* Core blue blob — right */}
      <div
        className="absolute right-[-10rem] top-1/4 h-[40rem] w-[40rem] rounded-full bg-[#005baa]/35 blur-[130px] animate-blob"
        style={{ animationDelay: "-6s" }}
      />
      {/* Deep blue blob — bottom */}
      <div
        className="absolute bottom-[-14rem] left-1/3 h-[44rem] w-[44rem] rounded-full bg-[#004a8f]/40 blur-[140px] animate-blob"
        style={{ animationDelay: "-11s" }}
      />
      {/* Subtle slate blob to cool the centre */}
      <div
        className="absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-400/10 blur-[120px] animate-blob"
        style={{ animationDelay: "-3s" }}
      />

      {/* Fine grain overlay to keep gradients from banding */}
      <div className="absolute inset-0 opacity-[0.035] [background-image:radial-gradient(rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:3px_3px]" />
    </div>
  );
}
