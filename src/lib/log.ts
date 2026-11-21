export type LogLevel = "info" | "warning" | "error";

export async function writeAppLog(level: LogLevel, message: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("__TAURI_INTERNALS__" in window || "__TAURI__" in window)) {
    console[level === "error" ? "error" : level === "warning" ? "warn" : "log"](message);
    return;
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("write_app_log", { level, message });
  } catch (error) {
    console.error("Log could not be written", error);
  }
}
