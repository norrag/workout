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
 * THE ECHO RULE (the N73 refinement): an op's optimistic overlay is retired by
 * the SERVER RENDER that contains its write — never by the dispatch resolving.
 * A successful dispatch moves the op to `acked` (saved, echo not yet seen);
 * only `reconcile`, fed the freshly rendered server rows, drops it. The first
 * cut settled on dispatch success, which opened a gap between "overlay gone"
 * and "revalidation committed" where the row visibly un-logged and re-logged
 * (~1s of ping-pong on every set), and let racing revalidations — one fetched
 * before a later write landed but committed after it settled — revert rows
 * that had already advanced.
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
      /** doc 21 §2 — the athlete's reported reps-in-reserve for this set, as
       *  captured on the row (pre-filled with the prescribed target, so a
       *  straight-through tap reports the prescription). Null only when the row
       *  had no prescription to pre-fill from, or when an older queued op
       *  (enqueued before capture shipped) drains after an upgrade. */
      rir_reported: number | null;
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
  /** `failed` = out of retries and parked (the user is told and can retry);
   *  `acked` = the server confirmed the write but no rendered server state has
   *  echoed it yet — the op keeps its overlay, is never re-dispatched, and is
   *  dropped only by `reconcile` (the echo rule) */
  status: "pending" | "failed" | "acked";
  /** the last error's message, surfaced with a parked op */
  error: string | null;
  /** epoch ms the server confirmed the write, while `acked`. Only the safety
   *  valve reads it: an echo that never arrives (the row was deleted from
   *  another device, a value the server normalized so `reconcile` can't match
   *  it) must not pin an overlay forever. */
  ackedAt?: number;
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
 * so the new op queues behind it and wins by landing last. An `acked` op is
 * likewise past superseding — its write already landed; a new op for the same
 * cell queues behind it and overwrites on the server.
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
    (q) => q.id !== inFlightId && q.status !== "acked" && opKey(q.op) === key,
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

/** Drop a settled op (the write landed AND nothing renders off it — used for
 *  plan-weight ops, which have no overlay, and for `discard`/`reconcile`).
 *  Log/amend ops go through `ack` → `reconcile` instead: dropping them here
 *  would strip their overlay before the server render catches up. */
export function settle(state: QueueState, id: string): QueueState {
  return { ...state, ops: state.ops.filter((q) => q.id !== id) };
}

/** The server confirmed this op's write. It stays in the queue as `acked` —
 *  carrying its overlay — until `reconcile` sees the write echoed back in
 *  rendered server state (the echo rule). */
export function ack(state: QueueState, id: string, now: number): QueueState {
  return {
    ...state,
    ops: state.ops.map((q) =>
      q.id === id
        ? { ...q, status: "acked" as const, error: null, ackedAt: now }
        : q,
    ),
  };
}

/** The slice of a rendered server set row `reconcile` matches acked ops
 *  against. */
export interface ServerSetRow {
  id: string;
  set_number: number;
  weight: number;
  reps: number;
  rir_reported: number | null;
}

/** One exercise's freshly RENDERED server rows, as the day view has them. */
export interface RenderedExercise {
  workoutExerciseId: string;
  sets: readonly ServerSetRow[];
}

/**
 * Retire the acked ops that RENDERED server state now confirms — the only way a
 * log or amend op leaves the queue on the happy path (the echo rule).
 *
 * A log op is echoed once its set number has a server row. An amend op is
 * echoed once its set's row carries exactly the amended values — a row still
 * showing the old ones is a STALE render, fetched before the amend landed, so
 * the op (and the local values it protects) must survive it. That asymmetry is
 * the whole point: retiring on the render's ARRIVAL rather than its CONTENT is
 * what discarded an edited RIR and un-logged sets that were already saved.
 *
 * An op for an exercise not in `rendered` is untouched — absence of evidence
 * isn't evidence the write is missing. Pending and failed ops are never
 * touched: they still owe the server a write. Returns the SAME state object
 * when nothing retires, so a caller can run this on every render for free.
 */
