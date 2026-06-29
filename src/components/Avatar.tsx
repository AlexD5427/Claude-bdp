import { avatarGradient, initials } from "../lib/candidates";

interface AvatarProps {
  name: string;
  /** Seed for deterministic gradient (defaults to the name). */
  seed?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "h-9 w-9 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-16 w-16 text-lg",
};

/**
 * Candidate avatar. The dataset carries no photo URLs, so we render a
 * deterministic corporate-gradient backplate with the candidate's initials —
 * which doubles as the "photo" referenced throughout the brief.
 */
export function Avatar({ name, seed, size = "md", className = "" }: AvatarProps) {
  return (
    <div
      className={[
        "relative grid shrink-0 place-items-center rounded-full bg-gradient-to-br ring-2 ring-white/40 shadow-glass",
        avatarGradient(seed ?? name),
        SIZES[size],
        className,
      ].join(" ")}
    >
      {/* Specular dot for a glassy, volumetric feel */}
      <span className="pointer-events-none absolute left-1.5 top-1.5 h-1/3 w-1/3 rounded-full bg-white/40 blur-[3px]" />
      <span className="text-on-glass select-none leading-none">
        {initials(name)}
      </span>
    </div>
  );
}
