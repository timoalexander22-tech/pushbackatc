import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, GraduationCap, Headset, MoveDown, RotateCcw, Truck } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useCrew } from "@/lib/crew/store";
import { DIRECTION_LABEL, equipmentClear, PHASE_LABEL, PHASE_ORDER, statusLine } from "@/lib/crew/engine";
import { pageHead } from "@/lib/meta";
import { cn } from "@/lib/utils";
import { SimbriefPanel } from "@/components/SimbriefPanel";

export const Route = createFileRoute("/")({
  head: pageHead("Dashboard", "Überblick über Bodenabfertigung, Pushback-Status und Funkverkehr mit der Bodencrew."),
  component: Dashboard,
});

const TILES = [
  { to: "/comms", title: "Ground Crew Communication", desc: "Funk per Sprache oder Text", icon: Headset },
  { to: "/pushback", title: "Pushback", desc: "Richtung wählen & begleiten", icon: MoveDown },
  { to: "/ground-ops", title: "Ground Operations", desc: "Türen, GPU, Bremsklötze, Fracht", icon: Truck },
  { to: "/tutorial", title: "Tutorial", desc: "Schritt für Schritt lernen", icon: BookOpen },
  { to: "/training", title: "Training Mode", desc: "Geführte Funkdialoge üben", icon: GraduationCap },
] as const;

function Dashboard() {
  const { state, reset } = useCrew();
  const idx = PHASE_ORDER.indexOf(state.phase);
  const last = [...state.log].reverse().find((m) => m.from === "crew");
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Fenix A320 · MSFS 2020 · eigenständige iPad-Version">
        <Button variant="panel" size="touch" onClick={reset}>
          <RotateCcw /> Neuer Turnaround
        </Button>
      </PageHeader>

      <section className="panel mb-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Aktuelle Phase</div>
            <div className="font-display text-3xl font-bold uppercase text-primary">{PHASE_LABEL[state.phase]}</div>
            <div className="font-mono text-sm text-muted-foreground">{statusLine(state)}</div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Equipment" value={equipmentClear(state) ? "Frei" : "Am Flugzeug"} ok={equipmentClear(state)} />
            <Stat label="Richtung" value={DIRECTION_LABEL[state.direction]} />
            <Stat label="Triebwerke" value={`${+state.enginesRunning[1] + +state.enginesRunning[2]}/2`} ok={state.enginesRunning[1] && state.enginesRunning[2]} />
          </div>
        </div>
        <div className="mt-5 flex gap-1">
          {PHASE_ORDER.map((p, i) => (
            <div key={p} title={PHASE_LABEL[p]} className={cn("h-2 flex-1 rounded-full", i <= idx ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
        {last && <p className="mt-4 rounded-xl bg-secondary px-4 py-3 font-mono text-sm">Ground: “{last.text}”</p>}
      </section>

      <SimbriefPanel />
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TILES.map(({ to, title, desc, icon: Icon }) => (
          <Link key={to} to={to} className="panel group flex min-h-32 flex-col justify-between p-5 transition-transform active:scale-[0.98]">
            <Icon className="size-8 text-primary" />
            <div>
              <div className="font-display text-xl font-semibold uppercase">{title}</div>
              <div className="text-sm text-muted-foreground">{desc}</div>
            </div>
          </Link>
        ))}
        <div className="panel flex flex-col justify-center gap-1 border-dashed p-5 text-sm text-muted-foreground">
          <div className="font-display text-lg uppercase text-foreground">Windows-Version</div>
          SimConnect- und Fenix-Anbindung sind in Planung. Diese iPad-Version simuliert den Ablauf – sie steuert den Simulator nicht.
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="rounded-xl bg-secondary px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("font-display text-lg uppercase", ok ? "text-success" : "text-foreground")}>{value}</div>
    </div>
  );
}
