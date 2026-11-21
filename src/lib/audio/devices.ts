export type AudioDeviceKind = "microphone" | "speaker";

export type AudioDevice = {
  deviceId: string;
  label: string;
  kind: AudioDeviceKind;
  type: string;
  isDefault: boolean;
  state: "active" | "removed";
};

export function resolveAvailableDevice(
  savedDeviceId: string,
  devices: readonly AudioDevice[],
): string {
  if (savedDeviceId && devices.some((device) => device.deviceId === savedDeviceId)) {
    return savedDeviceId;
  }
  return devices.find((device) => device.isDefault)?.deviceId ?? devices[0]?.deviceId ?? "";
}

export function describeMediaDevice(device: MediaDeviceInfo, kind: AudioDeviceKind): AudioDevice {
  const label = device.label.trim();
  const isDefault =
    device.deviceId === "default" ||
    /^default\b/i.test(label);
  return {
    deviceId: device.deviceId,
    label: label || (kind === "microphone" ? "Unbenanntes Mikrofon" : "Unbenannter Lautsprecher"),
    kind,
    type: kind === "microphone" ? "Aufnahmegerät" : "Wiedergabegerät",
    isDefault,
    state: device.deviceId ? "active" : "removed",
  };
}
