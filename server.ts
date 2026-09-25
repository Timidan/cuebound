import { Database } from "bun:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import type { Cue, Direction, Job, JobStatus, Processing, Project, Receipt, SoundDesignBrief, State, Take } from "./lib/types";
import * as lp from "./lib/livepeer";
import { processTake } from "./lib/audio";
import { exportPack } from "./lib/pack";
import { BriefError, canonicalize, deriveBrief, digest, parseBrief, promptParts } from "./lib/brief";
import * as dkg from "./lib/dkg";

const DATA_DIR = resolve(process.env.DATA_DIR ?? "./data");
const PUBLIC_DIR = resolve(import.meta.dir, "web/dist");
const MAX_CLIP_BYTES = 50 * 1024 * 1024;
const POLL_MS = 3000;
const JOB_WAIT_MS = 180_000;
const DEFAULT_PROCESSING: Processing = { gainDb: 0, trimStartMs: 0, maxDurationMs: 2000, fadeOutMs: 50 };
const GENERATOR = { capability: lp.SFX_CAPABILITY, modelId: "Mirelo-AI/sfx1.6/text-to-audio", termsRef: "https://mirelo.ai/terms (unverified for demo credits)" };
const BASELINE = "baseline"; // Take.jobId for audio imported from an approved pack; never re-rendered
// Hosted: every visitor gets their own project in DATA_DIR/sessions/<hash of their cookie>, under spend caps.
const HOSTED = process.env.HOSTED === "1";
const SESSION_CAP_USD = Number(process.env.SESSION_CAP_USD ?? 1);
const DAILY_CAP_USD = Number(process.env.DAILY_CAP_USD ?? 20);

