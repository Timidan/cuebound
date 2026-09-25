import { useState } from "react";
import { PixelIcon, type IconName } from "@/components/PixelIcon";
import AnimatedFileUpload from "@/components/smoothui/animated-file-upload";
import { DotMorphButton } from "@/components/smoothui/dot-morph-button";
import { api, mediaUrl } from "@/api";
import { useKit } from "@/store";

const CLIP_EXT = /\.(mp4|webm|mov|mkv)$/i;
const MAX_BYTES = 50 * 1024 * 1024;

export function Heading({ title, lead, icon, children }: { title: string; lead: string; icon?: IconName; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-7 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
      <div className="flex max-w-[780px] items-start gap-3 sm:gap-4">
        {icon && <PixelIcon className="mt-0.5" name={icon} size={48} />}
        <div className="min-w-0">
          <h1 className="text-[clamp(1.625rem,1.1rem+2.2vw,2.125rem)] leading-[1.1] font-bold tracking-[-0.02em]">{title}</h1>
          <p className="mt-1.5 max-w-[65ch] text-[0.9375rem] text-muted-foreground">{lead}</p>
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-3 lg:shrink-0">{children}</div>}
    </div>
  );
}


// The real project form: clip, game feel and spend limit. It lives in the landing page's start drawer.
export function StartForm({ onDone }: { onDone?: () => void }) {
  const { S, run, go, toast, health } = useKit();
  const p = S.project;
  const [file, setFile] = useState<File | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [feel, setFeel] = useState(p?.brief ?? "");
  const [limit, setLimit] = useState(String(p?.runCeilingUsd ?? 2));
  const [busy, setBusy] = useState(false);
  const hasClip = !!p?.clipPath;
  const limitOk = limit.trim() !== "" && Number(limit) >= 0;

  const pick = (files: File[]) => {
    const f = files[0] ?? null;
    if (f && !CLIP_EXT.test(f.name)) {
      toast("Choose an MP4, WebM, MOV or MKV video.", "error");
      return;
    }
    setFile(f);
  };

  const submit = async () => {
    if (!limitOk) return toast("Enter a spend limit in dollars, for example 2.", "error");
    setBusy(true);
    const name = p?.name ?? file?.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ") ?? "My game";
    const saved = await run("Saving your project", () => api.project({ name, brief: feel.trim(), runCeilingUsd: Number(limit) }));
    const uploaded = saved && file ? await run("Uploading the clip", () => api.clip(file)) : saved;
    setBusy(false);
    if (uploaded) {
      onDone?.();
      go("events");
    }
  };

  const livepeer = health?.livepeer;

  return (
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <p className="mb-2 font-semibold" id="clip-label">
            Gameplay clip <span className="font-normal text-muted-foreground">(optional)</span>
          </p>
          {hasClip && !replacing && !file ? (
            <div className="flex items-center gap-4 rounded-xl border border-line bg-paper p-3">
              <video className="media-edge h-16 w-28 rounded-lg bg-[#0d1426] object-cover" muted preload="metadata" src={mediaUrl(p!.clipPath!)} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">Clip added</p>
                <p className="text-[0.8125rem] text-muted-foreground">{S.hosted ? "Stored on this CueBound server with your project." : "It stays on this computer."}</p>
              </div>
              <button className="text-[0.8125rem] font-semibold text-orange-deep underline underline-offset-2" onClick={() => setReplacing(true)} type="button">
                Replace
              </button>
            </div>
          ) : (
            <div aria-labelledby="clip-label">
              <AnimatedFileUpload
                accept=".mp4,.webm,.mov,.mkv,video/mp4,video/webm,video/quicktime,video/x-matroska"
                hint="15 to 60 seconds · MP4, WebM, MOV or MKV · up to 50 MB"
                maxSize={MAX_BYTES}
                multiple={false}
                onFilesSelected={pick}
              />
              <p className="mt-2 text-[0.8125rem] text-muted-foreground">No clip, or it misses some actions? On the next screen, load your game’s event list from your coding agent.</p>
            </div>
          )}
        </div>

        <label className="flex flex-col gap-2">
          <span className="font-semibold">Game feel</span>
          <textarea
            className="min-h-[64px] resize-y rounded-xl border border-input bg-paper px-3.5 py-2.5 text-[0.9375rem] placeholder:text-muted-foreground/80"
            onChange={(e) => setFeel(e.target.value)}
            placeholder="Cozy platformer with a small, quick hero. Only damage sounds harsh."
            value={feel}
          />
          <span className="text-[0.8125rem] text-muted-foreground">One sentence is enough. You pick the exact sound style in step 2.</span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="font-semibold">Spend limit</span>
          <span className="flex items-center gap-2">
            <span className="relative">
              <span aria-hidden="true" className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <input
                aria-invalid={!limitOk}
                className="w-32 rounded-xl border border-input bg-paper py-2.5 pr-3 pl-7 font-mono text-[0.9375rem] tabular"
                inputMode="decimal"
                min="0"
                onChange={(e) => setLimit(e.target.value)}
                step="0.5"
                type="number"
                value={limit}
              />
            </span>
            <span className="text-[0.8125rem] text-muted-foreground">
              One sound costs about $0.03. CueBound refuses any request that would go over.
              {S.hosted && ` This hosted demo caps it at $${S.hosted.spendCapUsd.toFixed(2)}.`}
            </span>
          </span>
        </label>

        <div className="rounded-xl bg-paper p-4 text-[0.8125rem] leading-relaxed">
          <p className="font-semibold">{S.hosted ? "Where your data goes" : "What leaves this computer"}</p>
          <p className="mt-1 text-muted-foreground">
            {S.hosted
              ? "Your clip is stored on this CueBound server with your project. Only the short text prompts that describe each sound go to the Livepeer network, which generates the audio."
              : "Only the short text prompts that describe each sound. They go to the Livepeer network, which generates the audio. Your clip stays here."}
          </p>
          {livepeer && (
            <p className={`mt-2 font-medium ${livepeer.ok ? "text-kept" : "text-destructive"}`}>
              {livepeer.ok ? "✓ Connected to the Livepeer network" : `✗ Can’t reach the Livepeer network: ${livepeer.detail}`}
            </p>
          )}
        </div>

        <DotMorphButton busy={busy} className="self-start" label="Next: your events" type="submit" />
      </form>
  );
}
