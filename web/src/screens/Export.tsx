import { Check, DownloadSimple, CircleNotch, X } from "@phosphor-icons/react";
import { SceneStrip } from "@/components/app/SceneStrip";
import { useEffect, useState } from "react";
import AIApproval from "@/components/smoothui/ai-approval";
import ButtonCopy from "@/components/smoothui/button-copy";
import { DotMorphButton } from "@/components/smoothui/dot-morph-button";
import FileTree, { type FileTreeItem } from "@/components/smoothui/file-tree";
import { api, errorText, mediaUrl, type ExportResult, type Receipt, type SoundDesignBrief } from "@/api";
import { isComplete, kept, needed, plural, shortHash } from "@/kit";
import { Heading } from "@/screens/Start";
import { useKit } from "@/store";

const snippet = (id: string) => `# Autoload cuebound_pack/cuebound_sfx.gd as "Sfx", then:
func _on_${id}() -> void:
\tSfx.play("${id}")`;

const copy = (text: string) => navigator.clipboard.writeText(text);

function packTree(paths: string[], hashes?: Map<string, string>): FileTreeItem[] {
  const leaf = (path: string, name = path): FileTreeItem => ({
    id: path,
    name,
    type: "file",
    badge: hashes?.get(path) ? <span className="font-mono text-[11px] text-muted-foreground" title={hashes.get(path)}>{shortHash(hashes.get(path))}…</span> : undefined,
  });
  const audio = paths.filter((p) => p.startsWith("audio/")).sort();
  const rest = paths.filter((p) => !p.startsWith("audio/")).sort();
  return [
    {
      id: "cuebound_pack",
      name: "cuebound_pack",
      type: "folder",
      children: [{ id: "audio", name: "audio", type: "folder", children: audio.map((p) => leaf(p, p.slice(6))) }, ...rest.map((p) => leaf(p))],
    },
  ];
}

type Stage = "done" | "busy" | "todo" | "off";

