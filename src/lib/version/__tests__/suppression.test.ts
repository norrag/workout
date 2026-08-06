import { describe, expect, it } from "vitest";
import {
  suppressWhatsNew,
  type ActiveWorkoutStatus,
} from "../suppression";

const STATUSES: (ActiveWorkoutStatus | null)[] = [
  "planned",
  "in_progress",
  "completed",
  null,
];

describe("suppressWhatsNew (doc 23 §6.4)", () => {
  it("suppresses on the Workout tab only once a set has been logged", () => {
    // the tab renders the day view inline, so the status — not the route — is
    // what separates looking at a workout from being in one (T5)
    expect(
      suppressWhatsNew({
        pathname: "/workout",
        workoutStatus: "in_progress",
        queuePending: false,
      }),
    ).toBe(true);
    for (const workoutStatus of ["planned", "completed", null] as const)
      expect(
        suppressWhatsNew({
          pathname: "/workout",
          workoutStatus,
          queuePending: false,
        }),
      ).toBe(false);
  });

  it("shows on every other tab regardless of workout status", () => {
    // the release valve for a stale in_progress session: no clock in the gate
    for (const pathname of ["/cycles", "/templates", "/more", "/exercises"])
      for (const workoutStatus of STATUSES)
        expect(
          suppressWhatsNew({ pathname, workoutStatus, queuePending: false }),
        ).toBe(false);
  });

  it("suppresses on /log/** unconditionally", () => {
    for (const workoutStatus of STATUSES)
      expect(
        suppressWhatsNew({
          pathname: "/log/abc-123",
          workoutStatus,
          queuePending: false,
        }),
      ).toBe(true);
  });

  it("suppresses while the set-logging queue is draining (N68)", () => {
    for (const pathname of ["/workout", "/cycles", "/templates", "/more"])
      expect(
        suppressWhatsNew({
          pathname,
          workoutStatus: "planned",
          queuePending: true,
        }),
      ).toBe(true);
  });

  it("suppresses on onboarding, auth and the offline page", () => {
    for (const pathname of [
      "/onboarding",
      "/sign-in",
      "/sign-up",
      "/~offline",
    ])
      expect(
        suppressWhatsNew({
          pathname,
          workoutStatus: null,
          queuePending: false,
        }),
      ).toBe(true);
  });

  it("does not confuse a route that merely starts with the same letters", () => {
    expect(
      suppressWhatsNew({
        pathname: "/logbook",
        workoutStatus: null,
        queuePending: false,
      }),
    ).toBe(false);
  });
});
