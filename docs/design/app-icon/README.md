# Handoff: App Icon — "S4 / Wordmark + Slider"

## Overview
The chosen app icon for **workout** (working name — branding not yet final). The mark is the stacked **WORK / OUT** wordmark over a single **snap-to-stop slider rule**: a ledger track bracketed by two end stops, with a square orange "pip" sitting on it at ~62%. It's drawn directly from the app's own slider control, so the icon reads as the product, not a generic dumbbell/lifestyle logo.

## About the design files
These files are a **design reference + ready-to-use raster assets**, produced from the HTML mockup board (`workout - App Icon.dc.html`, Exploration 04 → **S4**). The PNGs are final-quality and can be dropped straight into a build; the `icon-source.html` is the editable vector-ish master (pure CSS + the bundled Archivo font) if you need to regenerate or tweak. Recreate/wire it into the target app's existing PWA/manifest setup — don't ship the HTML page itself.

## Fidelity
**High-fidelity.** Exact colors, geometry, and typography are specified below and baked into the exported PNGs.

## The mark — exact spec
Master art is a **full square** (no rounded corners — the OS/manifest applies its own mask). All measurements are expressed as a fraction of the icon's edge length `S`, so it scales to any size.

| Element | Value (× S) | Notes |
|---|---|---|
| Side padding (L/R) | 0.1477 (26/176) | content inset |
| Gap between rows | 0.0682 (12/176) | flex column gap |
| Wordmark font size | 0.1875 (33/176) | **Archivo 800**, line-height 1, letter-spacing 0.01em |
| Rule height | 0.1477 (26/176) | slider row |
| Rule margin-top | 0.0170 (3/176) | extra space above rule |
| Track thickness | 0.0170 (3/176) | horizontal line |
| End-tick width | 0.0170 (3/176) | two stops only |
| End-tick height | 0.1023 (18/176) | |
| Pip (square) | 0.1477 × 0.1477 (26/176) | centered on track |
| Pip position | 62% of track width | fill runs left → pip |

Layout: vertical flex column, centered. Rows top-to-bottom = `WORK`, `OUT`, slider rule. Wordmark is left-aligned to the padding edge; the rule spans the full padded width. The filled (ink) portion of the track runs from the left stop to the pip; the remainder is the light track.

### Colors
**Paper (primary)**
- Background `#F4F0E6`
- Ink / wordmark / fill `#17140F`
- Light (unfilled) track `rgba(23,20,15,0.2)`
- End stops `rgba(23,20,15,0.5)`
- Pip (orange) `#C14B2A`
- Pip corner radius: **0** (true square)

**Dark (alternate)**
- Background `#0B0B0C`
- Ink / wordmark / fill `#F2F2F0`
- Light track `#34343A`
- End stops `#6E6E74`
- Pip (orange) `#C8593B`
- Pip corner radius: `0.017 × S` (barely rounded, matches the dark board treatment)

### Typography
- **Archivo**, weight **800**. Bundled as `assets/Archivo-Variable.ttf` (variable font, weight axis 100–900). License: `assets/Archivo-OFL.txt` (SIL OFL 1.1).

## Assets (in `assets/`)
| File | Size | Purpose |
|---|---|---|
| `icon-512.png` | 512² | PWA `any`, primary |
| `icon-192.png` | 192² | PWA `any` |
| `icon-180.png` | 180² | iOS `apple-touch-icon` |
| `icon-maskable-512.png` | 512² | PWA `maskable` (content in central 80% safe zone) |
| `icon-512-dark.png` | 512² | dark alternate (optional) |
| `icon-maskable-512-dark.png` | 512² | dark maskable alternate (optional) |
| `Archivo-Variable.ttf` | — | source font |
| `Archivo-OFL.txt` | — | font license |

All raster assets are full-bleed (no transparency); the background color is part of the art.

## Wiring it up
`manifest.webmanifest` is included (adjust the `src` paths to wherever you serve icons, e.g. `/icons/`):

```html
<link rel="icon" href="/icons/icon-192.png" sizes="192x192" type="image/png">
<link rel="apple-touch-icon" href="/icons/icon-180.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#F4F0E6">
```

```json
"icons": [
  { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
  { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
  { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
]
```

## Notes / open items
- **Name not final.** The manifest uses `"Workout"` as a placeholder for `name` / `short_name` — update when branding lands.
- **No favicon included.** At 16–32px the wordmark is illegible. When you need a favicon, use a simplified mark (the slider track + orange pip alone, no lettering) rather than shrinking S4. Happy to generate that on request.
- **Regenerating:** open `icon-source.html` — set `--size` and the theme class (`dark`, `maskable`) and screenshot/export, or re-render at any resolution from the documented fractions above.

## Files
- `assets/` — production PNGs + bundled font & license
- `manifest.webmanifest` — PWA manifest (icon entries + theme colors)
- `icon-source.html` — editable CSS master (paper + dark)
- Original mockup board (in the design project): `workout - App Icon.dc.html`, section **Exploration 04 → S4**
