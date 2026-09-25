import { Crosshair, FileText, PencilSimple } from "@phosphor-icons/react";
import { SceneStrip } from "@/components/app/SceneStrip";
import { useMemo, useState } from "react";
import AnimatedToggle from "@/components/smoothui/animated-toggle";
import { DotMorphButton } from "@/components/smoothui/dot-morph-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ClipTimeline, type Mark } from "@/components/ClipTimeline";
import { api, mediaUrl, type Cue } from "@/api";
import { eventColor, fmtTime, MAX_EVENTS, times } from "@/kit";
import { Heading } from "@/screens/Start";
import { useKit } from "@/store";

const DEFAULT_PROCESSING = { gainDb: 0, trimStartMs: 0, maxDurationMs: 2000, fadeOutMs: 50 };
const LOG_LINE = /\[sfx\]\s+(\d+)\s*ms\s+([a-z][a-z0-9_]{0,31})\b/g;
const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^[^a-z]+|_+$/g, "").slice(0, 32);
const titled = (id: string) => id.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()).replace(/\bui\b/i, "UI");
const sortTimes = (ts: number[]) => [...new Set(ts.map((t) => Math.max(0, Math.round(t))))].sort((a, b) => a - b);

type Found = Map<string, { times: number[]; label?: string; description?: string; recurring?: boolean }>;
type Entry = { id?: unknown; event?: unknown; ms?: unknown; label?: unknown; description?: unknown; recurring?: unknown };

// Reads an agent-made event list ({"events":[{"id","label","description","recurring"}]}, see skills/cuebound-events),
// the reference game's --event-log file ([{"ms","event"}]) or printed "[sfx] <ms> ms <id>" lines.
function parseEvents(text: string): Found {
  const found: Found = new Map();
  const add = (raw: unknown, ms: unknown, e: Entry = {}) => {
    const id = typeof raw === "string" ? slug(raw) : "";
    if (!id) return;
    const f = found.get(id) ?? { times: [] };
    if (ms != null && Number.isFinite(Number(ms))) f.times.push(Number(ms));
    if (typeof e.label === "string" && e.label.trim()) f.label = e.label.trim().slice(0, 60);
    if (typeof e.description === "string" && e.description.trim()) f.description = e.description.trim().slice(0, 200);
    if (typeof e.recurring === "boolean") f.recurring = e.recurring;
    found.set(id, f);
  };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON: printed log lines
  }
  const list = Array.isArray(json) ? json : (json as { events?: unknown } | undefined)?.events;
  if (Array.isArray(list)) for (const e of list as Entry[]) add(e?.id ?? e?.event, e?.ms, e);
  else for (const m of text.matchAll(LOG_LINE)) add(m[2], m[1]);
  return found;
}

