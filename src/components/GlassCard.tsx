import { motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";

type GlassCardProps = HTMLMotionProps<"div"> & {
  /** Use the densest glass treatment (dock / primary surfaces). */
  heavy?: boolean;
  /** Apply the magnetic spring hover. */
  magnetic?: boolean;
  /** Add the diagonal light streak on hover. */
  streak?: boolean;
};

/**
 * A reusable Liquid Glass surface. Wraps a motion.div so callers can layer
 * spring entrance animations on top of the shared glass styling.
 */
export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  function GlassCard(
    { heavy, magnetic, streak, className = "", children, ...rest },
    ref,
  ) {
    const classes = [
      heavy ? "glass-heavy" : "glass",
      magnetic ? "magnetic" : "",
      streak ? "liquid-streak" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <motion.div ref={ref} className={classes} {...rest}>
        {children}
      </motion.div>
    );
  },
);
