/**
 * Set-logging write queue — the pure model (N68).
 *
 * The day view used to await each set write inline: the box acknowledged when
 * the server action resolved, but the row only became "logged" (and the NEXT
 * row only became active) when the RSC revalidation committed. A stalled
 * revalidation — a flaky connection, the app backgrounded mid-flight — left the
 * session wedged in between: the box filled, the set never advanced, and the
 * only way out was to quit and relaunch. The write had landed; the UI just
 * never learned it.
 *
 * So the write is taken off the interaction path entirely. A tap enqueues an
 * op and returns; the row advances immediately from the queue's optimistic
 * overlay; a single background processor drains the queue, retrying with
 * backoff, and the server state simply catches up underneath. The queue is
 * serialized to storage, so quitting mid-session — or logging with no
 * connection at all — resumes and drains later instead of losing the set.
 *
 * This module is PURE: no I/O, no clock, no randomness (every function takes
 * `now`). The runtime that owns storage, timers, and the server actions lives
 * in `components/logging/SetLogQueueProvider.tsx`; that split is what makes the
 * ordering, coalescing, backoff, and overlay rules unit-testable.
 *
 * Every op is IDEMPOTENT on the server, which is what makes blind retry safe:
 * `logSet` upserts on (workout_exercise_id, set_number) (R3), `amendSet`
 * addresses one immutable set id, and the planned-weight write is a plain
 * overwrite.
 */

// ---------------------------------------------------------------------------
// ops
// ---------------------------------------------------------------------------

/**
 * NB (WS-J bundle split): this module rides in the (app) layout's client chunk
 * — the day view's hot path — which is deliberately kept free of zod and the
 * engine barrel. So the storage boundary below is validated by hand-written
 * guards rather than a zod schema. They are the same contract the server
 * actions re-validate with zod on arrival, so nothing here is the only check on
 * a value: a queued op is checked here to keep the processor sane, and again at
 * the route boundary before it touches the database.
 */

export type SetLogOp =
  | {
      kind: "log";
      workout_id: string;
      workout_exercise_id: string;
      set_number: number;
      weight: number;
      reps: number;
      set_type: "straight" | "drop";
      /** the set's calendar day as the DEVICE saw it when the tap happened
       *  (R6) — captured at enqueue, so a queued set that drains tomorrow still
       *  lands on the day it was actually performed */
      performed_on: string;
    }
  | {
      kind: "amend";
      workout_id: string;
      set_id: string;
      weight: number;
      reps: number;
      rir_reported: number | null;
    }
  | {
      kind: "plan_weight";
      workout_id: string;
      workout_exercise_id: string;
      set_number: number;
      weight: number;
    };

export type LogOp = Extract<SetLogOp, { kind: "log" }>;

export interface QueuedOp {
  id: string;
  op: SetLogOp;
  /** failed round-trips so far (a settled op leaves the queue) */
  attempts: number;
  /** epoch ms the op may next be attempted — backoff lives here */
  nextAttemptAt: number;
  /** epoch ms the tap happened, for FIFO ordering across a reload */
  enqueuedAt: number;
  /** `failed` = out of retries and parked; the user is told and can retry */
  status: "pending" | "failed";
  /** the last error's message, surfaced with a parked op */
  error: string | null;
}

export interface QueueState {
  v: 1;
  ops: QueuedOp[];
}

export const EMPTY_QUEUE: QueueState = { v: 1, ops: [] };

// ---------------------------------------------------------------------------
// retry policy
// ---------------------------------------------------------------------------

export interface RetryPolicy {
  /** first backoff, doubled per attempt */
  baseMs: number;
  /** backoff ceiling */
  maxMs: number;
  /** attempts before an op parks as `failed` (never silently dropped) */
  maxAttempts: number;
}

export const DEFAULT_RETRY: RetryPolicy = {
  baseMs: 2_000,
  maxMs: 60_000,
  maxAttempts: 8,
};

/** Exponential backoff, capped. Deterministic — no jitter (a single device
 *  draining its own queue has nobody to stampede). */
export function backoffMs(attempts: number, policy = DEFAULT_RETRY): number {
  const raw = policy.baseMs * 2 ** Math.max(0, attempts - 1);
  return Math.min(policy.maxMs, raw);
}

// ---------------------------------------------------------------------------
// coalescing
// ---------------------------------------------------------------------------

/**
 * The identity a queued op competes on. Two ops with the same key target the
 * same cell, so a later one supersedes an earlier one that hasn't started —
 * retyping a weight before the first write drains must not produce two writes
 * racing to decide the stored value.
 */
