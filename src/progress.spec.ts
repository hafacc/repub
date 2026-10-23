import { expect, test } from "bun:test";
import { steps, within } from "./progress";

test("steps", () => {
  expect(steps({ one: 1, three: 3 })).toEqual({
    one: { from: 0, to: 0.25 },
    three: { from: 0.25, to: 1 },
  });
  // a job of one step is the whole job
  expect(steps({ all: 7 })).toEqual({ all: { from: 0, to: 1 } });
  // thirds don't divide evenly, but the last step still ends at the end
  const { last } = steps({ first: 1, second: 1, last: 1 });
  expect(last.to).toBe(1);
});

test("within", () => {
  const step = { from: 0.2, to: 0.6 };

  expect(within(step, 0)).toEqual({ progress: 0.2, upto: 0.6 });
  expect(within(step, 0.5)).toEqual({ progress: 0.4, upto: 0.6 });
  expect(within(step, 1)).toEqual({ progress: 0.6, upto: 0.6 });
  // a step that reports more or less than it should stays inside itself
  expect(within(step, -1)).toEqual({ progress: 0.2, upto: 0.6 });
  expect(within(step, 2)).toEqual({ progress: 0.6, upto: 0.6 });
});