type Space = { dir: string; db: Database };
function openSpace(dir: string, file = join(dir, "db.sqlite")): Space {
  if (file !== ":memory:") mkdirSync(dir, { recursive: true });
  const d = new Database(file);
  d.exec("PRAGMA journal_mode = WAL");
  for (const t of ["project", "cues", "directions", "jobs", "takes"]) {
    d.exec(`CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
  }
  d.exec("CREATE TABLE IF NOT EXISTS briefs (revision INTEGER PRIMARY KEY, digest TEXT NOT NULL, brief TEXT NOT NULL)");
  d.exec("CREATE TABLE IF NOT EXISTS receipts (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL)");
  // Crash recovery: a job still in flight when its data is opened has no known outcome.
  for (const r of d.query("SELECT data FROM jobs").all() as any[]) {
    const j: Job = JSON.parse(r.data);
    if (j.status !== "intent" && j.status !== "submitted" && j.status !== "running") continue;
    const error = j.providerJobId
      ? "Server stopped before the outcome was known; reconcile with GET /api/jobs/:id."
      : "Server stopped before a provider job id was recorded. Not retried; GET /api/jobs/:id replays by idempotency key within 24 h.";
    d.query("UPDATE jobs SET data = ? WHERE id = ?").run(JSON.stringify({ ...j, status: "unknown", error }), j.id);
  }
  return { dir, db: d };
}

const spaces = new AsyncLocalStorage<Space>();
const local = HOSTED ? null : openSpace(DATA_DIR);
const blank = openSpace(join(DATA_DIR, "sessions", "none"), ":memory:"); // what a visitor without a session reads
const opened = new Map<string, Space>(); // ponytail: every session stays open; evict idle ones if sessions pile up
const sessionSpace = (sid: string, create: boolean) => {
  const key = new Bun.CryptoHasher("sha256").update(sid).digest("hex").slice(0, 32); // folder names never reveal the cookie
  let s = opened.get(key);
  const dir = join(DATA_DIR, "sessions", key);
  if (!s && !create && !existsSync(dir)) return blank;
  if (!s) opened.set(key, (s = openSpace(dir)));
  return s;
};
const space = () => spaces.getStore() ?? local ?? blank;
const db = () => space().db;
const capped = (usd: number) => (HOSTED ? Math.min(usd, SESSION_CAP_USD) : usd);

const all = <T>(t: string): T[] => db().query(`SELECT data FROM ${t} ORDER BY rowid`).all().map((r: any) => JSON.parse(r.data));
const get = <T>(t: string, id: string): T | undefined => {
  const r = db().query(`SELECT data FROM ${t} WHERE id = ?`).get(id) as any;
  return r ? JSON.parse(r.data) : undefined;
};
const put = (t: string, o: { id: string }) =>
  db().query(`INSERT INTO ${t} (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`).run(o.id, JSON.stringify(o));
const abs = (rel: string) => join(space().dir, rel);
const round = (n: number) => Math.round(n * 1e6) / 1e6;
const project = () => all<Project>("project")[0] ?? null;

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
const need = <T>(v: T | undefined | null, what: string): T => v ?? fail(404, `${what} not found`);
const body = (req: Request): Promise<any> => req.json().catch(() => fail(400, "invalid JSON body"));
const requireProject = () => project() ?? fail(400, "Create a project first.");

function state(): State {
  const jobs = all<Job>("jobs");
  return {
    project: project(),
    cues: all("cues"),
    takes: all("takes"),
    jobs,
    directions: all("directions"),
    briefs: db().query("SELECT revision, digest, brief FROM briefs ORDER BY revision").all()
      .map((r: any) => ({ revision: r.revision, digest: r.digest, brief: JSON.parse(r.brief) })),
    receipts: all("receipts"),
    spentUsd: spent(jobs),
    ...(HOSTED ? { hosted: { spendCapUsd: SESSION_CAP_USD } } : {}),
  };
}

// Estimated spend: every job keeps its registry estimate unless the provider reports actual cost or "not billed".
const spent = (jobs = all<Job>("jobs")) => round(jobs.reduce((s, j) => s + (j.costUsd ?? 0), 0));

function processing(p: any = {}): Processing {
  const o = { ...DEFAULT_PROCESSING, ...p };
  for (const k of Object.keys(DEFAULT_PROCESSING)) {
    if (typeof o[k] !== "number" || !Number.isFinite(o[k])) fail(400, `processing.${k} must be a number`);
  }
  if (o.maxDurationMs < 1 || o.maxDurationMs > 60_000 || o.trimStartMs < 0 || o.fadeOutMs < 0) fail(400, "processing values out of range");
  return { gainDb: o.gainDb, trimStartMs: o.trimStartMs, maxDurationMs: o.maxDurationMs, fadeOutMs: o.fadeOutMs };
}

function toCue(c: any): Cue {
  if (typeof c?.eventId !== "string" || !/^[a-z][a-z0-9_]{0,31}$/.test(c.eventId)) {
    fail(400, "eventId must be lowercase letters, digits or _ and start with a letter");
  }
  return {
    id: typeof c.id === "string" && c.id ? c.id : crypto.randomUUID(),
    eventId: c.eventId,
    label: String(c.label ?? c.eventId),
    description: String(c.description ?? ""),
    sourceTimesMs: Array.isArray(c.sourceTimesMs) ? c.sourceTimesMs.map(Number).filter(Number.isFinite) : [],
    recurring: !!c.recurring,
    origin: c.origin === "event-log" ? "event-log" : "manual",
    processing: processing(c.processing),
  };
}

function composePrompt(cue: Cue, direction?: Direction, feedback?: string): string {
  return [
    cue.description || cue.label,
    direction && `Texture: ${direction.texture}`,
    direction && `Envelope: ${direction.envelope}`,
    direction && `Hierarchy: ${direction.hierarchy}`,
    feedback && `Change from the previous take: ${feedback}`,
  ]
    .filter((s): s is string => !!s && !!s.trim())
    .map((s) => s.trim().replace(/[.\s]+$/, ""))
    .join(". ");
}

const selectedDirection = () => {
  const id = project()?.directionId;
  return id ? get<Direction>("directions", id) : undefined;
};
const durationFor = (c: Cue) => lp.sfxDuration(c.processing.maxDurationMs);
const estimate = (durationS: number) => round(durationS * lp.SFX_USD_PER_SECOND);

// ponytail: kept in memory, so a restart resets the day's total; persist it if restarts become frequent.
let today = { date: "", usd: 0 };
function assertDailyCap(costUsd: number) {
  if (!HOSTED) return;
  const date = new Date().toISOString().slice(0, 10);
  if (today.date !== date) today = { date, usd: 0 };
  if (today.usd + costUsd > DAILY_CAP_USD + 1e-9) fail(429, "This hosted demo has used today’s Livepeer budget. Nothing was sent. Try again tomorrow, or run CueBound on your own computer.");
  today.usd += costUsd;
}

function assertCeiling(costUsd: number) {
  const p = requireProject();
  const now = spent();
  if (now + costUsd > p.runCeilingUsd + 1e-9) {
    fail(409, `Not sent: about $${costUsd.toFixed(2)} would take your spend to $${(now + costUsd).toFixed(2)}, ` +
      `over your $${p.runCeilingUsd.toFixed(2)} spend limit. Nothing was sent or charged.`);
  }
}

// Intent rows are written synchronously before any remote call starts.
function createJobs(specs: { cue: Cue; prompt: string }[], directionId = project()!.directionId): Job[] {
  const cost = specs.reduce((s, x) => s + estimate(durationFor(x.cue)), 0);
  assertCeiling(cost);
  assertDailyCap(cost);
  const jobs: Job[] = specs.map(({ cue, prompt }) => ({
    id: crypto.randomUUID(),
    cueId: cue.id,
    ...(directionId ? { directionId } : {}),
    capability: lp.SFX_CAPABILITY,
    prompt,
    durationS: durationFor(cue),
    status: "intent",
    costUsd: estimate(durationFor(cue)),
    createdAt: new Date().toISOString(),
  }));
  db().transaction(() => jobs.forEach((j) => put("jobs", j)))();
  // ponytail: no concurrency cap; add one if the provider rate-limits batches.
  for (const j of jobs) void exclusive(j.id, () => runJob(j.id));
  return jobs;
}

const busy = new Set<string>();
async function exclusive(id: string, fn: () => Promise<void>) {
  if (busy.has(id)) return;
  busy.add(id);
  try {
    await fn();
  } catch (e) {
    console.error(`job ${id}:`, e);
  } finally {
    busy.delete(id);
  }
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const updateJob = (id: string, patch: Partial<Job>) => put("jobs", { ...get<Job>("jobs", id)!, ...patch });
const PROVIDER_STATUS: Record<string, JobStatus> = {
  submitted: "submitted", pending: "submitted", queued: "submitted", running: "running", done: "done", failed: "failed", cancelled: "failed",
};

function applyProvider(id: string, pj: lp.ProviderJob) {
  const job = get<Job>("jobs", id)!;
  const status = PROVIDER_STATUS[pj.status] ?? "unknown";
  updateJob(id, {
    status,
    providerJobId: pj.providerJobId ?? job.providerJobId,
    resultUrl: pj.url ?? job.resultUrl,
    costUsd: pj.costUsd ?? (status === "failed" && pj.notBilled ? 0 : job.costUsd),
    error: status === "failed" ? pj.error ?? "provider reported failure" : job.error,
  });
}

// Same idempotency key (Job.id) on every submit, so a resend within 24h replays the provider job instead of re-rendering.
function submit(job: Job) {
  const p = requireProject();
  const inflight = all<Job>("jobs").filter((j) => ["intent", "submitted", "running"].includes(j.status)).length || 1;
  const maxCostUsd = round((job.costUsd ?? 0) + Math.max(0, p.runCeilingUsd - spent()) / inflight);
  if (maxCostUsd <= 0) throw new lp.ProviderError("run ceiling is now below this job's reservation", true);
  return lp.runSfx({ prompt: job.prompt, durationS: job.durationS, idempotencyKey: job.id, maxCostUsd, sessionId: p.id });
}

async function runJob(id: string) {
  const job = get<Job>("jobs", id)!;
  let pj: lp.ProviderJob;
  try {
    pj = await submit(job);
  } catch (e) {
    if (e instanceof lp.ProviderError) return updateJob(id, { status: "failed", error: e.message, ...(e.notBilled ? { costUsd: 0 } : {}) });
    return updateJob(id, { status: "unknown", error: `Livepeer didn’t answer (${msg(e)}). Nothing was retried. Use Try again within 24 hours; it is free.` });
  }
  applyProvider(id, pj);
  const started = Date.now();
  for (;;) {
    const j = get<Job>("jobs", id)!;
    if (j.status === "done") return ingest(id);
    if (j.status === "failed") return;
    if (!j.providerJobId) return updateJob(id, { status: "unknown", error: "Livepeer returned no job id and no audio. Nothing was retried." });
    if (Date.now() - started > JOB_WAIT_MS) return updateJob(id, { status: "unknown", error: "Stopped waiting. Use Try again to ask Livepeer for the result." });
    await Bun.sleep(POLL_MS);
    try {
      applyProvider(id, await lp.getJob(j.providerJobId));
    } catch (e) {
      console.warn(`poll ${id}: ${msg(e)}`);
    }
  }
}

// Download the provider result once, then render the take with the cue's current processing.
async function ingest(id: string) {
  const job = get<Job>("jobs", id)!;
  if (!job.resultUrl || all<Take>("takes").some((t) => t.jobId === id)) return;
  const cue = get<Cue>("cues", job.cueId);
  if (!cue) return updateJob(id, { error: "The event was removed, so this take wasn’t saved." });
  const takeId = crypto.randomUUID();
  const ext = extname(new URL(job.resultUrl).pathname).toLowerCase();
  const rawPath = `takes/${takeId}.raw${[".wav", ".mp3", ".ogg", ".flac"].includes(ext) ? ext : ""}`;
  const finalPath = `takes/${takeId}.wav`;
  try {
    mkdirSync(abs("takes"), { recursive: true });
    await lp.downloadResult(job.resultUrl, abs(rawPath));
    const r = await processTake(abs(rawPath), cue.processing, abs(finalPath));
    put("takes", { id: takeId, cueId: cue.id, jobId: id, rawPath, finalPath, sha256: r.sha256, rawPeakDbfs: round(r.rawPeakDbfs), status: "candidate" } satisfies Take);
    updateJob(id, { error: undefined });
  } catch (e) {
    updateJob(id, { error: `Couldn’t save the take: ${msg(e)}` });
  }
}

async function reconcile(id: string) {
  const job = get<Job>("jobs", id)!;
  if (job.status === "unknown" && !job.providerJobId && Date.now() - Date.parse(job.createdAt) < 23 * 3600_000) {
    applyProvider(id, await submit(job));
  } else if (["submitted", "running", "unknown"].includes(job.status) && job.providerJobId) {
    applyProvider(id, await lp.getJob(job.providerJobId));
  }
  if (get<Job>("jobs", id)!.status === "done") await ingest(id);
}

async function rerender(cue: Cue) {
  for (const t of all<Take>("takes").filter((t) => t.cueId === cue.id && t.jobId !== BASELINE)) {
    const r = await processTake(abs(t.rawPath), cue.processing, abs(`takes/${t.id}.wav`));
    put("takes", { ...get<Take>("takes", t.id)!, finalPath: `takes/${t.id}.wav`, sha256: r.sha256, rawPeakDbfs: round(r.rawPeakDbfs) });
  }
}

type BriefRow = { revision: number; digest: string; brief: SoundDesignBrief };
const briefRow = (revision: number): BriefRow | undefined => {
  const r = db().query("SELECT revision, digest, brief FROM briefs WHERE revision = ?").get(revision) as any;
  return r ? { revision: r.revision, digest: r.digest, brief: JSON.parse(r.brief) } : undefined;
};
const latestBrief = (): BriefRow | undefined => {
  const r = db().query("SELECT revision FROM briefs ORDER BY revision DESC LIMIT 1").get() as any;
  return r ? briefRow(r.revision) : undefined;
};
const pinBrief = (b: SoundDesignBrief, d: string) => {
  try {
    db().query("INSERT INTO briefs (revision, digest, brief) VALUES (?, ?, ?)").run(b.revision, d, canonicalize(b));
  } catch {
    fail(409, `Revision ${b.revision} already exists here. Approved revisions are never overwritten; review a new revision instead.`);
  }
};
const addReceipt = (r: Receipt) => db().query("INSERT INTO receipts (data) VALUES (?)").run(JSON.stringify(r));
const receiptResponse = (r: Receipt) => {
  addReceipt(r);
  return Response.json(r, { status: /^(failed|pending)/.test(r.status) ? 502 : 200 });
};
const sha256 = (bytes: Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
const baselinePath = (file: string) => `${BASELINE}/${file.slice("audio/".length)}`; // file is validated as audio/<eventId>_<n>.wav

// On a continuation, every asset of the retrieved revision must be imported with matching bytes before a new cue builds on it.
function assertBaselineImported() {
  const r = all<Receipt>("receipts").findLast((r) => r.status.startsWith("retrieved"));
  if (!r) return;
  const have = new Set(all<Take>("takes").filter((t) => t.jobId === BASELINE).map((t) => `${t.finalPath} ${t.sha256}`));
  const assets = need(briefRow(r.revision), `revision ${r.revision}`).brief.cues.flatMap((c) => c.assets);
  if (!assets.every((a) => have.has(`${baselinePath(a.file)} ${a.sha256}`))) fail(409, "Import and check the approved pack first");
}

function derive(approval: Pick<SoundDesignBrief["approval"], "by" | "scope">) {
  const direction = selectedDirection() ?? fail(400, "Pick a style first.");
  const prev = latestBrief();
  return deriveBrief({
    project: requireProject(),
    direction,
    cues: all("cues"),
    takes: all("takes"),
    previous: prev ? { revision: prev.revision, digest: prev.digest } : null,
    approval,
    assetBaseUrl: process.env.ASSET_BASE_URL ?? null,
    generator: GENERATOR,
  });
}

async function probeClip(path: string) {
  const p = Bun.spawn(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", path], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const text = await new Response(p.stdout).text();
  await p.exited;
  const out = JSON.parse(text || "{}");
  return { durationS: Number(out.format?.duration), hasVideo: (out.streams ?? []).some((s: any) => s.codec_type === "video") };
}

// Memoizes fn for ms; a rejected result is not kept.
function cached<T>(ms: number, fn: () => Promise<T>) {
  let at = 0;
  let v: Promise<T>;
  return () => {
    if (Date.now() - at > ms) {
      at = Date.now();
      v = fn();
      v.catch(() => (at = 0));
    }
    return v;
  };
}

type Check = { ok: boolean; detail: string };
const ZIPPERS: Record<string, string[]> = { bsdtar: ["-a", "-cf"], "7z": ["a", "-tzip", "-bd"], zip: ["-qr"] }; // then: <archive> <dir>
const onPath = (names: string[], missing: string): Check => {
  const n = names.find((n) => Bun.which(n));
  return n ? { ok: true, detail: `${n} at ${Bun.which(n)}` } : { ok: false, detail: missing };
};
const settle = (p: Promise<string>): Promise<Check> => p.then((detail) => ({ ok: true, detail }), (e) => ({ ok: false, detail: msg(e) }));

// No paid calls: DKG status and the Livepeer MCP handshake only.
const health = cached(30_000, async () => {
  const [dkgCheck, livepeer] = await Promise.all([
    settle(dkg.preflight().then((s) => `${s.networkConfig} ${s.chain.chainId}, node ${s.version}`)),
    settle(lp.initialize().then((r) => String(r.serverInfo?.name ?? "no serverInfo"))),
  ]);
  return {
    ffmpeg: onPath(["ffmpeg"], "ffmpeg not found on PATH; takes cannot be rendered"),
    ffprobe: onPath(["ffprobe"], "ffprobe not found on PATH; clips cannot be checked"),
    godot: onPath(["godot", "godot4"], "optional; godot not found on PATH (only the example game needs it)"),
    zip: onPath(Object.keys(ZIPPERS), "bsdtar, 7z or zip not found on PATH; exports skip cuebound_pack.zip"),
    dkg: dkgCheck,
    livepeer,
  };
});
const sfxCard = cached(600_000, () => lp.describeCapability());

// cuebound_pack.zip beside the pack directory; the export stands without it.
async function zipPack(outDir: string): Promise<{ zipPath: string | null; zipReason?: string }> {
  const tool = Object.keys(ZIPPERS).find((n) => Bun.which(n));
  if (!tool) return { zipPath: null, zipReason: "no bsdtar, 7z or zip on PATH" };
  const p = Bun.spawn([tool, ...ZIPPERS[tool], "cuebound_pack.zip", "cuebound_pack"], { cwd: outDir, stdout: "ignore", stderr: "pipe" });
  const [err, code] = await Promise.all([new Response(p.stderr).text(), p.exited]);
  if (code !== 0) return { zipPath: null, zipReason: `${tool} exited ${code}: ${err.trim().slice(0, 300)}` };
  return { zipPath: relative(space().dir, join(outDir, "cuebound_pack.zip")) };
}

async function serveFile(base: string, rel: string, req: Request): Promise<Response> {
  let path: string;
  try {
    path = resolve(base, "./" + decodeURIComponent(rel));
  } catch {
    return new Response("Bad path", { status: 400 });
  }
  if (!path.startsWith(base + sep) || path.includes("\0") || relative(base, path).startsWith("db.sqlite")) {
    return new Response("Not found", { status: 404 });
  }
  try {
    if (!statSync(path).isFile()) throw 0;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const file = Bun.file(path);
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (!range || (!range[1] && !range[2])) return new Response(file, { headers: { "accept-ranges": "bytes" } });
  const size = file.size;
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (start > end || start >= size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  return new Response(file.slice(start, end + 1), {
    status: 206,
    headers: { "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${size}`, "content-type": file.type },
  });
}

