import { expect, test } from "bun:test";

// react-dom/client throws as it loads unless react is the exact same version,
// which the bundler is happy to ignore
test("react-dom loads", async () => {
  const { createRoot } = await import("react-dom/client");
  expect(createRoot).toBeFunction();
});
