import { useCallback, useEffect, useState } from "react";

const KEY = "vgc.enabledPlugins.v1";

export function readEnabledPlugins(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(value) ? value.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function useEnabledPlugins() {
  const [enabled, setEnabled] = useState<string[]>([]);
  useEffect(() => setEnabled(readEnabledPlugins()), []);
  const setPluginEnabled = useCallback((id: string, active: boolean) => {
    const next = new Set(readEnabledPlugins());
    if (active) next.add(id);
    else next.delete(id);
    const value = [...next];
    localStorage.setItem(KEY, JSON.stringify(value));
    setEnabled(value);
  }, []);
  return { enabled, setPluginEnabled };
}
