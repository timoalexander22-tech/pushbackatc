import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("./tts/tts.functions", () => ({ crewSpeech: vi.fn() }));
vi.mock("./audio/stt.functions", () => ({ transcribeRadio: vi.fn() }));
import { useRecognition } from "./speech";

afterEach(cleanup);
const fakeRecording = () => ({ stop: vi.fn(async () => new Blob([new Uint8Array(20000)])), cancel: vi.fn() });

it("transcribes and sends only after release", async () => {
  const send = vi.fn();
  const rec = fakeRecording();
  const transcribe = vi.fn(async () => ({ text: "Ground, go ahead" }));
  const { result } = renderHook(() => useRecognition(send, { record: async () => rec, transcribe }));
  act(() => result.current.start());
  expect(result.current.listening).toBe(true);
  expect(send).not.toHaveBeenCalled();
  act(() => result.current.stop());
  await waitFor(() => expect(send).toHaveBeenCalledWith("Ground, go ahead"));
  expect(rec.stop).toHaveBeenCalledTimes(1);
  expect(result.current.listening).toBe(false);
});

it("cancel discards the recording without sending", async () => {
  const send = vi.fn();
  const rec = fakeRecording();
  const transcribe = vi.fn();
  const { result } = renderHook(() => useRecognition(send, { record: async () => rec, transcribe }));
  act(() => result.current.start());
  act(() => result.current.cancel());
  await waitFor(() => expect(rec.cancel).toHaveBeenCalled());
  expect(transcribe).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

it("rejects a too-short press", async () => {
  const send = vi.fn();
  const rec = { stop: vi.fn(async () => new Blob([new Uint8Array(100)])), cancel: vi.fn() };
  const { result } = renderHook(() => useRecognition(send, { record: async () => rec, transcribe: vi.fn() }));
  act(() => result.current.start());
  act(() => result.current.stop());
  await waitFor(() => expect(result.current.error).toMatch(/Zu kurz/));
  expect(send).not.toHaveBeenCalled();
});
