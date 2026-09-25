// Shared contract. Owners: server/schema = B, pack = A, brief/DKG = C, UI = D.

export type JobStatus = "intent" | "submitted" | "running" | "done" | "failed" | "unknown";

export interface Job {
  id: string;
  cueId: string;
  directionId?: string;
  capability: string;
  prompt: string;
  durationS: number;
  status: JobStatus;
  providerJobId?: string;
  resultUrl?: string;
  error?: string;
  costUsd?: number;
  briefRevision?: number; // set when the prompt carried a pinned brief fragment
  briefFragment?: string;
  createdAt: string;
}

export interface Processing {
  gainDb: number;
  trimStartMs: number;
  maxDurationMs: number;
  fadeOutMs: number;
}

export type TakeStatus = "candidate" | "accepted" | "rejected";

export interface Take {
  id: string;
  cueId: string;
  jobId: string;
  rawPath: string; // relative to DATA_DIR; UI loads /media/<path>. Provider bytes as downloaded
  finalPath?: string; // processing rendered once; preview and export both use this file
  sha256?: string; // of finalPath bytes
  rawPeakDbfs?: number; // provider output level before levelling; below -30 the UI warns it may be mostly noise
  status: TakeStatus;
  feedback?: string; // private; never shared unless distilled into the brief
}

export interface Cue {
  id: string;
  eventId: string; // stable id used in Godot, e.g. "jump"
  label: string;
  description: string;
  sourceTimesMs: number[];
  recurring: boolean; // needs >= 2 accepted takes
  origin?: "manual" | "event-log"; // event-log = exact times from the reference game's autopilot, not video analysis
  processing: Processing;
}

export interface Direction {
  id: string;
  name: string;
  texture: string;
  envelope: string;
  hierarchy: string;
}

export interface Project {
  id: string; // opaque
  name: string;
  brief: string;
  clipPath?: string;
  directionId?: string;
  runCeilingUsd: number;
}

export interface BriefCue {
  eventId: string;
  role: string;
  descriptors: string; // prompt descriptor: suggestion to the model
  avoid: string; // prompt descriptor
  processing: Processing; // applied by code
  notes: string[]; // reviewed, human-distilled judgments
  assets: { file: string; sha256: string }[];
}

export interface SoundDesignBrief {
  schemaVersion: 1;
  projectId: string;
  revision: number;
  predecessor: { revision: number; digest: string } | null;
  direction: { name: string; texture: string; envelope: string; hierarchy: string };
  cues: BriefCue[];
  generator: { capability: string; modelId: string; termsRef: string };
  assetBaseUrl: string | null; // public permitted location of the pack; never localhost or signed URLs
  approval: { by: string; at: string; scope: "private" | "shared" | "published" };
}

export type DkgLayer = "working" | "shared" | "verifiable";

// Kept beside the brief, never inside it.
export interface Receipt {
  revision: number;
  digest: string; // sha256 of canonical serialization of SoundDesignBrief
  layer: DkgLayer;
  network: string;
  reference: string; // compact dkg-brief: reference (includes the UAL once published)
  // proof only: "stored+readback-verified" | "shared+readback-verified" | "published+readback-verified"
  // | "retrieved+verified-by-consumer" (instance had no cues, takes or briefs before /api/continue; raw.freshInstance true)
  // | "retrieved-by-this-instance" (the instance already held project data, so this is not independent-consumer evidence)
  status: string;
  at: string;
  raw?: unknown;
}

export interface State {
  project: Project | null;
  cues: Cue[];
  takes: Take[];
  jobs: Job[];
  directions: Direction[];
  briefs: { revision: number; digest: string; brief: SoundDesignBrief }[];
  receipts: Receipt[];
  spentUsd: number; // estimated from jobs; provider cost report shown separately
  hosted?: { spendCapUsd: number }; // set when the server runs with HOSTED=1
}

// Module seams:
// lib/audio.ts (A)  processTake(rawPath, p: Processing, outPath) -> Promise<{ sha256; durationMs; peakDbfs }>
//                   probe(path) -> Promise<{ durationMs; sampleRate; channels }>
// lib/pack.ts  (A)  exportPack({ project, cues, takes, outDir }) -> Promise<{ dir; files: { path; sha256 }[]; incomplete: string[] }>

// Routes (all JSON unless noted), owned by B in server.ts:
// GET  /api/state                       Project, cues, takes, jobs, directions, briefs, receipts
// GET  /api/health                      {ffmpeg, ffprobe, godot, zip, dkg, livepeer}: each {ok, detail}; free calls only, cached 30 s
// GET  /api/livepeer                    {endpoint, capability, modelId, pricePerSecond, priceSource, latency: {p50Ms, p95Ms}, costReport}
//                                       mirelo-sfx card from free describe_capability (cached 10 min); costReport is null without a project
// POST /api/project                     {name, brief, runCeilingUsd}
// POST /api/clip                        multipart, bounded size/duration
// PUT  /api/cues                        Cue[]
// PUT  /api/directions                  Direction[]; POST /api/directions/:id/select
// POST /api/generate                    {cueIds, candidates, directionId?} -> Job[]; enforces ceiling; directionId previews an unselected direction
// GET  /api/jobs/:id                    reconcile and return Job
// POST /api/takes/:id                   {status, feedback?, processing?}
// POST /api/cues/:id/regenerate         {feedback} -> Job
// POST /api/export                      -> {dir, files, incomplete: string[], zipPath, zipReason?}; zipPath is under DATA_DIR
//                                       (download /media/<zipPath>) or null with zipReason when no bsdtar/7z/zip exists
// GET  /api/brief/preview               SoundDesignBrief derived from approvals
// POST /api/brief/approve               {brief} -> {revision, digest}
// POST /api/brief/:revision/store       DKG write + readback -> Receipt
// POST /api/brief/:revision/share       finalize + share to SWM + readback -> Receipt
// POST /api/brief/:revision/publish     vm/publish on testnet + verifiable-memory readback -> Receipt; a pending: receipt is reconciled, never re-submitted
// POST /api/continue                    {reference, runCeilingUsd} -> {brief, provenance, freshInstance}; brief via DKG only
// POST /api/baseline/import             {dir} -> per-file hash check vs pinned brief; matching files become locked accepted takes
// POST /api/extend/preview              {eventId, description, processingFrom?} -> comparison (no spend)
// POST /api/extend                      {eventId, description, processingFrom?, useBrief?} -> Job & {comparison}
//                                       409 after /api/continue until every asset of that revision is an imported baseline take with matching sha256
// GET  /api/cost-report                session-scoped provider cost report (P4 evidence)
// GET  /media/*                         files under DATA_DIR
