import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { processTake } from "./audio";
import { exportPack } from "./pack";
import type { Cue, Take } from "./types";

test("exports hashed, unclipped takes and lists incomplete cues", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "cuebound-pack-"));
  const processing = { gainDb: 12, trimStartMs: 0, maxDurationMs: 300, fadeOutMs: 40 };
  const sources = ["sine=f=440:d=0.5,volume=7", "sine=f=660:d=0.5,adelay=120", "anoisesrc=d=0.4:a=0.8"];
  const takes: Take[] = [];
  for (const [i, src] of sources.entries()) {
    const rawPath = join(tmp, `raw${i}.wav`);
    await Bun.spawn(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", src, rawPath]).exited;
    const finalPath = join(tmp, `final${i}.wav`);
    const r = await processTake(rawPath, processing, finalPath);
    expect(r.peakDbfs).toBeLessThanOrEqual(0);
    takes.push({ id: `t${i}`, cueId: i < 2 ? "c1" : "c2", jobId: "j", rawPath, finalPath, sha256: r.sha256, status: "accepted" });
  }
  const cue = (id: string, eventId: string, recurring: boolean): Cue =>
    ({ id, eventId, label: eventId, description: "", sourceTimesMs: [], recurring, processing });
  const out = await exportPack({
    project: { id: "p", name: "Test", brief: "", runCeilingUsd: 1 },
    cues: [cue("c1", "jump", true), cue("c2", "pickup", false), cue("c3", "hurt", false)],
    takes,
    outDir: tmp,
  });

  expect(out.incomplete).toEqual(["hurt"]);
  const paths = out.files.map((f) => f.path);
  for (const p of ["audio/jump_1.wav", "audio/jump_2.wav", "audio/pickup_1.wav", "jump.tres", "pickup.tres", "cuebound_sfx.gd", "HOOKUP.md", "manifest.json"])
    expect(paths).toContain(p);
  for (const f of out.files) {
    const bytes = await readFile(join(out.dir, f.path));
    expect(new Bun.CryptoHasher("sha256").update(bytes).digest("hex")).toBe(f.sha256);
    if (f.path.endsWith(".wav")) {
      const pcm = new Int16Array(bytes.buffer, bytes.byteOffset + 44, (bytes.length - 44) / 2);
      expect(pcm.every((s) => s > -32767 && s < 32767)).toBe(true);
    }
  }
  expect(JSON.parse(await readFile(join(out.dir, "manifest.json"), "utf8")).incomplete[0].eventId).toBe("hurt");
  await rm(tmp, { recursive: true, force: true });
});
