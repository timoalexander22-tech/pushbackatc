import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePushToTalk } from "./ptt";

afterEach(cleanup);

function setup() {
  const start = vi.fn(), stop = vi.fn(), cancel = vi.fn();
  const hook = renderHook(() => usePushToTalk(["KeyT", "KeyY"], start, stop, cancel));
  return { ...hook, start, stop, cancel };
}

describe("hold-to-talk controls", () => {
  it("does not activate until an assigned control is pressed", () => {
    const { start, result } = setup();
    fireEvent.keyDown(window, { code: "KeyA" });
    expect(start).not.toHaveBeenCalled();
    expect(result.current.pressed).toBe(false);
    fireEvent.keyDown(window, { code: "KeyT" });
    expect(start).toHaveBeenCalledTimes(1);
  });
  it.each(["KeyT", "KeyY"])("either assigned key %s starts and release stops", (code) => {
    const { start, stop, result } = setup();
    fireEvent.keyDown(window, { code });
    expect(start).toHaveBeenCalledTimes(1);
    fireEvent.keyUp(window, { code });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(result.current.pressed).toBe(false);
  });
  it("keeps the microphone on until both held keys are released", () => {
    const { start, stop, result } = setup();
    fireEvent.keyDown(window, { code: "KeyT" });
    fireEvent.keyDown(window, { code: "KeyY" });
    fireEvent.keyDown(window, { code: "KeyY", repeat: true });
    expect(start).toHaveBeenCalledTimes(1);
    fireEvent.keyUp(window, { code: "KeyT" });
    expect(stop).not.toHaveBeenCalled();
    expect(result.current.pressed).toBe(true);
    fireEvent.keyUp(window, { code: "KeyY" });
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it("combines touch and key holds and ignores duplicate releases", () => {
    const { stop, result } = setup();
    act(() => result.current.press("pointer:1"));
    fireEvent.keyDown(window, { code: "KeyY" });
    act(() => result.current.release("pointer:1"));
    expect(stop).not.toHaveBeenCalled();
    fireEvent.keyUp(window, { code: "KeyY" });
    act(() => result.current.release("pointer:1"));
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it("cancels on window focus loss", () => {
    const { result, cancel, stop } = setup();
    fireEvent.keyDown(window, { code: "KeyT" });
    fireEvent.blur(window);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(result.current.pressed).toBe(false);
    fireEvent.keyUp(window, { code: "KeyT" });
    expect(stop).not.toHaveBeenCalled();
  });
  it("does not transmit while typing or assigning a key", () => {
    const { start } = setup();
    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, { code: "KeyT" });
    expect(start).not.toHaveBeenCalled();
    input.remove();
  });
});