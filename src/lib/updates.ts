import { useQuery } from "@tanstack/react-query";
import { useSettings } from "./settings";
import { APP_BUILD } from "./version";
import { getLatestRelease } from "./version.functions";

export function useUpdateCheck() {
  const { settings } = useSettings();
  const q = useQuery({
    queryKey: ["latest-release"],
    queryFn: () => getLatestRelease(),
    refetchInterval: settings.autoUpdateCheck ? 10 * 60 * 1000 : false,
    refetchOnWindowFocus: settings.autoUpdateCheck,
    retry: 1,
    staleTime: 60 * 1000,
  });
  const available = !!q.data && q.data.build !== APP_BUILD;
  return { ...q, available, latest: q.data };
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
