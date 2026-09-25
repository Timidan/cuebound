import { Play } from "@phosphor-icons/react";
import { DryArt, SoftArt } from "@/components/app/StyleArt";
import { SceneStrip } from "@/components/app/SceneStrip";
import { useEffect, useRef } from "react";
import { DotMorphButton } from "@/components/smoothui/dot-morph-button";
import { Waveform } from "@/components/Waveform";
import { api, type Direction } from "@/api";
import { trigger } from "@/audio";
import { ACTIVE, estimateUsd, usd } from "@/kit";
import { Heading } from "@/screens/Start";
import { useKit } from "@/store";

export const DEFAULTS = [
  {
    name: "Soft & rounded",
    texture: "felt and wood, rounded and playful",
    envelope: "quick soft attack, short gentle tail",
    hierarchy: "jumps and pickups stay bright; only damage sounds harsh",
  },
  {
    name: "Dry & mechanical",
    texture: "dry, mechanical, clicky",
    envelope: "hard click attack, almost no tail",
    hierarchy: "movement is tight and clicky; damage is heavier and metallic",
  },
];

const ART: Record<number, { bg: string; ink: string; art: React.ReactNode }> = {
  0: {
    bg: "#fbf0d2",
    ink: "#7b5a02",
    art: <SoftArt />,
  },
  1: {
    bg: "#e1e9f2",
    ink: "#3f5f80",
    art: <DryArt />,
  },
};

export function Style() {
  const { S, run, go, pricePerS } = useKit();
  const seeded = useRef(false);
  const sampleCue = S.cues.find((c) => c.eventId === "pickup") ?? S.cues[0];

  useEffect(() => {
    if (S.project && !S.directions.length && !seeded.current) {
      seeded.current = true;
      void run("Setting up the styles", () => api.directions(DEFAULTS));
    }
  }, [S.project, S.directions.length, run]);

  if (!sampleCue) {
    return (
      <div className="mx-auto max-w-lg pt-16 text-center">
        <h1 className="text-[28px] font-bold">Mark your events first</h1>
        <p className="mt-2 text-muted-foreground">A style sample is one of your own events, so CueBound needs at least one event to play it on.</p>
        <DotMorphButton className="mt-6" label="Go to events" onClick={() => go("events")} />
      </div>
    );
  }

  const cost = usd(estimateUsd([sampleCue], 1, pricePerS));

  const card = (d: Direction, i: number) => {
    const look = ART[i % 2];
    const jobs = S.jobs.filter((j) => j.directionId === d.id && j.cueId === sampleCue.id);
    const busy = jobs.some((j) => ACTIVE.includes(j.status));
    const takes = S.takes.filter((t) => t.finalPath && jobs.some((j) => j.id === t.jobId));
    const sample = takes.at(-1);
    const chosen = S.project?.directionId === d.id;
    const failed = !busy && !sample && jobs.at(-1)?.error;
    const hear = () => run("Asking Livepeer for a sample", () => api.generate({ cueIds: [sampleCue.id], candidates: 1, directionId: d.id }));
    return (
      <article className={`@container/style flex flex-col overflow-hidden rounded-3xl border bg-white ${chosen ? "border-ink shadow-[0_8px_24px_rgba(28,27,25,0.12)]" : "border-line"}`} key={d.id}>
        <div className="relative h-[90px]" style={{ background: look.bg }}>
          {look.art}
          {chosen && <span className="absolute top-3 right-3 rounded-full bg-ink px-3 py-1 text-[12px] font-semibold text-ivory">Your style ✓</span>}
        </div>
        <div className="flex flex-1 flex-col gap-5 p-5 @md/style:p-6">
          <h2 className="text-[26px] font-bold tracking-tight">{d.name}</h2>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-[15px] @md/style:grid-cols-[130px_1fr] @md/style:gap-y-2.5">
            <dt className="text-muted-foreground">Feels like</dt>
            <dd>{d.texture}</dd>
            <dt className="mt-2 text-muted-foreground @md/style:mt-0">Starts and ends</dt>
            <dd>{d.envelope}</dd>
            <dt className="mt-2 text-muted-foreground @md/style:mt-0">What stands out</dt>
            <dd>{d.hierarchy}</dd>
          </dl>

          <div className="mt-auto rounded-[2.25rem] bg-paper p-4">
            {sample ? (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  aria-label={`Play the ${d.name} sample`}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-ivory transition-transform active:scale-[0.96] pointer-coarse:size-11"
                  onClick={() => trigger([sample])}
                  type="button"
                >
                  <Play className="size-4" weight="fill" />
                </button>
                <Waveform bars={48} className="@max-lg/style:order-1 @max-lg/style:basis-full" color={look.ink} fill height={30} take={sample} />
                <button className="ml-auto shrink-0 text-[13px] font-semibold text-orange-deep underline underline-offset-2 transition-transform enabled:active:scale-[0.96] disabled:opacity-50 pointer-coarse:min-h-11" disabled={busy} onClick={hear} type="button">
                  {busy ? "Rendering another…" : `Hear another · about ${cost}`}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <DotMorphButton busy={busy} label={busy ? "Livepeer is rendering…" : `Hear a sample · about ${cost}`} onClick={hear} tone="outline" />
                <span className="min-w-48 flex-1 text-[13px] text-muted-foreground">{failed ? `Didn’t finish: ${failed}` : `A ${sampleCue.label.toLowerCase()} sound prompted with this style, made on the Livepeer network.`}</span>
              </div>
            )}
          </div>

          <DotMorphButton
            className="self-start"
            label={chosen ? "Next: listen and keep" : "Use this style"}
            onClick={async () => {
              if (!chosen && !(await run("Choosing the style", () => api.selectDirection(d.id)))) return;
              go("listen");
            }}
          />
        </div>
      </article>
    );
  };

  return (
    <>
    <div className="relative z-10 pb-36 sm:pb-56">
      <SceneStrip />
      <Heading
        icon="style"
        lead="A style is a short description CueBound adds to every prompt. Hear a sample of each, then choose one. You can switch later: kept takes stay as they are, labelled with the style they were made with."
        title="Pick a style for the whole kit"
      />
      {S.directions.length ? <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">{S.directions.slice(0, 2).map(card)}</div> : <p className="text-muted-foreground">Setting up the two styles…</p>}
    </div>
    </>
  );
}
