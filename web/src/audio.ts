import { mediaUrl, type Take } from "./api";

let ctx: AudioContext | null = null;
let report = (message: string) => console.error(message);
// Playback failures are shown to the user; the store registers a toast here.
export const onAudioError = (fn: (message: string) => void) => {
  report = fn;
};
const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));
const context = () => (ctx ??= new AudioContext());

// Call from a user gesture before playing.
export function unlock() {
  const c = context();
  if (c.state === "suspended")
    c.resume().then(
      () => c.state !== "running" && report("The browser didn’t allow sound. Click the page once, then try again."),
      (e) => report(`The browser didn’t allow sound: ${reason(e)}.`),
    );
  return c;
}

const buffers = new Map<string, Promise<AudioBuffer>>();

export function loadTake(take: Take): Promise<AudioBuffer> {
  if (!take.finalPath) return Promise.reject(new Error("this take has no rendered file yet"));
  const key = `${take.finalPath}#${take.sha256 ?? ""}`;
  let p = buffers.get(key);
  if (!p) {
    p = fetch(mediaUrl(take.finalPath))
      .then((r) => {
        if (!r.ok) throw new Error(`the audio file returned ${r.status}`);
        return r.arrayBuffer();
      })
      .then((b) => context().decodeAudioData(b));
    p.catch(() => buffers.delete(key));
    buffers.set(key, p);
  }
  return p;
}

type Voice = { src: AudioBufferSourceNode; replay: boolean; timer: ReturnType<typeof setTimeout> };
let voices: Voice[] = [];

// Everything plays through one analyser so the UI can show the real output level.
let analyser: AnalyserNode | null = null;
const output = () => {
  const c = context();
  if (!analyser) {
    analyser = c.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;
    analyser.connect(c.destination);
  }
  return analyser;
};

// Fires "hit" at the moment a sound actually starts, so pads can react in time with the audio.
export type Hit = { takeId: string; at: number }; // at: scheduled start on the audio clock, in seconds
export const hits = new EventTarget();

function voice(buf: AudioBuffer, at: number, takeId: string, replay = false, rate = 1) {
  const c = context();
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  src.connect(output());
  const start = Math.max(at, c.currentTime);
  src.start(start);
  const timer = setTimeout(() => hits.dispatchEvent(new CustomEvent<Hit>("hit", { detail: { takeId, at: start } })), (start - c.currentTime) * 1000);
  const v = { src, replay, timer };
  voices.push(v);
  src.onended = () => (voices = voices.filter((x) => x !== v));
}

// Current output spectrum in n bands, 0..1 each; silence when nothing has played yet.
export function levels(n: number): number[] {
  if (!analyser) return Array(n).fill(0);
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  const used = Math.floor(data.length * 0.7); // the top bins stay near zero for these sounds
  const size = Math.max(1, Math.floor(used / n));
  return Array.from({ length: n }, (_, i) => {
    let m = 0;
    for (let j = i * size; j < (i + 1) * size; j++) m = Math.max(m, data[j]);
    return m / 255;
  });
}

function stop(which: (v: Voice) => boolean) {
  voices = voices.filter((v) => {
    if (!which(v)) return true;
    clearTimeout(v.timer);
    try {
      v.src.stop();
    } catch {
      /* already stopped */
    }
    return false;
  });
}

// Plays `times` hits spaced by gapS, cycling through the takes. Default: each take once, together.
export async function trigger(takes: Take[], times = takes.length, gapS = 0) {
  if (!takes.length) return;
  const c = unlock();
  let bufs: AudioBuffer[];
  try {
    bufs = await Promise.all(takes.map(loadTake));
  } catch (e) {
    return report(`Couldn’t play the take: ${reason(e)}.`);
  }
  if (c.state !== "running") await c.resume().catch(() => {});
  const t0 = c.currentTime + 0.03;
  for (let i = 0; i < times; i++) voice(bufs[i % bufs.length], t0 + i * gapS, takes[i % takes.length].id);
}

export function peaks(buf: AudioBuffer, n: number): number[] {
  const data = buf.getChannelData(0);
  const size = Math.max(1, Math.floor(data.length / n));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = i * size; j < Math.min(data.length, (i + 1) * size); j++) m = Math.max(m, Math.abs(data[j]));
    out.push(m);
  }
  const top = Math.max(...out, 1e-6);
  return out.map((v) => v / top);
}

// Clip replay: each event's kept takes play at its exact times, scheduled against the video's playhead
// and at the video's speed. Any jump, pause or stall stops every replay voice; the caller reschedules on resume.
export type Lane = { times: number[]; takes: Take[] };
let syncGen = 0;
let scheduled = false;

export const replaying = () => scheduled;

export async function resync(video: HTMLVideoElement, lanes: Lane[]) {
  stopReplay();
  const gen = syncGen;
  if (video.paused || video.ended) return;
  scheduled = true;
  let plan: (Lane & { bufs: AudioBuffer[] })[];
  try {
    plan = await Promise.all(lanes.filter((l) => l.takes.length).map(async (l) => ({ ...l, bufs: await Promise.all(l.takes.map(loadTake)) })));
  } catch (e) {
    return report(`The clip replay couldn’t load a take: ${reason(e)}.`);
  }
  const c = unlock();
  if (c.state !== "running") await c.resume().catch(() => {});
  if (gen !== syncGen || video.paused) return;
  const rate = video.playbackRate || 1;
  const nowMs = video.currentTime * 1000;
  const t0 = c.currentTime;
  for (const { times, bufs, takes } of plan) {
    [...times].sort((a, b) => a - b).forEach((ms, k) => {
      if (ms >= nowMs - 10) voice(bufs[k % bufs.length], t0 + (ms - nowMs) / 1000 / rate, takes[k % takes.length].id, true, rate);
    });
  }
}

export function stopReplay() {
  syncGen++;
  scheduled = false;
  stop((v) => v.replay);
}
