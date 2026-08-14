/**
 * The ladder tells the truth about production (N87).
 *
 * Every engine test takes an explicit params object, so the ~2,050 unit and
 * golden tests are only as accurate as the fixture they are handed. On
 * 2026-08-14 that fixture had drifted a long way: the file whose stated purpose
 * was pinning production behavior ran **v18** while production ran **v27**, the
 * measuring band was pinned at 8 where live was 5, and `deload.target_rir` was
 * 6 across the ladder where live was 8 — the exact pair v27 exists to couple.
 * Nothing caught it, because nothing was checking.
 *
 * The reason it could drift is structural and is not going away: activations
 * run through the MCP tools from outside the repo, so no commit accompanies
 * them. This file is the compensating control. It is entirely offline — the
 * hash is the mechanism, so no network and no credentials are needed to prove a
 * fixture matches the row it claims to be.
 */
import { describe, expect, it } from "vitest";
import { engineParamsSchema } from "../params";
import {
  isMeasuringRir,
  stampE1rm,
  NON_MEASURING_CONFIDENCE,
} from "../predict";
import { hashParams } from "@/lib/queries/params-provenance";
import {
  LIVE_PARAMS,
  LIVE_PARAMS_HASH,
  LIVE_PARAMS_VERSION,
  V11_PARAMS,
  V12_PARAMS,
  V14_PARAMS,
  V15_PARAMS,
  V16_PARAMS,
  V17_PARAMS,
  V18_PARAMS,
  V19_PARAMS,
  V20_PARAMS,
  V21_PARAMS,
  V22_PARAMS,
  V23_PARAMS,
  V24_PARAMS,
  V25_PARAMS,
  V26_PARAMS,
  V27_PARAMS,
} from "./helpers";

/**
 * Every rung, with the `params_hash` of the row it claims to mirror — read off
 * `public.engine_params` on 2026-08-14. These are facts about stored rows and
 * never change: a stored row is immutable, so a rung whose digest stops
 * matching has been edited wrongly, not superseded.
 *
 * (v13 is deliberately absent — the ladder has never carried it, and no fixture
 * derives from it.)
 */
const LADDER = [
  [11, V11_PARAMS, "43102e52f88144649c0a546ea81513b7132dc6f2e4d064dd7d5ffec6fc35b8e0"],
  [12, V12_PARAMS, "0fd04a7772cf3ee4e09db97e1390a40afaf857bf0ae3e6afef4ee0c567b66268"],
  [14, V14_PARAMS, "6b7bce05f0c2002038c1e8ad1e9ffa328626a947e41c74971045074bfcdf4ace"],
  [15, V15_PARAMS, "437679f0707850638b85e77478c3b53be24d726fd58f689b637825eb94c00084"],
  [16, V16_PARAMS, "20d84f6eb6245c9355d058e6729c708b85cdcce424eba000ff3076520760e478"],
  [17, V17_PARAMS, "72b58d846a4b1ea372cfbbc2f0fd9ee98d36f7ca5ef3de3b86ec463e133f433e"],
  [18, V18_PARAMS, "fede4627ed64d19b5134e0bb055d500007496a0fc6aee6b0964335d56f91acbd"],
  [19, V19_PARAMS, "e296579e6c0bca2f0a097360181c899eeb4502cfafb9de96e32d90e628ae9623"],
  [20, V20_PARAMS, "cb451a02d96135a5cb6d1bec5f01e83a5fbdb08f87da9d1799dae176d1c90287"],
  [21, V21_PARAMS, "7017e2570317868281d772d3c139c28dd6bcb5dcdaf25719d0275ce2af3b4316"],
  [22, V22_PARAMS, "e127b0bf177981159bef4dd089f9d4d1e3bf2a59babe4cce175ead14af1d0a31"],
  [23, V23_PARAMS, "ed12c6a0072bea554d102744353a248ec7f0222b85a5cd3bb2fe95f361e92417"],
  [24, V24_PARAMS, "b58a0f1dc1b620c57b67aeac28b98be15bdf35d358ee1ca88ff7f4d8362ef3e6"],
  [25, V25_PARAMS, "91887f0fb5d7a1257531b8865ff0b373e304ac3f9bf7006b4ae9443a9c8cc487"],
  [26, V26_PARAMS, "6dd0224425b8c6afaa51f442386cddb7672f31727604ad578120f8c7c5eb96fa"],
  [27, V27_PARAMS, "f8dcfb51489c799218e332ecfdc9e92b6cb45e191cd80f4e582611b15a85603d"],
] as const;