function extendPlan(b: any) {
  const existing = all<Cue>("cues").find((c) => c.eventId === b.eventId);
  const description = String(b.description ?? existing?.description ?? "").trim();
  if (!description) fail(400, "description is required");
  const pinned = latestBrief();
  const pp = pinned ? promptParts(pinned.brief, { eventId: String(b.eventId), description }) : null;
  const copied = pp && b.processingFrom ? pp.processing[String(b.processingFrom)] ?? fail(400, `The brief has no event called ${b.processingFrom}.`) : undefined;
  const cue = toCue({ ...existing, eventId: b.eventId, description, label: b.label ?? existing?.label, processing: copied ?? existing?.processing });
  const useBrief = !!pp && b.useBrief !== false;
  const prompt = typeof b.prompt === "string" && b.prompt.trim() ? b.prompt.trim() : useBrief ? pp!.withBrief : description;
  return {
    cue,
    prompt,
    comparison: {
      briefRevision: pinned?.revision ?? null,
      withoutBrief: pp?.withoutBrief ?? description,
      withBrief: pp?.withBrief ?? null,
      fragment: pp?.fragment ?? null,
      processing: cue.processing,
      processingFrom: copied ? String(b.processingFrom) : null,
      promptUsed: prompt,
      briefUsed: !!pp?.fragment && prompt.includes(pp.fragment),
    },
  };
}