export function opKey(op: SetLogOp): string {
  switch (op.kind) {
    case "log":
      return `log:${op.workout_exercise_id}:${op.set_number}`;
    case "amend":
      return `amend:${op.set_id}`;
    case "plan_weight":
      return `plan:${op.workout_exercise_id}:${op.set_number}`;
  }
}

// ---------------------------------------------------------------------------
// queue transitions (all pure)
// ---------------------------------------------------------------------------

/**
 * Add an op. Any not-yet-started op with the same key is replaced in place —
 * keeping its position, so FIFO order across DIFFERENT cells is preserved (set
 * 1 still drains before set 2 even if set 1's weight was retyped). `inFlightId`
 * is the op the runtime is currently awaiting; it can no longer be superseded,
 * so the new op queues behind it and wins by landing last.
 */
export function enqueue(
  state: QueueState,
  entry: { id: string; op: SetLogOp; now: number },
  inFlightId: string | null = null,
): QueueState {
  const key = opKey(entry.op);
  const fresh: QueuedOp = {
    id: entry.id,
    op: entry.op,
    attempts: 0,
    nextAttemptAt: entry.now,
    enqueuedAt: entry.now,
    status: "pending",
    error: null,
  };
  const supersedable = state.ops.findIndex(
    (q) => q.id !== inFlightId && opKey(q.op) === key,
  );
  if (supersedable >= 0) {
    const ops = [...state.ops];
    ops[supersedable] = { ...fresh, enqueuedAt: ops[supersedable].enqueuedAt };
    return { ...state, ops };
  }
  return { ...state, ops: [...state.ops, fresh] };
}

/**
 * The next op to attempt: strictly the OLDEST pending one, and only once its
 * backoff has elapsed. Head-of-line blocking is deliberate — sets must land in
 * the order they were performed, and a set that keeps failing must not let
 * later sets overtake it into the log.
 */
export function nextReady(state: QueueState, now: number): QueuedOp | null {
  const pending = state.ops.filter((q) => q.status === "pending");
  if (pending.length === 0) return null;
  const head = pending.reduce((a, b) => (b.enqueuedAt < a.enqueuedAt ? b : a));
  return head.nextAttemptAt <= now ? head : null;
}

/** When the head op's backoff expires — what the runtime sleeps until. */
export function nextWakeAt(state: QueueState): number | null {
  const pending = state.ops.filter((q) => q.status === "pending");
  if (pending.length === 0) return null;
  return pending.reduce((a, b) => (b.enqueuedAt < a.enqueuedAt ? b : a))
    .nextAttemptAt;
}

/** Drop a settled op (the write landed). */
export function settle(state: QueueState, id: string): QueueState {
  return { ...state, ops: state.ops.filter((q) => q.id !== id) };
}

/**
 * Record a failed attempt: back off and stay pending, or park as `failed` once
 * the attempts are spent. A parked op is never discarded — losing a set the
 * lifter watched get checked off is the one outcome worse than a slow write.
 */
export function fail(
  state: QueueState,
  id: string,
  now: number,
  message: string,
  policy = DEFAULT_RETRY,
): QueueState {
  return {
    ...state,
    ops: state.ops.map((q) => {
      if (q.id !== id) return q;
      const attempts = q.attempts + 1;
      return attempts >= policy.maxAttempts
        ? { ...q, attempts, status: "failed" as const, error: message }
        : {
            ...q,
            attempts,
            status: "pending" as const,
            error: message,
            nextAttemptAt: now + backoffMs(attempts, policy),
          };
    }),
  };
}

/** Re-arm every parked op (an explicit "try again", or coming back online). */
export function retryAll(state: QueueState, now: number): QueueState {
  return {
    ...state,
    ops: state.ops.map((q) => ({
      ...q,
      status: "pending" as const,
      attempts: 0,
      nextAttemptAt: now,
    })),
  };
}

/** Abandon a parked op the user has chosen to give up on. */
export function discard(state: QueueState, id: string): QueueState {
  return settle(state, id);
}

/** Drop everything for a workout (it completed, or its rows were regenerated). */
export function clearWorkout(state: QueueState, workoutId: string): QueueState {
  return {
    ...state,
    ops: state.ops.filter((q) => q.op.workout_id !== workoutId),
  };
}

// ---------------------------------------------------------------------------
// the optimistic overlay
// ---------------------------------------------------------------------------

