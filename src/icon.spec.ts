import { expect, test } from "bun:test";
import { arc } from "./icon";

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
