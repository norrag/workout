// N25: the single source for in-app jargon explanations. Every InfoDot pulls
// its copy from here so a term is explained with the same words on every
// surface. Definitions follow docs/10-metrics-spec.md — keep them honest:
// estimates are estimates, deloads don't build, no hype.

export type GlossaryKey =
  | "rir"
  | "rir_ramp"
  | "deload"
  | "e1rm"
  | "volume_landmarks"
  | "fractional_sets"
  | "pump"
  | "workload"
  | "macrocycle"
  | "mesocycle"
  | "microcycle";

export interface GlossaryEntry {
  /** tracked all-caps card heading */
  label: string;
  body: string;
}

export const GLOSSARY: Record<GlossaryKey, GlossaryEntry> = {
  rir: {
    label: "REPS IN RESERVE (RIR)",
    body: "How many reps a set stops short of failure — 2 RIR means two more were possible. Each week has a target, and it steps down as the block intensifies, so the same weight is meant to feel harder to a plan.",
  },
  rir_ramp: {
    label: "RIR RAMP",
    body: "The block's week-by-week effort plan, written start → end RIR: begin a few reps shy of failure, step closer each week, then back off for the deload. Every set that week shares the week's target.",
  },
  deload: {
    label: "DELOAD",
    body: "A deliberately light week, usually the last of a mesocycle, that sheds accumulated fatigue before the next block. Expect lighter prescriptions well short of failure — it protects progress rather than builds it.",
  },
  e1rm: {
    label: "ESTIMATED 1RM (E1RM)",
    body: "The one-rep max a set implies, estimated from its weight and reps. It's a trend indicator, not a tested max — least reliable for high-rep sets or sets stopped far from failure.",
  },
  volume_landmarks: {
    label: "MEV / MRV",
    body: "The weekly working-set band per muscle. MEV is the floor — the least volume that still drives progress; MRV is the ceiling — the most you can recover from. Weekly sets steer between them off your workload, pump, and joint-pain feedback.",
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
};
