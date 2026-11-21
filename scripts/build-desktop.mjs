import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npm, ["run", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    VGC_DESKTOP_BUILD: "1",
    VITE_DESKTOP_APP: "1",
  },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
