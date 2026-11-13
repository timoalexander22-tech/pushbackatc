import { z } from "zod";

export const simbriefIdentity = z.object({
  kind: z.enum(["userid", "username"]),
  value: z.string().trim().min(1, "Bitte Pilot-ID oder Benutzername eingeben.").max(64).regex(/^[a-zA-Z0-9_.@-]+$/, "Ungültige Pilot-ID oder Benutzername."),
}).superRefine((data, ctx) => {
  if (data.kind === "userid" && !/^\d+$/.test(data.value)) ctx.addIssue({ code: "custom", message: "Die Pilot-ID besteht nur aus Ziffern.", path: ["value"] });
});

const text = z.union([z.string(), z.number()]).transform(String);
const airport = z.object({ icao_code: z.string().regex(/^[A-Z0-9]{4}$/), name: text.optional(), plan_rwy: text.optional() });
const ofp = z.object({
  origin: airport,
  destination: airport,
  general: z.object({ icao_airline: text.optional(), flight_number: text.optional(), icao_aircraft: text.optional() }).optional(),
  atc: z.object({ callsign: text.optional() }).optional(),
});
export type SimbriefFlight = {
  origin: string; originName: string; destination: string; destinationName: string;
  departureRunway: string; arrivalRunway: string; callsign: string; aircraft: string; importedAt: string;
};

export function parseSimbriefFlight(input: unknown, importedAt: string): SimbriefFlight {
  const data = ofp.parse(input);
  return {
    origin: data.origin.icao_code, originName: data.origin.name ?? "",
    destination: data.destination.icao_code, destinationName: data.destination.name ?? "",
    departureRunway: data.origin.plan_rwy ?? "", arrivalRunway: data.destination.plan_rwy ?? "",
    callsign: data.atc?.callsign ?? `${data.general?.icao_airline ?? ""}${data.general?.flight_number ?? ""}`,
    aircraft: data.general?.icao_aircraft ?? "", importedAt,
  };
}

// A runway identifies planned departure, not stand position or pushback heading.
export function simbriefSettings(flight: SimbriefFlight) {
  return { airport: flight.origin, callsign: flight.callsign };
}