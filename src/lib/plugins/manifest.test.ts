import { describe, expect, it } from "vitest";
import {
  validatePluginManifest,
  validateUniquePluginIds,
  type PluginManifest,
} from "./manifest";

const valid = {
  id: "example.plugin",
  name: "Example Plugin",
  version: "1.0.0",
  author: "Autor",
  description: "Beschreibung",
  entryPoint: "plugin.js",
  apiVersion: "1.0",
};

describe("plugin manifest validation", () => {
  it("accepts a complete supported manifest", () => {
    expect(validatePluginManifest(valid)).toEqual({ valid: true, manifest: valid });
  });

  it("rejects missing fields and unsupported API versions", () => {
    expect(validatePluginManifest({ ...valid, entryPoint: "" }).valid).toBe(false);
    expect(validatePluginManifest({ ...valid, apiVersion: "2.0" }).valid).toBe(false);
  });

  it("removes duplicate plugin ids", () => {
    const first = { ...valid };
    const second = { ...valid, name: "Duplicate" };
    expect(validateUniquePluginIds([first, second] as PluginManifest[])).toEqual([first]);
  });
});