export function reconcile(
  state: QueueState,
  rendered: readonly RenderedExercise[],
): QueueState {
  if (!state.ops.some((q) => q.status === "acked")) return state;
  const byExercise = new Map(rendered.map((e) => [e.workoutExerciseId, e.sets]));
  const ops = state.ops.filter((q) => {
    if (q.status !== "acked") return true;
    const op = q.op;
    if (op.kind === "log") {
      const rows = byExercise.get(op.workout_exercise_id);
      if (!rows) return true;
      return !rows.some((r) => r.set_number === op.set_number);
    }
    if (op.kind === "amend") {
      for (const rows of byExercise.values()) {
        const row = rows.find((r) => r.id === op.set_id);
        if (!row) continue;
        return !(
          row.weight === op.weight &&
          row.reps === op.reps &&
          row.rir_reported === op.rir_reported
        );
      }
      return true;
    }
    return true;
  });
  return ops.length === state.ops.length ? state : { ...state, ops };
}

/** How long an acked amend waits for its echo before the safety valve drops it. */
export const ACK_ECHO_TIMEOUT_MS = 30_000;

/**
 * The safety valve behind the echo rule — and it applies to acked AMENDS only,
 * because the two kinds fail in opposite directions.
 *
 * An amend's op suppresses the row's adoption of server state. If its echo
 * never comes — the server normalized a value so `reconcile` can never match
 * it — the row is pinned on local values forever. Dropping the op just lets the
 * row adopt what the server says, which is where it was headed anyway: safe.
 *
 * A log's op ASSERTS the set exists. Dropping it retracts a statement that is
 * true (the write landed), un-ticking a box the lifter watched fill — the exact
 * regression this whole rule exists to kill. It needs no timer either: it is
 * already invisible the moment any render carries the set number
 * (`pendingSetsFor` suppresses it), `reconcile` collects it, `clearWorkout`
 * clears it at completion, and `decodeQueue` drops it on reload. So it waits,
 * as long as it takes.
 */
export function expireAcked(
  state: QueueState,
  now: number,
  timeoutMs = ACK_ECHO_TIMEOUT_MS,
): QueueState {
  const ops = state.ops.filter(
    (q) =>
      q.status !== "acked" ||
      q.op.kind !== "amend" ||
      now - (q.ackedAt ?? now) < timeoutMs,
  );
  return ops.length === state.ops.length ? state : { ...state, ops };
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

/** Re-arm every parked op (an explicit "try again", or coming back online).
 *  Acked ops are already saved — re-arming one would re-send a finished write. */
export function retryAll(state: QueueState, now: number): QueueState {
  return {
    ...state,
    ops: state.ops.map((q) =>
      q.status === "acked"
        ? q
        : {
            ...q,
            status: "pending" as const,
            attempts: 0,
            nextAttemptAt: now,
          },
    ),
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
  /** doc 21 §2 — the reported RIR the row carried at the tap, so the queued row
   *  renders exactly what was logged (null for an op enqueued pre-capture) */
  rirReported: number | null;
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
      rirReported: op.rir_reported ?? null,
      // an acked op reads as pending to the UI: saved server-side, but the row
      // stays overlay-driven (and uneditable) until the echo lands
      status: q.status === "failed" ? "failed" : "pending",
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

/**
 * Is an amend for this set id still outstanding (pending, in flight, or acked
 * but not yet echoed)? While one is, a rendered server row for the set may be
 * a STALE fetch from before the amend landed — the row's local typed state is
 * the truth and a resync must not adopt the echo (the N73 RIR-discard fix).
 */
export function hasPendingAmend(state: QueueState, setId: string): boolean {
  return state.ops.some((q) => q.op.kind === "amend" && q.op.set_id === setId);
}

/** Queue health for the status strip: how much is outstanding and is any of
 *  it parked. Acked ops are counted in neither bucket — their writes landed. */
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
        // doc 21 §2: `undefined` is accepted so an op enqueued by the previous
        // build (before per-set capture) still drains after an upgrade instead
        // of poisoning the whole stored queue — it dispatches as null and the
        // server falls back to the slot's prescribed target RIR.
        (v.rir_reported == null || isInt(v.rir_reported, 0, 10)) &&
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
    (v.status === "pending" || v.status === "failed" || v.status === "acked") &&
    (v.error === null || typeof v.error === "string") &&
    (v.ackedAt === undefined || typeof v.ackedAt === "number")
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
    // an acked op's write is already on the server, and a fresh load renders
    // fresh server state — the echo it was waiting on. Rehydrating it would
    // only leave it waiting on a reconcile for a page that may never mount.
    const ops = (parsed.ops as QueuedOp[]).filter((q) => q.status !== "acked");
    return { v: 1, ops };
  } catch {
    return EMPTY_QUEUE;
  }
}

export function encodeQueue(state: QueueState): string {
  return JSON.stringify(state);
}
