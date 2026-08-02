"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  ACK_ECHO_TIMEOUT_MS,
  DEFAULT_RETRY,
  EMPTY_QUEUE,
  QUEUE_STORAGE_KEY,
  ack,
  clearWorkout,
  decodeQueue,
  encodeQueue,
  enqueue as enqueueOp,
  expireAcked,
  fail,
  hasPendingAmend,
  hasPendingLog,
  nextReady,
  nextWakeAt,
  pendingSetsFor,
  queueSummary,
  reconcile as reconcileOps,
  retryAll,
  settle,
  type PendingSet,
  type QueueState,
  type RenderedExercise,
  type SetLogOp,
} from "@/lib/logging/queue";
import {
  amendSetAction,
  logSetAction,
  updateSetWeightAction,
} from "@/app/(app)/log/actions";

/**
 * The set-logging queue's runtime (N68) — storage, timers, and the one
 * background processor that drains it. The rules it drives are pure and live in
 * `lib/logging/queue.ts`; this file is the I/O shell.
 *
 * Contract with the UI: `enqueue` returns synchronously. It never throws, never
 * blocks a tap, and never leaves the caller waiting on a round-trip. The day
 * view reads `pendingSets` to advance itself and forgets about the network.
 *
 * N73 — the echo rule. A successful dispatch `ack`s its op; only `reconcile`,
 * fed the rendered server rows, retires it. The first cut dropped the op the
 * moment the action resolved and then called `router.refresh()`, so every set
 * had a window — one revalidation round-trip, ~1s — where the overlay was gone
 * and the server render hadn't arrived: the row visibly un-logged, the active
 * set walked backwards, then both snapped forward again when the echo landed.
 * Holding the overlay until the render CONTAINS the write closes that window,
 * and makes a stale revalidation (fetched before a later write, committed
 * after it) harmless instead of a visible reversal.
 */

interface SetLogQueueApi {
  /** queue a write and return immediately */
  enqueue: (op: SetLogOp) => void;
  /** optimistic overlay for one exercise: set number → what was queued */
  pendingSets: (
    workoutExerciseId: string,
    serverSetNumbers: ReadonlySet<number>,
  ) => Map<number, PendingSet>;
  /** is a log for this cell still outstanding (so an unlog must wait)? */
  isPending: (workoutExerciseId: string, setNumber: number) => boolean;
  /** is an amend for this set still outstanding, or saved but not yet echoed?
   *  While it is, a rendered row may predate the amend and must not be adopted
   *  over the values on screen. */
  isAmending: (setId: string) => boolean;
  /** hand the freshly rendered server rows back so acked ops they confirm can
   *  retire (the echo rule) — safe to call on every render */
  reconcile: (rendered: readonly RenderedExercise[]) => void;
  /** everything for this workout landed or was abandoned */
  forget: (workoutId: string) => void;
  /** re-arm parked ops after an explicit "try again" */
  retry: () => void;
  pending: number;
  failed: number;
  online: boolean;
}

const noop = () => {};
const SetLogQueueContext = createContext<SetLogQueueApi>({
  enqueue: noop,
  pendingSets: () => new Map(),
  isPending: () => false,
  isAmending: () => false,
  reconcile: noop,
  forget: noop,
  retry: noop,
  pending: 0,
  failed: 0,
  online: true,
});

export function useSetLogQueue(): SetLogQueueApi {
  return useContext(SetLogQueueContext);
}

/** How long a landed write waits for company before pulling a fresh render. Long
 *  enough to coalesce a rapid set-to-set burst, short enough that a row becomes
 *  editable again promptly. */
const REFRESH_DEBOUNCE_MS = 250;
/** …but never defer the render past this, however busy the queue stays. */
const REFRESH_MAX_DEFER_MS = 2_000;

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Run one op against its server action. Throws on failure — the caller decides
 *  whether that means back off or park. */
