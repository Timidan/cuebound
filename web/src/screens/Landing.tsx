import { AnimatePresence, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { ArrowRight } from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MorphingText } from "@/components/magicui/morphing-text";
import { Particles } from "@/components/magicui/particles";
import { ShimmerButton } from "@/components/magicui/shimmer-button";
import AnimatedTabs from "@/components/smoothui/animated-tabs";
import Drawer from "@/components/smoothui/drawer";
import GlowHover from "@/components/smoothui/glow-hover-card";
import GravityStars from "@/components/smoothui/gravity-stars";
import InfiniteSlider from "@/components/smoothui/infinite-slider";
import MagneticButton from "@/components/smoothui/magnetic-button";
import PixelFlowField from "@/components/smoothui/pixel-flow-field";
import RevealText from "@/components/smoothui/reveal-text";
import ScrollRevealParagraph from "@/components/smoothui/scroll-reveal-paragraph";
import ShimmerSweep from "@/components/smoothui/shimmer-sweep";
import TiltCard from "@/components/smoothui/tilt-card";
import TypewriterText from "@/components/smoothui/typewriter-text";
import WaveText from "@/components/smoothui/wave-text";
import { JumpStory } from "@/components/landing/JumpStory";
import { LivepeerLive } from "@/components/landing/LivepeerLive";
import { JumpingSprite, type SpriteMode } from "@/components/landing/Sprite";
import { handoff } from "@/components/landing/handoff";
import { PixelIcon, type IconName } from "@/components/PixelIcon";
import { trigger, unlock } from "@/audio";
import { kept } from "@/kit";
import { StartForm } from "@/screens/Start";
import { DEFAULTS } from "@/screens/Style";
import { useKit, type Screen } from "@/store";

// Art layers are 2560×1080 and drawn with object-cover anchored bottom-right. These convert image coordinates to
// container coordinates, so the sprite and coins sit on the painted platforms at any window size.
// The level only has a sprite from the desktop width up, so the character steers only there.
function useDesktop() {
  const [on, setOn] = useState(() => typeof matchMedia === "function" && matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const mq = matchMedia("(min-width: 1024px)");
    const sync = () => setOn(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return on;
}

const ART_W = 2560;
const ART_H = 1080;
// Measured before the first paint, and again whenever the page changes size, since content above (an alert) moves it.
function useArtFit(ref: React.RefObject<HTMLElement | null>) {
  const [box, setBox] = useState({ W: 1440, H: 900, top: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ W: el.clientWidth, H: el.clientHeight, top: el.getBoundingClientRect().top + scrollY });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [ref]);
  const s = Math.max(box.W / ART_W, box.H / ART_H);
  const bottom = (y: number) => (ART_H - y) * s;
  return { left: (x: number) => x * s - (ART_W * s - box.W), bottom, pageY: (y: number) => box.top + box.H - bottom(y), s, W: box.W };
}

// In-page links scroll without touching the hash, which the app uses for routing.
function Jump({ to, children, className = "hover:underline" }: { to: string; children: React.ReactNode; className?: string }) {
  return (
    <a
      className={className}
      href={`#${to}`}
      onClick={(e) => {
        e.preventDefault();
        document.getElementById(to)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }}
    >
      {children}
    </a>
  );
}

function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg aria-hidden="true" fill="none" height="28" stroke="#C4621D" strokeLinecap="round" strokeWidth="2.4" viewBox="0 0 24 24" width="28">
        <path d="M3 12h2M7 8v8M11 4v16M15 7v10M19 10v4" />
      </svg>
      <span className={`font-display text-[clamp(1.25rem,5vw,1.5rem)] font-bold tracking-tight ${light ? "text-ivory" : "text-ink"}`}>CueBound</span>
    </span>
  );
}

// Official Livepeer lockup, unmodified. Clear space around it is at least the symbol's width, also when it wraps.
// Never under 24 px tall (the brand minimum).
function PoweredByLivepeer({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-6 py-6">
      <span className={`text-[1rem] font-medium ${light ? "text-ivory/80" : "text-ink/70"}`}>Powered by</span>
      <img alt="Livepeer" className="h-6 w-auto sm:h-7" height={89} src={`/brand/livepeer-lockup-${light ? "white" : "black"}.svg`} width={711} />
    </span>
  );
}

