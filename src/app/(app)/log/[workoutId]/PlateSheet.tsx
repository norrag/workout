"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Chip } from "@/components/ui/Chip";
import { useSetLogQueue } from "@/components/logging/SetLogQueueProvider";
import type { LoggedExercise } from "@/lib/queries/logging";
import {
  DEFAULT_PLATE_SIZES_LB,
  PLATE_STEPS,
  clampStep,
  defaultPlateSetup,
  planPlateLoad,
  swipeTarget,
  type PlateSides,
} from "@/lib/plates";
import { formatWeight } from "@/lib/units";

/**
 * **Load plates** (N89) — the day view's rack tool, reached from an exercise's
 * `…` menu. Four pages in a bottom tray: the total you want, what the bare
 * implement already weighs, how many ends you load, and what to hang on each.
 *
 * It is a port of the owner's `Load Weights` Apple Shortcut, and the port keeps
 * the shortcut's arithmetic exactly (`src/lib/plates.ts` — greedy, largest
 * first, never exceeding the ask). What it adds is the thing a shortcut cannot
 * have: **the weight is already the set's weight.** The tray opens on the
 * active set's load, and changing it here writes back through the same queued
 * `plan_weight` op the weight cell uses, so the tool and the log never disagree
 * about what you are about to lift.
 *
 * THE PAGES ADVANCE, THEY DO NOT STACK. Each step slides the next page in from
 * the right; back slides it out again. A horizontal swipe does the same thing
 * with a finger (`swipeTarget`), which is what makes this usable one-handed at
 * a loaded bar. Vertical scrolling still belongs to the sheet — the track
 * declares `touch-action: pan-y`, so the browser keeps the vertical axis and
 * this component only ever sees the horizontal one.
 *
 * The setup — bar weight and loading points — is REMEMBERED PER EXERCISE, on
 * the device (`localStorage`, same class of state as the theme switch). It is
 * a fact about the rack you are standing at rather than about your training, it
 * must survive being offline, and it is worth no migration and no row: the
 * equipment defaults in `defaultPlateSetup` are only ever the opening bid, and
 * one visit replaces them.
 */

const SETUP_KEY = "workout.plate-setup.v1";

interface PlateSetup {
  startWeight: number;
  sides: PlateSides;
}

/** every remembered setup, keyed by exercise id */
type SetupStore = Record<string, PlateSetup>;

function readSetupStore(): SetupStore {
  try {
    const raw = window.localStorage.getItem(SETUP_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    // hand-validated rather than zod'd, for the reason the write queue gives:
    // this module rides in the day view's chunk, which stays zod-free. Nothing
    // here reaches the server, so a bad value costs a wrong default and no more
    const out: SetupStore = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const { startWeight, sides } = value as Record<string, unknown>;
      if (typeof startWeight !== "number" || !Number.isFinite(startWeight)) continue;
      if (startWeight < 0) continue;
      if (sides !== 1 && sides !== 2) continue;
      out[id] = { startWeight, sides };
    }
    return out;
  } catch {
    return {};
  }
}

function writeSetup(exerciseId: string, setup: PlateSetup) {
  try {
    const store = readSetupStore();
    store[exerciseId] = setup;
    window.localStorage.setItem(SETUP_KEY, JSON.stringify(store));
  } catch {
    // a full or blocked store costs the memory, never the tool
  }
}

/** The bar/carriage weights offered as one tap. `0` is a real answer — a
 *  loading pin, a plate-loaded sled with nothing of its own to carry. */
const START_PRESETS = [0, 15, 25, 35, 45];

/**
 * How a plate draws in the sleeve. Both dimensions come off the same curve —
 * the 0.6 exponent rather than a straight ratio, because a linear scale puts
 * the 2.5 and the 5 within a pixel of each other while the 45 towers over
 * everything. The curve keeps all five distinguishable at a glance, which is
 * the diagram's only job.
 */
function plateScale(weight: number): number {
  return Math.pow(Math.min(weight, 45) / 45, 0.6);
}

function plateHeight(weight: number): number {
  return Math.round(18 + 34 * plateScale(weight));
}

function plateWidth(weight: number): number {
  return Math.round(6 + 12 * plateScale(weight));
}

