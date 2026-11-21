import { useCallback, useEffect, useState } from "react";
import type { PushDirection } from "./crew/engine";

export type Settings = {
  speak: boolean;
  rate: number;
  pitch: number;
  voiceURI: string;
  pushSeconds: number;
  defaultDirection: PushDirection;
  showSuggestions: boolean;
  callsign: string;
  airport: string;
  sttModel: string;
  ttsModel: string;
  pttKeys: [string, string];
  simbriefKind: "userid" | "username";
  simbriefId: string;
  inputDeviceId: string;
  outputDeviceId: string;
  simMode: "off" | "local" | "relay";
  simUrl: string;
  simCode: string;
  autoUpdateCheck: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  speak: true,
  rate: 1,
  pitch: 0.9,
  voiceURI: "",
  pushSeconds: 20,
  defaultDirection: "straight",
  showSuggestions: true,
  callsign: "",
  airport: "EDDF",
  sttModel: "",
  ttsModel: "",
  pttKeys: ["Space", "ControlRight"],
  simbriefKind: "userid",
  simbriefId: "",
  inputDeviceId: "",
  outputDeviceId: "",
  simMode: "off",
  simUrl: "ws://localhost:8787",
  simCode: "",
  autoUpdateCheck: true,
};

const KEY = "vgc.settings.v1";
const EVT = "vgc-settings";

export function readSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const [settings, set] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    set(readSettings());
    const h = () => set(readSettings());
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, []);
  const update = useCallback((patch: Partial<Settings>) => {
    const next = { ...readSettings(), ...patch };
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVT));
  }, []);
  const reset = useCallback(() => {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVT));
  }, []);
  return { settings, update, reset };
}

export function useLocalFlag<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setV(JSON.parse(raw));
    } catch {}
  }, [key]);
  const set = useCallback(
    (next: T) => {
      setV(next);
      localStorage.setItem(key, JSON.stringify(next));
    },
    [key],
  );
  return [v, set] as const;
}
