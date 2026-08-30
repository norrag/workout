/**
 * Plate loading — the pure math behind the day view's **Load plates** tray
 * (N89).
 *
 * Recreates the owner's `Load Weights` Apple Shortcut: take a desired total,
 * subtract the resistance that is already there before any plate goes on (the
 * bar, the sled, the carriage), split what is left across one or two loading
 * points, and spend it greedily from the largest plate down without ever
 * exceeding the ask.
 *
 * Pure by construction — no I/O, no clock, no randomness — so every rule below
 * is a unit test rather than a claim. It is deliberately NOT in
 * `src/lib/engine/`: this computes nothing the engine prescribes and reads no
 * `engine_params`. It answers a question about the gym, not about the program.
 *
 * ARITHMETIC, AND WHY IT IS INTEGER. Plate sizes are multiples of 2.5 lb and
 * the app snaps every displayed weight to 0.5 lb (`units.formatWeight`), so all
 * of this lands exactly on a quarter-pound grid. Doing it in floating point
 * does not: `187.5 - 45` then repeatedly subtracting 2.5 accumulates the usual
 * binary-fraction dust, and a residue of 1e-13 is enough for `floor` to drop a
 * plate the lifter can actually load. So the whole computation runs in integer
 * quarter-pounds and converts back once, at the end.
 */

/** The standard rack, largest first. The order is load-bearing: the greedy
 *  descent below is only "do not exceed" if it spends the big plates first. */
export const DEFAULT_PLATE_SIZES_LB: readonly number[] = [45, 25, 10, 5, 2.5];

/** Loading points on the implement: a barbell has two, a single-horn machine
 *  one. Named rather than `number` so a caller cannot pass 3. */
export type PlateSides = 1 | 2;

/** One plate size and how many of it go on **each** side. */
export interface PlateStack {
  /** the plate's own weight in lb */
  weight: number;
  /** how many, per side */
  count: number;
}

export interface PlateLoad {
  /** what the lifter asked for, unchanged */
  targetWeight: number;
  /** the resistance already present with no plates on */
  startWeight: number;
  sides: PlateSides;
  /** the plates to hang on each side, largest first; empty when none fit */
  perSide: readonly PlateStack[];
  /** plate weight on ONE side */
  perSideWeight: number;
  /** what those plates actually come to, start weight included */
  closestMatch: number;
  /** how far under the ask that lands (never negative — the descent never
   *  exceeds) */
  shortBy: number;
  /** the ask is below the unloaded implement, so there is nothing to load and
   *  the ask itself is unreachable */
  belowStart: boolean;
}

/** lb → integer quarter-pounds. Rounds, because the caller's number came from
 *  a text field and may carry display dust of its own. */
function toQuarters(lb: number): number {
  return Math.round(lb * 4);
}

function toLb(quarters: number): number {
  return quarters / 4;
}

/**
 * Which plates to load, and what that actually weighs.
 *
 * Greedy, largest first, never exceeding the ask — the shortcut's behavior,
 * kept deliberately: a lifter would rather be 2.5 lb light than 2.5 lb heavy on
 * a set whose whole point is a prescribed load. When the ask is not reachable,
 * `shortBy` says by how much rather than the result quietly rounding up.
 *
 * `plates` is a parameter rather than a constant so a different rack is a
 * caller's decision (the shortcut spec's closing note); the app passes
 * `DEFAULT_PLATE_SIZES_LB` today.
 */
