/**
 * N79 — `resolveActiveMesocycle`: which block is "the current one" once more
 * than one may be live.
 *
 * The rule the owner set is *most recently logged set wins*, and the reason it
 * is the right rule is that it is the only key the athlete moves by training
 * rather than by bookkeeping: log a rehab session and the app follows the rehab
 * block; log the macro's next day and it follows that again, with nothing to
 * switch. Pinned here: the single-active case never pays for the tiebreak, the
 * tiebreak actually keys on recency (not creation order, which is what the old
 * single-active lookup used), and a block with no sets yet still resolves.
 */
import { describe, expect, it } from "vitest";
import { resolveActiveMesocycle } from "../cycles";
import { fakeClient, type FakeTables } from "./fake-client";

const USER = "u1";

function meso(id: string, createdAt: string, status = "active") {
  return {
    id,
    user_id: USER,
    status,
    created_at: createdAt,
    macrocycle_id: null,
  };
}

function set(mesoId: string, performedAt: string) {
  return { id: `s-${mesoId}-${performedAt}`, user_id: USER, mesocycle_id: mesoId, performed_at: performedAt };
}

function client(tables: FakeTables) {
  return fakeClient(tables);
}

describe("resolveActiveMesocycle (N79)", () => {
  it("returns null when nothing is active", async () => {
    const c = client({
      mesocycles: [meso("m1", "2026-01-01", "completed")],
      logged_sets: [],
    });
    expect(await resolveActiveMesocycle(c, USER)).toBeNull();
  });

  it("returns the only active block without consulting logged sets", async () => {
    const c = client({
      mesocycles: [meso("m1", "2026-01-01"), meso("m2", "2026-02-01", "planned")],
      // deliberately points at the OTHER meso: if the tiebreak ran at all it
      // would have to ignore this, and the cheapest proof is that it can't run
      logged_sets: [set("m2", "2026-03-01T10:00:00Z")],
    });
    expect((await resolveActiveMesocycle(c, USER))?.id).toBe("m1");
  });

  it("picks the block holding the most recently logged set, not the newest block", async () => {
    const c = client({
      mesocycles: [
        // the macro block, started long ago and still running
        meso("macro-block", "2026-01-01"),
        // the standalone rehab block, created later — creation order would pick this
        meso("rehab", "2026-06-01"),
      ],
      logged_sets: [
        set("rehab", "2026-06-02T09:00:00Z"),
        set("macro-block", "2026-06-09T09:00:00Z"),
      ],
    });
    expect((await resolveActiveMesocycle(c, USER))?.id).toBe("macro-block");
  });

  it("follows the athlete back to the other block on the next session", async () => {
    const c = client({
      mesocycles: [meso("macro-block", "2026-01-01"), meso("rehab", "2026-06-01")],
      logged_sets: [
        set("macro-block", "2026-06-09T09:00:00Z"),
        set("rehab", "2026-06-10T09:00:00Z"),
      ],
    });
    expect((await resolveActiveMesocycle(c, USER))?.id).toBe("rehab");
  });

  it("falls back to the newest block when neither has been logged yet", async () => {
    const c = client({
      mesocycles: [meso("older", "2026-01-01"), meso("newer", "2026-06-01")],
      logged_sets: [],
    });
    expect((await resolveActiveMesocycle(c, USER))?.id).toBe("newer");
  });

  it("ignores another user's sets when breaking the tie", async () => {
    const c = client({
      mesocycles: [meso("m1", "2026-01-01"), meso("m2", "2026-02-01")],
      logged_sets: [
        { ...set("m1", "2026-06-09T09:00:00Z"), user_id: "someone-else" },
        set("m2", "2026-06-01T09:00:00Z"),
      ],
    });
    expect((await resolveActiveMesocycle(c, USER))?.id).toBe("m2");
  });
});
