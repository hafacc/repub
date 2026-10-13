import { expect, test } from "bun:test";
import { performance } from "node:perf_hooks";
import {
  assert,
  errString,
  Semaphore,
  safeFilename,
  sleep,
  timeout,
} from "./utils";

test("sleep()", async () => {
  const first = performance.now();
  await sleep(10);
  const expected = performance.now() - first;

  const second = performance.now();
  await Promise.all([sleep(10), sleep(10)]);
  const actual = performance.now() - second;
  expect(Math.abs(expected - actual)).toBeLessThan(Math.max(expected, actual));
});

async function mySleep(seconds: number): Promise<null> {
  await sleep(seconds);
  return null;
}

test("timeout()", async () => {
  expect(await timeout(mySleep(1), 10)).toBeNull();
  await expect(timeout(mySleep(10), 1)).rejects.toThrow("timeout");
});

test("safeFilename()", () => {
  expect(safeFilename("simple.png")).toBe("simple.png");
  expect(safeFilename("L.A. info.png")).toBe("L.A. info.png");
  expect(
    safeFilename("KI: Führen uns Algorithmen ins posttheoretische Zeitalter?"),
  ).toBe("KI_ Führen uns Algorithmen ins posttheoretische Zeitalter_");
});

test("assert()", () => {
  assert(true);
  expect(() => {
    assert(false);
  }).toThrow("internal error");
  expect(() => {
    assert(false, "custom");
  }).toThrow("custom");
});

test("errString()", () => {
  expect(errString("err")).toBe("err");
  expect(errString(null)).toBe("null error");
  expect(errString(undefined)).toBe("undefined error");
  expect(errString(() => undefined)).toBe("function error: ");
  expect(errString(new Error("custom error"))).toBe("Error: custom error");
  expect(errString({})).toBe("unknown object error");
});

test("Semaphore", async () => {
  const limit = new Semaphore(2);
  const order: number[] = [];
  let held = 0;
  let most = 0;

  await Promise.all(
    Array.from({ length: 5 }, async (_, index) => {
      await using _permit = await limit.lock();
      order.push(index);
      held += 1;
      most = Math.max(most, held);
      await sleep(5);
      held -= 1;
    }),
  );

  expect(most).toBe(2);
  expect(order).toEqual([0, 1, 2, 3, 4]);
});

test("Semaphore gives a permit back after a throw", async () => {
  const limit = new Semaphore(1);

  const failed = (async () => {
    await using _permit = await limit.lock();
    throw new Error("boom");
  })();
  await expect(failed).rejects.toThrow("boom");

  // a permit that was never given back would hang here
  await using _permit = await limit.lock();
  expect(true).toBe(true);
});
