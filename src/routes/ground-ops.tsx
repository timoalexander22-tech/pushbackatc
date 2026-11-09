import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useCrew } from "@/lib/crew/store";
import { equipmentClear, GROUND_ITEMS } from "@/lib/crew/engine";
import { pageHead } from "@/lib/meta";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ground-ops")({
  head: pageHead("Ground Operations", "Bodenstrom, Türen, Bremsklötze, Betankung und Catering vor dem Pushback verwalten."),
  component: GroundOps,
});

function GroundOps() {
  const { state, toggle, say } = useCrew();
  const locked = !["idle", "connected", "ready"].includes(state.phase);
  const clear = equipmentClear(state);
  return (
    <>
      <PageHeader title="Ground Ops" subtitle="Tippe auf eine Position, um sie umzuschalten – oder lass die Crew alles freimachen.">
        <Button variant="cockpit" size="touch" disabled={locked || clear} onClick={() => say("Confirm ground equipment clear.")}>
          Equipment clear anfordern
        </Button>
      </PageHeader>
      {locked && <p className="mb-4 rounded-xl bg-secondary px-4 py-3 text-sm text-muted-foreground">Während des Pushbacks gesperrt.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {GROUND_ITEMS.map((it) => {
          const on = state.ground[it.id];
          return (
            <button
              key={it.id}
              disabled={locked}
              onClick={() => toggle(it.id)}
              className={cn("panel flex min-h-28 flex-col justify-between p-4 text-left transition-transform active:scale-[0.98] disabled:opacity-60", on && "border-warning/60")}
            >
              <span className="font-display text-lg uppercase">{it.label}</span>
              <span className={cn("flex items-center gap-2 text-sm", on ? "text-warning" : "text-success")}>
                <span className={cn("size-2.5 rounded-full", on ? "bg-warning" : "bg-success")} />
                {on ? it.active : it.inactive}
              </span>
            </button>
          );
        })}
      </div>
      <div className={cn("panel mt-5 p-5 font-display text-2xl uppercase", clear ? "text-success" : "text-warning")}>
        {clear ? "Ground equipment clear – bereit für Pushback" : "Equipment noch am Flugzeug"}
      </div>
    </>
  );
}
