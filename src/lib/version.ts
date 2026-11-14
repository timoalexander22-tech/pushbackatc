declare const __APP_BUILD__: string;

export type ChangelogEntry = { version: string; date: string; items: string[] };

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.2.0",
    date: "2026-11-14",
    items: [
      "Neues Update-Fenster: nach Updates suchen und mit einem Klick aktualisieren.",
      "Simulator-Synchronisation mit MSFS 2020 über das Windows-Companion (SimConnect).",
      "Parkbremse und Triebwerksstart aus dem Simulator lösen die passenden Crew-Calls aus.",
      "Pushback wird im Simulator gesteuert (gerade, Heck links/rechts, Ausrichtung nach Kompass).",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-11-01",
    items: [
      "SimBrief-Import des letzten Flugplans.",
      "Natürliche Online-Crewstimmen je Flughafen.",
      "Zwei frei belegbare Push-to-Talk-Tasten.",
    ],
  },
];

export const APP_VERSION = CHANGELOG[0]?.version ?? "0.0.0";
/** Unique per build; differs between the running page and a newer deployment. */
export const APP_BUILD = typeof __APP_BUILD__ === "string" ? __APP_BUILD__ : "dev";
