import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("./tts/tts.functions", () => ({ crewSpeech: vi.fn() }));
vi.mock("./audio/stt.functions", () => ({ transcribeRadio: vi.fn() }));
import { transcribeRadio } from "./audio/stt.functions";
import { crewSpeech } from "./tts/tts.functions";
import { speak, useRecognition } from "./speech";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  localStorage.clear();
});
const fakeRecording = () => ({
  stop: vi.fn(async () => new Blob([new Uint8Array(20000)])),
  cancel: vi.fn(),
});

it("transcribes and sends only after release", async () => {
  const send = vi.fn();
  const rec = fakeRecording();
  const transcribe = vi.fn(async () => ({ text: "Ground, go ahead" }));
  const { result } = renderHook(() =>
    useRecognition(send, { record: async () => rec, transcribe }),
  );
  act(() => result.current.start());
  expect(result.current.listening).toBe(true);
  expect(send).not.toHaveBeenCalled();
  act(() => result.current.stop());
  await waitFor(() => expect(send).toHaveBeenCalledWith("Ground, go ahead"));
  expect(rec.stop).toHaveBeenCalledTimes(1);
  expect(result.current.listening).toBe(false);
});

it("uses the STT model selected in settings", async () => {
  localStorage.setItem("vgc.settings.v1", JSON.stringify({ sttModel: "whisper-small" }));
  vi.mocked(transcribeRadio).mockResolvedValueOnce({ text: "Ground, go ahead" });
  const send = vi.fn();
  const rec = fakeRecording();
  const { result } = renderHook(() => useRecognition(send, { record: async () => rec }));

  act(() => result.current.start());
  act(() => result.current.stop());

  await waitFor(() => expect(send).toHaveBeenCalledWith("Ground, go ahead"));
  expect(transcribeRadio).toHaveBeenCalledWith({
    data: { audio: expect.any(String), model: "whisper-small" },
  });
});

it("uses the TTS model selected in settings", async () => {
  localStorage.setItem(
    "vgc.settings.v1",
    JSON.stringify({
      speak: true,
      onlineVoice: true,
      ttsModel: "local-voice",
      outputDeviceId: "headset-output",
    }),
  );
  vi.mocked(crewSpeech).mockResolvedValueOnce({
    audio: "YXVkaW8=",
    type: "audio/mpeg",
  });
  const audioInstances: Array<{
    setSinkId: ReturnType<typeof vi.fn>;
    play: ReturnType<typeof vi.fn>;
  }> = [];
  class MockAudio {
    src: string;
    play = vi.fn(async () => {});
    pause = vi.fn();
    setSinkId = vi.fn(async () => {});
    constructor(src: string) {
      this.src = src;
      audioInstances.push(this);
    }
  }
  vi.stubGlobal("Audio", MockAudio);

  speak("Ground to cockpit.");

  await waitFor(() =>
    expect(crewSpeech).toHaveBeenCalledWith({
      data: expect.objectContaining({
        text: "Ground to cockpit.",
        model: "local-voice",
        localOnly: true,
      }),
    }),
  );
  await waitFor(() => {
    const audio = audioInstances.at(-1);
    expect(audio?.setSinkId).toHaveBeenCalledWith("headset-output");
    expect(audio?.play).toHaveBeenCalledOnce();
  });
});

it("does not fall back to the Windows voice when selected-device TTS fails", async () => {
  localStorage.setItem(
    "vgc.settings.v1",
    JSON.stringify({ speak: true, ttsModel: "local-voice", outputDeviceId: "headset-output" }),
  );
  vi.mocked(crewSpeech).mockResolvedValueOnce({ error: "Local TTS unavailable" });
  const nativeSpeak = vi.fn();
  vi.stubGlobal("speechSynthesis", { cancel: vi.fn(), speak: nativeSpeak, getVoices: () => [] });

  speak("Ground to cockpit.");

  await waitFor(() => expect(crewSpeech).toHaveBeenCalledOnce());
  expect(nativeSpeak).not.toHaveBeenCalled();
});

it("does not play generated crew audio if the selected output cannot be selected", async () => {
  localStorage.setItem(
    "vgc.settings.v1",
    JSON.stringify({ speak: true, ttsModel: "local-voice", outputDeviceId: "headset-output" }),
  );
  vi.mocked(crewSpeech).mockResolvedValueOnce({ audio: "YXVkaW8=", type: "audio/mpeg" });
  const audioInstances: Array<{
    setSinkId: ReturnType<typeof vi.fn>;
    play: ReturnType<typeof vi.fn>;
  }> = [];
  class MockAudio {
    src: string;
    play = vi.fn(async () => {});
    pause = vi.fn();
    setSinkId = vi.fn(async () => {
      throw new Error("Output unavailable");
    });
    constructor(src: string) {
      this.src = src;
      audioInstances.push(this);
    }
  }
  vi.stubGlobal("Audio", MockAudio);
  const nativeSpeak = vi.fn();
  vi.stubGlobal("speechSynthesis", { cancel: vi.fn(), speak: nativeSpeak, getVoices: () => [] });

  speak("Ground to cockpit.");

  await waitFor(() =>
    expect(audioInstances.at(-1)?.setSinkId).toHaveBeenCalledWith("headset-output"),
  );
  expect(audioInstances.at(-1)?.play).not.toHaveBeenCalled();
  expect(nativeSpeak).not.toHaveBeenCalled();
});

it("cancel discards the recording without sending", async () => {
  const send = vi.fn();
  const rec = fakeRecording();
  const transcribe = vi.fn();
  const { result } = renderHook(() =>
    useRecognition(send, { record: async () => rec, transcribe }),
  );
  act(() => result.current.start());
  act(() => result.current.cancel());
  await waitFor(() => expect(rec.cancel).toHaveBeenCalled());
  expect(transcribe).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

it("cancels a recording that becomes available after PTT was cancelled", async () => {
  const send = vi.fn();
  const rec = fakeRecording();
  let resolveRecording!: (recording: ReturnType<typeof fakeRecording>) => void;
  const recording = new Promise<ReturnType<typeof fakeRecording>>((resolve) => {
    resolveRecording = resolve;
  });
  const { result } = renderHook(() =>
    useRecognition(send, { record: () => recording, transcribe: vi.fn() }),
  );

  act(() => result.current.start());
  act(() => result.current.stop());
  act(() => result.current.cancel());
  await act(async () => resolveRecording(rec));

  await waitFor(() => expect(rec.cancel).toHaveBeenCalledOnce());
  expect(rec.stop).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

it("reports recording finalization errors instead of leaving an unhandled rejection", async () => {
  const send = vi.fn();
  const rec = {
    stop: vi.fn().mockRejectedValue(new Error("AudioContext failed")),
    cancel: vi.fn(),
  };
  const { result } = renderHook(() =>
    useRecognition(send, { record: async () => rec, transcribe: vi.fn() }),
  );

  act(() => result.current.start());
  act(() => result.current.stop());

  await waitFor(() => expect(result.current.error).toMatch(/Aufnahme oder Spracherkennung/));
  expect(send).not.toHaveBeenCalled();
});

it("rejects a too-short press", async () => {
  const send = vi.fn();
  const rec = { stop: vi.fn(async () => new Blob([new Uint8Array(100)])), cancel: vi.fn() };
  const { result } = renderHook(() =>
    useRecognition(send, { record: async () => rec, transcribe: vi.fn() }),
  );
  act(() => result.current.start());
  act(() => result.current.stop());
  await waitFor(() => expect(result.current.error).toMatch(/Zu kurz/));
  expect(send).not.toHaveBeenCalled();
});
