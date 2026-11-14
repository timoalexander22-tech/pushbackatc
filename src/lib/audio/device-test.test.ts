import { expect, it, vi } from "vitest";
import { playDeviceTest, speakerTestTone } from "./device-test";

it("routes the test to the selected speaker before playback", async () => {
  const setSinkId = vi.fn(async () => {});
  const play = vi.fn(async () => {});
  await playDeviceTest({ setSinkId, play } as unknown as HTMLAudioElement, "headset-output");
  expect(setSinkId).toHaveBeenCalledWith("headset-output");
  expect(setSinkId.mock.invocationCallOrder[0]).toBeLessThan(play.mock.invocationCallOrder[0]);
});

it("does not silently use another output when routing fails", async () => {
  const play = vi.fn();
  const audio = { setSinkId: vi.fn(async () => { throw new Error("Unavailable"); }), play };
  await expect(playDeviceTest(audio as unknown as HTMLAudioElement, "missing")).rejects.toThrow("Unavailable");
  expect(play).not.toHaveBeenCalled();
});

it("produces an audible WAV test without an online service", () => {
  expect(speakerTestTone().type).toBe("audio/wav");
  expect(speakerTestTone().size).toBe(48044);
});