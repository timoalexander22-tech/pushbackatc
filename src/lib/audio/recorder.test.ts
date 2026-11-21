import { afterEach, expect, it, vi } from "vitest";
import { recordWav } from "./recorder";

const mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");

afterEach(() => {
  if (mediaDevicesDescriptor)
    Object.defineProperty(navigator, "mediaDevices", mediaDevicesDescriptor);
  else Reflect.deleteProperty(navigator, "mediaDevices");
});

it("does not silently fall back when the selected microphone is unavailable", async () => {
  const getUserMedia = vi
    .fn()
    .mockRejectedValue(new DOMException("Device unavailable", "OverconstrainedError"));
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });

  await expect(recordWav("selected-device")).rejects.toMatchObject({
    name: "OverconstrainedError",
  });
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  expect(getUserMedia).toHaveBeenCalledWith({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      deviceId: { exact: "selected-device" },
    },
  });
});