describe("the live params fixture (N87)", () => {
  /**
   * The load-bearing assertion. `params_hash` is sha256 over the canonical
   * sorted-key JSON of the stored row, so reproducing it from a hand-written
   * fixture proves the fixture IS the row — not merely close to it. A wrong
   * value anywhere, at any depth, changes the digest.
   *
   * If this fails after an activation, the fixture is wrong, not the hash: read
   * the live `params_hash` off `get_engine_params` and fix the object until it
   * agrees.
   */
  it("hashes to the stored params_hash of the live engine_params row", () => {
    expect(hashParams(LIVE_PARAMS)).toBe(LIVE_PARAMS_HASH);
  });

  it("is the top of the ladder", () => {
    const top = LADDER[LADDER.length - 1];
    expect(LIVE_PARAMS_VERSION).toBe(top[0]);
    expect(LIVE_PARAMS).toBe(top[1]);
    expect(LIVE_PARAMS_HASH).toBe(top[2]);
  });

  /**
   * And the same proof for every historical rung, which is what makes the
   * ladder a record rather than a reconstruction. `replay_decisions` re-runs an
   * old decision under the params version it was recorded against, so a rung
   * that has quietly drifted would make a replay silently wrong — the failure
   * mode the whole provenance column exists to prevent.
   */
  it("every rung hashes to the stored row it mirrors", () => {
    for (const [version, params, hash] of LADDER) {
      expect(hashParams(params), `v${version} must match its stored row`).toBe(
        hash,
      );
    }
  });

  /**
   * A fixture that no longer parses is one the schema has moved past, which
   * means a historical decision recorded under it can no longer be replayed.
   */
  it("every rung parses under the current schema", () => {
    for (const [version, params] of LADDER) {
      expect(
        () => engineParamsSchema.parse(params),
        `v${version} must parse`,
      ).not.toThrow();
    }
  });

  /** Two rungs with the same digest means one of them is mis-derived. */
  it("no two rungs are the same params", () => {
    const seen = new Map<string, number>();
    for (const [version, params] of LADDER) {
      const digest = hashParams(params);
      const clash = seen.get(digest);
      expect(
        clash,
        `v${version} hashes identically to v${clash} — one is mis-derived`,
      ).toBeUndefined();
      seen.set(digest, version);
    }
  });

  /**
   * v27's whole purpose is that these two move together: the deload's target
   * RIR must sit **above** the measuring cutoff, so ordinary deload work is
   * priced and performed but never enters a strength anchor. Pinned separately
   * from the hash because the hash says *what* the values are and this says
   * *why* they have to relate — a future version that raises the cutoff past
   * the deload target would re-admit deload sets to the anchor silently.
   */
  it("keeps deload work above the measuring cutoff", () => {
    const cutoff = LIVE_PARAMS.e1rm.max_measuring_rir;
    expect(cutoff).toBeDefined();
    expect(LIVE_PARAMS.deload.target_rir).toBeGreaterThan(cutoff!);
  });
});

/**
 * The behavior the live values produce, run through the real functions.
 *
 * This is the coverage that was missing entirely. `measuring-band.test.ts` pins
 * the cutoff at **8** (v26) and `deload.test.ts` runs `target_rir` **6** (v15) —
 * both correct for the versions they name, and neither is what production does.
 * v27 moved the cutoff to 5 and the deload target to 8 *in the same version*,
 * precisely so the two would cross; these assert the crossing.
 */
describe("live engine behavior (v27)", () => {
  const band = LIVE_PARAMS.e1rm;

  it("stops measuring above 5 RIR, not above 8", () => {
    for (const rir of [0, 1, 2, 3, 4, 5]) {
      expect(isMeasuringRir(rir, band), `rir ${rir} measures`).toBe(true);
    }
    // 6, 7 and 8 all measured under v26 and no longer do. This is the
    // one-way re-levelling doc 10 §9.1 describes.
    for (const rir of [6, 7, 8, 9]) {
      expect(isMeasuringRir(rir, band), `rir ${rir} does not measure`).toBe(
        false,
      );
    }
  });

  /**
   * The point of the pair. A deload week runs at `deload.target_rir`, so every
   * set in it is performed at an assumed RIR of 8 — above the cutoff of 5, so
   * none of it can reach a strength anchor. Under v26 (cutoff 8, deload 6) all
   * of that work measured, which is the defect v27 closed.
   */
  it("makes an ordinary deload set non-measuring", () => {
    const deloadRir = LIVE_PARAMS.deload.target_rir;
    expect(isMeasuringRir(deloadRir, band)).toBe(false);

    expect(stampE1rm(185, 8, deloadRir, band)).toEqual({
      e1rm: null,
      e1rm_confidence: NON_MEASURING_CONFIDENCE,
    });
  });

  /**
   * …and the same set at a working week's effort still measures, so the band
   * excludes deload work without blinding the anchor in general. A regression
   * that raised the cutoff would break the test above; one that lowered it too
   * far breaks this one.
   */
  it("still measures ordinary working-week effort", () => {
    const stamped = stampE1rm(185, 8, 2, band);
    expect(stamped.e1rm).not.toBeNull();
    expect(stamped.e1rm_confidence).not.toBe(NON_MEASURING_CONFIDENCE);
  });
});
