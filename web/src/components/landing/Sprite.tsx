import { motion, useReducedMotion } from "motion/react";

// Original 14×15 pixel sprite drawn for CueBound: a small green sound-bot with a gold antenna.
const MAP = [
  "......yy......",
  "......yy......",
  ".......k......",
  "...kkkkkkkk...",
  "..kggggggggk..",
  ".kggggggggggk.",
  ".kgwwkggwwkgk.",
  ".kgwwkggwwkgk.",
  ".kggggggggggk.",
  ".kgggGGGGgggk.",
  ".kggggggggggk.",
  "..kggggggggk..",
  "..kGkkkkkkGk..",
  "..kk......kk..",
];
const FILL: Record<string, string> = { k: "#1c1b19", g: "#44c16f", G: "#2a8f50", w: "#ffffff", y: "#f5b83d" };

export function SpriteArt({ size = 64 }: { size?: number }) {
  return (
    <svg aria-hidden="true" height={size} shapeRendering="crispEdges" viewBox={`0 0 ${MAP[0].length} ${MAP.length}`} width={size * (MAP[0].length / MAP.length)}>
      {MAP.flatMap((row, y) => [...row].map((c, x) => (FILL[c] ? <rect fill={FILL[c]} height={1} key={`${x}-${y}`} width={1} x={x} y={y} /> : null)))}
    </svg>
  );
}

export type SpriteMode = "jump" | "run" | "stand";

// Idles, then jumps: squash before take-off, stretch in the air, squash on landing. While running it holds a stretched
// run pose; while standing it just breathes. Still under reduced motion.
export function JumpingSprite({ size = 72, height = 150, mode = "jump", className = "" }: { size?: number; height?: number; mode?: SpriteMode; className?: string }) {
  const reduce = useReducedMotion();
  const jump = { scaleX: [1, 1.15, 0.9, 1, 1.15, 1, 1], scaleY: [1, 0.82, 1.12, 1, 0.84, 1, 1], y: [0, 0, -height, -height * 0.94, 0, 0, 0] };
  const stand = { scaleX: [1, 1.03, 1], scaleY: [1, 0.97, 1], y: 0 };
  return (
    <motion.div
      animate={reduce ? undefined : mode === "run" ? { scaleX: 1.15, scaleY: 0.88, y: 0 } : mode === "stand" ? stand : jump}
      aria-hidden="true"
      className={`origin-bottom ${className}`}
      transition={
        mode === "run"
          ? { duration: 0.15, ease: "easeOut" }
          : mode === "stand"
            ? { duration: 1.6, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }
            : { duration: 2.6, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY, times: [0, 0.14, 0.38, 0.5, 0.66, 0.74, 1] }
      }
    >
      <SpriteArt size={size} />
    </motion.div>
  );
}
