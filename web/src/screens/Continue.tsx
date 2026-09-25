import { Check, DownloadSimple, X } from "@phosphor-icons/react";
import { SceneStrip } from "@/components/app/SceneStrip";
import { useEffect, useState } from "react";
import { DotMorphButton } from "@/components/smoothui/dot-morph-button";
import { api, mediaUrl, type BaselineResult, type Comparison, type ExportResult, type Provenance, type SoundDesignBrief } from "@/api";
import { db, estimateUsd, eventColor, inFlight, kept, plural, shortHash, usd } from "@/kit";
import { JobRows, TakeRow } from "@/screens/Listen";
import { Heading } from "@/screens/Start";
import { useKit } from "@/store";

const LAYER: Record<string, string> = {
  working: "The author’s own DKG node, not shared",
  shared: "Shared with the author’s DKG peers",
  verifiable: "Published on testnet",
};

function Step({ n, title, done, locked, children }: { n: number; title: string; done: boolean; locked?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`step-${n}`} className={`rounded-3xl border bg-white p-4 sm:p-6 ${locked ? "border-dashed border-input" : "border-line"}`}>
      <div className="flex items-center gap-3">
        <span className={`flex size-8 items-center justify-center rounded-full text-[13px] font-bold ${done ? "bg-kept-soft text-kept" : locked ? "bg-muted text-muted-foreground" : "bg-orange-soft text-ink"}`}>
          {done ? <Check aria-hidden="true" className="size-4" weight="bold" /> : n}
        </span>
        <h2 className={`text-[20px] font-bold ${locked ? "text-muted-foreground" : ""}`} id={`step-${n}`}>
          {title}
        </h2>
      </div>
      <div className="mt-4 sm:pl-11">{locked ? <p className="text-muted-foreground">{locked}</p> : children}</div>
    </section>
  );
}

