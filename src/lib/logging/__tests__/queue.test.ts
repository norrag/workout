import { describe, it, expect } from "vitest";
import {
  ACK_ECHO_TIMEOUT_MS,
  DEFAULT_RETRY,
  EMPTY_QUEUE,
  ack,
  backoffMs,
  clearWorkout,
  decodeQueue,
  encodeQueue,
  enqueue,
  expireAcked,
  fail,
  hasPendingAmend,
  hasPendingLog,
  nextReady,
  nextWakeAt,
  opKey,
  pendingSetsFor,
  queueSummary,
  reconcile,
  retryAll,
  settle,
  type QueueState,
  type ServerSetRow,
  type SetLogOp,
} from "../queue";

const WORKOUT = "11111111-1111-4111-8111-111111111111";
const WE_A = "22222222-2222-4222-8222-222222222222";
const WE_B = "33333333-3333-4333-8333-333333333333";
const SET_ID = "44444444-4444-4444-8444-444444444444";

function log(
  setNumber: number,
  weight = 100,
  we = WE_A,
  rir: number | null = 2,
): SetLogOp {
  return {
    kind: "log",
    workout_id: WORKOUT,
    workout_exercise_id: we,
    set_number: setNumber,
    weight,
    reps: 8,
    rir_reported: rir,
    set_type: "straight",
    performed_on: "2026-07-31",
  };
}

function amend(
  weight = 140,
  reps = 7,
  rir: number | null = 1,
  setId = SET_ID,
): SetLogOp {
  return {
    kind: "amend",
    workout_id: WORKOUT,
    set_id: setId,
    weight,
    reps,
    rir_reported: rir,
  };
}

function add(state: QueueState, id: string, op: SetLogOp, now: number) {
  return enqueue(state, { id, op, now });
}

/** a rendered server row for the exercise + set the helpers above address */
function row(
  setNumber: number,
  over: Partial<ServerSetRow> = {},
): ServerSetRow {
  return {
    id: SET_ID,
    set_number: setNumber,
    weight: 100,
    reps: 8,
    rir_reported: 2,
    ...over,
  };
}

const renderedA = (sets: ServerSetRow[]) => [
  { workoutExerciseId: WE_A, sets },
];

describe("opKey", () => {
  it("identifies the cell an op competes for", () => {
    expect(opKey(log(1))).toBe(`log:${WE_A}:1`);
    expect(opKey(log(1, 200))).toBe(opKey(log(1, 100)));
    expect(opKey(log(2))).not.toBe(opKey(log(1)));
    expect(opKey(log(1, 100, WE_B))).not.toBe(opKey(log(1)));
  });
});

