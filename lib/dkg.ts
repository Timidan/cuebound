import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { canonicalize, digest, parseBrief } from "./brief";
import type { DkgLayer, Receipt, SoundDesignBrief } from "./types";

export const NETWORK = "testnet base:84532";
export const STORED = "stored+readback-verified";
export const SHARED = "shared+readback-verified";
export const PUBLISHED = "published+readback-verified";

const NS = "urn:cuebound:ns:";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const XSD_INTEGER = "http://www.w3.org/2001/XMLSchema#integer";
const VIEWS = { "verifiable-memory": "verifiable", "shared-working-memory": "shared", "working-memory": "working" } as const;
type View = keyof typeof VIEWS;

const apiUrl = () => (process.env.DKG_API_URL ?? "http://127.0.0.1:9200").replace(/\/+$/, "");
let cachedToken: string | undefined;
function token(): string {
  if (process.env.DKG_AUTH_TOKEN) return process.env.DKG_AUTH_TOKEN;
  if (!cachedToken) {
    const file = `${process.env.DKG_HOME ?? `${homedir()}/.dkg`}/auth.token`;
    cachedToken = readFileSync(file, "utf8").split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#"));
    if (!cachedToken) throw new Error(`no DKG auth token in ${file}`);
  }
  return cachedToken;
}

async function api(method: "GET" | "POST", path: string, body?: unknown, timeoutMs = 60_000): Promise<any> {
  let res: Response;
  try {
    res = await fetch(apiUrl() + path, {
      method,
      headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new Error(`DKG node unreachable at ${apiUrl()}: ${(e as Error).message}`);
  }
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`DKG ${method} ${path.split("?")[0]} -> HTTP ${res.status}: ${text.slice(0, 300)}`), { status: res.status });
  return JSON.parse(text);
}

export async function preflight(): Promise<any> {
  const s = await api("GET", "/api/status");
  if (s?.networkConfig !== "testnet" || s?.chain?.chainId !== "base:84532")
    throw new Error(`refusing DKG node on ${s?.networkConfig}/${s?.chain?.chainId}: only testnet base:84532 is allowed`);
  return s;
}

export type RetrievalCode = "bad_reference" | "not_found" | "digest_mismatch" | "project_revision_mismatch" | "malformed";
export class BriefRetrievalError extends Error {
  constructor(readonly code: RetrievalCode, message: string) {
    super(`${code}: ${message}`);
  }
}

// Reference: dkg-brief:<contextGraphId>/<assetName>?revision=<n>&sha256=<digest>[&ual=<testnet UAL>]
export interface BriefRef { contextGraphId: string; assetName: string; revision: number; digest: string; ual?: string }
const REF = /^dkg-brief:(cuebound-([A-Za-z0-9][A-Za-z0-9_-]{0,63}))\/brief-r([1-9]\d{0,5})\?revision=([1-9]\d{0,5})&sha256=([0-9a-f]{64})(?:&ual=(did:dkg:base:84532\/0x[0-9a-fA-F]{40}\/\d{1,20}))?$/;

function parseReference(s: string): BriefRef {
  const m = typeof s === "string" ? REF.exec(s.trim()) : null;
  if (!m || m[3] !== m[4]) throw new BriefRetrievalError("bad_reference", "expected dkg-brief:cuebound-<project>/brief-r<n>?revision=<n>&sha256=<64 hex>[&ual=<testnet UAL>]");
  return { contextGraphId: m[1], assetName: `brief-r${m[3]}`, revision: Number(m[4]), digest: m[5], ...(m[6] ? { ual: m[6] } : {}) };
}

function formatReference(r: BriefRef): string {
  const s = `dkg-brief:${r.contextGraphId}/${r.assetName}?revision=${r.revision}&sha256=${r.digest}${r.ual ? `&ual=${r.ual}` : ""}`;
  parseReference(s);
  return s;
}

const projectOf = (r: BriefRef) => r.contextGraphId.slice("cuebound-".length);
const subjectOf = (projectId: string, revision: number) => `urn:cuebound:brief:${projectId}:r${revision}`;

// N-Triples literal escaping, identical to the node's canonical form (dkg-rdf-utils escapeRdfLiteral).
const ECHAR: Record<string, string> = { "\b": "\\b", "\t": "\\t", "\n": "\\n", "\f": "\\f", "\r": "\\r", '"': '\\"', "\\": "\\\\" };
const UNECHAR: Record<string, string> = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", '"': '"', "'": "'", "\\": "\\" };
const lit = (s: string) =>
  `"${s.replace(/["\\\u0000-\u001F\u007F]/g, (c) => ECHAR[c] ?? `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`)}"`;

