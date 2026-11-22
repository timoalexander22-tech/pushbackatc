import { describe, expect, it } from "vitest";
import {
  compareVersions,
  isNewerVersion,
  preferredWindowsAsset,
  releaseToUpdate,
} from "./updates-core";

describe("update version handling", () => {
  it("compares semantic versions", () => {
    expect(compareVersions("1.2.0", "1.10.0")).toBe(-1);
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.0.0", "v1.0.0")).toBe(0);
  });

  it("detects newer releases", () => {
    expect(isNewerVersion("1.2.0", "1.3.0")).toBe(true);
    expect(isNewerVersion("1.2.0", "1.2.0")).toBe(false);
  });

  it("compares prerelease versions without treating them as stable versions", () => {
    expect(compareVersions("1.3.0-beta.1", "1.3.0")).toBe(-1);
    expect(compareVersions("1.3.0", "1.3.0-beta.1")).toBe(1);
    expect(isNewerVersion("1.2.0", "1.3.0-beta.1")).toBe(true);
  });

  it("ignores invalid release tags and drafts", () => {
    expect(
      releaseToUpdate({
        tag_name: "latest",
        name: "",
        body: "",
        html_url: "",
        draft: false,
        prerelease: false,
        published_at: null,
        assets: [],
      }),
    ).toBeNull();
  });

  it("prefers an executable Windows installer", () => {
    const asset = preferredWindowsAsset([
      { name: "app.zip", browser_download_url: "zip", size: 1 },
      { name: "app.msi", browser_download_url: "msi", size: 2 },
      { name: "app.exe", browser_download_url: "exe", size: 3 },
    ]);
    expect(asset?.name).toBe("app.exe");
  });
});
