"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";

import { useFlash } from "@/lib/motion";

/**
 * Shared functional-motion primitives.
 *
 * `Reveal` fades a block in when it mounts — used with a `key` that changes
 * only when a new result is computed, so the motion means "fresh data", not
 * decoration. `FlashValue` flashes a number the instant it changes. Both are
 * inert under `prefers-reduced-motion` (Reveal skips the transform; the flash
 * is collapsed to an instant by the global reduced-motion rule).
 */

export function Reveal({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

export function FlashValue({
  value,
  color = "#4da6ff",
  className = "",
  children,
}: {
  value: unknown;
  color?: string;
  className?: string;
  children?: ReactNode;
}) {
  const flash = useFlash(value);
  return (
    <span
      className={`rounded-sm ${className} ${flash ? "animate-flash" : ""}`}
      style={flash ? ({ "--flash": color } as CSSProperties) : undefined}
    >
      {children ?? (value as ReactNode)}
    </span>
  );
}