function unlit(term: string): string | null {
  const m = /^"((?:[^"\\]|\\[\s\S])*)"$/.exec(term);
  if (!m) return null;
  let ok = true;
  const out = m[1].replace(/\\(?:u([0-9A-Fa-f]{4})|U([0-9A-Fa-f]{8})|([\s\S]))/g, (_, u4, u8, ch) => {
    const cp = ch === undefined ? parseInt(u4 ?? u8, 16) : -1;
    if (ch !== undefined ? !(ch in UNECHAR) : cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
      ok = false;
      return "";
    }
    return ch !== undefined ? UNECHAR[ch] : String.fromCodePoint(cp);
  });
  return ok ? out : null;
}

type Quad = { subject: string; predicate: string; object: string };

// A few queryable triples plus one literal holding the canonical JSON (the exact record).
function toQuads(brief: SoundDesignBrief): Quad[] {
  const s = subjectOf(brief.projectId, brief.revision);
  const q = (subject: string, predicate: string, object: string): Quad => ({ subject, predicate, object });
  const int = (n: number) => `"${n}"^^<${XSD_INTEGER}>`;
  const out = [
    q(s, RDF_TYPE, `${NS}SoundDesignBrief`),
    q(s, `${NS}projectId`, lit(brief.projectId)),
    q(s, `${NS}revision`, int(brief.revision)),
    q(s, `${NS}schemaVersion`, int(brief.schemaVersion)),
    q(s, `${NS}directionTexture`, lit(brief.direction.texture)),
    q(s, `${NS}canonicalJson`, lit(canonicalize(brief))),
  ];
  if (brief.predecessor) out.push(q(s, `${NS}predecessorDigest`, lit(brief.predecessor.digest)));
  for (const c of brief.cues) {
    const cs = `${s}:cue:${c.eventId}`;
    out.push(q(s, `${NS}cue`, cs), q(cs, `${NS}eventId`, lit(c.eventId)), q(cs, `${NS}descriptors`, lit(c.descriptors)));
  }
  return out;
}

type Row = { s: string; p: string; o: string };

async function readRows(ref: BriefRef, view: View): Promise<Row[]> {
  const s = subjectOf(projectOf(ref), ref.revision);
  const sparql = `SELECT ?s ?p ?o WHERE { ?s ?p ?o FILTER(STRSTARTS(STR(?s), "${s}")) }`;
  const r = await api("POST", "/api/query", { sparql, contextGraphId: ref.contextGraphId, view });
  const rows = r?.result?.bindings;
  if (!Array.isArray(rows)) throw new Error(`unexpected query response from ${view}`);
  return rows.filter((x: Row) => x.s === s || x.s?.startsWith(`${s}:cue:`));
}

// Re-parse, re-canonicalize and check identity against the reference.
function briefFrom(rows: Row[], ref: BriefRef): { brief: SoundDesignBrief; binding: string } {
  const s = subjectOf(projectOf(ref), ref.revision);
  const hits = rows.filter((r) => r.s === s && r.p === `${NS}canonicalJson`);
  if (hits.length !== 1) throw new BriefRetrievalError("malformed", `expected 1 canonical record, found ${hits.length}`);
  const binding = hits[0].o;
  const json = unlit(binding);
  if (json === null) throw new BriefRetrievalError("malformed", "record is not a plain RDF literal");
  let brief: SoundDesignBrief;
  try {
    brief = parseBrief(JSON.parse(json));
  } catch (e) {
    throw new BriefRetrievalError("malformed", (e as Error).message);
  }
  if (canonicalize(brief) !== json) throw new BriefRetrievalError("malformed", "record is not in canonical form");
  if (brief.projectId !== projectOf(ref) || brief.revision !== ref.revision)
    throw new BriefRetrievalError("project_revision_mismatch", `record is ${brief.projectId} r${brief.revision}, reference is ${projectOf(ref)} r${ref.revision}`);
  const d = digest(brief);
  if (d !== ref.digest) throw new BriefRetrievalError("digest_mismatch", `record digest ${d}, reference expects ${ref.digest}`);
  return { brief, binding };
}

