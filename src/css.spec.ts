import { expect, test } from "bun:test";
import { epubCss, optionCss } from "./css";

const nothing = {
  rmCss: false,
  fitImages: false,
  codeCss: false,
  tabCss: false,
  shrinkGlyphs: "off",
  fontName: "",
} as const;

test("nothing selected generates nothing", () => {
  expect(optionCss(nothing)).toBe("");
});

test("the generated css says where it ends", () => {
  expect(optionCss({ ...nothing, rmCss: true })).toEndWith(
    "/* end of generated css */",
  );
});

test("image fitting", () => {
  const css = optionCss({ ...nothing, fitImages: true });
  expect(css).toContain("max-width: 100%");
  expect(css).toContain("height: auto");
});

test("generated in selection order", () => {
  const css = optionCss({
    ...nothing,
    rmCss: true,
    fitImages: true,
    codeCss: true,
  });
  expect(css.indexOf("figcaption")).toBeLessThan(css.indexOf("img"));
  expect(css.indexOf("img")).toBeLessThan(css.indexOf("pre, code"));
});

test("shrinking follows the font", () => {
  expect(optionCss({ ...nothing, shrinkGlyphs: "off" })).not.toContain(
    "repub-substitute",
  );
  const fitted = optionCss({
    ...nothing,
    shrinkGlyphs: "dynamic",
    fontName: "EB Garamond",
  });
  expect(fitted).toContain("font-size: 0.85em");
});

test("custom css comes last", () => {
  const css = epubCss({
    ...nothing,
    rmCss: true,
    customCss: "\n\np { color: red; }\n",
  });
  expect(css).toEndWith("p { color: red; }");
  expect(css.indexOf("figcaption")).toBeLessThan(css.indexOf("color: red"));
});

test("custom css alone", () => {
  expect(epubCss({ ...nothing, customCss: "p { color: red; }" })).toBe(
    "p { color: red; }",
  );
});
