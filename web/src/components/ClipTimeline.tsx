import { useEffect, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { Cue } from "@/api";
import { eventColor, fmtTime } from "@/kit";

export type Mark = { cueId: string; index: number };

function useVideoTime(video: HTMLVideoElement | null) {
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  useEffect(() => {
    if (!video) return;
    let raf = 0;
    const tick = () => {
      setT(video.currentTime * 1000);
      if (!video.paused) raf = requestAnimationFrame(tick);
    };
    const onMeta = () => setDur(video.duration * 1000 || 0);
    const onPlay = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const onTime = () => setT(video.currentTime * 1000);
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("play", onPlay);
    video.addEventListener("seeked", onTime);
    video.addEventListener("timeupdate", onTime);
    if (video.readyState >= 1) onMeta();
    onTime();
    return () => {
      cancelAnimationFrame(raf);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("seeked", onTime);
      video.removeEventListener("timeupdate", onTime);
    };
  }, [video]);
  return { t, dur };
}

export function ClipTimeline({
  cues,
  video,
  selected,
  onSelect,
  compact = false,
}: {
  cues: Cue[];
  video: HTMLVideoElement | null;
  selected?: Mark | null;
  onSelect?: (m: Mark) => void;
  compact?: boolean;
}) {
  const { t, dur } = useVideoTime(video);
  const total = dur || Math.max(1000, ...cues.flatMap((c) => c.sourceTimesMs)) + 1000;
  const pct = (ms: number) => `${Math.min(100, Math.max(0, (ms / total) * 100))}%`;
  const seek = (ms: number) => {
    if (video) video.currentTime = ms / 1000;
  };
  const pick = (m: Mark) => {
    seek(cues.find((c) => c.id === m.cueId)!.sourceTimesMs[m.index]);
    onSelect?.(m);
  };
  const seekAt = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * total);
  };
  const onKey = (cue: Cue) => (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const times = cue.sourceTimesMs;
    if (!times.length) return;
    const cur = selected?.cueId === cue.id ? selected.index : -1;
    const next = e.key === "ArrowRight" ? Math.min(times.length - 1, cur + 1) : Math.max(0, cur < 0 ? 0 : cur - 1);
    pick({ cueId: cue.id, index: next });
  };
  const ticks = Array.from({ length: Math.floor(total / 5000) + 1 }, (_, i) => i * 5000).filter((ms) => ms < total);
  // Compact on request, and whenever the timeline itself is narrow (phones).
  const wide = (cls: string) => (compact ? "" : cls);
  const lane = `h-4 pointer-coarse:h-6 ${wide("@lg/timeline:h-7")}`;

  return (
    <div className="@container/timeline rounded-xl border border-line bg-white px-3 pt-2 pb-2.5">
      <div className="flex">
        <div className={`w-24 shrink-0 ${wide("@lg/timeline:w-32")}`}>
          <div className="h-5" />
          {cues.map((c) => (
            <div className={`${lane} flex items-center gap-2 truncate pr-2 text-xs font-medium`} key={c.id}>
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: eventColor(cues, c).ink }} />
              <span className="truncate" title={c.label}>{c.label}</span>
              {!compact && <span className="ml-auto hidden font-mono text-[11px] text-muted-foreground tabular @lg/timeline:inline">{c.sourceTimesMs.length}</span>}
            </div>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="relative h-5 cursor-pointer" onClick={seekAt}>
            {ticks.map((ms) => (
              <span className="absolute top-0 border-l border-line pl-1 font-mono text-[11px] text-muted-foreground" key={ms} style={{ left: pct(ms) }}>
                {fmtTime(ms).replace(/\.\d+$/, "")}
              </span>
            ))}
          </div>
          {cues.map((c) => {
            const ink = eventColor(cues, c).ink;
            return (
              <div
                aria-label={`${c.label}: ${c.sourceTimesMs.length} moments. Use the arrow keys to step through them.`}
                className={`${lane} relative cursor-pointer rounded-sm focus-visible:bg-accent`}
                key={c.id}
                onClick={seekAt}
                onKeyDown={onKey(c)}
                role="group"
                tabIndex={0}
              >
                <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
                {c.sourceTimesMs.map((ms, i) => {
                  const on = selected?.cueId === c.id && selected.index === i;
                  return (
                    <button
                      aria-label={`${c.label} at ${fmtTime(ms)}`}
                      className={`absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-[2px] pointer-coarse:after:absolute pointer-coarse:after:-inset-x-2 pointer-coarse:after:-inset-y-1.5 ${wide("@lg/timeline:h-5 @lg/timeline:w-[5px]")} ${on ? "outline-2 outline-offset-1 outline-ink" : ""}`}
                      key={i}
                      onClick={(e) => {
                        e.stopPropagation();
                        pick({ cueId: c.id, index: i });
                      }}
                      style={{ background: ink, left: pct(ms) }}
                      tabIndex={-1}
                      title={`${c.label} at ${fmtTime(ms)}`}
                      type="button"
                    />
                  );
                })}
              </div>
            );
          })}
          <div aria-hidden="true" className="pointer-events-none absolute top-0 bottom-0 w-0.5 -translate-x-1/2 bg-orange" style={{ left: pct(t) }}>
            <span className="absolute -top-0.5 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-orange" />
          </div>
        </div>
      </div>
    </div>
  );
}
