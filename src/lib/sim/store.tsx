import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSettings } from "../settings";
import { openLocal, openRelay, type Link } from "./link";
import type { AppCommand, SimState } from "./protocol";

/** off: disabled · searching: no companion yet · bridge: companion up, MSFS not · live: MSFS connected */
export type SimStatus = "off" | "searching" | "bridge" | "live";

type Ctx = {
  status: SimStatus;
  error: string;
  state: SimState | null;
  companionVersion: string | null;
  send: (c: AppCommand) => void;
  onPushDone: (fn: () => void) => () => void;
};

const SimCtx = createContext<Ctx | null>(null);
const STALE_MS = 5000;

export function SimProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [state, setState] = useState<SimState | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState(0);
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const link = useRef<Link | null>(null);
  const pushDone = useRef(new Set<() => void>());

  const { simMode, simUrl, simCode } = settings;
  useEffect(() => {
    setState(null);
    setError("");
    setLastSeen(0);
    if (simMode === "off" || (simMode === "relay" && simCode.trim().length < 4)) return;
    const handlers = {
      onMessage: (m: Parameters<Parameters<typeof openLocal>[1]["onMessage"]>[0]) => {
        setLastSeen(Date.now());
        setError("");
        if (m.type === "state") {
          setState(m.data);
          setVersion(m.version);
        } else pushDone.current.forEach((fn) => fn());
      },
      onError: setError,
    };
    const l = simMode === "local" ? openLocal(simUrl, handlers) : openRelay(simCode, handlers);
    link.current = l;
    return () => {
      l.close();
      link.current = null;
    };
  }, [simMode, simUrl, simCode]);

  useEffect(() => {
    if (simMode === "off") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [simMode]);

  const fresh = lastSeen > 0 && now - lastSeen < STALE_MS;
  const status: SimStatus =
    simMode === "off" ? "off" : !fresh ? "searching" : state?.simConnected ? "live" : "bridge";

  const send = useCallback((c: AppCommand) => link.current?.send(c), []);
  const onPushDone = useCallback((fn: () => void) => {
    pushDone.current.add(fn);
    return () => void pushDone.current.delete(fn);
  }, []);

  return (
    <SimCtx.Provider
      value={{
        status,
        error,
        state: fresh ? state : null,
        companionVersion: fresh ? version : null,
        send,
        onPushDone,
      }}
    >
      {children}
    </SimCtx.Provider>
  );
}

export function useSim() {
  const c = useContext(SimCtx);
  if (!c) throw new Error("useSim outside SimProvider");
  return c;
}

export const SIM_STATUS_LABEL: Record<SimStatus, string> = {
  off: "Simulator aus",
  searching: "Suche Companion…",
  bridge: "Warte auf MSFS",
  live: "MSFS verbunden",
};
