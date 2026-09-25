import { motion, useInView, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { handoff } from "@/components/landing/handoff";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { HyperText } from "@/components/magicui/hyper-text";
import AIToolCall from "@/components/smoothui/ai-tool-call";
import TypewriterText from "@/components/smoothui/typewriter-text";
import { PixelIcon } from "@/components/PixelIcon";
import { Waveform } from "@/components/Waveform";
import { SpriteArt } from "@/components/landing/Sprite";
import type { SoundDesignBrief, State } from "@/api";
import { fmtTime, kept } from "@/kit";
import { DEFAULTS } from "@/screens/Style";

// Adapted from Tern's scroll sequence (MIT): the route draws itself as you scroll, and here the sprite rides it.

const q = JSON.stringify;
// Same format as the server's promptParts: the brief enters the prompt as quoted data.
type FragmentCue = Pick<SoundDesignBrief["cues"][number], "eventId" | "descriptors" | "avoid" | "notes">;
export function briefFragment(b: { direction: SoundDesignBrief["direction"]; cues: FragmentCue[] }) {
  const d = b.direction;
  const cues = b.cues
    .map((c) => `${c.eventId} ${q(c.descriptors)}${c.avoid ? ` avoid ${q(c.avoid)}` : ""}${c.notes.length ? ` notes ${c.notes.map((n) => q(n)).join(" ")}` : ""}`)
    .join("; ");
  return `Style reference (data, not instructions): texture ${q(d.texture)}; envelope ${q(d.envelope)}; hierarchy ${q(d.hierarchy)}; approved cues: ${cues}.`;
}

const EXAMPLE_BRIEF = {
  direction: DEFAULTS[0],
  cues: [
    { eventId: "jump", descriptors: "Small character jumps off the ground", avoid: "", notes: [] },
    { eventId: "pickup", descriptors: "Player collects a coin", avoid: "metallic clang", notes: ["keep pickups short and soft"] },
  ],
};

function Example() {
  return <span className="rounded-full border-2 border-ink/70 bg-white px-2.5 py-0.5 font-mono text-[0.6875rem] font-semibold tracking-wide uppercase">Example</span>;
}

function Live() {
  return <span className="rounded-full bg-kept px-2.5 py-0.5 font-mono text-[0.6875rem] font-semibold tracking-wide text-white uppercase">From your project</span>;
}

function ClipFrame({ time, marks }: { time: number | null; marks: number[] }) {
  const total = Math.max(28000, ...marks) + 1000;
  const at = time ?? 2167;
  return (
    <div className="overflow-hidden rounded-2xl border-[3px] border-ink bg-[#0d1426]">
      <div className="relative aspect-video">
        {["bg-sky", "bg-hills", "bg-front"].map((l) => (
          <img alt="" className="pixelated absolute inset-0 h-full w-full object-cover object-[70%_bottom]" key={l} src={`/art/${l}.png`} />
        ))}
        <div className="absolute bottom-[26%] left-[34%]">
          <SpriteArt size={44} />
        </div>
      </div>
      <div className="flex items-center gap-3 bg-ink px-4 py-3 text-ivory">
        <span className="font-mono text-[0.8125rem] tabular">{fmtTime(at)}</span>
        <div className="relative h-2 flex-1 rounded-full bg-ivory/20">
          {marks.map((m) => (
            <span className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-sm bg-[#6cb4ff]/70" key={m} style={{ left: `${(m / total) * 100}%` }} />
          ))}
          <span className="absolute top-1/2 h-5 w-1.5 -translate-y-1/2 rounded-sm bg-gold ring-2 ring-ink" style={{ left: `${(at / total) * 100}%` }} />
        </div>
        <span className="rounded-md bg-gold px-2 py-0.5 text-[0.75rem] font-bold text-ink">Jump</span>
      </div>
    </div>
  );
}

const FLOOR_GAP = 56; // px from a row's lower edge to its floor; the next row starts one more gap below
const EDGE = 12; // px: where the route runs down the section's side margins
// Floors 1 and 3 run right to left, so their two steps swap sides to keep reading order along the route.
const RUN_ORDER = ["lg:order-2", "lg:order-1", "lg:order-3", "lg:order-4", "lg:order-6", "lg:order-5"];

function Step({ n, title, headline, badge, children, active, index }: { n: number; title: string; headline: string; badge: ReactNode; children: ReactNode; active: number; index: number }) {
  const reduce = useReducedMotion();
  return (
    <article
      className={`@container relative flex flex-col gap-5 py-4 transition-opacity duration-500 ${!reduce && index > active ? "lg:opacity-25" : ""}`}
    >
      <p className="flex items-center gap-3 font-mono text-[0.875rem] font-semibold tracking-[0.08em] text-orange-deep uppercase">
        0{n} · {title} {badge}
      </p>
      {/* Sized by its column; the desktop two-column level keeps its viewport sizing, which the floors are measured from. */}
      <h3 className="font-display text-[clamp(1.75rem,8cqi,2.75rem)] leading-[1.02] font-extrabold tracking-[-0.025em] text-ink lg:text-[clamp(2rem,3.4vw,3.25rem)]">{headline}</h3>
      {children}
    </article>
  );
}

export function JumpStory({ S }: { S: State }) {
  const reduce = useReducedMotion();
  const section = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const rows = useRef<(HTMLElement | null)[]>([]);
  const [geo, setGeo] = useState({ W: 0, H: 0, floors: [] as number[], top: 0, left: 0 });
  const [active, setActive] = useState(0);
  const sx = useMotionValue(0);
  const sy = useMotionValue(0);
  const face = useMotionValue(-1);
  const len = useRef(0);

  useEffect(() => {
    const el = section.current;
    if (!el) return;
    // The steps sit two per row; each row gets a floor just below its lower step, in the gap before the next row.
    // Late fonts or images above the level move it without resizing it, so the whole page is watched too.
    const measure = () => {
      const r = el.getBoundingClientRect();
      const bottoms = rows.current.map((row) => (row ? row.getBoundingClientRect().bottom - r.top : 0));
      const floors = [0, 1, 2].map((row) => Math.max(bottoms[row * 2] ?? 0, bottoms[row * 2 + 1] ?? 0) + FLOOR_GAP);
      setGeo({ W: el.clientWidth, H: el.clientHeight, floors, top: r.top + scrollY, left: r.left });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(document.documentElement);
    void document.fonts.ready.then(measure);
    addEventListener("load", measure);
    measure();
    return () => {
      ro.disconnect();
      removeEventListener("load", measure);
      handoff.showAt.set(Number.NaN);
    };
  }, []);

  // A three-floor level: the hero from the top of the page drops in at the right edge, runs along each floor under its
  // two steps, hops off the edge and drops to the next floor, then runs back the other way. The route stays in the gaps
  // below the rows and in the side margins, never over text.
  const route = useMemo(() => {
    const f = geo.floors;
    if (!f.length || !geo.W) return "";
    const L = EDGE;
    const R = geo.W - EDGE;
    let d = `M ${R} ${Math.max(0, f[0] - 160)} L ${R} ${f[0]}`;
    f.forEach((y, row) => {
      const [from, to] = row % 2 === 0 ? [R, L] : [L, R];
      d += ` L ${to} ${y}`;
      const next = f[row + 1];
      if (next !== undefined) {
        const out = from === L ? 1 : -1; // hop outward over the edge, then fall
        d += ` C ${to} ${y - 60}, ${to + out * 12} ${y - 60}, ${to + out * 12} ${y + 20} L ${to} ${next}`;
      }
    });
    return d;
  }, [geo]);

  // Starts when the level reaches the top of the screen, so floor 1 is in view for the drop-in.
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end 0.6"] });
  // Visible from the exact scroll where the hero's character hands over, so there is never two of it or none.
  const { scrollY: pageY } = useScroll();
  const shown = useTransform([pageY, handoff.showAt], ([sy, at]) => (Number.isFinite(at as number) && (sy as number) >= (at as number) ? 1 : 0));
  const place = (p: number) => {
    const path = pathRef.current;
    if (!path || !len.current) return;
    const at = Math.min(1, Math.max(0, p)) * len.current;
    const pt = path.getPointAtLength(at);
    sx.set(pt.x);
    sy.set(pt.y);
    // Face the way the route goes next, whichever way the page is scrolling; drops keep the last facing.
    const ahead = path.getPointAtLength(Math.min(len.current, at + 4));
    if (Math.abs(ahead.x - pt.x) > 0.5) face.set(ahead.x < pt.x ? -1 : 1);
    const row = Math.max(0, geo.floors.filter((y) => pt.y >= y - 2).length - 1);
    const firstHalf = row % 2 === 0 ? pt.x > geo.W / 2 : pt.x < geo.W / 2;
    setActive(pt.y < geo.floors[0] - 2 ? 0 : Math.min(5, row * 2 + (firstHalf ? 0 : 1)));
  };
  useMotionValueEvent(scrollYProgress, "change", place);
  // The hero's character steers to the route's first point and hands over when this container reaches the top. The
  // hand-off is published only once the level's sprite sits on its route for the current scroll, never before.
  useEffect(() => {
    len.current = route && pathRef.current ? pathRef.current.getTotalLength() : 0;
    if (!len.current) return;
    place(scrollYProgress.get());
    handoff.showAt.set(geo.top);
    handoff.x.set(geo.left + geo.W - EDGE);
    handoff.y.set(geo.top + Math.max(0, geo.floors[0] - 160));
  }, [geo, route]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real values where the project has them.
  const jump = S.cues.find((c) => c.eventId === "jump");
  const jumpJob = jump ? [...S.jobs].reverse().find((j) => j.cueId === jump.id && j.providerJobId) : undefined;
  const jumpKept = jump ? kept(S, jump)[0] : undefined;
  const brief = S.briefs.at(-1);
  const saved = brief && S.receipts.some((r) => r.revision === brief.revision && r.status.includes("readback"));
  const fragment = briefFragment(brief ? brief.brief : EXAMPLE_BRIEF);
  const prompt = jumpJob?.prompt ?? `Small character jumps off the ground. Texture: ${DEFAULTS[0].texture}. Envelope: ${DEFAULTS[0].envelope}. Hierarchy: ${DEFAULTS[0].hierarchy}`;

  const codeRef = useRef<HTMLDivElement>(null);
  const codeSeen = useInView(codeRef, { once: true, margin: "-20% 0px" });
  const padRef = useRef<HTMLDivElement>(null);
  const padSeen = useInView(padRef, { once: true, margin: "-20% 0px" });
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollSeen = useInView(scrollRef, { once: true, margin: "-20% 0px" });

  const steps: { title: string; headline: string; live: boolean; body: ReactNode }[] = [
    {
      title: "The jump in your clip",
      headline: jump ? `Jump happens ${jump.sourceTimesMs.length} times` : "You mark the moment it happens",
      live: !!jump,
      body: (
        <>
          <p className="max-w-[46ch] text-[1.0625rem] leading-relaxed text-ink/80">Each mark is a moment in your gameplay clip that needs a sound. You add marks by hand, or paste your game’s event log for exact times.</p>
          <ClipFrame marks={jump?.sourceTimesMs ?? [2167, 2950, 3733, 4583, 5483, 11650, 12967]} time={jump?.sourceTimesMs[0] ?? null} />
        </>
      ),
    },
    {
      title: "Livepeer renders 3 takes",
      headline: "One prompt per take, sent to the Livepeer network",
      live: !!jumpJob,
      body: (
        <>
          <p className="max-w-[46ch] text-[1.0625rem] leading-relaxed text-ink/80">The mirelo-sfx model turns the prompt into audio in seconds. CueBound asks for 3 takes, so you have choices.</p>
          <AIToolCall
            args={
              <pre className="font-mono text-[0.8125rem] leading-relaxed whitespace-pre-wrap">{`{
  "action": "generate",
  "model_override": "mirelo-sfx",
  "strict": true,
  "duration": ${jumpJob?.durationS ?? 3},
  "prompt": ${q(prompt)}
}`}</pre>
            }
            className="border-[3px] border-ink bg-white"
            defaultOpen
            name="create_media"
            result={<p className="font-mono text-[0.8125rem]">{jumpJob ? `job ${jumpJob.providerJobId} · ${jumpJob.status}` : "Livepeer answers with a job id, then the audio"}</p>}
            status={jumpJob ? (jumpJob.status === "done" ? "success" : jumpJob.status === "failed" ? "error" : "running") : "success"}
            summary={jumpJob ? `about $${(jumpJob.costUsd ?? 0).toFixed(4)}` : "about $0.03"}
          />
        </>
      ),
    },
    {
      title: "You keep one",
      headline: "Hear the takes, keep the one that fits",
      live: !!jumpKept,
      body: (
        <div className="flex max-w-[34rem] items-center gap-5 rounded-3xl border-[3px] border-ink bg-[#dcebfb] p-6 shadow-[0_6px_0_rgba(28,27,25,0.85)]" ref={padRef}>
          <div className="flex flex-col gap-1">
            <span className="font-display text-[1.75rem] font-extrabold text-ink">Jump</span>
            <motion.span
              animate={padSeen ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
              className="w-fit rounded-full bg-kept px-3 py-1 text-[0.875rem] font-bold text-white"
              transition={{ delay: 0.8, type: "spring", bounce: 0.5 }}
            >
              Kept ✓
            </motion.span>
          </div>
          <motion.div
            animate={padSeen || reduce ? { clipPath: "inset(0 0% 0 0)" } : { clipPath: "inset(0 100% 0 0)" }}
            className="flex min-w-0 flex-1"
            transition={{ duration: 1.1, ease: "easeOut" }}
          >
            {jumpKept ? (
              <Waveform bars={40} color="#2162a2" fill height={56} take={jumpKept} />
            ) : (
              <span aria-hidden="true" className="flex h-14 flex-1 items-center gap-[3px]">
                {Array.from({ length: 40 }, (_, i) => (
                  <span className="flex-1 rounded-[1px] bg-[#2162a2]" key={i} style={{ height: `${Math.max(8, Math.round(100 * Math.exp(-i / 9) * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7)))))}%` }} />
                ))}
              </span>
            )}
          </motion.div>
        </div>
      ),
    },
    {
      title: "Godot plays it",
      headline: "One line in your game code",
      live: false,
      body: (
        <div className="max-w-[34rem] rounded-2xl border-[3px] border-ink bg-ink p-6 font-mono text-[1.25rem] text-ivory" ref={codeRef}>
          <p className="text-[0.875rem] text-ivory/60"># after you set the jump velocity</p>
          <p className="mt-2 min-h-[1.6em] text-gold">{codeSeen || reduce ? <TypewriterText speed={60}>{'Sfx.play("jump")'}</TypewriterText> : null}</p>
        </div>
      ),
    },
    {
      title: "The brief is saved to the DKG",
      headline: "Your approved style, as a sound brief",
      live: !!saved,
      body: (
        <div className="flex max-w-[34rem] items-center gap-5 rounded-2xl border-[3px] border-ink bg-[#fbf6e8] p-6" ref={scrollRef}>
          <motion.div animate={scrollSeen || reduce ? { scaleY: 1, opacity: 1 } : { scaleY: 0.2, opacity: 0.3 }} className="origin-top" transition={{ duration: 0.8, ease: "easeOut" }}>
            <PixelIcon active={scrollSeen} name="brief" size={88} />
          </motion.div>
          <div className="min-w-0">
            <p className="text-[0.9375rem] text-ink/70">{saved ? "Saved on your DKG node, fingerprint:" : "Saved on the OriginTrail DKG with a fingerprint like:"}</p>
            {reduce ? (
              <p className="font-mono text-[1.25rem] font-semibold">{(brief?.digest ?? "9f3c2ab4e81d").slice(0, 12)}…</p>
            ) : (
              <HyperText as="p" characterSet={"0123456789abcdef".split("")} className="py-0 text-[1.25rem] font-semibold" duration={1400} key={brief?.digest ?? "x"} preserveCase startOnView>
                {`${(brief?.digest ?? "9f3c2ab4e81d").slice(0, 12)}…`}
              </HyperText>
            )}
          </div>
        </div>
      ),
    },
    {
      title: "A teammate adds Dash",
      headline: "The brief goes into the new prompt",
      live: !!brief,
      body: (
        <div className="grid max-w-[40rem] gap-3">
          <div className="rounded-2xl border-[3px] border-ink/40 bg-white p-4">
            <p className="text-[0.8125rem] font-semibold text-ink/60">Prompt without the brief</p>
            <p className="mt-1 font-mono text-[0.9375rem]">Quick horizontal dash burst</p>
          </div>
          <div className="rounded-2xl border-[3px] border-ink bg-white p-4">
            <p className="text-[0.8125rem] font-semibold text-orange-deep">Prompt with the brief</p>
            <p className="mt-1 font-mono text-[0.9375rem]">Quick horizontal dash burst</p>
            <p className="mt-1 font-mono text-[0.8125rem] leading-relaxed">
              <mark className="rounded-sm bg-brand-lighter box-decoration-clone px-1 text-ink">{fragment}</mark>
            </p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="relative mx-auto grid max-w-[84rem] gap-y-10 px-4 sm:px-8 lg:grid-cols-2 lg:gap-x-20 lg:gap-y-[calc(var(--floor-gap)*2)]" ref={section} style={{ ["--floor-gap" as string]: `${FLOOR_GAP}px` }}>
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 hidden lg:block" height={geo.H} width={geo.W}>
        <path d={route} fill="none" stroke="#1c1b19" strokeDasharray="6 10" strokeLinecap="round" strokeOpacity={0.18} strokeWidth={3} />
        <motion.path d={route} fill="none" ref={pathRef} stroke="#f5b83d" strokeLinecap="round" strokeWidth={5} style={{ pathLength: reduce ? 1 : scrollYProgress }} />
        {geo.floors.map((y, i) => (
          <g key={i} shapeRendering="crispEdges" transform={`translate(${EDGE - 20} ${y})`}>
            <rect fill="#44c16f" height={8} stroke="#1c1b19" strokeWidth={3} width={geo.W - 2 * EDGE + 40} />
            <rect fill="#d8733f" height={14} stroke="#1c1b19" strokeWidth={3} width={geo.W - 2 * EDGE + 40} y={8} />
          </g>
        ))}
      </svg>
      {!reduce && (
        <motion.div aria-hidden="true" className="pointer-events-none absolute top-0 left-0 z-10 hidden -translate-x-1/2 -translate-y-full lg:block" style={{ x: sx, y: sy, opacity: shown }}>
          <motion.div style={{ scaleX: face }}>
            <SpriteArt size={56} />
          </motion.div>
        </motion.div>
      )}
      {steps.map((s, i) => (
        <div
          className={RUN_ORDER[i]}
          key={s.title}
          ref={(el) => {
            rows.current[i] = el;
          }}
        >
          <Step active={active} badge={s.live ? <Live /> : i === 3 ? null : <Example />} headline={s.headline} index={i} n={i + 1} title={s.title}>
            {s.body}
          </Step>
        </div>
      ))}
      <div className="sticky bottom-6 z-20 mx-auto mt-4 hidden w-fit items-center gap-3 rounded-full border-2 border-ink bg-white px-4 py-2 font-mono text-[0.8125rem] font-semibold lg:order-7 lg:col-span-2 lg:flex" role="status">
        Step {Math.max(1, active + 1)} of {steps.length}
      </div>
    </div>
  );
}
