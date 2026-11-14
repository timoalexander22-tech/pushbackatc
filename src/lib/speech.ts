import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { readSettings } from "./settings";
import { crewSpeech } from "./tts/tts.functions";
import { pickVoice } from "./tts/voice";
import { blobToBase64, recordWav, type Recording } from "./audio/recorder";
import { transcribeRadio } from "./audio/stt.functions";

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
    const sink = readSettings().outputDeviceId;
    const routed = a as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    if (sink && routed.setSinkId) await routed.setSinkId(sink).catch(() => toast.error("Ausgabegerät nicht verfügbar – Standardlautsprecher wird genutzt."));
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

export function useRecognition(onResult: (text: string) => void, deps: { record?: typeof recordWav; transcribe?: (audio: string) => Promise<{ text: string } | { error: string }> } = {}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useRef(0);
  const pending = useRef<Promise<Recording | null> | null>(null);
  const cb = useRef(onResult);
  cb.current = onResult;
  const record = deps.record ?? recordWav;
  const transcribe = deps.transcribe ?? ((audio: string) => transcribeRadio({ data: { audio } }));

  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
    return () => { session.current++; void pending.current?.then((r) => r?.cancel()); };
  }, []);

  const start = useCallback(() => {
    const my = ++session.current;
    stopSpeech();
    setError(null);
    setListening(true);
    pending.current = record(readSettings().inputDeviceId).catch((e: unknown) => {
      if (my === session.current) {
        setListening(false);
        setError(e instanceof DOMException && e.name === "NotAllowedError" ? "Mikrofon-Zugriff verweigert." : "Mikrofon konnte nicht gestartet werden. Bitte Eingabegerät prüfen.");
      }
      return null;
    });
  }, [record]);

  const stop = useCallback(() => {
    const my = session.current;
    const p = pending.current;
    pending.current = null;
    setListening(false);
    if (!p) return;
    void (async () => {
      const rec = await p;
      if (!rec) return;
      const blob = await rec.stop();
      if (my !== session.current) return;
      if (blob.size < 8000) { setError("Zu kurz gesprochen – Taste während des ganzen Satzes halten."); return; }
      setBusy(true);
      try {
        const r = await transcribe(await blobToBase64(blob));
        if (my !== session.current) return;
        if ("error" in r) setError(r.error);
        else if (r.text) cb.current(r.text);
        else setError("Keine Sprache erkannt. Bitte erneut versuchen.");
      } catch {
        if (my === session.current) setError("Spracherkennung fehlgeschlagen. Bitte erneut versuchen.");
      } finally {
        setBusy(false);
      }
    })();
  }, [transcribe]);

  const cancel = useCallback(() => {
    session.current++;
    const p = pending.current;
    pending.current = null;
    setListening(false);
    void p?.then((r) => r?.cancel());
  }, []);
  return { supported, listening, busy, error, start, stop, cancel };
}

export function useAudioDevices() {
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const load = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const d = await navigator.mediaDevices.enumerateDevices();
    setInputs(d.filter((x) => x.kind === "audioinput" && x.deviceId));
    setOutputs(d.filter((x) => x.kind === "audiooutput" && x.deviceId));
  }, []);
  const unlock = useCallback(async () => {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    await load();
  }, [load]);
  useEffect(() => {
    void load();
    navigator.mediaDevices?.addEventListener?.("devicechange", load);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", load);
  }, [load]);
  const canRouteOutput = typeof HTMLAudioElement !== "undefined" && "setSinkId" in HTMLAudioElement.prototype;
  return { inputs, outputs, unlock, canRouteOutput };
}
