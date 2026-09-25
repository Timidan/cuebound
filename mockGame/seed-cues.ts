// Loads the reference game's exact event times into a running CueBound server as the v1 sound map.
// Clip and times come from the same recorded play session (mockGame/record-clip.sh), not from video analysis.
// Dash is left out unless --include dash: it is the v2 mechanic.
// Usage: bun mockGame/seed-cues.ts [http://127.0.0.1:3000] --events <events.json> --clip <gameplay.mp4> [--include dash]
import { basename } from "node:path";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: { events: { type: "string" }, clip: { type: "string" }, include: { type: "string", multiple: true } },
  allowPositionals: true,
});
const base = positionals[0] ?? "http://127.0.0.1:3000";
const api = async (method: string, path: string, body?: BodyInit | object) => {
  const res = await fetch(base + path, { method, body: body instanceof FormData || body === undefined ? body : JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
};

const CUES = [
  { eventId: "jump", label: "Jump", description: "Small character jumps off the ground", recurring: true, maxDurationMs: 700 },
  { eventId: "land", label: "Land", description: "Small character lands on a platform", recurring: true, maxDurationMs: 500 },
  { eventId: "pickup", label: "Coin pickup", description: "Player collects a coin", recurring: true, maxDurationMs: 800 },
  { eventId: "hurt", label: "Hurt", description: "Player touches spikes and is knocked back", recurring: false, maxDurationMs: 900 },
  { eventId: "ui_click", label: "UI click", description: "On-screen button is pressed", recurring: false, maxDurationMs: 300 },
  { eventId: "dash", label: "Dash", description: "Player dashes forward in a short burst of speed", recurring: true, maxDurationMs: 500 },
];
const V2 = new Set(["dash"]);
const include = new Set(values.include ?? []);
for (const id of include) if (!V2.has(id)) throw new Error(`--include ${id}: only ${[...V2].join(", ")} can be added`);

if (!values.events || !values.clip) throw new Error("--events and --clip are required: record a session with mockGame/record-clip.sh first");
const times = new Map<string, number[]>();
const add = (event: string, ms: number) => times.set(event, [...(times.get(event) ?? []), ms]);
const log: { ms: number; event: string }[] = await Bun.file(values.events).json();
for (const e of log) add(e.event, e.ms);
if (!times.size) throw new Error(`${values.events} has no events`);

const state = await api("GET", "/api/state");
if (!state.project) await api("POST", "/api/project", { name: "Reference platformer", brief: "Cozy 2D platformer with a small, quick hero", runCeilingUsd: 2 });
const form = new FormData();
form.append("clip", Bun.file(values.clip), basename(values.clip));
await api("POST", "/api/clip", form);
const cues = CUES.filter((c) => !V2.has(c.eventId) || include.has(c.eventId)).map(({ maxDurationMs, ...c }) => ({
  ...c,
  origin: "event-log",
  sourceTimesMs: times.get(c.eventId) ?? [],
  processing: { gainDb: 0, trimStartMs: 0, maxDurationMs, fadeOutMs: 40 },
}));
await api("PUT", "/api/cues", cues);
for (const c of cues) console.log(`${c.eventId}: ${c.sourceTimesMs.length} times`);
