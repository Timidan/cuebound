import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import DynamicIsland from "@/components/smoothui/dynamic-island";
import type { Job, State } from "@/api";
import { ACTIVE, plural } from "@/kit";
import { useStore } from "@/store";

type Batch = { jobs: Job[]; what: string };

// Jobs created within a few seconds of the oldest running one belong to the same request.
function currentBatch(S: State): Batch | null {
  const active = S.jobs.filter((j) => ACTIVE.includes(j.status));
  if (!active.length) return null;
  const t0 = Math.min(...active.map((j) => Date.parse(j.createdAt)));
  const jobs = S.jobs.filter((j) => Date.parse(j.createdAt) >= t0 - 5000);
  const cueIds = [...new Set(jobs.map((j) => j.cueId))];
  const what = cueIds.length === 1 ? (S.cues.find((c) => c.id === cueIds[0])?.label ?? "an event") : `${cueIds.length} events`;
  return { jobs, what };
}

export function RenderIsland() {
  const { S, setPanelOpen } = useStore();
  const [done, setDone] = useState<string | null>(null);
  const last = useRef<Batch | null>(null);
  const batch = S ? currentBatch(S) : null;

  useEffect(() => {
    if (batch) {
      last.current = batch;
      setDone(null);
      return;
    }
    const b = last.current;
    if (!b || !S) return;
    last.current = null;
    const ids = new Set(b.jobs.map((j) => j.id));
    const finished = S.jobs.filter((j) => ids.has(j.id));
    const ok = finished.filter((j) => j.status === "done").length;
    const bad = finished.length - ok;
    setDone(bad ? `${ok} of ${finished.length} ${plural(finished.length, "take")} ready for ${b.what}. ${bad} didn’t finish.` : `${ok} new ${plural(ok, "take")} for ${b.what} ${ok === 1 ? "is" : "are"} ready`);
    const t = setTimeout(() => setDone(null), 5000);
    return () => clearTimeout(t);
  }, [batch?.jobs.map((j) => j.id + j.status).join(), S]); // eslint-disable-line react-hooks/exhaustive-deps

  let view: { key: string; body: React.ReactNode; label: string } | null = null;
  if (batch) {
    const total = batch.jobs.length;
    const finished = batch.jobs.filter((j) => !ACTIVE.includes(j.status)).length;
    const now = batch.jobs.find((j) => j.status === "running") ?? batch.jobs.find((j) => ACTIVE.includes(j.status));
    const line = `Livepeer is rendering ${total} ${plural(total, "take")} for ${batch.what}${total > 1 ? ` · ${Math.min(total, finished + 1)} of ${total}` : ""}`;
    view = {
      key: "busy",
      label: `${line}. Open the Livepeer activity.`,
      body: (
        <div className="flex items-center gap-3 py-2 pr-5 pl-3">
          <span className="relative flex size-7 items-center justify-center">
            <motion.span
              animate={{ opacity: [0.35, 1, 0.35], scale: [0.8, 1, 0.8] }}
              className="absolute inset-0 rounded-full bg-orange-soft/30"
              transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY }}
            />
            <span className="size-2.5 rounded-full bg-orange-soft" />
          </span>
          <div className="min-w-0">
            <p className="tabular truncate text-[13px] font-semibold">{line}</p>
            <p className="truncate font-mono text-[11px] text-ivory/65">
              mirelo-sfx · {now?.providerJobId ? `job ${now.providerJobId}` : "sending"} · {now?.status === "running" ? "rendering" : "waiting for a worker"}
            </p>
          </div>
          <div aria-hidden="true" className="ml-2 hidden h-1 w-20 shrink-0 overflow-hidden rounded-full bg-ivory/20 sm:block">
            <motion.div animate={{ width: `${(finished / total) * 100}%` }} className="h-full bg-orange-soft" initial={false} />
          </div>
        </div>
      ),
    };
  } else if (done) {
    view = {
      key: "done",
      label: `${done}. Open the Livepeer activity.`,
      body: (
        <div className="flex items-center gap-2.5 py-2 pr-5 pl-3.5 text-[13px] font-semibold">
          <span className="flex size-5 items-center justify-center rounded-full bg-kept text-[11px] text-white">✓</span>
          {done}
        </div>
      ),
    };
  }

  return (
    <div aria-live="polite" className="pointer-events-none fixed top-2.5 left-1/2 z-[60] -translate-x-1/2">
      <AnimatePresence initial={false}>
        {view && (
          <motion.div animate={{ opacity: 1, y: 0 }} className="pointer-events-auto" exit={{ opacity: 0, y: -12 }} initial={{ opacity: 0, y: -12 }}>
            <DynamicIsland className="max-w-[calc(100vw-1rem)]" label={view.label} onClick={() => setPanelOpen(true)} viewKey={view.key}>
              {view.body}
            </DynamicIsland>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
