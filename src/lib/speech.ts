import { useCallback, useEffect, useRef, useState } from "react";
import { readSettings } from "./settings";

export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const s = readSettings();
  if (!s.speak) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = s.rate;
  u.pitch = s.pitch;
  const voices = window.speechSynthesis.getVoices();
  const v = voices.find((x) => x.voiceURI === s.voiceURI) ?? voices.find((x) => x.lang.startsWith("en"));
  if (v) u.voice = v;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en")));
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  return voices;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = any;

export function useRecognition(onResult: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<Rec>(null);
  const cb = useRef(onResult);
  cb.current = onResult;

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const start = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const C = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!C) return;
    window.speechSynthesis?.cancel();
    const r: Rec = new C();
    r.lang = "en-US";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e: Rec) => cb.current(e.results[0][0].transcript);
    r.onerror = (e: Rec) => setError(e.error === "not-allowed" ? "Mikrofon-Zugriff verweigert." : "Spracherkennung fehlgeschlagen. Bitte erneut versuchen.");
    r.onend = () => setListening(false);
    ref.current = r;
    setError(null);
    setListening(true);
    r.start();
  }, []);

  const stop = useCallback(() => ref.current?.stop(), []);
  return { supported, listening, error, start, stop };
}
