import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Link, Loader2, Pencil, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchSimbrief } from "@/lib/simbrief.functions";
import { simbriefIdentity, simbriefSettings, type SimbriefFlight } from "@/lib/simbrief";
import { useLocalFlag, useSettings } from "@/lib/settings";

export function SimbriefPanel() {
  const { settings, update } = useSettings();
  const [flight, saveFlight] = useLocalFlag<SimbriefFlight | null>("vgc.simbrief.flight.v1", null);
  const fetchFlight = useServerFn(fetchSimbrief);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const savedIdentity = simbriefIdentity.safeParse({ kind: settings.simbriefKind, value: settings.simbriefId }).success;
  const load = async () => {
    const parsed = simbriefIdentity.safeParse({ kind: settings.simbriefKind, value: settings.simbriefId });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Bitte Kennung prüfen."); return; }
    setBusy(true); setError("");
    try {
      const result = await fetchFlight({ data: parsed.data });
      if (result.error) { setError(result.error); return; }
      if (result.flight) { saveFlight(result.flight); update(simbriefSettings(result.flight)); }
    } catch { setError("Flugplan konnte nicht abgerufen werden. Bitte Verbindung prüfen."); }
    finally { setBusy(false); }
  };
  return (
    <section className="mb-6 border-y border-border py-5" aria-labelledby="simbrief-title">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="simbrief-title" className="font-display text-2xl uppercase">SimBrief</h2>
        {flight && <Button variant="panel" size="icon" aria-label="SimBrief-Flugplan entfernen" title="Flugplan entfernen" onClick={() => saveFlight(null)}><Unplug /></Button>}
      </div>
      {savedIdentity && !editing && <div className="mb-3 flex flex-wrap items-center gap-3">
        <Link className="size-4 text-primary" />
        <span className="text-sm">{settings.simbriefKind === "userid" ? "Pilot-ID" : "Benutzername"}: <strong>{settings.simbriefId}</strong> · Auf diesem Gerät gespeichert</span>
        <Button variant="panel" size="icon" aria-label="SimBrief-Kennung ändern" title="Kennung ändern" onClick={() => setEditing(true)}><Pencil /></Button>
      </div>}
      <div className="flex flex-wrap items-end gap-3">
        {(!savedIdentity || editing) && <>
        <label className="space-y-1 text-sm">Kennung
          <select aria-label="SimBrief-Kennungstyp" className="block h-12 w-full rounded-lg border border-input bg-secondary px-3" value={settings.simbriefKind} disabled={busy} onChange={(e) => { update({ simbriefKind: e.target.value === "username" ? "username" : "userid" }); saveFlight(null); setError(""); }}>
            <option value="userid">Pilot-ID</option><option value="username">Benutzername</option>
          </select>
        </label>
        <label className="min-w-0 flex-1 space-y-1 text-sm">{settings.simbriefKind === "userid" ? "SimBrief Pilot-ID" : "SimBrief Benutzername"}
          <input aria-label="SimBrief-Kennung" className="block h-12 w-full rounded-lg border border-input bg-secondary px-3" value={settings.simbriefId} maxLength={64} disabled={busy} inputMode={settings.simbriefKind === "userid" ? "numeric" : "text"} autoCapitalize="none" autoCorrect="off" onChange={(e) => { update({ simbriefId: e.target.value }); saveFlight(null); setError(""); }} />
        </label>
        </>}
        <Button variant="cockpit" size="touch" disabled={busy} onClick={() => void load()}>{busy ? <Loader2 className="animate-spin" /> : <Download />}{busy ? "Abrufen…" : "Flugplan abrufen"}</Button>
        {editing && savedIdentity && <Button variant="panel" size="touch" onClick={() => setEditing(false)}>Fertig</Button>}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {flight && <div className="mt-4 space-y-2" aria-live="polite">
        <p className="font-display text-2xl text-primary">{flight.origin} → {flight.destination}</p>
        <p className="text-sm">{flight.originName} → {flight.destinationName}</p>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[['Rufzeichen', flight.callsign], ['Flugzeug', flight.aircraft], ['Startbahn (geplant)', flight.departureRunway], ['Landebahn (geplant)', flight.arrivalRunway]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-mono">{value || "Nicht angegeben"}</dd></div>)}
        </dl>
        <p className="text-xs text-muted-foreground">Letzter Abruf: {new Date(flight.importedAt).toLocaleString("de-DE")}</p>
      </div>}
      <p className="mt-3 text-sm text-muted-foreground">Flugplandaten, keine Live-Position. Standplatz und Pushback-Richtung bleiben unbestätigt.</p>
    </section>
  );
}