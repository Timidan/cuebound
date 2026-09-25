import { useReducedMotion } from "motion/react";

// The game's pixel world closing the bottom of an app screen, drifting slowly like a side-scroller.
// Render it inside the screen's relative container; the screen keeps bottom padding for it.
// --strip is its height: 96px on phones, 150px from 640px.
export function SceneStrip() {
  const reduce = useReducedMotion();
  const layer = (src: string, seconds: number, opacity = 1) => (
    <div
      className="pixelated absolute inset-0 bg-bottom bg-repeat-x"
      style={{
        backgroundImage: `url(${src})`,
        backgroundSize: "auto calc(var(--strip) * 2.4)",
        opacity,
        animation: reduce ? undefined : `scene-drift ${seconds}s linear infinite`,
      }}
    />
  );
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-(--strip) overflow-hidden rounded-t-[28px] [--strip:96px] sm:[--strip:150px]">
      {/* One image width per loop: 2.4 × the strip height × 2560/1080. */}
      <style>{`@keyframes scene-drift { from { background-position-x: 0 } to { background-position-x: calc(var(--strip) * -5.68889) } }`}</style>
      {layer("/art/bg-hills.png", 240, 0.55)}
      {layer("/art/bg-front.png", 120)}
    </div>
  );
}
