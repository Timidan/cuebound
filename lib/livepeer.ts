import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const ENDPOINT = process.env.LIVEPEER_MCP_URL ?? "https://agent.livepeer.org/api/mcp/creative";
export const SFX_CAPABILITY = "mirelo-sfx";
export const SFX_USD_PER_SECOND = 0.0105; // get_pricing registry rate, 25 Sep 2026
// Observed 25 Sep 2026: result URL on agent.livepeer.org/a/... 302s to v3b.fal.media. Add hosts only after observing them.
const MEDIA_HOSTS = new Set(["agent.livepeer.org", "v3b.fal.media"]);
const MAX_BYTES = 20 * 1024 * 1024;

// Definitive refusal from the provider (the call was answered), as opposed to a network/timeout failure.
export class ProviderError extends Error {
  constructor(message: string, readonly notBilled: boolean) {
    super(message);
  }
}

export interface ProviderJob {
  providerJobId?: string;
  status: string; // provider status: submitted | queued | running | done | failed | cancelled
  url?: string;
  costUsd?: number;
  error?: string;
  notBilled?: boolean;
  raw: any;
}

let rpcId = 0;

async function rpc(method: string, params: object, name: string, timeoutMs: number): Promise<any> {
  const key = process.env.LIVEPEER_API_KEY;
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
    throw new ProviderError(`${name}: HTTP ${res.status} ${text.slice(0, 300)}`, false);
  }
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${text.slice(0, 300)}`);
  const msg = res.headers.get("content-type")?.includes("text/event-stream") ? parseSse(text) : JSON.parse(text);
  if (msg.error) throw new ProviderError(`${name}: ${msg.error.message ?? JSON.stringify(msg.error)}`, false);
  return msg.result ?? {};
}

async function callTool(name: string, args: object, timeoutMs = 60_000): Promise<any> {
  const r = await rpc("tools/call", { name, arguments: args }, name, timeoutMs);
  const out = r.structuredContent ?? parseJson(r.content?.[0]?.text) ?? {};
  if (r.isError || out.ok === false) {
    const detail = out.error?.message ?? out.error ?? r.content?.[0]?.text ?? "unknown error";
    const note = String(out.billing_note ?? out.error_billing_note ?? "");
    throw new ProviderError(`${name}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`, note.startsWith("not_billed"));
  }
  return out;
}

function parseSse(text: string): any {
  const events = text
    .split(/\r?\n\r?\n/)
    .map((e) => e.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n"))
    .filter(Boolean)
    .map((d) => JSON.parse(d));
  const msg = events.reverse().find((m) => "result" in m || "error" in m);
  if (!msg) throw new Error("Livepeer SSE response carried no JSON-RPC result");
  return msg;
}

function parseJson(s: unknown): any {
  try {
    return typeof s === "string" ? JSON.parse(s) : undefined;
  } catch {
    return undefined;
  }
}

function toJob(out: any, jobId?: string): ProviderJob {
  const note = String(out.error_billing_note ?? out.billing_note ?? "");
  const used = out.capability_used ?? out.capability;
  if (out.upstream_substitution || out.fallback_fired || (used && used !== SFX_CAPABILITY)) {
    return { providerJobId: out.job_id ?? jobId, status: "failed", error: `provider substituted ${used ?? "another model"}; result refused`, raw: out };
  }
  return {
    providerJobId: out.job_id ?? jobId,
    status: String(out.status ?? (out.url ? "done" : "unknown")).toLowerCase(),
    url: out.url ?? undefined,
    costUsd: out.cost_paid_usd ?? undefined,
    error: out.error ? (typeof out.error === "string" ? out.error : JSON.stringify(out.error)) : undefined,
    notBilled: note.startsWith("not_billed"),
    raw: out,
  };
}

// create_media's duration is an integer 3–15 s (schema written for video).
export const sfxDuration = (maxDurationMs: number) => Math.min(15, Math.max(3, Math.ceil(maxDurationMs / 1000)));

export interface SfxRequest {
  prompt: string;
  durationS: number;
  idempotencyKey: string; // replays the same provider job for 24h instead of re-rendering
  maxCostUsd: number; // provider-side pre-flight cap
  sessionId?: string; // makes costReport(sessionId) attributable; keyless "mine" is a shared demo principal
}

export async function runSfx(r: SfxRequest): Promise<ProviderJob> {
  const out = await callTool("create_media", {
    action: "generate",
    model_override: SFX_CAPABILITY,
    strict: true,
    async: true,
    prompt: r.prompt,
    duration: r.durationS,
    idempotency_key: r.idempotencyKey,
    max_cost_usd: r.maxCostUsd,
    ...(r.sessionId ? { session_id: r.sessionId } : {}),
  });
  return toJob(out);
}

export async function getJob(jobId: string): Promise<ProviderJob> {
  return toJob(await callTool("get_create_media", { job_id: jobId }, 20_000), jobId);
}

// Free, no spend: a handshake and the registry card.
export const initialize = (): Promise<any> =>
  rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "cuebound", version: "1" } }, "initialize", 10_000);
export const describeCapability = (name = SFX_CAPABILITY): Promise<any> => callTool("describe_capability", { name }, 20_000);

export function costReport(sessionId?: string): Promise<any> {
  return callTool("get_cost_report", sessionId ? { since: "all", scope: "session", session_id: sessionId } : { since: "24h" }, 60_000);
}

function isPrivate(ip: string): boolean {
  if (ip.toLowerCase().startsWith("::ffff:")) ip = ip.slice(7);
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b < 128) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168);
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith("ff");
}

async function assertSafe(u: URL) {
  if (u.protocol !== "https:" || (u.port && u.port !== "443")) throw new Error(`refusing media URL ${u.origin}`);
  if (!MEDIA_HOSTS.has(u.hostname)) throw new Error(`refusing media host ${u.hostname}`);
  // ponytail: fetch re-resolves DNS after this check; the host allowlist is the primary guard.
  const addrs = await lookup(u.hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivate(a.address))) throw new Error(`refusing private address for ${u.hostname}`);
}

export async function downloadResult(url: string, destPath: string): Promise<{ bytes: number; contentType: string }> {
  const signal = AbortSignal.timeout(30_000);
  let current = new URL(url);
  for (let hop = 0; hop < 4; hop++) {
    await assertSafe(current);
    const res = await fetch(current, { redirect: "manual", signal });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel();
      if (!loc) throw new Error("redirect without location");
      current = new URL(loc, current);
      continue;
    }
    if (!res.ok) throw new Error(`download HTTP ${res.status}`);
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("audio/")) {
      await res.body?.cancel();
      throw new Error(`refusing non-audio content-type ${contentType || "(none)"}`);
    }
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) {
      await res.body?.cancel();
      throw new Error("media exceeds 20 MB");
    }
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for await (const chunk of res.body!) {
      bytes += chunk.byteLength;
      if (bytes > MAX_BYTES) throw new Error("media exceeds 20 MB");
      chunks.push(chunk);
    }
    await Bun.write(destPath, new Blob(chunks));
    return { bytes, contentType };
  }
  throw new Error("too many redirects");
}
