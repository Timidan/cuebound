import { motion, useReducedMotion } from "motion/react";

export type IconName = "record" | "events" | "style" | "listen" | "export" | "livepeer" | "brief" | "coin" | "sound" | Glyph;
type Glyph = "up" | "down" | "heart" | "cursor" | "plus";

const GLOW_LO = "drop-shadow(0 0 2px rgba(245,184,61,0.35))";
const GLOW_HI = "drop-shadow(0 0 10px rgba(245,184,61,0.95))";

// Silhouettes for icons drawn in code, on the same 32-cell grid as the PNG set.
const ARROW = [
  "........XX........",
  ".......XXXX.......",
  "......XXXXXX......",
  ".....XXXXXXXX.....",
  "....XXXXXXXXXX....",
  "...XXXXXXXXXXXX...",
  "..XXXXXXXXXXXXXX..",
  ".XXXXXXXXXXXXXXXX.",
  "XXXXXXXXXXXXXXXXXX",
  ...Array<string>(9).fill(".....XXXXXXXX....."),
];
const SHAPES: Record<Glyph, string[]> = {
  up: ARROW,
  down: [...ARROW].reverse(),
  heart: [
    "..XXXX......XXXX..",
    ".XXXXXX....XXXXXX.",
    "XXXXXXXX..XXXXXXXX",
    ...Array<string>(4).fill("XXXXXXXXXXXXXXXXXX"),
    ".XXXXXXXXXXXXXXXX.",
    "..XXXXXXXXXXXXXX..",
    "...XXXXXXXXXXXX...",
    "....XXXXXXXXXX....",
    ".....XXXXXXXX.....",
    "......XXXXXX......",
    ".......XXXX.......",
    "........XX........",
  ],
  cursor: [
    "X............",
    "XX...........",
    "XXX..........",
    "XXXX.........",
    "XXXXX........",
    "XXXXXX.......",
    "XXXXXXX......",
    "XXXXXXXX.....",
    "XXXXXXXXX....",
    "XXXXXXXXXX...",
    "XXXXXXXXXXX..",
    "XXXXXXXXXXXX.",
    "XXXXXXXXXXXXX",
    "XXXXXXXX.....",
    "XXX..XXXX....",
    "XX...XXXX....",
    "X.....XXXX...",
    "......XXXX...",
    ".......XXXX..",
    "........XX...",
  ],
  plus: [...Array<string>(5).fill(".....XXXXXX....."), ...Array<string>(6).fill("XXXXXXXXXXXXXXXX"), ...Array<string>(5).fill(".....XXXXXX.....")],
};

// Ink outline around the shape, a lit top-left edge and a shaded bottom-right edge, like the PNG set.
function draw(rows: string[]) {
  const on = (x: number, y: number) => rows[y]?.[x] === "X";
  const d = { ink: "", body: "", lit: "", shade: "" };
  const cell = (x: number, y: number) => `M${x} ${y}h1v1h-1z`;
  for (let y = -1; y <= rows.length; y++)
    for (let x = -1; x <= rows[0].length; x++) {
      if (!on(x, y)) {
        if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) d.ink += cell(x, y);
        continue;
      }
      d.body += cell(x, y);
      if (!on(x, y - 1) || !on(x - 1, y)) d.lit += cell(x, y);
      else if (!on(x, y + 1) || !on(x + 1, y)) d.shade += cell(x, y);
    }
  // Centre the glyph where the PNG icons sit in their cell: slightly above the middle.
  return { ...d, box: `${rows[0].length / 2 - 16} ${rows.length / 2 - 13} 32 32` };
}
const DRAWN: Partial<Record<IconName, ReturnType<typeof draw>>> = Object.fromEntries(Object.entries(SHAPES).map(([k, rows]) => [k, draw(rows)]));

// A pixel-art icon (a PNG from public/art, or drawn in code in the pad's colour) that idles with a small bob
// (coins spin), wiggles when it or a parent with whileHover="hover" is hovered, and pulses a gold glow when
// active. Reduced motion keeps it still.
export function PixelIcon({
  name,
  size = 40,
  active = false,
  delay = 0,
  className = "",
}: {
  name: IconName;
  size?: number;
  active?: boolean;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const idle = reduce ? undefined : name === "coin" ? { rotateY: [0, 0, 360] } : { y: [0, -Math.max(2, size * 0.07), 0] };
  const glow = {
    animate: { filter: active ? (reduce ? GLOW_HI : [GLOW_LO, GLOW_HI, GLOW_LO]) : "none" },
    transition: active && !reduce ? { duration: 1.6, repeat: Number.POSITIVE_INFINITY } : { duration: 0.2 },
  };
  const drawn = DRAWN[name];
  return (
    <motion.span
      animate={idle}
      aria-hidden="true"
      className={`inline-flex shrink-0 ${className}`}
      style={{ perspective: 400 }}
      transition={{ delay, duration: name === "coin" ? 3.2 : 2.4, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY, times: name === "coin" ? [0, 0.6, 1] : undefined }}
      variants={reduce ? undefined : { hover: { rotate: [0, -12, 10, -6, 0], scale: 1.1, transition: { duration: 0.5 } } }}
      whileHover="hover"
    >
      {drawn ? (
        <motion.svg {...glow} height={size} shapeRendering="crispEdges" viewBox={drawn.box} width={size}>
          <path d={drawn.ink} fill="#1c1b19" />
          <path d={drawn.body} fill="currentColor" />
          <path d={drawn.lit} fill="#fff" fillOpacity={0.4} />
          <path d={drawn.shade} fill="#000" fillOpacity={0.22} />
        </motion.svg>
      ) : (
        <motion.img {...glow} alt="" className="pixelated select-none" draggable={false} height={size} src={`/art/icon-${name}.png`} width={size} />
      )}
    </motion.span>
  );
}
