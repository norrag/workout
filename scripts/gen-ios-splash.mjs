// Generate the iOS apple-touch-startup-image launch screens (perf WS-J).
//
// Solid brand-background PNGs (cream / dark) that match the in-document Splash, so
// an installed iOS PWA shows the app background instead of a black blank between the
// icon tap and the WebView loading. Output: public/splash/apple-splash-<pw>-<ph>-<theme>.png.
//
//   node scripts/gen-ios-splash.mjs
//
// Keep DEVICES in sync with src/lib/pwa/ios-launch-screens.ts (that module emits the
// matching <link> tags). Run this when the device list changes.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

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
const THEMES = { light: "#f4f0e6", dark: "#14110c" };

await mkdir("public/splash", { recursive: true });
let n = 0;
for (const d of DEVICES) {
  const pw = d.w * d.dpr;
  const ph = d.h * d.dpr;
  for (const [theme, bg] of Object.entries(THEMES)) {
    await sharp({ create: { width: pw, height: ph, channels: 3, background: bg } })
      .png()
      .toFile(`public/splash/apple-splash-${pw}-${ph}-${theme}.png`);
    n++;
  }
}
console.log(`generated ${n} launch images`);
