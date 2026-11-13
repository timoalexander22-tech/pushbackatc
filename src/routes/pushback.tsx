import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowDownLeft, ArrowDownRight, Info } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useCrew } from "@/lib/crew/store";
import { DIRECTION_LABEL, equipmentClear, PHASE_LABEL, type PushDirection } from "@/lib/crew/engine";
import { pageHead } from "@/lib/meta";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pushback")({
  head: pageHead("Pushback", "Pushback-Richtung wählen und den Ablauf mit der Bodencrew Schritt für Schritt durchführen."),
  component: Pushback,
});

const DIRS: { d: PushDirection; icon: typeof ArrowDown }[] = [
  { d: "left", icon: ArrowDownLeft },
  { d: "straight", icon: ArrowDown },
  { d: "right", icon: ArrowDownRight },
];

function Pushback() {
  const { state, say, setDirection, pushProgress } = useCrew();
  const p = state.phase;
  const locked = ["awaiting_release", "pushing", "push_complete", "parked", "disconnecting", "complete"].includes(p);
  const lastCrew = [...state.log].reverse().find((m) => m.from === "crew");

  const steps = [
    { label: "Ground antworten", done: p !== "idle", action: () => say("Ground, go ahead.") },
    { label: "Bodengerät entfernt", done: equipmentClear(state), action: () => say("Confirm ground equipment clear.") },
    { label: "Freigabe & Bremse gelöst", done: locked, action: () => say(`Roger, we have pushback clearance, ${state.facing ? `facing ${state.facing}` : state.direction === "straight" ? "straight back" : `tail ${state.direction}`}. Brakes are released.`) },
    { label: "Parkbremse lösen", done: ["pushing", "push_complete", "parked", "disconnecting", "complete"].includes(p), action: () => say("Brakes released.") },
    { label: "Parkbremse setzen", done: ["parked", "disconnecting", "complete"].includes(p), action: () => say("Parking brake set.") },
    { label: "Schlepper trennen", done: ["disconnecting", "complete"].includes(p), action: () => say("Disconnect the towing system.") },
    { label: "Steering Pin entfernen", done: (p === "disconnecting" || p === "complete") && !state.pinInserted, action: () => say("Remove steering pin.") },
    { label: "Handzeichen links bestätigen", done: p === "complete", action: () => say("Roger, standing by on the left. Have a safe flight!") },
  ];
  const next = steps.findIndex((s) => !s.done);

  // Plane drawing: moves back and rotates per direction.
  const rot = state.direction === "left" ? -60 : state.direction === "right" ? 60 : 0;
  return (
    <>
      <PageHeader title="Pushback" subtitle="Wähle die Richtung und führe den Pushback mit der Crew durch.">
        <span className="rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 font-display uppercase text-primary">{PHASE_LABEL[p]}</span>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <section className="space-y-5">
          <div className="panel p-5">
            <h2 className="mb-3 text-xl uppercase">Richtung</h2>
            <div className="grid grid-cols-3 gap-3">
              {DIRS.map(({ d, icon: Icon }) => (
                <button
                  key={d}
                  disabled={locked}
                  onClick={() => setDirection(d)}
                  className={cn(
                    "flex h-28 flex-col items-center justify-center gap-2 rounded-xl border-2 text-sm transition-colors disabled:opacity-50",
                    state.direction === d ? "border-primary bg-primary/15 text-primary" : "border-border bg-secondary text-secondary-foreground",
                  )}
                >
                  <Icon className="size-9" />
                  {DIRECTION_LABEL[d]}
                </button>
              ))}
            </div>
          </div>

          <div className="panel relative h-64 overflow-hidden">
            <div className="absolute inset-x-0 top-6 mx-auto h-full w-1 bg-primary/30" />
            <div
              className="absolute left-1/2 top-8 text-6xl transition-transform duration-300"
              style={{ transform: `translate(-50%, ${pushProgress * 120}px) rotate(${rot * pushProgress}deg)` }}
              aria-hidden
            >
              ✈︎
            </div>
            <div className="absolute inset-x-4 bottom-4">
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>Fortschritt</span>
                <span>{Math.round(pushProgress * 100)} %</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${pushProgress * 100}%` }} />
              </div>
            </div>
          </div>
          <p className="flex gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" /> Simulation: Diese Version bewegt das Flugzeug im MSFS nicht. Echte Pushback-Steuerung folgt mit der Windows-Version.
          </p>
        </section>

        <section className="panel p-5">
          <h2 className="mb-3 text-xl uppercase">Ablauf</h2>
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={s.label} className={cn("flex items-center gap-3 rounded-xl px-3 py-2", i === next && "bg-secondary")}>
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border font-display", s.done ? "border-success bg-success text-success-foreground" : "border-border text-muted-foreground")}>
                  {s.done ? "✓" : i + 1}
                </span>
                <span className={cn("flex-1", s.done && "text-muted-foreground line-through")}>{s.label}</span>
                {i === next && (
                  <Button size="touch" variant="cockpit" onClick={s.action} disabled={p === "pushing" && i === 4 && pushProgress < 1}>
                    Funken
                  </Button>
                )}
              </li>
            ))}
          </ol>
          {p === "pushing" && (
            <Button variant="cockpit" size="xl" className="mt-4 w-full" disabled={state.enginesRunning[1] && state.enginesRunning[2]} onClick={() => say("Starting engines two and one.")}>
              Triebwerke 2 und 1 starten
            </Button>
          )}
          {p === "pushing" && (
            <Button variant="destructive" size="xl" className="mt-4 w-full" onClick={() => say("Stop the pushback.")}>
              STOP
            </Button>
          )}
          {lastCrew && <p className="mt-4 rounded-xl bg-secondary px-4 py-3 font-mono text-sm">Ground: “{lastCrew.text}”</p>}
        </section>
      </div>
    </>
  );
}
