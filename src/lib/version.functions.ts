import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { APP_BUILD, APP_VERSION } from "./version";
import { COMPANION_LATEST } from "./sim/protocol";
import { UPDATE_CONFIG } from "./update-config";
import { releaseToUpdate, type GitHubRelease } from "./updates-core";

/** Reports the build the server is currently running, so stale open pages can detect a newer deployment. */
export const getLatestRelease = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "no-store");
  const repository = UPDATE_CONFIG.repositoryUrl
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\/$/, "");
  if (!repository || repository.includes("DEIN-BENUTZERNAME")) {
    return {
      build: APP_BUILD,
      version: APP_VERSION,
      companion: COMPANION_LATEST,
      release: null,
      configured: false,
    };
  }
  try {
    const response = await fetch(
      `${UPDATE_CONFIG.apiBaseUrl}/repos/${repository}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } },
    );
    if (!response.ok) {
      throw new Error(`GitHub HTTP ${response.status}`);
    }
    const release = (await response.json()) as GitHubRelease;
    return {
      build: APP_BUILD,
      version: APP_VERSION,
      companion: COMPANION_LATEST,
      release: releaseToUpdate(release),
      configured: true,
    };
  } catch (error) {
    return {
      build: APP_BUILD,
      version: APP_VERSION,
      companion: COMPANION_LATEST,
      release: null,
      configured: true,
      error: error instanceof Error ? error.message : "GitHub-Prüfung fehlgeschlagen",
    };
  }
});
