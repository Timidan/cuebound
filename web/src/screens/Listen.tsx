import { Pause, Play, Plus, X } from "@phosphor-icons/react";
import { motion, useAnimate, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LevelMeter } from "@/components/app/LevelMeter";
import { SceneStrip } from "@/components/app/SceneStrip";
import { usePadHits } from "@/components/app/usePadHits";
import AnimatedToggle from "@/components/smoothui/animated-toggle";
import { DotMorphButton } from "@/components/smoothui/dot-morph-button";
import Drawer, { DrawerClose } from "@/components/smoothui/drawer";
import NotificationBadge from "@/components/smoothui/notification-badge";
import Scrubber from "@/components/smoothui/scrubber";
import { ClipTimeline } from "@/components/ClipTimeline";
import { Waveform } from "@/components/Waveform";
import { api, mediaUrl, type Cue, type Take } from "@/api";
import { replaying, resync, stopReplay, trigger, unlock, type Lane } from "@/audio";
import { arriving, eventColor, estimateUsd, fresh, inFlight, isComplete, kept, needed, padKeys, padStatus, plural, retryable, stuck, takesOf, times, usd } from "@/kit";
import { Heading } from "@/screens/Start";
import { useKit } from "@/store";

// Kept takes play in the game; with none kept yet, the newest new take stands in so the clip isn't silent.
const playable = (keptTakes: Take[], freshTakes: Take[]) => (keptTakes.length ? keptTakes : freshTakes.slice(-1));
const random = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
// Play and Pause both stay mounted and cross-fade.
const iconIn = (shown: boolean) => (shown ? { opacity: 1, scale: 1, filter: "blur(0px)" } : { opacity: 0, scale: 0.25, filter: "blur(4px)" });
const ICON_SPRING = { type: "spring", duration: 0.3, bounce: 0 } as const;

function busiestPair(cues: Cue[]) {
  let best: [Cue, Cue] | null = null;
  let n = 0;
  for (const a of cues)
    for (const b of cues) {
      if (a.id >= b.id) continue;
      const hits = a.sourceTimesMs.filter((t) => b.sourceTimesMs.some((u) => Math.abs(t - u) <= 120)).length;
      if (hits > n) [best, n] = [[a, b], hits];
    }
  return best;
}