export function planPlateLoad({
  targetWeight,
  startWeight,
  sides,
  plates = DEFAULT_PLATE_SIZES_LB,
}: {
  targetWeight: number;
  startWeight: number;
  sides: PlateSides;
  plates?: readonly number[];
}): PlateLoad {
  const targetQ = toQuarters(targetWeight);
  const startQ = toQuarters(startWeight);
  const remainingQ = targetQ - startQ;

  if (remainingQ <= 0) {
    return {
      targetWeight,
      startWeight,
      sides,
      perSide: [],
      perSideWeight: 0,
      closestMatch: toLb(startQ),
      // nothing is short here: an ask equal to the bare implement is met
      // exactly, and one BELOW it is over-shot rather than under-shot — which
      // is what `belowStart` is for. `shortBy` stays a one-directional number.
      shortBy: 0,
      belowStart: remainingQ < 0,
    };
  }

  // what one side has to carry. `floor` because a side takes whole plates and
  // the two sides must match — an odd quarter-pound is simply unreachable.
  let sideBudgetQ = Math.floor(remainingQ / sides);

  const perSide: PlateStack[] = [];
  let loadedPerSideQ = 0;

  // largest first, so each plate size takes as much of the remaining budget as
  // it can before the next one is considered
  for (const plate of [...plates].sort((a, b) => b - a)) {
    const plateQ = toQuarters(plate);
    if (plateQ <= 0) continue;
    const count = Math.floor(sideBudgetQ / plateQ);
    if (count > 0) {
      perSide.push({ weight: plate, count });
      const spentQ = count * plateQ;
      sideBudgetQ -= spentQ;
      loadedPerSideQ += spentQ;
    }
  }

  const closestQ = startQ + loadedPerSideQ * sides;
  return {
    targetWeight,
    startWeight,
    sides,
    perSide,
    perSideWeight: toLb(loadedPerSideQ),
    closestMatch: toLb(closestQ),
    shortBy: toLb(targetQ - closestQ),
    belowStart: false,
  };
}

// ---------------------------------------------------------------------------
// Equipment defaults
// ---------------------------------------------------------------------------

/**
 * The setup a lift opens with the first time, before the lifter has told the
 * tray anything. Two rules, and neither is a guess about *their* gym so much as
 * the least-surprising place to start:
 *
 *  - a **barbell** is the one implement with a near-universal unloaded weight
 *    (45 lb), and a **smith** carriage is counterweighted so widely that a
 *    number is more use than a zero — 25 lb is the common Life Fitness /
 *    Hammer figure. Everything else starts at 0, because a plate-loaded machine
 *    or a loading pin has no convention at all;
 *  - **two** loading points for anything with a bar or a handle in each hand,
 *    **one** for a machine, which is the conservative read: a one-sided plan on
 *    a two-horn machine is visibly wrong on the first rep, where a two-sided
 *    plan on a single horn silently halves the load.
 *
 * Whatever the lifter picks is remembered per exercise from then on, so this
 * table is only ever the opening bid.
 */
export function defaultPlateSetup(equipmentType: string | null): {
  startWeight: number;
  sides: PlateSides;
} {
  switch ((equipmentType ?? "").toLowerCase()) {
    case "barbell":
      return { startWeight: 45, sides: 2 };
    case "smith":
    case "smith machine":
      return { startWeight: 25, sides: 2 };
    case "dumbbell":
    case "kettlebell":
      return { startWeight: 0, sides: 2 };
    default:
      return { startWeight: 0, sides: 1 };
  }
}

// ---------------------------------------------------------------------------
// The tray's paging
// ---------------------------------------------------------------------------

/** The tray's pages, in order. Index is the page; the array is the contract
 *  the swipe/step helpers below are written against. */
export const PLATE_STEPS = ["weight", "start", "sides", "load"] as const;
export type PlateStep = (typeof PLATE_STEPS)[number];

/** Clamp a step move to the pages that exist. */
export function clampStep(index: number): number {
  return Math.min(Math.max(index, 0), PLATE_STEPS.length - 1);
}

/**
 * Where a horizontal drag lands. A swipe commits on **either** distance (a
 * third of the tray's width) **or** speed (a flick), because the two are how
 * people actually swipe: a slow deliberate drag travels, a flick does not.
 *
 * `dx` is positive when the finger moves right, which means going *back* — the
 * pages advance right-to-left, so the content follows the finger and the
 * direction reads the same way a stack of cards would.
 */
export function swipeTarget({
  index,
  dx,
  width,
  velocity = 0,
}: {
  index: number;
  dx: number;
  width: number;
  /** px per ms, signed like `dx` */
  velocity?: number;
}): number {
  const travelled = width > 0 && Math.abs(dx) > width / 3;
  const flicked = Math.abs(velocity) > 0.5 && Math.abs(dx) > 12;
  if (!travelled && !flicked) return index;
  return clampStep(index + (dx < 0 ? 1 : -1));
}
