import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { CommandInput, RadioLog } from "@/components/RadioPanel";
import { Button } from "@/components/ui/button";
import { handlePilot, initialState, completePush, suggestions, PHASE_LABEL, type CrewState } from "@/lib/crew/engine";
import { pageHead } from "@/lib/meta";
import { speak } from "@/lib/speech";

export const Route = createFileRoute("/training")({
  head: pageHead("Training Mode", "Übe realistische Funkdialoge mit der Bodencrew – mit Erklärungen, welches Kommando gerade passt."),
  component: Training,
});

const EXPLAIN: Record<CrewState["phase"], string> = {
  idle: "Ground ruft: Cockpit, Ground. Antworte mit Ground, go ahead.",
  connected: "Die Abfertigung läuft. Lass Türen schließen, GPU trennen und bestätige, dass das Bodengerät entfernt ist.",
  ready: "Melde Pushback-Freigabe, Richtung und gelöste Bremsen zusammen.",
  awaiting_release: "Schlepper ist angekoppelt. Löse die Parkbremse und melde es der Crew.",
  pushing: "Pushback läuft. Melde Starting engines two and one.",
  push_complete: "Flugzeug steht. Setze die Parkbremse und melde es.",
  parked: "Starte beide Triebwerke, danach den Schlepper trennen lassen.",
  disconnecting: "Schlepper und Bypass Pin sind getrennt. Bestätige, dass du auf das Handzeichen links wartest.",
  complete: "Perfekt – Bodenabfertigung abgeschlossen! Verabschiede dich oder starte neu.",
};

function Training() {
  const [s, setS] = useState<CrewState>(() => ({ ...initialState("left") }));
  const [score, setScore] = useState({ ok: 0, miss: 0 });

  const send = (t: string) => {
    const r = handlePilot(s, t);
    const progressed = r.state.phase !== s.phase || JSON.stringify(r.state.ground) !== JSON.stringify(s.ground) || r.state.pinInserted !== s.pinInserted || JSON.stringify(r.state.enginesRunning) !== JSON.stringify(s.enginesRunning);
    let next = r.state;
    if (!progressed) {
      next = { ...next, log: [...next.log, { id: next.nextId, from: "system", text: `Nicht ganz. ${EXPLAIN[s.phase]} Tipp: „${suggestions(s)[0]}“`, at: Date.now() }], nextId: next.nextId + 1 };
    }
    setScore((sc) => (progressed ? { ...sc, ok: sc.ok + 1 } : { ...sc, miss: sc.miss + 1 }));
    setS(next);
    if (r.reply) speak(r.reply);
  };

  return (
    <>
      <PageHeader title="Training" subtitle="Szenario: Fenix A320, Gate B12, Pushback tail left. Folge den Hinweisen.">
        <div className="flex gap-2">
          <span className="rounded-full bg-success/15 px-4 py-1.5 font-display text-success">✓ {score.ok}</span>
          <span className="rounded-full bg-destructive/15 px-4 py-1.5 font-display text-destructive">✗ {score.miss}</span>
          <Button variant="panel" size="touch" onClick={() => { setS(initialState("left")); setScore({ ok: 0, miss: 0 }); }}>Neu starten</Button>
        </div>
      </PageHeader>
      <div className="panel mb-4 border-accent/40 p-4">
        <div className="font-display text-sm uppercase tracking-widest text-accent">{PHASE_LABEL[s.phase]}</div>
        <p className="mt-1">{EXPLAIN[s.phase]}</p>
        {s.phase === "pushing" && <Button className="mt-3" variant="panel" size="touch" onClick={() => { const r = completePush(s); setS(r.state); if (r.reply) speak(r.reply); }}>Pushback abschließen</Button>}
      </div>
      <div className="space-y-4">
        <RadioLog log={s.log} empty="Sprich oder tippe dein erstes Kommando." />
        <CommandInput onSend={send} suggestions={suggestions(s)} />
      </div>
    </>
  );
}
