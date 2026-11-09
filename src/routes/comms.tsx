import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { CommandInput, RadioLog } from "@/components/RadioPanel";
import { useCrew } from "@/lib/crew/store";
import { PHASE_LABEL, suggestions } from "@/lib/crew/engine";
import { useSettings } from "@/lib/settings";

export const Route = createFileRoute("/comms")({
  head: () => ({
    meta: [
      { title: "Funk · Virtual Ground Crew Pro" },
      { name: "description", content: "Sprich mit der Bodencrew per Mikrofon oder Texteingabe – realistische englische Funkdialoge." },
      { property: "og:title", content: "Ground Crew Communication" },
      { property: "og:description", content: "Realistischer Interphone-Funk mit der Bodencrew." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Comms,
});

function Comms() {
  const { state, say } = useCrew();
  const { settings } = useSettings();
  return (
    <>
      <PageHeader title="Ground Crew" subtitle="Interphone-Verbindung zur Bodencrew. Sprich oder tippe englische Kommandos.">
        <span className="rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 font-display uppercase text-primary">{PHASE_LABEL[state.phase]}</span>
      </PageHeader>
      <div className="space-y-4">
        <RadioLog log={state.log} empty={'Beginne mit „Ground, cockpit, how do you read?“'} />
        <CommandInput onSend={say} suggestions={settings.showSuggestions ? suggestions(state) : undefined} />
      </div>
    </>
  );
}
