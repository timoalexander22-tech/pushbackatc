"use client";

import { useEffect, useState } from "react";
import { Mic, ShieldCheck } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";

const AUDIO_PERMISSION_KEY = "vgc.audioPermission.prompted";

export function AudioPermissionGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isDesktop = "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
    setDesktop(isDesktop);
    if (!isDesktop || sessionStorage.getItem(AUDIO_PERMISSION_KEY) === "1") {
      setReady(true);
      return;
    }
    setReady(false);
  }, []);

  const requestPermission = async () => {
    setRequesting(true);
    setError("");
    setPermissionDenied(false);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Dieses Windows-Gerät unterstützt die Audiogerätefreigabe nicht.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      sessionStorage.setItem(AUDIO_PERMISSION_KEY, "1");
      setReady(true);
    } catch (permissionError) {
      const errorName =
        permissionError instanceof DOMException
          ? permissionError.name
          : permissionError instanceof Error
            ? permissionError.name
            : "";
      setPermissionDenied(errorName === "NotAllowedError");
      setError(
        errorName === "NotAllowedError"
          ? "Windows oder WebView2 hat den Mikrofonzugriff blockiert."
          : permissionError instanceof Error
            ? permissionError.message
            : "Der Audiogerätezugriff konnte nicht angefragt werden.",
      );
    } finally {
      setRequesting(false);
    }
  };

  const openMicrophoneSettings = async () => {
    setSettingsError("");
    try {
      await invoke("open_microphone_settings");
    } catch (settingsOpenError) {
      setSettingsError(
        settingsOpenError instanceof Error
          ? settingsOpenError.message
          : "Die Windows-Mikrofoneinstellungen konnten nicht geöffnet werden.",
      );
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
          <span>
            Die Aufnahme startet erst bei einer Sprachfunktion und wird nicht dauerhaft
            aufgezeichnet.
          </span>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Bei Desktop-Apps wird die App möglicherweise nicht einzeln aufgeführt. Aktivieren Sie
          unter <strong>Datenschutz &amp; Sicherheit → Mikrofon</strong> den Mikrofonzugriff und{" "}
          <strong>Desktop-Apps den Zugriff auf das Mikrofon erlauben</strong>.
        </p>
        {error && (
          <div role="alert" className="mt-4 space-y-2 text-sm text-destructive">
            <p>{error}</p>
            {permissionDenied && (
              <p className="text-muted-foreground">
                Prüfen Sie in den Windows-Mikrofoneinstellungen den Gerätezugriff sowie den Zugriff
                für Apps und Desktop-Apps. Beenden Sie die App danach vollständig und starten Sie
                sie neu. Ist der Zugriff bereits aktiviert, testen Sie das Mikrofon in einer anderen
                App; eine gespeicherte WebView2-Berechtigung oder eine Windows-Richtlinie kann die
                Anfrage weiterhin blockieren.
              </p>
            )}
          </div>
        )}
        {settingsError && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {settingsError}
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
          {desktop && (
            <Button
              variant="panel"
              size="touch"
              disabled={requesting}
              onClick={() => void openMicrophoneSettings()}
            >
              Windows-Einstellungen
            </Button>
          )}
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
