/**
 * iOS `apple-touch-startup-image` launch screens (perf WS-J). An installed iOS PWA
 * shows a blank screen between the icon tap and the WebView loading the start URL,
 * and iOS only replaces that blank if a startup image matches the device exactly
 * (it ignores the manifest `background_color`). Without these, that pre-document
 * window is black.
 *
 * The images are solid brand-background PNGs (cream `#f4f0e6` / dark `#14110c`) that
 * match the in-document `Splash`, so the launch reads as one continuous branded load:
 * solid background → the same background with the logotype → content. Regenerate the
 * PNGs with `scripts/gen-ios-splash.mjs` if this list changes.
 *
 * Each class is a portrait iPhone (css width/height + device-pixel-ratio); the media
 * query must match exactly for iOS to pick the image. Light/dark variants are chosen
 * by the device's appearance via `prefers-color-scheme`.
 */
export interface IosLaunchScreen {
  /** css width (px) */
  w: number;
  /** css height (px) */
  h: number;
  /** device pixel ratio */
  dpr: number;
}

export const IOS_LAUNCH_SCREENS: IosLaunchScreen[] = [
  { w: 320, h: 568, dpr: 2 }, // SE 1
  { w: 375, h: 667, dpr: 2 }, // 8 / SE 2-3
  { w: 414, h: 736, dpr: 3 }, // 8 Plus
  { w: 375, h: 812, dpr: 3 }, // X/XS/11 Pro/12-13 mini
  { w: 414, h: 896, dpr: 2 }, // XR / 11
  { w: 414, h: 896, dpr: 3 }, // XS Max / 11 Pro Max
  { w: 390, h: 844, dpr: 3 }, // 12/13/14
  { w: 428, h: 926, dpr: 3 }, // 12-14 Pro Max / Plus
  { w: 393, h: 852, dpr: 3 }, // 14 Pro / 15 / 15 Pro / 16
  { w: 430, h: 932, dpr: 3 }, // 15 Plus / 15 Pro Max / 16 Plus
  { w: 402, h: 874, dpr: 3 }, // 16 Pro
  { w: 440, h: 956, dpr: 3 }, // 16 Pro Max
];

export type LaunchTheme = "light" | "dark";

export function launchImageHref(s: IosLaunchScreen, theme: LaunchTheme): string {
  return `/splash/apple-splash-${s.w * s.dpr}-${s.h * s.dpr}-${theme}.png`;
}

export function launchImageMedia(s: IosLaunchScreen, theme: LaunchTheme): string {
  return (
    `screen and (device-width: ${s.w}px) and (device-height: ${s.h}px) ` +
    `and (-webkit-device-pixel-ratio: ${s.dpr}) and (orientation: portrait) ` +
    `and (prefers-color-scheme: ${theme})`
  );
}
