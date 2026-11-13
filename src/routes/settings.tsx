import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { DIRECTION_LABEL, type PushDirection } from "@/lib/crew/engine";
import { pageHead } from "@/lib/meta";
import { useSettings } from "@/lib/settings";
import { speak, useVoices } from "@/lib/speech";
import { cn } from "@/lib/utils";
import { pickVoice } from "@/lib/tts/voice";
import { keyLabel } from "@/lib/ptt";
import { SimbriefPanel } from "@/components/SimbriefPanel";

export const Route = createFileRoute("/settings")({
  head: pageHead("Einstellungen", "Sprachausgabe, Stimme, Pushback-Dauer und Standardrichtung – lokal auf dem Gerät gespeichert."),
  component: SettingsPage,
});

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-4 last:border-0">
      <div>
        <div className="font-medium">{label}</div>
        {hint && <div className="text-sm text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)} className={cn("relative h-8 w-14 rounded-full transition-colors", on ? "bg-primary" : "bg-muted")}>
      <span className={cn("absolute top-1 size-6 rounded-full bg-foreground transition-all", on ? "left-7" : "left-1")} />
    </button>
  );
}

const sel = "h-12 rounded-xl border border-input bg-secondary px-3 text-foreground";

function SettingsPage() {
  const { settings: s, update, reset } = useSettings();
  const voices = useVoices();
  const [binding, setBinding] = useState<number | null>(null);
  const [bindingError, setBindingError] = useState("");
  return (
    <>
      <PageHeader title="Einstellungen" subtitle="Alle Einstellungen werden nur lokal auf diesem Gerät gespeichert." />
      <SimbriefPanel />
      <section className="panel px-5">
        <Row label="Push-to-Talk">
          <div className="flex flex-wrap gap-2">
            {s.pttKeys.map((code, index) => (
              <Button key={index} variant={binding === index ? "cockpit" : "panel"} size="touch"
                data-ptt-binding aria-label={`Sprechtaste ${index + 1} belegen`}
                onClick={() => { setBinding(index); setBindingError(""); }}
                onBlur={() => setBinding(null)}
                onKeyDown={(e) => {
                  if (binding !== index) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.code === "Escape") { setBinding(null); return; }
                  if (e.repeat) return;
                  if (!e.code || ["Tab", "MetaLeft", "MetaRight"].includes(e.code)) { setBindingError("Diese Taste ist nicht verfügbar."); return; }
                  if (s.pttKeys[1 - index] === e.code) { setBindingError("Bitte zwei unterschiedliche Tasten wählen."); return; }
                  const next: [string, string] = [...s.pttKeys];
                  next[index] = e.code;
                  update({ pttKeys: next });
                  setBinding(null);
                  setBindingError("");
                }}>
                {index + 1}: {binding === index ? "Taste drücken…" : keyLabel(code)}
              </Button>
            ))}
          </div>
        </Row>
        {bindingError && <p role="alert" className="py-2 text-sm text-destructive">{bindingError}</p>}
        <Row label="Sprachausgabe der Crew"><Toggle on={s.speak} onChange={(v) => update({ speak: v })} /></Row>
        <Row label="Natürliche Online-Stimmen" hint="Benötigt Internet. Bei Fehlern wird die Gerätestimme genutzt."><Toggle on={s.onlineVoice} onChange={(v) => update({ onlineVoice: v })} /></Row>
        <Row label="Flughafen (ICAO)" hint={`Heutige Crew: ${pickVoice(s.airport).voice}, ${pickVoice(s.airport).accent} accent – wechselt je Flughafen und Tag`}>
          <input className={sel + " w-32 uppercase"} maxLength={4} value={s.airport} onChange={(e) => update({ airport: e.target.value.toUpperCase() })} />
        </Row>
        <Row label="Gerätestimme" hint="Nur ohne Online-Stimmen">
          <select className={sel} value={s.voiceURI} onChange={(e) => update({ voiceURI: e.target.value })}>
            <option value="">Automatisch</option>
            {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
          </select>
        </Row>
        <Row label={`Sprechtempo: ${s.rate.toFixed(1)}`}>
          <input type="range" min={0.6} max={1.5} step={0.1} value={s.rate} onChange={(e) => update({ rate: +e.target.value })} className="w-48 accent-primary" />
        </Row>
        <Row label={`Stimmhöhe: ${s.pitch.toFixed(1)}`}>
          <input type="range" min={0.5} max={1.5} step={0.1} value={s.pitch} onChange={(e) => update({ pitch: +e.target.value })} className="w-48 accent-primary" />
        </Row>
        <Row label="Stimme testen"><Button variant="panel" size="touch" onClick={() => speak("Ground to cockpit, reading you five by five.")}>Abspielen</Button></Row>
        <Row label={`Pushback-Dauer: ${s.pushSeconds} s`}>
          <input type="range" min={5} max={90} step={5} value={s.pushSeconds} onChange={(e) => update({ pushSeconds: +e.target.value })} className="w-48 accent-primary" />
        </Row>
        <Row label="Standard-Richtung">
          <select className={sel} value={s.defaultDirection} onChange={(e) => update({ defaultDirection: e.target.value as PushDirection })}>
            {(Object.keys(DIRECTION_LABEL) as PushDirection[]).map((d) => <option key={d} value={d}>{DIRECTION_LABEL[d]}</option>)}
          </select>
        </Row>
        <Row label="Kommandovorschläge anzeigen"><Toggle on={s.showSuggestions} onChange={(v) => update({ showSuggestions: v })} /></Row>
        <Row label="Zurücksetzen"><Button variant="destructive" size="touch" onClick={reset}>Standardwerte</Button></Row>
      </section>
      <section className="panel mt-5 p-5 text-sm text-muted-foreground">
        <div className="font-display text-lg uppercase text-foreground">Simulator-Verbindung</div>
        Nicht verfügbar in der iPad-Version. SimConnect und Fenix-Integration kommen mit der separaten Windows-Anwendung.
        <div className="mt-3 font-display text-lg uppercase text-foreground">Installieren</div>
        Safari → Teilen → „Zum Home-Bildschirm“.
      </section>
    </>
  );
}
