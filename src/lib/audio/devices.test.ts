import { describe, expect, it } from "vitest";
import { resolveAvailableDevice, describeMediaDevice } from "./devices";

describe("audio device selection", () => {
  it("keeps a saved device when it is still available", () => {
    expect(
      resolveAvailableDevice("usb-mic", [
        { deviceId: "default", label: "Default", kind: "microphone", type: "Aufnahmegerät", isDefault: true, state: "active" },
        { deviceId: "usb-mic", label: "USB Mic", kind: "microphone", type: "Aufnahmegerät", isDefault: false, state: "active" },
      ]),
    ).toBe("usb-mic");
  });

  it("falls back to the Windows default and then to the first device", () => {
    const devices = [
      { deviceId: "speaker-a", label: "Speaker A", kind: "speaker" as const, type: "Wiedergabegerät", isDefault: false, state: "active" as const },
      { deviceId: "default", label: "Default", kind: "speaker" as const, type: "Wiedergabegerät", isDefault: true, state: "active" as const },
    ];
    expect(resolveAvailableDevice("removed", devices)).toBe("default");
  });

  it("describes devices without fixed names or indexes", () => {
    const info = { deviceId: "stable-id", kind: "audioinput", label: "USB Headset", groupId: "group", toJSON: () => ({}) } as MediaDeviceInfo;
    expect(describeMediaDevice(info, "microphone").deviceId).toBe("stable-id");
  });
});
