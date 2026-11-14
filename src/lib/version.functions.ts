import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { APP_BUILD, APP_VERSION } from "./version";
import { COMPANION_LATEST } from "./sim/protocol";

/** Reports the build the server is currently running, so stale open pages can detect a newer deployment. */
export const getLatestRelease = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "no-store");
  return { build: APP_BUILD, version: APP_VERSION, companion: COMPANION_LATEST };
});