function Sparks({ flip = false }: { flip?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <span aria-hidden="true" className={`relative inline-block h-12 w-10 ${flip ? "-scale-x-100" : ""}`}>
      {[-35, 0, 35].map((deg, i) => (
        <motion.span
          animate={reduce ? undefined : { opacity: [0.4, 1, 0.4], scaleX: [0.8, 1.1, 0.8] }}
          className="absolute top-1/2 left-1 h-2 w-6 origin-right rounded-full bg-gold"
          key={deg}
          style={{ rotate: deg, translateY: "-50%" }}
          transition={{ delay: i * 0.2, duration: 1.4, repeat: Number.POSITIVE_INFINITY }}
        />
      ))}
    </span>
  );
}

function SectionTitle({ children, id, light = false }: { children: string; id: string; light?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-5">
      <Sparks />
      <h2 className={`text-center font-display text-[clamp(2rem,5.2vw,5.5rem)] leading-[1] font-extrabold tracking-[-0.03em] ${light ? "text-ivory" : "text-ink"}`} id={id}>
        <RevealText triggerOnView>{children}</RevealText>
      </h2>
      <Sparks flip />
    </div>
  );
}

function Layer({ src, speed, depth, px, py }: { src: string; speed: number; depth: number; px: MotionValue<number>; py: MotionValue<number> }) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const scroll = useTransform(scrollY, [0, 1000], [0, reduce ? 0 : 1000 * speed]);
  const x = useTransform(px, (v) => (reduce ? 0 : v * depth));
  const y = useTransform(() => scroll.get() + (reduce ? 0 : py.get() * depth * 0.4));
  return (
    <motion.img
      alt=""
      aria-hidden="true"
      className="pixelated pointer-events-none absolute -inset-x-[3%] bottom-0 h-(--art-h) w-[106%] max-w-none object-cover object-[right_bottom] select-none"
      draggable={false}
      src={src}
      style={{ x, y }}
    />
  );
}

const PHRASES = ["Mark the moments", "Livepeer makes the sounds", "Godot plays them"];
const PHRASE_ICONS: IconName[] = ["record", "sound", "export"];

