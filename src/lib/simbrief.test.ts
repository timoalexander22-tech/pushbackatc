import { describe, expect, it } from "vitest";
import { parseSimbriefFlight, simbriefIdentity, simbriefSettings } from "./simbrief";

const ofp = { origin: { icao_code: "EDDF", name: "Frankfurt", plan_rwy: "25C" }, destination: { icao_code: "EGLL", plan_rwy: "27R" }, atc: { callsign: "DLH123" }, general: { icao_aircraft: "A320" } };
describe("SimBrief flight context", () => {
  it("imports departure airport and callsign", () => {
    expect(simbriefSettings(parseSimbriefFlight(ofp, "2026-11-12T16:45:00Z"))).toEqual({ airport: "EDDF", callsign: "DLH123" });
  });
  it("keeps planned runway separate from pushback direction and live position", () => {
    const flight = parseSimbriefFlight(ofp, "2026-11-12T16:45:00Z");
    expect(flight.departureRunway).toBe("25C");
    expect(Object.keys(simbriefSettings(flight))).toEqual(["airport", "callsign"]);
  });
  it("rejects nonnumeric pilot IDs and empty identifiers", () => {
    expect(simbriefIdentity.safeParse({ kind: "userid", value: "abc" }).success).toBe(false);
    expect(simbriefIdentity.safeParse({ kind: "username", value: "" }).success).toBe(false);
    expect(simbriefIdentity.safeParse({ kind: "userid", value: "123456" }).success).toBe(true);
  });
  it("does not accept missing airport information", () => {
    expect(() => parseSimbriefFlight({ origin: { icao_code: "EDDF" } }, "2026-11-12T16:45:00Z")).toThrow();
  });
});