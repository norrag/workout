// Generate the iOS apple-touch-startup-image launch screens (perf WS-J / N53).
//
// Branded launch PNGs (cream / dark) that reproduce the in-document Splash
// composition — the "workout" logotype with the three activity dots — so the
// pre-document window of an installed-PWA launch reads as the splash itself,
// not an anonymous solid sheet (in dark appearance a solid #14110c PNG is
// indistinguishable from the OS-default black, which is how N53's "no splash,
// just black" report happened even with the images applying).
//
//   node scripts/gen-ios-splash.mjs
//
// Keep DEVICES in sync with src/lib/pwa/ios-launch-screens.ts (that module
// emits the matching <link> tags) and the geometry/colors in sync with
// src/components/ui/Splash.tsx + src/styles/globals.css — the handoff from
// PNG to streamed Splash must be seamless. Run this when either changes, and
// remember: iOS resolves startup images at Add-to-Home-Screen time, so a
// changed PNG only shows after the app is removed and re-added
// (docs/deployment/manual-operations.md).
import { mkdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import opentype from "opentype.js";
import sharp from "sharp";
import woff2 from "wawoff2";

const DEVICES = [
  { w: 320, h: 568, dpr: 2 },
  { w: 375, h: 667, dpr: 2 },
  { w: 414, h: 736, dpr: 3 },
  { w: 375, h: 812, dpr: 3 },
  { w: 414, h: 896, dpr: 2 },
  { w: 414, h: 896, dpr: 3 },
  { w: 390, h: 844, dpr: 3 },
  { w: 428, h: 926, dpr: 3 },
  { w: 393, h: 852, dpr: 3 },
  { w: 430, h: 932, dpr: 3 },
  { w: 402, h: 874, dpr: 3 }, // 16 Pro / 17 / 17 Pro
  { w: 440, h: 956, dpr: 3 }, // 16 Pro Max / 17 Pro Max
  { w: 420, h: 912, dpr: 3 }, // iPhone Air
];

// Light ledger tokens (globals.css @theme + [data-theme="dark"]).
const THEMES = {
  light: { bg: "#f4f0e6", ink: "#17140f" },
  dark: { bg: "#14110c", ink: "#f1ece0" },
};

// Splash.tsx composition, in CSS px: logotype text-[26px] (.logotype = 600
// weight, 0.22em tracking, lowercase), gap-5 to three h-1.5/w-1.5 squares at
// gap-1.5 / 45% ink. The startup image can't animate, so the dots render at
// their resting opacity and the streamed Splash brings them to life.
const TEXT = "workout";
const FONT_SIZE = 26;
const LETTER_SPACING = 0.22 * FONT_SIZE;
const GAP = 20;
const DOT = 6;
const DOT_GAP = 6;
const DOT_OPACITY = 0.45;

// The app's own Archivo variable font; its default instance is the SemiBold
// (wght 600) the logotype uses, so no variation processing is needed.
const ttf = await woff2.decompress(
  await readFile("src/app/fonts/archivo-latin-variable.woff2"),
);
const font = opentype.parse(Uint8Array.from(ttf).buffer);
const upm = font.unitsPerEm;
const ascent = font.tables.hhea.ascender / upm;
const descent = -font.tables.hhea.descender / upm;
const lineGap = font.tables.hhea.lineGap / upm;

/**
 * The logotype as absolute-positioned SVG path data with its CSS advance
 * width. Mirrors WebKit text layout: letter-spacing after every glyph
 * (including the last — it's part of the centered box), kerning omitted (the
 * 0.22em tracking makes it sub-pixel).
 */
function logotypePath(size, baselineY, left) {
  let pen = left;
  let d = "";
  for (const ch of TEXT) {
    const glyph = font.charToGlyph(ch);
    d += glyph.getPath(pen, baselineY, size).toPathData(2);
    pen += (glyph.advanceWidth / upm) * size + (LETTER_SPACING / FONT_SIZE) * size;
  }
  return { d, width: pen - left };
}

function splashSvg(cssW, cssH, dpr, theme) {
  const pw = cssW * dpr;
  const ph = cssH * dpr;
  const size = FONT_SIZE * dpr;

  // Vertical layout mirrors Splash.tsx's centered flex column: the text line
  // box (line-height normal = hhea ascent+descent+lineGap), the 20px gap, the
  // 6px dot row — the whole stack centered in the viewport.
  const lineBox = (ascent + descent + lineGap) * size;
  const stackH = lineBox + GAP * dpr + DOT * dpr;
  const stackTop = (ph - stackH) / 2;
  const baselineY = stackTop + (lineGap / 2 + ascent) * size;

  const measured = logotypePath(size, 0, 0).width;
  const { d } = logotypePath(size, baselineY, (pw - measured) / 2);

  const dotsW = (3 * DOT + 2 * DOT_GAP) * dpr;
  const dotsY = stackTop + lineBox + GAP * dpr;
  const dots = [0, 1, 2]
    .map(
      (i) =>
        `<rect x="${(pw - dotsW) / 2 + i * (DOT + DOT_GAP) * dpr}" y="${dotsY}" ` +
        `width="${DOT * dpr}" height="${DOT * dpr}" fill="${theme.ink}" fill-opacity="${DOT_OPACITY}"/>`,
    )
    .join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}" viewBox="0 0 ${pw} ${ph}">` +
    `<rect width="${pw}" height="${ph}" fill="${theme.bg}"/>` +
    `<path d="${d}" fill="${theme.ink}"/>` +
    dots +
    `</svg>`
  );
}

await mkdir("public/splash", { recursive: true });
let n = 0;
for (const d of DEVICES) {
  for (const [name, theme] of Object.entries(THEMES)) {
    const svg = splashSvg(d.w, d.h, d.dpr, theme);
    await sharp(Buffer.from(svg))
      .png()
      .toFile(
        `public/splash/apple-splash-${d.w * d.dpr}-${d.h * d.dpr}-${name}.png`,
      );
    n++;
  }
}
console.log(`generated ${n} launch images`);
