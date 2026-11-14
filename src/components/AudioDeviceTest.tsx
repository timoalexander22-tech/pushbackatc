import { useEffect, useRef, useState } from "react";
import { Mic, Play, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordWav, type Recording } from "@/lib/audio/recorder";
import { playDeviceTest, speakerTestTone } from "@/lib/audio/device-test";
import { readSettings } from "@/lib/settings";
import { stopSpeech } from "@/lib/speech";

export function AudioDeviceTest({ kind }: { kind: "input" | "output" }) {
  const [state, setState] = useState<"idle" | "starting" | "recording" | "playing">("idle");
  const [clip, setClip] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const recording = useRef<Recording | null>(null);
  const playback = useRef<HTMLAudioElement | null>(null);
  const url = useRef("");
  const session = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = () => {
    session.current++;
    recording.current?.cancel();
    recording.current = null;
    playback.current?.pause();
    playback.current = null;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = "";
    if (timer.current) clearTimeout(timer.current);
  };
  useEffect(() => {
    const cancel = () => { cleanup(); setState("idle"); };
    const hidden = () => { if (document.hidden) cancel(); };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      cleanup();
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);

  const finish = async () => {
    const rec = recording.current;
    recording.current = null;
    if (timer.current) clearTimeout(timer.current);
    if (!rec) return;
    const blob = await rec.stop();
    setClip(blob.size > 44 ? blob : null);
    if (blob.size <= 44) setError("Keine Aufnahme vorhanden. Bitte erneut testen.");
    setState("idle");
  };
  const start = async () => {
    cleanup(); stopSpeech(); setError(""); setClip(null); setState("starting");
    const my = session.current;
    try {
      const rec = await recordWav(readSettings().inputDeviceId);
      if (my !== session.current) { rec.cancel(); return; }
      recording.current = rec;
      setState("recording");
      timer.current = setTimeout(() => void finish(), 10000);
    } catch {
      if (my !== session.current) return;
      setState("idle"); setError("Mikrofon nicht verfügbar. Bitte Freigabe und Eingang prüfen.");
    }
  };
  const play = async (blob: Blob) => {
    cleanup(); stopSpeech(); setError(""); setState("playing");
    const my = session.current;
    url.current = URL.createObjectURL(blob);
    const audio = new Audio(url.current);
    playback.current = audio;
    audio.onended = () => { if (my === session.current) { cleanup(); setState("idle"); } };
    try { await playDeviceTest(audio, readSettings().outputDeviceId); }
    catch {
      if (my !== session.current) return;
      cleanup(); setState("idle"); setError("Test nicht abspielbar. Bitte Lautsprecher und Lautstärke prüfen.");
    }
  };
  return <div className="flex w-full flex-wrap items-center gap-2">
    {state === "recording" ? <Button variant="destructive" size="touch" onClick={() => void finish()}><Square />Aufnahme beenden</Button>
      : state === "playing" ? <Button variant="panel" size="touch" onClick={() => { cleanup(); setState("idle"); }}><Square />Test stoppen</Button>
      : <Button variant="panel" size="touch" disabled={state === "starting"} onClick={() => kind === "input" ? void start() : void play(speakerTestTone())}>
        {kind === "input" ? <Mic /> : <Volume2 />}{state === "starting" ? "Mikrofon startet…" : kind === "input" ? "Mikrofon testen" : "Lautsprecher testen"}
      </Button>}
    {kind === "input" && clip && state === "idle" && <Button variant="panel" size="touch" onClick={() => void play(clip)}><Play />Aufnahme anhören</Button>}
    {state === "recording" && <span role="status" className="text-sm text-primary">Aufnahme läuft · maximal 10 Sekunden</span>}
    {error && <p role="alert" className="w-full text-sm text-destructive">{error}</p>}
  </div>;
}