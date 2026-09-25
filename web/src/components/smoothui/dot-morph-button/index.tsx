"use client";

import SmoothButton from "@/components/smoothui/smooth-button";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

export interface DotMorphButtonProps {
  className?: string;
  label: string;
  onClick?: () => void;
  /** While true the dot keeps morphing and the button is inert: work is in progress. */
  busy?: boolean;
  disabled?: boolean;
  /** "primary" is the filled ink button for the one main action on a screen. */
  tone?: "primary" | "outline";
  type?: "button" | "submit";
}

export function DotMorphButton({
  label,
  className = "",
  onClick,
  busy = false,
  disabled = false,
  tone = "primary",
  type = "button",
}: DotMorphButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const [isHoverDevice, setIsHoverDevice] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    setIsHoverDevice(mediaQuery.matches);
    const handleChange = (e: MediaQueryListEvent) => setIsHoverDevice(e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const stretched = isHoverDevice && isHovered && !disabled;
  const dot = { borderRadius: 999, height: 14, width: 14 };
  const pill = { borderRadius: 999, height: 22, width: 10 };

  return (
    <SmoothButton
      aria-busy={busy || undefined}
      className={cn(
        "h-auto min-h-11 max-w-full gap-3 whitespace-normal rounded-full px-5 py-2.5 font-semibold text-[0.9375rem] aria-busy:opacity-100",
        tone === "primary"
          ? "bg-ink text-ivory hover:bg-[#33312d]"
          : "border border-orange bg-white text-orange-deep hover:bg-[#fff7ef]",
        className
      )}
      disabled={disabled || busy}
      onClick={onClick}
      onMouseEnter={() => isHoverDevice && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      type={type}
    >
      <motion.span
        animate={
          shouldReduceMotion
            ? dot
            : busy
              ? { ...pill, height: [22, 8, 22], width: [10, 22, 10] }
              : stretched
                ? pill
                : dot
        }
        aria-hidden="true"
        className="inline-block shrink-0"
        initial={false}
        style={{ background: tone === "primary" ? "var(--brand-light)" : "var(--brand)" }}
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : busy
              ? { duration: 1.1, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }
              : { damping: 22, stiffness: 600, type: "spring" as const }
        }
      />
      <span className="tabular select-none">{label}</span>
    </SmoothButton>
  );
}

export default DotMorphButton;
