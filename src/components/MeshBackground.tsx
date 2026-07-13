import { getDeviceProfile } from "../shared/device";

/**
 * The fluid mesh-gradient environment.
 *
 * Several large, heavily-blurred "blobs" drift slowly behind the UI. Because
 * they move, the Liquid Glass surfaces on top have rich, shifting colour to
 * refract — which is what sells the illusion of real glass. Every colour is
 * theme-driven, so the same animation reads as a deep "Midnight" wash in dark
 * mode and a bright, airy sky in light mode.
 *
 * Performance note: a very large element with `blur(120px+)` is expensive to
 * composite, and animating four of them at once was a measurable cause of jank
 * on weaker hardware. We therefore scale the treatment by device tier — fewer
 * blobs, a smaller blur radius and no animation on low-power devices — while
 * keeping the premium look intact on capable machines.
 */
export function MeshBackground() {
  const { tier } = getDeviceProfile();
  const animate = tier !== "low";
  // A tighter blur on low/medium tiers cuts compositing cost substantially while
  // still reading as a soft gradient wash.
  const blur =
    tier === "high" ? { big: 120, mid: 130, low: 140, center: 120 } : { big: 80, mid: 84, low: 90, center: 78 };
  const anim = animate ? "animate-blob" : "";

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden no-print"
      style={{ backgroundColor: "var(--mesh-base)" }}
    >
      {/* Cyan blob — top left */}
      <div
        className={`absolute -left-24 -top-24 h-[42rem] w-[42rem] rounded-full ${anim}`}
        style={{ backgroundColor: "var(--mesh-1)", filter: `blur(${blur.big}px)` }}
      />
      {/* Core blue blob — right */}
      <div
        className={`absolute right-[-10rem] top-1/4 h-[40rem] w-[40rem] rounded-full ${anim}`}
        style={{
          backgroundColor: "var(--mesh-2)",
          filter: `blur(${blur.mid}px)`,
          animationDelay: "-6s",
        }}
      />
      {/* Deep blue blob — bottom */}
      <div
        className={`absolute bottom-[-14rem] left-1/3 h-[44rem] w-[44rem] rounded-full ${anim}`}
        style={{
          backgroundColor: "var(--mesh-3)",
          filter: `blur(${blur.low}px)`,
          animationDelay: "-11s",
        }}
      />
      {/* Subtle blob to cool / warm the centre — dropped on low-power devices. */}
      {tier !== "low" && (
        <div
          className={`absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full ${anim}`}
          style={{
            backgroundColor: "var(--mesh-4)",
            filter: `blur(${blur.center}px)`,
            animationDelay: "-3s",
          }}
        />
      )}

      {/* Fine grain overlay to keep gradients from banding */}
      <div
        className="absolute inset-0 [background-image:radial-gradient(rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:3px_3px]"
        style={{ opacity: "var(--grain-opacity)" }}
      />
    </div>
  );
}