describe("enqueue", () => {
  it("appends in tap order", () => {
    let q = add(EMPTY_QUEUE, "a", log(1), 1000);
    q = add(q, "b", log(2), 1100);
    expect(q.ops.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("supersedes a not-yet-started op for the same cell, keeping its place", () => {
    let q = add(EMPTY_QUEUE, "a", log(1, 100), 1000);
    q = add(q, "b", log(2), 1100);
    q = add(q, "c", log(1, 135), 1200);
    // one write for set 1, still ahead of set 2, carrying the latest weight
    expect(q.ops).toHaveLength(2);
    expect(q.ops[0].id).toBe("c");
    expect((q.ops[0].op as { weight: number }).weight).toBe(135);
    expect(q.ops[0].enqueuedAt).toBe(1000); // FIFO position preserved
    expect(q.ops[1].id).toBe("b");
  });

  it("does NOT supersede the op already in flight — it queues behind it", () => {
    let q = add(EMPTY_QUEUE, "a", log(1, 100), 1000);
    q = enqueue(q, { id: "b", op: log(1, 135), now: 1100 }, "a");
    expect(q.ops.map((o) => o.id)).toEqual(["a", "b"]);
  });
});

describe("nextReady / nextWakeAt", () => {
  it("serves the oldest pending op, and only after its backoff", () => {
    let q = add(EMPTY_QUEUE, "a", log(1), 1000);
    q = add(q, "b", log(2), 1100);
    expect(nextReady(q, 1200)?.id).toBe("a");

    q = fail(q, "a", 1200, "offline");
    // set 1 is backing off — set 2 must NOT overtake it into the log
    expect(nextReady(q, 1300)).toBeNull();
    expect(nextWakeAt(q)).toBe(1200 + backoffMs(1));
    expect(nextReady(q, 1200 + backoffMs(1))?.id).toBe("a");
  });

  it("ignores parked ops", () => {
    let q = add(EMPTY_QUEUE, "a", log(1), 0);
    for (let i = 0; i < DEFAULT_RETRY.maxAttempts; i += 1) {
      q = fail(q, "a", 0, "offline");
    }
    expect(q.ops[0].status).toBe("failed");
    expect(nextReady(q, 1e9)).toBeNull();
    expect(nextWakeAt(q)).toBeNull();
  });
});

describe("backoffMs", () => {
  it("doubles and caps", () => {
    expect(backoffMs(1)).toBe(2_000);
    expect(backoffMs(2)).toBe(4_000);
    expect(backoffMs(3)).toBe(8_000);
    expect(backoffMs(20)).toBe(DEFAULT_RETRY.maxMs);
  });
});

describe("fail / retryAll / settle", () => {
  it("parks an op instead of dropping it once retries are spent", () => {
    let q = add(EMPTY_QUEUE, "a", log(1), 0);
    for (let i = 0; i < DEFAULT_RETRY.maxAttempts; i += 1) {
      q = fail(q, "a", 0, "offline");
    }
    // the set is still here — a logged set is never silently discarded
    expect(q.ops).toHaveLength(1);
    expect(queueSummary(q)).toEqual({ pending: 0, failed: 1 });
    expect(q.ops[0].error).toBe("offline");

    q = retryAll(q, 5000);
    expect(queueSummary(q)).toEqual({ pending: 1, failed: 0 });
    expect(nextReady(q, 5000)?.id).toBe("a");

    expect(settle(q, "a").ops).toHaveLength(0);
  });
});

describe("pendingSetsFor (the optimistic overlay)", () => {
  it("reports queued sets for one exercise only", () => {
    let q = add(EMPTY_QUEUE, "a", log(1, 135), 0);
    q = add(q, "b", log(2, 135), 1);
    q = add(q, "c", log(1, 90, WE_B), 2);

    const a = pendingSetsFor(q, WE_A);
    expect([...a.keys()]).toEqual([1, 2]);
    expect(a.get(1)).toMatchObject({
      weight: 135,
      reps: 8,
      rirReported: 2,
      status: "pending",
    });
    expect([...pendingSetsFor(q, WE_B).keys()]).toEqual([1]);
  });

  it("retires an entry the moment the server echoes it back", () => {
    let q = add(EMPTY_QUEUE, "a", log(1), 0);
    q = add(q, "b", log(2), 1);
    expect([...pendingSetsFor(q, WE_A, new Set([1])).keys()]).toEqual([2]);
  });

  it("keeps a parked set visible as logged, flagged failed", () => {
    let q = add(EMPTY_QUEUE, "a", log(1), 0);
    for (let i = 0; i < DEFAULT_RETRY.maxAttempts; i += 1) {
      q = fail(q, "a", 0, "offline");
    }
    expect(pendingSetsFor(q, WE_A).get(1)?.status).toBe("failed");
  });

  it("ignores non-log ops", () => {
    const q = add(
      EMPTY_QUEUE,
      "a",
      {
        kind: "plan_weight",
        workout_id: WORKOUT,
        workout_exercise_id: WE_A,
        set_number: 1,
        weight: 135,
      },
      0,
    );
    expect(pendingSetsFor(q, WE_A).size).toBe(0);
    expect(hasPendingLog(q, WE_A, 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// N73 — the echo rule
// ---------------------------------------------------------------------------

describe("ack + reconcile (the echo rule)", () => {
  it("keeps a landed set logged in the gap before its render arrives", () => {
    // THE REGRESSION. The write resolves, but the revalidated render is still
    // in flight: for that ~1s the row must stay logged and set 2 must stay the
    // active one. Settling on dispatch success is what made the box un-tick,
    // walked the active set backwards, then snapped forward again.
    let q = add(EMPTY_QUEUE, "a", log(1), 1000);
    q = ack(q, "a", 1100);

    expect(pendingSetsFor(q, WE_A).get(1)).toMatchObject({
      weight: 100,
      reps: 8,
      status: "pending",
    });
    // and nothing re-sends it while it waits
    expect(nextReady(q, 9999)).toBeNull();
  });

  it("retires a log op only once the render carries its set", () => {
    let q = add(EMPTY_QUEUE, "a", log(1), 1000);
    q = add(q, "b", log(2), 1010);
    q = ack(q, "a", 1100);

    // a render that predates the write leaves it alone
    expect(reconcile(q, renderedA([])).ops).toHaveLength(2);
    // the render that contains it retires it
    q = reconcile(q, renderedA([row(1)]));
    expect(q.ops.map((o) => o.id)).toEqual(["b"]);
  });

  it("leaves an op alone when its exercise isn't in the render at all", () => {
    // absence of evidence is not evidence the write is missing
    let q = add(EMPTY_QUEUE, "a", log(1), 1000);
    q = ack(q, "a", 1100);
    expect(
      reconcile(q, [{ workoutExerciseId: WE_B, sets: [row(1)] }]).ops,
    ).toHaveLength(1);
  });

  it("never touches a pending or failed op — those still owe a write", () => {
    let q = add(EMPTY_QUEUE, "a", log(1), 1000);
    for (let i = 0; i < DEFAULT_RETRY.maxAttempts; i += 1) q = fail(q, "a", 0, "offline");
    q = add(q, "b", log(2), 1010);
    expect(reconcile(q, renderedA([row(1), row(2)])).ops).toHaveLength(2);
  });

  it("returns the same state object when nothing retires", () => {
    const q = add(EMPTY_QUEUE, "a", log(1), 1000);
    // the day view runs this on every render; it must be free when idle
    expect(reconcile(q, renderedA([row(1)]))).toBe(q);
    expect(reconcile(EMPTY_QUEUE, renderedA([]))).toBe(EMPTY_QUEUE);
  });

  it("holds an amend through a STALE render and retires it on the real echo", () => {
    // THE DISCARDED-RIR REGRESSION. The row showed 1 RIR, the render still
    // carried the pre-amend 2. Retiring on the render's arrival (rather than
    // its content) let the row adopt the old value and dropped the edit.
    let q = add(EMPTY_QUEUE, "a", amend(140, 7, 1), 1000);
    q = ack(q, "a", 1100);

    const stale = renderedA([row(1, { weight: 140, reps: 7, rir_reported: 2 })]);
    expect(reconcile(q, stale).ops).toHaveLength(1);
    expect(hasPendingAmend(reconcile(q, stale), SET_ID)).toBe(true);

    const echoed = renderedA([row(1, { weight: 140, reps: 7, rir_reported: 1 })]);
    expect(reconcile(q, echoed).ops).toHaveLength(0);
  });

  it("holds an amend whose set is missing from the render", () => {
    let q = add(EMPTY_QUEUE, "a", amend(), 1000);
    q = ack(q, "a", 1100);
    expect(reconcile(q, renderedA([row(1, { id: "other" })])).ops).toHaveLength(1);
  });

  it("matches a null reported RIR exactly, not loosely", () => {
    let q = add(EMPTY_QUEUE, "a", amend(140, 7, null), 1000);
    q = ack(q, "a", 1100);
    const zero = renderedA([row(1, { weight: 140, reps: 7, rir_reported: 0 })]);
    expect(reconcile(q, zero).ops).toHaveLength(1);
    const nulled = renderedA([row(1, { weight: 140, reps: 7, rir_reported: null })]);
    expect(reconcile(q, nulled).ops).toHaveLength(0);
  });
});

describe("acked ops are past re-sending", () => {
  it("is not re-dispatched, re-armed, or superseded", () => {
    let q = add(EMPTY_QUEUE, "a", log(1, 100), 1000);
    q = ack(q, "a", 1100);

    expect(nextReady(q, 1e9)).toBeNull();
    expect(nextWakeAt(q)).toBeNull();
    // "try again" must not re-send a write that already landed
    expect(retryAll(q, 2000).ops[0].status).toBe("acked");
    // a later op for the same cell queues BEHIND it and wins by landing last
    const q2 = add(q, "b", log(1, 135), 1200);
    expect(q2.ops.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("is counted as neither outstanding nor parked", () => {
    let q = add(EMPTY_QUEUE, "a", log(1), 1000);
    q = ack(q, "a", 1100);
    // the status strip must stay silent — there is nothing to report
    expect(queueSummary(q)).toEqual({ pending: 0, failed: 0 });
  });

  it("is dropped on reload — a fresh page IS the echo", () => {
    let q = add(EMPTY_QUEUE, "a", log(1), 1000);
    q = add(q, "b", log(2), 1010);
    q = ack(q, "a", 1100);
    expect(decodeQueue(encodeQueue(q)).ops.map((o) => o.id)).toEqual(["b"]);
  });
});

describe("expireAcked (the safety valve)", () => {
  it("drops an amend whose echo never comes", () => {
    let q = add(EMPTY_QUEUE, "a", amend(), 1000);
    q = ack(q, "a", 1000);
    expect(expireAcked(q, 1000 + ACK_ECHO_TIMEOUT_MS - 1).ops).toHaveLength(1);
    // letting it go just means the row adopts server state — where it was headed
    expect(expireAcked(q, 1000 + ACK_ECHO_TIMEOUT_MS).ops).toHaveLength(0);
  });

  it("NEVER drops a log — that would retract a set that really saved", () => {
    let q = add(EMPTY_QUEUE, "a", log(1), 1000);
    q = ack(q, "a", 1000);
    expect(expireAcked(q, 1e12).ops).toHaveLength(1);
  });

  it("leaves pending and failed ops alone", () => {
    let q = add(EMPTY_QUEUE, "a", amend(), 1000);
    for (let i = 0; i < DEFAULT_RETRY.maxAttempts; i += 1) q = fail(q, "a", 0, "offline");
    expect(expireAcked(q, 1e12).ops).toHaveLength(1);
    expect(expireAcked(q, 1e12)).toBe(q);
  });
});

describe("hasPendingAmend", () => {
  it("is true from the tap until the echo, whatever the op's status", () => {
    let q = add(EMPTY_QUEUE, "a", amend(), 1000);
    expect(hasPendingAmend(q, SET_ID)).toBe(true);
    q = ack(q, "a", 1100);
    expect(hasPendingAmend(q, SET_ID)).toBe(true);
    expect(hasPendingAmend(q, "someone-else")).toBe(false);
    expect(hasPendingAmend(settle(q, "a"), SET_ID)).toBe(false);
  });
});

describe("hasPendingLog", () => {
  it("guards the unlog path while a log is outstanding", () => {
    const q = add(EMPTY_QUEUE, "a", log(3), 0);
    expect(hasPendingLog(q, WE_A, 3)).toBe(true);
    expect(hasPendingLog(q, WE_A, 4)).toBe(false);
    expect(hasPendingLog(settle(q, "a"), WE_A, 3)).toBe(false);
  });
});

describe("clearWorkout", () => {
  it("drops only the named workout's ops", () => {
    const other = "55555555-5555-4555-8555-555555555555";
    let q = add(EMPTY_QUEUE, "a", log(1), 0);
    q = add(q, "b", { ...log(1, 100, WE_B), workout_id: other }, 1);
    expect(clearWorkout(q, WORKOUT).ops.map((o) => o.id)).toEqual(["b"]);
  });
});

describe("storage codec", () => {
  it("round-trips", () => {
    let q = add(EMPTY_QUEUE, "a", log(1), 0);
    q = add(q, "b", {
      kind: "amend",
      workout_id: WORKOUT,
      set_id: SET_ID,
      weight: 140,
      reps: 7,
      rir_reported: null,
    }, 1);
    expect(decodeQueue(encodeQueue(q))).toEqual(q);
  });

  // doc 21 §2: an op enqueued by the PREVIOUS build has no `rir_reported`.
  // It must still decode — dropping it would strand a real logged set — and
  // dispatches as null, which the server resolves to the slot's target RIR.
  it("accepts a pre-capture log op with no rir_reported", () => {
    const legacy = {
      v: 1,
      ops: [
        {
          id: "a",
          op: {
            kind: "log",
            workout_id: WORKOUT,
            workout_exercise_id: WE_A,
            set_number: 1,
            weight: 135,
            reps: 8,
            set_type: "straight",
            performed_on: "2026-07-31",
          },
          attempts: 0,
          nextAttemptAt: 0,
          enqueuedAt: 0,
          status: "pending",
          error: null,
        },
      ],
    };
    const decoded = decodeQueue(JSON.stringify(legacy));
    expect(decoded.ops).toHaveLength(1);
    expect(pendingSetsFor(decoded, WE_A).get(1)?.rirReported).toBeNull();
  });

  it("rejects an out-of-range reported RIR (0–10 is what a human can estimate)", () => {
    const q = add(EMPTY_QUEUE, "a", log(1), 0);
    const raw = JSON.parse(encodeQueue(q));
    raw.ops[0].op.rir_reported = 21;
    expect(decodeQueue(JSON.stringify(raw))).toEqual(EMPTY_QUEUE);
  });

  it("treats anything unparseable as an empty queue rather than poisoning the processor", () => {
    expect(decodeQueue(null)).toEqual(EMPTY_QUEUE);
    expect(decodeQueue("not json")).toEqual(EMPTY_QUEUE);
    expect(decodeQueue(JSON.stringify({ v: 99, ops: [] }))).toEqual(EMPTY_QUEUE);
    expect(
      decodeQueue(JSON.stringify({ v: 1, ops: [{ id: "a", op: { kind: "nope" } }] })),
    ).toEqual(EMPTY_QUEUE);
  });

  it("rejects an op whose payload is out of contract (a boundary, hard rule 6)", () => {
    const bad = {
      v: 1,
      ops: [
        {
          id: "a",
          op: { ...log(1), set_number: 0 },
          attempts: 0,
          nextAttemptAt: 0,
          enqueuedAt: 0,
          status: "pending",
          error: null,
        },
      ],
    };
    expect(decodeQueue(JSON.stringify(bad))).toEqual(EMPTY_QUEUE);
  });
});
