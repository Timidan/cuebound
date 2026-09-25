import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { levels } from "@/audio";

// Soft & rounded: bubbles that drift gently.
export function SoftArt() {
  const reduce = useReducedMotion();
  return (
    <svg aria-hidden="true" className="h-full w-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 400 90">
      {[20, 70, 125, 185, 240, 300, 355].map((x, i) => (
        <motion.circle
          animate={reduce ? undefined : { cy: [45 + ((i % 3) - 1) * 14, 45 + ((i % 3) - 1) * 14 - 8, 45 + ((i % 3) - 1) * 14] }}
          cx={x}
          cy={45 + ((i % 3) - 1) * 14}
          fill="#f4a259"
          key={x}
          opacity={0.25 + (i % 3) * 0.2}
          r={14 + (i % 4) * 7}
          transition={{ duration: 2.6 + (i % 3) * 0.7, delay: i * 0.25, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }}
        />
      ))}
    </svg>
  );
}

// Dry & mechanical: equalizer bars that idle and jump with the real audio output.
export function DryArt() {
  const reduce = useReducedMotion();
  const refs = useRef<(SVGRectElement | null)[]>([]);
  const n = 26;
  const base = Array.from({ length: n }, (_, i) => 10 + ((i * 37) % 60));
  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    const draw = (t: number) => {
      const live = levels(n);
      refs.current.forEach((el, i) => {
        if (!el) return;
        const idle = 0.45 + 0.25 * Math.sin(t / 420 + i * 0.9);
        const h = Math.max(4, base[i] * Math.min(1.3, Math.max(idle, live[i] * 1.4)));
        el.setAttribute("height", String(h));
        el.setAttribute("y", String(84 - h));
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <svg aria-hidden="true" className="h-full w-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 400 90">
      {base.map((h, i) => (
        <rect
          fill="#3f5f80"
          height={h}
          key={i}
          opacity={0.35}
          ref={(el) => {
            refs.current[i] = el;
          }}
          width="6"
          x={8 + i * 15}
          y={84 - h}
        />
      ))}
    </svg>
  );
}