function EventEditor({ cue, onSave, onRemove }: { cue: Cue; onSave: (c: Cue) => Promise<void>; onRemove: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(cue);
  const [confirm, setConfirm] = useState(false);
  return (
    <Popover
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setDraft(cue);
          setConfirm(false);
        }
      }}
      open={open}
    >
      <PopoverTrigger aria-label={`Edit ${cue.label}`} className="rounded-lg p-2 text-muted-foreground transition-transform active:scale-[0.96] hover:bg-accent hover:text-ink pointer-coarse:p-3.5">
        <PencilSimple className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(340px,calc(100vw-2rem))] space-y-4 rounded-2xl border-line bg-white p-5">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await onSave({ ...draft, label: draft.label.trim() || cue.label });
            setOpen(false);
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">Name</span>
            <input className="rounded-lg border border-input bg-paper px-3 py-2" onChange={(e) => setDraft({ ...draft, label: e.target.value })} value={draft.label} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">What happens</span>
            <textarea
              className="min-h-[64px] rounded-lg border border-input bg-paper px-3 py-2"
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="Small character lands on a platform"
              value={draft.description}
            />
            <span className="text-[12px] text-muted-foreground">Livepeer reads this when it makes the sound.</span>
          </label>
          <div className="flex items-start justify-between gap-4">
            <span className="text-[13px]">
              <span className="font-semibold">Plays often</span>
              <span className="block text-muted-foreground">Keep 2 takes so it doesn’t sound repetitive.</span>
            </span>
            <AnimatedToggle checked={draft.recurring} label="Plays often" onChange={(v) => setDraft({ ...draft, recurring: v })} size="sm" />
          </div>
          <p className="text-[12px] text-muted-foreground">
            In Godot: <code className="rounded bg-muted px-1 py-0.5 text-ink">Sfx.play("{cue.eventId}")</code>
          </p>
          <div className="flex items-center justify-between pt-1">
            <button
              className="text-[13px] font-semibold text-destructive underline-offset-2 transition-transform active:scale-[0.96] hover:underline pointer-coarse:min-h-11"
              onClick={async () => {
                if (!confirm) return setConfirm(true);
                await onRemove();
                setOpen(false);
              }}
              type="button"
            >
              {confirm ? "Click again to remove" : "Remove event"}
            </button>
            <button className="rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-ivory transition-transform active:scale-[0.96] pointer-coarse:min-h-11 pointer-coarse:px-5" type="submit">
              Save
            </button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function LoadEvents({ cues, clip, onUse }: { cues: Cue[]; clip: boolean; onUse: (found: Found) => Promise<void> }) {
  const [text, setText] = useState("");
  const found = useMemo(() => parseEvents(text), [text]);
  const ids = [...found.keys()];
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const chosen = ids.filter((id) => !skip.has(id));
  const known = new Set(cues.map((c) => c.eventId));
  const total = new Set([...known, ...chosen]).size;
  return (
    <div className="space-y-3 pt-3">
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Ask your coding agent for the game’s event list: the <code className="rounded bg-muted px-1 text-ink">cuebound-events</code> skill in the CueBound repo tells it how to write{" "}
        <code className="rounded bg-muted px-1 text-ink">cuebound-events.json</code> from your code, including actions your clip doesn’t show. Paste it here.
        {clip && (
          <>
            {" "}
            For exact times, paste your game’s printed log instead, for example <code className="rounded bg-muted px-1 text-ink">print("[sfx] %d ms jump" % Time.get_ticks_msec())</code>, with the clip
            recording started when the game starts.
          </>
        )}
      </p>
      <textarea
        aria-label="Event list or log"
        className="h-24 w-full rounded-lg border border-input bg-paper px-3 py-2 font-mono text-[12px]"
        onChange={(e) => setText(e.target.value)}
        placeholder={clip ? '{"events": [{"id": "jump", "description": "…"}]}\nor [sfx] 2167 ms jump' : '{"events": [{"id": "jump", "description": "Small hero hops off the ground"}]}'}
        value={text}
      />
      <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-orange-deep underline underline-offset-2 pointer-coarse:min-h-11">
        Or open a file
        <input accept=".json,.log,.txt,application/json,text/plain" className="sr-only" onChange={async (e) => setText((await e.target.files?.[0]?.text()) ?? "")} type="file" />
      </label>
      {ids.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-[13px] font-semibold">
            Found {ids.length} {ids.length === 1 ? "event" : "events"}. Choose up to {MAX_EVENTS}.
          </legend>
          {ids.map((id) => (
            <label className="flex items-center gap-2 text-[13px] pointer-coarse:min-h-11" key={id}>
              <input
                checked={!skip.has(id)}
                onChange={(e) => {
                  const next = new Set(skip);
                  if (e.target.checked) next.delete(id);
                  else next.add(id);
                  setSkip(next);
                }}
                type="checkbox"
              />
              <code>{id}</code>
              <span className="min-w-0 truncate text-muted-foreground" title={found.get(id)!.description}>{found.get(id)!.times.length ? times(found.get(id)!.times.length) : found.get(id)!.description}</span>
            </label>
          ))}
          {total > MAX_EVENTS && <p className="text-[13px] text-destructive">That makes {total} events. Untick some: one pass handles up to {MAX_EVENTS}.</p>}
          <button
            className="rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-ivory transition-transform enabled:active:scale-[0.96] disabled:opacity-40 pointer-coarse:min-h-11"
            disabled={!chosen.length || total > MAX_EVENTS}
            onClick={() => onUse(new Map(chosen.map((id) => [id, found.get(id)!])))}
            type="button"
          >
            Use these events
          </button>
        </fieldset>
      )}
    </div>
  );
}