// exact: every triple read back must equal the projection of the verified record, byte for byte.
async function verify(ref: BriefRef, view: View, exact: boolean) {
  const rows = await readRows(ref, view);
  if (!rows.length) throw new BriefRetrievalError("not_found", `${ref.assetName} not found in ${view}`);
  const { brief, binding } = briefFrom(rows, ref);
  if (exact) {
    const key = (s: string, p: string, o: string) => JSON.stringify([s, p, o]);
    const want = toQuads(brief).map((q) => key(q.subject, q.predicate, q.object)).sort().join("\n");
    const got = [...new Set(rows.map((r) => key(r.s, r.p, r.o)))].sort().join("\n");
    if (got !== want) throw new Error(`${view} readback differs from the written triples`);
  }
  return { brief, binding, triples: rows.length };
}

function receipt(ref: BriefRef, layer: DkgLayer, status: string, raw?: unknown): Receipt {
  return { revision: ref.revision, digest: ref.digest, layer, network: NETWORK, reference: formatReference(ref), status, at: new Date().toISOString(), raw };
}
const failed = (e: unknown) => `failed: ${(e as Error).message ?? String(e)}`;

// Writes a NEW knowledge asset per revision to Working Memory, then verifies it through SPARQL.
// DKG failures come back as a Receipt whose status starts with "failed:"; an invalid brief throws.
export async function storeBrief(input: SoundDesignBrief): Promise<Receipt> {
  const brief = parseBrief(input);
  const ref: BriefRef = { contextGraphId: `cuebound-${brief.projectId}`, assetName: `brief-r${brief.revision}`, revision: brief.revision, digest: digest(brief) };
  try {
    await preflight();
    const cg = ref.contextGraphId;
    const created = !(await api("GET", `/api/context-graph/exists?id=${encodeURIComponent(cg)}`)).exists;
    if (created) await api("POST", "/api/context-graph/create", { id: cg, name: `CueBound ${brief.projectId}` });
    const asset = await api("POST", "/api/knowledge-assets", { contextGraphId: cg, name: ref.assetName });
    if (asset.alreadyExists !== false) throw new Error(`${ref.assetName} already exists in ${cg}; revisions are never overwritten`);
    const w = await api("POST", `/api/knowledge-assets/${ref.assetName}/wm/write`, { contextGraphId: cg, quads: toQuads(brief) });
    const v = await verify(ref, "working-memory", true);
    return receipt(ref, "working", STORED, { contextGraphCreated: created, asset, written: w.written, readback: { view: "working-memory", triples: v.triples } });
  } catch (e) {
    return receipt(ref, "working", failed(e));
  }
}

// finalize (seal) then share WM -> SWM; the node moves the triples, so WM is empty afterwards.
export async function shareBrief(stored: Receipt): Promise<Receipt> {
  const ref = parseReference(stored.reference);
  if (stored.status !== STORED) throw new Error(`only a "${STORED}" receipt can be shared`);
  try {
    await preflight();
    const { brief } = await verify(ref, "working-memory", true);
    if (brief.approval.scope === "private") throw new Error("approval scope is private; approve a revision with scope shared first");
    const path = `/api/knowledge-assets/${ref.assetName}`;
    const finalize = await api("POST", `${path}/wm/finalize`, { contextGraphId: ref.contextGraphId });
    const share = await api("POST", `${path}/swm/share`, { contextGraphId: ref.contextGraphId, entities: "all" });
    if (share.swmShared !== true) throw new Error(`share not confirmed: ${JSON.stringify(share)}`);
    const v = await verify(ref, "shared-working-memory", true);
    return receipt(ref, "shared", SHARED, { finalize, share, readback: { view: "shared-working-memory", triples: v.triples } });
  } catch (e) {
    return receipt(ref, "shared", failed(e));
  }
}

// An outcome the node did not confirm (timeout, 5xx, or minted but not read back) is recorded as "pending:" and never
// re-submitted, because the transaction may exist. Errors the node refuses before signing are plain failures.
const pendingStatus = (e: unknown) => `pending: ${(e as Error).message ?? String(e)}`;
// ponytail: matches the node's error text; the node exposes no machine-readable "nothing was signed" code yet.
const refusedBeforeSigning = (e: unknown) => {
  const status = (e as { status?: number }).status;
  const text = (e as Error).message ?? "";
  return (status !== undefined && status < 500) || /insufficient[ _]funds|TooLowAllowance|no configured RPC could serve|resolveContextGraphIdByNameHash/i.test(text);
};

