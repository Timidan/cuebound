import type { Processing } from "./types";

export const SAMPLE_RATE = 44100;
const CEILING_DBFS = -0.1;
const LEVEL_DBFS = -1; // every take is peak-levelled here before gainDb, so gainDb means the same thing for every take
const ONSET_BELOW_PEAK_DB = 30;
const PREROLL_MS = 10;
export const PROCESSING_STEPS = `trimStartMs; keep the maxDurationMs window holding the most energy, started ${PREROLL_MS} ms before the sound rises within ${ONSET_BELOW_PEAK_DB} dB of its peak; linear fadeOutMs tail; peak-levelled to ${LEVEL_DBFS} dBFS, then gainDb, never above ${CEILING_DBFS} dBFS`;

// Provider takes put the sound anywhere in a multi-second file: find the loudest window, then back up to its onset.
function mainSound(x: Float32Array, len: number, preroll: number): Float32Array {
  if (x.length <= len) return x;
  const e = new Float64Array(x.length + 1);
  for (let i = 0; i < x.length; i++) e[i + 1] = e[i] + x[i] * x[i];
  let best = 0;
  for (let s = 1; s + len <= x.length; s++) if (e[s + len] - e[s] > e[best + len] - e[best]) best = s;
  let peak = 0;
  for (let i = best; i < best + len; i++) peak = Math.max(peak, Math.abs(x[i]));
  const floor = peak * 10 ** (-ONSET_BELOW_PEAK_DB / 20);
  const block = Math.max(1, Math.round(preroll / 2)); // walk the envelope in ~5 ms blocks, not single samples (zero crossings)
  const loud = (from: number) => { for (let i = Math.max(0, from); i < from + block && i < x.length; i++) if (Math.abs(x[i]) > floor) return true; return false; };
  let onset = best;
  while (onset > 0 && best - onset < len && loud(onset - block)) onset -= block;
  for (let i = Math.max(0, onset); i < best + len; i++) if (Math.abs(x[i]) > floor) { onset = i; break; }
  const start = Math.max(0, Math.min(onset - preroll, x.length - len));
  return x.subarray(start, start + len);
}

async function run(cmd: string[]): Promise<ArrayBuffer> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`${cmd[0]} exited ${code}: ${err.trim()}`);
  return out;
}

export async function probe(path: string) {
  const out = await run([
    "ffprobe", "-v", "error", "-protocol_whitelist", "file", "-select_streams", "a:0",
    "-show_entries", "stream=sample_rate,channels:format=duration", "-of", "json", path,
  ]);
  const j = JSON.parse(new TextDecoder().decode(out));
  const s = j.streams?.[0];
  if (!s) throw new Error(`no audio stream in ${path}`);
  return {
    durationMs: Math.round(Number(j.format?.duration) * 1000),
    sampleRate: Number(s.sample_rate),
    channels: Number(s.channels),
  };
}

export async function processTake(rawPath: string, p: Processing, outPath: string) {
  const { gainDb, trimStartMs, maxDurationMs, fadeOutMs } = p;
  if (![gainDb, trimStartMs, maxDurationMs, fadeOutMs].every(Number.isFinite) || trimStartMs < 0 || maxDurationMs <= 0 || fadeOutMs < 0)
    throw new Error(`invalid processing ${JSON.stringify(p)}`);

  const decoded = await run([
    "ffmpeg", "-v", "error", "-protocol_whitelist", "file", "-i", rawPath,
    "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "f32le", "-",
  ]);
  const ms = (v: number) => Math.round((v * SAMPLE_RATE) / 1000);
  const all = new Float32Array(decoded).subarray(ms(trimStartMs));
  let rawPeak = 0;
  for (const v of all) rawPeak = Math.max(rawPeak, Math.abs(v));
  const x = mainSound(all, ms(maxDurationMs), ms(PREROLL_MS)).slice();
  if (!x.length) throw new Error(`nothing left of ${rawPath} after trimming`);

  const fade = Math.min(ms(fadeOutMs), x.length);
  for (let i = 0; i < fade; i++) x[x.length - fade + i] *= 1 - (i + 1) / fade;

  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const gain = peak ? Math.min(10 ** ((LEVEL_DBFS + gainDb) / 20), 10 ** (CEILING_DBFS / 20)) / peak : 0;

  const bytes = new Uint8Array(44 + x.length * 2);
  const view = new DataView(bytes.buffer);
  const tag = (o: number, t: string) => [...t].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  tag(0, "RIFF"); view.setUint32(4, 36 + x.length * 2, true); tag(8, "WAVE");
  tag(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  tag(36, "data"); view.setUint32(40, x.length * 2, true);
  let max = 0;
  for (let i = 0; i < x.length; i++) {
    const s = Math.round(x[i] * gain * 32768);
    view.setInt16(44 + i * 2, s, true);
    max = Math.max(max, Math.abs(s));
  }

  await Bun.write(outPath, bytes);
  return {
    sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
    durationMs: Math.round((x.length * 1000) / SAMPLE_RATE),
    peakDbfs: max ? 20 * Math.log10(max / 32768) : -Infinity,
    rawPeakDbfs: rawPeak ? 20 * Math.log10(rawPeak) : -Infinity,
  };
}