function Hero({ cta, onStart, onForm, returning, go }: { cta: React.ReactNode; onStart: () => void; onForm: () => void; returning: boolean; go: (s: Screen) => void }) {
  const { S } = useKit();
  const reduce = useReducedMotion();
  const art = useRef<HTMLDivElement>(null);
  const fit = useArtFit(art);
  const [phrase, setPhrase] = useState(0);
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const px = useSpring(rawX, { stiffness: 50, damping: 18 });
  const py = useSpring(rawY, { stiffness: 50, damping: 18 });
  // Coins play a real kept coin-pickup take when the project has one; otherwise they stay silent.
  const pickup = S.cues.find((c) => c.eventId === "pickup");
  const coinTake = pickup ? kept(S, pickup)[0] : undefined;
  const ring = (e: React.PointerEvent) => {
    if (!coinTake) return;
    unlock();
    void trigger([coinTake]);
    e.currentTarget.animate([{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }], { duration: 350 });
  };
  const front = useTransform(px, (v) => (reduce ? 0 : v * 22));
  // One character for the whole page. It idles on the middle step; as the page starts to scroll it leaps to the right
  // edge of the screen and stays there, riding the camera like a side-scroller while the sections pass underneath;
  // when the level is about to reach the top of the screen it drops onto the level's first point, where the level's
  // own sprite takes over at the same pixel. It never leaves the screen. Under reduced motion, or below the desktop
  // width where the level has no sprite, it simply stays on its step.
  const spriteSize = Math.round(Math.max(56, fit.s * 96));
  const desktop = useDesktop();
  const steer = !reduce && desktop;
  const { scrollY: pageY } = useScroll();
  const RUN_START = 20;
  const RUN_END = 240;
  const DROP_LEN = 360;
  const heroSprite = useTransform([pageY, handoff.showAt, handoff.x, handoff.y, front], (v) => {
    const [sy, showAt, hx, hy, fx] = v as number[];
    const restX = fit.left(2170) + fx;
    const feetPageY = fit.pageY(792);
    const rest = { x: restX, y: feetPageY - sy, scale: 1, face: 1, opacity: 1, mode: "jump" as SpriteMode };
    if (!steer || sy <= RUN_START) return rest;
    const edgeX = fit.W - spriteSize / 2 - 24;
    if (sy <= RUN_END) {
      const t = (sy - RUN_START) / (RUN_END - RUN_START);
      return { x: restX + t * (edgeX - restX), y: feetPageY - sy - 4 * t * (1 - t) * fit.s * 230, scale: 1, face: 1, opacity: 1, mode: "run" as SpriteMode };
    }
    const hold = { x: edgeX, y: feetPageY - RUN_END, scale: 1, face: 1, opacity: 1, mode: "stand" as SpriteMode };
    if (!Number.isFinite(showAt)) return hold;
    if (sy >= showAt) return { ...hold, opacity: 0 };
    const dropStart = Math.max(RUN_END, showAt - DROP_LEN);
    if (sy <= dropStart) return hold;
    const u = (sy - dropStart) / (showAt - dropStart);
    const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    return {
      x: hold.x + (hx - hold.x) * e,
      y: hold.y + (hy - sy - hold.y) * e,
      scale: 1 + (56 / spriteSize - 1) * e, // the level's sprite is 56 px
      face: u > 0.5 ? -1 : 1, // it runs left along the first floor
      opacity: 1,
      mode: (u > 0.5 ? "stand" : "run") as SpriteMode,
    };
  });
  const sX = useTransform(heroSprite, (p) => p.x);
  const sY = useTransform(heroSprite, (p) => p.y);
  const sScale = useTransform(heroSprite, (p) => p.scale);
  const sFace = useTransform(heroSprite, (p) => p.face);
  const sOpacity = useTransform(heroSprite, (p) => p.opacity);
  const [mode, setMode] = useState<SpriteMode>("jump");
  const modeRef = useRef<SpriteMode>("jump");
  // The combined value recomputes during render, so only a real mode change may touch React state, and never mid-render.
  useMotionValueEvent(heroSprite, "change", (p) => {
    if (p.mode === modeRef.current) return;
    modeRef.current = p.mode;
    requestAnimationFrame(() => setMode(p.mode));
  });
  const coins: [number, number, number][] = [
    [1890, 610, 0],
    [2090, 540, 0.5],
    [2300, 470, 1],
  ];

  // Below the desktop width the art fills only a bottom band (--art-h) under the card, so the character and coins stay
  // in view; the section's colour matches the top of the sky art.
  return (
    <section
      aria-labelledby="hero-title"
      className="relative min-h-[100svh] overflow-hidden bg-[#dbf6fa] [--art-h:min(100%,28rem)] lg:[--art-h:100%]"
      onPointerMove={(e) => {
        if (e.pointerType === "touch") return;
        const r = e.currentTarget.getBoundingClientRect();
        rawX.set(((e.clientX - r.left) / r.width - 0.5) * 2);
        rawY.set(((e.clientY - r.top) / r.height - 0.5) * 2);
      }}
    >
      <Layer depth={8} px={px} py={py} speed={0.4} src="/art/bg-sky.png" />
      <Layer depth={16} px={px} py={py} speed={0.2} src="/art/bg-hills.png" />
      {!reduce && <Particles className="pointer-events-none absolute inset-0" color="#f5b83d" ease={70} quantity={70} size={1.1} staticity={30} />}
      <motion.div className="absolute inset-x-0 bottom-0 h-(--art-h)" ref={art} style={{ x: front }}>
        <img alt="" aria-hidden="true" className="pixelated pointer-events-none absolute -inset-x-[3%] inset-y-0 h-full w-[106%] max-w-none object-cover object-[right_bottom] select-none" draggable={false} src="/art/bg-front.png" />
        {/* On the middle step, clear of the painted coins either side; the steering version lives outside this parallax layer. */}
        {!steer && (
          <div className="absolute -translate-x-1/2" style={{ bottom: fit.bottom(792), left: fit.left(2170) }}>
            <JumpingSprite height={Math.round(fit.s * 230)} size={spriteSize} />
          </div>
        )}
        {coins.map(([x, y, delay]) => (
          <span
            aria-hidden="true"
            className="absolute"
            key={x}
            onPointerEnter={ring}
            style={{ bottom: fit.bottom(y), left: fit.left(x) - 32 }}
            title={coinTake ? "Plays your kept coin pickup" : undefined}
          >
            <PixelIcon delay={delay} name="coin" size={Math.round(Math.max(48, fit.s * 80))} />
          </span>
        ))}
      </motion.div>

      {/* Phones and tablets get a compact bar: the logo and the two ways in. The section links stay in the footer. */}
      <nav aria-label="Landing" className="relative z-20 mx-auto flex max-w-[92rem] flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-4 sm:px-10 sm:pt-7">
        <Logo />
        <div className="flex items-center gap-2 text-[0.9375rem] font-semibold whitespace-nowrap sm:gap-3 sm:text-[1rem] lg:gap-8">
          <div className="hidden items-center gap-8 lg:flex">
            <Jump to="story">How it works</Jump>
            <Jump to="agent-skill">Agent skill</Jump>
            <Jump to="livepeer">Livepeer</Jump>
            <Jump to="brief">Sound brief</Jump>
          </div>
          <button className="btn-chunky min-h-11 rounded-full border-2 border-ink bg-gold px-3 py-2 hover:bg-gold-hover sm:px-4 lg:hidden" onClick={onStart} type="button">
            {returning ? "Continue" : "Start"}
          </button>
          <button className="btn-chunky rounded-full border-2 border-ink bg-white px-3 py-2 hover:bg-paper max-lg:min-h-11 sm:px-5" onClick={() => go("continue")} type="button">
            <span className="sm:hidden">Saved brief</span>
            <span className="hidden sm:inline">Continue from a saved brief</span>
          </button>
        </div>
      </nav>

      {steer && (
        <motion.div aria-hidden="true" className="pointer-events-none fixed top-0 left-0 z-10 origin-bottom -translate-x-1/2 -translate-y-full" style={{ x: sX, y: sY, scale: sScale, opacity: sOpacity }}>
          <motion.div style={{ scaleX: sFace }}>
            <JumpingSprite height={Math.round(fit.s * 230)} mode={mode} size={spriteSize} />
          </motion.div>
        </motion.div>
      )}
      <div className="relative z-10 mx-auto max-w-[92rem] px-4 pt-6 pb-[19.5rem] sm:px-10 lg:pt-[clamp(1.5rem,5vh,4rem)] lg:pb-[22vh]">
        <PixelFlowField
          cellSize={6}
          className="w-fit max-w-full rounded-[2.25rem] border-[3px] border-ink bg-[#fbf6e8] shadow-[0_8px_0_rgba(28,27,25,0.85)] lg:max-w-[min(58rem,66vw)]"
          colors={["#f7f0de", "#f2e7ca", "#ecdcb0"]}
          gap={2}
          speed={0.7}
          text="CUEBOUND"
          weight={900}
        >
          <div className="px-[clamp(1.25rem,3.5vw,3.5rem)] pt-[clamp(1.25rem,3vw,3rem)]">
            <p className="font-mono text-[1.0625rem] font-semibold tracking-[0.1em] text-orange-deep uppercase">
              <ShimmerSweep>From gameplay to sound</ShimmerSweep>
            </p>
            <h1 className="mt-3 max-w-[14ch] font-display text-[clamp(2.75rem,6.6vw,8rem)] leading-[0.92] font-extrabold tracking-[-0.04em] text-ink" id="hero-title">
              Give your silent game a sound kit.
            </h1>
            {reduce ? (
              <p className="mt-6 font-display text-[clamp(1.125rem,4.6vw,1.375rem)] font-bold text-ink/85 lg:text-[clamp(1.375rem,2.2vw,2.25rem)]">{PHRASES.join(". ")}.</p>
            ) : (
              <div className="mt-6 flex items-center gap-4 font-display text-[clamp(1.125rem,4.6vw,1.375rem)] font-bold text-ink/85 lg:text-[clamp(1.375rem,2.2vw,2.25rem)]">
                <span className="relative grid size-[1.25em] shrink-0 place-items-center">
                  <AnimatePresence initial={false}>
                    <motion.span
                      animate={{ filter: "blur(0px)", opacity: 1, scale: 1 }}
                      className="absolute inset-0 grid place-items-center"
                      exit={{ filter: "blur(4px)", opacity: 0, scale: 0.3 }}
                      initial={{ filter: "blur(4px)", opacity: 0, scale: 0.3 }}
                      key={phrase}
                      transition={{ bounce: 0, duration: 0.3, type: "spring" }}
                    >
                      <PixelIcon active className="max-lg:[&>*]:size-9" name={PHRASE_ICONS[phrase]} size={48} />
                    </motion.span>
                  </AnimatePresence>
                </span>
                <MorphingText className="mx-0 h-[1.25em] w-[14em] max-w-none text-left text-[1em] leading-[1.25] md:h-[1.25em] lg:text-[1em]" onIndex={setPhrase} texts={PHRASES} />
                <span className="sr-only">{PHRASES.join(". ")}.</span>
              </div>
            )}
            <div className="mt-8 flex flex-wrap items-center gap-6">
              {cta}
              {returning && (
                <button className="font-semibold text-ink underline underline-offset-4 transition-transform active:scale-[0.96]" onClick={onForm} type="button">
                  Change the clip or settings
                </button>
              )}
            </div>
          </div>
          <div className="px-[clamp(1.25rem,3.5vw,3.5rem)] pb-2">
            <PoweredByLivepeer />
          </div>
        </PixelFlowField>
      </div>
    </section>
  );
}

