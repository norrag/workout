// N25: the single source for in-app jargon explanations. Every InfoDot pulls
// its copy from here so a term is explained with the same words on every
// surface. Definitions follow docs/10-metrics-spec.md — keep them honest:
// estimates are estimates, deloads don't build, no hype.

export type GlossaryKey =
  | "rir"
  | "rir_ramp"
  | "deload"
  | "e1rm"
  | "e1rm_confidence"
  | "est_strength"
  | "volume_landmarks"
  | "fractional_sets"
  | "pump"
  | "workload"
  | "macrocycle"
  | "mesocycle"
  | "microcycle"
  | "day_slot"
  | "load_step";

export interface GlossaryEntry {
  /** tracked all-caps card heading */
  label: string;
  body: string;
}

export const GLOSSARY: Record<GlossaryKey, GlossaryEntry> = {
  // doc 21 §8 (A1): the premise changed, not just the wording. The target is a
  // SUGGESTION and the reported value is the athlete's honest estimate of what
  // actually happened — including when the two differ. Every strength number in
  // the app is priced off this, so the copy has to ask for honesty plainly.
  rir: {
    label: "REPS IN RESERVE (RIR)",
    body: "How many reps a set stops short of failure — 2 RIR means two more were possible. Each week carries a target that steps down as the block intensifies. But the target is what to aim for, not what to report: log the RIR you actually had, even when it misses the ask.",
  },
  rir_ramp: {
    label: "RIR RAMP",
    body: "The block's week-by-week effort plan, written start → end RIR: begin a few reps shy of failure, step closer each week, then back off for the deload. Every set that week shares the week's target unless one is set for a specific exercise.",
  },
  deload: {
    label: "DELOAD",
    body: "A deliberately light week, usually the last of a mesocycle, that sheds accumulated fatigue before the next block. Expect lighter prescriptions well short of failure — it protects progress rather than builds it.",
  },
  // 2026-08-07 (doc 22, owner review round 2): the card must not lean on "RM".
  // A definition that opens with an unexplained abbreviation explains nothing,
  // so the label spells the term out and the body ties the words to the letters
  // before using them.
  e1rm: {
    label: "ESTIMATED ONE-REP MAX (E1RM)",
    // 2026-08-07 (doc 22 Phase 1): the last clause used to read "closer to
    // failure reads as stronger", which is the mechanic backwards. effective
    // reps = reps + RIR, and e1RM rises with effective reps — so at the same
    // weight and reps the set with reps to spare implies the greater strength.
    // The doc 21 §2 restamp is the proof: re-reading unreported sets at their
    // prescribed RIR instead of as taken to failure moved every historical
    // stamp UP (+4.85% average, 2026-08-02).
    body: "Your one-rep max (1RM) is the heaviest you could lift for a single all-out rep. The e is for estimated: the app works it out from a set you actually did — its weight, its reps, and how many reps you left in the tank (your RIR) — so you never have to test one. Those left-over reps are folded in, so an easy set and a hard one at the same weight and reps don't score the same: the set with reps still in reserve implies more strength than the same set taken to failure. It tracks your strength over time, and it's least reliable on very high-rep sets or ones stopped well short of failure.",
  },
  e1rm_confidence: {
    label: "ESTIMATE CONFIDENCE",
    body: "Not every estimated one-rep max is equally trustworthy. A heavy set taken close to failure gives a sharp estimate; a very high-rep set, or one stopped far from failure, is more of a guess. Each estimate is rated high, moderate, or low so you know how much to lean on it — low-confidence reads are best treated as a rough band, not a precise number. A set run far enough from failure isn't rated at all: it still counts as work and as volume, but it says nothing about your strength, so nothing is estimated from it.",
  },
  est_strength: {
    label: "EST. STRENGTH",
    body: "One read on how your strength is trending. For each exercise we compare the best estimated one-rep max of your most recent few sessions against the best of your earliest few in the block — a rolling window, so a single light day (like the opening session of a fresh mesocycle, which is meant to be easy) can't drag the number down. Each exercise's change rolls up into the muscles it trains, and the headline averages those muscle numbers, weighted by how much work each muscle actually got. It's an estimate of the trend, not a tested max.",
  },
  volume_landmarks: {
    label: "MEV / MRV",
    body: "The weekly set band per muscle. MEV — minimum effective volume — is the floor: the least that still progresses you. MRV — maximum recoverable volume — is the ceiling: the most you can recover from. Sets steer between them off your workload, pump, and joint-pain feedback.",
  },
  fractional_sets: {
    label: "HOW SETS ARE COUNTED",
    body: "Sets count fractionally per muscle: a full set toward its primary muscle and a half set toward each secondary. Plans and stats share this one counting rule, so their numbers always agree.",
  },
  pump: {
    label: "PUMP",
    body: "How full the muscle felt by the last set — a rough proxy for whether the volume reached it.",
  },
  workload: {
    label: "WORKLOAD",
    body: "How taxing the session's work for that muscle felt, recovery included. The middle of the scale means the dose was right — this feedback steers next week's set count.",
  },
  macrocycle: {
    label: "MACROCYCLE",
    body: "A multi-month goal arc — hypertrophy, strength, cut, or maintain — built from mesocycles back to back. The goal shapes how prescriptions progress across its blocks.",
  },
  mesocycle: {
    label: "MESOCYCLE",
    body: "A 3–8 week training block that ramps effort week by week (the RIR ramp) and usually ends in a deload. Planning and stats are organized around it.",
  },
  microcycle: {
    label: "MICROCYCLE",
    body: "One week within a mesocycle. Each carries its own target RIR from the block's ramp.",
  },
  // 2026-08-08 (doc 22 Phase 3a): added because chapter 3 depends on it and
  // §8.1 forbids the manual defining a term in words the app does not use.
  // The model is real — the engine's advance lookup is keyed on
  // (mesocycle, day number, exercise) and `analyzeByDaySlot` splits a lift's
  // history the same way — but the app had no name a reader could ask about.
  day_slot: {
    label: "DAY SLOT",
    body: "A position in your training week — day 2 of this block, every week it runs. Progress is read slot against slot, so the same lift trained twice a week is compared with its own day rather than pooled with the other one, where alternating loads would look like a sawtooth.",
  },
  // 2026-08-10 (doc 22 Phase 3b): the sheet and the custom-exercise form both
  // say "load step" and neither says what it is. 22c §C2 recommended it for the
  // glossary and chapter 15 is the pass that needed it, so it lands here rather
  // than being defined in the manual alone (§8.1).
  load_step: {
    label: "LOAD STEP",
    body: "The size of one weight jump on an exercise — what gets added when you meet what was asked. It follows what the equipment can actually do, so a barbell steps up in bigger jumps than a cable stack. Steps count from the last weight you entered, so an odd weight keeps its own ladder.",
  },
};
