import { createFileRoute } from "@tanstack/react-router";
import {
  CheckCircle2,
  Download,
  Loader2,
  MonitorCog,
  RefreshCw,
  TriangleAlert,
  ExternalLink,
} from "lucide-react";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/meta";
import { useSettings } from "@/lib/settings";
import { COMPANION_DOWNLOAD, COMPANION_LATEST } from "@/lib/sim/protocol";
import { useSim } from "@/lib/sim/store";
import { useUpdateCheck } from "@/lib/updates";
import { APP_VERSION, CHANGELOG } from "@/lib/version";
import { writeAppLog } from "@/lib/log";

export const Route = createFileRoute("/updates")({
  head: pageHead(
    "Updates",
    "Nach neuen Versionen suchen, App aktualisieren und Windows-Companion prüfen.",
  ),
  component: UpdatesPage,
});

const fmt = (t: number) =>
  t ? new Date(t).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "–";

const repositoryUrl = (value: string) => {
  const trimmed = value.trim().replace(/\/$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://github.com/${trimmed.replace(/^github\.com\//i, "").replace(/\.git$/i, "")}`;
};

const normalizeRepositoryDraft = (value: string) => {
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\/github\.com\//i.test(trimmed)) {
    return trimmed
      .replace(/^https?:\/\/github\.com\//i, "")
      .replace(/\.git$/i, "");
  }
  return trimmed
    .replace(/^github\.com\//i, "")
    .replace(/^https?:\/\//i, "")
    .replace(/\.git$/i, "");
};

type GitHubConnectionDiagnosis = {
  success: boolean;
  repositoryReachable: boolean;
  authenticatedUser: string | null;
  repositoryId: number | null;
  defaultBranch: string | null;
  usedBranch: string | null;
  permissions: Record<string, boolean> | null;
  error: string | null;
  recommendedSolution: string | null;
};

function UpdatesPage() {
  const u = useUpdateCheck();
  const sim = useSim();
  const { settings, update } = useSettings();
  const [updating, setUpdating] = useState(false);
  const companionOld = sim.companionVersion !== null && sim.companionVersion !== COMPANION_LATEST;
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [updateMessage, setUpdateMessage] = useState("");
  const updateError = u.isError || !!u.statusError;
  const [repositoryDraft, setRepositoryDraft] = useState(settings.updateRepositoryUrl);
  const [githubDiagnosis, setGithubDiagnosis] =
    useState<GitHubConnectionDiagnosis | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);

  const openExternalUrl = async (url: string) => {
    try {
      if ("__TAURI_INTERNALS__" in window || "__TAURI__" in window) {
        await invoke("open_external_url", { url });
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setUpdateMessage(
        error instanceof Error
          ? error.message
          : "Die externe Adresse konnte nicht geöffnet werden.",
      );
    }
  };

  const saveRepository = () => {
    const normalized = normalizeRepositoryDraft(repositoryDraft);
    if (!/^[^/\s]+\/[^/\s]+$/.test(normalized)) {
      setUpdateMessage("Repository-Format: Besitzer/Repository oder vollständige GitHub-URL.");
      return;
    }
    setRepositoryDraft(normalized);
    update({ updateRepositoryUrl: normalized });
    setUpdateMessage("Repository gespeichert. Die Updateprüfung wird neu gestartet.");
    void u.refetch();
  };

  const testGitHubConnection = async () => {
    setTestingConnection(true);
    setGithubDiagnosis(null);
    try {
      const diagnosis = await invoke<GitHubConnectionDiagnosis>("test_github_connection", {
        repository: settings.updateRepositoryUrl,
        branch: settings.updateBranch,
      });
      setGithubDiagnosis(diagnosis);
    } catch (error) {
      setGithubDiagnosis({
        success: false,
        repositoryReachable: false,
        authenticatedUser: null,
        repositoryId: null,
        defaultBranch: null,
        usedBranch: settings.updateBranch,
        permissions: null,
        error: error instanceof Error ? error.message : "GitHub-Verbindungstest fehlgeschlagen.",
        recommendedSolution: "Tauri-App neu starten und Repository-Konfiguration prüfen.",
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const downloadAndInstall = async () => {
    const isDesktop =
      "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
    if (!isDesktop) {
      if (u.latest?.pageUrl) window.open(u.latest.pageUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const asset =
      u.latest?.assets?.find((item) => /\.exe$/i.test(item.name)) ??
      u.latest?.assets?.find((item) => /\.msi$/i.test(item.name));
    if (!asset) {
      if (u.latest?.pageUrl) void openExternalUrl(u.latest.pageUrl);
      return;
    }
    setUpdating(true);
    setUpdateMessage("Update wird heruntergeladen…");
    setDownloadProgress(0);
    try {
      if ("__TAURI_INTERNALS__" in window || "__TAURI__" in window) {
        const browserConfig = JSON.stringify({
          settings: localStorage.getItem("vgc.settings.v1"),
          enabledPlugins: localStorage.getItem("vgc.enabledPlugins.v1"),
        });
        const backup = await invoke<string>("backup_app_config", { browserConfig });
        setUpdateMessage(`Backup erstellt: ${backup}`);
      }
      const unlisten = await listen<{ percent: number | null }>(
        "update-download-progress",
        (event) => setDownloadProgress(event.payload.percent ?? null),
      );
      const checksumAsset = u.latest.assets.find((item) => /\.sha256$/i.test(item.name));
      let sha256: string | undefined;
      if (checksumAsset) {
        try {
          const checksumText = await (await fetch(checksumAsset.browser_download_url)).text();
          sha256 = checksumText.match(/[a-fA-F0-9]{64}/)?.[0];
        } catch {
          sha256 = undefined;
        }
      }
      const path = await invoke<string>("download_installer", {
        url: asset.browser_download_url,
        sha256,
      });
      unlisten();
      setUpdateMessage(
        sha256
          ? "SHA-256-Prüfsumme erfolgreich geprüft. Installer wird gestartet."
          : "Download abgeschlossen. Installer wird gestartet.",
      );
      await invoke("run_installer", { path });
      await writeAppLog("info", `Update ${u.latest.version} heruntergeladen und Installer gestartet`);
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : "Das Update konnte nicht installiert werden.");
      await writeAppLog("error", `Update fehlgeschlagen: ${error}`);
    } finally {
      setUpdating(false);
      setDownloadProgress(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Updates"
        subtitle="Die App prüft automatisch auf neue Versionen. Updates werden nie während eines Pushbacks erzwungen."
      />

      <section className="panel mb-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-display text-lg uppercase">GitHub-Releasequelle</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Stable-, Beta- oder Development-Releases · Kein Zugangstoken erforderlich
            </p>
          </div>
          <Button
            variant="panel"
            size="touch"
            onClick={() => void openExternalUrl(repositoryUrl(settings.updateRepositoryUrl))}
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            Repository öffnen
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="h-12 min-w-64 flex-1 rounded-lg border border-input bg-secondary px-3 font-mono text-sm"
            value={repositoryDraft}
            onChange={(event) => setRepositoryDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                saveRepository();
              }
            }}
            aria-label="GitHub-Repository"
            placeholder="Besitzer/Repository oder https://github.com/Besitzer/Repository"
          />
          <Button
            variant="panel"
            size="touch"
            onClick={saveRepository}
          >
            Repository speichern
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            className="h-12 w-48 rounded-lg border border-input bg-secondary px-3 font-mono text-sm"
            value={settings.updateBranch}
            onChange={(event) => {
              update({ updateBranch: event.target.value.trim() });
              setGithubDiagnosis(null);
            }}
            aria-label="GitHub-Branch"
            placeholder="main"
          />
          <select
            className="h-12 rounded-lg border border-input bg-secondary px-3 text-sm"
            value={settings.updateChannel}
            onChange={(event) => {
              const channel = event.target.value as "stable" | "beta" | "development";
              update({ updateChannel: channel });
              setGithubDiagnosis(null);
              void u.refetch();
            }}
            aria-label="Update-Kanal"
          >
            <option value="stable">Stable</option>
            <option value="beta">Beta</option>
            <option value="development">Development</option>
          </select>
          <Button
            variant="panel"
            size="touch"
            disabled={testingConnection}
            onClick={() => void testGitHubConnection()}
          >
            {testingConnection ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-4" aria-hidden="true" />
            )}
            Verbindung testen
          </Button>
        </div>
        {githubDiagnosis && (
          <div
            role="status"
            className={`mt-3 rounded-xl border p-3 text-sm ${
              githubDiagnosis.success
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-destructive/30 bg-destructive/5"
            }`}
          >
            <div className="font-medium">
              {githubDiagnosis.success
                ? "GitHub-Verbindung erfolgreich"
                : "GitHub-Verbindung fehlgeschlagen"}
            </div>
            {githubDiagnosis.error && (
              <p className="mt-1 text-destructive">{githubDiagnosis.error}</p>
            )}
            {githubDiagnosis.recommendedSolution && (
              <p className="mt-1 text-muted-foreground">
                Lösungsvorschlag: {githubDiagnosis.recommendedSolution}
              </p>
            )}
            <p className="mt-1 text-muted-foreground">
              Repository erreichbar: {githubDiagnosis.repositoryReachable ? "Ja" : "Nein"}
              {githubDiagnosis.authenticatedUser &&
                ` · Benutzer: ${githubDiagnosis.authenticatedUser}`}
              {githubDiagnosis.repositoryId !== null &&
                ` · Repository-ID: ${githubDiagnosis.repositoryId}`}
              {githubDiagnosis.defaultBranch &&
                ` · Standard-Branch: ${githubDiagnosis.defaultBranch}`}
              {githubDiagnosis.usedBranch && ` · Geprüfter Branch: ${githubDiagnosis.usedBranch}`}
            </p>
          </div>
        )}
      </section>

      <section className="panel p-5" aria-live="polite">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {u.isFetching ? (
              <Loader2
                className="mt-1 size-6 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            ) : updateError ? (
              <TriangleAlert className="mt-1 size-6 text-destructive" aria-hidden="true" />
            ) : u.available ? (
              <Download className="mt-1 size-6 text-primary" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="mt-1 size-6 text-emerald-400" aria-hidden="true" />
            )}
            <div>
              <div className="font-display text-2xl uppercase">
                {u.isFetching
                  ? "Suche nach Updates…"
                  : updateError
                    ? "Prüfung fehlgeschlagen"
                    : u.available
                      ? `Version ${u.latest?.version} verfügbar`
                      : "App ist aktuell"}
              </div>
              <div className="text-sm text-muted-foreground">
                Installiert: Version {APP_VERSION} · Zuletzt geprüft: {fmt(u.dataUpdatedAt)}
              </div>
              {updateError && (
                <p className="mt-1 text-sm text-destructive">
                  {u.statusError ||
                    "Keine Verbindung zum Server. Internet prüfen und erneut versuchen."}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="panel"
              size="touch"
              disabled={u.isFetching}
              onClick={() => void u.refetch()}
            >
              <RefreshCw className="size-4" aria-hidden="true" /> Nach Updates suchen
            </Button>
            {u.available && (
              <Button
                variant="cockpit"
                size="touch"
                disabled={updating}
                onClick={() => void downloadAndInstall()}
              >
                {updating ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="size-4" aria-hidden="true" />
                )}{" "}
                Jetzt aktualisieren
              </Button>
            )}
          </div>
        </div>
        <label className="mt-4 flex items-center gap-3 border-t border-border pt-4 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={settings.autoUpdateCheck}
            onChange={(e) => update({ autoUpdateCheck: e.target.checked })}
          />
          Automatisch alle 10 Minuten und beim Öffnen prüfen
        </label>
        {(downloadProgress !== null || updateMessage) && (
          <div className="mt-4 border-t border-border pt-4">
            {downloadProgress !== null && (
              <div
                role="progressbar"
                aria-label="Update-Fortschritt"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={downloadProgress}
                className="h-3 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
            )}
            {updateMessage && <p className="mt-2 text-sm text-muted-foreground">{updateMessage}</p>}
          </div>
        )}
      </section>

      <section className="panel mt-5 p-5">
        <h2 className="font-display text-lg uppercase">So wird aktualisiert</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Neue Programmdateien werden durch den Windows-Installer ergänzt oder ersetzt.</li>
          <li>Veraltete Programmdateien werden nur durch den neuen Installer entfernt.</li>
          <li>Benutzerordner, Einstellungen, Plugins und Community-Dateien bleiben erhalten.</li>
          <li>Vor dem Start wird eine lokale Sicherung der Einstellungen und Plugins erstellt.</li>
        </ul>
      </section>

      <section className="panel mt-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <MonitorCog className="mt-1 size-6 text-muted-foreground" aria-hidden="true" />
            <div>
              <div className="font-display text-xl uppercase">Windows-Companion</div>
              <div className="text-sm text-muted-foreground">
                Aktuell: {COMPANION_LATEST} · Auf deinem PC:{" "}
                {sim.companionVersion ?? "nicht verbunden"}
              </div>
              {companionOld && (
                <p className="mt-1 text-sm text-primary">
                  Dein Companion ist veraltet. Neue Version herunterladen, entpacken und start.bat
                  erneut ausführen.
                </p>
              )}
            </div>
          </div>
          <Button
            variant={companionOld ? "cockpit" : "panel"}
            size="touch"
            onClick={() => void openExternalUrl(COMPANION_DOWNLOAD)}
          >
            <Download className="size-4" aria-hidden="true" /> Companion herunterladen
          </Button>
        </div>
      </section>

      <section className="panel mt-5 p-5">
        <h2 className="font-display text-xl uppercase">Was ist neu</h2>
        {u.available && u.latest && (
          <div className="mb-5 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="font-display text-lg text-primary">Version {u.latest.version}</div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
              {u.latest.notes}
            </p>
          </div>
        )}
        <ol className="mt-3 flex flex-col gap-5">
          {CHANGELOG.map((c) => (
            <li key={c.version}>
              <div className="flex items-baseline gap-3">
                <span className="font-display text-lg text-primary">Version {c.version}</span>
                <time dateTime={c.date} className="text-sm text-muted-foreground">
                  {new Date(c.date).toLocaleDateString("de-DE")}
                </time>
              </div>
              <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                {c.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
