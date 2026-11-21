export type ReleaseAsset = {
  name: string;
  browser_download_url: string;
  size: number;
};

export type GitHubRelease = {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  assets: ReleaseAsset[];
};

export type UpdateRelease = {
  version: string;
  name: string;
  notes: string;
  pageUrl: string;
  publishedAt: string | null;
  assets: ReleaseAsset[];
};

export function parseSemver(value: string): number[] | null {
  const normalized = value.trim().replace(/^v/i, "").split("-")[0];
  if (!/^\d+\.\d+\.\d+$/.test(normalized)) return null;
  return normalized.split(".").map((part) => Number(part));
}

export function compareVersions(left: string, right: string): number {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) throw new Error("Ungültige Versionsnummer");
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

export function isNewerVersion(current: string, available: string): boolean {
  return compareVersions(available, current) > 0;
}

export function releaseToUpdate(release: GitHubRelease): UpdateRelease | null {
  if (release.draft) return null;
  const version = parseSemver(release.tag_name)?.join(".") ?? null;
  if (!version) return null;
  return {
    version,
    name: release.name || `Version ${version}`,
    notes: release.body || "Keine Änderungsbeschreibung veröffentlicht.",
    pageUrl: release.html_url,
    publishedAt: release.published_at,
    assets: release.assets,
  };
}

export function preferredWindowsAsset(
  assets: readonly ReleaseAsset[],
): ReleaseAsset | null {
  const executable = assets.find((asset) => /\.exe$/i.test(asset.name));
  const installer = assets.find((asset) => /\.msi$/i.test(asset.name));
  const archive = assets.find((asset) => /\.(zip|7z)$/i.test(asset.name));
  return executable ?? installer ?? archive ?? null;
}