async function dispatch(op: SetLogOp): Promise<void> {
  switch (op.kind) {
    case "log":
      return logSetAction({
        workout_id: op.workout_id,
        workout_exercise_id: op.workout_exercise_id,
        set_number: op.set_number,
        weight: op.weight,
        reps: op.reps,
        rir_reported: op.rir_reported ?? null,
        set_type: op.set_type,
        performed_on: op.performed_on,
      });
    case "amend":
      return amendSetAction({
        workout_id: op.workout_id,
        set_id: op.set_id,
        weight: op.weight,
        reps: op.reps,
        rir_reported: op.rir_reported,
      });
    case "plan_weight":
      return updateSetWeightAction({
        workout_id: op.workout_id,
        workout_exercise_id: op.workout_exercise_id,
        set_number: op.set_number,
        weight: op.weight,
      });
  }
}

export function SetLogQueueProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<QueueState>(EMPTY_QUEUE);
  const [online, setOnline] = useState(true);
  // the processor reads the live queue without re-subscribing every render
  const stateRef = useRef(state);
  const inFlight = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false);

  // The ref is the source of truth and moves SYNCHRONOUSLY, so the processor
  // and back-to-back transitions in one tick always compose off current state
  // (the ref used to be assigned inside the setState updater — a render-phase
  // side effect React is free to re-run). A transition that returns the same
  // object — `reconcile`/`expireAcked` with nothing to do — is dropped here, so
  // the day view can hand back its rendered rows on every render for free.
  const apply = useCallback((next: (cur: QueueState) => QueueState) => {
    const out = next(stateRef.current);
    if (out === stateRef.current) return;
    stateRef.current = out;
    setState(out);
  }, []);

  // hydrate from storage — a queue that outlived a quit/relaunch (or was filled
  // with no connection at all) resumes here
  useEffect(() => {
    let stored = EMPTY_QUEUE;
    try {
      stored = decodeQueue(window.localStorage.getItem(QUEUE_STORAGE_KEY));
    } catch {
      /* storage unavailable (private mode) — run in memory */
    }
    hydrated.current = true;
    stateRef.current = stored;
    setState(stored);
    setOnline(window.navigator.onLine !== false);
  }, []);

  // persist every transition; the write is small and bounded by the queue depth
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(QUEUE_STORAGE_KEY, encodeQueue(state));
    } catch {
      /* over quota / unavailable — the in-memory queue still drains */
    }
  }, [state]);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // ---- revalidation ------------------------------------------------------
  // One coalesced `router.refresh()` behind a burst of writes. Each landed op
  // used to fire its own, so logging four sets in a row queued four full RSC
  // fetches of the day view that could commit out of order. Ordering is no
  // longer a correctness problem (the echo rule absorbs a stale render), but
  // the refreshes are still redundant: a render taken while later writes are
  // in flight cannot carry them, so it is worth waiting out the burst.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) return;
    const fire = () => {
      refreshTimer.current = null;
      // still writing, and nothing has been waiting long — let the burst finish
      const oldestAck = stateRef.current.ops.reduce<number | null>(
        (acc, q) =>
          q.status === "acked" && q.ackedAt != null
            ? Math.min(acc ?? q.ackedAt, q.ackedAt)
            : acc,
        null,
      );
      const waited = oldestAck == null ? 0 : Date.now() - oldestAck;
      if (inFlight.current && waited < REFRESH_MAX_DEFER_MS) {
        refreshTimer.current = setTimeout(fire, REFRESH_DEBOUNCE_MS);
        return;
      }
      router.refresh();
    };
    refreshTimer.current = setTimeout(fire, REFRESH_DEBOUNCE_MS);
  }, [router]);

  // ---- the processor -----------------------------------------------------
  // One op at a time, oldest first: sets must land in the order they were
  // performed, and `pump` is re-entrant-safe via `inFlight`.
  const pump = useCallback(() => {
    if (inFlight.current) return;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const now = Date.now();
    const op = nextReady(stateRef.current, now);
    if (!op) {
      const wake = nextWakeAt(stateRef.current);
      if (wake != null) {
        timer.current = setTimeout(pump, Math.max(50, wake - now));
      }
      return;
    }
    inFlight.current = op.id;
    dispatch(op.op)
      .then(() => {
        // The echo rule: the write landed, but the row keeps rendering off this
        // op until a SERVER RENDER contains it. Dropping the op here is what
        // made the box un-tick for a beat — the overlay went before the render
        // that replaces it arrived. A plan-weight op has no overlay to hold, so
        // it settles outright.
        apply((cur) =>
          op.op.kind === "plan_weight"
            ? settle(cur, op.id)
            : ack(cur, op.id, Date.now()),
        );
        scheduleRefresh();
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "could not reach the server";
        apply((cur) => fail(cur, op.id, Date.now(), message, DEFAULT_RETRY));
      })
      .finally(() => {
        inFlight.current = null;
        pump();
      });
  }, [apply, scheduleRefresh]);

  // drain on every queue change, on reconnect, and when the app comes back to
  // the foreground (a backgrounded tab's timers are throttled or frozen)
  useEffect(() => {
    pump();
  }, [state, online, pump]);

  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === "visible") pump();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [pump]);

  // The safety valve behind the echo rule (acked AMENDS only — see
  // `expireAcked`): if a row's amend never gets echoed back, drop it so the row
  // adopts server state instead of staying pinned on local values. The timeout
  // is long enough that a healthy round-trip never reaches it.
  const oldestAckedAt = useMemo(
    () =>
      state.ops.reduce<number | null>(
        (acc, q) =>
          q.status === "acked" && q.op.kind === "amend" && q.ackedAt != null
            ? Math.min(acc ?? q.ackedAt, q.ackedAt)
            : acc,
        null,
      ),
    [state],
  );
  useEffect(() => {
    if (oldestAckedAt == null) return;
    const due = oldestAckedAt + ACK_ECHO_TIMEOUT_MS - Date.now();
    const t = setTimeout(
      () => {
        apply((cur) => expireAcked(cur, Date.now()));
        router.refresh();
      },
      Math.max(50, due),
    );
    return () => clearTimeout(t);
  }, [oldestAckedAt, apply, router]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  // ---- api ---------------------------------------------------------------
  const enqueue = useCallback(
    (op: SetLogOp) => {
      apply((cur) =>
        enqueueOp(cur, { id: newId(), op, now: Date.now() }, inFlight.current),
      );
    },
    [apply],
  );

  const pendingSets = useCallback(
    (workoutExerciseId: string, serverSetNumbers: ReadonlySet<number>) =>
      pendingSetsFor(state, workoutExerciseId, serverSetNumbers),
    [state],
  );

  const isPending = useCallback(
    (workoutExerciseId: string, setNumber: number) =>
      hasPendingLog(state, workoutExerciseId, setNumber),
    [state],
  );

  const isAmending = useCallback(
    (setId: string) => hasPendingAmend(state, setId),
    [state],
  );

  // Reads through the ref, not `state`, so its identity never changes: the day
  // view calls it from an effect on every render and a changing identity would
  // re-run that effect for no reason.
  const reconcile = useCallback(
    (rendered: readonly RenderedExercise[]) =>
      apply((cur) => reconcileOps(cur, rendered)),
    [apply],
  );

  const forget = useCallback(
    (workoutId: string) => apply((cur) => clearWorkout(cur, workoutId)),
    [apply],
  );

  const retry = useCallback(
    () => apply((cur) => retryAll(cur, Date.now())),
    [apply],
  );

  const { pending, failed } = useMemo(() => queueSummary(state), [state]);

  const api = useMemo<SetLogQueueApi>(
    () => ({
      enqueue,
      pendingSets,
      isPending,
      isAmending,
      reconcile,
      forget,
      retry,
      pending,
      failed,
      online,
    }),
    [
      enqueue,
      pendingSets,
      isPending,
      isAmending,
      reconcile,
      forget,
      retry,
      pending,
      failed,
      online,
    ],
  );

  return (
    <SetLogQueueContext.Provider value={api}>
      {children}
    </SetLogQueueContext.Provider>
  );
}
