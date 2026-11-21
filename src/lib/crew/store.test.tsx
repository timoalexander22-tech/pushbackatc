import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CrewProvider, useCrew } from "./store";

const simMock = vi.hoisted(() => ({
  current: {
    status: "off",
    send: vi.fn(),
    onPushDone: vi.fn(() => () => {}),
  },
}));

vi.mock("../sim/store", () => ({
  useSim: () => simMock.current,
}));

vi.mock("../speech", () => ({
  speak: vi.fn(),
  stopSpeech: vi.fn(),
}));

vi.mock("../settings", () => ({
  readSettings: () => ({ defaultDirection: "straight", pushSeconds: 5 }),
}));

function TestCrew() {
  const { say, setDirection, state } = useCrew();
  return (
    <>
      <button onClick={() => say("Ground, go ahead.")}>Prepare</button>
      <button
        onClick={() => say("Roger, we have pushback clearance, facing north. Brakes are released.")}
      >
        Start pushback
      </button>
      <button onClick={() => setDirection("left")}>Steer left</button>
      <output>{state.phase}</output>
    </>
  );
}

describe("crew simulator pushback integration", () => {
  beforeEach(() => {
    simMock.current = {
      status: "off",
      send: vi.fn(),
      onPushDone: vi.fn(() => () => {}),
    };
  });

  it("does not start a simulator push when the companion connects mid-push", () => {
    const view = render(
      <CrewProvider>
        <TestCrew />
      </CrewProvider>,
    );
    fireEvent.click(screen.getByText("Prepare"));
    fireEvent.click(screen.getByText("Start pushback"));
    expect(screen.getByText("pushing")).toBeInTheDocument();

    const send = simMock.current.send;
    simMock.current = { ...simMock.current, status: "live" };
    view.rerender(
      <CrewProvider>
        <TestCrew />
      </CrewProvider>,
    );

    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ cmd: "push_start" }));
  });

  it("starts a simulator push when the companion is live at pushback start", () => {
    const send = vi.fn();
    simMock.current = {
      status: "live",
      send,
      onPushDone: vi.fn(() => () => {}),
    };
    render(
      <CrewProvider>
        <TestCrew />
      </CrewProvider>,
    );
    fireEvent.click(screen.getByText("Prepare"));
    fireEvent.click(screen.getByText("Start pushback"));

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "cmd", cmd: "push_start", facing: "north" }),
    );
  });

  it("sends live steering commands while a simulator push is in progress", () => {
    const send = vi.fn();
    simMock.current = {
      status: "live",
      send,
      onPushDone: vi.fn(() => () => {}),
    };
    render(
      <CrewProvider>
        <TestCrew />
      </CrewProvider>,
    );
    fireEvent.click(screen.getByText("Prepare"));
    fireEvent.click(screen.getByText("Start pushback"));
    fireEvent.click(screen.getByText("Steer left"));

    expect(send).toHaveBeenCalledWith({
      type: "cmd",
      cmd: "push_steer",
      direction: "left",
    });
  });

  it("falls back to the timed push when the companion disconnects", () => {
    vi.useFakeTimers();
    try {
      simMock.current = {
        status: "live",
        send: vi.fn(),
        onPushDone: vi.fn(() => () => {}),
      };
      const view = render(
        <CrewProvider>
          <TestCrew />
        </CrewProvider>,
      );
      fireEvent.click(screen.getByText("Prepare"));
      fireEvent.click(screen.getByText("Start pushback"));
      expect(screen.getByText("pushing")).toBeInTheDocument();

      simMock.current = { ...simMock.current, status: "searching" };
      view.rerender(
        <CrewProvider>
          <TestCrew />
        </CrewProvider>,
      );
      act(() => vi.advanceTimersByTime(5200));

      expect(screen.getByText("push_complete")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
