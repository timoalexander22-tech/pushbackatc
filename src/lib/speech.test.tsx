import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("./tts/tts.functions", () => ({ crewSpeech: vi.fn() }));
import { useRecognition } from "./speech";

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  onstart: (() => void) | null = null;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  constructor() { FakeRecognition.instances.push(this); }
}
function latestRecognition() {
  const recognition = FakeRecognition.instances.at(-1);
  if (!recognition) throw new Error("Recognition was not created");
  return recognition;
}
beforeEach(() => {
  FakeRecognition.instances = [];
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: FakeRecognition });
});
afterEach(cleanup);

it("buffers speech and sends only after release", () => {
  const send = vi.fn();
  const { result } = renderHook(() => useRecognition(send));
  act(() => result.current.start());
  const r = latestRecognition();
  act(() => r.onstart?.());
  act(() => r.onresult?.({ results: [{ 0: { transcript: "Ground cockpit" }, isFinal: true }], resultIndex: 0 }));
  expect(send).not.toHaveBeenCalled();
  expect(result.current.listening).toBe(true);
  act(() => result.current.stop());
  expect(r.stop).toHaveBeenCalledTimes(1);
  expect(result.current.listening).toBe(false);
  act(() => r.onend?.());
  expect(send).toHaveBeenCalledWith("Ground cockpit");
  expect(send).toHaveBeenCalledTimes(1);
});

it("stops if released while microphone permission is still pending", () => {
  const { result } = renderHook(() => useRecognition(vi.fn()));
  act(() => result.current.start());
  const r = latestRecognition();
  act(() => result.current.stop());
  act(() => r.onstart?.());
  expect(r.stop).toHaveBeenCalledTimes(1);
  expect(result.current.listening).toBe(false);
});

it("discards a cancelled call and aborts the microphone", () => {
  const send = vi.fn();
  const { result } = renderHook(() => useRecognition(send));
  act(() => result.current.start());
  const r = latestRecognition();
  act(() => r.onstart?.());
  act(() => r.onresult?.({ results: [{ 0: { transcript: "pushback" }, isFinal: true }], resultIndex: 0 }));
  act(() => result.current.cancel());
  act(() => r.onend?.());
  expect(r.abort).toHaveBeenCalledTimes(1);
  expect(send).not.toHaveBeenCalled();
  expect(result.current.listening).toBe(false);
});