function parseWeight(text: string): number | null {
  const n = Number(text.trim());
  return Number.isFinite(n) && n >= 0 && n <= 2000 ? n : null;
}

const STEP_LABELS = [
  "TOTAL WEIGHT",
  "STARTING WEIGHT",
  "LOADING POINTS",
  "WHAT TO LOAD",
];

export function PlateSheet({
  we,
  activeSetNumber,
  readOnly,
  onClose,
}: {
  we: LoggedExercise | null;
  /** the set the tray opens on — the first not yet logged or skipped. Null when
   *  every set is in, which is also when a weight edit has nothing to write to */
  activeSetNumber: number | null;
  readOnly: boolean;
  onClose: () => void;
}) {
  const queue = useSetLogQueue();
  const [step, setStep] = useState(0);
  const [weightText, setWeightText] = useState("");
  const [startWeight, setStartWeight] = useState(0);
  const [startCustom, setStartCustom] = useState(false);
  const [startCustomText, setStartCustomText] = useState("");
  const [sides, setSides] = useState<PlateSides>(2);
  /** the weight the tray opened on — what a write-back is compared against */
  const seedWeight = useRef<number | null>(null);

  const exerciseId = we?.exercise_id ?? null;
  const open = we != null;

  // seed on open: the active set's own planned load (the same resolution the
  // weight cell makes), and the remembered rack setup for this lift
  useEffect(() => {
    if (!we) return;
    const planned =
      activeSetNumber != null
        ? (we.set_weights?.[String(activeSetNumber)] ?? null)
        : null;
    const seed =
      planned ?? we.prescribed_weight ?? we.sets.at(-1)?.weight ?? 0;
    seedWeight.current = seed;
    setWeightText(formatWeight(seed));
    const remembered = readSetupStore()[we.exercise_id];
    const setup = remembered ?? defaultPlateSetup(we.equipment_type);
    setStartWeight(setup.startWeight);
    setSides(setup.sides);
    setStartCustom(!START_PRESETS.includes(setup.startWeight));
    setStartCustomText(
      START_PRESETS.includes(setup.startWeight) ? "" : formatWeight(setup.startWeight),
    );
    setStep(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [we?.id]);

  // The rack is remembered at the point it is CHOSEN, not from an effect over
  // the state. An effect would fire once on mount with the initial state —
  // before the seed effect's own `setState` has re-rendered — and overwrite the
  // remembered setup with the component's defaults on the way in.
  const chooseStart = useCallback(
    (value: number) => {
      setStartWeight(value);
      if (exerciseId) writeSetup(exerciseId, { startWeight: value, sides });
    },
    [exerciseId, sides],
  );
  const chooseSides = useCallback(
    (value: PlateSides) => {
      setSides(value);
      if (exerciseId) writeSetup(exerciseId, { startWeight, sides: value });
    },
    [exerciseId, startWeight],
  );

  const weight = parseWeight(weightText);
  const load = planPlateLoad({
    targetWeight: weight ?? 0,
    startWeight,
    sides,
    plates: DEFAULT_PLATE_SIZES_LB,
  });

  /** whether a weight typed here can reach the log at all */
  const canWriteBack = !readOnly && activeSetNumber != null;

  /**
   * Push a changed weight onto the write queue, exactly as the weight cell's
   * blur does — same op, same idempotence, same server-side auto-match fan-out.
   * Called on close and on taking the closest match, so every exit that carries
   * a new number carries it to the set too.
   */
  const flushWeight = useCallback(
    (value: number | null) => {
      if (!we || !canWriteBack || activeSetNumber == null) return;
      if (value == null || value <= 0) return;
      if (seedWeight.current != null && value === seedWeight.current) return;
      queue.enqueue({
        kind: "plan_weight",
        workout_id: we.workout_id,
        workout_exercise_id: we.id,
        set_number: activeSetNumber,
        weight: value,
      });
      seedWeight.current = value;
    },
    [we, canWriteBack, activeSetNumber, queue],
  );

  const close = useCallback(() => {
    flushWeight(parseWeight(weightText));
    onClose();
  }, [flushWeight, weightText, onClose]);

  // ---- the sliding track -------------------------------------------------
  const trackRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const [drag, setDrag] = useState(0);
  const gesture = useRef<{
    x: number;
    y: number;
    t: number;
    axis: "none" | "x" | "y";
  } | null>(null);

  // The tray is as tall as the page you are on, and grows into the next one.
  // Observed rather than declared: a page's own content changes under it (the
  // custom bar field opening, the result recomputing as the weight is typed),
  // and a height that only tracked `step` would clip exactly those cases.
  useLayoutEffect(() => {
    const el = pageRefs.current[step];
    if (!el) return;
    const measure = () =>
      setHeight((prev) => (prev === el.offsetHeight ? prev : el.offsetHeight));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [step]);

  const goTo = useCallback((index: number) => setStep(clampStep(index)), []);

  const onTouchStart = (e: React.TouchEvent) => {
    // a drag that starts in a text field belongs to the caret, not to us
    if ((e.target as HTMLElement).closest("input")) return;
    const t = e.touches[0];
    gesture.current = { x: t.clientX, y: t.clientY, t: e.timeStamp, axis: "none" };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const g = gesture.current;
    if (!g) return;
    const t = e.touches[0];
    const dx = t.clientX - g.x;
    const dy = t.clientY - g.y;
    if (g.axis === "none") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (g.axis !== "x") return;
    // resist at the ends so the track never looks like it could keep going
    const atEnd = (dx > 0 && step === 0) || (dx < 0 && step === PLATE_STEPS.length - 1);
    setDrag(atEnd ? dx / 4 : dx);
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.axis !== "x") {
      setDrag(0);
      return;
    }
    const width = trackRef.current?.offsetWidth ?? 0;
    const elapsed = Math.max(1, e.timeStamp - g.t);
    goTo(swipeTarget({ index: step, dx: drag, width, velocity: drag / elapsed }));
    setDrag(0);
  };

  if (!we) return null;

  const dragging = drag !== 0;
  // percent for the page, px for the finger — so the track is positioned
  // correctly on its very first paint, before any width has been measured
  const offset = `calc(${-step * 100}% + ${drag}px)`;

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title="Load plates"
      subtitle={`${we.exercise_name.toUpperCase()}${
        activeSetNumber != null ? ` — SET ${activeSetNumber}` : " — SESSION DONE"
      }`}
    >
      {/* step rail: the current segment is the current position, which is the
          one thing hard rule 7 lets the accent mark */}
      <div className="flex gap-1.5" aria-hidden>
        {PLATE_STEPS.map((s, i) => (
          <div
            key={s}
            className={`h-[3px] flex-1 ${
              i === step ? "bg-accent" : i < step ? "bg-ink/55" : "bg-ink/15"
            }`}
          />
        ))}
      </div>
      <div className="mt-2.5 flex items-baseline justify-between">
        <span
          aria-live="polite"
          className="label-caps text-[10px] font-bold tracking-[0.16em] text-ink"
        >
          {STEP_LABELS[step]}
        </span>
        <span className="numeral text-[10px] font-semibold tracking-[0.14em] text-ink/40">
          {String(step + 1).padStart(2, "0")} /{" "}
          {String(PLATE_STEPS.length).padStart(2, "0")}
        </span>
      </div>

      <div
        className="mt-4 overflow-hidden transition-[height] duration-[280ms] ease-out"
        style={{ height, touchAction: "pan-y" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div
          ref={trackRef}
          className={`flex items-start ${dragging ? "" : "transition-transform duration-[280ms] ease-out"}`}
          style={{ transform: `translateX(${offset})` }}
        >
          {/* ---- 01 — the total ------------------------------------------ */}
          <Page index={0} step={step} refs={pageRefs}>
            <div className="flex items-baseline border-[1.5px] border-ink bg-paper px-4 py-3 focus-within:bg-paper">
              <input
                inputMode="decimal"
                aria-label="total weight in pounds"
                value={weightText}
                onChange={(e) => setWeightText(e.target.value)}
                className="numeral min-w-0 flex-1 bg-transparent text-right text-[34px] font-extrabold leading-none text-ink focus:outline-none"
              />
              <span className="label-caps ml-2.5 text-[12px] font-semibold text-ink/45">
                lb
              </span>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink/60">
              {we.prescribed_weight != null ? (
                <>
                  Today asks for{" "}
                  <span className="numeral font-semibold text-ink">
                    {formatWeight(we.prescribed_weight)} lb
                  </span>
                  .{" "}
                </>
              ) : null}
              {canWriteBack
                ? `Changing it here changes set ${activeSetNumber} too.`
                : "This session is closed, so nothing here changes the log."}
            </p>
          </Page>

          {/* ---- 02 — the bare implement --------------------------------- */}
          <Page index={1} step={step} refs={pageRefs}>
            <p className="text-[12.5px] leading-relaxed text-ink/60">
              The bar, carriage, or sled before a single plate goes on. It counts
              toward the total, and it is never a plate.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {START_PRESETS.map((preset) => (
                <Chip
                  key={preset}
                  selected={!startCustom && startWeight === preset}
                  onClick={() => {
                    setStartCustom(false);
                    chooseStart(preset);
                    goTo(2);
                  }}
                >
                  <span className="numeral">{preset}</span>
                  <span className="ml-1">lb</span>
                </Chip>
              ))}
              <Chip
                dashed={!startCustom}
                selected={startCustom}
                onClick={() => setStartCustom(true)}
              >
                Custom
              </Chip>
            </div>
            {startCustom && (
              <div className="mt-3 flex items-baseline border-[1.5px] border-ink bg-paper px-4 py-2.5">
                <input
                  inputMode="decimal"
                  aria-label="starting weight in pounds"
                  value={startCustomText}
                  placeholder="0"
                  onChange={(e) => {
                    setStartCustomText(e.target.value);
                    const parsed = parseWeight(e.target.value);
                    if (parsed != null) chooseStart(parsed);
                  }}
                  className="numeral min-w-0 flex-1 bg-transparent text-right text-[22px] font-bold leading-none text-ink focus:outline-none"
                />
                <span className="label-caps ml-2.5 text-[12px] font-semibold text-ink/45">
                  lb
                </span>
              </div>
            )}
          </Page>

          {/* ---- 03 — how many ends -------------------------------------- */}
          <Page index={2} step={step} refs={pageRefs}>
            <div className="flex gap-2">
              {([2, 1] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={sides === n}
                  onClick={() => {
                    chooseSides(n);
                    goTo(3);
                  }}
                  className={`flex-1 border-[1.5px] p-3 text-left transition-colors duration-150 ${
                    sides === n
                      ? "border-ink bg-ink text-bg-base"
                      : "border-ink/30 text-ink"
                  }`}
                >
                  <span className="label-caps block text-[11px] font-bold">
                    {n === 2 ? "Two ends" : "One end"}
                  </span>
                  <span
                    className={`mt-1.5 block text-[12px] leading-snug ${
                      sides === n ? "text-bg-base/70" : "text-ink-muted"
                    }`}
                  >
                    {n === 2
                      ? "A barbell or smith — plates on both sleeves."
                      : "A single loading horn or pin."}
                  </span>
                </button>
              ))}
            </div>
          </Page>

          {/* ---- 04 — what to hang --------------------------------------- */}
          <Page index={3} step={step} refs={pageRefs}>
            {weight == null ? (
              <p className="text-[12.5px] leading-relaxed text-ink/60">
                Enter a total weight to load against.
              </p>
            ) : load.belowStart ? (
              <p className="text-[12.5px] leading-relaxed text-ink/60">
                <span className="numeral font-semibold text-ink">
                  {formatWeight(weight)} lb
                </span>{" "}
                is under the{" "}
                <span className="numeral font-semibold text-ink">
                  {formatWeight(startWeight)} lb
                </span>{" "}
                the implement already weighs, so there is nothing to load.
              </p>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="numeral text-[38px] font-extrabold leading-none tracking-[-0.02em]">
                    {formatWeight(load.closestMatch)}
                  </span>
                  <span className="label-caps text-[11px] font-semibold text-ink-muted">
                    lb loaded
                  </span>
                </div>
                {load.shortBy > 0 && (
                  <p className="mt-2 text-[12.5px] leading-relaxed text-ink/60">
                    You asked for{" "}
                    <span className="numeral font-semibold text-ink">
                      {formatWeight(weight)} lb
                    </span>
                    . These plates get within{" "}
                    <span className="numeral font-semibold text-ink">
                      {formatWeight(load.shortBy)} lb
                    </span>{" "}
                    without going over.
                  </p>
                )}

                {load.perSide.length === 0 ? (
                  <p className="mt-3 text-[12.5px] leading-relaxed text-ink/60">
                    No plate fits — the bare implement is already the closest you
                    can get.
                  </p>
                ) : (
                  <>
                    <div className="mt-4 border-t border-ink/20">
                      {load.perSide.map((p) => (
                        <div
                          key={p.weight}
                          className="flex items-center justify-between border-b border-ink/15 py-2"
                        >
                          <span className="numeral text-[15px] font-semibold">
                            {formatWeight(p.weight)}{" "}
                            <span className="label-caps text-[10px] font-semibold text-ink-muted">
                              lb
                            </span>
                          </span>
                          <span className="numeral text-[15px] font-bold">
                            ×{p.count}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* the sleeve, as you look down at it */}
                    {/* one sleeve, as you look down at it: the collar the
                        plates rest against, the plates, then the bar running
                        out to the end. The tail is what keeps this reading as a
                        loaded bar rather than as a slider track. */}
                    <div className="mt-4 overflow-x-auto">
                      <div className="relative flex h-[60px] w-max items-center pr-8">
                        <div className="absolute inset-x-0 top-1/2 h-[4px] -translate-y-1/2 bg-ink/25" />
                        <div className="relative h-[26px] w-[4px] bg-ink/60" />
                        <div className="relative ml-[3px] flex items-center gap-[2px]">
                          {load.perSide.flatMap((p) =>
                            Array.from({ length: p.count }, (_, i) => (
                              <div
                                key={`${p.weight}-${i}`}
                                title={`${formatWeight(p.weight)} lb`}
                                style={{
                                  height: plateHeight(p.weight),
                                  width: plateWidth(p.weight),
                                }}
                                className="border border-ink bg-ink/10"
                              />
                            )),
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">
                  <span className="numeral">{formatWeight(startWeight)}</span> lb
                  bare
                  {load.perSideWeight > 0 && (
                    <>
                      {" + "}
                      <span className="numeral">
                        {formatWeight(load.perSideWeight)}
                      </span>{" "}
                      lb on {sides === 2 ? "each of 2 ends" : "1 end"}
                    </>
                  )}
                  {" = "}
                  <span className="numeral font-semibold text-ink">
                    {formatWeight(load.closestMatch)}
                  </span>{" "}
                  lb
                </p>

                {canWriteBack && load.shortBy > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setWeightText(formatWeight(load.closestMatch));
                      flushWeight(load.closestMatch);
                    }}
                    className="label-caps mt-4 w-full border-[1.5px] border-ink py-3 text-[11px] font-bold text-ink active:bg-ink/5"
                  >
                    Record {formatWeight(load.closestMatch)} lb on set{" "}
                    {activeSetNumber}
                  </button>
                )}
              </>
            )}
          </Page>
        </div>
      </div>

      {/* ---- paging controls --------------------------------------------- */}
      <div className="mt-5 flex gap-2">
        {step > 0 && (
          <button
            type="button"
            onClick={() => goTo(step - 1)}
            className="label-caps min-h-11 border-[1.5px] border-ink px-5 text-[11px] font-bold text-ink active:bg-ink/5"
          >
            Back
          </button>
        )}
        {step < PLATE_STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => goTo(step + 1)}
            disabled={step === 0 && weight == null}
            className="label-caps min-h-11 flex-1 bg-ink text-[11px] font-bold text-bg-base active:bg-ink/85 disabled:opacity-40"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={close}
            className="label-caps min-h-11 flex-1 bg-ink text-[11px] font-bold text-bg-base active:bg-ink/85"
          >
            Done
          </button>
        )}
      </div>
    </BottomSheet>
  );
}

/**
 * One page of the track. Off-screen pages stay mounted — the track's whole
 * geometry depends on them being there — so they are `inert`, which is what
 * keeps Tab, the caret, and a screen reader inside the page actually on screen.
 */
function Page({
  index,
  step,
  refs,
  children,
}: {
  index: number;
  step: number;
  refs: React.RefObject<(HTMLDivElement | null)[]>;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={(el) => {
        refs.current[index] = el;
      }}
      inert={index !== step}
      aria-hidden={index !== step}
      className="w-full shrink-0"
    >
      {children}
    </div>
  );
}
