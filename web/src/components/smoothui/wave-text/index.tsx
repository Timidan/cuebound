import { motion, useReducedMotion } from "motion/react";
import type React from "react";

export interface WaveTextProps {
  amplitude?: number;
  children: string;
  className?: string;
  duration?: number;
  staggerDelay?: number;
}

const WaveText: React.FC<WaveTextProps> = ({
  children,
  amplitude = 8,
  duration = 1.2,
  staggerDelay = 0.05,
  className = "",
}) => {
  const shouldReduceMotion = useReducedMotion();

  // Letters are grouped by word so lines break only between words; the label keeps it readable for screen readers.
  let n = 0;
  return (
    <span aria-label={children} className={className} role="text" style={{ display: "inline-block" }}>
      {children.split(" ").map((word, w) => (
        <span aria-hidden="true" key={`${w}-${word}`} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
          {word.split("").map((char) => {
            const i = n++;
            return (
              <motion.span
                animate={shouldReduceMotion ? { y: 0 } : { y: [0, -amplitude, 0, amplitude * 0.5, 0] }}
                key={`${i}-${char}`}
                style={{ display: "inline-block", willChange: shouldReduceMotion ? undefined : "transform" }}
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : { delay: i * staggerDelay, duration, ease: [0.37, 0, 0.63, 1], repeat: Number.POSITIVE_INFINITY, times: [0, 0.25, 0.5, 0.75, 1] }
                }
              >
                {char}
              </motion.span>
            );
          })}
        </span>
      )).flatMap((el, w) => (w ? [" ", el] : [el]))}
    </span>
  );
};

export default WaveText;
