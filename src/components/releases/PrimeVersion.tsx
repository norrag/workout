"use client";

import { useEffect, useRef } from "react";
import { acknowledgeReleases } from "@/app/(app)/more/actions";

/**
 * doc 23 §6.2 / §6.5 — the `prime` branch of the gate, made visible.
 *
 * The account has no history with the app (`last_seen_version is null`): write
 * `CURRENT_VERSION`, show nothing. Done from the client rather than during the
 * server render because a write in render is a side effect on a read path —
 * and because §6.3 is explicit that acknowledgment is never a render side
 * effect. It fires once, renders nothing, and costs one write per account.
 *
 * This is also the hook a future guided tour hangs off: `prime` is the named
 * state "this account is new", so a tour is added as a branch here rather than
 * as a rework of the gate.
 */
export function PrimeVersion() {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void acknowledgeReleases();
  }, []);
  return null;
}
