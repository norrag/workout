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
  DEFAULT_RETRY,
  EMPTY_QUEUE,
  QUEUE_STORAGE_KEY,
  clearWorkout,
  decodeQueue,
  encodeQueue,
  enqueue as enqueueOp,
  fail,
  hasPendingLog,
  nextReady,
  nextWakeAt,
  pendingSetsFor,
  queueSummary,
  retryAll,
  settle,
  type PendingSet,
  type QueueState,
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
  forget: noop,
  retry: noop,
  pending: 0,
  failed: 0,
  online: true,
});

export function useSetLogQueue(): SetLogQueueApi {
  return useContext(SetLogQueueContext);
}

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
        rir_reported: null,
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

  const apply = useCallback((next: (cur: QueueState) => QueueState) => {
    setState((cur) => {
      const out = next(cur);
      stateRef.current = out;
      return out;
    });
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
        apply((cur) => settle(cur, op.id));
        // the server is now ahead of the page — pull the echo in, which is what
        // retires the optimistic overlay. A failure here is irrelevant to the
        // write, which already landed.
        router.refresh();
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
  }, [apply, router]);

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

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
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
      forget,
      retry,
      pending,
      failed,
      online,
    }),
    [enqueue, pendingSets, isPending, forget, retry, pending, failed, online],
  );

  return (
    <SetLogQueueContext.Provider value={api}>
      {children}
    </SetLogQueueContext.Provider>
  );
}
