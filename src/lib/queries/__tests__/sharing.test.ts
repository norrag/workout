/**
 * Sharing tests: code format (pure) + the R1 ownership assertion on the
 * copy-on-accept path, driven through a mocked service client (the full DB
 * walk stays covered by the hosted-DB integration smoke).
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import {
  acceptShareCode,
  buildMesoSnapshot,
  createShareCode,
  formatShareCode,
  newShareCode,
  parseMesoSnapshot,
} from "../sharing";
import { fakeClient, type FakeRow } from "./fake-client";

describe("share codes", () => {
  it("formats 8 chars from the unambiguous alphabet", () => {
    const code = formatShareCode(
      new Uint8Array([0, 31, 32, 255, 7, 100, 200, 50]),
    );
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    expect(code).not.toMatch(/[01IO]/);
  });

  it("generates distinct codes", () => {
    const codes = new Set(Array.from({ length: 50 }, () => newShareCode()));
    expect(codes.size).toBeGreaterThan(45);
    for (const code of codes) expect(code).toMatch(/^[A-Z2-9]{8}$/);
  });
});

// ---------------------------------------------------------------------------
// R1 — the service-role copy must never touch an object the share's owner
// doesn't own. A minimal read-only mock: select chains resolve against the
// fixture rows by their eq() filters; update resolves ok (the accept stamp).
// ---------------------------------------------------------------------------

function mockService(rows: Record<string, Array<Record<string, unknown>>>) {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filters.push([col, val]);
          return builder;
        },
        is: () => builder,
        not: () => builder,
        limit: () => builder,
        order: () => builder,
        update: () => builder,
        maybeSingle: async () => ({
          data:
            (rows[table] ?? []).find((r) =>
              filters.every(([c, v]) => r[c] === v),
            ) ?? null,
          error: null,
        }),
        then: (resolve: (v: { error: null }) => void) =>
          resolve({ error: null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient<Database>;
}

const share = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "share-1",
  owner_id: "owner",
  grantee_id: null,
  object_type: "template",
  object_id: "obj-1",
  share_code: "AAAAAAAA",
  expires_at: null,
  accepted_at: null,
  ...over,
});

describe("acceptShareCode — R1 ownership assertion", () => {
  it("refuses a template the share's owner does not own (re-pointed object_id)", async () => {
    const service = mockService({
      shares: [share()],
      templates: [{ id: "obj-1", user_id: "victim", name: "Victim split" }],
    });
    const result = await acceptShareCode(service, "grantee", "AAAAAAAA");
    expect(result.objectId).toBeNull();
    expect(result.error).toMatch(/no longer exists/);
  });

  it("refuses a mesocycle the share's owner does not own", async () => {
    const service = mockService({
      shares: [share({ object_type: "mesocycle" })],
      mesocycles: [{ id: "obj-1", user_id: "victim", name: "Victim meso" }],
    });
    const result = await acceptShareCode(service, "grantee", "AAAAAAAA");
    expect(result.objectId).toBeNull();
    expect(result.error).toMatch(/no longer exists/);
  });

  it("refuses a custom exercise owned by a third user", async () => {
    const service = mockService({
      shares: [share({ object_type: "exercise" })],
      exercises: [{ id: "obj-1", user_id: "victim", name: "Victim curl" }],
    });
    const result = await acceptShareCode(service, "grantee", "AAAAAAAA");
    expect(result.objectId).toBeNull();
    expect(result.error).toMatch(/no longer exists/);
  });

  it("passes a stock exercise (user_id null) through untouched", async () => {
    const service = mockService({
      shares: [share({ object_type: "exercise" })],
      exercises: [{ id: "obj-1", user_id: null, name: "Barbell Row" }],
    });
    const result = await acceptShareCode(service, "grantee", "AAAAAAAA");
    expect(result.error).toBeNull();
    expect(result.objectId).toBe("obj-1");
  });

  it("still rejects an already-used code from another grantee", async () => {
    const service = mockService({
      shares: [
        share({ grantee_id: "someone-else", accepted_at: "2026-06-01T00:00:00Z" }),
      ],
      templates: [{ id: "obj-1", user_id: "owner", name: "Owner split" }],
    });
    const result = await acceptShareCode(service, "grantee", "AAAAAAAA");
    expect(result.error).toMatch(/already used/i);
  });
});

// ---------------------------------------------------------------------------
// N65 — the snapshot. Redemption used to read the owner's LIVE planner board,
// so what the grantee received was whatever the owner's meso happened to hold
// when the code was typed. Minting now captures the structure; redeeming copies
// that, and only falls back to the live read for pre-snapshot codes.
// ---------------------------------------------------------------------------

// the snapshot is zod-validated on read (hard rule #6), so its ids are real
// uuids — the fixture uses readable ones
const uuid = (n: number, label: string) =>
  `${label.padEnd(8, "0").slice(0, 8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const MG_CHEST = uuid(1, "aaaaaaaa");
const MG_TRI = uuid(2, "aaaaaaaa");
const MG_BACK = uuid(3, "aaaaaaaa");
const EX_BENCH = uuid(1, "bbbbbbbb");
const EX_FLYE = uuid(2, "bbbbbbbb");
const EX_PUSHDOWN = uuid(3, "bbbbbbbb");
const EX_ROW = uuid(4, "bbbbbbbb");
const NAME_BY_EX: Record<string, string> = {
  [EX_BENCH]: "bench",
  [EX_FLYE]: "flye",
  [EX_PUSHDOWN]: "pushdown",
  [EX_ROW]: "row",
};

/** An owner's meso: two days, the first day's exercises interleaved across
 *  muscle groups (a day-level reorder — the case that used to be lost). */
