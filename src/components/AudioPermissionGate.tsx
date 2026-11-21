"use client";

import { useEffect, useState } from "react";
import { Mic, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const AUDIO_PERMISSION_KEY = "vgc.audioPermission.prompted";

export function AudioPermissionGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const desktop =
      "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
    if (!desktop || sessionStorage.getItem(AUDIO_PERMISSION_KEY) === "1") {
      setReady(true);
      return;
    }
    setReady(false);
  }, []);

  const requestPermission = async () => {
    setRequesting(true);
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Dieses Windows-Gerät unterstützt die Audiogerätefreigabe nicht.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      sessionStorage.setItem(AUDIO_PERMISSION_KEY, "1");
      setReady(true);
    } catch (permissionError) {
      setError(
        permissionError instanceof DOMException && permissionError.name === "NotAllowedError"
          ? "Der Mikrofonzugriff wurde verweigert. Bitte in den Windows-Datenschutzeinstellungen erlauben."
          : permissionError instanceof Error
            ? permissionError.message
            : "Der Audiogerätezugriff konnte nicht angefragt werden.",
      );
    } finally {
      setRequesting(false);
    }
  };

  if (ready) return children;

  return (
    <main className="fixed inset-0 z-[100] flex items-center justify-center bg-background px-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="audio-permission-title"
        className="panel w-full max-w-lg p-6"
      >
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Mic className="size-6" aria-hidden="true" />
        </div>
        <h1 id="audio-permission-title" className="font-display text-2xl uppercase">
          Audiogerätezugriff
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Die App benötigt Zugriff auf das Mikrofon für Push-to-Talk und Sprachaufnahme. Bitte
          erlauben Sie die Geräteabfrage, bevor die Anwendung geladen wird.
        </p>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-secondary p-3 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>Die Aufnahme startet erst bei einer Sprachfunktion und wird nicht dauerhaft aufgezeichnet.</span>
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="panel"
            size="touch"
            disabled={requesting}
            onClick={() => {
              sessionStorage.setItem(AUDIO_PERMISSION_KEY, "1");
              setReady(true);
            }}
          >
            Ohne Mikrofon fortfahren
          </Button>
          <Button
            variant="cockpit"
            size="touch"
            disabled={requesting}
            onClick={() => void requestPermission()}
          >
            <Mic className="size-4" aria-hidden="true" />
            {requesting ? "Wird abgefragt…" : "Zugriff erlauben"}
          </Button>
        </div>
      </section>
    </main>
  );
}
