import { useEffect, useRef, useState } from "react";
import { hits, type Hit } from "@/audio";
import type { Take } from "@/api";

const BURST_S = 0.12;

// A counter per cue that ticks when one of its takes starts playing. A start within 120 ms of the cue's previous
// start joins the same burst, so a rapid-fire test (8 starts, 120 ms apart) gets one ring, not eight.
export function usePadHits(takes: Take[]) {
  const [count, setCount] = useState<Record<string, number>>({});
  const last = useRef(new Map<string, number>());
  useEffect(() => {
    const cueOf = new Map(takes.map((t) => [t.id, t.cueId]));
    const on = (e: Event) => {
      const { takeId, at } = (e as CustomEvent<Hit>).detail;
      const cueId = cueOf.get(takeId);
      if (!cueId) return;
      const prev = last.current.get(cueId);
      last.current.set(cueId, at);
      if (prev !== undefined && at - prev <= BURST_S + 1e-6) return;
      setCount((c) => ({ ...c, [cueId]: (c[cueId] ?? 0) + 1 }));
    };
    hits.addEventListener("hit", on);
    return () => hits.removeEventListener("hit", on);
  }, [takes]);
  return count;
}