const EXAMPLE_EVENTS = ["Jump", "Land", "Coin pickup", "Hurt", "UI click", "Dash", "Wall slide", "Door opens", "Power-up", "Menu back", "Checkpoint", "Enemy hit"];
const RIBBON_ICONS: IconName[] = ["sound", "coin", "listen", "events"];

const PADS: { id: string; label: string; what: string; bg: string; ink: string; icon: IconName }[] = [
  { id: "jump", label: "Jump", what: "Small character jumps off the ground", bg: "#dcebfb", ink: "#2162a2", icon: "up" },
  { id: "land", label: "Land", what: "Small character lands on a platform", bg: "#e8e4fb", ink: "#5a4bb8", icon: "down" },
  { id: "pickup", label: "Coin pickup", what: "Player collects a coin", bg: "#fbf0d2", ink: "#7b5a02", icon: "coin" },
  { id: "hurt", label: "Hurt", what: "Player touches spikes and is knocked back", bg: "#fde3da", ink: "#a4361a", icon: "heart" },
  { id: "ui_click", label: "UI click", what: "On-screen button is pressed", bg: "#d9f3ef", ink: "#176f65", icon: "cursor" },
  { id: "any", label: "Any action", what: "", bg: "#ffffff", ink: "#c4621d", icon: "plus" },
];
const promptFor = (what: string, d: (typeof DEFAULTS)[number]) => `${what}. Texture: ${d.texture}. Envelope: ${d.envelope}. Hierarchy: ${d.hierarchy}`;

