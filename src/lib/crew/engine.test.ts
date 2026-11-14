import { describe, expect, it } from "vitest";
import { completePush, handlePilot, initialState, simEvent } from "./engine";
const run = (cmds: string[], s = initialState()) =>
  cmds.reduce((st, c) => handlePilot(st, c).state, s);
const ready = () => run(["Ground, go ahead."]);
const pushing = () =>
  run(["Roger, we have pushback clearance, facing north. Brakes are released."], ready());

describe("simulator events", () => {
  it("ignores brake release outside the release phase", () => {
    const s = ready();
    expect(simEvent(s, { type: "brakeReleased" }).state.phase).toBe(s.phase);
  });
  it("starts the push when the real parking brake is released", () => {
    const s = run(["Roger, we have pushback clearance, facing north."], ready());
    if (s.phase !== "awaiting_release") return;
    const r = simEvent(s, { type: "brakeReleased" });
    expect(r.state.phase).toBe("pushing");
    expect(r.effects).toContainEqual({ type: "startPush" });
  });
  it("disconnects the tug when the brake is set after the push", () => {
    const done = completePush(pushing()).state;
    const r = simEvent(done, { type: "brakeSet" });
    if (done.phase === "push_complete") expect(r.state.phase).toBe("disconnecting");
  });
  it("records engine starts once", () => {
    const r = simEvent(initialState(), { type: "engineStarted", engine: 1 });
    expect(r.state.enginesRunning[1]).toBe(true);
    expect(simEvent(r.state, { type: "engineStarted", engine: 1 }).state).toBe(r.state);
  });
});

describe("crew engine", () => {
  it("prepares doors, chocks and bypass pin on the pilot go-ahead", () => {
    const s = ready();
    expect(s.phase).toBe("ready");
    expect(Object.values(s.ground)).toEqual(Array(8).fill(false));
    expect(s.pinInserted).toBe(true);
  });
  it("refuses pushback while ground equipment is attached", () => {
    expect(run(["Ground, cockpit", "Ready for pushback."]).phase).toBe("connected");
  });
  it("refuses preparation while refuelling", () => {
    const s = initialState();
    s.ground.fuel = true;
    const r = handlePilot(s, "Ground, go ahead.");
    expect(r.state.ground.fuel).toBe(true);
    expect(r.state.phase).toBe("idle");
  });
  it("starts pushback facing north from the combined clearance and released-brakes call", () => {
    const r = handlePilot(
      ready(),
      "Roger, we have pushback clearance, facing north. Brakes are released.",
    );
    expect(r.state.phase).toBe("pushing");
    expect(r.state.facing).toBe("north");
    expect(r.state.towbarConnected).toBe(true);
    expect(r.effects).toContainEqual({ type: "startPush" });
  });
  it("starts engines two and one when both are explicitly requested", () => {
    const s = run(["Starting engines two and one."], pushing());
    expect(s.enginesRunning).toEqual({ 1: true, 2: true });
  });
  it("does not guess an unspecified engine", () => {
    expect(run(["Starting engines."], pushing()).enginesRunning).toEqual({ 1: false, 2: false });
  });
  it("does not guess contradictory compass directions", () => {
    expect(run(["Pushback facing north or south. Brakes released."], ready()).phase).toBe("ready");
  });
  it("does not push on a negated or contradictory brake release", () => {
    for (const text of [
      "Pushback facing north. Brakes not released.",
      "Pushback facing north. Brakes released and set.",
    ])
      expect(run([text], ready()).phase).toBe("ready");
  });
  it("keeps the towbar attached until the parking brake is confirmed after push", () => {
    const s = completePush(pushing()).state;
    expect(s.phase).toBe("push_complete");
    expect(s.towbarConnected).toBe(true);
    expect(s.pinInserted).toBe(true);
  });
  it("automatically disconnects towbar and bypass pin on parking brake confirmation", () => {
    const s = run(["Parking brake is set."], completePush(pushing()).state);
    expect(s.phase).toBe("disconnecting");
    expect(s.towbarConnected).toBe(false);
    expect(s.pinInserted).toBe(false);
  });
  it("refuses steering pin removal before towbar disconnect", () => {
    expect(run(["Remove steering pin."], pushing()).pinInserted).toBe(true);
  });
  it("completes on the standing-by-on-left acknowledgement", () => {
    const s = run(
      ["Parking brake is set.", "Roger, standing by on the left. Have a safe flight!"],
      completePush(run(["Starting engines two and one."], pushing())).state,
    );
    expect(s.phase).toBe("complete");
    expect(s.enginesRunning).toEqual({ 1: true, 2: true });
  });
  it("does not finish on an early farewell", () => {
    expect(run(["Roger, standing by on the left. Have a safe flight!"], pushing()).phase).toBe(
      "pushing",
    );
  });
  it("supports separate push and brake calls facing west", () => {
    const s = run(["Ready for pushback, facing west.", "Brakes released."], ready());
    expect(s.phase).toBe("pushing");
    expect(s.facing).toBe("west");
  });
});
