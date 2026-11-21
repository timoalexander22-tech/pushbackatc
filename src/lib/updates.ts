import { useQuery } from "@tanstack/react-query";
import { useSettings } from "./settings";
import { APP_VERSION } from "./version";
import { getLatestRelease } from "./version.functions";
import { isNewerVersion } from "./updates-core";
import { invoke } from "@tauri-apps/api/core";

export function useUpdateCheck() {
  const { settings } = useSettings();
  const q = useQuery({
    queryKey: ["latest-release", settings.updateRepositoryUrl],
    queryFn: async () => {
      const isDesktop =
        typeof window !== "undefined" &&
        ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
      if (isDesktop) {
        try {
          const result = await invoke<{
            release: import("./updates-core").UpdateRelease | null;
            configured: boolean;
          }>("check_latest_release", {
            repository: settings.updateRepositoryUrl,
          });
          return {
            build: 0,
            version: APP_VERSION,
            companion: "unknown",
            ...result,
          };
        } catch (error) {
          return {
            build: 0,
            version: APP_VERSION,
            companion: "unknown",
            release: null,
            configured: true,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
      return getLatestRelease();
    },
    refetchInterval: settings.autoUpdateCheck ? 10 * 60 * 1000 : false,
    refetchOnWindowFocus: settings.autoUpdateCheck,
    retry: 1,
    staleTime: 60 * 1000,
  });
  const available =
    !!q.data?.release &&
    q.data.release.version !== undefined &&
    (() => {
      try {
        return isNewerVersion(APP_VERSION, q.data.release.version);
      } catch {
        return false;
      }
    })();
  const statusError =
    q.data?.error ??
    (q.data && q.data.configured === false
      ? "GitHub-Repository ist nicht konfiguriert."
      : null);
  return { ...q, available, latest: q.data?.release ?? null, statusError };
}

/** Load the newest deployment, dropping any cached assets first. */
export async function applyUpdate() {
  try {
    if ("serviceWorker" in navigator)
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.update();
    if ("caches" in window) for (const k of await caches.keys()) await caches.delete(k);
  } catch {
    // Cache cleanup is best effort; the cache-busting reload below still fetches the new build.
  }
  const url = new URL(location.href);
  url.searchParams.set("v", Date.now().toString(36));
  location.replace(url.toString());
}
