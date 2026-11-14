import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useSettings } from "./settings";

afterEach(() => { cleanup(); localStorage.clear(); });

it("keeps the SimBrief Pilot ID when settings are reopened", () => {
  const first = renderHook(() => useSettings());
  act(() => first.result.current.update({ simbriefKind: "userid", simbriefId: "123456" }));
  first.unmount();
  const next = renderHook(() => useSettings());
  expect(next.result.current.settings.simbriefId).toBe("123456");
  expect(next.result.current.settings.simbriefKind).toBe("userid");
});