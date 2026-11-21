import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { parseSimbriefFlight, simbriefIdentity, type SimbriefFlight } from "./simbrief";

export const fetchSimbrief = createServerFn({ method: "POST" })
  .validator((input: { kind: "userid" | "username"; value: string }) => simbriefIdentity.parse(input))
  .handler(async ({ data }): Promise<{ flight: SimbriefFlight; error?: never } | { error: string; flight?: never }> => {
    setResponseHeader("Cache-Control", "no-store");
    const url = new URL("https://www.simbrief.com/api/xml.fetcher.php");
    url.searchParams.set(data.kind, data.value);
    url.searchParams.set("json", "1");
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: "application/json" } });
      if (!response.ok) return { error: response.status === 400 ? "Kein Flugplan gefunden. Prüfe deine SimBrief-Kennung und erstelle dort einen Flugplan." : `SimBrief ist momentan nicht verfügbar (${response.status}).` };
      const input: unknown = await response.json();
      const flight = parseSimbriefFlight(input, new Date().toISOString());
      return { flight };
    } catch {
      return { error: "SimBrief konnte keinen gültigen Flugplan liefern. Bitte später erneut versuchen." };
    }
  });