import { expect, it } from "vitest";
import { loopbackBaseUrl } from "./local-service";

it("allows only local HTTP service URLs", () => {
  expect(loopbackBaseUrl(undefined, "http://127.0.0.1:8788/v1")).toBe("http://127.0.0.1:8788/v1");
  expect(loopbackBaseUrl("http://localhost:5000/", "http://127.0.0.1:8788/v1")).toBe(
    "http://localhost:5000",
  );
  expect(loopbackBaseUrl("https://example.com/v1", "http://127.0.0.1:8788/v1")).toBeNull();
  expect(loopbackBaseUrl("http://user:pass@127.0.0.1/v1", "http://127.0.0.1/v1")).toBeNull();
});
