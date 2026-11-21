import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen, Puzzle, RefreshCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/meta";
import { useEnabledPlugins } from "@/lib/plugins/store";
import { writeAppLog } from "@/lib/log";

type PluginInfo = {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  entry_point: string;
  api_version: string;
  folder: string;
  error: string | null;
};

export const Route = createFileRoute("/plugins")({
  head: pageHead("Plugins", "Community-Erweiterungen verwalten."),
  component: PluginsPage,
});

function PluginsPage() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { enabled, setPluginEnabled } = useEnabledPlugins();

  const desktopAvailable =
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

  const load = useCallback(async () => {
    if (!desktopAvailable) {
      setError("Die Community-Ordnerverwaltung ist nur in der Windows-App verfügbar.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const found = await invoke<PluginInfo[]>("list_plugins");
      setPlugins(found);
      await writeAppLog("info", `Plugins geladen: ${found.length}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Plugins konnten nicht geladen werden.");
      await writeAppLog("error", `Plugin-Laden fehlgeschlagen: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [desktopAvailable]);

  useEffect(() => {
    void load();
  }, [load]);

  const openFolder = async () => {
    if (!desktopAvailable) return;
    try {
      await invoke("open_plugin_folder");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Community-Ordner konnte nicht geöffnet werden.");
    }
  };

  return (
    <>
      <PageHeader title="Plugins" subtitle="Erweiterungen werden aus dem lokalen Community-Ordner geladen." />
      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Puzzle className="size-6 text-primary" aria-hidden="true" />
            <div>
              <div className="font-display text-xl uppercase">Community-Erweiterungen</div>
              <div className="text-sm text-muted-foreground">
                Nur gültige Manifeste für API-Version 1.0 werden zugelassen.
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="panel" size="touch" disabled={loading} onClick={() => void load()}>
              <RefreshCw className="size-4" aria-hidden="true" /> Neu laden
            </Button>
            <Button variant="panel" size="touch" disabled={!desktopAvailable} onClick={() => void openFolder()}>
              <FolderOpen className="size-4" aria-hidden="true" /> Ordner öffnen
            </Button>
          </div>
        </div>
      </section>

      {error && (
        <p role="alert" className="mt-4 flex items-center gap-2 text-sm text-destructive">
          <TriangleAlert className="size-4" aria-hidden="true" /> {error}
        </p>
      )}

      <section className="mt-5 grid gap-4">
        {plugins.map((plugin) => {
          const active = enabled.includes(plugin.id);
          return (
            <article key={plugin.folder} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl uppercase">{plugin.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    Version {plugin.version} · {plugin.author} · API {plugin.api_version}
                  </p>
                  {plugin.description && (
                    <p className="mt-2 max-w-2xl text-sm">{plugin.description}</p>
                  )}
                  {plugin.error && (
                    <p role="alert" className="mt-2 text-sm text-destructive">
                      Deaktiviert: {plugin.error}
                    </p>
                  )}
                </div>
                <Button
                  variant={active ? "panel" : "cockpit"}
                  size="touch"
                  disabled={!!plugin.error}
                  onClick={() => setPluginEnabled(plugin.id, !active)}
                >
                  {active ? "Deaktivieren" : "Aktivieren"}
                </Button>
              </div>
            </article>
          );
        })}
        {!loading && plugins.length === 0 && (
          <div className="panel p-5 text-sm text-muted-foreground">
            Noch keine Plugins gefunden. Öffne den Community-Ordner und lege einen Plugin-Unterordner mit
            einer gültigen <code>plugin.json</code> an.
          </div>
        )}
      </section>
    </>
  );
}