function errorResponse(e: unknown) {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  if (e instanceof BriefError) return Response.json({ error: e.message }, { status: 400 });
  console.error(e);
  return Response.json({ error: msg(e) }, { status: 500 });
}

// The visitor's session cookie picks their space. Reading never creates a session; the first change does.
const SESSION = /(?:^|;\s*)cuebound_session=([0-9a-f-]{36})(?:;|$)/;
async function inSession(req: Request, handle: () => Response | Promise<Response>): Promise<Response> {
  const had = SESSION.exec(req.headers.get("cookie") ?? "")?.[1];
  const reading = req.method === "GET" || req.method === "HEAD";
  const sid = had ?? (reading ? null : crypto.randomUUID());
  let res: Response;
  try {
    res = await spaces.run(sid ? sessionSpace(sid, !reading) : blank, handle);
  } catch (e) {
    res = errorResponse(e);
  }
  const secure = req.headers.get("x-forwarded-proto") === "https" ? "; Secure" : "";
  if (sid && !had) res.headers.append("set-cookie", `cuebound_session=${sid}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${secure}`);
  return res;
}

function scoped<R extends Record<string, any>>(routes: R): R {
  if (!HOSTED) return routes;
  const wrap = (h: (req: any, srv: any) => any) => (req: Request, srv: unknown) => inSession(req, () => h(req, srv));
  const each = (v: any) => (typeof v === "function" ? wrap(v) : Object.fromEntries(Object.entries(v).map(([m, h]) => [m, wrap(h as any)])));
  return Object.fromEntries(Object.entries(routes).map(([k, v]) => [k, each(v)])) as R;
}