// With a clip it marks the playhead; without one it adds an event by name, with no times.
function MarkByHand({ cues, video, clip, onAdd }: { cues: Cue[]; video: HTMLVideoElement | null; clip: boolean; onAdd: (cueId: string | null, name: string, ms: number | null) => Promise<void> }) {
  const [picked, setTarget] = useState(cues[0]?.id ?? "new");
  const [name, setName] = useState("");
  const [, force] = useState(0);
  const ms = clip ? (video?.currentTime ?? 0) * 1000 : null;
  const target = clip ? picked : "new";
  const isNew = target === "new";
  const full = isNew && cues.length >= MAX_EVENTS;
  return (
    <div className="space-y-3 pt-3" onPointerEnter={() => force((n) => n + 1)}>
      <p className="text-[13px] text-muted-foreground">
        {clip ? "Pause the clip where the sound should play, then add a mark there." : "Name an action, then use the pencil to say what happens."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {clip && (
          <select aria-label="Event" className="rounded-lg border border-input bg-paper px-2.5 py-2 text-[13px] pointer-coarse:min-h-11" onChange={(e) => setTarget(e.target.value)} value={target}>
            {cues.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
            <option value="new">New event…</option>
          </select>
        )}
        {isNew && <input aria-label="New event name" className="w-36 rounded-lg border border-input bg-paper px-2.5 py-2 text-[13px] pointer-coarse:min-h-11" onChange={(e) => setName(e.target.value)} placeholder="Wall slide" value={name} />}
        <button
          className="tabular rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-ivory transition-transform enabled:active:scale-[0.96] disabled:opacity-40 pointer-coarse:min-h-11"
          disabled={(clip && !video) || full || (isNew && !slug(name))}
          onClick={() => onAdd(isNew ? null : target, name, ms)}
          type="button"
        >
          {ms == null ? "Add event" : `Add a mark at ${fmtTime(ms)}`}
        </button>
      </div>
      {full && <p className="text-[13px] text-destructive">One pass handles up to {MAX_EVENTS} events. Remove one to add another.</p>}
    </div>
  );
}

export function Events() {
  const { S, run, go, toast } = useKit();
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [sel, setSel] = useState<Mark | null>(null);
  const clip = S.project?.clipPath;
  const [open, setOpen] = useState<"log" | "hand" | null>(clip ? "hand" : "log");
  const cues = S.cues;
  const save = (next: Cue[], what = "Saving your events") => run(what, () => api.cues(next)).then(() => undefined);
  const selCue = sel && cues.find((c) => c.id === sel.cueId);
  const selMs = selCue?.sourceTimesMs[sel!.index];

  if (!S.project) {
    return (
      <div className="mx-auto max-w-lg pt-16 text-center">
        <h1 className="text-[28px] font-bold">Start a project first</h1>
        <p className="mt-2 text-muted-foreground">Set your spend limit and, if you have one, add a gameplay clip.</p>
        <DotMorphButton className="mt-6" label="Start a project" onClick={() => go("start")} />
      </div>
    );
  }

  const useEvents = async (found: Found) => {
    const next = cues.map((c) => {
      const f = found.get(c.eventId);
      if (!f) return c;
      const timed = f.times.length ? { sourceTimesMs: sortTimes(f.times), origin: "event-log" as const } : {};
      return { ...c, ...timed, description: f.description ?? c.description, recurring: f.recurring ?? c.recurring };
    });
    for (const [id, f] of found) {
      if (!cues.some((c) => c.eventId === id))
        next.push({
          id: "",
          eventId: id,
          label: f.label ?? titled(id),
          description: f.description ?? "",
          sourceTimesMs: sortTimes(f.times),
          recurring: f.recurring ?? f.times.length > 3,
          origin: f.times.length ? "event-log" : "manual",
          processing: DEFAULT_PROCESSING,
        });
    }
    await save(next, "Loading your events");
    const n = [...found.values()].reduce((s, f) => s + f.times.length, 0);
    toast(n ? `Loaded ${n} exact times for ${found.size} events.` : `Added ${found.size} events from your list.`, "success");
    setOpen(null);
  };

  const addMark = async (cueId: string | null, name: string, ms: number | null) => {
    if (cueId && ms != null) return save(cues.map((c) => (c.id === cueId ? { ...c, sourceTimesMs: sortTimes([...c.sourceTimesMs, ms]) } : c)));
    const id = slug(name);
    if (cues.some((c) => c.eventId === id)) return toast(`There’s already an event called ${id}. Choose another name.`, "error");
    await save([...cues, { id: "", eventId: id, label: name.trim(), description: "", sourceTimesMs: ms == null ? [] : [Math.round(ms)], recurring: false, origin: "manual", processing: DEFAULT_PROCESSING }]);
  };

  const editMark = (delta: number | null) => {
    if (!selCue || sel == null) return;
    const times = [...selCue.sourceTimesMs];
    if (delta == null) times.splice(sel.index, 1);
    else times[sel.index] = times[sel.index] + delta;
    const next = sortTimes(times);
    setSel(delta == null || !next.length ? null : { cueId: selCue.id, index: next.indexOf(Math.max(0, Math.round(times[sel.index]))) });
    if (delta != null && video) video.currentTime = Math.max(0, times[sel.index]) / 1000;
    void save(cues.map((c) => (c.id === selCue.id ? { ...c, sourceTimesMs: next } : c)));
  };

  return (
    <>
    <div className="relative z-10 pb-36 sm:pb-56">
      <SceneStrip />
      <Heading
        icon="events"
        lead={clip ? "Each mark is a moment in your clip that needs a sound. Check the marks, then pick a style." : "Each event is an action in your game that needs a sound. Check the list, then pick a style."}
        title={clip ? "When does each sound play?" : "Which actions need a sound?"}
      >
        <DotMorphButton disabled={!cues.length} label="Next: pick a style" onClick={() => go("style")} />
      </Heading>

      <div className={clip ? "grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]" : "mx-auto max-w-[560px]"}>
        {clip && (
        <section aria-label="Your clip" className="space-y-3">
          <video className="media-edge aspect-video max-h-[380px] w-full rounded-2xl bg-[#0d1426] object-contain" controls preload="auto" ref={setVideo} src={mediaUrl(clip)} />
          {cues.length > 0 && <ClipTimeline cues={cues} onSelect={setSel} selected={sel} video={video} />}
          {selCue && selMs != null ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-4 py-2.5 text-[13px]">
              <span className="size-2.5 rounded-[3px]" style={{ background: eventColor(cues, selCue).ink }} />
              <span>
                <b>{selCue.label}</b>, moment {sel!.index + 1} of {selCue.sourceTimesMs.length}, at <span className="font-mono tabular">{fmtTime(selMs)}</span>
              </span>
              <span className="ml-auto flex flex-wrap gap-1.5">
                <button className="rounded-lg border border-input bg-paper px-2.5 py-1 font-medium transition-transform active:scale-[0.96] pointer-coarse:min-h-11" onClick={() => editMark(-50)} type="button">
                  50 ms earlier
                </button>
                <button className="rounded-lg border border-input bg-paper px-2.5 py-1 font-medium transition-transform active:scale-[0.96] pointer-coarse:min-h-11" onClick={() => editMark(50)} type="button">
                  50 ms later
                </button>
                <button className="rounded-lg px-2.5 py-1 font-medium text-destructive transition-transform active:scale-[0.96] hover:bg-[#fde3da] pointer-coarse:min-h-11" onClick={() => editMark(null)} type="button">
                  Remove this mark
                </button>
              </span>
            </div>
          ) : (
            cues.length > 0 && <p className="text-[13px] text-muted-foreground">Click a mark to jump to that moment and adjust it. Click anywhere on a row to move the playhead there.</p>
          )}
        </section>
        )}

        <aside aria-label="Events" className="space-y-6">
          <div>
            <h2 className="mb-3 text-[18px] font-bold">
              Events <span className="tabular font-sans text-[14px] font-medium text-muted-foreground">{cues.length} of {MAX_EVENTS}</span>
            </h2>
            {cues.length ? (
              <>
              <ul className="space-y-1.5">
                {cues.map((c) => {
                  const col = eventColor(cues, c);
                  return (
                    <li className="flex items-center gap-3 rounded-xl border border-line bg-white py-2 pr-1.5 pl-2.5" key={c.id}>
                      <span className="flex h-7 min-w-9 items-center justify-center rounded-lg px-1.5 font-mono text-[12px] font-medium tabular" style={{ background: col.bg, color: col.ink }}>
                        {clip && `${c.sourceTimesMs.length}×`}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold" title={c.label}>
                          {c.label}
                          {c.recurring && <span className="ml-2 text-[12px] font-normal text-muted-foreground">plays often</span>}
                        </p>
                        <p className="truncate text-[13px] text-muted-foreground" title={c.description}>
                          {c.description || "Say what happens, so Livepeer knows what to make."}
                        </p>
                      </div>
                      <EventEditor cue={c} onRemove={() => save(cues.filter((x) => x.id !== c.id), "Removing the event")} onSave={(d) => save(cues.map((x) => (x.id === c.id ? d : x)))} />
                    </li>
                  );
                })}
              </ul>
              {clip && (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  {cues.every((c) => c.origin === "event-log")
                    ? "All times are exact, from your game’s event log."
                    : `${cues.filter((c) => c.origin !== "event-log").length} marked by hand or from your event list, the rest from your game’s event log.`}
                </p>
              )}
              </>
            ) : (
              <p className="rounded-xl border border-dashed border-input p-4 text-[13px] text-muted-foreground">
                {clip ? "No events yet. Mark them by hand, or load your game’s event list or log." : "No events yet. Load your game’s event list below."}
              </p>
            )}
          </div>

          <div>
            <h2 className="mb-2 text-[18px] font-bold">Add events</h2>
            <div className="divide-y divide-line rounded-xl border border-line bg-white">
              {(
                [
                  ["hand", Crosshair, clip ? "Mark by hand at the playhead" : "Add an event by name", <MarkByHand clip={!!clip} cues={cues} key="h" onAdd={addMark} video={video} />],
                  ["log", FileText, clip ? "Or load your game’s event list or log" : "Load your game’s event list", <LoadEvents clip={!!clip} cues={cues} key="l" onUse={useEvents} />],
                ] as const
              ).map(([key, Icon, label, body]) => (
                <div className="px-4 py-3" key={key}>
                  <button aria-expanded={open === key} className="flex w-full items-center gap-3 text-left font-semibold pointer-coarse:min-h-11" onClick={() => setOpen(open === key ? null : key)} type="button">
                    <Icon aria-hidden="true" className="size-4 text-orange" weight="bold" />
                    {label}
                  </button>
                  {open === key && body}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-muted-foreground">Finding events automatically with Livepeer video analysis is planned, not available yet.</p>
          </div>
        </aside>
      </div>
    </div>
    </>
  );
}
