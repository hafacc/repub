import { expect, test } from "bun:test";
import { arc, ringAt } from "./icon";

test("arc", () => {
  const top = -Math.PI / 2;
  const full = top + 2 * Math.PI;

  expect(arc(0)).toEqual([top, top]);
  expect(arc(0.25)).toEqual([top, 0]);
  expect(arc(1)).toEqual([top, full]);
  // a conversion that reports more or less than it should still draws
  expect(arc(-1)).toEqual([top, top]);
  expect(arc(2)).toEqual([top, full]);
});

test("ringAt eases to what was reported", () => {
  const spot = { progress: 0.5, upto: 0.5 };

  expect(ringAt(0.2, spot, 0)).toBe(0.2);
  // the ease is fastest at the start, so it's over half way by half way
  expect(ringAt(0.2, spot, 175)).toBeGreaterThan(0.35);
  expect(ringAt(0.2, spot, 350)).toBeCloseTo(0.5, 10);
  expect(ringAt(0.2, spot, 10_000)).toBeCloseTo(0.5, 10);
});

test("ringAt drifts on through the step", () => {
  const spot = { progress: 0.2, upto: 0.6 };
  const arrived = ringAt(0.2, spot, 350);
  const drifted = ringAt(0.2, spot, 4_000);
  const later = ringAt(0.2, spot, 60_000);

  expect(arrived).toBeCloseTo(0.2, 10);
  expect(drifted).toBeGreaterThan(arrived);
  expect(later).toBeGreaterThan(drifted);
  // the drift stops short, so a step that drags doesn't look finished
  expect(later).toBeLessThan(0.6);
});

test("ringAt only moves forward", () => {
  const spot = { progress: 0.3, upto: 0.9 };
  let last = 0;
  for (let elapsed = 0; elapsed < 30_000; elapsed += 40) {
    const at = ringAt(0.1, spot, elapsed);
    expect(at).toBeGreaterThanOrEqual(last);
    last = at;
  }
});