// Example events and the prompt format CueBound really sends.
function PromptExplorer() {
  const reduce = useReducedMotion();
  const [pad, setPad] = useState("pickup");
  const [style, setStyle] = useState("0");
  const [own, setOwn] = useState("Hero slides down a wall, slowing the fall");
  const current = PADS.find((p) => p.id === pad)!;
  return (
    <div className="@container rounded-[1.75rem] border-[3px] border-ink bg-paper p-4 sm:p-7">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-display text-[1.5rem] font-extrabold">What CueBound sends</h3>
        <p className="text-[0.9375rem] text-ink/70">Five examples, and any action your game has. Choose a pad to see its prompt.</p>
      </div>
      <div aria-label="Example events" className="grid grid-cols-2 gap-4 @md:grid-cols-3 @3xl:grid-cols-6" role="radiogroup">
        {PADS.map((p, i) => {
          const on = p.id === pad;
          return (
            <motion.button
              animate={on && !reduce ? { y: [0, -8, 0] } : { y: 0 }}
              aria-checked={on}
              className={`btn-chunky flex h-[9rem] flex-col items-center justify-center gap-2 rounded-2xl border-[3px] px-2 text-center font-display text-[1.125rem] font-bold ${on ? "border-gold" : "border-ink/80"}`}
              key={p.id}
              onClick={() => setPad(p.id)}
              role="radio"
              style={{ background: p.bg, color: p.ink, ["--chunky" as string]: on ? "#b9801c" : "rgba(28,27,25,0.8)" }}
              transition={{ duration: 0.45 }}
              type="button"
              whileHover="hover"
            >
              <PixelIcon active={on} delay={i * 0.2} name={p.icon} size={64} />
              <span className="text-ink">{p.label}</span>
            </motion.button>
          );
        })}
      </div>
      <div className="mt-5 rounded-2xl bg-white p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[0.9375rem] font-semibold text-ink/70">{pad === "any" ? "Prompt for your action" : `Prompt for ${current.label}`}</p>
          <AnimatedTabs
            activeTab={style}
            className="pointer-coarse:[&>[role=tab]]:min-h-11"
            layoutId="landing-style"
            onChange={setStyle}
            tabs={DEFAULTS.map((d, i) => ({ id: String(i), label: d.name }))}
            variant="segment"
          />
        </div>
        {pad === "any" && (
          <label className="mb-3 flex flex-col gap-1.5">
            <span className="text-[0.875rem] text-ink/70">Say what happens in your game, like a dash or a door opening</span>
            <input className="rounded-lg border-2 border-ink/20 bg-paper px-3 py-2 font-mono text-[1rem]" maxLength={120} onChange={(e) => setOwn(e.target.value)} value={own} />
          </label>
        )}
        <p className="min-h-[5rem] font-mono text-[1rem] leading-relaxed text-ink">
          {pad === "any" ? (
            promptFor(own.trim().replace(/[.\s]+$/, "") || "Describe the action", DEFAULTS[Number(style)])
          ) : (
            <TypewriterText key={pad + style} speed={16}>
              {promptFor(current.what, DEFAULTS[Number(style)])}
            </TypewriterText>
          )}
        </p>
      </div>
    </div>
  );
}

const SKILL_JSON = `{
  "events": [
    { "id": "checkpoint",
      "label": "Checkpoint",
      "description": "A flag lights up as the hero passes",
      "recurring": false }
  ]
}`;

