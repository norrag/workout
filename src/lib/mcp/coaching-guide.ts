import "server-only";

/**
 * Depth behind the server-level coaching stance, distilled from
 * docs/10-metrics-spec.md (NOT invented). Exposed as the `workout://coaching-
 * guide` resource so the always-on instructions string (server.ts) can stay
 * short while a client that wants the evidence, landmark tables, and
 * autoregulation logic can fetch it on demand (12 §Stage 1).
 *
 * Every claim here mirrors a [10] section and its honesty tag
 * ([EVIDENCED] / [HEURISTIC] / [DERIVED]); the §9 guardrails are reproduced
 * verbatim in intent. The engine — not the model — owns every prescribed
 * number; this guide is for *interpretation*, never for inventing prescriptions.
 */
export const COACHING_GUIDE = `
# WORKOUT coaching guide

This is the science-based training paradigm the app's progression engine
encodes. Reason *with* it: when a number looks alarming, suspect comparability
before concluding the user is regressing. The engine owns every prescribed
load, rep, and set count; you surface and interpret them. Tunable values below
live in \`engine_params\` and may differ from these defaults — read the params,
do not hard-code these numbers into advice.

Tags: **[EVIDENCED]** = RCT/meta-analytic support; **[HEURISTIC]** = sound
practitioner consensus with weak/no direct trial support; **[DERIVED]** =
mechanical definition.

## The progression model

**Estimated 1RM (e1RM) [DERIVED + EVIDENCED].** From a working set of
\`weight × reps\` at reported \`rir\`: \`effectiveReps = reps + rir\`, then the
average of Epley and Brzycki on effective reps (averaging cancels Epley's
high-rep drift up and Brzycki's down). It is an **estimate/trend**, smoothed
across sessions — never a tested 1RM, never headline-precise. Confidence
degrades with reps-from-failure: high at ≤8 effective reps / 0–2 RIR, moderate
at 9–12 / 0–3, **low above ~12 reps or ≥4 RIR** (present low-confidence points
with a band, and down-weight them in "best e1RM" and trend). A 20×11 set is
weaker evidence than a 35×8 set. *(LeSuer 1997; Mayhew 1992; Zourdos 2016;
Hackett 2017; Steele 2017.)*

**Fractional volume counting [EVIDENCED].** A hard working set credits **1.0
set** to each primary muscle and **0.5 set** to each secondary muscle
(\`exercise_muscle_groups.role\`). Warm-ups don't count; a set must be near
enough to failure to be a stimulus (default \`rir ≤ 4\`). This is why a leg day
can show "fewer sets" than an upper day and still be on-target — the sets are
attributed to different muscles, not missing. *(Pelland 2024; Schoenfeld 2019.)*

**Volume landmarks — MEV / MAV / MRV.** The autoregulation ramp's floor,
productive zone, and ceiling. The dose-response (more sets → more growth with
diminishing returns; productive band ~10–20 hard sets/muscle/week) is
**[EVIDENCED]** *(Schoenfeld 2017; Baz-Valle 2022; Pelland 2024)*. The
**per-muscle exact numbers are [HEURISTIC]** *(RP / Israetel)*, scaled by
experience — starting points, not gospel. Default direct-equivalent
sets/week for an intermediate (MEV / MAV-high / MRV):

| Muscle | MEV | MAV | MRV |
|---|---|---|---|
| Back | 10 | 22 | 25 |
| Chest | 8 | 20 | 22 |
| Quads | 8 | 18 | 20 |
| Hamstrings | 6 | 16 | 20 |
| Glutes | 4 | 16 | 20 |
| Delts | 8 | 20 | 26 |
| Biceps | 6 | 20 | 26 |
| Triceps | 6 | 18 | 24 |
| Calves | 6 | 16 | 20 |
| Abs | 4 | 16 | 25 |

A meso starts near MEV and ramps toward MRV, then deloads.

**RIR ramp [EVIDENCED rationale].** Start ~3 RIR, fall to 0–1 at the peak week
(default 5-week block \`3 → 2 → 2/1 → 1 → 0–1\`). \`0 RIR\` is a **peak-week
ceiling, not the routine target** — hypertrophy gains flatten past ~1–2 RIR
while fatigue keeps climbing. Close-to-failure ≈ to-failure for growth at far
less fatigue. *(Refalo 2023.)* Treat early-meso high-RIR targets as softer;
RIR self-report is biased (lifters under-report proximity to failure) and
noisy at ≥4 RIR, so weight near-failure data highest. *(Zourdos 2016/2019;
Hackett 2017; Steele 2017.)*

**Workload-driven autoregulation [HEURISTIC — RP].** Each muscle's next-week set
count comes from the per-exercise feedback, in order:
1. **Joint-pain gate first** — \`joint_pain ≥ 2\` never adds sets; \`= 3\` reduces
   or suggests a substitution, regardless of the rest. (Safety gate.)
2. **Workload is the primary driver** (0 too easy ↔ 5 just right ↔ 10 too much):
   0–2 → +2; 3–6 → +1 (ramp toward MRV); 7–8 → hold; 9–10 → reduce / deload.
3. **Pump nudges ±1 only**, never overriding the above.
4. **MRV stop** — two weeks of workload ≥ 9, or ≥ 7 with performance missing
   target, or persistent joint pain → deload and restart the ramp.
All clamped to the muscle's MEV floor and MRV ceiling. A poor session-level
fatigue/effort/performance rating **down-weights** that session's increases —
fatigue is a recovery gate, used to hold back, not to push. *(Schoenfeld &
Contreras 2013.)*

**Double progression + increments [principle EVIDENCED; sizes HEURISTIC].**
Advance reps within the prescribed range; when the top of the range is hit for
all sets at target RIR, add one increment and reset to the bottom. Increments
(in pounds) scale by lift class (large lower compound > upper compound >
isolation). A marginal miss regresses ~5%, a clear/failed session ~10%.
*(Plotkin 2022.)*

**Deload [HEURISTIC — fatigue management, NOT a proven booster].** Default
~50% of week-1 sets, ~90% load (light) down to ~50% (heavy), RIR ≥ 4, one
week, ~every 4–6 weeks or at meso end / on an MRV-stop flag. Frame honestly:
the lone RCT found **no benefit and a possible strength decrement** from a
planned mid-cycle deload — a fatigue valve, not a growth multiplier.
*(Coleman 2024.)*

**Macrocycle targets [HEURISTIC / model-based].** The engine personalizes a
goal range and recommended timeframe from the full profile (sex, age, height,
bodyweight, experience, training age). Hypertrophy rate is driven primarily by
**proximity to genetic potential (FFMI)**, not calendar training age; cut rate
is %BW/week scaled by leanness and compounds on shrinking bodyweight. Always
present the **conservative end**, labeled as an estimate band with no progress
bar — individual variation dwarfs these means. *(Aragon; Lyle McDonald; ACSM
2009; Helms/Aragon/Fitschen 2014; Garthe 2011; Roberts 2020; Refalo 2025.)*

## Coaching stance — honesty guardrails (do not overclaim)

These mirror [10] §9 and bind every interpretation you offer:

- **e1RM** is an estimate/trend; never headline-precise, especially above ~12
  effective reps or ≥4 RIR.
- **Realistic targets** are model-based projections assuming good
  training/nutrition/recovery (which the app does not track); show the
  conservative end, label as estimates, no progress bar.
- **Pump & soreness** are weak/secondary — never present a big pump or soreness
  as proof of a good workout.
- **Deloads** are fatigue management, not a proven growth/strength booster.
- **Push:pull balance** is advisory; avoid posture / "muscle imbalance" /
  injury-prevention claims — the evidence doesn't support the 1:1 ratio for
  those outcomes.
- **MEV/MAV/MRV numbers and rate-of-gain tables** are heuristics with large
  individual variance — tunable starting points, not guarantees.

## Comparability — read like with like

Most "regression" alarms are comparability artifacts, not real declines:

- **Cross-phase.** A lifetime-best top set logged in a cut block is not the
  baseline for a current bulk block. Segment or caveat comparisons that cross a
  cut↔bulk boundary; macro \`goal_type\` is the segmenting dimension.
- **Slot pooling.** The same exercise can occupy two day-slots in a meso at two
  intended loads; pooling them reads as a sawtooth. Compare a slot to itself.
- **Single-latest reads.** A "latest" value that happened to land on the lighter
  slot is not a trend. Prefer a rolling window of recent comparable sessions.
- **Confidence.** Down-weight low-confidence e1RM points rather than treating a
  light, high-rep set as equal evidence to a heavy near-failure set.

The tools already attach inline \`data_quality\` notes; reinforce them, never
contradict them.
`.trim();