// Only claims PUBLISHED after the record is read back from Verifiable Memory byte for byte.
async function confirmPublished(ref: BriefRef, publish: any, node: any, extra: object): Promise<Receipt> {
  if (typeof publish?.ual !== "string") throw new Error(`publish response has no UAL: ${JSON.stringify(publish).slice(0, 200)}`);
  const withUal: BriefRef = { ...ref, ual: publish.ual };
  formatReference(withUal); // only a base:84532 UAL is accepted into a reference
  const v = await verify(withUal, "verifiable-memory", true);
  const descriptor = await api("GET", `/api/knowledge-assets/${ref.assetName}?contextGraphId=${encodeURIComponent(ref.contextGraphId)}`);
  const explorer = String(node.blockExplorerUrl ?? "https://sepolia.basescan.org").replace(/\/+$/, "");
  return receipt(withUal, "verifiable", PUBLISHED, {
    ...extra,
    publish,
    descriptor,
    explorerTx: typeof publish.txHash === "string" ? `${explorer}/tx/${publish.txHash}` : null,
    node: { version: node.version, peerId: node.peerId, network: NETWORK },
    readback: { view: "verifiable-memory", triples: v.triples },
  });
}

// Synchronous vm/publish on testnet: the node registers the context graph on-chain on first publish and mints the
// sealed assertion (gas + TRAC from the node's wallet). Needs the shared receipt and approval scope "published".
// With a "pending:" receipt for the revision, nothing is re-submitted: the lifecycle descriptor decides instead.
export async function publishBrief(shared: Receipt, pending?: Receipt): Promise<Receipt> {
  const ref = parseReference(shared.reference);
  if (shared.status !== SHARED) throw new Error(`only a "${SHARED}" receipt can be published`);
  let publish: any = (pending?.raw as { publish?: unknown } | undefined)?.publish;
  try {
    const node = await preflight();
    const path = `/api/knowledge-assets/${ref.assetName}`;
    if (pending) {
      const descriptor = await api("GET", `${path}?contextGraphId=${encodeURIComponent(ref.contextGraphId)}`);
      if (typeof descriptor?.ual === "string") publish = { ...publish, ual: descriptor.ual };
      const live = descriptor?.state === "published" || descriptor?.memoryLayer === "VM";
      if (!live || typeof publish?.ual !== "string")
        return receipt(ref, "verifiable", `pending: not confirmed by the node (state ${descriptor?.state ?? "unknown"}); not re-submitted`, { descriptor, publish: publish ?? null });
      return await confirmPublished(ref, publish, node, { reconciled: true });
    }
    const { brief } = await verify(ref, "shared-working-memory", true);
    if (brief.approval.scope !== "published") throw new Error(`approval scope is ${brief.approval.scope}; approve a revision with scope published first`);
    try {
      // The first publish of a context graph scans chain history to register it, which can take minutes.
      publish = await api("POST", `${path}/vm/publish`, { contextGraphId: ref.contextGraphId }, 20 * 60_000);
    } catch (e) {
      return receipt(ref, "verifiable", refusedBeforeSigning(e) ? failed(e) : pendingStatus(e));
    }
    return await confirmPublished(ref, publish, node, {});
  } catch (e) {
    // A UAL in hand means it was minted; only the readback or the descriptor failed.
    return receipt(ref, "verifiable", publish?.ual ? pendingStatus(e) : failed(e), publish ? { publish } : undefined);
  }
}

// DKG only: no local app storage is consulted.
export async function retrieveBrief(reference: string) {
  const ref = parseReference(reference);
  const status = await preflight();
  const exists = await api("GET", `/api/context-graph/exists?id=${encodeURIComponent(ref.contextGraphId)}`);
  if (!exists.exists) throw new BriefRetrievalError("not_found", `context graph ${ref.contextGraphId} is not on this node`);
  for (const view of Object.keys(VIEWS) as View[]) {
    const rows = await readRows(ref, view);
    if (!rows.length) continue;
    const { brief, binding } = briefFrom(rows, ref);
    return {
      brief,
      provenance: {
        view,
        layer: VIEWS[view] as DkgLayer,
        node: { url: apiUrl(), peerId: status.peerId, network: NETWORK },
        contextGraphId: ref.contextGraphId,
        assetName: ref.assetName,
        subject: subjectOf(projectOf(ref), ref.revision),
        ual: ref.ual ?? null,
        binding, // raw N-Triples literal exactly as the node returned it
      },
    };
  }
  throw new BriefRetrievalError("not_found", `${ref.assetName} not found in any memory layer of ${ref.contextGraphId}`);
}