function ownerMeso(): Record<string, FakeRow[]> {
  return {
    mesocycles: [
      {
        id: "meso1",
        user_id: "owner",
        name: "Winter block",
        weeks: 5,
        days_per_week: 2,
        includes_deload: true,
        rir_start: 3,
        rir_end: 0,
        rir_schedule: [3, 2, 1, 0],
      },
    ],
    meso_days: [
      { id: "d1", mesocycle_id: "meso1", day_number: 1, label: "Push", weekday: 1 },
      { id: "d2", mesocycle_id: "meso1", day_number: 2, label: "Pull", weekday: 4 },
    ],
    meso_day_groups: [
      { id: "g-chest", meso_day_id: "d1", muscle_group_id: MG_CHEST, position: 1, exercise_slots: 2 },
      { id: "g-tri", meso_day_id: "d1", muscle_group_id: MG_TRI, position: 2, exercise_slots: 1 },
      { id: "g-back", meso_day_id: "d2", muscle_group_id: MG_BACK, position: 1, exercise_slots: 1 },
    ],
    meso_exercises: [
      // day 1 is trained triceps-first: pushdown (1) → bench (2) → flye (3)
      { id: "f1", mesocycle_id: "meso1", meso_day_group_id: "g-chest", exercise_id: EX_BENCH, position: 2, slot_number: 1, initial_sets: 4 },
      { id: "f2", mesocycle_id: "meso1", meso_day_group_id: "g-chest", exercise_id: EX_FLYE, position: 3, slot_number: 2, initial_sets: 3 },
      { id: "f3", mesocycle_id: "meso1", meso_day_group_id: "g-tri", exercise_id: EX_PUSHDOWN, position: 1, slot_number: 1, initial_sets: 3 },
      { id: "f4", mesocycle_id: "meso1", meso_day_group_id: "g-back", exercise_id: EX_ROW, position: 1, slot_number: 1, initial_sets: 3 },
    ],
    exercises: [
      { id: EX_BENCH, user_id: null, name: "Bench Press" },
      { id: EX_FLYE, user_id: null, name: "Cable Flye" },
      { id: EX_PUSHDOWN, user_id: null, name: "Pushdown" },
      { id: EX_ROW, user_id: null, name: "Barbell Row" },
    ],
    shares: [],
  };
}

/** Every fill of the copied meso in flat day order, day by day. */
function copiedPlan(db: Record<string, FakeRow[]>, mesoId: string) {
  const days = db.meso_days
    .filter((d) => d.mesocycle_id === mesoId)
    .sort((a, b) => (a.day_number as number) - (b.day_number as number));
  return days.map((day) => {
    const groupIds = db.meso_day_groups
      .filter((g) => g.meso_day_id === day.id)
      .map((g) => g.id);
    return {
      day_number: day.day_number,
      label: day.label,
      weekday: day.weekday,
      order: db.meso_exercises
        .filter((f) => groupIds.includes(f.meso_day_group_id as string))
        .sort((a, b) => (a.position as number) - (b.position as number))
        .map((f) => NAME_BY_EX[f.exercise_id as string]),
    };
  });
}

