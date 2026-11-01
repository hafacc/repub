import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as tokens from "./tokens";

/** the custom properties `tokens.css` declares, by name without the dashes */
function declared(): Map<string, string> {
  const text = readFileSync(new URL("tokens.css", import.meta.url), "utf8");
  const found = new Map<string, string>();
  for (const [, name, value] of text.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    found.set(name!, value!.trim());
  }
  return found;
}

/** a token's name as the stylesheet spells it */
function dashed(name: string): string {
  return name.toLowerCase();
}

// quotes around a family are interchangeable between the two files, and
// nothing else in here carries any
function bare(value: string): string {
  return value.replaceAll(/['"]/g, "");
}

test("every token is declared in the stylesheet too", () => {
  const css = declared();
  for (const [name, value] of Object.entries(tokens)) {
    const found = css.get(dashed(name));
    expect(found, `--${dashed(name)} is missing from tokens.css`).toBeDefined();
    expect(bare(found!), `--${dashed(name)}`).toBe(bare(value));
  }
});

test("the stylesheet declares nothing the tokens don't", () => {
  const named = new Set(Object.keys(tokens).map(dashed));
  for (const name of declared().keys()) {
    expect(named.has(name), `--${name} is missing from tokens.ts`).toBe(true);
  }
});
