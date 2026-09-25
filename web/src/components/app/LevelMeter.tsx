import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { levels } from "@/audio";

// Equalizer bars driven by the real audio output; flat when nothing is playing.
export function LevelMeter({ bars = 14, height = 36, color = "#1c1b19", className = "" }: { bars?: number; height?: number; color?: string; className?: string }) {
  const reduce = useReducedMotion();
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const l = levels(bars);
      refs.current.forEach((el, i) => {
        if (el) el.style.transform = `scaleY(${Math.max(0.08, reduce ? Math.round(l[i] * 4) / 4 : l[i])})`;
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [bars, reduce]);
  return (
    <span aria-hidden="true" className={`flex items-end gap-[3px] ${className}`} style={{ height }}>
      {Array.from({ length: bars }, (_, i) => (
        <span
          className="w-[5px] origin-bottom rounded-[1px] transition-transform duration-75"
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          style={{ height, background: color, transform: "scaleY(0.08)" }}
        />
      ))}
    </span>
  );
}