describe("share snapshots (N65)", () => {
  it("captures the planner board — including the flat day order — when the code is minted", async () => {
    const db = ownerMeso();
    const client = fakeClient(db);
    const { code, error } = await createShareCode(
      client,
      "owner",
      "mesocycle",
      "meso1",
    );
    expect(error).toBeNull();
    expect(code).toMatch(/^[A-Z2-9]{8}$/);

    const snapshot = parseMesoSnapshot(db.shares[0].payload);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.meso.rir_schedule).toEqual([3, 2, 1, 0]);
    const day1 = snapshot!.days.find((d) => d.day_number === 1)!;
    expect(
      day1.groups
        .flatMap((g) => g.fills)
        .sort((a, b) => a.position - b.position)
        .map((f) => NAME_BY_EX[f.exercise_id]),
    ).toEqual(["pushdown", "bench", "flye"]);
  });

  it("re-minting an open code refreshes the snapshot (share again after editing)", async () => {
    const db = ownerMeso();
    const client = fakeClient(db);
    const first = await createShareCode(client, "owner", "mesocycle", "meso1");

    // the owner reorders day 1 — bench first now — and shares again
    db.meso_exercises.find((f) => f.exercise_id === EX_BENCH)!.position = 1;
    db.meso_exercises.find((f) => f.exercise_id === EX_PUSHDOWN)!.position = 2;
    const second = await createShareCode(client, "owner", "mesocycle", "meso1");

    expect(second.code).toBe(first.code); // one open code per object, unchanged
    expect(db.shares).toHaveLength(1);
    const snapshot = parseMesoSnapshot(db.shares[0].payload)!;
    expect(
      snapshot.days
        .find((d) => d.day_number === 1)!
        .groups.flatMap((g) => g.fills)
        .sort((a, b) => a.position - b.position)
        .map((f) => NAME_BY_EX[f.exercise_id]),
    ).toEqual(["bench", "pushdown", "flye"]);
  });

  it("redeems what was shared, not what the owner's board says now", async () => {
    const db = ownerMeso();
    const owner = fakeClient(db);
    const { code } = await createShareCode(owner, "owner", "mesocycle", "meso1");

    // after minting, the owner rebuilds their own board: reorders day 1 and
    // drops a day entirely. The grantee must still get what was handed over.
    db.meso_exercises.find((f) => f.exercise_id === EX_BENCH)!.position = 9;
    db.meso_exercises = db.meso_exercises.filter((f) => f.id !== "f4");
    db.meso_days = db.meso_days.filter((d) => d.id !== "d2");

    const result = await acceptShareCode(fakeClient(db), "grantee", code!);
    expect(result.error).toBeNull();
    expect(result.name).toBe("Winter block");

    const plan = copiedPlan(db, result.objectId!);
    expect(plan).toHaveLength(2);
    expect(plan[0].order).toEqual(["pushdown", "bench", "flye"]);
    expect(plan[1]).toMatchObject({ day_number: 2, weekday: 4 });
    expect(plan[1].order).toEqual(["row"]);
  });

  it("carries the per-week RIR schedule onto the copy", async () => {
    const db = ownerMeso();
    const owner = fakeClient(db);
    const { code } = await createShareCode(owner, "owner", "mesocycle", "meso1");
    const result = await acceptShareCode(fakeClient(db), "grantee", code!);
    const copy = db.mesocycles.find((m) => m.id === result.objectId)!;
    expect(copy.rir_schedule).toEqual([3, 2, 1, 0]);
    expect(copy.status).toBe("planned");
    expect(copy.user_id).toBe("grantee");
  });

  it("falls back to the owner's live board for a pre-snapshot code", async () => {
    const db = ownerMeso();
    db.shares = [
      {
        id: "share-legacy",
        owner_id: "owner",
        grantee_id: null,
        object_type: "mesocycle",
        object_id: "meso1",
        share_code: "LEGACYAA",
        expires_at: null,
        accepted_at: null,
        payload: null,
      },
    ];
    const result = await acceptShareCode(fakeClient(db), "grantee", "LEGACYAA");
    expect(result.error).toBeNull();
    const plan = copiedPlan(db, result.objectId!);
    expect(plan[0].order).toEqual(["pushdown", "bench", "flye"]);
  });

  it("still refuses a snapshot-carrying share re-pointed at another user's meso", async () => {
    const db = ownerMeso();
    const owner = fakeClient(db);
    const { code } = await createShareCode(owner, "owner", "mesocycle", "meso1");
    // the owner-side rewrite R1 defends against: same share row, victim's meso
    db.mesocycles.find((m) => m.id === "meso1")!.user_id = "victim";

    const result = await acceptShareCode(fakeClient(db), "grantee", code!);
    expect(result.objectId).toBeNull();
    expect(result.error).toMatch(/no longer exists/);
  });
});

describe("buildMesoSnapshot", () => {
  it("returns null for a meso the caller can't read (RLS)", async () => {
    const db = ownerMeso();
    expect(await buildMesoSnapshot(fakeClient(db), "not-mine")).toBeNull();
  });

  it("captures an empty plan without inventing days", async () => {
    const db = ownerMeso();
    db.meso_days = [];
    db.meso_day_groups = [];
    db.meso_exercises = [];
    const snapshot = await buildMesoSnapshot(fakeClient(db), "meso1");
    expect(snapshot!.days).toEqual([]);
  });
});

describe("parseMesoSnapshot", () => {
  it("rejects anything that isn't a v1 mesocycle snapshot", () => {
    expect(parseMesoSnapshot(null)).toBeNull();
    expect(parseMesoSnapshot({ version: 2, type: "mesocycle" })).toBeNull();
    expect(parseMesoSnapshot({ version: 1, type: "template" })).toBeNull();
  });
});
