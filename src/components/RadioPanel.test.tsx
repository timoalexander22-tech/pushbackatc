import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RadioLog } from "./RadioPanel";

const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");

afterEach(() => {
  cleanup();
  if (scrollDescriptor)
    Object.defineProperty(Element.prototype, "scrollIntoView", scrollDescriptor);
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

it("does not use the scroll result as an effect cleanup", () => {
  const scrollIntoView = vi.fn(() => Promise.resolve());
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });

  const { rerender, unmount } = render(<RadioLog log={[]} />);
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
  expect(() =>
    rerender(<RadioLog log={[{ id: 1, from: "pilot", text: "Check", at: 1 }]} />),
  ).not.toThrow();
  expect(scrollIntoView).toHaveBeenCalledTimes(2);
  expect(() => unmount()).not.toThrow();
});
