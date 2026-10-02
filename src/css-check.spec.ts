import { expect, test } from "bun:test";
import { cssProblems, malformed } from "./css-check";

test("clean css", () => {
  expect(cssProblems("img {\n  max-width: 100%;\n}")).toEqual([]);
  expect(cssProblems("")).toEqual([]);
});

test("css that doesn't parse", () => {
  const problems = cssProblems("p color: red; }");
  expect(problems.length).toBeGreaterThan(0);
  expect(problems.every(({ severity }) => severity === "error")).toBe(true);
  expect(malformed(problems)).toBe(true);
});

test("css a browser might not know", () => {
  const [problem, ...rest] = cssProblems("p { colr: red; }");
  expect(rest).toEqual([]);
  expect(problem?.severity).toBe("warning");
  expect(problem?.message).toContain("colr");
  expect(malformed([problem!])).toBe(false);
});

test("a bad value is only a warning", () => {
  const problems = cssProblems("p { color: nope; }");
  expect(problems.map(({ severity }) => severity)).toEqual(["warning"]);
});

test("custom properties are left alone", () => {
  expect(cssProblems("p { --mine: 1; }")).toEqual([]);
});

test("problems come in order", () => {
  const problems = cssProblems("p { colr: red; }\nli { colr: red; }");
  expect(problems.map(({ from }) => from)).toEqual([4, 22]);
});
