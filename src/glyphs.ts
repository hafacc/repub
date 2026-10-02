/**
 * what the tablet's fonts can actually draw
 *
 * @remarks Anything outside these sets is drawn from a substitute font, and
 * the substitutes are tall enough that a single character stretches every line
 * of its paragraph. The ranges come from the font files shipped in the
 * reMarkable desktop app 3.28.1, intersected over each family's styles.
 */
const coverage = new Map<string, string>(
  Object.entries({
    "reMarkable Serif Small":
      "20-5f,61-7e,a0-a7,a9-ae,b0-b3,b5-b7,b9-107,10a-113,116-11b,11e-123," +
      "126-127,12a-12b,12e-133,136-137,139-13e,141-148,14a-14d,150-15b," +
      "15e-167,16a-16b,16e-17e,192,1b7,1e4-1e9,1ee-1ef,218-21b,237,292," +
      "300-304,306-308,30a-30c,312,326-328,394,3a9,3bc,3c0,1e80-1e85,1e9e," +
      "1ef2-1ef3,2009,2013-2014,2018-201a,201c-201e,2020-2022,2026,2030," +
      "2039-203a,2044,2070,2074-2079,2080-2089,20ac,2122,2154,215b-215e," +
      "2202,220f,2211-2212,221a,221e,222b,2248,2260,2264-2265,25aa-25ab," +
      "25e6,e001-e002",
    "reMarkable Sans":
      "20-7e,a0-107,10a-113,116-11b,11e-123,126-127,12a-12b,12e-133,136-137," +
      "139-13e,141-148,14a-14d,150-15b,15e-167,16a-16b,16e-17e,192,1b7," +
      "1e4-1e9,1ee-1ef,218-21b,237,292,2c6-2c7,2d8-2dd,300-304,306-308," +
      "30a-30c,312,326-328,394,3a9,3bc,3c0,1e80-1e85,1e9e,1ef2-1ef3,2009," +
      "2013-2014,2018-201a,201c-201e,2020-2022,2026,2030,2039-203a,2044," +
      "2070,2074-2079,2080-2089,20ac,2122,2154,215b-215e,2202,220f," +
      "2211-2212,221a,221e,222b,2248,2260,2264-2265,25aa-25ab,25e6,e002," +
      "fb01-fb02",
    "EB Garamond":
      "0,d,20-7e,a0-250,254,256,258-25c,25f,270,275-276,28a,292,2b0-2b3," +
      "2b7-2bf,2c4,2c6-2d1,2d8-2de,2e0-2e3,2f7,300-33e,340-345,351,353,357," +
      "35d,361,364,374-375,37a,37e,384-38a,38c,38e-3a1,3a3-3cf,3d1-3d7,3dc," +
      "3f0-3f1,3f9,400-45f,462-463,46a-46b,470,472-477,48a-4ff,510-513," +
      "51a-51d,524-529,52e-52f,1d02,1d2c-1d2e,1d30-1d31,1d33-1d3a,1d3c," +
      "1d3e-1d43,1d47-1d4a,1d4d,1d4f-1d52,1d56-1d58,1d5b,1d61-1d65,1d9c," +
      "1d9e,1da0,1dbb,1dbe,1dc4,1dd3,1e00-1f15,1f18-1f1d,1f20-1f45,1f48-1f4d," +
      "1f50-1f57,1f59,1f5b,1f5d,1f5f-1f7d,1f80-1fb4,1fb6-1fc4,1fc6-1fd3," +
      "1fd6-1fdb,1fdd-1fef,1ff2-1ff4,1ff6-1ffe,2000-2016,2018-201a,201c-201e," +
      "2020-2022,2024-2026,202a,2030,2032-2037,2039-203a,203c-203e,2044," +
      "2047-2049,204b,204e,2057,2060,2070-2071,2074-208e,2090-209c,20a1," +
      "20a3-20a9,20ab-20ae,20b1-20b2,20b4-20b5,20b8-20ba,20bc-20bd," +
      "2100-2101,2103,2105-2106,2109,210e,2112-2113,2116,211e-2120,2122-2123," +
      "2126-2127,212a-212b,212e,2139,214b,2150,2153-2154,215b-215e,2160-217f," +
      "2190-219b,219e-21a2,21ae,21d0-21d3,21da-21db,2202,2205-2207,220f-2213," +
      "2215-2216,2219-221a,221e,2223-2226,222b,2236,223c,2241,2248,2260," +
      "2264-2265,226a-226b,226e-226f,22c5,22ef,2303,2329-232a,2474-24b5," +
      "25a0-25a1,25b2-25b3,25b6-25b7,25bc-25bd,25c0-25c1,25c6-25c7,25ca," +
      "25e6,2619,261c-261e,267e,270a-270c,2753,2757,2766-2767,27e8-27eb," +
      "2a74-2a76,2b45-2b46,2c60-2c7f,2e18,2e22-2e25,2e28-2e29,2e2e,2e3a-2e3b," +
      "3003,3008-300b,a726-a731,a742-a743,a749,a751,a753,a757,a759,a76b," +
      "a78d-a78e,a7aa,a7fb-a7ff,e001-e002,f6be,fb00-fb06,feff,fffd," +
      "1f1e6-1f1ff,1f44c-1f44d",
  }),
);

