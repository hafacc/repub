import { type ShrinkMode, substituteScale } from "./glyphs";

const remarkableCss = `
p {
  margin-top: 1em;
  margin-bottom: 1em;
}

ul, ol {
  padding: 1em;
}

ul li, ol li {
  margin-left: 1.5em;
  padding-left: 0.5em;
}

figcaption {
  font-size: 0.5rem;
  font-style: italic;
}
`;

const imageCss = `
img {
  max-width: 100%;
  height: auto;
}
`;

const codeEnvironmentCss = `
pre, code {
  font-family: "Noto Mono", monospace;
  font-size: 0.8em;
  background-color: #f2f2f2;
}

pre {
  white-space: pre-wrap;
  /* this doesn't work, but it might as some point */
  text-align: left !important;
}
`;

/** also inlined into tables rendered as images, where there's no stylesheet */
export const baseTableCss = `
table, th, td {
  border: 1px solid;
}

th {
  border-top: 3px solid;
  border-bottom: 3px solid;
}

th, td {
  padding: 0.25rem;
}

table {
  border-bottom: 3px solid;
  border-collapse: collapse;
}
`;

const tableCss = `
${baseTableCss}

table {
  max-width: 100%;
}
`;

function substituteCss(mode: ShrinkMode, fontName: string): string {
  return `
.repub-substitute {
  font-size: ${substituteScale(mode, fontName)}em;
}
`;
}

/** the style options that write the epub's stylesheet */
export interface CssOptions {
  rmCss: boolean;
  fitImages: boolean;
  codeCss: boolean;
  tabCss: boolean;
  shrinkGlyphs: ShrinkMode;
  fontName: string;
  customCss: string;
}

/** everything the options generate, in the order it's written */
export function optionCss({
  rmCss,
  fitImages,
  codeCss,
  tabCss,
  shrinkGlyphs,
  fontName,
}: Omit<CssOptions, "customCss">): string {
  // each block says which option wrote it, so the generated half of the
  // options page editor can be read without guessing
  const blocks: [boolean, string, string][] = [
    [rmCss, "Use reMarkable CSS", remarkableCss],
    [fitImages, "Fit images to page", imageCss],
    [codeCss, "Use code environment CSS", codeEnvironmentCss],
    [tabCss, "Use table CSS", tableCss],
    [
      shrinkGlyphs !== "off",
      "Shrink substituted characters",
      shrinkGlyphs === "off" ? "" : substituteCss(shrinkGlyphs, fontName),
    ],
  ];
  const written = blocks
    .filter(([selected]) => selected)
    .map(([, option, css]) => `/* ${option} */\n${css.trim()}`);
  return written.length
    ? [...written, "/* end of generated css */"].join("\n\n")
    : "";
}

export function epubCss(options: CssOptions): string {
  return [optionCss(options), options.customCss.trim()]
    .filter((part) => part)
    .join("\n\n");
}
