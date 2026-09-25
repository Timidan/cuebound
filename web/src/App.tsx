import { MotionConfig } from "motion/react";
import AnimatedStepper from "@/components/smoothui/animated-stepper";
import BasicToast from "@/components/smoothui/basic-toast";
import PriceFlow from "@/components/smoothui/price-flow";
import { LivepeerPanel } from "@/components/LivepeerPanel";
import { RenderIsland } from "@/components/RenderIsland";
import { ACTIVE, isComplete } from "@/kit";
import { Continue } from "@/screens/Continue";
import { Events } from "@/screens/Events";
import { Export } from "@/screens/Export";
import { Listen } from "@/screens/Listen";
import { Landing } from "@/screens/Landing";
import { Style } from "@/screens/Style";
import { StoreProvider, useStore, type Screen } from "@/store";

const STEPS: Screen[] = ["events", "style", "listen", "export"];

function Logo() {
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <svg aria-hidden="true" fill="none" height="24" stroke="#C4621D" strokeLinecap="round" strokeWidth="2.2" viewBox="0 0 24 24" width="24">
        <path d="M3 12h2M7 8v8M11 4v16M15 7v10M19 10v4" />
      </svg>
      <span className="font-display text-[19px] font-bold tracking-tight">CueBound</span>
    </div>
  );
}

function Spend() {
  const { S } = useStore();
  if (!S?.project) return null;
  const spent = S.spentUsd;
  const cap = S.project.runCeilingUsd;
  const cents = Math.round(spent * 100);
  return (
    <div className="col-start-2 row-start-2 flex flex-col items-end gap-1" title="Estimated from Livepeer’s list price. The Livepeer panel shows Livepeer’s own cost report.">
      <span className="text-[13px] text-muted-foreground tabular">
        Estimated{" "}
        <b aria-hidden="true" className="inline-flex font-semibold text-ink tabular">
          ${Math.floor(cents / 100)}.<PriceFlow value={cents % 100} />
        </b>
        <span className="sr-only">${spent.toFixed(2)}</span> of ${cap.toFixed(2)}
      </span>
      <span aria-hidden="true" className="h-1 w-32 overflow-hidden rounded-full bg-line sm:w-40">
        <span className="block h-full rounded-full bg-orange transition-[width]" style={{ width: `${Math.min(100, (spent / (cap || 1)) * 100)}%` }} />
      </span>
    </div>
  );
}

function LivepeerBadge() {
  const { S, setPanelOpen, panelOpen } = useStore();
  const busy = S?.jobs.some((j) => ACTIVE.includes(j.status));
  return (
    <button
      aria-expanded={panelOpen}
      aria-label={`Powered by Livepeer, model mirelo-sfx${busy ? ", rendering now" : ""}. Open the Livepeer activity.`}
      className="flex h-11 items-center gap-3 rounded-full border border-line bg-white pr-3 pl-3.5 text-[13px] font-medium whitespace-nowrap transition-transform active:scale-[0.96] hover:border-ink/30 col-start-2 row-start-1 justify-self-end sm:gap-4 sm:pr-3.5 sm:pl-4"
      onClick={() => setPanelOpen(!panelOpen)}
      type="button"
    >
      {/* Official symbol, unmodified; clear space equals its width. */}
      <img alt="" className="h-5 w-auto" src="/brand/livepeer-symbol-black.svg" />
      <span>
        <span className="hidden sm:inline">Powered by </span>Livepeer <span className="hidden text-muted-foreground lg:inline">· mirelo-sfx</span>
      </span>
      <span className={`size-2 shrink-0 rounded-full ${busy ? "animate-pulse bg-orange" : "bg-kept"}`} title={busy ? "Rendering" : "Idle"} />
      {!!S?.jobs.length && <span className="rounded-full bg-muted px-1.5 font-mono text-[11px] tabular">{S.jobs.length}</span>}
    </button>
  );
}

function Stepper() {
  const { S, screen, go } = useStore();
  if (!S) return null;
  const complete = S.cues.filter((c) => isComplete(S, c)).length;
  const dir = S.directions.find((d) => d.id === S.project?.directionId);
  const steps = [
    { label: "Events", description: S.cues.length ? `${S.cues.length} found` : "When sounds play" },
    { label: "Style", description: dir?.name ?? "How it sounds" },
    { label: "Listen & keep", description: S.cues.length ? `${complete} of ${S.cues.length} ready` : "Pick the takes" },
    { label: "Export", description: "Godot pack" },
  ];
  return (
    <nav aria-label="Steps" className="border-b border-line bg-ivory">
      <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-gutter py-3">
        <AnimatedStepper allowClickNavigation className="max-w-[860px] min-w-0 flex-1" currentStep={STEPS.indexOf(screen)} onStepChange={(i) => go(STEPS[i])} steps={steps} />
        {(screen === "start" || screen === "continue") && (
          <span className="ml-auto hidden text-[13px] text-muted-foreground xl:inline">{screen === "start" ? "Set up first, then follow the 4 steps." : "Continuing from a saved sound brief"}</span>
        )}
      </div>
    </nav>
  );
}

function Shell() {
  const { S, offline, screen, toastNow, dismissToast } = useStore();
  const Page = { start: Landing, events: Events, style: Style, listen: Listen, export: Export, continue: Continue }[screen];
  const overlays = (
    <>
      <RenderIsland />
      <LivepeerPanel />
      {toastNow && <BasicToast duration={toastNow.type === "error" ? 9000 : 4000} key={toastNow.id} message={toastNow.message} onClose={dismissToast} type={toastNow.type} />}
    </>
  );
  // The landing page is full-bleed and has its own navigation.
  if (screen === "start" && S) {
    return (
      <>
        {offline && (
          <p className="bg-[#fde3da] px-gutter py-2.5 text-[13px] text-[#7a2b17]" role="alert">
            {offline}
          </p>
        )}
        <Landing />
        {overlays}
      </>
    );
  }
  return (
    <div className="flex min-h-svh flex-col">
      <header className="relative grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-line bg-ivory px-gutter py-2.5 md:flex md:h-16 md:gap-6 md:py-0">
        <Logo />
        {S?.project && <span className="col-start-1 row-start-2 truncate text-[13px] text-muted-foreground" title={S.project.name}>{S.project.name}</span>}
        <div className="contents md:ml-auto md:flex md:shrink-0 md:items-center md:gap-5">
          <Spend />
          <LivepeerBadge />
        </div>
      </header>
      <Stepper />
      {offline && (
        <p className="border-b border-destructive/30 bg-[#fde3da] px-gutter py-2.5 text-[13px] text-[#7a2b17]" role="alert">
          {offline}
        </p>
      )}
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-gutter pt-5 pb-16 sm:pt-7">{S ? <Page /> : !offline && <p className="text-muted-foreground">Loading your project…</p>}</main>
      {overlays}
    </div>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </MotionConfig>
  );
}
