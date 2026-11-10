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
  { title: "Verbindung & Funk", body: "Tippe auf das Mikrofon und sprich englisch – oder tippe das Kommando. Die Crew antwortet per Sprachausgabe. Starte jeden Turnaround mit einem Funkcheck.", cmds: ["Ground, cockpit, how do you read?"] },
  { title: "Ground-Crew-Kommandos", body: "Die Crew versteht natürliche Formulierungen. Wichtig ist die Reihenfolge: erst Türen und GPU, dann Equipment clear.", cmds: ["Close all doors please.", "Disconnect ground power.", "Confirm ground equipment clear."] },
  { title: "Pushback vorbereiten", body: "Ist alles frei, fordere den Pushback an. Die Crew koppelt den Schlepper an, setzt den Steering Pin und bittet dich, die Parkbremse zu lösen.", cmds: ["Ready for pushback.", "Brakes released."] },
  { title: "Pushback-Richtungen", body: "Straight = gerade zurück. Tail left = Heck nach links, Nase zeigt danach nach rechts. Tail right = umgekehrt. Während des Pushbacks darfst du die Triebwerke starten.", cmds: ["Push tail left.", "Starting engine two."] },
  { title: "Abschluss", body: "Nach dem Stopp Parkbremse setzen, Triebwerke starten, Schlepper trennen, Steering Pin entfernen und „engines clear“ bestätigen. Die Crew verabschiedet sich mit Handzeichen links.", cmds: ["Parking brake set.", "Disconnect the towing system.", "Remove steering pin.", "All engines clear, thank you."] },
];

function Tutorial() {
  const [done, setDone] = useLocalFlag<number[]>("vgc.tutorial.v1", []);
  const [i, setI] = useState(0);
  const s = STEPS[i] ?? STEPS[0]!;
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
