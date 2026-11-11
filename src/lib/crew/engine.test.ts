import { describe, expect, it } from "vitest";
import { completePush, handlePilot, initialState } from "./engine";

const run = (cmds: string[], s = initialState()) => cmds.reduce((st, c) => handlePilot(st, c).state, s);

describe("crew engine", () => {
  it("refuses pushback while ground equipment is attached", () => {
    const s = run(["Ground, cockpit, how do you read?", "Ready for pushback."]);
    expect(s.phase).toBe("connected");
  });

  it("refuses steering pin removal before towbar disconnect", () => {
    let s = run(["Ground, cockpit", "Confirm ground equipment clear.", "Ready for pushback.", "Brakes released."]);
    s = completePush(s).state;
    s = run(["Parking brake set.", "Remove steering pin."], s);
    expect(s.pinInserted).toBe(true);
  });

  it("completes full flow", () => {
    let s = run(["Ground, cockpit", "Confirm ground equipment clear.", "Ready for pushback.", "Brakes released."]);
    expect(s.phase).toBe("pushing");
    s = completePush(s).state;
    s = run(["Parking brake set.", "Disconnect the towing system.", "Remove steering pin.", "All engines clear."], s);
    expect(s.phase).toBe("complete");
  });

  it("understands pushback facing a compass direction", () => {
    const s = run(["Ground, cockpit", "Confirm ground equipment clear.", "Pushback facing west."]);
    expect(s.facing).toBe("west");
    expect(s.phase).toBe("awaiting_release");
    expect(s.log.at(-1)?.text).toContain("facing west");
  });
});
