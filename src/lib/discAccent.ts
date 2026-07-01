/**
 * The classic DISC palette, keyed by the dominant letter of the archetype code:
 * D · red, I · amber, S · green, C · blue. Used to colour DISC chips and the
 * info pop-up so a profile is recognisable at a glance.
 */
export interface DiscAccent {
  gradient: string;
  chip: string;
}

export function discAccent(code: string): DiscAccent {
  const first = (code || "").trim().charAt(0).toUpperCase();
  switch (first) {
    case "D":
      return {
        gradient: "from-rose-500 to-red-600",
        chip: "bg-gradient-to-br from-rose-500 to-red-600 text-white ring-white/40",
      };
    case "I":
      return {
        gradient: "from-amber-400 to-orange-500",
        chip: "bg-gradient-to-br from-amber-400 to-orange-500 text-white ring-white/40",
      };
    case "S":
      return {
        gradient: "from-emerald-500 to-green-600",
        chip: "bg-gradient-to-br from-emerald-500 to-green-600 text-white ring-white/40",
      };
    case "C":
      return {
        gradient: "from-[#005baa] to-[#004a8f]",
        chip: "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white ring-white/40",
      };
    default:
      return {
        gradient: "from-[#00b0d8] to-[#005baa]",
        chip: "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white ring-white/40",
      };
  }
}
