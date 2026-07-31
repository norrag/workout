import { describe, it, expect } from "vitest";
import {
  DEFAULT_RETRY,
  EMPTY_QUEUE,
  backoffMs,
  clearWorkout,
  decodeQueue,
  encodeQueue,
  enqueue,
  fail,
  hasPendingLog,
  nextReady,
  nextWakeAt,
  opKey,
  pendingSetsFor,
  queueSummary,
  retryAll,
  settle,
  type QueueState,
  type SetLogOp,
} from "../queue";

const WORKOUT = "11111111-1111-4111-8111-111111111111";
const WE_A = "22222222-2222-4222-8222-222222222222";
const WE_B = "33333333-3333-4333-8333-333333333333";
const SET_ID = "44444444-4444-4444-8444-444444444444";

function log(setNumber: number, weight = 100, we = WE_A): SetLogOp {
  return {
    kind: "log",
    workout_id: WORKOUT,
    workout_exercise_id: we,
    set_number: setNumber,
    weight,
    reps: 8,
    set_type: "straight",
    performed_on: "2026-07-31",
  };
}

function add(state: QueueState, id: string, op: SetLogOp, now: number) {
  return enqueue(state, { id, op, now });
}

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
    expect(a.get(1)).toMatchObject({ weight: 135, reps: 8, status: "pending" });
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
