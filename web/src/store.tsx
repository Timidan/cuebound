import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, errorText, notInBuild, type Health, type Job, type LivepeerCard, type State } from "./api";
import { onAudioError } from "./audio";
import { ACTIVE, LIST_PRICE_PER_S } from "./kit";

export type Screen = "start" | "events" | "style" | "listen" | "export" | "continue";
const SCREENS: Screen[] = ["start", "events", "style", "listen", "export", "continue"];

export type ToastType = "success" | "error" | "info" | "warning";
type Toast = { id: number; message: string; type: ToastType };

// When this page first saw each job in each phase. The API has no per-phase timestamps, so durations are
// measured here and only for jobs that were still running when the page loaded.
export type Seen = Record<string, { live: boolean; running?: number; done?: number }>;

interface Store {
  S: State | null;
  offline: string | null;
  refresh(): Promise<void>;
  run<T>(what: string, fn: () => Promise<T>): Promise<T | undefined>;
  toast(message: string, type?: ToastType): void;
  toastNow: Toast | null;
  dismissToast(): void;
  seen: Seen;
  livepeer: LivepeerCard | null;
  livepeerNote: string | null;
  reloadLivepeer(): Promise<void>;
  health: Health | null;
  pricePerS: number;
  panelOpen: boolean;
  setPanelOpen(open: boolean): void;
  screen: Screen;
  go(screen: Screen): void;
}

const Ctx = createContext<Store | null>(null);

export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
};

// The state is loaded before any screen renders, so screens can rely on it.
export const useKit = () => {
  const s = useStore();
  return { ...s, S: s.S as State };
};

const hashScreen = (): Screen | null => {
  const h = location.hash.replace(/^#\/?/, "") as Screen;
  return SCREENS.includes(h) ? h : null;
};

// The step a returning developer continues from; the landing itself always lives at "/".
export function firstScreen(S: State): Screen {
  if (!S.project) return "start";
  if (!S.cues.length) return "events";
  if (!S.project.directionId) return "style";
  return "listen";
}

const phase = (j: Job) => (j.status === "running" ? "running" : ACTIVE.includes(j.status) ? null : "done");

export function StoreProvider({ children }: { children: ReactNode }) {
  const [S, setS] = useState<State | null>(null);
  const [offline, setOffline] = useState<string | null>(null);
  const [toastNow, setToast] = useState<Toast | null>(null);
  const [seen, setSeen] = useState<Seen>({});
  const [livepeer, setLivepeer] = useState<LivepeerCard | null>(null);
  const [livepeerNote, setLivepeerNote] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [screen, setScreen] = useState<Screen>(hashScreen() ?? "start");
  const last = useRef("");
  const busy = useRef(false);

  const toast = useCallback((message: string, type: ToastType = "info") => setToast({ id: Date.now(), message, type }), []);
  useEffect(() => onAudioError((m) => toast(m, "error")), [toast]);

  const refresh = useCallback(async () => {
    let next: State;
    try {
      next = await api.state();
    } catch (e) {
      setOffline(`CueBound can’t reach its server (${errorText(e)}). Start it with "bun server.ts", then this page reconnects.`);
      throw e;
    }
    setOffline(null);
    busy.current = next.jobs.some((j) => ACTIVE.includes(j.status));
    const now = Date.now();
    setSeen((prev) => {
      let out = prev;
      for (const j of next.jobs) {
        const p = phase(j);
        const cur = out[j.id];
        if (!cur) out = { ...out, [j.id]: { live: ACTIVE.includes(j.status), ...(p ? { [p]: now } : {}) } };
        else if (p && !cur[p]) out = { ...out, [j.id]: { ...cur, [p]: now } };
      }
      return out;
    });
    const json = JSON.stringify(next);
    if (json !== last.current) {
      last.current = json;
      setS(next);
    }
  }, []);

  const run = useCallback(
    async <T,>(what: string, fn: () => Promise<T>) => {
      try {
        const r = await fn();
        await refresh().catch(() => {});
        return r;
      } catch (e) {
        toast(notInBuild(e) ? `${what} isn’t available on this server build yet.` : `${what} failed. ${errorText(e)}`, "error");
        await refresh().catch(() => {});
        return undefined;
      }
    },
    [refresh, toast],
  );

  const reloadLivepeer = useCallback(async () => {
    try {
      setLivepeer(await api.livepeer());
      setLivepeerNote(null);
    } catch (e) {
      setLivepeerNote(notInBuild(e) ? "This server build doesn’t describe its Livepeer connection yet." : `Livepeer didn’t answer: ${errorText(e)}`);
    }
  }, []);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await refresh().catch(() => {});
      if (!stop) timer = setTimeout(tick, busy.current ? 1500 : 6000);
    };
    void tick();
    void reloadLivepeer();
    api.health().then(setHealth, () => setHealth(null));
    const onHash = () => setScreen(hashScreen() ?? "start");
    addEventListener("hashchange", onHash);
    return () => {
      stop = true;
      clearTimeout(timer);
      removeEventListener("hashchange", onHash);
    };
  }, [refresh, reloadLivepeer]);

  const go = useCallback((s: Screen) => {
    location.hash = `/${s}`;
    setScreen(s);
    scrollTo({ top: 0 });
  }, []);

  const value: Store = {
    S,
    offline,
    refresh,
    run,
    toast,
    toastNow,
    dismissToast: () => setToast(null),
    seen,
    livepeer,
    livepeerNote,
    reloadLivepeer,
    health,
    pricePerS: livepeer?.pricePerSecond ?? LIST_PRICE_PER_S,
    panelOpen,
    setPanelOpen,
    screen,
    go,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
