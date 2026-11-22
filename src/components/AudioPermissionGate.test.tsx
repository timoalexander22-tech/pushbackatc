import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AudioPermissionGate } from "./AudioPermissionGate";

afterEach(() => {
  sessionStorage.clear();
  delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: undefined,
  });
});

it("shows Windows and WebView2 troubleshooting when microphone access is denied", async () => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi
        .fn()
        .mockRejectedValue(new DOMException("Permission denied", "NotAllowedError")),
    },
  });

  render(
    <AudioPermissionGate>
      <div>App</div>
    </AudioPermissionGate>,
  );
  fireEvent.click(await screen.findByRole("button", { name: /zugriff erlauben/i }));

  await waitFor(() => {
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Windows oder WebView2 hat den Mikrofonzugriff blockiert.",
    );
  });
  expect(screen.getByRole("alert")).toHaveTextContent("Windows-Richtlinie");
  expect(screen.getByRole("alert")).toHaveTextContent("vollständig");
});
