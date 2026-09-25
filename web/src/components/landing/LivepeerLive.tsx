import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import BorderBeam from "@/components/smoothui/border-beam";
import { PixelIcon } from "@/components/PixelIcon";
import { RollingNumber } from "@/components/RollingNumber";
import type { Job } from "@/api";
import { useKit } from "@/store";

const STATUS: Record<Job["status"], [string, string]> = {
  intent: ["Queued", "bg-muted text-ink"],
  submitted: ["Sent", "bg-brand-lighter text-orange-deep"],
  running: ["Rendering", "bg-brand-lighter text-orange-deep"],
  done: ["Done", "bg-kept-soft text-kept"],
  failed: ["Failed", "bg-[#fde3da] text-destructive"],
  unknown: ["No answer yet", "bg-muted text-ink"],
};

const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};

// Zeros until the card scrolls into view, then the real value rolls in.
function Rolling({ value, seen }: { value: string; seen: boolean }) {
  return <RollingNumber value={seen ? value : value.replace(/\d/g, "0")} />;
}

export function LivepeerLive() {
  const { S, livepeer, livepeerNote, setPanelOpen } = useKit();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: "-15% 0px" }) || !!reduce;
  // A row flashes once when it first appears or its status changes after the page loaded.
  const known = useRef<Set<string> | null>(null);
  const flashUntil = useRef(new Map<string, number>());
  const jobs = [...S.jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const now = Date.now();
  if (known.current) for (const j of jobs) if (!known.current.has(j.id + j.status)) flashUntil.current.set(j.id, now + 1400);
  const flashing = (id: string) => (flashUntil.current.get(id) ?? 0) > now;
  useEffect(() => {
    known.current = new Set(S.jobs.map((j) => j.id + j.status));
  }, [S.jobs]);
  const cue = (j: Job) => S.cues.find((c) => c.id === j.cueId)?.label ?? "Removed event";
  const wait = livepeer?.latency;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]" ref={ref}>
      {/* The card follows its own width: one column of figures when narrow, two when there is room. */}
      <BorderBeam className="@container" colorFrom="#f5b83d" colorTo="#c4621d" duration={7} radius={28} size={160}>
        <div className="flex h-full flex-col gap-6 rounded-[28px] border-[3px] border-ink bg-white p-5 @sm:p-8">
          <div className="flex items-center gap-4">
            <PixelIcon active name="livepeer" size={64} />
            <div>
              <h3 className="font-display text-[1.5rem] leading-tight font-extrabold">The model card</h3>
              <p className="text-[0.9375rem] text-ink/70">Read live from Livepeer</p>
            </div>
          </div>
          {livepeer ? (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-5 @sm:grid-cols-2">
              <div className="@sm:col-span-2">
                <dt className="text-[0.875rem] font-semibold text-ink/60">Model</dt>
                <dd className="font-display text-[1.75rem] font-extrabold">{livepeer.capability}</dd>
                <dd className="font-mono text-[0.875rem] text-ink/70">{livepeer.modelId}</dd>
              </div>
              {livepeer.pricePerSecond != null && (
                <div>
                  <dt className="text-[0.875rem] font-semibold text-ink/60">Price per second of audio</dt>
                  <dd className="font-mono text-[2.5rem] leading-none font-semibold text-ink">
                    <Rolling seen={seen} value={`$${livepeer.pricePerSecond.toFixed(4)}`} />
                  </dd>
                  <dd className="mt-1 text-[0.875rem] text-ink/70">About ${(livepeer.pricePerSecond * 3).toFixed(2)} a 3-second take. List price, not a live meter.</dd>
                </div>
              )}
              {wait?.p50Ms != null && (
                <div>
                  <dt className="text-[0.875rem] font-semibold text-ink/60">Typical wait</dt>
                  <dd className="flex items-baseline gap-2 font-mono text-[2.5rem] leading-none font-semibold text-ink">
                    <Rolling seen={seen} value={(wait.p50Ms / 1000).toFixed(1)} />
                    <span className="text-[1.25rem]">s</span>
                  </dd>
                  {wait.p95Ms != null && <dd className="mt-1 text-[0.875rem] text-ink/70">Slow ones take {(wait.p95Ms / 1000).toFixed(1)} s</dd>}
                </div>
              )}
            </dl>
          ) : (
            <p className="text-ink/70">{livepeerNote ?? "Asking Livepeer for the model card…"}</p>
          )}
        </div>
      </BorderBeam>

      <div className="@container flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="font-display text-[1.5rem] font-extrabold">Your latest renders</h3>
          {S.jobs.length > 0 && (
            <button className="text-[0.9375rem] font-semibold text-orange-deep underline underline-offset-4 transition-transform active:scale-[0.96]" onClick={() => setPanelOpen(true)} type="button">
              Open all {S.jobs.length} calls
            </button>
          )}
        </div>
        {jobs.length ? (
          <ul className="overflow-hidden rounded-[1.5rem] border-[3px] border-ink bg-white">
            <AnimatePresence initial={false}>
              {jobs.map((j) => {
                const [word, tone] = STATUS[j.status];
                return (
                  <motion.li
                    animate={{ opacity: 1, x: 0 }}
                    className={`flex items-center gap-4 border-b-2 border-ink/10 px-5 py-4 last:border-b-0 ${flashing(j.id) ? "animate-flash" : ""}`}
                    initial={reduce ? false : { opacity: 0, x: 24 }}
                    key={j.id}
                    layout={!reduce}
                  >
                    <PixelIcon name="sound" size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[1.0625rem] font-semibold">create_media · {cue(j)}</p>
                      <p className="truncate font-mono text-[0.8125rem] text-ink/60" title={j.providerJobId ?? undefined}>
                        {j.providerJobId ?? "not sent yet"} · {j.durationS} s · about ${(j.costUsd ?? 0).toFixed(4)}
                      </p>
                    </div>
                    {/* In a narrow column the status and the time stack, so the call and its job id keep their room. */}
                    <div className="flex shrink-0 flex-col items-end gap-1 @lg:flex-row @lg:items-center @lg:gap-4">
                      <span className={`rounded-full px-3 py-1 text-[0.8125rem] font-semibold ${tone}`}>{word}</span>
                      <span className="w-16 text-right font-mono text-[0.8125rem] text-ink/60">{ago(j.createdAt)}</span>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[1.5rem] border-[3px] border-dashed border-ink/40 bg-white/70 px-6 py-8 text-center">
            <PixelIcon name="sound" size={64} />
            <p className="font-display text-[1.375rem] font-bold">No renders yet</p>
            <p className="max-w-[34ch] text-ink/70">Yours will appear here, with the real Livepeer job id, status and cost of each one.</p>
          </div>
        )}
      </div>
    </div>
  );
}
