import type { PushDirection } from "../crew/engine";

/** Must match `version` in companion/package.json. */
export const COMPANION_LATEST = "1.0.1";
export const COMPANION_DOWNLOAD =
  "https://github.com/timoalexander22-tech/pushbackatc/archive/refs/heads/main.zip";
export const DEFAULT_LOCAL_URL = "ws://localhost:8787";

export type SimState = {
  simConnected: boolean;
  aircraft: string;
  isFenix: boolean;
  onGround: boolean;
  parkingBrake: boolean;
  groundSpeed: number;
  heading: number;
  engines: { 1: boolean; 2: boolean };
  push: { active: boolean; progress: number };
};

export type CompanionMessage =
  { type: "state"; version: string; data: SimState } | { type: "event"; event: "pushDone" };

export type AppCommand =
  | {
      type: "cmd";
      cmd: "push_start";
      direction: PushDirection;
      facing: string | null;
      seconds: number;
    }
  | { type: "cmd"; cmd: "push_steer"; direction: PushDirection }
  | { type: "cmd"; cmd: "push_stop" };

export const relayChannel = (code: string) => `vgc-sim-${code.trim().toUpperCase()}`;

export function isCompanionMessage(v: unknown): v is CompanionMessage {
  if (!v || typeof v !== "object") return false;
  const m = v as { type?: unknown; data?: unknown; event?: unknown };
  return (
    (m.type === "state" && typeof m.data === "object" && m.data !== null) ||
    (m.type === "event" && m.event === "pushDone")
  );
}