// A pad bounces and sends out a ring each time one of its sounds actually starts (tap, key, test or clip replay).
function Pad({ pulse, ink, bg, selected, label, onClick, keyHint, children }: { pulse: number; ink: string; bg: string; selected: boolean; label: string; onClick: () => void; keyHint?: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const [scope, animate] = useAnimate();
  useEffect(() => {
    if (pulse && !reduce && scope.current) void animate(scope.current, { scale: [1, 0.94, 1.035, 1] }, { duration: 0.34, ease: "easeOut" });
  }, [pulse]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="@container/pad relative w-full">
      <button
        aria-keyshortcuts={keyHint}
        aria-label={label}
        className={`flex h-44 w-full flex-col justify-between rounded-[1.6rem] p-4 text-left @xl/pads:h-[216px] transition-[box-shadow,translate,scale] duration-150 ease-out active:scale-[0.96] ${selected ? "ring-[3px] ring-ink shadow-[0_10px_28px_rgba(28,27,25,0.2)]" : "ring-1 ring-black/5 shadow-[0_2px_0_rgba(28,27,25,0.12)] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(28,27,25,0.12)]"}`}
        onClick={onClick}
        ref={scope}
        style={{ background: bg }}
        type="button"
      >
        {children}
      </button>
      {pulse > 0 && !reduce && (
        <motion.span
          animate={{ opacity: 0, scale: 1.16 }}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[1.6rem] border-[3px]"
          initial={{ opacity: 0.7, scale: 0.96 }}
          key={pulse}
          style={{ borderColor: ink }}
          transition={{ duration: 0.65, ease: "easeOut" }}
        />
      )}
    </div>
  );
}

export function TakeRow({ take, n, cue, ink }: { take: Take; n: number; cue: Cue; ink: string }) {
  const { S, run } = useKit();
  const job = S.jobs.find((j) => j.id === take.jobId);
  const other = job?.directionId && job.directionId !== S.project?.directionId ? S.directions.find((d) => d.id === job.directionId) : null;
  const set = (status: Take["status"]) => run(status === "accepted" ? "Keeping the take" : "Updating the take", () => api.take(take.id, { status }));
  const isKept = take.status === "accepted";
  return (
    <li className={`@container/take flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[1.625rem] border py-2 pr-3 pl-2 ${isKept ? "border-kept bg-[#f1faf8]" : "border-line bg-paper"}`}>
      <button aria-label={`Play take ${n} of ${cue.label}`} className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-ivory transition-transform active:scale-[0.96] pointer-coarse:size-11" onClick={() => trigger([take])} type="button">
        <Play className="size-3.5" weight="fill" />
      </button>
      <Waveform bars={56} className="@max-xl/take:order-1 @max-xl/take:basis-full @max-xl/take:px-1" color={ink} fill height={28} take={take} />
      <span className="w-[120px] shrink-0 text-[12px] leading-tight text-muted-foreground @max-xl/take:w-auto @max-xl/take:flex-1">
        Take {n}
        {other && <span className="block text-orange-deep">Made in {other.name}</span>}
      </span>
      {isKept ? (
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-kept px-2.5 py-1 text-[12px] font-semibold text-white">Kept ✓</span>
          <button className="text-[12px] font-medium text-muted-foreground underline underline-offset-2 transition-transform active:scale-[0.96] pointer-coarse:min-h-11 pointer-coarse:px-2.5" onClick={() => set("candidate")} type="button">
            Undo
          </button>
        </span>
      ) : (
        <span className="flex shrink-0 gap-1.5">
          <button className="rounded-lg bg-kept px-3 py-1.5 text-[13px] font-bold text-white transition-[scale,background-color] hover:bg-kept-hover active:scale-[0.96] pointer-coarse:min-h-11 pointer-coarse:px-4" onClick={() => set("accepted")} type="button">
            Keep
          </button>
          <button className="rounded-lg border border-input bg-white px-2.5 py-1.5 text-[13px] text-muted-foreground transition-transform active:scale-[0.96] pointer-coarse:min-h-11 pointer-coarse:px-3.5" onClick={() => set("rejected")} type="button">
            Skip
          </button>
        </span>
      )}
      {take.rawPeakDbfs != null && take.rawPeakDbfs < -30 && (
        <p className="order-last basis-full pl-12 text-[12px] text-orange-deep">Livepeer returned this one very quiet. Levelled up, it may sound noisy.</p>
      )}
    </li>
  );
}

// Takes that Livepeer is still making, that are downloading, or that need attention. Retrying a finished or unanswered job is free.
export function JobRows({ cue }: { cue: Cue }) {
  const { S, run } = useKit();
  const retry = (id: string) => run("Trying again", () => api.job(id));
  return (
    <>
      {[...inFlight(S, cue), ...arriving(S, cue)].map((j) => (
        <li className="render-row flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[1.625rem] border border-dashed border-orange/50 px-4 py-3 text-[13px]" key={j.id}>
          <span className="size-2 animate-pulse rounded-full bg-orange" />
          <span className="shimmer font-medium">
            {j.status === "done" ? "Downloading the take from Livepeer" : j.status === "running" ? "Livepeer is rendering this take" : "Waiting for a Livepeer worker"}
          </span>
          <span className="ml-auto min-w-0 font-mono text-[11px] break-all text-muted-foreground">{j.providerJobId ?? "not sent yet"}</span>
        </li>
      ))}
      {stuck(S, cue).map((j) => (
        <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[1.625rem] border border-destructive/30 bg-[#fdf1ec] px-4 py-2.5 text-[13px]" key={j.id}>
          <span className="font-medium text-destructive">
            {j.status === "done" ? "Livepeer made this take, but it didn’t arrive." : j.status === "failed" ? "This take didn’t finish." : "No answer from Livepeer yet."}
          </span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground" title={j.error}>
            {j.error}
          </span>
          {retryable(j) && (
            <button className="shrink-0 rounded-lg border border-input bg-white px-2.5 py-1 font-semibold transition-transform active:scale-[0.96] pointer-coarse:min-h-11" onClick={() => retry(j.id)} type="button">
              Try again · free
            </button>
          )}
        </li>
      ))}
    </>
  );
}

function PadDrawer({ cue, open, onOpenChange, muted, onMute }: { cue: Cue; open: boolean; onOpenChange: (o: boolean) => void; muted: boolean; onMute: (m: boolean) => void }) {
  const { S, run, pricePerS } = useKit();
  const [note, setNote] = useState("");
  const [gain, setGain] = useState(cue.processing.gainDb);
  const [showSkipped, setShowSkipped] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => setGain(cue.processing.gainDb), [cue.id, cue.processing.gainDb]);

  const ink = eventColor(S.cues, cue).ink;
  const all = takesOf(S, cue).filter((t) => t.finalPath);
  const shown = all.filter((t) => t.status !== "rejected");
  const skipped = all.filter((t) => t.status === "rejected");
  const busy = [...inFlight(S, cue), ...arriving(S, cue)];
  const problems = stuck(S, cue);
  const inBrief = S.briefs.some((b) => b.brief.cues.some((c) => c.eventId === cue.eventId));
  const k = kept(S, cue).length;
  const need = needed(cue);
  const left = S.project ? S.project.runCeilingUsd - S.spentUsd : 0;
  const cost = estimateUsd([cue], 3, pricePerS);
  const number = (t: Take) => takesOf(S, cue).indexOf(t) + 1;

  const status =
    shown.length === 0 && !busy.length
      ? "No takes yet. Ask Livepeer for a few to compare."
      : k >= need
        ? `${k} ${plural(k, "take")} kept. This event is ready.`
        : fresh(S, cue).length
          ? `${fresh(S, cue).length} new ${plural(fresh(S, cue).length, "take")}. Keep ${need - k === 1 ? "the one that fits" : `the ${need - k} that fit`}.`
          : `Keep ${need - k} more ${plural(need - k, "take")}.`;

  const makeMore = async () => {
    const text = note.trim();
    const ok = await run("Asking Livepeer for new takes", async () => {
      if (!text) return api.generate({ cueIds: [cue.id], candidates: 3 });
      for (let i = 0; i < 3; i++) await api.regenerate(cue.id, text);
      return true;
    });
    if (ok) setNote("");
  };

  const saveCue = (patch: Partial<Cue>, what: string) => run(what, () => api.cues(S.cues.map((c) => (c.id === cue.id ? { ...c, ...patch } : c))));

  return (
    <Drawer
      className="border-line bg-white max-lg:overflow-y-auto max-lg:overscroll-contain max-lg:after:hidden max-md:h-[calc(100dvh-0.75rem)] max-md:data-[vaul-drawer-direction=bottom]:max-h-none [&_[data-slot=drawer-header]]:sr-only"
      description={status}
      modal={false}
      onOpenChange={onOpenChange}
      open={open}
      side="bottom"
      title={cue.label}
    >
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 pt-1 pb-6 sm:px-2 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_280px_250px] lg:gap-8">
        <section aria-label={`Takes for ${cue.label}`} className="md:col-span-2 lg:col-span-1">
          <div className="mb-3 flex items-start gap-3 max-md:sticky max-md:top-0 max-md:z-10 max-md:-mx-1 max-md:bg-white max-md:px-1 max-md:py-1">
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h2 className="text-[22px] font-bold">{cue.label}</h2>
              <p className="text-[14px] text-muted-foreground">{status}</p>
            </div>
            <DrawerClose aria-label={`Close ${cue.label}`} className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-paper transition-transform active:scale-[0.96] lg:hidden">
              <X aria-hidden="true" className="size-4" weight="bold" />
            </DrawerClose>
          </div>
          {!shown.length && !busy.length && !problems.length && (
            <p className="rounded-xl border border-dashed border-input px-4 py-6 text-[14px] text-muted-foreground">
              Livepeer hasn’t made any takes for {cue.label} yet. Each take is a different version of the same sound, so you can pick the one that fits.
            </p>
          )}
          <ul className="space-y-2 lg:max-h-[228px] lg:overflow-y-auto lg:pr-1">
            {shown.map((t) => (
              <TakeRow cue={cue} ink={ink} key={t.id} n={number(t)} take={t} />
            ))}
            <JobRows cue={cue} />
          </ul>
          {skipped.length > 0 && (
            <div className="mt-2">
              <button className="text-[12px] font-medium text-muted-foreground underline underline-offset-2 transition-transform active:scale-[0.96] pointer-coarse:min-h-11" onClick={() => setShowSkipped(!showSkipped)} type="button">
                {showSkipped ? "Hide" : "Show"} {skipped.length} skipped {plural(skipped.length, "take")}
              </button>
              {showSkipped && (
                <ul className="mt-2 space-y-1.5">
                  {skipped.map((t) => (
                    <li className="flex items-center gap-3 px-3 text-[12px] text-muted-foreground" key={t.id}>
                      <button className="font-medium underline underline-offset-2 transition-transform active:scale-[0.96]" onClick={() => trigger([t])} type="button">
                        Play take {number(t)}
                      </button>
                      <button className="font-medium underline underline-offset-2 transition-transform active:scale-[0.96]" onClick={() => run("Bringing the take back", () => api.take(t.id, { status: "candidate" }))} type="button">
                        Bring it back
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {cue.recurring && (
            <p className="mt-3 text-[13px] text-muted-foreground">
              {cue.label} plays {cue.sourceTimesMs.length ? `${times(cue.sourceTimesMs.length)} in your clip` : "often"}, so keep 2 takes. The game alternates between them so it doesn’t sound repetitive.
            </p>
          )}
        </section>

        <section aria-label="Make more takes" className="flex flex-col gap-3">
          {all.length > 0 ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold">None fit? Say what to change</span>
              <textarea
                className="min-h-[70px] rounded-xl border border-input bg-paper px-3 py-2 text-[14px]"
                onChange={(e) => setNote(e.target.value)}
                placeholder="Softer, less boomy, shorter tail"
                value={note}
              />
            </label>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              Livepeer reads “{cue.description || cue.label}” and your style, {S.directions.find((d) => d.id === S.project?.directionId)?.name}.
            </p>
          )}
          <DotMorphButton busy={busy.length > 0} disabled={cost > left + 1e-9} label={busy.length ? "Livepeer is rendering…" : `Make 3 ${all.length ? "more" : "takes"} · about ${usd(cost)}`} onClick={makeMore} tone="outline" />
          <p className="tabular text-[12px] text-muted-foreground">
            {cost > left + 1e-9 ? `That’s over your spend limit. ${usd(left)} left.` : `${usd(left)} left of your ${usd(S.project?.runCeilingUsd)} limit. Kept takes stay as they are.`}
          </p>
        </section>

        <section aria-label="Settings" className="flex flex-col gap-4">
          <div>
            <Scrubber
              decimals={0}
              label="Loudness (dB)"
              max={6}
              min={-24}
              onValueChange={(v) => {
                setGain(v);
                clearTimeout(saveTimer.current);
                saveTimer.current = setTimeout(() => saveCue({ processing: { ...cue.processing, gainDb: v } }, "Changing the loudness"), 700);
              }}
              step={1}
              value={gain}
            />
            <p className="mt-1.5 text-[12px] text-muted-foreground">Applies to every take of {cue.label}, kept ones included.</p>
            {inBrief && (
              <p className="mt-1.5 text-[12px] font-medium text-orange-deep">Changing this reprocesses the kept takes, so their fingerprints change. Save a new brief revision afterwards.</p>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span>Play in the clip replay</span>
            <AnimatedToggle checked={!muted} label={`Play ${cue.label} in the clip replay`} onChange={(v) => onMute(!v)} size="sm" />
          </div>
          <div className="text-[13px]">
            <p className="mb-1.5">Move {cue.sourceTimesMs.length === 1 ? "its mark" : `all ${cue.sourceTimesMs.length} marks`}</p>
            <div className="flex gap-1.5">
              {[-10, 10].map((d) => (
                <button
                  className="rounded-lg border border-input bg-paper px-2.5 py-1 text-[12px] font-medium transition-transform active:scale-[0.96] pointer-coarse:min-h-11 pointer-coarse:px-3.5"
                  key={d}
                  onClick={() => saveCue({ sourceTimesMs: cue.sourceTimesMs.map((t) => Math.max(0, t + d)) }, "Moving the marks")}
                  type="button"
                >
                  {Math.abs(d)} ms {d < 0 ? "earlier" : "later"}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </Drawer>
  );
}

export function Listen() {
  const { S, run, go, pricePerS, toast } = useKit();
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const cues = S.cues;
  const clip = S.project?.clipPath;
  const keys = useMemo(() => padKeys(cues), [cues]);
  const direction = S.directions.find((d) => d.id === S.project?.directionId);
  const cue = cues.find((c) => c.id === selected) ?? null;
  const pulses = usePadHits(S.takes);

  const lanes: Lane[] = useMemo(
    () => cues.filter((c) => !muted.has(c.id)).map((c) => ({ times: c.sourceTimesMs, takes: playable(kept(S, c), fresh(S, c)) })),
    [cues, muted, S],
  );
  const laneKey = lanes.map((l) => l.takes.map((t) => t.id + t.sha256).join()).join("|");

  useEffect(() => {
    if (!video) return;
    // A jump, pause, speed change or stall stops every replay voice; playback reschedules from the new position.
    const stopNow = () => {
      setPlaying(!video.paused);
      stopReplay();
    };
    const resume = () => {
      setPlaying(!video.paused);
      if (!video.paused && video.readyState >= 3) void resync(video, lanes);
      else stopReplay();
    };
    // Recovers after a stall that ends without a "playing" event.
    const tick = () => {
      if (!video.paused && video.readyState >= 3 && !replaying()) void resync(video, lanes);
    };
    const stops = ["seeking", "pause", "ended", "waiting", "stalled"] as const;
    const resumes = ["playing", "seeked", "ratechange"] as const;
    stops.forEach((e) => video.addEventListener(e, stopNow));
    resumes.forEach((e) => video.addEventListener(e, resume));
    video.addEventListener("timeupdate", tick);
    if (!video.paused) void resync(video, lanes);
    return () => {
      stops.forEach((e) => video.removeEventListener(e, stopNow));
      resumes.forEach((e) => video.removeEventListener(e, resume));
      video.removeEventListener("timeupdate", tick);
    };
  }, [video, laneKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopReplay(), []);

  const hit = useCallback(
    (c: Cue) => {
      unlock();
      const pool = playable(kept(S, c), fresh(S, c));
      if (pool.length) void trigger([random(pool)]);
      else toast(inFlight(S, c).length ? `Livepeer is still rendering ${c.label}. It plays as soon as a take arrives.` : `${c.label} has no takes yet. Make some in the panel below.`, "info");
      setSelected(c.id);
      setDrawer(true);
    },
    [S, toast],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest("input, textarea, select, [contenteditable=true], [role=slider]")) return;
      const c = cues.find((x) => keys.get(x.id) === e.key.toUpperCase());
      if (c) {
        e.preventDefault();
        hit(c);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [cues, keys, hit]);

  if (!cues.length || !S.project?.directionId) {
    const noEvents = !cues.length;
    return (
      <div className="mx-auto max-w-lg pt-16 text-center">
        <h1 className="text-[28px] font-bold">{noEvents ? "Mark your events first" : "Pick a style first"}</h1>
        <p className="mt-2 text-muted-foreground">
          {noEvents ? "Each pad here is one event from your clip." : "CueBound adds the style you pick to every prompt, so choose one before making sounds."}
        </p>
        <DotMorphButton className="mt-6" label={noEvents ? "Go to events" : "Pick a style"} onClick={() => go(noEvents ? "events" : "style")} />
      </div>
    );
  }

  const silent = cues.filter((c) => !takesOf(S, c).length && !inFlight(S, c).length && !arriving(S, c).length && !stuck(S, c).some(retryable));
  const target = cue ?? cues.find((c) => playable(kept(S, c), fresh(S, c)).length) ?? cues[0];
  const pair = busiestPair(cues);
  const pairTakes = pair?.map((c) => playable(kept(S, c), fresh(S, c))[0]).filter(Boolean) ?? [];
  const silentCost = estimateUsd(silent, 3, pricePerS);
  const complete = cues.filter((c) => isComplete(S, c)).length;

  return (
    <>
    <div className={`relative z-10 ${drawer ? "pb-[380px]" : "pb-36 sm:pb-56"}`}>
      <SceneStrip />
      <Heading icon="listen" lead="Click a pad, or press its key, to hear it. Keep the takes that fit your game." title="Your game’s sound kit">
        <span className="rounded-full border border-line bg-white px-3.5 py-2 text-[13px]">
          Style: <b>{direction?.name}</b> ·{" "}
          <button className="relative font-semibold text-orange-deep underline underline-offset-2 transition-transform active:scale-[0.96] pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-3" aria-label="Change the style" onClick={() => go("style")} type="button">
            change
          </button>
        </span>
        <DotMorphButton disabled={!S.takes.some((t) => t.status === "accepted")} label="Next: export" onClick={() => go("export")} tone={complete === cues.length ? "primary" : "outline"} />
      </Heading>

      <div className="grid grid-cols-1 items-start gap-6 sm:gap-8 xl:grid-cols-[minmax(360px,520px)_minmax(0,1fr)]">
        <section aria-label="Your clip" className="@container/clip">
          <div className={clip ? "grid grid-cols-1 items-start gap-x-6 gap-y-3 @4xl/clip:grid-cols-[minmax(0,420px)_minmax(0,1fr)]" : "flex flex-col gap-3"}>
          {clip && (
          <>
          <video className="media-edge aspect-video w-full rounded-2xl bg-[#0d1426] @4xl/clip:row-span-5" controls muted={false} preload="auto" ref={setVideo} src={mediaUrl(clip)} />
          <ClipTimeline compact cues={cues} video={video} />
          <div className="flex items-center gap-4">
            <button
              className="flex flex-1 items-center justify-center gap-2.5 rounded-2xl bg-ink px-5 py-4 text-[17px] font-bold text-ivory shadow-[0_4px_0_#000] transition-transform active:translate-y-1 active:shadow-none"
              onClick={() => {
                unlock();
                if (!video) return;
                if (video.paused) void video.play();
                else video.pause();
              }}
              type="button"
            >
              <span aria-hidden="true" className="relative size-5">
                <motion.span animate={iconIn(!playing)} className="absolute inset-0" initial={false} transition={ICON_SPRING}>
                  <Play className="size-5" weight="fill" />
                </motion.span>
                <motion.span animate={iconIn(playing)} className="absolute inset-0" initial={false} transition={ICON_SPRING}>
                  <Pause className="size-5" weight="fill" />
                </motion.span>
              </span>
              {playing ? "Pause" : "Play my clip with the kit"}
            </button>
            <LevelMeter bars={12} className="@max-sm/clip:hidden" color="#C4621D" height={44} />
          </div>
          </>
          )}
          <p className="-mb-1 text-[13px] text-muted-foreground">Test it like a player would</p>
          <div className="flex flex-wrap items-center gap-2 text-[13px] [&>button]:whitespace-nowrap">
            <button
              className="rounded-lg border border-input bg-white px-3 py-2 font-semibold transition-transform enabled:active:scale-[0.96] disabled:opacity-40 pointer-coarse:min-h-11"
              disabled={!playable(kept(S, target), fresh(S, target)).length}
              onClick={() => trigger(playable(kept(S, target), fresh(S, target)), 8, 0.12)}
              title={`Plays ${target.label} 8 times fast, like a player mashing the button`}
              type="button"
            >
              Rapid-fire test ×8 <span className="font-normal text-muted-foreground">· {target.label}</span>
            </button>
            {pair && (
              <button
                className="rounded-lg border border-input bg-white px-3 py-2 font-semibold transition-transform enabled:active:scale-[0.96] disabled:opacity-40 pointer-coarse:min-h-11"
                disabled={pairTakes.length < 2}
                onClick={() => trigger(pairTakes)}
                title={`${pair[0].label} and ${pair[1].label} often happen at the same moment in your clip`}
                type="button"
              >
                Overlap test <span className="font-normal text-muted-foreground">· {pair.map((c) => c.label).join(" + ")}</span>
              </button>
            )}
          </div>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {clip ? "Each sound plays at its marked moments in the clip. " : "Add a gameplay clip to hear the kit play along with your game. "}Kept takes play first. An event with none kept plays its newest take.
          </p>
          </div>
        </section>

        <section aria-label="Pads" className="@container/pads flex flex-col gap-4">
          {silent.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-orange/40 bg-[#fff7ef] px-4 py-4 sm:px-5">
              <div className="min-w-[min(260px,100%)] flex-1">
                <p className="font-semibold">
                  {silent.length === cues.length ? "No sounds yet" : `${silent.length} ${plural(silent.length, "event")} ${silent.length === 1 ? "has" : "have"} no sounds yet`}
                </p>
                <p className="text-[13px] text-muted-foreground">
                  Livepeer makes 3 takes of each, prompted with your style, {direction?.name}. Compare them here and keep the best, or open a pad to make takes for one event.
                </p>
              </div>
              <DotMorphButton
                disabled={!S.project || silentCost > S.project.runCeilingUsd - S.spentUsd}
                label={`${silent.length === 1 ? `Make 3 takes of ${silent[0].label}` : "Make 3 takes of each"} · about ${usd(silentCost)}`}
                onClick={() => run("Asking Livepeer for takes", () => api.generate({ cueIds: silent.map((c) => c.id), candidates: 3 }))}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 @xl/pads:grid-cols-3 @xl/pads:gap-5">
            {cues.map((c) => {
              const col = eventColor(cues, c);
              const st = padStatus(S, c);
              const shown = kept(S, c)[0] ?? fresh(S, c).at(-1);
              const on = selected === c.id && drawer;
              return (
                <NotificationBadge className="-top-2 -right-2 h-7 min-w-7 bg-orange-deep text-[13px]" count={fresh(S, c).length} key={c.id} position="top-right" variant="count">
                  <Pad
                    bg={col.bg}
                    ink={col.ink}
                    keyHint={keys.get(c.id)}
                    label={`${c.label}. ${clip ? `${times(c.sourceTimesMs.length)} in the clip. ` : ""}${st.text}. Press ${keys.get(c.id)} to play.`}
                    onClick={() => hit(c)}
                    pulse={pulses[c.id] ?? 0}
                    selected={on}
                  >
                    <span className="flex w-full items-start justify-between">
                      <span className="flex flex-col gap-1">
                        <span className="font-display text-[clamp(1.25rem,11cqi,26px)] font-bold leading-tight">{c.label}</span>
                        {clip && <span className="tabular text-[13px] text-muted-foreground">{times(c.sourceTimesMs.length)}</span>}
                      </span>
                      <kbd className="flex h-[32px] min-w-[32px] items-center justify-center rounded-md border border-black/20 border-b-4 bg-white px-2 font-mono text-[14px] font-semibold">{keys.get(c.id)}</kbd>
                    </span>
                    <span className="flex w-full max-w-[260px]"><Waveform color={col.ink} fill height={48} take={shown} /></span>
                    <span className={`tabular flex items-center gap-1.5 text-[14px] font-semibold ${st.tone === "todo" || st.tone === "busy" ? "text-orange-deep" : st.tone === "done" ? "" : "text-muted-foreground"}`} style={st.tone === "done" ? { color: col.ink } : undefined}>
                      {st.tone === "busy" && <span className="size-2 animate-pulse rounded-full bg-orange" />}
                      {st.text}
                    </span>
                  </Pad>
                </NotificationBadge>
              );
            })}
            <button
              className="flex h-44 flex-col items-center justify-center gap-2 rounded-[1.6rem] border-2 border-dashed border-input bg-white/60 px-3 text-center text-muted-foreground transition-transform hover:border-ink/30 active:scale-[0.96] @xl/pads:h-[216px]"
              onClick={() => go("events")}
              type="button"
            >
              <Plus aria-hidden="true" className="size-6 text-orange" weight="bold" />
              <span className="font-semibold text-ink">Add an event</span>
              <span className="text-[12px]">for example “wall slide”</span>
            </button>
          </div>
          <p className="text-[13px] text-muted-foreground">Events that play often, like Jump, need 2 kept takes. The game alternates between them so repeats don’t sound robotic.</p>
        </section>
      </div>

      {cue && (
        <PadDrawer
          cue={cue}
          muted={muted.has(cue.id)}
          onMute={(m) => {
            const next = new Set(muted);
            if (m) next.add(cue.id);
            else next.delete(cue.id);
            setMuted(next);
          }}
          onOpenChange={setDrawer}
          open={drawer}
        />
      )}
    </div>
    </>
  );
}