function BriefSummary({ brief }: { brief: SoundDesignBrief }) {
  const d = brief.direction;
  return (
    <div className="grid grid-cols-1 gap-6 text-[14px] md:grid-cols-2">
      <div>
        <p className="mb-1.5 font-semibold">Suggestions sent to the model</p>
        <p className="text-muted-foreground">
          Style <b className="text-ink">{d.name}</b>: {d.texture}; {d.envelope}; {d.hierarchy}.
        </p>
        <ul className="mt-2 space-y-1">
          {brief.cues.map((c) => (
            <li key={c.eventId}>
              <b>{c.role}</b> <span className="text-muted-foreground">{c.descriptors}{c.avoid ? `, avoid ${c.avoid}` : ""}</span>
              {c.notes.map((n) => (
                <span className="block pl-3 text-[13px] text-muted-foreground" key={n}>
                  Note: {n}
                </span>
              ))}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-1.5 font-semibold">Settings CueBound applies itself</p>
        <table className="stack-table w-full text-left text-[13px]">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Event</th>
              <th className="py-1 font-medium">Loudness</th>
              <th className="py-1 font-medium">Max length</th>
              <th className="py-1 font-medium">Sounds</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular">
            {brief.cues.map((c) => (
              <tr className="border-t border-line" key={c.eventId}>
                <td className="py-1 font-sans" data-label="Event">{c.role}</td>
                <td data-label="Loudness">{db(c.processing.gainDb)}</td>
                <td data-label="Max length">{c.processing.maxDurationMs} ms</td>
                <td data-label="Sounds">{c.assets.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PromptCompare({ cmp, fromLabel }: { cmp: Comparison; fromLabel?: string }) {
  const f = cmp.fragment;
  const lead = f && cmp.withBrief ? cmp.withBrief.slice(0, cmp.withBrief.indexOf(f)).trim() : cmp.withoutBrief;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-paper p-4">
          <p className="mb-2 text-[13px] font-semibold text-muted-foreground">Prompt without the brief</p>
          <p className="text-[15px]">{cmp.withoutBrief}</p>
        </div>
        <div className="rounded-2xl border border-orange/40 bg-[#fff7ef] p-4">
          <p className="mb-2 text-[13px] font-semibold text-orange-deep">Prompt with the brief</p>
          <p className="text-[15px]">{lead}</p>
          {f ? (
            <blockquote className="mt-3 text-[13px] leading-relaxed">
              <span className="mb-1 block text-[12px] font-semibold text-orange-deep">From the brief, sent as quoted style data:</span>
              <mark className="rounded-sm bg-brand-lighter box-decoration-clone px-1 py-0.5 text-ink">{f}</mark>
            </blockquote>
          ) : (
            <p className="mt-2 text-[13px] text-muted-foreground">No brief is loaded yet, so both prompts are the same.</p>
          )}
        </div>
      </div>
      <p className="text-[14px]">
        Loudness and length copied from: <b>{fromLabel ?? "nothing, CueBound defaults"}</b>{" "}
        <span className="font-mono text-[13px] text-muted-foreground">
          ({db(cmp.processing.gainDb)}, up to {cmp.processing.maxDurationMs}&nbsp;ms)
        </span>
      </p>
    </div>
  );
}

export function Continue() {
  const { S, run, go, pricePerS } = useKit();
  const retrieved = [...S.receipts].reverse().find((r) => r.status.startsWith("retrieved"));
  const pinned = retrieved && S.briefs.find((b) => b.revision === retrieved.revision)?.brief;
  const ownRef = [...S.receipts].reverse().find((r) => r.reference && !r.status.startsWith("retrieved"))?.reference;

  const [reference, setReference] = useState(retrieved?.reference ?? "");
  const [limit, setLimit] = useState("0.50");
  const [got, setGot] = useState<{ brief: SoundDesignBrief; provenance: Provenance; freshInstance?: boolean } | null>(null);
  const [dir, setDir] = useState("");
  const [check, setCheck] = useState<BaselineResult | null>(null);
  const [label, setLabel] = useState("Dash");
  const [description, setDescription] = useState("Quick horizontal dash burst");
  const [from, setFrom] = useState("");
  const [cmp, setCmp] = useState<Comparison | null>(null);
  const [v2, setV2] = useState<ExportResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const brief = got?.brief ?? pinned ?? null;
  const provenance = got?.provenance ?? (retrieved?.raw as Provenance | undefined);
  const fresh = got?.freshInstance ?? (retrieved ? retrieved.status === "retrieved+verified-by-consumer" : undefined);
  const eventId = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^[^a-z]+|_+$/g, "") || "dash";

  // Step 2 is done when every audio file the brief names is imported with a matching fingerprint.
  const baseline = new Map(S.takes.filter((t) => t.jobId === "baseline").map((t) => [t.finalPath, t.sha256]));
  const assets = brief?.cues.flatMap((c) => c.assets) ?? [];
  const imported = assets.length > 0 && assets.every((a) => baseline.get(`baseline/${a.file.slice("audio/".length)}`) === a.sha256);
  const matched = check ? check.ok : imported;

  const newCue = S.cues.find((c) => c.eventId === eventId);
  const newKept = newCue ? kept(S, newCue) : [];
  const rendering = newCue ? inFlight(S, newCue).length > 0 : false;

  useEffect(() => {
    if (brief && !from) setFrom(brief.cues.find((c) => c.eventId === "jump")?.eventId ?? brief.cues[0]?.eventId ?? "");
  }, [brief, from]);

  useEffect(() => {
    if (!brief || !description.trim()) return;
    const t = setTimeout(() => {
      api.extendPreview({ eventId, label: label.trim(), description: description.trim(), processingFrom: from || undefined }).then(setCmp, () => setCmp(null));
    }, 400);
    return () => clearTimeout(t);
  }, [brief, eventId, label, description, from]);

  const retrieve = async () => {
    setBusy("retrieve");
    const r = await run("Fetching the brief from the DKG", () => api.continueFrom(reference.trim(), Number(limit)));
    setBusy(null);
    if (r) setGot(r);
  };
  const importPack = async () => {
    setBusy("import");
    const r = await run("Checking the pack", () => api.importBaseline(dir.trim()));
    setBusy(null);
    if (r) setCheck(r);
  };
  const generate = () =>
    run("Asking Livepeer for the new sound", () => api.extend({ eventId, label: label.trim(), description: description.trim(), processingFrom: from || undefined, useBrief: true }));
  const buildV2 = async () => {
    setBusy("export");
    const r = await run("Building pack v2", () => api.exportPack());
    setBusy(null);
    if (r) setV2(r);
  };

  const v2Hashes = new Map(v2?.files.map((f) => [f.path, f.sha256]));
  const same = assets.filter((a) => v2Hashes.get(a.file) === a.sha256).length;
  const added = v2?.files.filter((f) => f.path.includes(eventId)).map((f) => f.path) ?? [];
  const fromCue = brief?.cues.find((c) => c.eventId === from);
  const cost = newCue ? estimateUsd([newCue], 1, pricePerS) : 0.0315;

  return (
    <>
    <div className="relative z-10 mx-auto max-w-[1100px] pb-36 sm:pb-56">
      <SceneStrip />
      <Heading
        icon="brief"
        lead="Paste the reference a teammate gave you. CueBound fetches the sound brief from the DKG, checks the pack against it, and adds the brief’s style notes to the prompt for a new sound."
        title="Continue from a saved sound brief"
      />

      <div className="space-y-5">
        <Step done={!!brief} n={1} title="Get the brief">
          {!brief ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void retrieve();
              }}
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold">Brief reference</span>
                <input
                  className="rounded-xl border border-input bg-paper px-3.5 py-2.5 font-mono text-[13px]"
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="dkg-brief:cuebound-…/brief-r1?revision=1&sha256=…"
                  value={reference}
                />
              </label>
              {ownRef && (
                <button className="block text-left text-[13px] font-semibold text-orange-deep underline underline-offset-2 transition-transform active:scale-[0.96] pointer-coarse:min-h-11" onClick={() => setReference(ownRef)} type="button">
                  Use the brief saved in this project
                </button>
              )}
              {!S.project && (
                <label className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[14px]">
                  <span className="font-semibold">Spend limit for this session</span>
                  <span className="relative">
                    <span className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
                    <input className="w-28 rounded-xl border border-input bg-paper py-2 pr-3 pl-7 font-mono" inputMode="decimal" onChange={(e) => setLimit(e.target.value)} type="number" value={limit} />
                  </span>
                </label>
              )}
              <DotMorphButton busy={busy === "retrieve"} disabled={!reference.trim()} label="Fetch the brief" type="submit" />
            </form>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start gap-x-10 gap-y-3 rounded-2xl bg-kept-soft p-4 text-[14px]">
                <p className="w-full font-semibold text-kept">
                  ✓ {fresh ? "Retrieved from the DKG by an app instance that started empty." : "Retrieved from the DKG."} Revision {brief.revision}, approved by {brief.approval.by}.
                </p>
                {provenance && (
                  <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-[140px_1fr]">
                    <dt className="text-muted-foreground">Read from</dt>
                    <dd>{LAYER[provenance.layer] ?? provenance.layer}</dd>
                    {provenance.ual && (
                      <>
                        <dt className="mt-1.5 text-muted-foreground sm:mt-0">UAL</dt>
                        <dd className="font-mono text-[12px] break-all" title={provenance.ual}>
                          {provenance.ual}
                        </dd>
                      </>
                    )}
                    <dt className="mt-1.5 text-muted-foreground sm:mt-0">Node</dt>
                    <dd className="font-mono text-[12px] break-all">
                      {provenance.node?.url} {provenance.node?.peerId ? <span title={provenance.node.peerId}>· peer {provenance.node.peerId.slice(0, 12)}…</span> : ""}
                    </dd>
                    <dt className="mt-1.5 text-muted-foreground sm:mt-0">Fingerprint</dt>
                    <dd>
                      Matches the reference ✓ <span className="font-mono text-[12px] text-muted-foreground" title={retrieved?.digest}>{shortHash(retrieved?.digest)}…</span>
                    </dd>
                  </dl>
                )}
                {fresh !== undefined && (
                  <p className="w-full max-w-[75ch] text-[13px] text-muted-foreground">
                    {fresh
                      ? "This app had no project data before, so the brief above came only from the DKG node listed."
                      : "This app already held project data, so this isn’t a clean handoff from an empty instance."}
                  </p>
                )}
              </div>
              <BriefSummary brief={brief} />
            </div>
          )}
        </Step>

        <Step done={matched} locked={!brief ? "Fetch the brief first." : undefined} n={2} title="Import the approved pack">
          <p className="mb-3 max-w-[65ch] text-[14px] text-muted-foreground">
            CueBound compares every audio file with the fingerprints in the brief. New sounds are blocked until all of them match, so the kit you build on is exactly the one that
            was approved.
          </p>
          <span className="mb-1.5 block text-[14px] font-semibold" id="pack-folder">
            Folder of the approved pack
          </span>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void importPack();
            }}
          >
            <input
              aria-labelledby="pack-folder"
              className="min-w-0 flex-1 basis-64 rounded-xl border border-input bg-paper px-3.5 py-2.5 font-mono text-[13px]"
              onChange={(e) => setDir(e.target.value)}
              placeholder="/home/you/Downloads/cuebound_pack"
              value={dir}
            />
            <DotMorphButton busy={busy === "import"} disabled={!dir.trim()} label="Import and check" tone="outline" type="submit" />
          </form>
          {(check || imported) && (
            <table className="stack-table mt-4 w-full text-left text-[13px]">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1.5 font-medium">File</th>
                  <th className="py-1.5 font-medium">Fingerprint in the brief</th>
                  <th className="py-1.5 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {(check?.files ?? assets.map((a) => ({ file: a.file, expected: a.sha256, actual: a.sha256, status: "match" as const }))).map((f) => (
                  <tr className="border-t border-line" key={f.file}>
                    <td className="py-1.5 font-mono" data-label="File">{f.file}</td>
                    <td className="font-mono text-muted-foreground" data-label="Fingerprint in the brief" title={f.expected}>{shortHash(f.expected)}…</td>
                    <td className={f.status === "match" ? "text-kept" : "text-destructive"} data-label="Result" title={f.actual ?? undefined}>
                      {f.status === "match" ? "✓ match" : f.status === "missing" ? "✗ missing" : `✗ mismatch (${shortHash(f.actual)}…)`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {check && !check.ok && <p className="mt-3 font-medium text-destructive">New sounds are blocked until every file matches. Check you picked the pack this brief approved.</p>}
        </Step>

        <Step done={newKept.length > 0} locked={!brief ? "Fetch the brief first." : !matched ? "Import the pack first. New sounds build on the approved files." : undefined} n={3} title={`Add a sound for a new mechanic: ${label || "Dash"}`}>
          <div className="mb-4 grid grid-cols-1 gap-3 text-[14px] lg:grid-cols-[200px_1fr_240px]">
            <label className="flex flex-col gap-1.5">
              <span className="font-semibold">Name</span>
              <input className="rounded-xl border border-input bg-paper px-3 py-2" onChange={(e) => setLabel(e.target.value)} value={label} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-semibold">What happens</span>
              <input className="rounded-xl border border-input bg-paper px-3 py-2" onChange={(e) => setDescription(e.target.value)} value={description} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-semibold">Copy loudness and length from</span>
              <select className="rounded-xl border border-input bg-paper px-3 py-2" onChange={(e) => setFrom(e.target.value)} value={from}>
                {brief?.cues.map((c) => (
                  <option key={c.eventId} value={c.eventId}>
                    {c.role}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {cmp && <PromptCompare cmp={cmp} fromLabel={fromCue?.role} />}
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <DotMorphButton
              busy={rendering}
              label={rendering ? "Livepeer is rendering…" : `${newKept.length ? "Make another" : `Make ${label || "it"} on Livepeer`} · about ${usd(cost)}`}
              onClick={generate}
              tone={newKept.length ? "outline" : "primary"}
            />
            <span className="min-w-48 flex-1 text-[13px] text-muted-foreground">Sent with the brief’s style data. Your existing sounds don’t change.</span>
          </div>
          {newCue && (
            <ul className="mt-4 space-y-2">
              {S.takes
                .filter((t) => t.cueId === newCue.id && t.finalPath && t.status !== "rejected")
                .map((t, i) => (
                  <TakeRow cue={newCue} ink={eventColor(S.cues, newCue).ink} key={t.id} n={i + 1} take={t} />
                ))}
              <JobRows cue={newCue} />
            </ul>
          )}
        </Step>

        <Step done={!!v2} locked={!newKept.length ? `Keep a take for ${label || "the new sound"} first.` : undefined} n={4} title="Export pack v2">
          {!v2 ? (
            <DotMorphButton busy={busy === "export"} label="Build pack v2" onClick={buildV2} />
          ) : (
            <div className="space-y-3 text-[14px]">
              <p className={`tabular flex items-center gap-2 font-semibold ${same === assets.length ? "text-kept" : "text-destructive"}`}>
                {same === assets.length ? <Check aria-hidden="true" className="size-4" weight="bold" /> : <X aria-hidden="true" className="size-4" weight="bold" />}
                Existing sounds unchanged: {same} of {assets.length} {plural(assets.length, "file")} identical
              </p>
              <p className="text-muted-foreground">
                New in v2: <span className="font-mono text-[13px] text-ink">{added.join(", ") || "none"}</span>
              </p>
              <div className="flex flex-wrap items-center gap-4">
                {v2.zipPath && (
                  <a className="inline-flex min-h-11 items-center gap-2.5 rounded-full bg-ink px-5 font-semibold text-ivory transition-transform active:scale-[0.96]" download href={mediaUrl(v2.zipPath)}>
                    <DownloadSimple aria-hidden="true" className="size-4" weight="bold" /> Download pack v2
                  </a>
                )}
                <button className="text-[13px] font-semibold text-orange-deep underline underline-offset-2 transition-transform active:scale-[0.96] pointer-coarse:min-h-11" onClick={() => go("export")} type="button">
                  Save a new brief revision
                </button>
              </div>
            </div>
          )}
        </Step>
      </div>
    </div>
    </>
  );
}