export function start(port = Number(process.env.PORT ?? 3000)) {
  return Bun.serve({
    port,
    hostname: process.env.HOST ?? "127.0.0.1", // no auth: keep it on loopback unless HOSTED=1 isolates visitors
    idleTimeout: 120, // provider calls (cost report ~17 s) outlast Bun's 10 s default
    maxRequestBodySize: MAX_CLIP_BYTES + 1024 * 1024,
    routes: scoped({
      "/api/state": { GET: () => Response.json(state()) },
      "/api/health": { GET: async () => Response.json(await health()) },

      "/api/livepeer": {
        GET: async () => {
          // Model card only; the provider's cost report is slow (~20 s), so the UI loads /api/cost-report separately.
          const card = await sfxCard().catch((e) => fail(502, `Couldn’t read the model card from Livepeer: ${msg(e)}`));
          return Response.json({
            endpoint: lp.ENDPOINT,
            capability: card.name,
            modelId: card.model_id,
            pricePerSecond: card.pricing?.unit_kind === "second" ? card.pricing.display_price_usd : null,
            priceSource: card.pricing?.source ?? null, // "static-registry" is an estimate, not a live meter
            latency: { p50Ms: card.sla?.p50_ms ?? null, p95Ms: card.sla?.p95_ms ?? null },
          });
        },
      },

      "/api/project": {
        POST: async (req) => {
          const b = await body(req);
          const ceiling = Number(b.runCeilingUsd);
          if (typeof b.name !== "string" || !b.name.trim()) fail(400, "name is required");
          if (!Number.isFinite(ceiling) || ceiling < 0) fail(400, "runCeilingUsd must be a non-negative number");
          const prev = project();
          const p: Project = { ...prev, id: prev?.id ?? crypto.randomUUID(), name: b.name.trim(), brief: String(b.brief ?? ""), runCeilingUsd: capped(ceiling) };
          put("project", p);
          return Response.json(p);
        },
      },

      "/api/clip": {
        POST: async (req) => {
          const p = requireProject();
          const form = await req.formData().catch(() => fail(400, "expected multipart form data"));
          const file = form.get("clip") ?? form.get("file");
          if (!(file instanceof File)) return fail(400, "multipart field 'clip' is required");
          if (file.size > MAX_CLIP_BYTES) fail(413, "That clip is over 50 MB. Choose a smaller file.");
          const ext = extname(file.name).toLowerCase();
          if (![".mp4", ".webm", ".mov", ".mkv"].includes(ext)) fail(415, "Choose an .mp4, .webm, .mov or .mkv file.");
          const rel = `clips/${crypto.randomUUID()}${ext}`;
          mkdirSync(abs("clips"), { recursive: true });
          await Bun.write(abs(rel), file);
          const info = await probeClip(abs(rel)).catch((e) => {
            rmSync(abs(rel), { force: true });
            return fail(500, `Couldn’t check the clip. Install FFmpeg (ffprobe) and restart the server. (${msg(e)})`);
          });
          if (!info.hasVideo || !(info.durationS >= 15 && info.durationS <= 60)) {
            rmSync(abs(rel), { force: true });
            fail(400, info.hasVideo ? `Choose a clip between 15 and 60 seconds long (this one is ${Math.round(info.durationS)} s).` : "That file has no video. Choose a gameplay clip.");
          }
          put("project", { ...p, clipPath: rel });
          return Response.json({ clipPath: rel, durationMs: Math.round(info.durationS * 1000) });
        },
      },

      "/api/cues": {
        PUT: async (req) => {
          const list = await body(req);
          if (!Array.isArray(list)) fail(400, "expected Cue[]");
          const next = (list as any[]).map(toCue);
          if (new Set(next.map((c) => c.eventId)).size !== next.length) fail(400, "eventIds must be unique");
          const prev = new Map(all<Cue>("cues").map((c) => [c.id, c]));
          const locked = new Set(all<Take>("takes").filter((t) => t.jobId === BASELINE).map((t) => t.cueId));
          for (const c of next) {
            const old = prev.get(c.id);
            if (old && locked.has(c.id) && !Bun.deepEquals(old.processing, c.processing)) fail(409, `${c.eventId} comes from the approved pack, so its loudness and length can’t change here.`);
          }
          db().transaction(() => {
            db().exec("DELETE FROM cues");
            next.forEach((c) => put("cues", c));
          })();
          for (const c of next) {
            const old = prev.get(c.id);
            if (old && JSON.stringify(old.processing) !== JSON.stringify(c.processing)) await rerender(c);
          }
          return Response.json(all("cues"));
        },
      },

      "/api/cues/:id/regenerate": {
        POST: async (req) => {
          const cue = need(get<Cue>("cues", req.params.id), "cue");
          const b = await body(req);
          const feedback = String(b.feedback ?? "").trim();
          return Response.json(createJobs([{ cue, prompt: composePrompt(cue, selectedDirection(), feedback) }])[0]);
        },
      },

      "/api/directions": {
        PUT: async (req) => {
          const list = await body(req);
          if (!Array.isArray(list)) fail(400, "expected Direction[]");
          const next: Direction[] = (list as any[]).map((d) => {
            if (typeof d?.name !== "string" || !d.name.trim()) fail(400, "direction name is required");
            return {
              id: typeof d.id === "string" && d.id ? d.id : crypto.randomUUID(),
              name: d.name.trim(),
              texture: String(d.texture ?? ""),
              envelope: String(d.envelope ?? ""),
              hierarchy: String(d.hierarchy ?? ""),
            };
          });
          db().transaction(() => {
            db().exec("DELETE FROM directions");
            next.forEach((d) => put("directions", d));
          })();
          return Response.json(next);
        },
      },

      "/api/directions/:id/select": {
        POST: (req) => {
          const d = need(get<Direction>("directions", req.params.id), "direction");
          const p = { ...requireProject(), directionId: d.id };
          put("project", p);
          return Response.json(p);
        },
      },

      "/api/generate": {
        POST: async (req) => {
          const b = await body(req);
          const n = b.candidates ?? 1;
          if (!Number.isInteger(n) || n < 1 || n > 3) fail(400, "candidates must be 1–3");
          if (!Array.isArray(b.cueIds) || !b.cueIds.length) fail(400, "cueIds is required");
          const cues = (b.cueIds as string[]).map((id) => need(get<Cue>("cues", id), `cue ${id}`));
          const dir = b.directionId ? need(get<Direction>("directions", String(b.directionId)), "direction") : selectedDirection();
          return Response.json(createJobs(cues.flatMap((cue) => Array.from({ length: n }, () => ({ cue, prompt: composePrompt(cue, dir) }))), dir?.id));
        },
      },

      "/api/extend/preview": { POST: async (req) => Response.json(extendPlan(await body(req)).comparison) },

      // New cue for the next mechanic. With a pinned brief, the prompt carries its descriptors as quoted data
      // and processing can be copied from a named brief cue; both are returned so the UI can show with vs without.
      "/api/extend": {
        POST: async (req) => {
          assertBaselineImported();
          const { cue, prompt, comparison } = extendPlan(await body(req));
          assertCeiling(estimate(durationFor(cue)));
          put("cues", cue);
          const job = createJobs([{ cue, prompt }])[0];
          if (comparison.briefRevision && comparison.fragment && prompt.includes(comparison.fragment)) {
            updateJob(job.id, { briefRevision: comparison.briefRevision, briefFragment: comparison.fragment });
          }
          return Response.json({ ...get<Job>("jobs", job.id), comparison });
        },
      },

      "/api/jobs/:id": {
        GET: async (req) => {
          const id = need(get<Job>("jobs", req.params.id), "job").id;
          if (!busy.has(id)) {
            busy.add(id);
            try {
              await reconcile(id);
            } catch (e) {
              updateJob(id, { error: `Couldn’t check the job with Livepeer: ${msg(e)}` });
            } finally {
              busy.delete(id);
            }
          }
          return Response.json(get<Job>("jobs", id));
        },
      },

      "/api/takes/:id": {
        POST: async (req) => {
          const t = need(get<Take>("takes", req.params.id), "take");
          const b = await body(req);
          if (b.status !== undefined && !["candidate", "accepted", "rejected"].includes(b.status)) fail(400, "invalid take status");
          if (b.processing && t.jobId === BASELINE) fail(409, "This take comes from the approved pack, so its loudness and length can’t change here.");
          put("takes", { ...t, ...(b.status ? { status: b.status } : {}), ...(b.feedback !== undefined ? { feedback: String(b.feedback) } : {}) });
          if (b.processing) {
            const cue = need(get<Cue>("cues", t.cueId), "cue");
            const next = { ...cue, processing: processing({ ...cue.processing, ...b.processing }) };
            if (JSON.stringify(next.processing) !== JSON.stringify(cue.processing)) {
              put("cues", next);
              await rerender(next);
            }
          }
          return Response.json(get<Take>("takes", t.id));
        },
      },

      "/api/export": {
        POST: async () => {
          const p = requireProject();
          const outDir = abs(`export/${new Date().toISOString().replace(/[:.]/g, "-")}`);
          const takes = all<Take>("takes").map((t) => ({ ...t, rawPath: abs(t.rawPath), ...(t.finalPath ? { finalPath: abs(t.finalPath) } : {}) }));
          const pack = await exportPack({ project: p, cues: all<Cue>("cues"), takes, outDir });
          return Response.json({ ...pack, ...(await zipPack(outDir)) });
        },
      },

      "/api/brief/preview": { GET: () => Response.json(derive({ by: "developer", scope: "private" })) },

      // The human may edit texts, notes, approval.by/scope and remove cues; identity, assets and processing must match the derived record.
      "/api/brief/approve": {
        POST: async (req) => {
          const b = await body(req);
          const derived = derive({ by: "developer", scope: "private" });
          const brief = parseBrief({ ...b.brief, approval: { ...b.brief?.approval, at: new Date().toISOString() } });
          for (const k of ["schemaVersion", "projectId", "revision", "predecessor", "generator", "assetBaseUrl"] as const) {
            if (!Bun.deepEquals(brief[k], derived[k])) fail(409, `The brief’s ${k} can’t be edited. Review the brief again.`);
          }
          const byId = new Map(derived.cues.map((c) => [c.eventId, c]));
          for (const c of brief.cues) {
            const d = byId.get(c.eventId) ?? fail(409, `${c.eventId} has no kept take yet.`);
            if (!Bun.deepEquals(c.assets, d.assets) || !Bun.deepEquals(c.processing, d.processing)) fail(409, `The audio files and settings of ${c.eventId} can’t be edited in the brief.`);
          }
          const d = digest(brief);
          pinBrief(brief, d);
          return Response.json({ revision: brief.revision, digest: d });
        },
      },

      "/api/brief/:revision/store": {
        POST: async (req) => receiptResponse(await dkg.storeBrief(need(briefRow(Number(req.params.revision)), "approved revision").brief)),
      },

      "/api/brief/:revision/share": {
        POST: async (req) => {
          const rev = Number(req.params.revision);
          const stored = all<Receipt>("receipts").findLast((r) => r.revision === rev && r.status === dkg.STORED);
          return receiptResponse(await dkg.shareBrief(need(stored, `stored receipt for revision ${rev}`)));
        },
      },

      // Testnet publication (mints on Base Sepolia). A pending outcome is reconciled, never re-submitted.
      "/api/brief/:revision/publish": {
        POST: async (req) => {
          if (HOSTED) fail(403, "Publishing is turned off on this hosted demo: it writes to the public testnet for good. Run CueBound on your own computer to publish.");
          const rev = Number(req.params.revision);
          const rows = all<Receipt>("receipts").filter((r) => r.revision === rev);
          const shared = rows.findLast((r) => r.status === dkg.SHARED);
          const pending = rows.findLast((r) => r.status.startsWith("pending:"));
          return receiptResponse(await dkg.publishBrief(need(shared, `shared receipt for revision ${rev}`), pending));
        },
      },

      // Fresh consumer: the brief comes only from DKG, is pinned by revision and digest, and is never merged.
      "/api/continue": {
        POST: async (req) => {
          const b = await body(req);
          const reference = String(b.reference ?? "").trim();
          const got = await dkg.retrieveBrief(reference).catch((e) => {
            if (e instanceof dkg.BriefRetrievalError) {
              const status = { bad_reference: 400, not_found: 404, digest_mismatch: 409, project_revision_mismatch: 409, malformed: 422 }[e.code];
              fail(status, e.message);
            }
            return fail(503, `Couldn’t reach the DKG node, so nothing was retrieved. Check the node is running, then try again. (${msg(e)})`);
          });
          const { brief, provenance } = got;
          const d = digest(brief);
          const p = project();
          const ceiling = p ? p.runCeilingUsd : capped(Number(b.runCeilingUsd));
          if (!Number.isFinite(ceiling) || ceiling < 0) fail(400, "Enter a spend limit for this session.");
          const expected = process.env.EXPECTED_PROJECT_ID;
          if (expected && brief.projectId !== expected) fail(409, `This brief belongs to project ${brief.projectId}, not the one this instance is set up for (${expected}).`);
          const empty = !all("cues").length && !all("takes").length && !latestBrief();
          if (p && p.id !== brief.projectId && !empty) fail(409, "This app already holds another project. Continue in an app with an empty data folder.");
          const pinned = briefRow(brief.revision);
          if (pinned && pinned.digest !== d) fail(409, `A different revision ${brief.revision} is already loaded here.`);
          if (!pinned) pinBrief(brief, d);
          const dir: Direction = { id: `brief-r${brief.revision}`, ...brief.direction };
          put("directions", dir);
          if (p && p.id !== brief.projectId) db().query("DELETE FROM project").run();
          put("project", { name: `Continued ${brief.projectId.slice(0, 8)}`, brief: "", runCeilingUsd: ceiling, ...p, id: brief.projectId, directionId: dir.id } satisfies Project);
          const status = empty ? "retrieved+verified-by-consumer" : "retrieved-by-this-instance";
          addReceipt({ revision: brief.revision, digest: d, layer: provenance.layer, network: dkg.NETWORK, reference, status, at: new Date().toISOString(), raw: { ...provenance, freshInstance: empty } });
          console.log(`brief r${brief.revision} retrieved from DKG ${provenance.view} of ${provenance.contextGraphId}`);
          return Response.json({ brief, provenance, freshInstance: empty });
        },
      },

      // Imports the approved pack's audio from an explicit local pack directory and checks actual bytes against the pinned brief.
      "/api/baseline/import": {
        POST: async (req) => {
          const b = await body(req);
          const pinned = latestBrief() ?? fail(400, "Fetch a brief first.");
          if (typeof b.dir !== "string" || !b.dir.trim()) fail(400, "Enter the folder of the approved pack (the exported cuebound_pack folder).");
          const dir = resolve(b.dir);
          if (HOSTED) {
            // Only a pack this server exported: sessions/<id>/export/<time>/cuebound_pack, never any other folder.
            const parts = relative(join(DATA_DIR, "sessions"), dir).split(sep);
            if (parts.length !== 4 || parts[1] !== "export" || parts[3] !== "cuebound_pack" || parts.some((x) => !x || x === "..")) {
              fail(400, "On this hosted demo, paste the pack folder shown on the Export screen.");
            }
          } else if (dir === DATA_DIR || dir.startsWith(DATA_DIR + sep)) fail(400, "Import a pack from outside this app’s data folder.");
          mkdirSync(abs(BASELINE), { recursive: true });
          const cues = new Map(all<Cue>("cues").map((c) => [c.eventId, c]));
          const files: { file: string; expected: string; actual: string | null; status: "match" | "mismatch" | "missing" }[] = [];
          for (const bc of pinned.brief.cues) {
            const cue: Cue = cues.get(bc.eventId) ?? {
              id: crypto.randomUUID(), eventId: bc.eventId, label: bc.role, description: bc.descriptors,
              sourceTimesMs: [], recurring: bc.assets.length > 1, processing: bc.processing,
            };
            put("cues", cue);
            for (const a of bc.assets) {
              const bytes = await Bun.file(join(dir, a.file)).bytes().catch(() => null);
              const actual = bytes && sha256(bytes);
              const status = !bytes ? "missing" : actual === a.sha256 ? "match" : "mismatch";
              files.push({ file: a.file, expected: a.sha256, actual, status });
              if (status !== "match") continue;
              const rel = baselinePath(a.file);
              await Bun.write(abs(rel), bytes!);
              const prev = all<Take>("takes").find((t) => t.finalPath === rel); // a later revision may bring new bytes for the same file
              put("takes", { status: "accepted", ...prev, id: prev?.id ?? crypto.randomUUID(), cueId: cue.id, jobId: BASELINE, rawPath: rel, finalPath: rel, sha256: a.sha256 } satisfies Take);
            }
          }
          return Response.json({ revision: pinned.revision, files, ok: files.every((f) => f.status === "match") });
        },
      },

      "/api/cost-report": { GET: async () => Response.json(await lp.costReport(project()?.id)) },

      "/media/*": {
        GET: (req) => serveFile(space().dir, new URL(req.url).pathname.slice("/media/".length), req),
      },
    }),

    fetch(req) {
      const path = new URL(req.url).pathname;
      if (path.startsWith("/api/")) return Response.json({ error: "not found" }, { status: 404 });
      return serveFile(PUBLIC_DIR, path === "/" ? "index.html" : path.slice(1), req);
    },

    error: errorResponse,
  });
}

if (import.meta.main) {
  const server = start();
  console.log(`CueBound on ${server.url} (DATA_DIR=${DATA_DIR}${HOSTED ? ", hosted: one project per visitor" : ""})`);
}

