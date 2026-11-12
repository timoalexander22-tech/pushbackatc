import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { readSettings } from "./settings";
import { crewSpeech } from "./tts/tts.functions";
import { pickVoice } from "./tts/voice";

let current: HTMLAudioElement | null = null;
let seq = 0;

export function stopSpeech() {
  seq++;
  current?.pause();
  current = null;
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}

export function speak(text: string) {
  if (typeof window === "undefined") return;
  const s = readSettings();
  if (!s.speak) return;
  if (s.onlineVoice) return void speakOnline(text, s.airport);
  speakDevice(text);
}

async function speakOnline(text: string, airport: string) {
  const my = ++seq;
  current?.pause();
  const { voice = "Charon", accent } = pickVoice(airport);
  try {
    const r = await crewSpeech({ data: { text, voice, accent } });
    if (my !== seq) return;
    if ("error" in r) throw new Error(r.error);
    const a = new Audio(`data:${r.type};base64,${r.audio}`);
    current = a;
    await a.play();
  } catch (e) {
    if (my !== seq) return;
    toast.error(`Online-Stimme fehlgeschlagen: ${e instanceof Error ? e.message : "Fehler"} – Gerätestimme wird genutzt.`);
    speakDevice(text);
  }
}

function speakDevice(text: string) {
  if (!("speechSynthesis" in window)) return;
  const s = readSettings();
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

type RecognitionEvent = { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>; resultIndex: number };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function useRecognition(onResult: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<Recognition | null>(null);
  const held = useRef(false);
  const started = useRef(false);
  const transcript = useRef("");
  const cb = useRef(onResult);
  cb.current = onResult;

  useEffect(() => {
    const w = window as SpeechWindow;
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => {
      held.current = false;
      const r = ref.current;
      ref.current = null;
      r?.abort();
    };
  }, []);

  const start = useCallback(() => {
    const w = window as SpeechWindow;
    const C = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!C) return;
    const previous = ref.current;
    ref.current = null;
    previous?.abort();
    stopSpeech();
    const r = new C();
    held.current = true;
    started.current = false;
    transcript.current = "";
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = true;
    r.maxAlternatives = 1;
    r.onstart = () => {
      if (ref.current !== r) return;
      started.current = true;
      if (held.current) setListening(true);
      else r.stop();
    };
    r.onresult = (e) => {
      if (ref.current !== r) return;
      transcript.current = Array.from(e.results).map((result) => result[0].transcript).join(" ").trim();
    };
    r.onerror = (e) => {
      if (ref.current !== r) return;
      transcript.current = "";
      held.current = false;
      setListening(false);
      if (e.error !== "aborted" && e.error !== "no-speech") setError(e.error === "not-allowed" ? "Mikrofon-Zugriff verweigert." : "Spracherkennung fehlgeschlagen. Bitte erneut versuchen.");
    };
    r.onend = () => {
      if (ref.current !== r) return;
      ref.current = null;
      started.current = false;
      setListening(false);
      const text = transcript.current;
      transcript.current = "";
      // Never send a command while a PTT control is still held.
      if (!held.current && text) cb.current(text);
    };
    ref.current = r;
    setError(null);
    try {
      r.start();
    } catch {
      ref.current = null;
      held.current = false;
      setListening(false);
      setError("Mikrofon konnte nicht gestartet werden. Bitte erneut versuchen.");
    }
  }, []);

  const stop = useCallback(() => {
    held.current = false;
    setListening(false);
    if (started.current) ref.current?.stop();
  }, []);
  const cancel = useCallback(() => {
    held.current = false;
    transcript.current = "";
    const r = ref.current;
    ref.current = null;
    r?.abort();
    started.current = false;
    setListening(false);
  }, []);
  return { supported, listening, error, start, stop, cancel };
}
