export const SUPPORTED_PLUGIN_API_VERSION = "1.0";

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  entryPoint: string;
  apiVersion: string;
};

export type PluginValidation =
  | { valid: true; manifest: PluginManifest }
  | { valid: false; error: string };

export function validatePluginManifest(value: unknown): PluginValidation {
  if (!value || typeof value !== "object") {
    return { valid: false, error: "Das Manifest ist kein gültiges Objekt." };
  }
  const manifest = value as Partial<PluginManifest>;
  const required: (keyof PluginManifest)[] = [
    "id",
    "name",
    "version",
    "author",
    "description",
    "entryPoint",
    "apiVersion",
  ];
  for (const key of required) {
    if (typeof manifest[key] !== "string" || !manifest[key]?.trim()) {
      return { valid: false, error: `Pflichtfeld „${key}“ fehlt oder ist ungültig.` };
    }
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(manifest.id!)) {
    return { valid: false, error: "Die Plugin-ID enthält ungültige Zeichen." };
  }
  if (manifest.apiVersion !== SUPPORTED_PLUGIN_API_VERSION) {
    return {
      valid: false,
      error: `API-Version ${manifest.apiVersion} wird nicht unterstützt.`,
    };
  }
  return { valid: true, manifest: manifest as PluginManifest };
}

export function validateUniquePluginIds(
  manifests: readonly PluginManifest[],
): PluginManifest[] {
  const seen = new Set<string>();
  return manifests.filter((manifest) => {
    if (seen.has(manifest.id)) return false;
    seen.add(manifest.id);
    return true;
  });
}
