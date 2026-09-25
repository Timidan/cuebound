"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export interface DynamicIslandProps {
  className?: string;
  /** Changing the key cross-fades the content while the island springs to its new size. */
  viewKey: string;
  children: ReactNode;
  onClick?: () => void;
  label?: string;
}

// Trimmed from SmoothUI's DynamicIsland: the same spring layout and blur-in content, without the demo views.
export default function DynamicIsland({ viewKey, children, className = "", onClick, label }: DynamicIslandProps) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.button
      aria-label={label}
      className={`mx-auto w-fit min-w-[100px] overflow-hidden rounded-full bg-ink text-left text-ivory shadow-[0_8px_24px_rgba(28,27,25,0.25)] ${className}`}
      layout
      onClick={onClick}
      style={{ borderRadius: 32 }}
      transition={shouldReduceMotion ? { duration: 0 } : { bounce: 0.35, duration: 0.35, type: "spring" as const }}
      type="button"
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          animate={shouldReduceMotion ? { opacity: 1 } : { filter: "blur(0px)", opacity: 1, scale: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { filter: "blur(4px)", opacity: 0, scale: 0.95 }}
          initial={shouldReduceMotion ? { opacity: 0 } : { filter: "blur(5px)", opacity: 0, scale: 0.9 }}
          key={viewKey}
          transition={shouldReduceMotion ? { duration: 0 } : { bounce: 0.3, type: "spring" as const }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </motion.button>
  );
}
