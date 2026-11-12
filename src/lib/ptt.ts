import { useCallback, useEffect, useRef, useState } from "react";

export function keyLabel(code: string) {
  const labels: Record<string, string> = { Space: "Leertaste", ControlLeft: "Strg links", ControlRight: "Strg rechts", ShiftLeft: "Umschalt links", ShiftRight: "Umschalt rechts", AltLeft: "Alt links", AltRight: "Alt rechts", CapsLock: "Feststelltaste" };
  return labels[code] ?? code.replace(/^Key|^Digit/, "");
}

function isEditing(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"], [data-ptt-binding]'));
}

export function usePushToTalk(keys: readonly string[], start: () => void, stop: () => void, cancel: () => void) {
  const held = useRef(new Set<string>());
  const callbacks = useRef({ start, stop, cancel });
  callbacks.current = { start, stop, cancel };
  const [pressed, setPressed] = useState(false);
  const press = useCallback((source: string) => {
    if (held.current.has(source)) return;
    const wasOff = held.current.size === 0;
    held.current.add(source);
    setPressed(true);
    if (wasOff) callbacks.current.start();
  }, []);
  const release = useCallback((source: string) => {
    if (!held.current.delete(source) || held.current.size > 0) return;
    setPressed(false);
    callbacks.current.stop();
  }, []);
  const keySignature = keys.join("|");
  useEffect(() => {
    const assigned = new Set(keySignature.split("|"));
    const clear = () => {
      held.current.clear();
      setPressed(false);
      callbacks.current.cancel();
    };
    const down = (e: KeyboardEvent) => {
      if (!assigned.has(e.code) || e.repeat || isEditing(e.target)) return;
      e.preventDefault();
      press(`key:${e.code}`);
    };
    const up = (e: KeyboardEvent) => {
      if (held.current.has(`key:${e.code}`)) {
        e.preventDefault();
        release(`key:${e.code}`);
      }
    };
    const visibility = () => { if (document.hidden) clear(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", visibility);
      held.current.clear();
      callbacks.current.cancel();
    };
  }, [keySignature, press, release]);
  return { pressed, press, release };
}