import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { completePush, handlePilot, initialState, toggleGround, type CrewState, type GroundItem, type PushDirection, type Result } from "./engine";
import { readSettings } from "../settings";
import { speak, stopSpeech } from "../speech";

type Ctx = {
  state: CrewState;
  say: (text: string) => void;
  toggle: (item: GroundItem) => void;
  setDirection: (d: PushDirection) => void;
  reset: () => void;
  pushProgress: number; // 0..1
};

const CrewCtx = createContext<Ctx | null>(null);

export function CrewProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CrewState>(() => initialState());
  const [pushProgress, setProgress] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    setState(initialState(readSettings().defaultDirection));
  }, []);

  const apply = useCallback((r: Result) => {
    setState(r.state);
    for (const e of r.effects) if (e.type === "speak") speak(e.text);
  }, []);

  const say = useCallback((text: string) => apply(handlePilot(stateRef.current, text)), [apply]);

  // Simulated push timer (UI only — no simulator control in this build).
  useEffect(() => {
    if (state.phase !== "pushing") {
      if (state.phase !== "push_complete" && state.phase !== "parked" && state.phase !== "disconnecting" && state.phase !== "complete") setProgress(0);
      else setProgress(1);
      return;
    }
    const total = readSettings().pushSeconds * 1000;
    const t0 = Date.now();
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / total);
      setProgress(p);
      if (p >= 1) {
        clearInterval(id);
        apply(completePush(stateRef.current));
      }
    }, 200);
    return () => clearInterval(id);
  }, [state.phase, apply]);

  const value: Ctx = {
    state,
    say,
    toggle: (item) => setState((s) => toggleGround(s, item)),
    setDirection: (d) => setState((s) => (["pushing", "push_complete", "parked", "disconnecting", "complete"].includes(s.phase) ? s : { ...s, direction: d })),
    reset: () => {
      stopSpeech();
      setState(initialState(readSettings().defaultDirection));
    },
    pushProgress,
  };
  return <CrewCtx.Provider value={value}>{children}</CrewCtx.Provider>;
}

export function useCrew() {
  const c = useContext(CrewCtx);
  if (!c) throw new Error("useCrew outside CrewProvider");
  return c;
}
