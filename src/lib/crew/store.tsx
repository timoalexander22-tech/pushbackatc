import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSim } from "../sim/store";
import {
  completePush,
  handlePilot,
  initialState,
  simEvent,
  toggleGround,
  type CrewState,
  type GroundItem,
  type PushDirection,
  type Result,
} from "./engine";
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
    const opening = initialState(readSettings().defaultDirection);
    setState(opening);
    speak("Cockpit, Ground.");
  }, []);

  const apply = useCallback((r: Result) => {
    setState(r.state);
    for (const e of r.effects) if (e.type === "speak") speak(e.text);
  }, []);

  const say = useCallback((text: string) => apply(handlePilot(stateRef.current, text)), [apply]);

  const sim = useSim();
  const live = sim.status === "live";
  const liveRef = useRef(live);
  liveRef.current = live;
  const simPushing = useRef(false);
  const simPushAttempted = useRef(false);
  const pushStartedAt = useRef<number | null>(null);

  // Real aircraft state edges drive the matching crew calls.
  const prevSim = useRef(sim.state);
  useEffect(() => {
    const cur = sim.state,
      prev = prevSim.current;
    prevSim.current = cur;
    if (!cur?.simConnected || !prev?.simConnected) return;
    if (prev.parkingBrake && !cur.parkingBrake)
      apply(simEvent(stateRef.current, { type: "brakeReleased" }));
    if (!prev.parkingBrake && cur.parkingBrake)
      apply(simEvent(stateRef.current, { type: "brakeSet" }));
    for (const e of [1, 2] as const)
      if (!prev.engines[e] && cur.engines[e])
        apply(simEvent(stateRef.current, { type: "engineStarted", engine: e }));
  }, [sim.state, apply]);

  useEffect(
    () =>
      sim.onPushDone(() => {
        simPushing.current = false;
        apply(completePush(stateRef.current));
      }),
    [sim, apply],
  );

  // Select simulator or timed pushback once per push, so a late connection cannot start the tug unexpectedly.
  useEffect(() => {
    if (state.phase !== "pushing") {
      if (simPushing.current) {
        simPushing.current = false;
        sim.send({ type: "cmd", cmd: "push_stop" });
      }
      simPushAttempted.current = false;
      return;
    }

    if (!simPushAttempted.current) {
      simPushAttempted.current = true;
      if (liveRef.current) {
        simPushing.current = true;
        sim.send({
          type: "cmd",
          cmd: "push_start",
          direction: stateRef.current.direction,
          facing: stateRef.current.facing,
          seconds: readSettings().pushSeconds,
        });
      }
    } else if (!liveRef.current && simPushing.current) {
      simPushing.current = false;
    }
  }, [state.phase, sim, live]);

  const simProgress = sim.state?.push.active ? sim.state.push.progress : null;
  useEffect(() => {
    if (simPushing.current && simProgress !== null) setProgress(simProgress);
  }, [simProgress]);

  // Continue with the simulated timer if the simulator disconnects during pushback.
  useEffect(() => {
    if (state.phase === "pushing" && simPushing.current) return;
    if (state.phase !== "pushing") {
      pushStartedAt.current = null;
      if (
        state.phase !== "push_complete" &&
        state.phase !== "parked" &&
        state.phase !== "disconnecting" &&
        state.phase !== "complete"
      )
        setProgress(0);
      else setProgress(1);
      return;
    }
    const total = readSettings().pushSeconds * 1000;
    const t0 = (pushStartedAt.current ??= Date.now());
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / total);
      setProgress(p);
      if (p >= 1) {
        clearInterval(id);
        apply(completePush(stateRef.current));
      }
    }, 200);
    return () => clearInterval(id);
  }, [state.phase, apply, live]);

  const value: Ctx = {
    state,
    say,
    toggle: (item) => setState((s) => toggleGround(s, item)),
    setDirection: (d) => {
      const current = stateRef.current;
      if (current.phase === "pushing") {
        if (liveRef.current) {
          sim.send({ type: "cmd", cmd: "push_steer", direction: d });
        }
        return;
      }
      setState((s) =>
        ["push_complete", "parked", "disconnecting", "complete"].includes(s.phase)
          ? s
          : { ...s, direction: d },
      );
    },
    reset: () => {
      stopSpeech();
      setState(initialState(readSettings().defaultDirection));
      speak("Cockpit, Ground.");
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