export interface PendingSet {
  setNumber: number;
  weight: number;
  reps: number;
  status: "pending" | "failed";
}

/**
 * The sets this exercise has queued but the server hasn't echoed back yet —
 * what the day view folds over its server rows so the checkbox, the progress
 * bar, and (the whole point) the NEXT active set move the instant the lifter
 * taps, whatever the network is doing.
 *
 * Callers pass the set numbers the server already reports so a landed write
 * stops being an overlay the moment the revalidation catches up.
 */
export function pendingSetsFor(
  state: QueueState,
  workoutExerciseId: string,
  serverSetNumbers: ReadonlySet<number> = new Set(),
): Map<number, PendingSet> {
  const out = new Map<number, PendingSet>();
  for (const q of state.ops) {
    const op = q.op;
    if (op.kind !== "log") continue;
    if (op.workout_exercise_id !== workoutExerciseId) continue;
    if (serverSetNumbers.has(op.set_number)) continue;
    out.set(op.set_number, {
      setNumber: op.set_number,
      weight: op.weight,
      reps: op.reps,
      status: q.status,
    });
  }
  return out;
}

/** Is a write for this exact cell still outstanding? (Blocks an unlog that
 *  would race its own log — the set id doesn't exist until the log lands.) */
export function hasPendingLog(
  state: QueueState,
  workoutExerciseId: string,
  setNumber: number,
): boolean {
  return state.ops.some(
    (q) =>
      q.op.kind === "log" &&
      q.op.workout_exercise_id === workoutExerciseId &&
      q.op.set_number === setNumber,
  );
}

/** Queue health for the status strip: how much is outstanding and is any of
 *  it parked. */
export function queueSummary(state: QueueState): {
  pending: number;
  failed: number;
} {
  return {
    pending: state.ops.filter((q) => q.status === "pending").length,
    failed: state.ops.filter((q) => q.status === "failed").length,
  };
}

// ---------------------------------------------------------------------------
// persistence codec
// ---------------------------------------------------------------------------

export const QUEUE_STORAGE_KEY = "workout.setLogQueue.v1";

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isNum = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const isInt = (v: unknown, min: number, max: number): v is number =>
  isNum(v, min, max) && Number.isInteger(v);

function isOp(v: unknown): v is SetLogOp {
  if (!isRec(v) || !isId(v.workout_id)) return false;
  switch (v.kind) {
    case "log":
      return (
        isId(v.workout_exercise_id) &&
        isInt(v.set_number, 1, 30) &&
        isNum(v.weight, 0, 2000) &&
        isInt(v.reps, 0, 100) &&
        (v.set_type === "straight" || v.set_type === "drop") &&
        typeof v.performed_on === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(v.performed_on)
      );
    case "amend":
      return (
        isId(v.set_id) &&
        isNum(v.weight, 0, 2000) &&
        isInt(v.reps, 0, 100) &&
        (v.rir_reported === null || isInt(v.rir_reported, 0, 10))
      );
    case "plan_weight":
      return (
        isId(v.workout_exercise_id) &&
        isInt(v.set_number, 1, 30) &&
        isNum(v.weight, 0, 2000)
      );
    default:
      return false;
  }
}

function isQueuedOp(v: unknown): v is QueuedOp {
  return (
    isRec(v) &&
    isId(v.id) &&
    isOp(v.op) &&
    isInt(v.attempts, 0, Number.MAX_SAFE_INTEGER) &&
    typeof v.nextAttemptAt === "number" &&
    typeof v.enqueuedAt === "number" &&
    (v.status === "pending" || v.status === "failed") &&
    (v.error === null || typeof v.error === "string")
  );
}

/** Parse a stored queue. Storage is a boundary: anything that doesn't validate
 *  — an older shape, a truncated write, another tab's junk — yields an empty
 *  queue rather than poisoning the processor. All-or-nothing on purpose: a
 *  partially-readable queue would drain some sets and silently drop others. */
export function decodeQueue(raw: string | null): QueueState {
  if (!raw) return EMPTY_QUEUE;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRec(parsed) || parsed.v !== 1 || !Array.isArray(parsed.ops))
      return EMPTY_QUEUE;
    if (!parsed.ops.every(isQueuedOp)) return EMPTY_QUEUE;
    return { v: 1, ops: parsed.ops as QueuedOp[] };
  } catch {
    return EMPTY_QUEUE;
  }
}

export function encodeQueue(state: QueueState): string {
  return JSON.stringify(state);
}
