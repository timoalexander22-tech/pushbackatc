import { useSettings, type Settings } from "@/lib/settings";
import { SIM_STATUS_LABEL, useSim } from "@/lib/sim/store";
import { cn } from "@/lib/utils";

const MODES: { id: Settings["simMode"]; label: string; hint: string }[] = [
  { id: "off", label: "Aus", hint: "Nur Training, Pushback wird simuliert." },
  { id: "relay", label: "iPad / Tablet", hint: "Verbindung über Kopplungscode (Internet nötig)." },
  { id: "local", label: "Auf dem PC", hint: "App läuft im Browser auf dem MSFS-PC." },
];

const field = "h-12 rounded-xl border border-input bg-secondary px-3 text-foreground";

export function SimulatorPanel() {
  const { settings: s, update } = useSettings();
  const sim = useSim();
  const st = sim.state;
  return (
    <section id="simulator" className="panel mt-5 scroll-mt-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl uppercase">Simulator · MSFS 2020</h2>
        <span className="flex items-center gap-2 text-sm">
          <span
            className={cn(
              "size-2.5 rounded-full",
              sim.status === "live"
                ? "bg-emerald-400"
                : sim.status === "off"
                  ? "bg-muted-foreground/50"
                  : "bg-primary",
            )}
            aria-hidden="true"
          />
          {SIM_STATUS_LABEL[sim.status]}
        </span>
      </div>

      <div role="radiogroup" aria-label="Verbindungsart" className="mt-4 grid gap-2 sm:grid-cols-3">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={s.simMode === m.id}
            onClick={() => update({ simMode: m.id })}
            className={cn(
              "rounded-xl border p-3 text-left transition-colors",
              s.simMode === m.id
                ? "border-primary bg-primary/10"
                : "border-border bg-secondary hover:bg-muted",
            )}
          >
            <div className="font-medium">{m.label}</div>
            <div className="text-sm text-muted-foreground">{m.hint}</div>
          </button>
        ))}
      </div>

      {s.simMode === "relay" && (
        <label className="mt-4 flex flex-col gap-1 text-sm">
          Kopplungscode (wird im Companion-Fenster auf dem PC angezeigt)
          <input
            className={field + " w-48 font-mono text-lg uppercase tracking-widest"}
            maxLength={8}
            value={s.simCode}
            onChange={(e) =>
              update({ simCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })
            }
            placeholder="z. B. K7Q2XM"
            autoComplete="off"
          />
        </label>
      )}
      {s.simMode === "local" && (
        <label className="mt-4 flex flex-col gap-1 text-sm">
          Companion-Adresse
          <input
            className={field + " w-72 font-mono"}
            value={s.simUrl}
            onChange={(e) => update({ simUrl: e.target.value.trim() })}
          />
        </label>
      )}
      {sim.error && sim.status === "searching" && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {sim.error}
        </p>
      )}

      {st && (
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {[
            ["Flugzeug", st.simConnected ? st.aircraft || "–" : "MSFS nicht gestartet"],
            ["Parkbremse", st.parkingBrake ? "Gesetzt" : "Gelöst"],
            [
              "Triebwerke",
              `${st.engines[1] ? "1 an" : "1 aus"} · ${st.engines[2] ? "2 an" : "2 aus"}`,
            ],
            ["Steuerkurs", `${Math.round(st.heading)}° · ${st.groundSpeed.toFixed(1)} kt`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-secondary p-3">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {st?.simConnected && !st.isFenix && (
        <p className="mt-3 text-sm text-muted-foreground">
          Kein Fenix A320 erkannt – Grundfunktionen arbeiten trotzdem mit Standard-Simvariablen.
        </p>
      )}

      <details className="mt-4 text-sm text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">
          Einrichtung auf dem Windows-PC
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Node.js (LTS) von nodejs.org installieren.</li>
          <li>Unter „Updates“ das Companion herunterladen und entpacken.</li>
          <li>
            Im Ordner <code className="font-mono">companion</code> die Datei{" "}
            <code className="font-mono">start.bat</code> doppelklicken.
          </li>
          <li>MSFS 2020 mit dem Fenix A320 starten. Das Companion verbindet sich automatisch.</li>
          <li>Auf dem iPad den angezeigten Kopplungscode hier eintragen.</li>
        </ol>
      </details>
    </section>
  );
}
