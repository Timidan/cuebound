import type { Cue, Direction, Job, Processing, Receipt, SoundDesignBrief, State, Take } from "../../lib/types";

export type { Cue, Direction, Job, Processing, Receipt, SoundDesignBrief, State, Take };

class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(path, init);
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? data?.message ?? (typeof data === "string" && data) ?? res.statusText, data);
  return data as T;
}

// 501, or the server's generic 404 for an unknown /api route, means this server build does not have the route yet.
export const notInBuild = (e: unknown) =>
  e instanceof ApiError && (e.status === 501 || (e.status === 404 && (!(e.body as any)?.error || (e.body as any).error === "not found")));

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export type Check = { ok: boolean; detail: string };
export type Health = Record<string, Check>;

export interface LivepeerCard {
  endpoint: string;
  capability: string;
  modelId: string;
  pricePerSecond: number | null;
  priceSource: string | null;
  latency: { p50Ms: number | null; p95Ms: number | null };
}

export interface CostReport {
  total_cost_usd?: number;
  scanned_jobs?: number;
  [k: string]: unknown;
}

export interface ExportResult {
  dir: string;
  files: { path: string; sha256: string }[];
  incomplete: string[];
  zipPath?: string | null;
  zipReason?: string;
}

export interface Provenance {
  view: string;
  layer: string;
  node: { url: string; peerId?: string; network: string };
  contextGraphId: string;
  assetName: string;
  subject: string;
  ual: string | null;
}

export interface ContinueResult {
  brief: SoundDesignBrief;
  provenance: Provenance;
  freshInstance?: boolean;
}

export interface BaselineResult {
  revision: number;
  files: { file: string; expected: string; actual: string | null; status: "match" | "mismatch" | "missing" }[];
  ok: boolean;
}

export interface Comparison {
  briefRevision: number | null;
  withoutBrief: string;
  withBrief: string | null;
  fragment: string | null;
  processing: Processing;
  processingFrom: string | null;
  promptUsed: string;
  briefUsed: boolean;
}

export interface ExtendBody {
  eventId: string;
  label?: string;
  description: string;
  processingFrom?: string;
  useBrief?: boolean;
}

const seg = encodeURIComponent;

export const api = {
  state: () => call<State>("GET", "/api/state"),
  health: () => call<Health>("GET", "/api/health"),
  livepeer: () => call<LivepeerCard>("GET", "/api/livepeer"),
  costReport: () => call<CostReport>("GET", "/api/cost-report"),
  project: (b: { name: string; brief: string; runCeilingUsd: number }) => call("POST", "/api/project", b),
  clip: (file: File) => {
    const form = new FormData();
    form.append("clip", file);
    return call<{ clipPath: string; durationMs: number }>("POST", "/api/clip", form);
  },
  cues: (cues: Cue[]) => call<Cue[]>("PUT", "/api/cues", cues),
  directions: (d: Omit<Direction, "id">[] | Direction[]) => call<Direction[]>("PUT", "/api/directions", d),
  selectDirection: (id: string) => call("POST", `/api/directions/${seg(id)}/select`),
  generate: (b: { cueIds: string[]; candidates: number; directionId?: string }) => call<Job[]>("POST", "/api/generate", b),
  job: (id: string) => call<Job>("GET", `/api/jobs/${seg(id)}`),
  take: (id: string, b: { status?: Take["status"]; feedback?: string }) => call<Take>("POST", `/api/takes/${seg(id)}`, b),
  regenerate: (cueId: string, feedback: string) => call<Job>("POST", `/api/cues/${seg(cueId)}/regenerate`, { feedback }),
  exportPack: () => call<ExportResult>("POST", "/api/export"),
  briefPreview: () => call<SoundDesignBrief>("GET", "/api/brief/preview"),
  approve: (brief: SoundDesignBrief) => call<{ revision: number; digest: string }>("POST", "/api/brief/approve", { brief }),
  store: (revision: number) => call<Receipt>("POST", `/api/brief/${revision}/store`),
  share: (revision: number) => call<Receipt>("POST", `/api/brief/${revision}/share`),
  publish: (revision: number) => call<Receipt>("POST", `/api/brief/${revision}/publish`),
  continueFrom: (reference: string, runCeilingUsd: number) => call<ContinueResult>("POST", "/api/continue", { reference, runCeilingUsd }),
  importBaseline: (dir: string) => call<BaselineResult>("POST", "/api/baseline/import", { dir }),
  extendPreview: (b: ExtendBody) => call<Comparison>("POST", "/api/extend/preview", b),
  extend: (b: ExtendBody) => call<Job & { comparison: Comparison }>("POST", "/api/extend", b),
};

export const mediaUrl = (path: string) => "/media/" + path.replace(/^\/+/, "").split("/").map(seg).join("/");