// The clip-free way in: skills/cuebound-events has a coding agent list the game's actions from its code.
function AgentSkill() {
  return (
    <div className="mx-auto grid max-w-[88rem] grid-cols-1 items-center gap-6 rounded-[1.75rem] border-[3px] border-ink bg-paper p-5 sm:gap-10 sm:p-8 lg:grid-cols-2" id="agent-skill">
      <div>
        <p className="font-mono text-[0.9375rem] font-semibold tracking-[0.1em] text-orange-deep uppercase">No clip? Use the agent skill</p>
        <h3 className="mt-2 font-display text-[clamp(1.5rem,5vw,2rem)] leading-tight font-extrabold">Your coding agent lists the actions from your code.</h3>
        <p className="mt-3 text-[1.125rem] text-ink/75">
          A clip only shows what you happened to play. The <code className="rounded bg-muted px-1.5">cuebound-events</code> skill has your agent read the game’s code and list the actions
          that need a sound, including rare ones like a checkpoint or a level complete.
        </p>
        <ol className="mt-5 list-inside list-decimal space-y-2 text-[1.0625rem]">
          <li>
            Copy <code className="rounded bg-muted px-1.5">skills/cuebound-events</code> from the CueBound repo into your agent’s skills folder.
          </li>
          <li>Ask it for “the CueBound event list”.</li>
          <li>
            Paste <code className="rounded bg-muted px-1.5">cuebound-events.json</code> on the Events screen.
          </li>
        </ol>
      </div>
      <pre className="rounded-2xl bg-night p-4 font-mono text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap text-ivory sm:p-6">{SKILL_JSON}</pre>
    </div>
  );
}

function BriefScroll() {
  const reduce = useReducedMotion();
  return (
    <div className="relative mx-auto w-full max-w-[36rem] pt-10 pb-20">
      <svg aria-hidden="true" className="absolute inset-x-0 bottom-3 h-28 w-full" preserveAspectRatio="none" viewBox="0 0 520 96">
        <motion.path
          animate={reduce ? undefined : { strokeDashoffset: [0, -40] }}
          d="M10 80 Q 260 -20 510 80"
          fill="none"
          stroke="#f5b83d"
          strokeDasharray="10 10"
          strokeLinecap="round"
          strokeWidth="5"
          transition={{ duration: 1.6, ease: "linear", repeat: Number.POSITIVE_INFINITY }}
        />
      </svg>
      <span className="absolute bottom-0 left-0 rounded-full border-2 border-ink bg-white px-4 py-1.5 text-[0.9375rem] font-semibold">You</span>
      <span className="absolute right-0 bottom-0 rounded-full border-2 border-ink bg-white px-4 py-1.5 text-[0.9375rem] font-semibold">A teammate, or a fresh session</span>
      <PixelIcon className="absolute bottom-20 left-[18%]" delay={0.3} name="coin" size={36} />
      <PixelIcon className="absolute right-[18%] bottom-20" delay={0.9} name="coin" size={36} />
      <TiltCard className="mx-auto w-[88%] rounded-2xl" maxTilt={7}>
        <motion.div
          animate={reduce ? undefined : { rotate: [-1.2, 1.2, -1.2] }}
          className="relative rounded-2xl border-[3px] border-ink bg-[#fbf6e8] p-7 shadow-[0_6px_0_rgba(28,27,25,0.85)]"
          transition={{ duration: 5, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }}
        >
          <span aria-hidden="true" className="absolute -top-3.5 left-5 h-7 w-[calc(100%-2.5rem)] rounded-full border-[3px] border-ink bg-gold" />
          <span aria-hidden="true" className="absolute -bottom-3.5 left-5 h-7 w-[calc(100%-2.5rem)] rounded-full border-[3px] border-ink bg-gold" />
          <div className="flex items-center gap-4 border-b-2 border-ink/15 pb-4">
            <PixelIcon name="brief" size={56} />
            <div>
              <p className="font-display text-[1.75rem] font-extrabold">Sound brief</p>
              <p className="text-[0.875rem] font-medium text-muted-foreground">Example, revision 1</p>
            </div>
          </div>
          <dl className="mt-4 space-y-2.5 text-[1.0625rem]">
            <div className="flex gap-2">
              <dt className="font-bold">Style:</dt>
              <dd>Soft &amp; rounded</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-bold">Kept:</dt>
              <dd>Jump · Land · Coin pickup, with a fingerprint for every file</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-bold">Next:</dt>
              <dd>Dash, prompted with this brief</dd>
            </div>
          </dl>
        </motion.div>
      </TiltCard>
    </div>
  );
}

