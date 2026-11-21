import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { readSettings } from "./settings";
import { crewSpeech } from "./tts/tts.functions";
import { pickVoice } from "./tts/voice";
import { blobToBase64, encodeWav, recordWav, type Recording } from "./audio/recorder";
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
  const model = s.ttsModel.trim();
  if (model) return void speakGenerated(text, s.airport, model);
  if (s.outputDeviceId) {
    toast.error(
      "Die Gerätestimme nutzt die Windows-Standardausgabe. Für den gewählten Lautsprecher bitte ein TTS-Modell konfigurieren.",
    );
    return;
  }
  speakDevice(text);
}

async function speakGenerated(text: string, airport: string, model: string) {
  const my = ++seq;
  current?.pause();
  const { voice = "Charon", accent } = pickVoice(airport);
  try {
    const r = await crewSpeech({ data: { text, voice, accent, model } });
    if (my !== seq) return;
    if ("error" in r) throw new Error(r.error);
    const a = new Audio(`data:${r.type};base64,${r.audio}`);
    current = a;
    const sink = readSettings().outputDeviceId;
    const routed = a as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    if (sink) {
      if (!routed.setSinkId)
        throw new Error("Dieser Browser unterstützt keine gezielte Lautsprecherauswahl.");
      await routed.setSinkId(sink);
    }
    await a.play();
  } catch (e) {
    if (my !== seq) return;
    toast.error(`Lokale Crew-Stimme fehlgeschlagen: ${e instanceof Error ? e.message : "Fehler"}`);
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
  const v =
    voices.find((x) => x.voiceURI === s.voiceURI) ?? voices.find((x) => x.lang.startsWith("en"));
  if (v) u.voice = v;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () =>
      setVoices(window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en")));
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  return voices;
}

export function useRecognition(
  onResult: (text: string) => void,
  deps: {
    record?: typeof recordWav;
    transcribe?: (audio: string) => Promise<{ text: string } | { error: string }>;
  } = {},
) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useRef(0);
  const pending = useRef<Promise<Recording | null> | null>(null);
  const cb = useRef(onResult);
  cb.current = onResult;
  const transcribeFn = useRef(deps.transcribe);
  transcribeFn.current = deps.transcribe;
  const record = deps.record ?? recordWav;

  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
    return () => {
      session.current++;
      void pending.current?.then((r) => r?.cancel());
    };
  }, []);

  const start = useCallback(() => {
    const my = ++session.current;
    stopSpeech();
    setError(null);
    setListening(true);
    pending.current = record(readSettings().inputDeviceId).catch((e: unknown) => {
      if (my === session.current) {
        setListening(false);
        setError(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "Mikrofon-Zugriff verweigert."
            : e instanceof DOMException &&
                ["NotFoundError", "OverconstrainedError"].includes(e.name)
              ? "Das ausgewählte Mikrofon ist nicht verfügbar. Bitte Gerät neu laden oder ein anderes wählen."
              : "Mikrofon konnte nicht gestartet werden. Bitte Eingabegerät prüfen.",
        );
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
      try {
        const rec = await p;
        if (!rec) return;
        if (my !== session.current) {
          rec.cancel();
          return;
        }
        const blob = await rec.stop();
        if (my !== session.current) return;
        if (blob.size < 8000) {
          setError("Zu kurz gesprochen – Taste während des ganzen Satzes halten.");
          return;
        }
        setBusy(true);
        const audio = await blobToBase64(blob);
        if (my !== session.current) return;
        const transcribe =
          transcribeFn.current ??
          ((value: string) =>
            transcribeRadio({
              data: { audio: value, model: readSettings().sttModel.trim() || undefined },
            }));
        const r = await transcribe(audio);
        if (my !== session.current) return;
        if ("error" in r) setError(r.error);
        else if (r.text) cb.current(r.text);
        else setError("Keine Sprache erkannt. Bitte erneut versuchen.");
      } catch {
        if (my === session.current) setError("Aufnahme oder Spracherkennung fehlgeschlagen.");
      } finally {
        if (my === session.current) setBusy(false);
      }
    })();
  }, []);

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
  const [error, setError] = useState<string | null>(null);
  const [canRouteOutput, setCanRouteOutput] = useState(false);
  const load = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setError("Audio-Geräte können in diesem Browser nicht abgefragt werden.");
      return;
    }
    try {
      const d = await navigator.mediaDevices.enumerateDevices();
      setInputs(d.filter((x) => x.kind === "audioinput" && x.deviceId));
      setOutputs(d.filter((x) => x.kind === "audiooutput" && x.deviceId));
      setError(null);
    } catch {
      setError("Audio-Geräte konnten nicht geladen werden. Bitte Berechtigungen prüfen.");
    }
  }, []);
  const unlock = useCallback(async () => {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    await load();
  }, [load]);
  const testInput = useCallback(async (deviceId: string) => {
    const audio: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    };
    const stream = await navigator.mediaDevices.getUserMedia({ audio });
    let ctx: AudioContext | undefined;
    try {
      ctx = new AudioContext();
      await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      let peak = 0;
      const end = Date.now() + 1200;
      while (Date.now() < end) {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += sample * sample;
        peak = Math.max(peak, Math.sqrt(sum / samples.length));
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      source.disconnect();
      return peak;
    } finally {
      stream.getTracks().forEach((track) => track.stop());
      await ctx?.close();
    }
  }, []);
  const testOutput = useCallback(async (deviceId: string) => {
    const sampleRate = 24000;
    const samples = new Float32Array(sampleRate / 2);
    for (let i = 0; i < samples.length; i++) {
      const fade = Math.min(i / 1200, (samples.length - i) / 1200, 1);
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.2 * fade;
    }
    const audio = new Audio(URL.createObjectURL(encodeWav([samples], sampleRate)));
    const url = audio.src;
    try {
      if (deviceId) {
        const routed = audio as HTMLAudioElement & {
          setSinkId?: (id: string) => Promise<void>;
        };
        if (!routed.setSinkId)
          throw new Error("Dieser Browser unterstützt keine Lautsprecherauswahl.");
        await routed.setSinkId(deviceId);
      }
      const finished = new Promise<void>((resolve, reject) => {
        audio.addEventListener("ended", () => resolve(), { once: true });
        audio.addEventListener(
          "error",
          () => reject(new Error("Der Testton konnte nicht abgespielt werden.")),
          { once: true },
        );
      });
      await audio.play();
      await finished;
    } finally {
      audio.pause();
      URL.revokeObjectURL(url);
    }
  }, []);
  useEffect(() => {
    void load();
    navigator.mediaDevices?.addEventListener?.("devicechange", load);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", load);
  }, [load]);
  useEffect(() => {
    setCanRouteOutput(
      typeof HTMLAudioElement !== "undefined" && "setSinkId" in HTMLAudioElement.prototype,
    );
  }, []);
  return { inputs, outputs, error, load, unlock, testInput, testOutput, canRouteOutput };
}
