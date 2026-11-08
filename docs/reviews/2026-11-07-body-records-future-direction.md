# Body records beside training progress - future direction only

Owner direction: show the underlying dated measurements and deltas so the user
can judge the pattern. Do not generate a narrative, score, verdict or advice.
This is T-N96d, not an implemented part of the current tape pass.

A quiet **Body records** section on the mesocycle overview is a useful entry.
It sits beside the existing training-progress context and opens a wider dated
comparison. Monthly tape and quarterly DEXA will often not bracket a short
mesocycle. Show the actual dates and gaps rather than forcing those sources
into a block-sized result. An explicitly selected wider period can help.

The useful comparison is a ledger with independent rows:

| Row | Show | Preserve |
| --- | --- | --- |
| Waist and each limb/site | Start/end values, change and unit | Exact session dates, left/right key, placement cue, count and missing readings |
| Body weight | Dated raw readings and source | Its own dates and coverage; no new smoothing or inferred endpoint |
| Related strength | The same exercise's logged load/reps/RIR and existing e1RM estimate | Exercise/equipment identity, sample count, assumed vs reported RIR and dates; never call the estimate a tested maximum |
| DEXA | Dated mass/composition estimates and existing comparison metadata | Scan interval, acquisition metadata and uncertainty; do not imply that a model-string match proves machine comparability |

Keep the raw series one tap away. Use a shared calendar period, with each row's
actual baseline and latest date displayed. An observation outside the selected
period must be labelled as outside it. A missing reading remains missing. Do
not silently choose a different baseline for each row or carry a value forward.

Waist and limbs should be visible together. Strength can appear beside the
relevant training group, but that relation is context rather than a conversion
from inches to muscle or a claim of causation. Avoid adding unlike units to
one score, normalizing them into an unlabelled index, or presenting DEXA as the
answer to an ambiguous pattern. Let the user compare the evidence.

Two separate accuracy tasks must inform later DEXA labels: T-N96b (scanner
model vs physical machine/cross-calibration) and T-N96c (generic change bands
vs an individual's least-significant change). They do not justify changing the
existing DEXA or prescription mechanisms in the current measurement pass.

Before implementation, review the actual mesocycle overview layout, prepare
mockups for sparse/empty/mismatched dates, and agree on explicit baseline
selection. Keep the no-composite and no-prescription-input boundaries.
