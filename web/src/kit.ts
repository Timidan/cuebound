import type { Cue, Job, State } from "./api";

export const MAX_EVENTS = 5;
export const ACTIVE: Job["status"][] = ["intent", "submitted", "running"];
export const LIST_PRICE_PER_S = 0.0105; // mirelo-sfx registry price; /api/livepeer overrides it when available

// Each ink shares its pastel's hue and sits near OKLCH L 0.49, so it reads at 5:1 or more on that pastel.
const PALETTE: Record<string, { bg: string; ink: string }> = {
  jump: { bg: "#dcebfb", ink: "#2162a2" },
  land: { bg: "#e8e4fb", ink: "#5a4bb8" },
  pickup: { bg: "#fbf0d2", ink: "#7b5a02" },
  hurt: { bg: "#fde3da", ink: "#a4361a" },
  ui_click: { bg: "#d9f3ef", ink: "#176f65" },
};
const SPARE = [
  { bg: "#f6e3ee", ink: "#9b326d" },
  { bg: "#e4f0d9", ink: "#426f1b" },
  { bg: "#f2e6d7", ink: "#845418" },
  { bg: "#e1e9f2", ink: "#3f5f80" },
];

export function eventColor(cues: Cue[], cue: Cue) {
  if (PALETTE[cue.eventId]) return PALETTE[cue.eventId];
  const custom = cues.filter((c) => !PALETTE[c.eventId]);
  return SPARE[Math.max(0, custom.indexOf(cue)) % SPARE.length];
}

// One letter per pad: the first letter of its event id (then its name) that no earlier pad uses.
export function padKeys(cues: Cue[]): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const c of cues) {
    const k = [...(c.eventId + c.label).toUpperCase()].find((ch) => /[A-Z]/.test(ch) && !used.has(ch));
    if (k) {
      used.add(k);
      out.set(c.id, k);
    }
  }
  return out;
}

export const needed = (cue: Cue) => (cue.recurring ? 2 : 1);
export const takesOf = (S: State, cue: Cue) => S.takes.filter((t) => t.cueId === cue.id);
export const kept = (S: State, cue: Cue) => takesOf(S, cue).filter((t) => t.status === "accepted");
export const fresh = (S: State, cue: Cue) => takesOf(S, cue).filter((t) => t.status === "candidate" && t.finalPath);
const jobsOf = (S: State, cue: Cue) => S.jobs.filter((j) => j.cueId === cue.id);
export const inFlight = (S: State, cue?: Cue) => S.jobs.filter((j) => ACTIVE.includes(j.status) && (!cue || j.cueId === cue.id));
const hasTake = (S: State, j: Job) => S.takes.some((t) => t.jobId === j.id);
// Livepeer finished but CueBound hasn't stored the audio yet (download and processing run after "done").
export const arriving = (S: State, cue: Cue) => jobsOf(S, cue).filter((j) => j.status === "done" && !j.error && !hasTake(S, j));
// No take and a known problem: failed, no answer, or finished but the download or processing failed.
export const stuck = (S: State, cue: Cue) =>
  jobsOf(S, cue).filter((j) => !hasTake(S, j) && (j.status === "failed" || j.status === "unknown" || (j.status === "done" && !!j.error)));
// Free retries: GET /api/jobs/:id asks Livepeer again and re-downloads a finished result.
export const retryable = (j: Job) => j.status === "unknown" || j.status === "done";
export const isComplete = (S: State, cue: Cue) => kept(S, cue).length >= needed(cue);

export type PadStatus = { text: string; tone: "done" | "todo" | "busy" | "idle" };

export function padStatus(S: State, cue: Cue): PadStatus {
  const busy = inFlight(S, cue).length + arriving(S, cue).length;
  const retry = stuck(S, cue).filter(retryable).length;
  const k = kept(S, cue).length;
  const n = fresh(S, cue).length;
  const need = needed(cue);
  if (busy) return { text: `Livepeer is rendering ${busy} ${plural(busy, "take")}`, tone: "busy" };
  if (n) return { text: `${n} new ${plural(n, "take")} to hear`, tone: "todo" };
  if (retry) return { text: `${retry} ${plural(retry, "take")} didn’t arrive · open to retry`, tone: "todo" };
  if (k >= need) return { text: `${k} ${plural(k, "take")} kept ✓`, tone: "done" };
  if (k) return { text: `Keep ${need - k} more ${plural(need - k, "take")}`, tone: "todo" };
  return { text: "No takes yet", tone: "idle" };
}

export const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);
export const times = (n: number) => `${n} ${plural(n, "time")}`;

// Mirrors the server: whole seconds of the cue's max length, 3–15 s, at the per-second price.
const renderSeconds = (cue: Cue) => Math.min(15, Math.max(3, Math.ceil(cue.processing.maxDurationMs / 1000)));
export const estimateUsd = (cues: Cue[], takesEach: number, pricePerS = LIST_PRICE_PER_S) =>
  cues.reduce((s, c) => s + renderSeconds(c) * pricePerS, 0) * takesEach;

export const usd = (n: number | null | undefined) => (n == null ? "unknown" : `$${n.toFixed(2)}`);
export const usdExact = (n: number | null | undefined) => (n == null ? "unknown" : `$${n.toFixed(4).replace(/0{1,2}$/, "")}`);

export function fmtTime(ms: number) {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, "0")}`;
}

export const shortHash = (h?: string | null) => (h ? h.slice(0, 10) : "none");
// A real minus sign, and a space that never breaks before the unit.
export const db = (n: number) => `${n < 0 ? "\u2212" : ""}${Math.abs(n)}\u00a0dB`;
