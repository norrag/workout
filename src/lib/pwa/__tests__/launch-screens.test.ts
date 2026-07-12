import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  IOS_LAUNCH_SCREENS,
  launchImageHref,
  type LaunchTheme,
} from "../ios-launch-screens";

// Regression guards for the iOS launch screens (N53, 2026-07-12).
//
// Two failure modes are pinned here:
//
// 1. LIST/PNG DRIFT. iOS applies a startup image only on an EXACT media-query
//    match, and a class added to ios-launch-screens.ts without regenerating
//    (or with wrong dimensions) silently degrades that device to the
//    OS-default black launch — the <link> tag renders fine and nothing errors
//    (this is exactly how PR #90 shipped inert). Every class × theme must have
//    a PNG whose pixel size is exactly (w·dpr) × (h·dpr).
//
// 2. UNBRANDED/ILLEGIBLE IMAGES. A "working" solid dark PNG is perceptually
//    identical to the black screen it exists to prevent — the N53 report ("no
//    splash, just long black screens") happened with all 26 images present
//    and matching. The image must BE the splash: brand background at the
//    corners AND ink (logotype) pixels in the center band, in both themes.

const repoRoot = path.resolve(__dirname, "../../../..");

const THEME_BG: Record<LaunchTheme, [number, number, number]> = {
  light: [0xf4, 0xf0, 0xe6],
  dark: [0x14, 0x11, 0x0c],
};

function channelDelta(
  a: [number, number, number],
  b: [number, number, number],
): number {
  return Math.max(
    Math.abs(a[0] - b[0]),
    Math.abs(a[1] - b[1]),
    Math.abs(a[2] - b[2]),
  );
}

describe.each(IOS_LAUNCH_SCREENS)(
  "launch screen $w x $h @$dpr",
  (screen) => {
    describe.each(Object.keys(THEME_BG) as LaunchTheme[])("%s", (theme) => {
      const file = path.join(repoRoot, "public", launchImageHref(screen, theme));
      const pw = screen.w * screen.dpr;
      const ph = screen.h * screen.dpr;

      it("has a generated PNG", () => {
        expect(existsSync(file)).toBe(true);
      });

      it("matches the device's exact pixel dimensions", async () => {
        const meta = await sharp(file).metadata();
        expect([meta.width, meta.height]).toEqual([pw, ph]);
      });

      it("is the branded splash: brand bg at the corner, ink in the center", async () => {
        const bg = THEME_BG[theme];

        const corner = await sharp(file)
          .extract({ left: 0, top: 0, width: 1, height: 1 })
          .raw()
          .toBuffer();
        expect(
          channelDelta([corner[0], corner[1], corner[2]], bg),
        ).toBeLessThanOrEqual(2);

        // The logotype + dots stack is centered; a generous center band must
        // contain pixels that contrast hard with the background (the ink).
        const bandH = Math.round(ph * 0.2);
        const band = await sharp(file)
          .extract({
            left: 0,
            top: Math.round((ph - bandH) / 2),
            width: pw,
            height: bandH,
          })
          .raw()
          .toBuffer({ resolveWithObject: true });
        let inkPixels = 0;
        for (let i = 0; i < band.data.length; i += band.info.channels) {
          const px: [number, number, number] = [
            band.data[i],
            band.data[i + 1],
            band.data[i + 2],
          ];
          if (channelDelta(px, bg) > 100) inkPixels++;
        }
        expect(inkPixels).toBeGreaterThan(100);
      });
    });
  },
);

describe("generator/module sync", () => {
  it("scripts/gen-ios-splash.mjs carries the same device list", async () => {
    const { readFileSync } = await import("node:fs");
    const script = readFileSync(
      path.join(repoRoot, "scripts/gen-ios-splash.mjs"),
      "utf8",
    );
    for (const s of IOS_LAUNCH_SCREENS) {
      expect(script).toContain(`{ w: ${s.w}, h: ${s.h}, dpr: ${s.dpr} }`);
    }
  });
});