/**
 * how far a substituted character has to shrink to leave the spacing alone
 *
 * @remarks These are measured, not derived: a probe of the 58 characters
 * these fonts lack, rendered on a tablet running 3.28. The tablet picks a
 * substitute per character — Noto Sans JP for suits, stars and dingbats,
 * Noto Sans Mono for arrows and geometric shapes, Noto Sans for punctuation
 * and currency, and a script font for Arabic, Hebrew and Korean — and the
 * worst of them stretched the reMarkable fonts by a third (Arabic) and EB
 * Garamond by an eighth. reMarkable Sans shares the serif's line metrics, so
 * it shares its number.
 */
const worstCase = new Map<string, number>([
  ["reMarkable Serif Small", 0.75],
  ["reMarkable Sans", 0.75],
  ["EB Garamond", 0.85],
]);

/** how the substituted characters get sized */
export type ShrinkMode = "off" | "dynamic" | "robust";

/**
 * how far to shrink a substituted character
 *
 * Dynamic fits the font the document is uploaded with, which reads better on
 * fonts with roomier lines of their own. Robust also survives the font being
 * changed on the tablet afterwards, since the stylesheet can't.
 */
export function substituteScale(mode: ShrinkMode, fontName: string): number {
  const fitted = mode === "dynamic" ? worstCase.get(fontName) : undefined;
  return fitted ?? Math.min(...worstCase.values());
}

function expand(encoded: string): Set<number> {
  const points = new Set<number>();
  for (const range of encoded.split(",")) {
    const [start, end = start] = range.split("-") as [string, string?];
    const last = parseInt(end ?? start, 16);
    for (let point = parseInt(start, 16); point <= last; ++point) {
      points.add(point);
    }
  }
  return points;
}

const cache = new Map<string, Set<number>>();

function covered(key: string): Set<number> {
  const cached = cache.get(key);
  if (cached) {
    return cached;
  } else {
    const encoded = coverage.get(key);
    // for a font we don't know, or a document whose font may still change,
    // only what every font we do know can draw counts as covered
    const points = encoded
      ? expand(encoded)
      : [...coverage.values()]
          .map(expand)
          .reduce((left, right) => left.intersection(right));
    cache.set(key, points);
    return points;
  }
}

/**
 * is this character one the tablet has to substitute a font for
 *
 * Fitting the font asks what that one font can draw. Fitting any font asks
 * what they all can, since the reader's font can change after upload.
 */
export function substituted(
  mode: ShrinkMode,
  fontName: string,
): (char: string) => boolean {
  const points = covered(mode === "dynamic" ? fontName : "");
  return (char: string): boolean => {
    const point = char.codePointAt(0);
    return point !== undefined && !points.has(point) && !!char.trim();
  };
}
