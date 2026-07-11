/**
 * doc 17 §4.1 (N40) — macrocycle close transitions, pure decisions. The
 * Supabase I/O (`maybeCompleteMacroAfterMeso`, `endMacrocycle`) is covered by
 * the hosted-DB integration smoke + the e2e closeout flow; everything status-
 * vocabulary-shaped is tested here.
 */
import { describe, expect, it } from "vitest";
import {
  isTerminalMacroStatus,
  isTerminalMesoStatus,
  macroClosesNaturally,
  planEndMacrocycle,
} from "../macro-close";
import { goalsEditRefusal } from "../macro";
import type { MesocycleRow } from "@/lib/types/database";

type MesoStatus = MesocycleRow["status"];

const of = (...statuses: MesoStatus[]) => statuses.map((status) => ({ status }));

describe("macroClosesNaturally", () => {
  it("closes when every real block is terminal", () => {
    expect(macroClosesNaturally(of("completed", "completed"))).toBe(true);
    expect(macroClosesNaturally(of("completed", "abandoned"))).toBe(true);
  });

  it("mixed placeholder fixture: unbuilt placeholders don't count as open work", () => {
    // the §4 acceptance case — real blocks done, two placeholders never built
    expect(
      macroClosesNaturally(of("completed", "completed", "unplanned", "unplanned")),
    ).toBe(true);
  });

  it("any open block holds the macro open", () => {
    expect(macroClosesNaturally(of("completed", "active"))).toBe(false);
    expect(macroClosesNaturally(of("completed", "planned"))).toBe(false);
    expect(macroClosesNaturally(of("completed", "draft"))).toBe(false);
    expect(
      macroClosesNaturally(of("completed", "unplanned", "planned")),
    ).toBe(false);
  });

  it("never closes a macro of nothing but placeholders (or nothing at all)", () => {
    expect(macroClosesNaturally(of("unplanned", "unplanned"))).toBe(false);
    expect(macroClosesNaturally([])).toBe(false);
  });
});

describe("planEndMacrocycle", () => {
  it("logged work ends via the meso path; never started is abandoned", () => {
    const plan = planEndMacrocycle([
      { id: "m1", status: "completed", hasLogged: true }, // terminal: untouched
      { id: "m2", status: "active", hasLogged: true }, // logged → endMesocycle
      { id: "m3", status: "active", hasLogged: false }, // activated, never logged
      { id: "m4", status: "planned", hasLogged: false }, // never started
      { id: "m5", status: "unplanned", hasLogged: false }, // placeholder
      { id: "m6", status: "abandoned", hasLogged: false }, // terminal: untouched
    ]);
    expect(plan.endIds).toEqual(["m2"]);
    expect(plan.abandonIds).toEqual(["m3", "m4", "m5"]);
  });

  it("preserves position order within each action", () => {
    const plan = planEndMacrocycle([
      { id: "a", status: "active", hasLogged: true },
      { id: "b", status: "planned", hasLogged: false },
      { id: "c", status: "active", hasLogged: true },
      { id: "d", status: "unplanned", hasLogged: false },
    ]);
    expect(plan.endIds).toEqual(["a", "c"]);
    expect(plan.abandonIds).toEqual(["b", "d"]);
  });

  it("an all-terminal macro plans nothing", () => {
    const plan = planEndMacrocycle([
      { id: "m1", status: "completed", hasLogged: true },
      { id: "m2", status: "abandoned", hasLogged: false },
    ]);
    expect(plan.endIds).toEqual([]);
    expect(plan.abandonIds).toEqual([]);
  });
});

describe("status vocabulary", () => {
  it("terminal meso statuses", () => {
    expect(isTerminalMesoStatus("completed")).toBe(true);
    expect(isTerminalMesoStatus("abandoned")).toBe(true);
    for (const s of ["draft", "unplanned", "planned", "active"] as const)
      expect(isTerminalMesoStatus(s)).toBe(false);
  });

  it("only an active macro accepts structural writes", () => {
    expect(isTerminalMacroStatus("active")).toBe(false);
    expect(isTerminalMacroStatus("completed")).toBe(true);
    expect(isTerminalMacroStatus("archived")).toBe(true);
  });
});

describe("goalsEditRefusal (§4.1 frozen contract)", () => {
  it("refuses a goals edit on a terminal macro", () => {
    expect(goalsEditRefusal("completed", true)).toMatch(/frozen/);
    expect(goalsEditRefusal("archived", true)).toMatch(/frozen/);
  });

  it("allows rename/notes edits on a terminal macro and anything on an active one", () => {
    expect(goalsEditRefusal("completed", false)).toBeNull();
    expect(goalsEditRefusal("active", true)).toBeNull();
    expect(goalsEditRefusal("active", false)).toBeNull();
  });
});