const FACTS = [
  { id: "approve", title: "Only what you approve", text: "You see every field before it’s saved, and you can edit or remove it." },
  { id: "check", title: "Checked by fingerprint", text: "A teammate’s copy of the pack must match the brief byte for byte before anything new is made." },
  { id: "private", title: "Your clip stays here", text: "Your clip never leaves this computer. The brief leaves out your full prompts and the takes you skipped." },
];

export function Landing() {
  const { S, go } = useKit();
  const [formOpen, setFormOpen] = useState(false);
  const reduce = useReducedMotion();
  const p = S.project;
  const next: Screen | null = p ? (!S.cues.length ? "events" : !p.directionId ? "style" : "listen") : null;
  const primary = () => (next ? go(next) : setFormOpen(true));

  const cta = (
    <MagneticButton asChild radius={150} strength={0.2}>
      <ShimmerButton
        background="#f5b83d"
        borderRadius="1rem"
        className="btn-chunky h-auto gap-3 border-[3px] border-ink px-[clamp(1.25rem,4vw,2rem)] py-[clamp(0.75rem,2.5vw,1rem)] font-display text-[clamp(1.125rem,4.4vw,1.375rem)] font-extrabold text-ink"
        onClick={primary}
        shimmerColor="#ffffff"
        shimmerDuration="2.6s"
      >
        {next ? "Continue your sound kit" : "Start your sound kit"}
        <motion.span animate={reduce ? undefined : { x: [0, 6, 0] }} transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY }}>
          <ArrowRight aria-hidden="true" className="size-7" weight="bold" />
        </motion.span>
      </ShimmerButton>
    </MagneticButton>
  );

  return (
    <div className="bg-sky">
      <Hero cta={cta} go={go} onForm={() => setFormOpen(true)} onStart={primary} returning={!!next} />

      <div className="border-y-[3px] border-ink bg-gold py-4">
        <InfiniteSlider gap={40} speed={50} speedOnHover={18}>
          {EXAMPLE_EVENTS.map((e, i) => (
            <span className="flex items-center gap-3 font-display text-[clamp(1.125rem,0.95rem+0.8vw,1.375rem)] font-extrabold whitespace-nowrap text-ink" key={e}>
              <PixelIcon delay={i * 0.2} name={RIBBON_ICONS[i % RIBBON_ICONS.length]} size={34} />
              {e}
            </span>
          ))}
        </InfiniteSlider>
      </div>

      <section aria-labelledby="story-title" className="relative overflow-hidden bg-sky pt-16 pb-10" id="story">
        <div className="px-4 sm:px-0">
          <SectionTitle id="story-title">Follow one jump</SectionTitle>
        </div>
        <p className="mx-auto mt-6 max-w-[48ch] px-4 text-center text-[clamp(1.0625rem,0.95rem+0.5vw,1.25rem)] text-ink/75 sm:px-8">
          From the moment in your clip to the line of code that plays it. Scroll, and the sprite rides along.
        </p>
        <div className="mt-10">
          <JumpStory S={S} />
        </div>
        <div className="mt-16 px-4 sm:px-10">
          <AgentSkill />
        </div>
      </section>

      <section aria-labelledby="livepeer-title" className="bg-ivory py-16" id="livepeer">
        <div className="mx-auto max-w-[88rem] px-4 sm:px-10">
          <div className="flex flex-col items-center">
            <PoweredByLivepeer />
            <SectionTitle id="livepeer-title">Livepeer generates your sounds</SectionTitle>
            <p className="mt-6 max-w-[60ch] text-center text-[clamp(1.0625rem,0.95rem+0.5vw,1.25rem)] text-ink/75">
              For each event, CueBound sends a short text prompt to the Livepeer network. The mirelo-sfx model turns it into audio in seconds.
            </p>
          </div>
          <div className="mt-16">
            <LivepeerLive />
          </div>
          <div className="mt-10">
            <PromptExplorer />
          </div>
        </div>
      </section>

      <section aria-labelledby="brief-title" className="relative overflow-hidden bg-sky pt-16 pb-40" id="brief">
        <img alt="" aria-hidden="true" className="pixelated pointer-events-none absolute inset-x-0 bottom-0 h-[32rem] w-full object-cover object-[right_bottom]" src="/art/bg-hills.png" />
        <img alt="" aria-hidden="true" className="pixelated pointer-events-none absolute inset-x-0 bottom-0 h-[15rem] w-full object-cover object-[left_bottom]" src="/art/bg-front.png" />
        <div className="relative z-10 mx-auto grid max-w-[88rem] grid-cols-1 items-center gap-12 px-4 sm:px-10 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-[clamp(2rem,5vw,5rem)] leading-[1] font-extrabold tracking-[-0.03em]" id="brief-title">
              <RevealText triggerOnView>Your sound brief travels with your team.</RevealText>
            </h2>
            <ScrollRevealParagraph
              className="mt-6 text-[clamp(1.125rem,0.9rem+1vw,1.375rem)] leading-relaxed font-medium text-ink"
              paragraph="Approve a short sound brief: the style, what each sound should be, and fingerprints of the kept audio. CueBound saves it to the OriginTrail DKG, a shared knowledge graph. Later, a teammate or a fresh session fetches it by reference, and its style notes go into the prompt for the next mechanic."
            />
          </div>
          <BriefScroll />
        </div>
        <GlowHover
          className="relative z-10 mx-auto mt-10 grid max-w-[88rem] grid-cols-1 gap-6 px-4 sm:px-10 lg:grid-cols-3"
          glowIntensity={0.18}
          items={FACTS.map((f) => ({
            id: f.id,
            theme: { hue: 40, saturation: 90, lightness: 60 },
            element: (
              <div className="rounded-2xl border-[3px] border-ink bg-white p-6">
                <h3 className="font-display text-[1.375rem] font-bold">{f.title}</h3>
                <p className="mt-1.5 text-[1rem] text-ink/75">{f.text}</p>
              </div>
            ),
          }))}
        />
      </section>

      <section aria-labelledby="cta-title" className="relative min-h-[62svh] overflow-hidden bg-night pt-20 pb-60 text-center">
        <GravityStars className="absolute inset-0" color="#f5b83d" count={90} glow={6} speed={0.3} starSize={2} />
        <img alt="" aria-hidden="true" className="pixelated pointer-events-none absolute inset-x-0 bottom-0 h-[34rem] w-full object-cover object-[right_bottom] brightness-[0.38] saturate-[0.8]" src="/art/bg-hills.png" />
        <img alt="" aria-hidden="true" className="pixelated pointer-events-none absolute inset-x-0 bottom-0 h-[16rem] w-full object-cover object-[right_bottom] brightness-[0.8]" src="/art/bg-front.png" />
        <div className="relative z-10 mx-auto max-w-[70rem] px-4 sm:px-10">
          <h2 className="font-display text-[clamp(2.5rem,7vw,8rem)] leading-[0.95] font-extrabold tracking-[-0.035em] text-ivory" id="cta-title">
            <WaveText amplitude={8}>Ready to hear your game?</WaveText>
          </h2>
          <p className="mx-auto mt-8 max-w-[40ch] font-mono text-[clamp(1.0625rem,0.8rem+1.2vw,1.375rem)] leading-relaxed text-ivory/85">Turn a gameplay clip, or your game’s code, into a sound kit that feels like it belongs.</p>
          <div className="mt-10 flex justify-center">{cta}</div>
          <div className="mt-4 flex justify-center">
            <PoweredByLivepeer light />
          </div>
        </div>
      </section>

      <footer className="bg-ivory">
        <div className="mx-auto flex max-w-[92rem] flex-wrap items-center justify-between gap-6 px-4 py-8 sm:px-10 sm:py-10">
          <Logo />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[1rem] font-medium sm:gap-8 [&>a]:py-2.5">
            <Jump to="story">How it works</Jump>
            <Jump to="agent-skill">Agent skill</Jump>
            <Jump to="livepeer">Livepeer</Jump>
            <Jump to="brief">Sound brief</Jump>
            <PoweredByLivepeer />
          </div>
          <p className="w-full text-[0.875rem] text-muted-foreground">
            Sounds are generated by the mirelo-sfx model on the Livepeer network. Pixel art made for CueBound; see <code>web/public/art/PROVENANCE.md</code>.
          </p>
        </div>
      </footer>

      <Drawer
        className="data-[vaul-drawer-direction=right]:w-[min(36rem,100vw)] data-[vaul-drawer-direction=right]:sm:max-w-[36rem] bg-white text-[1rem] [&_[data-slot=drawer-description]]:text-[1rem] [&_[data-slot=drawer-title]]:font-display [&_[data-slot=drawer-title]]:text-[1.75rem] [&_[data-slot=drawer-title]]:font-extrabold"
        description="Three quick things. Then you mark when each sound plays."
        onOpenChange={setFormOpen}
        open={formOpen}
        side="right"
        title="Start your sound kit"
      >
        <div className="max-h-[calc(100dvh-110px)] overflow-y-auto pb-8">
          <StartForm onDone={() => setFormOpen(false)} />
        </div>
      </Drawer>
    </div>
  );
}
