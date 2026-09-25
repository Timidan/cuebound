import { useEffect, useState } from "react";
import type { Take } from "@/api";
import { loadTake, peaks } from "@/audio";

// Bars from the take's actual decoded audio; a flat line until it loads.
export function Waveform({ take, bars = 34, height = 30, color, fill = false, className = "" }: { take?: Take; bars?: number; height?: number; color: string; fill?: boolean; className?: string }) {
  const [p, setP] = useState<number[] | null>(null);
  const key = take?.finalPath ? `${take.finalPath}#${take.sha256 ?? ""}` : "";
  useEffect(() => {
    let live = true;
    setP(null);
    if (take?.finalPath) loadTake(take).then((b) => live && setP(peaks(b, bars)), () => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the file key identifies the audio
  }, [key, bars]);
  const vals = p ?? Array.from({ length: bars }, () => 0.06);
  return (
    <span aria-hidden="true" className={`flex items-center gap-[2px] ${fill ? "min-w-0 flex-1" : ""} ${className}`} style={{ height }}>
      {vals.map((v, i) => (
        <span className={`block shrink-0 rounded-[1px] ${fill ? "min-w-[2px] flex-1" : "w-[3px]"}`} key={i} style={{ background: color, height: Math.max(2, Math.round(v * height)), opacity: p ? 1 : 0.35 }} />
      ))}
    </span>
  );
}