function StageChips({ stages }: { stages: [string, Stage][] }) {
  return (
    <div className="@container/stages">
    <ol aria-label="Where the brief is" className="flex flex-wrap items-center gap-1.5 @max-[340px]/stages:flex-col @max-[340px]/stages:items-start">
      {stages.map(([name, s], i) => (
        <li className="flex items-center gap-1.5" key={name}>
          {i > 0 && <span aria-hidden="true" className="text-muted-foreground @max-[340px]/stages:rotate-90">→</span>}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium whitespace-nowrap @max-[340px]/stages:whitespace-normal ${
              s === "done" ? "bg-kept-soft text-kept" : s === "busy" ? "bg-brand-lighter text-orange-deep" : s === "off" ? "border border-dashed border-input text-muted-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {s === "done" && <Check aria-hidden="true" className="size-3.5" weight="bold" />}
            {s === "busy" && <CircleNotch aria-hidden="true" className="size-3.5 animate-spin" weight="bold" />}
            {name}
            {s === "off" && <span className="text-[11px]">· not chosen for this revision</span>}
            <span className="sr-only">{s === "done" ? " (done)" : s === "busy" ? " (in progress)" : s === "off" ? "" : " (not yet)"}</span>
          </span>
        </li>
      ))}
    </ol>
    </div>
  );
}

function BriefForm({ draft, setDraft }: { draft: SoundDesignBrief; setDraft: (b: SoundDesignBrief) => void }) {
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const d = draft.direction;
  const input = "w-full rounded-lg border border-input bg-paper px-3 py-1.5 text-[14px]";
  const setCue = (i: number, patch: Partial<SoundDesignBrief["cues"][number]>) => setDraft({ ...draft, cues: draft.cues.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  return (
    <div className="space-y-5">
      <fieldset className="rounded-2xl border border-line bg-white p-4 sm:p-5">
        <legend className="px-1 text-[13px] font-semibold text-muted-foreground">Style</legend>
        <div className="grid grid-cols-1 items-center gap-x-4 gap-y-2 text-[14px] sm:grid-cols-[130px_1fr]">
          {(
            [
              ["name", "Name"],
              ["texture", "Feels like"],
              ["envelope", "Starts and ends"],
              ["hierarchy", "What stands out"],
            ] as const
          ).map(([k, label]) => (
            <label className="contents" key={k}>
              <span className="text-muted-foreground">{label}</span>
              <input className={input} onChange={(e) => setDraft({ ...draft, direction: { ...d, [k]: e.target.value } })} value={d[k]} />
            </label>
          ))}
        </div>
      </fieldset>

      {draft.cues.map((c, i) => (
        <fieldset className="rounded-2xl border border-line bg-white p-4 sm:p-5" key={c.eventId}>
          <legend className="px-1 text-[13px] font-semibold text-muted-foreground">
            Event <code className="text-ink">{c.eventId}</code>
          </legend>
          <button
            aria-label={`Leave ${c.eventId} out of the brief`}
            className="-mt-2 ml-auto flex w-fit items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium sm:float-right text-muted-foreground transition-transform active:scale-[0.96] hover:bg-accent hover:text-destructive pointer-coarse:min-h-11"
            onClick={() => setDraft({ ...draft, cues: draft.cues.filter((_, j) => j !== i) })}
            type="button"
          >
            <X className="size-3.5" weight="bold" /> Leave out
          </button>
          <div className="grid grid-cols-1 items-center gap-x-4 gap-y-2 text-[14px] sm:grid-cols-[130px_1fr]">
            <label className="contents">
              <span className="text-muted-foreground">Name</span>
              <input className={input} onChange={(e) => setCue(i, { role: e.target.value })} value={c.role} />
            </label>
            <label className="contents">
              <span className="text-muted-foreground">Should sound like</span>
              <input className={input} onChange={(e) => setCue(i, { descriptors: e.target.value })} value={c.descriptors} />
            </label>
            <label className="contents">
              <span className="text-muted-foreground">Avoid</span>
              <input className={input} onChange={(e) => setCue(i, { avoid: e.target.value })} placeholder="Optional, for example: harsh, metallic" value={c.avoid} />
            </label>
            <span className="self-start pt-1.5 text-muted-foreground">Notes</span>
            <div className="space-y-1.5">
              {c.notes.map((n, j) => (
                <div className="flex items-center gap-2" key={j}>
                  <span className="flex-1 rounded-lg bg-paper px-3 py-1.5">{n}</span>
                  <button aria-label="Remove this note" className="rounded p-1 text-muted-foreground transition-transform active:scale-[0.96] hover:text-destructive pointer-coarse:grid pointer-coarse:size-11 pointer-coarse:place-items-center" onClick={() => setCue(i, { notes: c.notes.filter((_, x) => x !== j) })} type="button">
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = (noteDraft[c.eventId] ?? "").trim();
                  if (v) setCue(i, { notes: [...c.notes, v] });
                  setNoteDraft({ ...noteDraft, [c.eventId]: "" });
                }}
              >
                <input
                  aria-label={`Add a note for ${c.eventId}`}
                  className={input}
                  onChange={(e) => setNoteDraft({ ...noteDraft, [c.eventId]: e.target.value })}
                  placeholder="Optional: a lesson worth keeping for next time"
                  value={noteDraft[c.eventId] ?? ""}
                />
                <button className="shrink-0 rounded-lg border border-input px-3 text-[13px] font-medium transition-transform active:scale-[0.96] pointer-coarse:min-h-11" type="submit">
                  Add
                </button>
              </form>
            </div>
            <span className="self-start text-muted-foreground">Audio fingerprints</span>
            <ul className="space-y-0.5 font-mono text-[12px]">
              {c.assets.map((a) => (
                <li key={a.file}>
                  {a.file} <span className="text-muted-foreground" title={a.sha256}>{shortHash(a.sha256)}…</span>
                </li>
              ))}
            </ul>
          </div>
        </fieldset>
      ))}
      <p className="text-[13px] text-muted-foreground">
        Each fingerprint is calculated from a kept audio file, so a teammate can prove they have exactly the same files. The style and the descriptions go into future prompts as
        suggestions; the model may not follow them. Loudness and length settings travel with the brief but can’t be edited here.
      </p>
    </div>
  );
}

function SaveBrief() {
  const { S, run } = useKit();
  const [draft, setDraft] = useState<SoundDesignBrief | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [by, setBy] = useState("");
  const [scope, setScope] = useState<"private" | "shared" | "published">("shared");
  const [busy, setBusy] = useState<"approve" | "store" | "share" | "publish" | null>(null);
  const [review, setReview] = useState(false);
  const [round, setRound] = useState(0);
  const anyKept = S.cues.some((c) => kept(S, c).length);
  const latest = S.briefs.at(-1);
  const receipts = (rev?: number) => S.receipts.filter((r) => r.revision === rev);
  const has = (rev: number | undefined, status: string) => receipts(rev).some((r) => r.status === status);
  const showForm = !latest || review;

  useEffect(() => {
    if (!anyKept || !S.project?.directionId || !showForm) return;
    api.briefPreview().then(
      (b) => {
        setDraft(b);
        setBy((v) => v || b.approval.by);
        setProblem(null);
      },
      (e) => setProblem(errorText(e)),
    );
  }, [anyKept, S.project?.directionId, showForm, S.takes.length]);

  const store = async (rev: number) => {
    setBusy("store");
    const r = await run("Saving on your DKG node", () => api.store(rev));
    setBusy(null);
    return r;
  };
  const share = async (rev: number) => {
    setBusy("share");
    await run("Sharing with peers", () => api.share(rev));
    setBusy(null);
  };
  // Publishing writes to the public testnet for good, so it is its own step after the brief is saved and shared.
  const publish = async (rev: number) => {
    setBusy("publish");
    await run("Publishing to testnet", () => api.publish(rev));
    setBusy(null);
  };

  const approveAll = async () => {
    if (!draft) return;
    setBusy("approve");
    const ok = await run("Approving the brief", () => api.approve({ ...draft, approval: { ...draft.approval, by: by.trim() || "developer", scope } }));
    if (!ok) return setBusy(null);
    setReview(false);
    const stored = await store(ok.revision);
    if (stored && scope !== "private") await share(ok.revision);
  };

  if (!anyKept) {
    return <p className="rounded-2xl border border-dashed border-input p-5 text-muted-foreground">Keep at least one take first. The brief records the sounds you approved and the style they were made with.</p>;
  }

  const rev = latest?.revision;
  const lastScope = latest?.brief.approval.scope;
  const pendingPublish = receipts(rev).some((r) => r.status.startsWith("pending:")) && !has(rev, "published+readback-verified");
  const stages: [string, Stage][] = [
    ["Approved", latest ? "done" : busy === "approve" ? "busy" : "todo"],
    ["Saved on your DKG node", has(rev, "stored+readback-verified") ? "done" : busy === "store" ? "busy" : "todo"],
    ["Shared with peers", has(rev, "shared+readback-verified") ? "done" : busy === "share" ? "busy" : "todo"],
    ["Published to testnet", has(rev, "published+readback-verified") ? "done" : busy === "publish" || pendingPublish ? "busy" : lastScope === "published" ? "todo" : "off"],
  ];
  const ref = [...receipts(rev)].reverse().find((r: Receipt) => r.reference)?.reference;
  const published = receipts(rev).find((r) => r.status === "published+readback-verified");
  const publishedRaw = published?.raw as { explorerTx?: string | null; publish?: { ual?: string; txHash?: string; blockNumber?: number } } | undefined;
  const ual = publishedRaw?.publish?.ual ?? published?.reference.match(/&ual=([^&]+)/)?.[1];

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-8">
      <div>
        {showForm ? (
          draft ? (
            <BriefForm draft={draft} setDraft={setDraft} />
          ) : (
            <p className="text-muted-foreground">{problem ? `CueBound couldn’t prepare the brief. ${problem}` : "Preparing the brief from your kept takes…"}</p>
          )
        ) : (
          <div className="rounded-2xl border border-line bg-white p-5">
            <p className="font-semibold">
              Revision {latest!.revision}: {latest!.brief.direction.name}, {latest!.brief.cues.length} {plural(latest!.brief.cues.length, "event")}
            </p>
            <p className="mt-1 text-[14px] text-muted-foreground">
              {latest!.brief.cues.map((c) => `${c.role} (${c.assets.length} ${plural(c.assets.length, "sound")})`).join(", ")}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Approved by {latest!.brief.approval.by}.{" "}
              {has(rev, "published+readback-verified")
                ? "Published on the OriginTrail testnet, and read back from it to check it."
                : has(rev, "shared+readback-verified")
                ? "Shared with your node’s peers, and read back to check it."
                : has(rev, "stored+readback-verified")
                  ? "Saved on your DKG node and read back to check it. Not shared yet."
                  : "Not saved on the DKG yet."}
            </p>
            <button className="mt-3 text-left text-[13px] font-semibold text-orange-deep underline underline-offset-2 transition-transform active:scale-[0.96] pointer-coarse:min-h-11" onClick={() => setReview(true)} type="button">
              Changed the kit? Review a new revision
            </button>
          </div>
        )}
      </div>

      <div className="space-y-5">
        {showForm && draft && (
          <div className="space-y-3 rounded-2xl border border-line bg-white p-5">
            <label className="flex flex-col gap-1.5 text-[14px]">
              <span className="font-semibold">Approved by</span>
              <input className="rounded-lg border border-input bg-paper px-3 py-1.5" onChange={(e) => setBy(e.target.value)} value={by} />
            </label>
            <fieldset className="space-y-1.5 text-[14px]">
              <legend className="mb-1 font-semibold">Who can read it</legend>
              <label className="flex items-start gap-2 pointer-coarse:min-h-11 pointer-coarse:py-1">
                <input checked={scope === "shared"} className="mt-1" name="scope" onChange={() => setScope("shared")} type="radio" />
                <span>
                  My node and its peers <span className="block text-[12px] text-muted-foreground">Your teammates’ nodes can fetch it. It is not published on chain.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 pointer-coarse:min-h-11 pointer-coarse:py-1">
                <input checked={scope === "private"} className="mt-1" name="scope" onChange={() => setScope("private")} type="radio" />
                <span>
                  Only my node <span className="block text-[12px] text-muted-foreground">A fresh session on this computer can still use it.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 pointer-coarse:min-h-11 pointer-coarse:py-1">
                <input checked={scope === "published"} className="mt-1" name="scope" onChange={() => setScope("published")} type="radio" />
                <span>
                  Everyone on testnet{" "}
                  <span className="block text-[12px] text-muted-foreground">
                    Published on the OriginTrail testnet as a knowledge asset with its own address (UAL). Public and permanent. Uses test ETH and test TRAC from your node’s wallet; publishing is a separate step after saving.
                  </span>
                </span>
              </label>
            </fieldset>
            <AIApproval
              key={round}
              onDecide={(o) => (o.id === "save" ? void approveAll() : setRound(round + 1))}
              options={[
                { id: "save", label: scope === "private" ? "Approve and save on my node" : "Approve, save and share", detail: "no Livepeer cost" },
                { id: "later", label: "Not yet" },
              ]}
              question={`Save revision ${draft.revision} of your sound brief?`}
            >
              A saved revision never changes. If you edit the kit later, you save a new revision.
            </AIApproval>
          </div>
        )}

        {(
          <div className="space-y-4 rounded-2xl border border-line bg-white p-5">
            {!latest && !busy && <p className="text-[13px] text-muted-foreground">After you approve, the brief goes through these stages:</p>}
            <StageChips stages={stages} />
            {latest && !has(rev, "stored+readback-verified") && !busy && (
              <DotMorphButton label="Save on my DKG node" onClick={() => store(rev!)} tone="outline" />
            )}
            {latest && has(rev, "stored+readback-verified") && !has(rev, "shared+readback-verified") && !busy && lastScope !== "private" && (
              <DotMorphButton label="Share with peers" onClick={() => share(rev!)} tone="outline" />
            )}
            {latest && has(rev, "shared+readback-verified") && !has(rev, "published+readback-verified") && !busy && lastScope === "published" && (
              <div className="space-y-1.5">
                <DotMorphButton label={pendingPublish ? "Check publication status" : "Publish to testnet"} onClick={() => publish(rev!)} tone="outline" />
                <p className="text-[12px] text-muted-foreground">
                  {pendingPublish
                    ? "The publication was submitted but not confirmed yet. Checking asks the node for its status; nothing is submitted twice."
                    : "Writes this revision to the OriginTrail testnet for good. Uses test ETH and test TRAC from your node’s wallet."}
                </p>
              </div>
            )}
            {published && ual && (
              <div>
                <p className="mb-1.5 text-[13px] font-semibold">Published on testnet</p>
                <div className="flex items-center gap-2 rounded-[1.625rem] bg-paper p-2 pl-4">
                  <code className="min-w-0 flex-1 truncate text-[12px]" title={ual}>
                    {ual}
                  </code>
                  <ButtonCopy className="size-9 min-h-9 min-w-9 pointer-coarse:size-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11 p-2" label="Copy the UAL" onCopy={() => copy(ual)} />
                </div>
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                  The knowledge asset’s address on the DKG.
                  {publishedRaw?.explorerTx && (
                    <>
                      {" "}
                      <a className="font-semibold text-orange-deep underline underline-offset-2" href={publishedRaw.explorerTx} rel="noreferrer" target="_blank">
                        View the transaction on Basescan
                      </a>
                      .
                    </>
                  )}
                </p>
              </div>
            )}
            {ref && (
              <div>
                <p className="mb-1.5 text-[13px] font-semibold">Brief reference</p>
                <div className="flex items-center gap-2 rounded-[1.625rem] bg-paper p-2 pl-4">
                  <code className="min-w-0 flex-1 truncate text-[12px]" title={ref}>
                    {ref}
                  </code>
                  <ButtonCopy className="size-9 min-h-9 min-w-9 pointer-coarse:size-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11 p-2" label="Copy the brief reference" onCopy={() => copy(ref)} />
                </div>
                <p className="mt-1.5 text-[13px] text-muted-foreground">Give this to a teammate. They paste it into “Continue from a saved sound brief”.</p>
              </div>
            )}
            {latest && (
              <details className="text-[12px] text-muted-foreground">
                <summary className="cursor-pointer font-medium text-ink pointer-coarse:py-3.5">Technical details</summary>
                <dl className="mt-2 space-y-1 break-all">
                  <div>Fingerprint: {latest.digest}</div>
                  {receipts(rev).map((r, i) => (
                    <div key={i}>
                      {r.status} · {r.layer} memory · {r.network} · {new Date(r.at).toLocaleString()}
                    </div>
                  ))}
                </dl>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function Export() {
  const { S, run } = useKit();
  const [result, setResult] = useState<ExportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const withTakes = S.cues.filter((c) => kept(S, c).length).sort((a, b) => (a.eventId < b.eventId ? -1 : 1));
  const planned = [...withTakes.flatMap((c) => [...kept(S, c).map((_, n) => `audio/${c.eventId}_${n + 1}.wav`), `${c.eventId}.tres`]), "cuebound_sfx.gd", "HOOKUP.md", "manifest.json"];
  const missing = S.cues.filter((c) => !isComplete(S, c));
  const SNIPPET = snippet(withTakes.find((c) => c.eventId === "jump")?.eventId ?? withTakes[0]?.eventId ?? "jump");
  const build = async () => {
    setBusy(true);
    const r = await run("Building the pack", () => api.exportPack());
    setBusy(false);
    if (r) setResult(r);
  };

  return (
    <>
    <div className="relative z-10 space-y-10 pb-36 sm:space-y-14 sm:pb-56">
      <SceneStrip />
      <section aria-labelledby="pack-title">
        <Heading icon="export" lead="The pack holds the takes you kept, one Godot resource per event, a script that plays them and a short hookup guide." title="Export your Godot pack">
          {result?.zipPath ? (
            <a className="inline-flex min-h-11 items-center gap-2.5 rounded-full bg-ink px-5 font-semibold text-[15px] text-ivory transition-transform active:scale-[0.96]" download href={mediaUrl(result.zipPath)}>
              <DownloadSimple aria-hidden="true" className="size-4" weight="bold" /> Download Godot pack
            </a>
          ) : (
            <DotMorphButton busy={busy} disabled={!withTakes.length} label={result ? "Build again" : "Build the Godot pack"} onClick={build} />
          )}
        </Heading>
        <h2 className="sr-only" id="pack-title">
          Pack
        </h2>
        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 md:gap-8">
          <div className="rounded-2xl border border-line bg-white p-4">
            <p className="mb-2 px-2 text-[13px] font-semibold text-muted-foreground">{result ? "Built just now" : "What the pack will contain"}</p>
            {withTakes.length ? (
              <FileTree
                defaultExpanded={["cuebound_pack", "audio"]}
                items={packTree(result ? result.files.map((f) => f.path) : planned, result ? new Map(result.files.map((f) => [f.path, f.sha256])) : undefined)}
                key={result ? "built" : "plan"}
                showLines
              />
            ) : (
              <p className="px-2 pb-2 text-muted-foreground">Nothing to pack yet. Keep a take for at least one event.</p>
            )}
          </div>

          <div className="space-y-6">
            {result && (
              <div className="rounded-2xl bg-kept-soft p-4 text-[14px]">
                <p className="font-semibold text-kept">✓ Pack built with {result.files.length} files</p>
                {result.zipPath ? (
                  <p className="mt-1 text-muted-foreground">Download it, or use the folder directly:</p>
                ) : (
                  <p className="mt-1 text-muted-foreground">No zip this time ({result.zipReason ?? "the server didn’t make one"}). Use the folder:</p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2.5 py-1.5 text-[12px]" title={result.dir}>
                    {result.dir}
                  </code>
                  <ButtonCopy className="size-9 min-h-9 min-w-9 pointer-coarse:size-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11 p-2" label="Copy the pack folder path" onCopy={() => copy(result.dir)} />
                </div>
                {result.zipPath && (
                  <button className="mt-2 text-[13px] font-semibold text-orange-deep underline underline-offset-2 transition-transform enabled:active:scale-[0.96] pointer-coarse:min-h-11" disabled={busy} onClick={build} type="button">
                    Build again
                  </button>
                )}
              </div>
            )}

            <div className={`rounded-2xl p-4 text-[14px] ${missing.length ? "bg-[#fff7ef]" : "bg-white"} border border-line`}>
              <p className="font-semibold">{missing.length ? "What’s missing" : "Every event is ready ✓"}</p>
              {missing.length ? (
                <>
                  <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
                    {missing.map((c) => {
                      const k = kept(S, c).length;
                      return <li key={c.id}>{k ? `${c.label} needs ${needed(c) - k} more kept take.` : `${c.label} has no kept take yet.`}</li>;
                    })}
                  </ul>
                  <p className="mt-2 text-[13px] text-muted-foreground">You can still build the pack. Those events stay silent in the game and print one warning.</p>
                </>
              ) : null}
            </div>

            <div>
              <p className="mb-2 font-semibold">Connect it in Godot</p>
              <ol className="mb-3 list-decimal space-y-1 pl-5 text-[14px] text-muted-foreground">
                <li>Copy the cuebound_pack folder next to project.godot.</li>
                <li>Add cuebound_sfx.gd as an autoload named Sfx.</li>
                <li>Call Sfx.play with the event name where the action happens.</li>
              </ol>
              <div className="flex items-start gap-2 rounded-xl bg-ink p-4 text-ivory">
                <pre className="min-w-0 flex-1 overflow-x-auto font-mono text-[13px] leading-relaxed">{SNIPPET}</pre>
                <ButtonCopy className="size-9 min-h-9 min-w-9 pointer-coarse:size-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11 border-ivory/20 bg-ink p-2 text-ivory" label="Copy the hookup code" onCopy={() => copy(SNIPPET)} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="brief-title" className="border-t border-line pt-8 sm:pt-10">
        <div className="mb-6 max-w-[760px]">
          <h2 className="text-[clamp(1.375rem,1rem+1.6vw,28px)] font-bold tracking-tight" id="brief-title">
            Save your sound brief
          </h2>
          <p className="mt-1.5 max-w-[65ch] text-[15px] leading-relaxed text-muted-foreground">
            The brief is saved to the OriginTrail DKG, a shared knowledge graph that your node and your teammates’ nodes can read. A teammate or a fresh session can then
            fetch it and send the same style notes with the prompts for new sounds. Not in the brief: your clip, your full prompts and the takes you skipped. Check every field
            below: this is exactly what gets saved.
          </p>
        </div>
        <SaveBrief />
      </section>
    </div>
    </>
  );
}
