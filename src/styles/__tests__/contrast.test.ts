/**
 * The design tokens have to clear WCAG AA where they carry TEXT.
 *
 * This exists because they didn't. The secondary tone was spelled as an opacity
 * fade (`text-ink/55`, and interchangeably `/50`) at ~460 call sites, and an
 * opacity fade over the light ledger's cream loses contrast fast: it resolved
 * to 3.92:1, under the 4.5:1 AA asks for text below 18.7px bold / 24px — which
 * is every size that tone is used at (9–10.5px). An axe sweep of the fifteen
 * signed-in screens flagged it on every one of them.
 *
 * The fix was to name the tone (`--color-ink-muted`) instead of blending it, so
 * there is one value per theme to check. This is the check. It reads the real
 * stylesheet rather than a copy of the numbers, so a token edited in
 * `globals.css` without re-checking its contrast fails here.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  path.join(__dirname, "..", "globals.css"),
  "utf8",
);

/** The first definition of `name` at or after `from` — the offsets below are
 *  each theme block's opening, so this reads that block's own value. */
function token(name: string, from: number): string {
  const block = css.slice(from);
  const m = block.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --color-${name} not found`);
  return m[1];
}

const lightAt = css.indexOf("@theme");
const darkAt = css.indexOf('[data-theme="dark"]');
const systemDarkAt = css.indexOf('[data-theme="system"]');

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  );
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG 1.4.3 AA for text below the large-text threshold. */
const AA = 4.5;

describe("ink-muted, the one secondary text tone, clears AA on both grounds", () => {
  for (const [theme, at] of [
    ["light", lightAt],
    ["dark", darkAt],
    ["system (dark)", systemDarkAt],
  ] as const) {
    it(`${theme}: against the app background`, () => {
      expect(
        contrast(token("ink-muted", at), token("bg-base", at)),
      ).toBeGreaterThanOrEqual(AA);
    });

    it(`${theme}: against paper (sheets and active inputs)`, () => {
      expect(
        contrast(token("ink-muted", at), token("paper", at)),
      ).toBeGreaterThanOrEqual(AA);
    });
  }

  it("stays recognisably secondary — full ink is far stronger on both grounds", () => {
    for (const at of [lightAt, darkAt]) {
      const muted = contrast(token("ink-muted", at), token("bg-base", at));
      const full = contrast(token("ink", at), token("bg-base", at));
      expect(full).toBeGreaterThan(muted * 2);
    }
  });
});

describe("primary text clears AA by a wide margin", () => {
  for (const [theme, at] of [
    ["light", lightAt],
    ["dark", darkAt],
  ] as const) {
    it(`${theme}: ink on bg-base and on paper`, () => {
      expect(
        contrast(token("ink", at), token("bg-base", at)),
      ).toBeGreaterThanOrEqual(7); // AAA
      expect(
        contrast(token("ink", at), token("paper", at)),
      ).toBeGreaterThanOrEqual(7);
    });
  }
});
