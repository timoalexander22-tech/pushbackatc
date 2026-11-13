import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/meta";
import { useLocalFlag } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tutorial")({
  head: pageHead("Tutorial", "Interaktives Tutorial: Funk, Ground-Crew-Kommandos, Pushback-Richtungen und Abschluss der Bodenabfertigung."),
  component: Tutorial,
});

const STEPS = [
  { title: "Willkommen", body: "Virtual Ground Crew Pro simuliert eine realistische Bodencrew für den Fenix A320 im MSFS 2020. Die App läuft eigenständig auf dem iPad – ohne GSX und parallel zu BeyondATC.", cmds: [] },
  { title: "Die App im Überblick", body: "Dashboard zeigt die aktuelle Phase. Unter „Funk“ sprichst du mit der Crew, unter „Ground Ops“ siehst du Türen, GPU und Bremsklötze, unter „Pushback“ wählst du die Richtung.", cmds: [] },
  { title: "Verbindung & Funk", body: "Ground eröffnet mit Cockpit, Ground. Halte eine Sprechtaste beim Sprechen gedrückt und lasse sie danach los.", cmds: ["Ground, go ahead."] },
  { title: "Ground-Crew-Kommandos", body: "Die Crew versteht natürliche Formulierungen. Wichtig ist die Reihenfolge: erst Türen und GPU, dann Equipment clear.", cmds: ["Close all doors please.", "Disconnect ground power.", "Confirm ground equipment clear."] },
  { title: "Pushback vorbereiten", body: "Ground meldet Türen und Luken geschlossen, Bremsklötze entfernt und Bypass Pin installiert. Melde danach Freigabe, Richtung und gelöste Bremsen.", cmds: ["Roger, we have pushback clearance, facing north. Brakes are released."] },
  { title: "Pushback-Richtungen", body: "Facing north bezeichnet die gewünschte Ausrichtung. Tail left = Heck nach links, Tail right = Heck nach rechts. Während des Pushbacks darfst du beide Triebwerke starten.", cmds: ["Starting engines two and one."] },
  { title: "Abschluss", body: "Nach dem Stopp Parkbremse setzen und bestätigen. Ground trennt automatisch Schlepper und Bypass Pin und kündigt das Handzeichen links an.", cmds: ["Parking brake is set.", "Roger, standing by on the left. Have a safe flight!"] },
];

function Tutorial() {
  const [done, setDone] = useLocalFlag<number[]>("vgc.tutorial.v1", []);
  const [i, setI] = useState(0);
  const s = STEPS[i] ?? STEPS[0];
  if (!s) return null;
  const isDone = done.includes(i);
  return (
    <>
      <PageHeader title="Tutorial" subtitle={`${done.length} von ${STEPS.length} Schritten abgeschlossen`}>
        <Button variant="panel" size="touch" onClick={() => setDone([])}>Zurücksetzen</Button>
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
        <ol className="flex gap-2 overflow-x-auto lg:flex-col">
          {STEPS.map((st, k) => (
            <li key={st.title}>
              <button onClick={() => setI(k)} className={cn("flex h-12 w-full min-w-44 items-center gap-3 rounded-xl px-3 text-left", k === i ? "bg-secondary text-primary" : "text-muted-foreground")}>
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border text-sm", done.includes(k) ? "border-success bg-success text-success-foreground" : "border-border")}>
                  {done.includes(k) ? <Check className="size-4" /> : k + 1}
                </span>
                {st.title}
              </button>
            </li>
          ))}
        </ol>
        <article className="panel p-6">
          <div className="text-sm text-muted-foreground">Schritt {i + 1}</div>
          <h2 className="text-3xl uppercase text-primary">{s.title}</h2>
          <p className="mt-3 text-lg leading-relaxed">{s.body}</p>
          {s.cmds.length > 0 && (
            <div className="mt-5 space-y-2">
              <div className="text-sm text-muted-foreground">Beispielkommandos</div>
              {s.cmds.map((c) => <div key={c} className="rounded-xl bg-secondary px-4 py-2.5 font-mono">“{c}”</div>)}
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant={isDone ? "success" : "cockpit"} size="xl" onClick={() => { if (!isDone) setDone([...done, i]); if (i < STEPS.length - 1) setI(i + 1); }}>
              {isDone ? "Abgeschlossen ✓" : "Als abgeschlossen markieren"}
            </Button>
            {i > 0 && <Button variant="panel" size="xl" onClick={() => setI(i - 1)}>Zurück</Button>}
            {i === STEPS.length - 1 && <Button asChild variant="panel" size="xl"><Link to="/training">Zum Training</Link></Button>}
          </div>
        </article>
      </div>
    </>
  );
}
