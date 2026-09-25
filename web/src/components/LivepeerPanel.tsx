import { X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import AIToolCall, { type AIToolCallStatus } from "@/components/smoothui/ai-tool-call";
import Drawer, { DrawerClose } from "@/components/smoothui/drawer";
import { api, errorText, type CostReport, type Job } from "@/api";
import { usd, usdExact } from "@/kit";
import { useStore, type Seen } from "@/store";

const STATUS: Record<Job["status"], AIToolCallStatus> = {
  intent: "pending",
  submitted: "pending",
  running: "running",
  done: "success",
  failed: "error",
  unknown: "pending",
};
const WORD: Record<Job["status"], string> = {
  intent: "Saved, not sent yet",
  submitted: "Submitted",
  running: "Rendering",
  done: "Done",
  failed: "Failed",
  unknown: "Outcome unknown",
};
const SERVICE: Record<string, string> = { livepeer: "Livepeer", dkg: "DKG node", ffmpeg: "FFmpeg", ffprobe: "FFprobe", godot: "Godot", zip: "Zip" };
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function Prompt({ job }: { job: Job }) {
  const f = job.briefFragment;
  const at = f ? job.prompt.indexOf(f) : -1;
  if (at < 0) return <p className="whitespace-pre-wrap break-words">{job.prompt}</p>;
  return (
    <p className="whitespace-pre-wrap break-words">
      {job.prompt.slice(0, at)}
      <mark className="rounded bg-brand-lighter px-0.5 text-ink">{f}</mark>
      {job.prompt.slice(at + f!.length)}
    </p>
  );
}

function Timeline({ job, seen }: { job: Job; seen?: Seen[string] }) {
  const created = Date.parse(job.createdAt);
  const steps: [string, number | undefined, boolean][] = [
    ["Submitted", created, true],
    ["Rendering", seen?.live ? seen.running : undefined, job.status === "running" || job.status === "done"],
    [job.status === "failed" ? "Failed" : "Done", seen?.live ? seen.done : undefined, job.status === "done" || job.status === "failed"],
  ];
  const took = seen?.live && seen.done ? Math.round((seen.done - created) / 1000) : null;
  return (
    <div className="space-y-1">
      <ol className="flex flex-wrap items-center gap-1.5">
        {steps.map(([name, at, reached], i) => (
          <li className="flex items-center gap-1.5" key={name}>
            {i > 0 && <span aria-hidden="true" className="text-muted-foreground">→</span>}
            <span className={`tabular rounded-full px-2 py-0.5 text-[11px] font-medium ${reached ? "bg-kept-soft text-kept" : "bg-muted text-muted-foreground"}`}>
              {name}
              {reached && at ? ` ${clock(at)}` : ""}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground">
        {took != null ? `Took ${took} s, measured by this page.` : job.status === "done" ? "Finished before this page opened, so only the start time is known." : ""}
      </p>
    </div>
  );
}

function Call({ job }: { job: Job }) {
  const { S, seen, run } = useStore();
  const cue = S!.cues.find((c) => c.id === job.cueId);
  const direction = S!.directions.find((d) => d.id === job.directionId);
  const row = (k: string, v: React.ReactNode) => (
    <div className="grid grid-cols-1 gap-x-2 py-0.5 @min-[360px]/panel:grid-cols-[108px_1fr]">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="min-w-0 break-words">{v}</dd>
    </div>
  );
  return (
    <AIToolCall
      args={
        <dl className="font-sans">
          {row("Tool", <code>create_media</code>)}
          {row("Model", <code>{job.capability} · strict, no substitutes</code>)}
          {row("Length", `${job.durationS}\u00a0s of audio`)}
          {row("Idempotency key", <code className="text-[11px]">{job.id}</code>)}
          {row("Prompt", <Prompt job={job} />)}
        </dl>
      }
      name={`create_media · ${cue?.label ?? "removed event"}${job.providerJobId ? "" : " · not sent yet"}`}
      result={
        <dl>
          {row("Status", WORD[job.status])}
          {row("Livepeer job", job.providerJobId ? <code>{job.providerJobId}</code> : "No job id from Livepeer yet")}
          {row("Timeline", <Timeline job={job} seen={seen[job.id]} />)}
          {row("Cost", `${usdExact(job.costUsd)}, estimated from the list price`)}
          {direction && row("Style", direction.name)}
          {job.briefRevision && row("Sound brief", `Revision ${job.briefRevision}, quoted as style data (highlighted)`)}
          {job.error && row("Problem", <span className="text-destructive">{job.error}</span>)}
          {job.status === "unknown" &&
            row(
              "",
              <button className="font-semibold text-orange-deep underline underline-offset-2 transition-transform active:scale-[0.96]" onClick={() => run("Checking the job", () => api.job(job.id))} type="button">
                Ask Livepeer again
              </button>,
            )}
        </dl>
      }
      status={STATUS[job.status]}
      summary={`${WORD[job.status]} · about ${usdExact(job.costUsd)}`}
    />
  );
}

export function LivepeerPanel() {
  const { S, panelOpen, setPanelOpen, livepeer, livepeerNote, health } = useStore();
  const [report, setReport] = useState<CostReport | null>(null);
  const [reportNote, setReportNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Livepeer's cost report takes around 20 s, so it loads only when the panel is open.
  const loadReport = async () => {
    setLoading(true);
    try {
      setReport(await api.costReport());
      setReportNote(null);
    } catch (e) {
      setReportNote(`Not available: ${errorText(e)}`);
    }
    setLoading(false);
  };
  useEffect(() => {
    if (panelOpen && S?.project && !report && !loading) void loadReport();
  }, [panelOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!S) return null;
  const jobs = [...S.jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sent = jobs.filter((j) => j.providerJobId).length;
  const lat = livepeer?.latency;

  return (
    <Drawer
      className="data-[vaul-drawer-direction=right]:w-full data-[vaul-drawer-direction=right]:sm:w-[440px] data-[vaul-drawer-direction=right]:sm:max-w-[440px] bg-paper"
      description="Every sound in your kit is generated on the Livepeer network. Each row is one real call."
      modal={false}
      onOpenChange={setPanelOpen}
      open={panelOpen}
      side="right"
      title="Livepeer Agent activity"
    >
      <div className="@container/panel -mt-1 max-h-[calc(100dvh-120px)] space-y-5 overflow-y-auto pb-8 text-[13px]">
        <div className="flex items-center justify-between gap-4 py-5">
          <img alt="Livepeer" className="h-6 w-auto" src="/brand/livepeer-lockup-black.svg" />
          <DrawerClose aria-label="Close the Livepeer activity" className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-white transition-transform active:scale-[0.96] sm:hidden">
            <X aria-hidden="true" className="size-4" weight="bold" />
          </DrawerClose>
        </div>
        <section aria-label="The model" className="rounded-xl border border-line bg-white p-4">
          <p className="font-semibold">Sounds come from {livepeer?.capability ?? "mirelo-sfx"}</p>
          {livepeer ? (
            <dl className="mt-2 space-y-1 text-muted-foreground">
              <div>Model: <span className="text-ink">{livepeer.modelId}</span></div>
              <div>Called with <code className="text-ink">create_media</code> and <code className="text-ink">strict: true</code>, so the network can’t swap in another model.</div>
              {livepeer.pricePerSecond != null && (
                <div>
                  Price: <span className="text-ink">${livepeer.pricePerSecond} per second of audio</span>
                  {livepeer.priceSource === "static-registry" ? " (list price, not a live meter)" : ""}
                </div>
              )}
              {lat?.p50Ms != null && (
                <div>
                  Typical wait: <span className="text-ink">{(lat.p50Ms / 1000).toFixed(1)} s</span>, slow ones {((lat.p95Ms ?? 0) / 1000).toFixed(1)} s
                </div>
              )}
            </dl>
          ) : (
            <p className="mt-1 text-muted-foreground">{livepeerNote ?? "Asking Livepeer for the model card…"}</p>
          )}
        </section>

        <section aria-label="Cost" className="rounded-xl border border-line bg-white p-4">
          <div className="flex items-baseline justify-between">
            <p className="font-semibold">Cost this session</p>
            <button
              className="text-[12px] font-semibold text-orange-deep underline underline-offset-2 transition-transform enabled:active:scale-[0.96] disabled:opacity-50 pointer-coarse:min-h-11"
              disabled={loading}
              onClick={loadReport}
              type="button"
            >
              {loading ? "Asking Livepeer…" : "Refresh"}
            </button>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-muted-foreground">CueBound’s estimate</dt>
              <dd className="font-mono text-lg tabular">{usd(S.spentUsd)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">From Livepeer’s cost report</dt>
              <dd className="font-mono text-lg tabular">
                {report?.total_cost_usd != null ? (
                  usd(report.total_cost_usd)
                ) : (
                  <span className="font-sans text-sm text-muted-foreground">{loading ? "Asking Livepeer, about 20 s…" : (reportNote ?? (S.project ? "Not loaded" : "Starts with a project"))}</span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        <section aria-label="Calls">
          <p className="mb-2 font-semibold">
            {sent ? `${sent} ${sent === 1 ? "call" : "calls"} to the Livepeer network` : "No calls yet"}
            {jobs.length > sent && <span className="font-normal text-muted-foreground"> · {jobs.length - sent} not sent yet</span>}
          </p>
          {jobs.length ? (
            <div className="space-y-2">
              {jobs.map((j) => (
                <Call job={j} key={j.id} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">When you make takes or hear a style sample, each request to Livepeer shows up here with its prompt, job id, timing and cost.</p>
          )}
        </section>

        {health && (
          <section aria-label="Connections" className="text-[12px] text-muted-foreground">
            <p className="mb-1 font-semibold text-ink">Connections</p>
            <ul className="space-y-0.5">
              {Object.entries(health).map(([k, c]) => (
                <li key={k}>
                  <span className={c.ok ? "text-kept" : "text-destructive"}>{c.ok ? "✓" : "✗"}</span> {SERVICE[k] ?? k}: {c.detail}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Drawer>
  );
}
